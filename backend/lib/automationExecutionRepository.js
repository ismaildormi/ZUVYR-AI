'use strict';

function executionRepoError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function uuid(value, code) {
  const text = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw executionRepoError(code);
  }
  return text;
}

function rpcData(result, code) {
  if (!result || typeof result !== 'object' || result.error) {
    throw executionRepoError(code, {
      databaseCode: result && result.error ? result.error.code || null : null,
      databaseMessage: result && result.error ? result.error.message || null : null
    });
  }
  return result.data;
}

function brainIdempotencyKey(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 96) throw executionRepoError('PACK088_BRAIN_IDEMPOTENCY_INVALID');
  return `pack040:${text}`;
}

function createAutomationExecutionRepository({ client } = {}) {
  const db = client || require('./supabaseAdmin').supabaseAdmin;
  if (!db || typeof db.rpc !== 'function' || typeof db.from !== 'function') {
    throw executionRepoError('PACK088_EXECUTION_DATABASE_REQUIRED');
  }

  return Object.freeze({
    async claimExecution({ runId, queueJobId, now = new Date().toISOString() } = {}) {
      const result = await db.rpc('claim_workspace_schedule_run_execution_pack088', {
        p_run_id: uuid(runId, 'PACK088_RUN_ID_INVALID'),
        p_queue_job_id: String(queueJobId || ''),
        p_now: now
      });
      return rpcData(result, 'PACK088_EXECUTION_CLAIM_FAILED');
    },

    async consumePermission({
      runId,
      claimToken,
      stepKey,
      action,
      resourceNamespace,
      resourceId,
      sessionId = null,
      requestId,
      now = new Date().toISOString()
    } = {}) {
      const result = await db.rpc('consume_workspace_schedule_permission_pack088', {
        p_run_id: uuid(runId, 'PACK088_RUN_ID_INVALID'),
        p_claim_token: uuid(claimToken, 'PACK088_CLAIM_TOKEN_INVALID'),
        p_step_key: String(stepKey || ''),
        p_action_class: String(action || ''),
        p_resource_namespace: String(resourceNamespace || ''),
        p_resource_id: String(resourceId || ''),
        p_session_id: sessionId == null ? null : String(sessionId),
        p_request_id: String(requestId || ''),
        p_now: now
      });
      return rpcData(result, 'PACK088_PERMISSION_CONSUME_FAILED');
    },

    async grantIpMission({
      runId,
      claimToken,
      sessionId,
      mission,
      expiresAt,
      now = new Date().toISOString()
    } = {}) {
      const result = await db.rpc('grant_workspace_schedule_ip_mission_pack088', {
        p_run_id: uuid(runId, 'PACK088_RUN_ID_INVALID'),
        p_claim_token: uuid(claimToken, 'PACK088_CLAIM_TOKEN_INVALID'),
        p_session_id: uuid(sessionId, 'PACK088_IP_SESSION_ID_INVALID'),
        p_mission: String(mission || ''),
        p_expires_at: expiresAt,
        p_now: now
      });
      return rpcData(result, 'PACK088_IP_MISSION_GRANT_FAILED');
    },

    async block({
      runId,
      claimToken,
      state,
      errorCode,
      pricingSnapshot = null,
      permissionReceipt = null,
      now = new Date().toISOString()
    } = {}) {
      const result = await db.rpc('block_workspace_schedule_run_execution_pack088', {
        p_run_id: uuid(runId, 'PACK088_RUN_ID_INVALID'),
        p_claim_token: uuid(claimToken, 'PACK088_CLAIM_TOKEN_INVALID'),
        p_block_state: String(state || ''),
        p_error_code: String(errorCode || '').slice(0, 200),
        p_pricing_snapshot: pricingSnapshot,
        p_permission_receipt: permissionReceipt,
        p_now: now
      });
      return rpcData(result, 'PACK088_EXECUTION_BLOCK_FAILED');
    },

    async bindTask({
      runId,
      claimToken,
      taskRunId,
      pricingSnapshot,
      permissionReceipt,
      now = new Date().toISOString()
    } = {}) {
      const result = await db.rpc('bind_workspace_schedule_run_task_pack088', {
        p_run_id: uuid(runId, 'PACK088_RUN_ID_INVALID'),
        p_claim_token: uuid(claimToken, 'PACK088_CLAIM_TOKEN_INVALID'),
        p_task_run_id: uuid(taskRunId, 'PACK088_TASK_RUN_ID_INVALID'),
        p_pricing_snapshot: pricingSnapshot,
        p_permission_receipt: permissionReceipt,
        p_now: now
      });
      return rpcData(result, 'PACK088_TASK_BIND_FAILED');
    },

    async findBrainTask({ ownerId, idempotencyKey } = {}) {
      const result = await db
        .from('zuvyr_task_runs')
        .select('id,user_id,idempotency_key,plan_version,queue_job_id,usage_record_id,state,error_code')
        .eq('user_id', uuid(ownerId, 'PACK088_OWNER_ID_INVALID'))
        .eq('idempotency_key', brainIdempotencyKey(idempotencyKey))
        .maybeSingle();

      if (result.error) throw executionRepoError('PACK088_BRAIN_TASK_LOOKUP_FAILED');
      return result.data || null;
    },

    async finalizeFromTask({
      taskRunId,
      taskState,
      fundingState,
      errorCode = null,
      now = new Date().toISOString()
    } = {}) {
      const result = await db.rpc('finalize_workspace_schedule_run_from_task_pack088', {
        p_task_run_id: uuid(taskRunId, 'PACK088_TASK_RUN_ID_INVALID'),
        p_task_state: String(taskState || ''),
        p_funding_state: String(fundingState || ''),
        p_error_code: errorCode == null ? null : String(errorCode).slice(0, 200),
        p_now: now
      });
      return rpcData(result, 'PACK088_TASK_FINALIZE_FAILED');
    }
  });
}

module.exports = {
  executionRepoError,
  brainIdempotencyKey,
  createAutomationExecutionRepository
};
