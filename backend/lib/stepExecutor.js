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
  defaultTimeoutMs = CONFIG.execution.defaultTimeoutMs,
  cancelPollMs = 250
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

  if (!Number.isSafeInteger(cancelPollMs) || cancelPollMs < 5) {
    throw executorError('STEP_EXECUTOR_CANCEL_POLL_INVALID');
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

      const executionSnapshot =
        typeof persistence.snapshot === 'function'
          ? await persistence.snapshot({
              userId,
              taskRunId
            })
          : null;

      const dependencyOutputs =
        executionSnapshot &&
        Array.isArray(executionSnapshot.steps)
          ? Object.fromEntries(
              (claim.dependsOn || []).map(stepKey => {
                const dependency =
                  executionSnapshot.steps.find(
                    item =>
                      (item.step_key || item.stepKey) ===
                      stepKey
                  );
                return [
                  stepKey,
                  dependency
                    ? dependency.output || null
                    : null
                ];
              })
            )
          : {};

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
      let cancellationRequested = false;
      let cancellationReason = null;
      let cancellationPollError = null;

      const cancellationEnabled =
        typeof persistence.cancelState === 'function' &&
        typeof persistence.finalizeCancellation === 'function';

      async function pollCancellation() {
        if (!cancellationEnabled || cancellationRequested) return;
        const state = await persistence.cancelState({
          userId,
          taskRunId
        });
        if (state && state.cancelRequested === true) {
          cancellationRequested = true;
          cancellationReason = state.reason || 'user_requested';
          if (activeController) activeController.abort();
        }
      }

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

      const cancellationTimer = cancellationEnabled
        ? setInterval(() => {
            if (cancellationRequested || cancellationPollError) return;
            Promise.resolve(pollCancellation()).catch(error => {
              cancellationPollError = error;
              if (activeController) activeController.abort();
            });
          }, cancelPollMs)
        : null;

      if (cancellationTimer && typeof cancellationTimer.unref === 'function') {
        cancellationTimer.unref();
      }

      if (cancellationEnabled) {
        await pollCancellation();
      }

      function stopTimers() {
        heartbeatStopped = true;
        clearInterval(heartbeat);
        if (cancellationTimer) clearInterval(cancellationTimer);
      }

      let output;
      try {
        output = await invokeWithTimeout({
          descriptor,
          timeoutMs: effectiveTimeout,
          onController(controller) {
            activeController = controller;
            if (cancellationRequested) controller.abort();
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
            taskPlan:
              executionSnapshot &&
              executionSnapshot.run
                ? executionSnapshot.run.plan || null
                : null,
            dependencyOutputs,
            idempotencyKey: effectKey
          }
        });

        if (heartbeatError) {
          throw executorError('STEP_EXECUTOR_LEASE_RENEWAL_FAILED');
        }
      } catch (error) {
        stopTimers();

        if (cancellationPollError) {
          throw cancellationPollError;
        }

        if (heartbeatError) {
          throw heartbeatError;
        }

        if (cancellationRequested && cancellationEnabled) {
          const cancelled = await persistence.finalizeCancellation({
            stepId: claim.stepId,
            workerOwner,
            leaseToken: claim.leaseToken,
            receipt: {
              version: 'pack-039.cancel-receipt.v1',
              phase: 'active_provider_abort',
              reason: cancellationReason || 'user_requested',
              effectKey,
              capability: claim.capability,
              attempt: claim.attempt,
              lateResultIgnored: false
            }
          });

          return Object.freeze({
            claimed: true,
            taskRunId,
            stepId: claim.stepId,
            stepKey: claim.stepKey,
            capability: claim.capability,
            state: cancelled.state || 'cancelled',
            cancelled: true,
            lateResultIgnored: false,
            effectKey
          });
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

      stopTimers();

      if (cancellationEnabled) {
        await pollCancellation();

        if (cancellationPollError) {
          throw cancellationPollError;
        }

        if (cancellationRequested) {
          const cancelled = await persistence.finalizeCancellation({
            stepId: claim.stepId,
            workerOwner,
            leaseToken: claim.leaseToken,
            receipt: {
              version: 'pack-039.cancel-receipt.v1',
              phase: 'late_result_ignored',
              reason: cancellationReason || 'user_requested',
              effectKey,
              capability: claim.capability,
              attempt: claim.attempt,
              lateResultIgnored: true
            }
          });

          return Object.freeze({
            claimed: true,
            taskRunId,
            stepId: claim.stepId,
            stepKey: claim.stepKey,
            capability: claim.capability,
            state: cancelled.state || 'cancelled',
            cancelled: true,
            lateResultIgnored: true,
            effectKey
          });
        }
      }

      if (
        output &&
        typeof output === 'object' &&
        output.deferred === true
      ) {
        if (typeof persistence.deferStep !== 'function') {
          throw executorError('STEP_EXECUTOR_DEFER_PERSISTENCE_REQUIRED');
        }

        const deferred = await persistence.deferStep({
          stepId: claim.stepId,
          workerOwner,
          leaseToken: claim.leaseToken,
          checkpoint: {
            phase: 'deferred',
            effectKey,
            capability: claim.capability,
            attempt: claim.attempt,
            reason: String(output.reason || 'approval_required').slice(0, 200),
            deferred: output.deferredContext && typeof output.deferredContext === 'object'
              ? output.deferredContext
              : {}
          }
        });

        return Object.freeze({
          claimed: true,
          taskRunId,
          stepId: claim.stepId,
          stepKey: claim.stepKey,
          capability: claim.capability,
          state: deferred.state || 'deferred',
          deferred: true,
          effectKey,
          output
        });
      }

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
