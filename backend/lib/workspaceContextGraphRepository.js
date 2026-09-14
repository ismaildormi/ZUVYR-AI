'use strict';

const GRAPH_TYPES = new Set([
  'user','project','decision','memory','content','asset',
  'task','deployment','connection'
]);

function graphError(code, cause = null) {
  const e = new Error(code);
  e.code = code;
  if (cause) e.cause = cause;
  return e;
}

function text(value, max = 300) {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (v.length > max) throw graphError('workspace_context_graph_input_invalid');
  return v;
}

function uuidOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const v = String(value).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) {
    throw graphError('workspace_context_graph_input_invalid');
  }
  return v;
}

function normalizeTypes(value) {
  if (value === undefined || value === null || value === '') return null;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const types = [...new Set(raw.map(x => String(x).trim()).filter(Boolean))];
  if (!types.length) return null;
  if (types.some(x => !GRAPH_TYPES.has(x))) {
    throw graphError('workspace_context_graph_input_invalid');
  }
  return types;
}

function normalizeQuery(input = {}, mode = 'query') {
  const defaults = mode === 'manager'
    ? ['project','task','deployment','connection','decision']
    : null;

  return {
    q: text(input.q, 300),
    projectId: uuidOrNull(input.projectId),
    types: normalizeTypes(input.types) || defaults,
    limit: Math.max(1, Math.min(Number(input.limit) || 40, 100)),
    depth: Math.max(0, Math.min(Number(input.depth) || 1, 3))
  };
}

function createWorkspaceContextGraphStore(db) {
  if (!db || typeof db.rpc !== 'function') {
    throw new TypeError('createWorkspaceContextGraphStore requires a Supabase-compatible database client.');
  }

  async function refresh(ownerId) {
    const { data, error } = await db.rpc('refresh_zuvyr_context_graph', {
      p_owner_id: ownerId
    });
    if (error) throw graphError('workspace_context_graph_refresh_failed', error);
    return data || {};
  }

  async function retrieve(ownerId, input = {}, mode = 'query') {
    const q = normalizeQuery(input, mode);
    await refresh(ownerId);

    const { data, error } = await db.rpc('retrieve_zuvyr_context_graph', {
      p_owner_id: ownerId,
      p_query: q.q,
      p_project_id: q.projectId,
      p_types: q.types,
      p_limit: q.limit,
      p_depth: q.depth
    });
    if (error) throw graphError('workspace_context_graph_retrieve_failed', error);

    return {
      ...(data || {}),
      mode,
      bounded: true,
      owner_scoped: true,
      unrelated_user_scan: false
    };
  }

  async function query(ownerId, input = {}) {
    return retrieve(ownerId, input, 'query');
  }

  async function getBrainContext(ownerId, input = {}) {
    return retrieve(ownerId, input, 'brain');
  }

  async function getManagerContext(ownerId, input = {}) {
    return retrieve(ownerId, input, 'manager');
  }

  return {
    refresh,
    query,
    getBrainContext,
    getManagerContext
  };
}

function getDefaultWorkspaceContextGraphStore() {
  const { supabaseAdmin } = require('./supabaseAdmin');
  return createWorkspaceContextGraphStore(supabaseAdmin);
}

module.exports = {
  GRAPH_TYPES,
  normalizeQuery,
  createWorkspaceContextGraphStore,
  getDefaultWorkspaceContextGraphStore
};
