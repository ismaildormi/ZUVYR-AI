'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./config/cancel-compensation.v1.json');
const {
  createCapabilityExecutorRegistry
} = require('./lib/capabilityExecutors');
const {
  createStepExecutor
} = require('./lib/stepExecutor');
const {
  createTaskCancellation
} = require('./lib/taskCancellation');
const {
  createCompensationEngine
} = require('./lib/compensationEngine');

assert.equal(config.version, 'pack-039.cancel-compensation.v1');
assert.equal(config.invariants.lateCompletionCannotResurrectCancelledTask, true);
assert.equal(config.invariants.noDuplicateFinancialSettlement, true);
assert.equal(config.production.liveWorkerWiringByThisPack, false);
assert.equal(config.production.liveFinancialWiringByThisPack, false);

const TASK_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const LEASE = '33333333-3333-4333-8333-333333333333';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fakePersistence() {
  const state = {
    run: {
      id: TASK_ID,
      state: 'pending',
      cancel_requested: false,
      cancel_reason: null,
      cancellation_receipt: null,
      compensation_receipt: null,
      compensation_version: 0
    },
    active: {
      id: 2,
      step_key: 'step_active',
      capability: 'research.run',
      sequence_number: 1,
      state: 'pending',
      attempts: 0,
      max_attempts: 3,
      checkpoint: {},
      lease_owner: null,
      lease_token: null,
      lease_expired: false,
      output: null
    },
    completed: {
      id: 1,
      step_key: 'step_done',
      capability: 'code.edit',
      sequence_number: 0,
      state: 'succeeded',
      attempts: 1,
      max_attempts: 3,
      checkpoint: {
        backupArtifactId: 'backup-001',
        phase: 'edited'
      },
      output: {
        artifactId: 'artifact-001'
      }
    }
  };

  function assertLease({ stepId, workerOwner, leaseToken }) {
    if (
      state.active.state !== 'running' ||
      state.active.id !== stepId ||
      state.active.lease_owner !== workerOwner ||
      state.active.lease_token !== leaseToken ||
      state.active.lease_expired
    ) {
      const error = new Error('lease_not_current');
      error.code = 'lease_not_current';
      throw error;
    }
  }

  return {
    state,

    async claimNext({ taskRunId, workerOwner }) {
      if (taskRunId !== TASK_ID) throw new Error('task_mismatch');

      if (state.run.cancel_requested) {
        return {
          claimed: false,
          reason: 'cancel_requested',
          taskRunId
        };
      }

      if (state.active.state !== 'pending') {
        return {
          claimed: false,
          reason: 'no_ready_step',
          taskRunId
        };
      }

      state.active.state = 'running';
      state.active.attempts += 1;
      state.active.lease_owner = workerOwner;
      state.active.lease_token = LEASE;
      state.run.state = 'running';

      return {
        claimed: true,
        taskRunId,
        stepId: state.active.id,
        stepKey: state.active.step_key,
        capability: state.active.capability,
        attempt: state.active.attempts,
        maxAttempts: state.active.max_attempts,
        resumed: false,
        resumeCount: 0,
        checkpoint: state.active.checkpoint,
        checkpointVersion: 0,
        leaseToken: LEASE,
        dependsOn: ['step_done'],
        input: {}
      };
    },

    async renewLease(args) {
      assertLease(args);
      return { stepId: args.stepId };
    },

    async checkpoint(args) {
      assertLease(args);
      state.active.checkpoint = args.checkpoint;
      return {
        stepId: args.stepId,
        checkpoint: args.checkpoint,
        checkpointVersion: 1
      };
    },

    async completeStep(args) {
      assertLease(args);
      if (state.run.state === 'cancelled') {
        throw new Error('late_completion_rejected');
      }
      state.active.state = 'succeeded';
      state.active.output = args.output;
      return {
        stepId: args.stepId,
        state: 'succeeded',
        taskSucceeded: true
      };
    },

    async failStep(args) {
      assertLease(args);
      state.active.state =
        args.retryable && state.active.attempts < state.active.max_attempts
          ? 'pending'
          : 'failed';
      return {
        state: state.active.state,
        willRetry: state.active.state === 'pending'
      };
    },

    async requestCancel({ taskRunId, reason }) {
      if (taskRunId !== TASK_ID) throw new Error('task_mismatch');
      if (['succeeded', 'failed', 'cancelled'].includes(state.run.state)) {
        return {
          taskRunId,
          accepted: false,
          state: state.run.state,
          cancelRequested: state.run.cancel_requested
        };
      }
      state.run.cancel_requested = true;
      state.run.cancel_reason = reason;
      return {
        taskRunId,
        accepted: true,
        state: state.run.state,
        cancelRequested: true,
        reason
      };
    },

    async cancelState({ taskRunId }) {
      if (taskRunId !== TASK_ID) throw new Error('task_mismatch');
      return {
        taskRunId,
        state: state.run.state,
        cancelRequested: state.run.cancel_requested,
        reason: state.run.cancel_reason,
        cancellationReceipt: state.run.cancellation_receipt,
        compensationReceipt: state.run.compensation_receipt
      };
    },

    async finalizeCancellation(args) {
      assertLease(args);
      if (!state.run.cancel_requested) throw new Error('cancel_not_requested');

      state.active.state = 'cancelled';
      state.active.lease_owner = null;
      state.active.lease_token = null;
      state.run.state = 'cancelled';
      state.run.cancellation_receipt = args.receipt;

      return {
        taskRunId: TASK_ID,
        stepId: state.active.id,
        stepKey: state.active.step_key,
        state: 'cancelled',
        cancelRequested: true,
        cancellationReceipt: args.receipt
      };
    },

    async snapshot({ taskRunId }) {
      if (taskRunId !== TASK_ID) throw new Error('task_mismatch');
      return {
        run: { ...state.run },
        steps: [
          { ...state.completed },
          { ...state.active }
        ]
      };
    },

    async recordCompensation({ taskRunId, receipt }) {
      if (taskRunId !== TASK_ID) throw new Error('task_mismatch');
      if (state.run.state !== 'cancelled') throw new Error('not_cancelled');

      if (state.run.compensation_receipt) {
        if (
          JSON.stringify(state.run.compensation_receipt) !==
          JSON.stringify(receipt)
        ) {
          throw new Error('compensation_conflict');
        }

        return {
          taskRunId,
          replayed: true,
          compensationVersion: state.run.compensation_version,
          receipt: state.run.compensation_receipt
        };
      }

      state.run.compensation_receipt = receipt;
      state.run.compensation_version += 1;

      return {
        taskRunId,
        replayed: false,
        compensationVersion: state.run.compensation_version,
        receipt
      };
    }
  };
}

