'use strict';

const {
  publicSession,
  safeResourceLimits,
  safeNetworkPolicy
} = require('./codeSandboxPolicy');

function repositoryError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function rpcCode(error, fallback) {
  const text = String(error?.message || error?.details || error?.hint || '');
  const match = text.match(/pack076_[a-z0-9_]+/i);
  return match ? match[0].toLowerCase() : fallback;
}

function createCodeSandboxRepository(client) {
  if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') {
    throw repositoryError('code_sandbox_repository_unavailable');
  }

  async function requireProject(ownerId, projectId) {
    const result = await client
      .from('code_projects')
      .select('id,owner_id,status')
      .eq('id', projectId)
      .eq('owner_id', ownerId)
      .eq('status', 'active')
      .maybeSingle();
    if (result.error) throw repositoryError('code_sandbox_project_lookup_failed', result.error);
    if (!result.data) throw repositoryError('pack076_project_not_found');
    return result.data;
  }

  async function reserve({
    ownerId,
    projectId,
    requestId,
    previewTokenHash,
    expiresAt,
    idleExpiresAt
  } = {}) {
    await requireProject(ownerId, projectId);
    const result = await client.rpc('reserve_zuvyr_code_sandbox_session_pack076', {
      p_owner_id: ownerId,
      p_project_id: projectId,
      p_request_id: requestId,
      p_preview_token_hash: previewTokenHash,
      p_expires_at: expiresAt,
      p_idle_expires_at: idleExpiresAt,
      p_resource_limits: safeResourceLimits(),
      p_network_policy: safeNetworkPolicy()
    });
    if (result.error) {
      throw repositoryError(rpcCode(result.error, 'code_sandbox_reserve_failed'), result.error);
    }
    return get({ ownerId, sessionId: result.data.session_id });
  }

  async function getInternal({ ownerId, sessionId } = {}) {
    const result = await client
      .from('code_sandbox_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (result.error) throw repositoryError('code_sandbox_lookup_failed', result.error);
    if (!result.data) throw repositoryError('pack076_session_not_found');
    return result.data;
  }

  async function get({ ownerId, sessionId } = {}) {
    return publicSession(await getInternal({ ownerId, sessionId }));
  }

  async function list({ ownerId, projectId = null, limit = 20 } = {}) {
    let query = client
      .from('code_sandbox_sessions')
      .select('id,project_id,status,runtime,resource_limits,network_policy,preview_port,preview_expires_at,expires_at,idle_expires_at,last_activity_at,created_at,stopped_at,failure_code')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(100, Number(limit) || 20)));
    if (projectId) query = query.eq('project_id', projectId);
    const result = await query;
    if (result.error) throw repositoryError('code_sandbox_list_failed', result.error);
    return Object.freeze((result.data || []).map(publicSession));
  }

  async function transition({
    ownerId,
    sessionId,
    status,
    providerSessionId = null,
    previewPort = null,
    usageMetrics = null,
    failureCode = null
  } = {}) {
    const result = await client.rpc(
      'transition_zuvyr_code_sandbox_session_pack076',
      {
        p_owner_id: ownerId,
        p_session_id: sessionId,
        p_next_status: status,
        p_provider_session_id: providerSessionId,
        p_preview_port: previewPort,
        p_usage_metrics: usageMetrics,
        p_failure_code: failureCode
      }
    );
    if (result.error) {
      throw repositoryError(rpcCode(result.error, 'code_sandbox_transition_failed'), result.error);
    }
    return get({ ownerId, sessionId });
  }

  async function touch({ ownerId, sessionId, idleExpiresAt } = {}) {
    const result = await client.rpc('touch_zuvyr_code_sandbox_session_pack076', {
      p_owner_id: ownerId,
      p_session_id: sessionId,
      p_idle_expires_at: idleExpiresAt
    });
    if (result.error) {
      throw repositoryError(rpcCode(result.error, 'code_sandbox_touch_failed'), result.error);
    }
    return get({ ownerId, sessionId });
  }

  async function rotatePreviewToken({
    ownerId,
    sessionId,
    previewTokenHash,
    previewExpiresAt
  } = {}) {
    const result = await client.rpc(
      'rotate_zuvyr_code_sandbox_preview_token_pack076',
      {
        p_owner_id: ownerId,
        p_session_id: sessionId,
        p_preview_token_hash: previewTokenHash,
        p_preview_expires_at: previewExpiresAt
      }
    );
    if (result.error) {
      throw repositoryError(rpcCode(result.error, 'code_sandbox_preview_token_rotate_failed'), result.error);
    }
    return get({ ownerId, sessionId });
  }

  async function previewAuthority({ sessionId, previewTokenHash } = {}) {
    const result = await client
      .from('code_sandbox_sessions')
      .select('id,owner_id,project_id,provider,provider_session_id,status,preview_token_hash,preview_port,preview_expires_at,expires_at,idle_expires_at')
      .eq('id', sessionId)
      .eq('preview_token_hash', previewTokenHash)
      .maybeSingle();
    if (result.error) throw repositoryError('code_sandbox_preview_lookup_failed', result.error);
    const row = result.data;
    if (!row) throw repositoryError('code_preview_token_invalid');
    const now = Date.now();
    if (
      row.status !== 'running' ||
      !row.provider_session_id ||
      !Number.isInteger(row.preview_port) ||
      row.preview_port < 1 ||
      !row.preview_expires_at ||
      new Date(row.preview_expires_at).getTime() <= now ||
      new Date(row.expires_at).getTime() <= now ||
      new Date(row.idle_expires_at).getTime() <= now
    ) {
      throw repositoryError('code_preview_transport_unavailable');
    }
    return Object.freeze(row);
  }

  async function stale({ limit = 50 } = {}) {
    const now = new Date().toISOString();
    const result = await client
      .from('code_sandbox_sessions')
      .select('id,owner_id,project_id,provider_session_id,status,expires_at,idle_expires_at')
      .in('status', ['reserved','provisioning','running','stopping'])
      .or('expires_at.lte.' + now + ',idle_expires_at.lte.' + now)
      .order('updated_at', { ascending: true })
      .limit(Math.max(1, Math.min(200, Number(limit) || 50)));
    if (result.error) throw repositoryError('code_sandbox_stale_lookup_failed', result.error);
    return Object.freeze(result.data || []);
  }

  return Object.freeze({
    reserve,
    get,
    getInternal,
    list,
    transition,
    touch,
    rotatePreviewToken,
    previewAuthority,
    stale
  });
}

module.exports = {
  createCodeSandboxRepository
};
