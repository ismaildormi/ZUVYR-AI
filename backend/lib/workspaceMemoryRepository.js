'use strict';

const MEMORY_CATEGORIES = new Set([
  'preference','profile','goal','decision','constraint',
  'fact','relationship','workflow','project_context'
]);
const MEMORY_SCOPES = new Set(['account','project']);

function memoryError(code, cause = null) {
  const e = new Error(code);
  e.code = code;
  if (cause) e.cause = cause;
  return e;
}

function cleanText(value, max, required = false) {
  if (value === undefined || value === null) {
    if (required) throw memoryError('workspace_memory_input_invalid');
    return null;
  }
  const text = String(value).trim();
  if ((!text && required) || text.length > max) {
    throw memoryError('workspace_memory_input_invalid');
  }
  return text || null;
}

function uuidOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw memoryError('workspace_memory_input_invalid');
  }
  return text;
}

function normalizeFilters(input = {}) {
  const category = cleanText(input.category, 40);
  const scope = cleanText(input.scope, 20);
  if (category && !MEMORY_CATEGORIES.has(category)) throw memoryError('workspace_memory_input_invalid');
  if (scope && !MEMORY_SCOPES.has(scope)) throw memoryError('workspace_memory_input_invalid');
  return {
    q: cleanText(input.q, 300),
    category,
    scope,
    projectId: uuidOrNull(input.projectId),
    limit: Math.max(1, Math.min(Number(input.limit) || 50, 100)),
    offset: Math.max(0, Math.min(Number(input.offset) || 0, 10000))
  };
}

function normalizeCreate(input = {}) {
  const scope = cleanText(input.scope || 'account', 20, true);
  const category = cleanText(input.category, 40, true);
  const content = cleanText(input.content, 12000, true);
  if (!MEMORY_SCOPES.has(scope) || !MEMORY_CATEGORIES.has(category)) {
    throw memoryError('workspace_memory_input_invalid');
  }
  const projectId = uuidOrNull(input.projectId);
  if (scope === 'account' && projectId) throw memoryError('workspace_memory_scope_invalid');
  if (scope === 'project' && !projectId) throw memoryError('workspace_memory_scope_invalid');
  const metadata = input.metadata === undefined ? {} : input.metadata;
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
    throw memoryError('workspace_memory_input_invalid');
  }
  return {
    scope, category, content, projectId,
    sourceSystem: cleanText(input.sourceSystem, 80),
    sourceId: cleanText(input.sourceId, 500),
    metadata
  };
}

function normalizePatch(input = {}) {
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(input, 'content')) {
    patch.content = cleanText(input.content, 12000, true);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'category')) {
    patch.category = cleanText(input.category, 40, true);
    if (!MEMORY_CATEGORIES.has(patch.category)) throw memoryError('workspace_memory_input_invalid');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'scope')) {
    patch.scope = cleanText(input.scope, 20, true);
    if (!MEMORY_SCOPES.has(patch.scope)) throw memoryError('workspace_memory_input_invalid');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'projectId')) {
    patch.projectId = uuidOrNull(input.projectId);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'metadata')) {
    if (!input.metadata || Array.isArray(input.metadata) || typeof input.metadata !== 'object') {
      throw memoryError('workspace_memory_input_invalid');
    }
    patch.metadata = input.metadata;
  }
  if (!Object.keys(patch).length) throw memoryError('workspace_memory_update_empty');
  return patch;
}

