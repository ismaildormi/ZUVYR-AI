'use strict';

const {
  publicSession,
  sessionPolicies,
  browserError
} = require('./cloudBrowserPolicy');

function repoError(code, cause = null) {
  const error = browserError(code);
  if (cause) error.cause = cause;
  return error;
}

function rpcCode(error, fallback) {
  const text = String(error?.message || error?.details || error?.hint || '');
  const match = text.match(/pack081_[a-z0-9_]+/i);
  return match ? match[0].toLowerCase() : fallback;
}

function createCloudBrowserRepository(client) {
  if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') {
    throw repoError('cloud_browser_repository_unavailable');
  }

  async function reserve({
    ownerId,
    taskRunId = null,
    requestId,
    expiresAt,
    idleExpiresAt
  } = {}) {
    const policies = sessionPolicies();
    const result = await client.rpc('reserve_zuvyr_browser_session_pack081', {
      p_owner_id: ownerId,
      p_task_run_id: taskRunId,
      p_request_id: requestId,
      p_expires_at: expiresAt,
      p_idle_expires_at: idleExpiresAt,
      p_network_policy: policies.network,
      p_secret_policy: policies.secrets
    });
    if (result.error) {
      throw repoError(rpcCode(result.error, 'cloud_browser_reserve_failed'), result.error);
    }
    return get({ ownerId, sessionId: result.data.session_id });
  }

  async function getInternal({ ownerId, sessionId } = {}) {
    const result = await client
      .from('browser_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (result.error) throw repoError('cloud_browser_lookup_failed', result.error);
    if (!result.data) throw repoError('pack081_session_not_found');
    return result.data;
  }

  async function get({ ownerId, sessionId } = {}) {
    return publicSession(await getInternal({ ownerId, sessionId }));
  }

  async function getByRequest({ ownerId, requestId } = {}) {
    const result = await client
      .from('browser_sessions')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('request_id', requestId)
      .maybeSingle();

    if (result.error) throw repoError('cloud_browser_request_lookup_failed', result.error);
    if (!result.data) return null;

    return Object.freeze({
      public: publicSession(result.data),
      internal: result.data
    });
  }

  async function list({ ownerId, limit = 20 } = {}) {
    const result = await client
      .from('browser_sessions')
      .select('id,task_run_id,status,provider,region,current_host,started_at,last_activity_at,expires_at,idle_expires_at,ended_at,usage_seconds,failure_code,created_at,updated_at')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(100, Number(limit) || 20)));

    if (result.error) throw repoError('cloud_browser_list_failed', result.error);
    return Object.freeze((result.data || []).map(publicSession));
  }

  async function transition({
    ownerId,
    sessionId,
    status,
    providerSessionId = null,
    region = null,
    currentHost = null,
    usageSeconds = null,
    failureCode = null
  } = {}) {
    const result = await client.rpc('transition_zuvyr_browser_session_pack081', {
      p_owner_id: ownerId,
      p_session_id: sessionId,
      p_next_status: status,
      p_provider_session_id: providerSessionId,
      p_region: region,
      p_current_host: currentHost,
      p_usage_seconds: usageSeconds,
      p_failure_code: failureCode
    });

    if (result.error) {
      throw repoError(rpcCode(result.error, 'cloud_browser_transition_failed'), result.error);
    }
    return get({ ownerId, sessionId });
  }

  async function touch({
    ownerId,
    sessionId,
    idleExpiresAt,
    currentHost = null,
    usageSeconds = null
  } = {}) {
    const result = await client.rpc('touch_zuvyr_browser_session_pack081', {
      p_owner_id: ownerId,
      p_session_id: sessionId,
      p_idle_expires_at: idleExpiresAt,
      p_current_host: currentHost,
      p_usage_seconds: usageSeconds
    });

    if (result.error) {
      throw repoError(rpcCode(result.error, 'cloud_browser_touch_failed'), result.error);
    }
    return get({ ownerId, sessionId });
  }

  async function stale({ limit = 50 } = {}) {
    const now = new Date().toISOString();
    const result = await client
      .from('browser_sessions')
      .select('id,owner_id,provider_session_id,status,started_at,expires_at,idle_expires_at,usage_seconds')
      .in('status', ['reserved','provisioning','running','detached','closing'])
      .or('expires_at.lte.' + now + ',idle_expires_at.lte.' + now)
      .order('updated_at', { ascending: true })
      .limit(Math.max(1, Math.min(200, Number(limit) || 50)));

    if (result.error) throw repoError('cloud_browser_stale_lookup_failed', result.error);
    return Object.freeze(result.data || []);
  }

  async function recordArtifact({
    ownerId,
    sessionId,
    artifactKind,
    canonicalContentId,
    canonicalVersionId,
    assetId = null,
    providerArtifactId = null,
    fileName = null,
    mimeType = null,
    fileSizeBytes = null,
    sha256 = null,
    metadata = {}
  } = {}) {
    await getInternal({ ownerId, sessionId });

    const row = {
      owner_id: ownerId,
      session_id: sessionId,
      artifact_kind: artifactKind,
      canonical_content_id: canonicalContentId,
      canonical_version_id: canonicalVersionId,
      asset_id: assetId,
      provider_artifact_id: providerArtifactId,
      file_name: fileName,
      mime_type: mimeType,
      file_size_bytes: fileSizeBytes,
      sha256,
      metadata
    };

    const result = await client
      .from('browser_session_artifacts')
      .insert(row)
      .select('id,artifact_kind,canonical_content_id,canonical_version_id,asset_id,provider_artifact_id,file_name,mime_type,file_size_bytes,sha256,metadata,created_at')
      .single();

    if (result.error) throw repoError('cloud_browser_artifact_record_failed', result.error);
    return Object.freeze({
      id: result.data.id,
      kind: result.data.artifact_kind,
      contentId: result.data.canonical_content_id,
      versionId: result.data.canonical_version_id,
      assetId: result.data.asset_id,
      providerArtifactId: result.data.provider_artifact_id,
      fileName: result.data.file_name,
      mimeType: result.data.mime_type,
      fileSizeBytes: result.data.file_size_bytes,
      sha256: result.data.sha256,
      metadata: result.data.metadata || {},
      createdAt: result.data.created_at
    });
  }

  async function artifacts({ ownerId, sessionId, limit = 100 } = {}) {
    await getInternal({ ownerId, sessionId });
    const result = await client
      .from('browser_session_artifacts')
      .select('id,artifact_kind,canonical_content_id,canonical_version_id,asset_id,provider_artifact_id,file_name,mime_type,file_size_bytes,sha256,metadata,created_at')
      .eq('owner_id', ownerId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(200, Number(limit) || 100)));

    if (result.error) throw repoError('cloud_browser_artifact_list_failed', result.error);
    return Object.freeze(result.data || []);
  }

  return Object.freeze({
    reserve,
    get,
    getInternal,
    getByRequest,
    list,
    transition,
    touch,
    stale,
    recordArtifact,
    artifacts
  });
}

module.exports = {
  createCloudBrowserRepository
};