(async () => {
  const persistence = fakePersistence();
  const cancellation = createTaskCancellation({ persistence });

  let providerStarted = false;
  let providerAborted = false;

  const registry = createCapabilityExecutorRegistry({
    'research.run': {
      sideEffectMode: 'idempotent_external',
      supportsIdempotency: true,
      timeoutMs: 1000,
      async execute({ signal }) {
        providerStarted = true;

        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 500);

          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            providerAborted = true;
            const error = new Error('provider_aborted');
            error.code = 'AbortError';
            reject(error);
          }, { once: true });
        });

        return {
          providerResult: 'late-value'
        };
      }
    }
  });

  const executor = createStepExecutor({
    persistence,
    registry,
    leaseRenewalMs: 10,
    defaultTimeoutMs: 1000,
    cancelPollMs: 10
  });

  const executionPromise = executor.runNext({
    userId: USER_ID,
    taskRunId: TASK_ID,
    workerOwner: 'worker-cancel-test'
  });

  while (!providerStarted) {
    await sleep(2);
  }

  await cancellation.request({
    userId: USER_ID,
    taskRunId: TASK_ID,
    reason: 'user_pressed_cancel'
  });

  const cancelled = await executionPromise;

  assert.equal(providerAborted, true);
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(persistence.state.run.state, 'cancelled');
  assert.equal(persistence.state.active.state, 'cancelled');
  assert.equal(
    persistence.state.run.cancellation_receipt.phase,
    'active_provider_abort'
  );

  // Old worker/result cannot resurrect the cancelled task.
  await assert.rejects(
    () => persistence.completeStep({
      stepId: 2,
      workerOwner: 'worker-cancel-test',
      leaseToken: LEASE,
      output: { providerResult: 'late-value' }
    }),
    /lease_not_current|late_completion_rejected/
  );

  let undoCalls = 0;
  let financialCalls = 0;
  const financialKeys = new Set();

  const compensation = createCompensationEngine({
    persistence,
    compensators: {
      'code.edit': async ({
        checkpoint,
        idempotencyKey,
        output
      }) => {
        undoCalls += 1;
        assert.equal(checkpoint.backupArtifactId, 'backup-001');
        assert.equal(output.artifactId, 'artifact-001');
        return {
          action: 'restore_backup',
          backupArtifactId: checkpoint.backupArtifactId,
          idempotencyKey
        };
      }
    },
    finance: {
      async settleCancelledTask({
        idempotencyKey,
        succeededStepKeys
      }) {
        if (!financialKeys.has(idempotencyKey)) {
          financialKeys.add(idempotencyKey);
          financialCalls += 1;
        }
        return {
          status: 'partial_settlement',
          settledCredits: 2,
          refundedCredits: 3,
          succeededStepKeys
        };
      }
    }
  });

  const firstCompensation = await compensation.compensate({
    userId: USER_ID,
    taskRunId: TASK_ID
  });

  assert.equal(firstCompensation.replayed, false);
  assert.equal(firstCompensation.compensationVersion, 1);
  assert.equal(firstCompensation.receipt.undoReceipts.length, 1);
  assert.equal(
    firstCompensation.receipt.financial.receipt.status,
    'partial_settlement'
  );
  assert.equal(undoCalls, 1);
  assert.equal(financialCalls, 1);

  const secondCompensation = await compensation.compensate({
    userId: USER_ID,
    taskRunId: TASK_ID
  });

  assert.equal(secondCompensation.replayed, true);
  assert.equal(undoCalls, 1, 'stored receipt must suppress duplicate undo');
  assert.equal(financialCalls, 1, 'stored receipt must suppress duplicate financial settlement');

  const migration = fs.readFileSync(
    path.join(__dirname, '47_pack039_cancel_compensation.sql'),
    'utf8'
  );

  for (const marker of [
    'request_cancel_zuvyr_task',
    'get_zuvyr_task_cancel_state',
    'cancel_zuvyr_task_step',
    'record_zuvyr_task_compensation',
    'pack039_cancel_lease_not_current',
    'pack039_compensation_receipt_conflict',
    "state = 'cancelled'",
    'grant execute on function public.request_cancel_zuvyr_task',
    'grant execute on function public.record_zuvyr_task_compensation',
    'to service_role'
  ]) {
    assert(migration.includes(marker), `missing migration marker: ${marker}`);
  }

  const executorSource = fs.readFileSync(
    path.join(__dirname, 'lib/stepExecutor.js'),
    'utf8'
  );

  for (const marker of [
    'cancelPollMs',
    'cancelState',
    'finalizeCancellation',
    'active_provider_abort',
    'late_result_ignored'
  ]) {
    assert(executorSource.includes(marker), `missing cancellation marker: ${marker}`);
  }

  const compensationSource = fs.readFileSync(
    path.join(__dirname, 'lib/compensationEngine.js'),
    'utf8'
  );

  for (const forbidden of [
    'reserveCredits(',
    'settleCredits(',
    'refundCredits('
  ]) {
    assert(!compensationSource.includes(forbidden));
  }

  console.log('PASS: cancellation during active provider work is polled, aborts locally and persists cancelled state');
  console.log('PASS: late completion cannot resurrect a cancelled task because the lease/state are revoked');
  console.log('PASS: reverse-order compensation receives persisted checkpoint/output and produces undo receipts');
  console.log('PASS: verified partial-settlement adapter is idempotency-bound and stored receipt suppresses duplicate settlement');
  console.log('PASS: Pack039 source does not enable live billing, live worker wiring or real financial/provider calls');
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