function createWorkspaceMemoryStore(db) {
  if (!db || typeof db.from !== 'function' || typeof db.rpc !== 'function') {
    throw new TypeError('createWorkspaceMemoryStore requires a Supabase-compatible database client.');
  }

  async function getPreferences(ownerId) {
    const { data, error } = await db
      .from('zuvyr_user_preferences')
      .select('memory_enabled,training_consent,updated_at')
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (error) throw memoryError('workspace_memory_preferences_failed', error);
    return {
      memory_enabled: !!data?.memory_enabled,
      training_consent: !!data?.training_consent,
      updated_at: data?.updated_at || null,
      independent_permissions: true
    };
  }

  async function updatePreferences(ownerId, patch = {}) {
    const payload = { owner_id: ownerId, updated_at: new Date().toISOString() };
    if (patch.memoryEnabled !== undefined) {
      if (typeof patch.memoryEnabled !== 'boolean') throw memoryError('workspace_memory_preferences_invalid');
      payload.memory_enabled = patch.memoryEnabled;
    }
    if (patch.trainingConsent !== undefined) {
      if (typeof patch.trainingConsent !== 'boolean') throw memoryError('workspace_memory_preferences_invalid');
      payload.training_consent = patch.trainingConsent;
    }
    if (Object.keys(payload).length === 2) throw memoryError('workspace_memory_preferences_invalid');

    const { error } = await db.from('zuvyr_user_preferences').upsert(payload, { onConflict: 'owner_id' });
    if (error) throw memoryError('workspace_memory_preferences_failed', error);
    return getPreferences(ownerId);
  }

  async function getItem(ownerId, memoryId) {
    const { data, error } = await db
      .from('zuvyr_memories')
      .select('id,owner_id,project_id,scope,category,content,source_system,source_id,metadata,current_version,created_at,updated_at')
      .eq('id', memoryId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (error || !data) throw memoryError('workspace_memory_not_found', error || null);

    const versions = await db
      .from('zuvyr_memory_versions')
      .select('version_number,project_id,scope,category,content,metadata,created_at')
      .eq('memory_id', memoryId)
      .eq('owner_id', ownerId)
      .order('version_number', { ascending: false })
      .limit(25);
    if (versions.error) throw memoryError('workspace_memory_versions_failed', versions.error);

    return { ...data, versions: versions.data || [] };
  }

  async function listItems(ownerId, input) {
    const f = normalizeFilters(input);
    const { data, error } = await db.rpc('search_zuvyr_memories', {
      p_owner_id: ownerId,
      p_query: f.q,
      p_category: f.category,
      p_scope: f.scope,
      p_project_id: f.projectId,
      p_limit: f.limit,
      p_offset: f.offset
    });
    if (error) throw memoryError('workspace_memory_search_failed', error);
    return {
      items: data || [],
      filters: f,
      has_more: Array.isArray(data) && data.length === f.limit
    };
  }

  async function createItem(ownerId, input) {
    const value = normalizeCreate(input);
    const { data, error } = await db.rpc('create_zuvyr_memory', {
      p_owner_id: ownerId,
      p_scope: value.scope,
      p_category: value.category,
      p_content: value.content,
      p_project_id: value.projectId,
      p_source_system: value.sourceSystem,
      p_source_id: value.sourceId,
      p_metadata: value.metadata
    });
    if (error || !data) throw memoryError('workspace_memory_create_failed', error || null);
    return getItem(ownerId, data);
  }

  async function updateItem(ownerId, memoryId, input) {
    const patch = normalizePatch(input);
    const { error } = await db.rpc('update_zuvyr_memory', {
      p_owner_id: ownerId,
      p_memory_id: memoryId,
      p_patch: patch
    });
    if (error) throw memoryError('workspace_memory_update_failed', error);
    return getItem(ownerId, memoryId);
  }

  async function undoItem(ownerId, memoryId) {
    const { error } = await db.rpc('undo_zuvyr_memory', {
      p_owner_id: ownerId,
      p_memory_id: memoryId
    });
    if (error) {
      const code = String(error.message || '').includes('memory_undo_unavailable')
        ? 'workspace_memory_undo_unavailable'
        : 'workspace_memory_undo_failed';
      throw memoryError(code, error);
    }
    return getItem(ownerId, memoryId);
  }

  async function forgetItem(ownerId, memoryId) {
    const current = await getItem(ownerId, memoryId);
    const { error } = await db.rpc('forget_zuvyr_memory', {
      p_owner_id: ownerId,
      p_memory_id: memoryId
    });
    if (error) throw memoryError('workspace_memory_forget_failed', error);
    return {
      id: memoryId,
      forgotten: true,
      scope: current.scope,
      category: current.category,
      project_id: current.project_id || null
    };
  }

  async function retrieveContext(ownerId, input = {}) {
    const projectId = uuidOrNull(input.projectId);
    const q = cleanText(input.q, 300);
    const limit = Math.max(1, Math.min(Number(input.limit) || 20, 50));
    const { data, error } = await db.rpc('retrieve_zuvyr_memory_context', {
      p_owner_id: ownerId,
      p_project_id: projectId,
      p_query: q,
      p_limit: limit
    });
    if (error) throw memoryError('workspace_memory_retrieval_failed', error);
    return {
      items: data || [],
      memory_enabled: (await getPreferences(ownerId)).memory_enabled,
      project_id: projectId,
      query: q
    };
  }

  return {
    getPreferences,
    updatePreferences,
    getItem,
    listItems,
    createItem,
    updateItem,
    undoItem,
    forgetItem,
    retrieveContext
  };
}

function getDefaultWorkspaceMemoryStore() {
  const { supabaseAdmin } = require('./supabaseAdmin');
  return createWorkspaceMemoryStore(supabaseAdmin);
}

module.exports = {
  MEMORY_CATEGORIES,
  MEMORY_SCOPES,
  normalizeFilters,
  normalizeCreate,
  normalizePatch,
  createWorkspaceMemoryStore,
  getDefaultWorkspaceMemoryStore
};
