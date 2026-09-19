'use strict';

function repairError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function rpcCode(error, fallback) {
  const text = String(error?.message || error?.details || error?.hint || '');
  const match = text.match(/pack078_[a-z0-9_]+/i);
  return match ? match[0].toLowerCase() : fallback;
}

function publicRun(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    projectId: row.project_id,
    sandboxSessionId: row.sandbox_session_id,
    sourceJobId: row.source_job_id,
    requestId: row.request_id,
    baseRevision: Number(row.base_revision),
    status: row.status,
    maxAttempts: Number(row.max_attempts),
    attemptsUsed: Number(row.attempts_used),
    lastFailureFingerprint: row.last_failure_fingerprint || null,
    finalRevision:
      Number.isSafeInteger(Number(row.final_revision))
        ? Number(row.final_revision)
        : null,
    result:
      row.result && typeof row.result === 'object' && !Array.isArray(row.result)
        ? row.result
        : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || null
  });
}

function publicAttempt(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    repairRunId: row.repair_run_id,
    attemptNo: Number(row.attempt_no),
    failureFingerprint: row.failure_fingerprint,
    diagnosis:
      row.diagnosis && typeof row.diagnosis === 'object' && !Array.isArray(row.diagnosis)
        ? row.diagnosis
        : {},
    sourceJobId: row.source_job_id || null,
    aiEditRequestId: row.ai_edit_request_id || null,
    repairedVersionId: row.repaired_version_id || null,
    retestJobId: row.retest_job_id || null,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at || null
  });
}

function createCodeRepairRepository(db) {
  if (!db || typeof db.from !== 'function' || typeof db.rpc !== 'function') {
    throw repairError('code_repair_repository_unavailable');
  }

  async function get({ ownerId, repairRunId } = {}) {
    const result = await db
      .from('code_repair_runs')
      .select('*')
      .eq('id', repairRunId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (result.error) throw repairError('code_repair_run_lookup_failed', result.error);
    if (!result.data) throw repairError('pack078_repair_run_not_found');
    return publicRun(result.data);
  }

  async function getByRequest({ ownerId, requestId } = {}) {
    const result = await db
      .from('code_repair_runs')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('request_id', requestId)
      .maybeSingle();
    if (result.error) throw repairError('code_repair_request_lookup_failed', result.error);
    return publicRun(result.data);
  }

  async function listAttempts({ ownerId, repairRunId } = {}) {
    await get({ ownerId, repairRunId });
    const result = await db
      .from('code_repair_attempts')
      .select('*')
      .eq('repair_run_id', repairRunId)
      .eq('owner_id', ownerId)
      .order('attempt_no', { ascending: true });
    if (result.error) throw repairError('code_repair_attempts_lookup_failed', result.error);
    return Object.freeze((result.data || []).map(publicAttempt));
  }

  async function getLatestAttempt({ ownerId, repairRunId } = {}) {
    await get({ ownerId, repairRunId });
    const result = await db
      .from('code_repair_attempts')
      .select('*')
      .eq('repair_run_id', repairRunId)
      .eq('owner_id', ownerId)
      .order('attempt_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw repairError('code_repair_attempt_lookup_failed', result.error);
    return publicAttempt(result.data);
  }

  async function reserve({
    ownerId,
    projectId,
    sandboxSessionId,
    sourceJobId,
    requestId,
    baseRevision,
    failureFingerprint
  } = {}) {
    const result = await db.rpc('reserve_zuvyr_code_repair_run_pack078', {
      p_owner_id: ownerId,
      p_project_id: projectId,
      p_sandbox_session_id: sandboxSessionId,
      p_source_job_id: sourceJobId,
      p_request_id: requestId,
      p_base_revision: baseRevision,
      p_failure_fingerprint: failureFingerprint
    });
    if (result.error) {
      throw repairError(rpcCode(result.error, 'code_repair_reserve_failed'), result.error);
    }
    return get({ ownerId, repairRunId: result.data.repair_run_id });
  }

  async function claimAttempt({
    ownerId,
    repairRunId,
    failureFingerprint,
    diagnosis,
    sourceJobId
  } = {}) {
    const result = await db.rpc('claim_zuvyr_code_repair_attempt_pack078', {
      p_owner_id: ownerId,
      p_repair_run_id: repairRunId,
      p_failure_fingerprint: failureFingerprint,
      p_diagnosis: diagnosis || {},
      p_source_job_id: sourceJobId
    });
    if (result.error) {
      throw repairError(rpcCode(result.error, 'code_repair_attempt_claim_failed'), result.error);
    }
    const attempt = await db
      .from('code_repair_attempts')
      .select('*')
      .eq('id', result.data.attempt_id)
      .eq('owner_id', ownerId)
      .single();
    if (attempt.error) {
      throw repairError('code_repair_attempt_lookup_failed', attempt.error);
    }
    return publicAttempt(attempt.data);
  }

  async function completeAttempt({
    ownerId,
    attemptId,
    status,
    aiEditRequestId = null,
    repairedVersionId = null,
    retestJobId = null,
    finalRevision = null,
    result: payload = {}
  } = {}) {
    const result = await db.rpc('complete_zuvyr_code_repair_attempt_pack078', {
      p_owner_id: ownerId,
      p_attempt_id: attemptId,
      p_status: status,
      p_ai_edit_request_id: aiEditRequestId,
      p_repaired_version_id: repairedVersionId,
      p_retest_job_id: retestJobId,
      p_final_revision: finalRevision,
      p_result: payload || {}
    });
    if (result.error) {
      throw repairError(rpcCode(result.error, 'code_repair_attempt_complete_failed'), result.error);
    }
    return get({ ownerId, repairRunId: result.data.repair_run_id });
  }

  async function publicBundle({ ownerId, repairRunId } = {}) {
    const [run, attempts] = await Promise.all([
      get({ ownerId, repairRunId }),
      listAttempts({ ownerId, repairRunId })
    ]);
    return Object.freeze({ run, attempts });
  }

  return Object.freeze({
    get,
    getByRequest,
    listAttempts,
    getLatestAttempt,
    reserve,
    claimAttempt,
    completeAttempt,
    publicBundle
  });
}

module.exports = {
  createCodeRepairRepository,
  publicRun,
  publicAttempt
};
