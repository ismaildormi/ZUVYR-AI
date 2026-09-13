'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./config/durable-task-kernel.v1.json');
const { normalizeUniversalRequest } = require('./lib/universalRequest');
const { extractRequirements } = require('./lib/requirementExtractor');
const { createIntentLock } = require('./lib/intentLock');
const { createBrainPlan } = require('./lib/brainPlanner');
const {
  buildPlanQuote,
  createConsent
} = require('./lib/planQuoteConsent');
const {
  createDurableTaskPersistence
} = require('./lib/durableTaskPersistence');
const {
  durableTaskJobId,
  createDurableTaskQueue,
  enqueueDurableTask
} = require('./lib/durableTaskQueue');

assert.equal(config.version, 'pack-037.durable-task-kernel.v1');
assert.equal(config.invariants.dbIsTaskSourceOfTruth, true);
assert.equal(config.invariants.restartReusesPersistedTask, true);
assert.equal(config.queue.persistenceSourceOfTruth, 'postgres');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';
const LEASE_1 = '33333333-3333-4333-8333-333333333333';
const LEASE_2 = '44444444-4444-4444-8444-444444444444';

function buildApprovedPlan() {
  const request = normalizeUniversalRequest({
    schemaVersion: '1.0',
    requestId: 'pack037-code-001',
    surface: 'code',
    goal: 'Persist and resume this exact approved code task',
    inputs: {},
    constraints: { hard: ['No duplicate side effects'] },
    outputs: {},
    contextRefs: [],
    language: {},
    risk: {},
    budget: {},
    clientState: {}
  });
  const extraction = extractRequirements(request);
  const intentLock = createIntentLock(request, extraction);
  const plan = createBrainPlan({ request, extraction, intentLock });

  const stepQuotes = plan.steps.map((step, index) => ({
    stepId: step.id,
    capability: step.capability,
    estimatedCredits: '0',
    estimatedCostMicroUsd: '0',
    estimatedDurationMs: 1000 + index,
    riskLevel: 'low',
    pricingVerified: true,
    pricingVersion: 'pack037-fixture-v1',
    pricingSource: `fixture:${step.capability}`
  }));

  const quote = buildPlanQuote({ plan, stepQuotes });
  const consent = createConsent({ plan, quote, approved: true });
  return { request, plan, quote, consent };
}

