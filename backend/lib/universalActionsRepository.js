'use strict';

const crypto = require('crypto');
const { getDefaultWorkspaceLibraryStore } = require('./workspaceLibraryRepository');

const CONTEXT_ACTIONS = new Set(['ask', 'edit', 'verify', 'translate', 'search', 'save']);
const ACTION_DESTINATIONS = Object.freeze({
  ask: 'chat',
  edit: 'editor',
  verify: 'research',
  translate: 'chat',
  search: 'research',
  save: 'library'
});

function actionError(code, details = null) {
  const error = new Error(code);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function normalizeAction(value) {
  const action = String(value || '').trim().toLowerCase().replace(/-/g, '_');
  if (!CONTEXT_ACTIONS.has(action)) throw actionError('workspace_universal_action_invalid');
  return action;
}

function normalizeRequestId(value) {
  const requestId = String(value || '').trim() || `pack049:${crypto.randomUUID()}`;
  if (requestId.length > 200) throw actionError('workspace_universal_request_id_invalid');
  return requestId;
}

function rpcCode(error, fallback) {
  const text = String(error?.message || error || '');
  const match = text.match(/pack049_[a-z0-9_]+/i);
  if (!match) return fallback;
  const raw = match[0].toLowerCase();
  if (raw.startsWith('pack049_permission_denied')) return 'workspace_universal_permission_required';
  return 'workspace_' + raw;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function changedKeys(left, right) {
  const keys = new Set([
    ...Object.keys(left && typeof left === 'object' ? left : {}),
    ...Object.keys(right && typeof right === 'object' ? right : {})
  ]);
  return [...keys].filter(key => stable(left?.[key]) !== stable(right?.[key])).sort();
}

function compareVersionRecords(fromVersion, toVersion) {
  if (!fromVersion || !toVersion) throw actionError('workspace_universal_compare_version_not_found');
  return Object.freeze({
    schema_version: 'pack049.version-compare.v1',
    from_version_id: fromVersion.id,
    to_version_id: toVersion.id,
    from_version_number: fromVersion.version_number,
    to_version_number: toVersion.version_number,
    sha256_changed: (fromVersion.sha256 || null) !== (toVersion.sha256 || null),
    uri_changed: (fromVersion.uri || null) !== (toVersion.uri || null),
    mime_type_changed: (fromVersion.mime_type || null) !== (toVersion.mime_type || null),
    payload_changed_keys: changedKeys(fromVersion.payload || {}, toVersion.payload || {}),
    provenance_changed_keys: changedKeys(fromVersion.provenance || {}, toVersion.provenance || {})
  });
}

function provenanceFromItem(item) {
  const current = (item.versions || []).find(version => version.id === item.current_version_id) || item.versions?.[0] || null;
  return {
    source_kind: item.source_kind,
    source_system: item.source_system,
    source_id: item.source_id,
    model: item.model || null,
    provider: item.provider || null,
    source_version_provenance: current?.provenance || {}
  };
}

function createUniversalActionsStore({ client, libraryStore } = {}) {
  if (!client || typeof client.rpc !== 'function' || typeof client.from !== 'function') {
    throw actionError('workspace_universal_client_required');
  }
  if (!libraryStore || typeof libraryStore.getItem !== 'function' || typeof libraryStore.createSendTo !== 'function') {
    throw actionError('workspace_universal_library_store_required');
  }

  async function rpc(name, args) {
    const result = await client.rpc(name, args);
    if (result?.error) throw actionError(rpcCode(result.error, 'workspace_universal_action_failed'), { rpc: name });
    return result?.data || null;
  }

  async function getAction({ ownerId, actionId }) {
    const result = await client
      .from('zuvyr_universal_actions')
      .select('id,owner_id,action,source_content_id,source_version_id,destination,workspace_project_id,code_project_id,request_id,status,input,result,undo_payload,created_at,completed_at,undone_at,updated_at')
      .eq('id', actionId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (result.error || !result.data) throw actionError('workspace_universal_action_not_found');
    return result.data;
  }

  async function createContextAction({ ownerId, contentId, action, requestId, metadata = {} }) {
    const normalized = normalizeAction(action);
    const item = await libraryStore.getItem({ ownerId, contentId });
    if (!item.current_version_id) throw actionError('workspace_universal_current_version_missing');
    const destination = ACTION_DESTINATIONS[normalized];
    const result = {
      schema_version: 'pack049.context-action.v1',
      action: normalized,
      destination,
      canonical_content_id: item.id,
      canonical_version_id: item.current_version_id,
      asset_ids: (item.assets || []).filter(asset => asset.status === 'active').map(asset => asset.id),
      provenance: provenanceFromItem(item),
      dispatch: {
        destination,
        reuse_mode: 'canonical_reference',
        upload_required: false
      }
    };
    return rpc('create_zuvyr_universal_action', {
      p_owner_id: ownerId,
      p_action: normalized,
      p_source_content_id: item.id,
      p_source_version_id: item.current_version_id,
      p_destination: destination,
      p_workspace_project_id: item.project_id || null,
      p_code_project_id: null,
      p_request_id: normalizeRequestId(requestId),
      p_input: { metadata: metadata || {} },
      p_result: result,
      p_undo_payload: {}
    });
  }

  async function sendTo({
    ownerId,
    contentId,
    destination,
    codeProjectId = null,
    path = null,
    sessionId = null,
    requestId = null,
    metadata = {}
  }) {
    const descriptor = await libraryStore.createSendTo({ ownerId, contentId, destination });

    if (descriptor.destination === 'code' && !codeProjectId) {
      return {
        schema_version: 'pack049.universal-handoff-preflight.v1',
        ...descriptor,
        persisted: false,
        requires: {
          code_project_id: true,
          project_write_permission: true,
          project_session_id: true
        }
      };
    }

    if (descriptor.destination === 'code') {
      const data = await rpc('execute_zuvyr_code_asset_handoff', {
        p_owner_id: ownerId,
        p_content_id: descriptor.canonical_content_id,
        p_code_project_id: codeProjectId,
        p_path: path || null,
        p_session_id: sessionId || null,
        p_request_id: normalizeRequestId(requestId),
        p_metadata: metadata || {}
      });
      return {
        action_id: data.action_id,
        status: data.status,
        replayed: data.replayed === true,
        ...(data.result || {})
      };
    }

    const result = {
      schema_version: 'pack049.universal-handoff.v1',
      ...descriptor,
      affected_file_ids: [],
      affected_paths: [],
      persisted: true
    };
    const data = await rpc('create_zuvyr_universal_action', {
      p_owner_id: ownerId,
      p_action: 'send_to',
      p_source_content_id: descriptor.canonical_content_id,
      p_source_version_id: descriptor.canonical_version_id,
      p_destination: descriptor.destination,
      p_workspace_project_id: descriptor.project_id || null,
      p_code_project_id: null,
      p_request_id: normalizeRequestId(requestId),
      p_input: { metadata: metadata || {} },
      p_result: result,
      p_undo_payload: {}
    });
    return {
      action_id: data.action_id,
      status: data.status,
      replayed: data.replayed === true,
      ...(data.result || result)
    };
  }

  async function compareVersions({ ownerId, contentId, fromVersionId, toVersionId }) {
    const item = await libraryStore.getItem({ ownerId, contentId });
    const byId = new Map((item.versions || []).map(version => [version.id, version]));
    const fromVersion = byId.get(fromVersionId);
    const toVersion = byId.get(toVersionId);
    const comparison = compareVersionRecords(fromVersion, toVersion);
    return {
      canonical_content_id: item.id,
      ...comparison
    };
  }

  async function restoreVersion({ ownerId, contentId, versionId, requestId, metadata = {} }) {
    return rpc('restore_zuvyr_content_version_action', {
      p_owner_id: ownerId,
      p_content_id: contentId,
      p_restore_version_id: versionId,
      p_request_id: normalizeRequestId(requestId),
      p_metadata: metadata || {}
    });
  }

  async function undoAction({ ownerId, actionId, sessionId = null, requestId = null }) {
    return rpc('undo_zuvyr_universal_action', {
      p_owner_id: ownerId,
      p_action_id: actionId,
      p_session_id: sessionId || null,
      p_request_id: normalizeRequestId(requestId)
    });
  }

  return {
    createContextAction,
    sendTo,
    compareVersions,
    restoreVersion,
    undoAction,
    getAction
  };
}

function getDefaultUniversalActionsStore({ libraryStore } = {}) {
  return createUniversalActionsStore({
    client: require('./supabaseAdmin').supabaseAdmin,
    libraryStore: libraryStore || getDefaultWorkspaceLibraryStore()
  });
}

module.exports = {
  CONTEXT_ACTIONS,
  ACTION_DESTINATIONS,
  normalizeAction,
  compareVersionRecords,
  createUniversalActionsStore,
  getDefaultUniversalActionsStore
};
