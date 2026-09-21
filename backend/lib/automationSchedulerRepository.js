'use strict';

function repositoryError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function rpcData(result, code) {
  if (!result || typeof result !== 'object' || result.error) {
    throw repositoryError(code, {
      databaseCode: result && result.error ? result.error.code || null : null,
      databaseMessage: result && result.error ? result.error.message || null : null
    });
  }
  return result.data;
}

function normalizeRun(row = {}) {
  return Object.freeze({
    runId: row.run_id,
    ownerId: row.owner_id,
    scheduleId: row.schedule_id,
    workflowId: row.workflow_id,
    workflowRevision: Number(row.workflow_revision),
    scheduleRevision: Number(row.schedule_revision),
    occurrenceKey: String(row.occurrence_key || ''),
    scheduledFor: row.scheduled_for,
    runState: row.run_state || row.state || 'pending',
    created: row.created === true,
    dispatchAttemptCount: Number(row.dispatch_attempt_count || 0)
  });
}

function createAutomationSchedulerRepository({ client } = {}) {
  const db = client || require('./supabaseAdmin').supabaseAdmin;
  if (!db || typeof db.rpc !== 'function') {
    throw repositoryError('PACK088_DATABASE_CLIENT_REQUIRED');
  }

  return Object.freeze({
    async claimDue({ limit = 25, now = new Date().toISOString() } = {}) {
      const result = await db.rpc('claim_due_workspace_schedules_pack088', {
        p_limit: limit,
        p_now: now
      });
      const rows = rpcData(result, 'PACK088_DUE_CLAIM_FAILED') || [];
      return rows.map(normalizeRun);
    },

    async listPending({ limit = 100 } = {}) {
      const result = await db.rpc('list_pending_workspace_schedule_runs_pack088', {
        p_limit: limit
      });
      const rows = rpcData(result, 'PACK088_PENDING_LIST_FAILED') || [];
      return rows.map(normalizeRun);
    },

    async markQueued({ runId, queueJobId, now = new Date().toISOString() } = {}) {
      const result = await db.rpc('mark_workspace_schedule_run_queued_pack088', {
        p_run_id: runId,
        p_queue_job_id: queueJobId,
        p_now: now
      });
      return rpcData(result, 'PACK088_MARK_QUEUED_FAILED');
    },

    async markDispatchError({ runId, errorCode, now = new Date().toISOString() } = {}) {
      const result = await db.rpc('mark_workspace_schedule_run_dispatch_error_pack088', {
        p_run_id: runId,
        p_error_code: String(errorCode || 'pack088_dispatch_failed').slice(0, 200),
        p_now: now
      });
      return rpcData(result, 'PACK088_MARK_DISPATCH_ERROR_FAILED');
    }
  });
}

module.exports = {
  repositoryError,
  normalizeRun,
  createAutomationSchedulerRepository
};
