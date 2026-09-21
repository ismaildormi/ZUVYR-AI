'use strict';

function storeError(code, detail = null) {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  return error;
}

function normalizeLimit(value, fallback = 50, max = 200) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function createPermissionCenterStore(db) {
  if (!db || typeof db.rpc !== 'function' || typeof db.from !== 'function') {
    throw storeError('permission_store_unavailable');
  }

  async function resourceOwned({ ownerId, resourceNamespace, resourceId }) {
    const { data, error } = await db.rpc('zuvyr_permission_resource_owned', {
      p_owner_id: ownerId,
      p_resource_namespace: resourceNamespace,
      p_resource_id: resourceId
    });
    if (error) throw storeError('permission_resource_check_failed', error.message);
    return data === true;
  }

  async function createGrant(input) {
    const { data, error } = await db.rpc('create_zuvyr_permission_grant', {
      p_owner_id: input.ownerId,
      p_action_class: input.action,
      p_grant_mode: input.grantMode,
      p_scope_type: input.scopeType,
      p_resource_namespace: input.resourceNamespace,
      p_resource_id: input.resourceId,
      p_session_id: input.sessionId,
      p_consequence_id: input.consequenceId,
      p_confirmation_fingerprint: input.confirmationFingerprint,
      p_expires_at: input.expiresAt,
      p_explicit_consent: input.explicitConsent === true,
      p_constraints: input.constraints || {}
    });
    if (error) throw storeError('permission_grant_create_failed', error.message);
    if (!data || data.success !== true) throw storeError(data?.error || 'permission_grant_create_failed');
    return data;
  }

  async function revokeGrant({ ownerId, grantId }) {
    const { data, error } = await db.rpc('revoke_zuvyr_permission_grant', {
      p_owner_id: ownerId,
      p_grant_id: grantId
    });
    if (error) throw storeError('permission_grant_revoke_failed', error.message);
    if (!data || data.success !== true) throw storeError(data?.error || 'permission_grant_revoke_failed');
    return data;
  }

  async function consume({ ownerId, action, resourceNamespace, resourceId, sessionId = null, requestId }) {
    const { data, error } = await db.rpc('consume_zuvyr_permission_grant', {
      p_owner_id: ownerId,
      p_action_class: action,
      p_resource_namespace: resourceNamespace,
      p_resource_id: resourceId,
      p_session_id: sessionId,
      p_request_id: requestId
    });
    if (error) throw storeError('permission_consume_failed', error.message);
    if (!data || data.success !== true) throw storeError(data?.error || 'permission_consume_failed');
    return data;
  }

  async function consumeWorkspaceTool({
    ownerId,
    action,
    connectionId,
    sessionId,
    requestId,
    toolKey = null,
    operationFingerprint
  }) {
    const { data, error } = await db.rpc('consume_workspace_tool_permission_pack089', {
      p_owner_id: ownerId,
      p_action_class: action,
      p_connection_id: connectionId,
      p_session_id: sessionId,
      p_request_id: requestId,
      p_tool_key: toolKey,
      p_operation_fingerprint: operationFingerprint
    });
    if (error) throw storeError('workspace_tool_permission_consume_failed', error.message);
    if (!data || data.success !== true || data.allowed !== true) {
      throw storeError(data?.error || 'permission_required');
    }
    return data;
  }

  async function consumeWorkspaceConnection({
    ownerId,
    action,
    connectionId,
    sessionId,
    requestId,
    toolKey,
    requiredScope,
    operationFingerprint = null
  }) {
    const { data, error } = await db.rpc('consume_workspace_connection_permission_pack089', {
      p_owner_id: ownerId,
      p_action_class: action,
      p_connection_id: connectionId,
      p_session_id: sessionId,
      p_request_id: requestId,
      p_tool_key: toolKey,
      p_required_scope: requiredScope,
      p_operation_fingerprint: operationFingerprint
    });
    if (error) throw storeError('workspace_connection_permission_consume_failed', error.message);
    if (!data || data.success !== true || data.allowed !== true) {
      throw storeError(data?.error || 'permission_required');
    }
    return data;
  }

  async function listGrants(ownerId, { limit = 50, activeOnly = false } = {}) {
    let query = db
      .from('zuvyr_permission_grants')
      .select('id,action_class,grant_mode,scope_type,resource_namespace,resource_id,session_id,consequence_id,constraints,issued_at,expires_at,revoked_at,consumed_at,last_used_at,use_count,created_at')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(normalizeLimit(limit));
    if (activeOnly) {
      query = query.is('revoked_at', null).gt('expires_at', new Date().toISOString());
    }
    const { data, error } = await query;
    if (error) throw storeError('permission_grants_read_failed', error.message);
    return data || [];
  }

  async function listAudit(ownerId, { limit = 50 } = {}) {
    const { data, error } = await db
      .from('zuvyr_permission_audit_events')
      .select('id,grant_id,action_class,event_type,reason,request_id,resource_namespace,resource_id,session_id,metadata,created_at')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(normalizeLimit(limit));
    if (error) throw storeError('permission_audit_read_failed', error.message);
    return data || [];
  }

  return Object.freeze({
    resourceOwned,
    createGrant,
    revokeGrant,
    consume,
    consumeWorkspaceTool,
    consumeWorkspaceConnection,
    listGrants,
    listAudit
  });
}

let defaultStore = null;
function getDefaultPermissionCenterStore() {
  if (!defaultStore) {
    const { supabaseAdmin } = require('./supabaseAdmin');
    defaultStore = createPermissionCenterStore(supabaseAdmin);
  }
  return defaultStore;
}

module.exports = {
  createPermissionCenterStore,
  getDefaultPermissionCenterStore
};
