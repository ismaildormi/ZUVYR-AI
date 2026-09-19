'use strict';

const runtimeConfig = require('../config/code-runtime.v1.json');

function runtimeRepoError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function rpcCode(error, fallback) {
  const text = String(error?.message || error?.details || error?.hint || '');
  const match = text.match(/pack077_[a-z0-9_]+/i);
  return match ? match[0].toLowerCase() : fallback;
}

function publicJob(row) {
  if (!row) return null;
  const spec =
    row.command_spec &&
    typeof row.command_spec === 'object' &&
    !Array.isArray(row.command_spec)
      ? row.command_spec
      : {};
  return Object.freeze({
    id: row.id,
    projectId: row.project_id,
    sandboxSessionId: row.sandbox_session_id,
    sourceJobId: row.source_job_id || null,
    requestId: row.request_id,
    operation: row.operation,
    status: row.status,
    stage: row.stage,
    cancelRequested: row.cancel_requested === true,
    command: spec.command || null,
    args: Array.isArray(spec.args) ? [...spec.args] : [],
    exitCode:
      Number.isInteger(row.exit_code)
        ? row.exit_code
        : null,
    runtimeMs:
      Number.isSafeInteger(Number(row.runtime_ms))
        ? Number(row.runtime_ms)
        : null,
    reservedCredits:
      Number.isSafeInteger(row.reserved_credits)
        ? row.reserved_credits
        : null,
    finalCredits:
      Number.isSafeInteger(row.final_credits)
        ? row.final_credits
        : null,
    pricingVersion: row.pricing_version || null,
    costEntryId: row.cost_entry_id || null,
    result:
      row.result &&
      typeof row.result === 'object' &&
      !Array.isArray(row.result)
        ? row.result
        : {},
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function publicRuntimeState(row) {
  if (!row) return null;
  return Object.freeze({
    sandboxSessionId: row.sandbox_session_id,
    projectId: row.project_id,
    syncedRevision:
      Number.isSafeInteger(Number(row.synced_revision))
        ? Number(row.synced_revision)
        : null,
    filesDigest: row.files_digest || null,
    dependencyDigest: row.dependency_digest || null,
    packageManager: row.package_manager || null,
    runtimeScript: row.runtime_script || null,
    processStatus: row.process_status,
    previewPort:
      Number.isInteger(row.preview_port)
        ? row.preview_port
        : null,
    previewState: row.preview_state || 'unavailable',
    previewCandidatePort:
      Number.isInteger(row.preview_candidate_port)
        ? row.preview_candidate_port
        : null,
    previewTransportStatus: row.preview_transport_status || 'blocked',
    lastDiagnostic:
      row.last_diagnostic &&
      typeof row.last_diagnostic === 'object' &&
      !Array.isArray(row.last_diagnostic)
        ? row.last_diagnostic
        : {},
    lastBuildJobId: row.last_build_job_id || null,
    lastTestJobId: row.last_test_job_id || null,
    previewUpdatedAt: row.preview_updated_at || null,
    startedAt: row.started_at || null,
    updatedAt: row.updated_at
  });
}

function createCodeRuntimeRepository(db) {
  if (!db || typeof db.from !== 'function' || typeof db.rpc !== 'function') {
    throw runtimeRepoError('code_runtime_repository_unavailable');
  }

  async function getInternal({ ownerId, jobId } = {}) {
    const result = await db
      .from('code_runtime_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (result.error) {
      throw runtimeRepoError('code_runtime_job_lookup_failed', result.error);
    }
    if (!result.data) throw runtimeRepoError('pack077_job_not_found');
    return result.data;
  }

  async function get({ ownerId, jobId } = {}) {
    return publicJob(await getInternal({ ownerId, jobId }));
  }

  async function getByRequest({ ownerId, requestId } = {}) {
    const result = await db
      .from('code_runtime_jobs')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('request_id', requestId)
      .maybeSingle();
    if (result.error) {
      throw runtimeRepoError('code_runtime_request_lookup_failed', result.error);
    }
    return result.data
      ? Object.freeze({ public: publicJob(result.data), internal: result.data })
      : null;
  }

  async function activeJobs({ limit = 50 } = {}) {
    const result = await db
      .from('code_runtime_jobs')
      .select('id,owner_id,project_id,sandbox_session_id,status,stage,updated_at')
      .in('status', ['queued','running'])
      .order('updated_at', { ascending: true })
      .limit(Math.max(1, Math.min(200, Number(limit) || 50)));
    if (result.error) {
      throw runtimeRepoError('code_runtime_active_jobs_read_failed', result.error);
    }
    return Object.freeze((result.data || []).map(row => Object.freeze({
      id: row.id,
      ownerId: row.owner_id,
      projectId: row.project_id,
      sandboxSessionId: row.sandbox_session_id,
      status: row.status,
      stage: row.stage,
      updatedAt: row.updated_at
    })));
  }

  async function list({ ownerId, projectId = null, limit = 30 } = {}) {
    let query = db
      .from('code_runtime_jobs')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(100, Number(limit) || 30)));
    if (projectId) query = query.eq('project_id', projectId);
    const result = await query;
    if (result.error) {
      throw runtimeRepoError('code_runtime_jobs_read_failed', result.error);
    }
    return Object.freeze((result.data || []).map(publicJob));
  }

  async function reserve({
    ownerId,
    projectId,
    sandboxSessionId,
    sourceJobId = null,
    requestId,
    operation,
    commandSpec,
    quote
  } = {}) {
    const result = await db.rpc('reserve_zuvyr_code_runtime_job_pack077', {
      p_owner_id: ownerId,
      p_project_id: projectId,
      p_sandbox_session_id: sandboxSessionId,
      p_source_job_id: sourceJobId,
      p_request_id: requestId,
      p_operation: operation,
      p_command_spec: commandSpec,
      p_reserved_credits: quote?.credits,
      p_pricing_version: quote?.pricingVersion,
      p_cost_entry_id: quote?.costEntryId
    });
    if (result.error) {
      throw runtimeRepoError(
        rpcCode(result.error, 'code_runtime_reserve_failed'),
        result.error
      );
    }
    return get({ ownerId, jobId: result.data.job_id });
  }

  async function claim({
    ownerId,
    jobId,
    providerCommandId,
    stage = 'executing'
  } = {}) {
    const result = await db.rpc('claim_zuvyr_code_runtime_job_pack077', {
      p_owner_id: ownerId,
      p_job_id: jobId,
      p_provider_command_id: providerCommandId,
      p_stage: stage
    });
    if (result.error) {
      throw runtimeRepoError(
        rpcCode(result.error, 'code_runtime_claim_failed'),
        result.error
      );
    }
    return get({ ownerId, jobId });
  }

  async function appendLog({
    ownerId,
    jobId,
    sequenceNo,
    stream,
    message
  } = {}) {
    const result = await db.rpc('append_zuvyr_code_runtime_log_pack077', {
      p_owner_id: ownerId,
      p_job_id: jobId,
      p_sequence_no: sequenceNo,
      p_stream: stream,
      p_message: message
    });
    if (result.error) {
      throw runtimeRepoError(
        rpcCode(result.error, 'code_runtime_log_write_failed'),
        result.error
      );
    }
    return result.data;
  }

  async function logs({ ownerId, jobId, after = -1, limit = 100 } = {}) {
    await getInternal({ ownerId, jobId });
    const normalizedAfter = Number(after);
    const normalizedLimit = Math.max(
      1,
      Math.min(
        runtimeConfig.logs.maxReturnedChunks,
        Number(limit) || 100
      )
    );
    let query = db
      .from('code_runtime_log_chunks')
      .select('sequence_no,stream,message,created_at')
      .eq('job_id', jobId)
      .eq('owner_id', ownerId)
      .order('sequence_no', { ascending: true })
      .limit(normalizedLimit);
    if (Number.isInteger(normalizedAfter) && normalizedAfter >= 0) {
      query = query.gt('sequence_no', normalizedAfter);
    }
    const result = await query;
    if (result.error) {
      throw runtimeRepoError('code_runtime_logs_read_failed', result.error);
    }
    return Object.freeze((result.data || []).map(row => Object.freeze({
      sequenceNo: Number(row.sequence_no),
      stream: row.stream,
      message: row.message,
      createdAt: row.created_at
    })));
  }

  async function requestCancel({ ownerId, jobId } = {}) {
    const result = await db.rpc('request_zuvyr_code_runtime_cancel_pack077', {
      p_owner_id: ownerId,
      p_job_id: jobId
    });
    if (result.error) {
      throw runtimeRepoError(
        rpcCode(result.error, 'code_runtime_cancel_request_failed'),
        result.error
      );
    }
    return get({ ownerId, jobId });
  }

  async function finalize({
    ownerId,
    jobId,
    status,
    exitCode = null,
    runtimeMs,
    finalCredits,
    result: payload = {}
  } = {}) {
    const response = await db.rpc('finalize_zuvyr_code_runtime_job_pack077', {
      p_owner_id: ownerId,
      p_job_id: jobId,
      p_status: status,
      p_exit_code: exitCode,
      p_runtime_ms: runtimeMs,
      p_final_credits: finalCredits,
      p_result: payload
    });
    if (response.error) {
      throw runtimeRepoError(
        rpcCode(response.error, 'code_runtime_finalize_failed'),
        response.error
      );
    }
    return get({ ownerId, jobId });
  }

  async function setPreviewPort({ ownerId, sandboxSessionId, port } = {}) {
    const result = await db.rpc(
      'set_zuvyr_code_sandbox_preview_port_pack077',
      {
        p_owner_id: ownerId,
        p_session_id: sandboxSessionId,
        p_preview_port: port
      }
    );
    if (result.error) {
      throw runtimeRepoError(
        rpcCode(result.error, 'code_runtime_preview_port_failed'),
        result.error
      );
    }
    return result.data;
  }

  async function getRuntimeState({ ownerId, sandboxSessionId } = {}) {
    const result = await db
      .from('code_sandbox_runtime_state')
      .select('*')
      .eq('sandbox_session_id', sandboxSessionId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (result.error) {
      throw runtimeRepoError('code_runtime_state_read_failed', result.error);
    }
    return result.data ? publicRuntimeState(result.data) : null;
  }

  async function upsertRuntimeState({
    ownerId,
    projectId,
    sandboxSessionId,
    syncedRevision = null,
    filesDigest = null,
    dependencyDigest = null,
    packageManager = null,
    runtimeScript = null,
    providerCommandId = null,
    processStatus = 'idle',
    previewPort = null,
    previewState = undefined,
    previewCandidatePort = undefined,
    previewTransportStatus = undefined,
    lastDiagnostic = undefined,
    lastBuildJobId = undefined,
    lastTestJobId = undefined,
    previewUpdatedAt = undefined,
    startedAt = null
  } = {}) {
    const session = await db
      .from('code_sandbox_sessions')
      .select('id')
      .eq('id', sandboxSessionId)
      .eq('owner_id', ownerId)
      .eq('project_id', projectId)
      .maybeSingle();
    if (session.error) {
      throw runtimeRepoError('code_runtime_state_session_lookup_failed', session.error);
    }
    if (!session.data) throw runtimeRepoError('pack077_sandbox_not_found');

    const row = {
      sandbox_session_id: sandboxSessionId,
      owner_id: ownerId,
      project_id: projectId,
      synced_revision: syncedRevision,
      files_digest: filesDigest,
      dependency_digest: dependencyDigest,
      package_manager: packageManager,
      runtime_script: runtimeScript,
      provider_command_id: providerCommandId,
      process_status: processStatus,
      preview_port: previewPort,
      started_at: startedAt,
      updated_at: new Date().toISOString()
    };
    if (previewState !== undefined) row.preview_state = previewState;
    if (previewCandidatePort !== undefined) row.preview_candidate_port = previewCandidatePort;
    if (previewTransportStatus !== undefined) row.preview_transport_status = previewTransportStatus;
    if (lastDiagnostic !== undefined) row.last_diagnostic = lastDiagnostic;
    if (lastBuildJobId !== undefined) row.last_build_job_id = lastBuildJobId;
    if (lastTestJobId !== undefined) row.last_test_job_id = lastTestJobId;
    if (previewUpdatedAt !== undefined) row.preview_updated_at = previewUpdatedAt;

    const result = await db
      .from('code_sandbox_runtime_state')
      .upsert(row, {
        onConflict: 'sandbox_session_id'
      })
      .select('*')
      .single();

    if (result.error) {
      throw runtimeRepoError('code_runtime_state_write_failed', result.error);
    }
    return publicRuntimeState(result.data);
  }

  return Object.freeze({
    reserve,
    claim,
    appendLog,
    logs,
    requestCancel,
    finalize,
    setPreviewPort,
    get,
    getInternal,
    getByRequest,
    list,
    activeJobs,
    getRuntimeState,
    upsertRuntimeState
  });
}

module.exports = {
  createCodeRuntimeRepository,
  publicJob,
  publicRuntimeState
};