function makeFakeDb() {
  const state = {
    task: null,
    steps: [],
    queueJobId: null,
    leaseCounter: 0,
    expired: false
  };

  function error(message) {
    return { data: null, error: { code: message } };
  }

  return {
    state,
    client: {
      async rpc(name, params) {
        if (name === 'create_or_get_zuvyr_task_run') {
          if (!state.task) {
            state.task = {
              id: TASK_ID,
              userId: params.p_user_id,
              idempotencyKey: params.p_idempotency_key,
              planVersion: params.p_plan_version,
              plan: params.p_plan,
              quoteFingerprint: params.p_quote_fingerprint,
              consentFingerprint: params.p_consent_fingerprint,
              state: 'pending'
            };
            state.steps = params.p_steps.map((step, index) => ({
              id: index + 1,
              stepKey: step.id,
              capability: step.capability,
              sequenceNumber: index,
              state: 'pending',
              attempts: 0,
              maxAttempts: 3,
              dependsOn: step.dependsOn,
              checkpoint: {},
              checkpointVersion: 0,
              resumeCount: 0,
              leaseOwner: null,
              leaseToken: null
            }));
            return {
              data: {
                taskRunId: TASK_ID,
                created: true,
                state: 'pending',
                planVersion: params.p_plan_version,
                idempotencyKey: params.p_idempotency_key
              },
              error: null
            };
          }

          if (
            state.task.userId !== params.p_user_id ||
            state.task.idempotencyKey !== params.p_idempotency_key ||
            state.task.planVersion !== params.p_plan_version ||
            JSON.stringify(state.task.plan) !== JSON.stringify(params.p_plan) ||
            state.task.quoteFingerprint !== params.p_quote_fingerprint ||
            state.task.consentFingerprint !== params.p_consent_fingerprint
          ) {
            return error('pack037_idempotency_conflict');
          }

          return {
            data: {
              taskRunId: state.task.id,
              created: false,
              state: state.task.state,
              planVersion: state.task.planVersion,
              idempotencyKey: state.task.idempotencyKey
            },
            error: null
          };
        }

        if (name === 'bind_zuvyr_task_queue_job') {
          if (!state.task || params.p_task_run_id !== state.task.id) {
            return error('pack037_task_not_found');
          }
          if (state.queueJobId && state.queueJobId !== params.p_queue_job_id) {
            return error('pack037_queue_job_conflict');
          }
          state.queueJobId = params.p_queue_job_id;
          return {
            data: {
              taskRunId: state.task.id,
              queueJobId: state.queueJobId
            },
            error: null
          };
        }

        if (name === 'get_zuvyr_task_snapshot') {
          if (
            !state.task ||
            params.p_task_run_id !== state.task.id ||
            params.p_user_id !== state.task.userId
          ) {
            return error('pack037_task_not_found');
          }
          return {
            data: {
              run: { ...state.task, queueJobId: state.queueJobId },
              steps: state.steps.map(step => ({ ...step }))
            },
            error: null
          };
        }

        if (name === 'claim_next_zuvyr_task_step') {
          if (!state.task || params.p_task_run_id !== state.task.id) {
            return error('pack037_task_not_found');
          }

          const eligible = state.steps
            .filter(item => {
              const leaseEligible =
                item.state === 'pending' ||
                (item.state === 'running' && state.expired);

              if (!leaseEligible || item.attempts >= item.maxAttempts) {
                return false;
              }

              return item.dependsOn.every(key => {
                const dependency = state.steps.find(
                  candidate => candidate.stepKey === key
                );
                return dependency && dependency.state === 'succeeded';
              });
            })
            .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

          const step = eligible[0] || null;
          const resumed = Boolean(
            step && step.state === 'running' && state.expired
          );

          if (!step) {
            return {
              data: {
                claimed: false,
                reason: 'no_ready_step',
                taskRunId: state.task.id
              },
              error: null
            };
          }

          state.leaseCounter += 1;
          step.state = 'running';
          step.attempts += 1;
          step.resumeCount += resumed ? 1 : 0;
          step.leaseOwner = params.p_worker_owner;
          step.leaseToken = state.leaseCounter === 1 ? LEASE_1 : LEASE_2;
          state.expired = false;
          state.task.state = 'running';

          return {
            data: {
              claimed: true,
              taskRunId: state.task.id,
              stepId: step.id,
              stepKey: step.stepKey,
              capability: step.capability,
              attempt: step.attempts,
              maxAttempts: step.maxAttempts,
              leaseOwner: step.leaseOwner,
              leaseToken: step.leaseToken,
              resumed,
              resumeCount: step.resumeCount,
              checkpoint: step.checkpoint,
              checkpointVersion: step.checkpointVersion,
              dependsOn: step.dependsOn
            },
            error: null
          };
        }

        if (name === 'checkpoint_zuvyr_task_step') {
          const step = state.steps.find(item => item.id === params.p_step_id);
          if (
            !step ||
            step.state !== 'running' ||
            step.leaseOwner !== params.p_worker_owner ||
            step.leaseToken !== params.p_lease_token ||
            state.expired
          ) {
            return error('pack037_stale_worker_checkpoint_rejected');
          }
          step.checkpoint = params.p_checkpoint;
          step.checkpointVersion += 1;
          return {
            data: {
              stepId: step.id,
              stepKey: step.stepKey,
              checkpoint: step.checkpoint,
              checkpointVersion: step.checkpointVersion
            },
            error: null
          };
        }

        if (name === 'renew_zuvyr_task_step_lease') {
          const step = state.steps.find(item => item.id === params.p_step_id);
          if (
            !step ||
            step.leaseOwner !== params.p_worker_owner ||
            step.leaseToken !== params.p_lease_token ||
            state.expired
          ) {
            return error('pack037_lease_not_current');
          }
          return {
            data: {
              stepId: step.id,
              leaseOwner: step.leaseOwner,
              leaseToken: step.leaseToken
            },
            error: null
          };
        }

        return error('unknown_rpc');
      }
    }
  };
}

class FakeQueue {
  constructor(name, options) {
    this.name = name;
    this.options = options;
    this.added = [];
  }

  async add(name, data, options) {
    const existing = this.added.find(item => item.options.jobId === options.jobId);
    if (existing) return { id: existing.options.jobId };
    this.added.push({ name, data, options });
    return { id: options.jobId };
  }
}

