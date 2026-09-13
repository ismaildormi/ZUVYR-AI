'use strict';

const crypto = require('crypto');
const CONFIG = require('../config/step-executor.v1.json');

function executorError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function stableEffectKey(taskRunId, stepKey) {
  return crypto
    .createHash('sha256')
    .update(`${String(taskRunId)}:${String(stepKey)}`, 'utf8')
    .digest('hex');
}

function normalizeTimeout(value, fallback = CONFIG.execution.defaultTimeoutMs) {
  const timeoutMs = value == null ? fallback : Number(value);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < CONFIG.execution.minTimeoutMs ||
    timeoutMs > CONFIG.execution.maxTimeoutMs
  ) {
    throw executorError('STEP_EXECUTOR_TIMEOUT_INVALID');
  }
  return timeoutMs;
}

function makeTimeoutError() {
  const error = new Error('STEP_EXECUTOR_PROVIDER_TIMEOUT');
  error.code = 'STEP_EXECUTOR_PROVIDER_TIMEOUT';
  error.retryable = true;
  return error;
}

function errorCode(error) {
  const candidate = String(error && (error.code || error.name) || 'STEP_EXECUTOR_FAILED')
    .trim()
    .slice(0, 200);
  return candidate || 'STEP_EXECUTOR_FAILED';
}

function safeToRetry(descriptor, error) {
  if (!descriptor.retryable) return false;
  if (
    descriptor.sideEffectMode !== 'read_only' &&
    descriptor.sideEffectMode !== 'idempotent_external'
  ) return false;

  return (
    error &&
    (
      error.code === 'STEP_EXECUTOR_PROVIDER_TIMEOUT' ||
      error.retryable === true
    )
  );
}

async function invokeWithTimeout({
  descriptor,
  context,
  timeoutMs,
  onController = null
}) {
  const controller = new AbortController();
  if (typeof onController === 'function') onController(controller);

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(makeTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() => descriptor.execute({
        ...context,
        signal: controller.signal
      })),
      timeoutPromise
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function createStepExecutor({
  persistence,
  registry,
  leaseRenewalMs = CONFIG.execution.leaseRenewalMs,
  defaultTimeoutMs = CONFIG.execution.defaultTimeoutMs
} = {}) {
  if (
    !persistence ||
    typeof persistence.claimNext !== 'function' ||
    typeof persistence.renewLease !== 'function' ||
    typeof persistence.checkpoint !== 'function' ||
    typeof persistence.completeStep !== 'function' ||
    typeof persistence.failStep !== 'function'
  ) {
    throw executorError('STEP_EXECUTOR_PERSISTENCE_CONTRACT_REQUIRED');
  }

  if (!registry || typeof registry.get !== 'function') {
    throw executorError('STEP_EXECUTOR_REGISTRY_REQUIRED');
  }

  if (!Number.isSafeInteger(leaseRenewalMs) || leaseRenewalMs < 5) {
    throw executorError('STEP_EXECUTOR_LEASE_RENEWAL_INVALID');
  }

  return Object.freeze({
    async runNext({
      userId,
      taskRunId,
      workerOwner,
      timeoutMs = null
    } = {}) {
      const claim = await persistence.claimNext({
        userId,
        taskRunId,
        workerOwner
      });

      if (!claim || claim.claimed !== true) {
        return Object.freeze({
          claimed: false,
          reason: claim && claim.reason || 'no_ready_step',
          taskRunId
        });
      }

      const descriptor = registry.get(claim.capability);
      const effectiveTimeout = normalizeTimeout(
        timeoutMs == null ? descriptor.timeoutMs : timeoutMs,
        defaultTimeoutMs
      );
      const effectKey = stableEffectKey(taskRunId, claim.stepKey);

      await persistence.checkpoint({
        stepId: claim.stepId,
        workerOwner,
        leaseToken: claim.leaseToken,
        checkpoint: {
          phase: 'invoke_started',
          effectKey,
          capability: claim.capability,
          attempt: claim.attempt
        }
      });

      let heartbeatStopped = false;
      let heartbeatError = null;
      let activeController = null;

      const heartbeat = setInterval(() => {
        if (heartbeatStopped || heartbeatError) return;
        Promise.resolve(
          persistence.renewLease({
            stepId: claim.stepId,
            workerOwner,
            leaseToken: claim.leaseToken
          })
        ).catch(error => {
          heartbeatError = error;
          if (activeController) activeController.abort();
        });
      }, leaseRenewalMs);

      if (typeof heartbeat.unref === 'function') heartbeat.unref();

      let output;
      try {
        output = await invokeWithTimeout({
          descriptor,
          timeoutMs: effectiveTimeout,
          onController(controller) {
            activeController = controller;
          },
          context: {
            taskRunId,
            stepId: claim.stepId,
            stepKey: claim.stepKey,
            capability: claim.capability,
            attempt: claim.attempt,
            maxAttempts: claim.maxAttempts,
            resumed: claim.resumed === true,
            resumeCount: claim.resumeCount || 0,
            priorCheckpoint: claim.checkpoint || {},
            dependencyStepKeys: claim.dependsOn || [],
            input: claim.input || {},
            idempotencyKey: effectKey
          }
        });

        if (heartbeatError) {
          throw executorError('STEP_EXECUTOR_LEASE_RENEWAL_FAILED');
        }
      } catch (error) {
        heartbeatStopped = true;
        clearInterval(heartbeat);

        if (heartbeatError) {
          throw heartbeatError;
        }

        const retryable = safeToRetry(descriptor, error);
        const failed = await persistence.failStep({
          stepId: claim.stepId,
          workerOwner,
          leaseToken: claim.leaseToken,
          errorCode: errorCode(error),
          retryable
        });

        return Object.freeze({
          claimed: true,
          taskRunId,
          stepId: claim.stepId,
          stepKey: claim.stepKey,
          capability: claim.capability,
          state: failed.state,
          willRetry: failed.willRetry === true,
          timedOut: error && error.code === 'STEP_EXECUTOR_PROVIDER_TIMEOUT',
          errorCode: errorCode(error),
          effectKey
        });
      }

      heartbeatStopped = true;
      clearInterval(heartbeat);

      await persistence.checkpoint({
        stepId: claim.stepId,
        workerOwner,
        leaseToken: claim.leaseToken,
        checkpoint: {
          phase: 'invoke_finished',
          effectKey,
          capability: claim.capability,
          attempt: claim.attempt
        }
      });

      // Intentionally outside the handler-error path:
      // if completion persistence is uncertain, do not mark the step pending.
      // Leave the running lease to expire so a restarted worker reclaims the same
      // persisted step and reuses the same stable idempotency key.
      const completed = await persistence.completeStep({
        stepId: claim.stepId,
        workerOwner,
        leaseToken: claim.leaseToken,
        output: output == null ? null : output
      });

      return Object.freeze({
        claimed: true,
        taskRunId,
        stepId: claim.stepId,
        stepKey: claim.stepKey,
        capability: claim.capability,
        state: completed.state,
        taskSucceeded: completed.taskSucceeded === true,
        effectKey,
        output: output == null ? null : output
      });
    }
  });
}

module.exports = {
  CONFIG,
  stableEffectKey,
  createStepExecutor
};
