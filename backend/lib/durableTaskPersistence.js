'use strict';

const CONFIG = require('../config/durable-task-kernel.v1.json');
const { assertConsentCurrent } = require('./planQuoteConsent');

function persistenceError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function required(value, code, max = 500) {
  const text = value == null ? '' : String(value).trim();
  if (!text || text.length > max) throw persistenceError(code);
  return text;
}

function uuid(value, code) {
  const text = required(value, code, 64);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw persistenceError(code);
  }
  return text;
}

function normalizeRpcResult(name, result) {
  if (!result || typeof result !== 'object') {
    throw persistenceError('DURABLE_TASK_RPC_RESULT_INVALID', { name });
  }
  if (result.error) {
    throw persistenceError('DURABLE_TASK_RPC_FAILED', {
      name,
      code: result.error.code || null
    });
  }
  if (result.data == null) {
    throw persistenceError('DURABLE_TASK_RPC_DATA_MISSING', { name });
  }
  return result.data;
}

function createDurableTaskPersistence({ client } = {}) {
  if (!client || typeof client.rpc !== 'function') {
    throw persistenceError('DURABLE_TASK_DB_CLIENT_REQUIRED');
  }

  async function rpc(name, params) {
    return normalizeRpcResult(name, await client.rpc(name, params));
  }

  return Object.freeze({
    async createOrGetTask({
      userId,
      idempotencyKey,
      plan,
      quote,
      consent
    } = {}) {
      const owner = uuid(userId, 'DURABLE_TASK_USER_ID_INVALID');
      const key = required(
        idempotencyKey,
        'DURABLE_TASK_IDEMPOTENCY_KEY_INVALID',
        CONFIG.task.maxIdempotencyCharacters
      );

      if (key.length < 8) {
        throw persistenceError('DURABLE_TASK_IDEMPOTENCY_KEY_INVALID');
      }

      const current = assertConsentCurrent({ plan, quote, consent });
      if (current.current !== true) {
        throw persistenceError('DURABLE_TASK_CONSENT_NOT_CURRENT');
      }

      return rpc('create_or_get_zuvyr_task_run', {
        p_user_id: owner,
        p_idempotency_key: key,
        p_plan_version: current.planVersion,
        p_intent: required(
          plan.goal,
          'DURABLE_TASK_INTENT_INVALID',
          CONFIG.task.intentMaxCharacters
        ),
        p_plan: plan,
        p_quote_fingerprint: current.quoteFingerprint,
        p_consent_fingerprint: current.consentFingerprint,
        p_steps: plan.steps
      });
    },

    async bindQueueJob({ userId, taskRunId, queueJobId } = {}) {
      return rpc('bind_zuvyr_task_queue_job', {
        p_task_run_id: uuid(taskRunId, 'DURABLE_TASK_RUN_ID_INVALID'),
        p_user_id: uuid(userId, 'DURABLE_TASK_USER_ID_INVALID'),
        p_queue_job_id: required(queueJobId, 'DURABLE_TASK_QUEUE_JOB_ID_INVALID', 200)
      });
    },

    async snapshot({ userId, taskRunId } = {}) {
      return rpc('get_zuvyr_task_snapshot', {
        p_task_run_id: uuid(taskRunId, 'DURABLE_TASK_RUN_ID_INVALID'),
        p_user_id: uuid(userId, 'DURABLE_TASK_USER_ID_INVALID')
      });
    },

    async claimNext({
      userId,
      taskRunId,
      workerOwner,
      leaseSeconds = CONFIG.step.leaseSeconds
    } = {}) {
      return rpc('claim_next_zuvyr_task_step', {
        p_task_run_id: uuid(taskRunId, 'DURABLE_TASK_RUN_ID_INVALID'),
        p_user_id: uuid(userId, 'DURABLE_TASK_USER_ID_INVALID'),
        p_worker_owner: required(workerOwner, 'DURABLE_TASK_WORKER_OWNER_INVALID', 200),
        p_lease_seconds: leaseSeconds
      });
    },

    async renewLease({
      stepId,
      workerOwner,
      leaseToken,
      leaseSeconds = CONFIG.step.leaseSeconds
    } = {}) {
      if (!Number.isSafeInteger(stepId) || stepId < 1) {
        throw persistenceError('DURABLE_TASK_STEP_ID_INVALID');
      }

      return rpc('renew_zuvyr_task_step_lease', {
        p_step_id: stepId,
        p_worker_owner: required(workerOwner, 'DURABLE_TASK_WORKER_OWNER_INVALID', 200),
        p_lease_token: uuid(leaseToken, 'DURABLE_TASK_LEASE_TOKEN_INVALID'),
        p_lease_seconds: leaseSeconds
      });
    },

    async completeStep({
      stepId,
      workerOwner,
      leaseToken,
      output
    } = {}) {
      if (!Number.isSafeInteger(stepId) || stepId < 1) {
        throw persistenceError('DURABLE_TASK_STEP_ID_INVALID');
      }

      return rpc('complete_zuvyr_task_step', {
        p_step_id: stepId,
        p_worker_owner: required(workerOwner, 'DURABLE_TASK_WORKER_OWNER_INVALID', 200),
        p_lease_token: uuid(leaseToken, 'DURABLE_TASK_LEASE_TOKEN_INVALID'),
        p_output: output == null ? null : output
      });
    },

    async failStep({
      stepId,
      workerOwner,
      leaseToken,
      errorCode,
      retryable = false
    } = {}) {
      if (!Number.isSafeInteger(stepId) || stepId < 1) {
        throw persistenceError('DURABLE_TASK_STEP_ID_INVALID');
      }

      return rpc('fail_zuvyr_task_step', {
        p_step_id: stepId,
        p_worker_owner: required(workerOwner, 'DURABLE_TASK_WORKER_OWNER_INVALID', 200),
        p_lease_token: uuid(leaseToken, 'DURABLE_TASK_LEASE_TOKEN_INVALID'),
        p_error_code: required(errorCode, 'DURABLE_TASK_ERROR_CODE_INVALID', 200),
        p_retryable: retryable === true
      });
    },


    async checkpoint({
      stepId,
      workerOwner,
      leaseToken,
      checkpoint
    } = {}) {
      if (!Number.isSafeInteger(stepId) || stepId < 1) {
        throw persistenceError('DURABLE_TASK_STEP_ID_INVALID');
      }
      if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
        throw persistenceError('DURABLE_TASK_CHECKPOINT_INVALID');
      }

      return rpc('checkpoint_zuvyr_task_step', {
        p_step_id: stepId,
        p_worker_owner: required(workerOwner, 'DURABLE_TASK_WORKER_OWNER_INVALID', 200),
        p_lease_token: uuid(leaseToken, 'DURABLE_TASK_LEASE_TOKEN_INVALID'),
        p_checkpoint: checkpoint
      });
    }
  });
}

module.exports = {
  CONFIG,
  createDurableTaskPersistence
};