(async () => {
  const { request, plan, quote, consent } = buildApprovedPlan();
  const fake = makeFakeDb();

  const persistenceBeforeRestart = createDurableTaskPersistence({
    client: fake.client
  });

  const first = await persistenceBeforeRestart.createOrGetTask({
    userId: USER_ID,
    idempotencyKey: 'pack037-task-0001',
    plan,
    quote,
    consent
  });

  assert.equal(first.taskRunId, TASK_ID);
  assert.equal(first.created, true);

  const queue = createDurableTaskQueue({
    QueueCtor: FakeQueue,
    connection: { fake: true }
  });

  const enqueue1 = await enqueueDurableTask({
    queue,
    taskRunId: TASK_ID,
    userId: USER_ID,
    requestId: request.requestId,
    planVersion: quote.planVersion
  });

  const enqueue2 = await enqueueDurableTask({
    queue,
    taskRunId: TASK_ID,
    userId: USER_ID,
    requestId: request.requestId,
    planVersion: quote.planVersion
  });

  assert.equal(enqueue1.jobId, enqueue2.jobId);
  assert.equal(enqueue1.jobId, durableTaskJobId(TASK_ID));
  assert.equal(queue.added.length, 1, 'stable queue job ID must suppress duplicate queue identity');

  await persistenceBeforeRestart.bindQueueJob({
    userId: USER_ID,
    taskRunId: TASK_ID,
    queueJobId: enqueue1.jobId
  });

  const claimedBeforeRestart = await persistenceBeforeRestart.claimNext({
    userId: USER_ID,
    taskRunId: TASK_ID,
    workerOwner: 'worker-before-restart'
  });

  assert.equal(claimedBeforeRestart.claimed, true);
  assert.equal(claimedBeforeRestart.resumed, false);
  assert.equal(claimedBeforeRestart.leaseToken, LEASE_1);

  const checkpoint = await persistenceBeforeRestart.checkpoint({
    stepId: claimedBeforeRestart.stepId,
    workerOwner: 'worker-before-restart',
    leaseToken: LEASE_1,
    checkpoint: {
      phase: 'inspected',
      cursor: 7
    }
  });

  assert.equal(checkpoint.checkpointVersion, 1);

  // Simulate process death: in-memory JS object is discarded, DB state remains.
  fake.state.expired = true;

  const persistenceAfterRestart = createDurableTaskPersistence({
    client: fake.client
  });

  const replay = await persistenceAfterRestart.createOrGetTask({
    userId: USER_ID,
    idempotencyKey: 'pack037-task-0001',
    plan,
    quote,
    consent
  });

  assert.equal(replay.taskRunId, TASK_ID);
  assert.equal(replay.created, false, 'restart must reuse persisted task identity');

  const resumed = await persistenceAfterRestart.claimNext({
    userId: USER_ID,
    taskRunId: TASK_ID,
    workerOwner: 'worker-after-restart'
  });

  assert.equal(resumed.claimed, true);
  assert.equal(resumed.stepId, claimedBeforeRestart.stepId);
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.resumeCount, 1);
  assert.equal(resumed.checkpoint.phase, 'inspected');
  assert.equal(resumed.checkpoint.cursor, 7);
  assert.equal(resumed.checkpointVersion, 1);
  assert.equal(resumed.leaseToken, LEASE_2);

  await assert.rejects(
    () => persistenceAfterRestart.checkpoint({
      stepId: resumed.stepId,
      workerOwner: 'worker-before-restart',
      leaseToken: LEASE_1,
      checkpoint: { stale: true }
    }),
    error => error.code === 'DURABLE_TASK_RPC_FAILED'
  );

  const snapshot = await persistenceAfterRestart.snapshot({
    userId: USER_ID,
    taskRunId: TASK_ID
  });

  assert.equal(snapshot.run.id, TASK_ID);
  assert.equal(snapshot.run.queueJobId, enqueue1.jobId);
  assert.equal(snapshot.steps[0].checkpoint.phase, 'inspected');
  assert.equal(snapshot.steps[0].resumeCount, 1);

  const migration = fs.readFileSync(
    path.join(__dirname, '45_pack037_durable_task_kernel.sql'),
    'utf8'
  );

  for (const marker of [
    'create_or_get_zuvyr_task_run',
    'on conflict (user_id, idempotency_key) do nothing',
    'claim_next_zuvyr_task_step',
    'for update skip locked',
    "s.state = 'running'",
    's.lease_expires_at <= now()',
    'jsonb_array_elements_text(s.depends_on)',
    'renew_zuvyr_task_step_lease',
    'checkpoint_zuvyr_task_step',
    'pack037_stale_worker_checkpoint_rejected',
    'grant execute on function public.create_or_get_zuvyr_task_run',
    'to service_role'
  ]) {
    assert(migration.includes(marker), `missing migration marker: ${marker}`);
  }

  const persistenceSource = fs.readFileSync(
    path.join(__dirname, 'lib/durableTaskPersistence.js'),
    'utf8'
  );
  const queueSource = fs.readFileSync(
    path.join(__dirname, 'lib/durableTaskQueue.js'),
    'utf8'
  );

  for (const forbidden of [
    'reserveCredits(',
    'settleCredits(',
    'refundCredits('
  ]) {
    assert(!persistenceSource.includes(forbidden));
    assert(!queueSource.includes(forbidden));
  }

  console.log('PASS: approved Pack035/036 identity persists through one server-only Pack037 task contract');
  console.log('PASS: (user,idempotency_key) replay returns the same persisted task instead of recreating it');
  console.log('PASS: stable BullMQ job identity prevents duplicate queue identity while Postgres remains source of truth');
  console.log('PASS: expired worker lease is reclaimed after restart with checkpoint + resume_count preserved');
  console.log('PASS: stale worker checkpoint is rejected and dependencies remain persisted as step keys');
  console.log('PASS: Pack037 source path adds no provider call, billing mutation or credit reservation');
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
