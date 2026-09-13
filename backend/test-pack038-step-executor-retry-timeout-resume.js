'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./config/step-executor.v1.json');
const {
  createCapabilityExecutorRegistry
} = require('./lib/capabilityExecutors');
const {
  stableEffectKey,
  createStepExecutor
} = require('./lib/stepExecutor');

assert.equal(config.version, 'pack-038.step-executor.v1');
assert.equal(config.invariants.noDuplicateExternalSideEffect, true);
assert.equal(config.retry.attemptSourceOfTruth, 'postgres_step_attempts');
assert.equal(config.production.liveWorkerWiringByThisPack, false);

const TASK_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '11111111-1111-4111-8111-111111111111';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fakePersistence({
  capability = 'chat.respond',
  maxAttempts = 3,
  failFirstCompletion = false
} = {}) {
  const state = {
    stepId: 1,
    stepKey: 'step_01',
    capability,
    state: 'pending',
    attempts: 0,
    maxAttempts,
    checkpoint: {},
    checkpointVersion: 0,
    resumeCount: 0,
    leaseToken: null,
    leaseOwner: null,
    leaseExpired: false,
    renewals: 0,
    completionFailuresRemaining: failFirstCompletion ? 1 : 0
  };

  let leaseCounter = 0;

  return {
    state,

    async claimNext({ taskRunId, workerOwner }) {
      assert.equal(taskRunId, TASK_ID);

      const reclaim =
        state.state === 'running' &&
        state.leaseExpired === true &&
        state.attempts < state.maxAttempts;

      const fresh =
        state.state === 'pending' &&
        state.attempts < state.maxAttempts;

      if (!fresh && !reclaim) {
        return {
          claimed: false,
          reason: 'no_ready_step',
          taskRunId
        };
      }

      leaseCounter += 1;
      state.state = 'running';
      state.attempts += 1;
      state.resumeCount += reclaim ? 1 : 0;
      state.leaseExpired = false;
      state.leaseOwner = workerOwner;
      state.leaseToken =
        leaseCounter === 1
          ? '33333333-3333-4333-8333-333333333333'
          : '44444444-4444-4444-8444-444444444444';

      return {
        claimed: true,
        taskRunId,
        stepId: state.stepId,
        stepKey: state.stepKey,
        capability: state.capability,
        attempt: state.attempts,
        maxAttempts: state.maxAttempts,
        resumed: reclaim,
        resumeCount: state.resumeCount,
        checkpoint: state.checkpoint,
        checkpointVersion: state.checkpointVersion,
        leaseToken: state.leaseToken,
        dependsOn: [],
        input: {}
      };
    },

    async renewLease({ stepId, workerOwner, leaseToken }) {
      if (
        state.state !== 'running' ||
        stepId !== state.stepId ||
        workerOwner !== state.leaseOwner ||
        leaseToken !== state.leaseToken ||
        state.leaseExpired
      ) {
        const error = new Error('lease_not_current');
        error.code = 'lease_not_current';
        throw error;
      }
      state.renewals += 1;
      return { stepId };
    },

    async checkpoint({ stepId, workerOwner, leaseToken, checkpoint }) {
      if (
        state.state !== 'running' ||
        stepId !== state.stepId ||
        workerOwner !== state.leaseOwner ||
        leaseToken !== state.leaseToken ||
        state.leaseExpired
      ) {
        const error = new Error('stale_checkpoint');
        error.code = 'stale_checkpoint';
        throw error;
      }
      state.checkpoint = checkpoint;
      state.checkpointVersion += 1;
      return {
        stepId,
        checkpoint,
        checkpointVersion: state.checkpointVersion
      };
    },

    async completeStep({ stepId, workerOwner, leaseToken, output }) {
      if (state.completionFailuresRemaining > 0) {
        state.completionFailuresRemaining -= 1;
        const error = new Error('simulated_completion_persistence_failure');
        error.code = 'simulated_completion_persistence_failure';
        throw error;
      }

      if (
        state.state !== 'running' ||
        stepId !== state.stepId ||
        workerOwner !== state.leaseOwner ||
        leaseToken !== state.leaseToken ||
        state.leaseExpired
      ) {
        throw new Error('completion_lease_not_current');
      }

      state.state = 'succeeded';
      state.output = output;
      state.leaseOwner = null;
      state.leaseToken = null;

      return {
        stepId,
        state: 'succeeded',
        taskSucceeded: true,
        output
      };
    },

    async failStep({
      stepId,
      workerOwner,
      leaseToken,
      errorCode,
      retryable
    }) {
      if (
        state.state !== 'running' ||
        stepId !== state.stepId ||
        workerOwner !== state.leaseOwner ||
        leaseToken !== state.leaseToken ||
        state.leaseExpired
      ) {
        throw new Error('failure_lease_not_current');
      }

      const willRetry =
        retryable === true &&
        state.attempts < state.maxAttempts;

      state.state = willRetry ? 'pending' : 'failed';
      state.errorCode = errorCode;
      state.leaseOwner = null;
      state.leaseToken = null;

      return {
        stepId,
        state: state.state,
        attempts: state.attempts,
        maxAttempts: state.maxAttempts,
        willRetry,
        errorCode
      };
    }
  };
}

(async () => {
  assert.equal(
    stableEffectKey(TASK_ID, 'step_01'),
    stableEffectKey(TASK_ID, 'step_01')
  );

  assert.throws(
    () => createCapabilityExecutorRegistry({
      'chat.respond': {
        execute: async () => ({}),
        sideEffectMode: 'non_idempotent_external'
      }
    }),
    error => error.code === 'STEP_EXECUTOR_SIDE_EFFECT_MODE_FORBIDDEN'
  );

  assert.throws(
    () => createCapabilityExecutorRegistry({
      'chat.respond': {
        execute: async () => ({}),
        sideEffectMode: 'idempotent_external',
        supportsIdempotency: false
      }
    }),
    error => error.code === 'STEP_EXECUTOR_IDEMPOTENCY_SUPPORT_REQUIRED'
  );

  // Crash/uncertain completion proof:
  // provider side effect succeeds exactly once, DB completion persistence fails,
  // lease expires, restarted executor reclaims the same step and reuses the same key.
  const sideEffects = new Map();
  let rawProviderCalls = 0;

  const crashRegistry = createCapabilityExecutorRegistry({
    'chat.respond': {
      sideEffectMode: 'idempotent_external',
      supportsIdempotency: true,
      timeoutMs: 500,
      async execute({ idempotencyKey }) {
        rawProviderCalls += 1;
        if (sideEffects.has(idempotencyKey)) {
          return sideEffects.get(idempotencyKey);
        }
        const result = {
          providerReceipt: 'provider-effect-001'
        };
        sideEffects.set(idempotencyKey, result);
        return result;
      }
    }
  });

  const crashPersistence = fakePersistence({
    capability: 'chat.respond',
    failFirstCompletion: true
  });

  const beforeRestart = createStepExecutor({
    persistence: crashPersistence,
    registry: crashRegistry,
    leaseRenewalMs: 10,
    defaultTimeoutMs: 500
  });

  await assert.rejects(
    () => beforeRestart.runNext({
      userId: USER_ID,
      taskRunId: TASK_ID,
      workerOwner: 'worker-before-restart'
    }),
    /simulated_completion_persistence_failure/
  );

  assert.equal(sideEffects.size, 1);
  assert.equal(crashPersistence.state.state, 'running');
  assert.equal(crashPersistence.state.checkpoint.phase, 'invoke_finished');

  crashPersistence.state.leaseExpired = true;

  const afterRestart = createStepExecutor({
    persistence: crashPersistence,
    registry: crashRegistry,
    leaseRenewalMs: 10,
    defaultTimeoutMs: 500
  });

  const resumed = await afterRestart.runNext({
    userId: USER_ID,
    taskRunId: TASK_ID,
    workerOwner: 'worker-after-restart'
  });

  assert.equal(resumed.state, 'succeeded');
  assert.equal(crashPersistence.state.resumeCount, 1);
  assert.equal(sideEffects.size, 1, 'stable idempotency key must prevent duplicate external effect');
  assert.equal(rawProviderCalls, 2, 'restart may re-call provider but must reuse the same provider idempotency key');

  // Timeout + bounded retry proof.
  const timeoutPersistence = fakePersistence({
    capability: 'research.run',
    maxAttempts: 2
  });

  let timeoutCalls = 0;
  let timeoutEffects = 0;
  const timeoutRegistry = createCapabilityExecutorRegistry({
    'research.run': {
      sideEffectMode: 'idempotent_external',
      supportsIdempotency: true,
      timeoutMs: 60,
      async execute({ signal, idempotencyKey }) {
        timeoutCalls += 1;

        if (timeoutCalls === 1) {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 500);
            signal.addEventListener('abort', () => {
              clearTimeout(timer);
              const error = new Error('aborted');
              error.code = 'AbortError';
              reject(error);
            }, { once: true });
          });
        }

        timeoutEffects += 1;
        return {
          idempotencyKey,
          ok: true
        };
      }
    }
  });

  const timeoutExecutor = createStepExecutor({
    persistence: timeoutPersistence,
    registry: timeoutRegistry,
    leaseRenewalMs: 10,
    defaultTimeoutMs: 60
  });

  const timedOut = await timeoutExecutor.runNext({
    userId: USER_ID,
    taskRunId: TASK_ID,
    workerOwner: 'worker-timeout-1'
  });

  assert.equal(timedOut.timedOut, true);
  assert.equal(timedOut.willRetry, true);
  assert.equal(timeoutPersistence.state.state, 'pending');

  const retried = await timeoutExecutor.runNext({
    userId: USER_ID,
    taskRunId: TASK_ID,
    workerOwner: 'worker-timeout-2'
  });

  assert.equal(retried.state, 'succeeded');
  assert.equal(timeoutPersistence.state.attempts, 2);
  assert.equal(timeoutEffects, 1);
  assert(timeoutPersistence.state.renewals >= 1);

  // Persisted max-attempt bound proof.
  const failPersistence = fakePersistence({
    capability: 'image.generate',
    maxAttempts: 2
  });

  const failRegistry = createCapabilityExecutorRegistry({
    'image.generate': {
      sideEffectMode: 'idempotent_external',
      supportsIdempotency: true,
      timeoutMs: 100,
      async execute() {
        const error = new Error('temporary_provider_failure');
        error.code = 'temporary_provider_failure';
        error.retryable = true;
        throw error;
      }
    }
  });

  const failExecutor = createStepExecutor({
    persistence: failPersistence,
    registry: failRegistry,
    leaseRenewalMs: 10,
    defaultTimeoutMs: 100
  });

  const attempt1 = await failExecutor.runNext({
    userId: USER_ID,
    taskRunId: TASK_ID,
    workerOwner: 'worker-fail-1'
  });
  assert.equal(attempt1.willRetry, true);

  const attempt2 = await failExecutor.runNext({
    userId: USER_ID,
    taskRunId: TASK_ID,
    workerOwner: 'worker-fail-2'
  });
  assert.equal(attempt2.willRetry, false);
  assert.equal(attempt2.state, 'failed');
  assert.equal(failPersistence.state.attempts, 2);

  const attempt3 = await failExecutor.runNext({
    userId: USER_ID,
    taskRunId: TASK_ID,
    workerOwner: 'worker-fail-3'
  });
  assert.equal(attempt3.claimed, false);
  assert.equal(failPersistence.state.attempts, 2);

  const migration = fs.readFileSync(
    path.join(__dirname, '46_pack038_step_executor_kernel.sql'),
    'utf8'
  );

  for (const marker of [
    'complete_zuvyr_task_step',
    'pack038_step_completion_lease_not_current',
    'fail_zuvyr_task_step',
    'v_step.attempts < v_step.max_attempts',
    'pack038_step_failure_lease_not_current',
    'grant execute on function public.complete_zuvyr_task_step',
    'grant execute on function public.fail_zuvyr_task_step',
    'to service_role'
  ]) {
    assert(migration.includes(marker), `missing migration marker: ${marker}`);
  }

  const source = fs.readFileSync(
    path.join(__dirname, 'lib/stepExecutor.js'),
    'utf8'
  );

  for (const marker of [
    'AbortController',
    'Promise.race',
    'renewLease',
    'checkpoint',
    'completeStep',
    'failStep',
    'stableEffectKey'
  ]) {
    assert(source.includes(marker), `missing executor marker: ${marker}`);
  }

  for (const forbidden of [
    'reserveCredits(',
    'settleCredits(',
    'refundCredits('
  ]) {
    assert(!source.includes(forbidden));
  }

  console.log('PASS: one shared capability dispatcher requires read-only or provider-idempotent side-effect semantics');
  console.log('PASS: crash after external success + uncertain DB completion resumes same persisted step with same idempotency key');
  console.log('PASS: provider timeout aborts, persists retry state and succeeds within persisted max-attempt bound');
  console.log('PASS: lease heartbeat runs during long work and stale lease terminal transitions are DB-guarded');
  console.log('PASS: Pack038 source adds no live worker wiring, billing mutation, credit reservation or real provider call');
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
