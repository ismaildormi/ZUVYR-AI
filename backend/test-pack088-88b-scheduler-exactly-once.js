'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG = require('./config/automations.v1.json');
const {
  automationJobId,
  enqueueAutomationOccurrence
} = require('./lib/automationQueue');
const {
  schedulerEnabledFromEnv,
  runtimeSchedulerOptions,
  dedupeRuns,
  runAutomationSchedulerTick
} = require('./lib/automationScheduler');

const migration = fs.readFileSync(
  path.join(__dirname, '89_pack088_88b_scheduler_exactly_once.sql'),
  'utf8'
);
const claimConflictHotfix = fs.readFileSync(
  path.join(__dirname, '90_pack088_88b_claim_conflict_hotfix.sql'),
  'utf8'
);
const baseMigration = fs.readFileSync(
  path.join(__dirname, '88_pack088_automations_durable_workflows.sql'),
  'utf8'
);
const schedulerSource = fs.readFileSync(
  path.join(__dirname, 'lib', 'automationScheduler.js'),
  'utf8'
);
const queueSource = fs.readFileSync(
  path.join(__dirname, 'lib', 'automationQueue.js'),
  'utf8'
);
const workerSource = fs.readFileSync(
  path.join(__dirname, 'worker.js'),
  'utf8'
);

assert.match(CONFIG.version, /^pack-088\.88[b-e]\.automations\.v1$/);
assert.match(CONFIG.implementationPhase, /^88[B-E]_/);
assert.equal(CONFIG.schedulerEnabled, true);
assert.equal(typeof CONFIG.executionEnabled, 'boolean');
assert.equal(typeof CONFIG.providerCallsEnabled, 'boolean');
assert.equal(typeof CONFIG.billingMutationsEnabled, 'boolean');
assert.equal(CONFIG.invariants.postgresBeforeRedis, true);
assert.equal(CONFIG.invariants.stableQueueJobId, true);
assert.equal(CONFIG.invariants.pendingOccurrenceRecoverableAfterRedisFailure, true);

for (const marker of [
  'create or replace function public.pack088_occurrence_key',
  'create or replace function public.pack088_next_schedule_occurrence',
  'create or replace function public.pack088_first_future_occurrence',
  'create or replace function public.claim_due_workspace_schedules_pack088',
  'for update skip locked',
  'on conflict on constraint workspace_schedule_runs_occurrence_unique do nothing',
  'create or replace function public.list_pending_workspace_schedule_runs_pack088',
  'create or replace function public.mark_workspace_schedule_run_queued_pack088',
  'create or replace function public.mark_workspace_schedule_run_dispatch_error_pack088',
  "where r.state='pending'",
  "state='queued'",
  "state='pending'",
  'grant execute on function public.claim_due_workspace_schedules_pack088',
  'to service_role'
]) {
  assert(migration.includes(marker), `missing PACK088 88B migration marker: ${marker}`);
}

assert(baseMigration.includes('constraint workspace_schedule_runs_occurrence_unique'));
assert(baseMigration.includes('unique(schedule_id, occurrence_key)'));
assert(claimConflictHotfix.includes('on conflict on constraint workspace_schedule_runs_occurrence_unique do nothing'));
assert(!claimConflictHotfix.includes('on conflict(schedule_id,occurrence_key) do nothing'));

for (const forbidden of [
  /brainKernelRuntime/i,
  /reserveCredits/i,
  /settleCredits/i,
  /refundCredits/i,
  /providerCallsEnabled\s*[:=]\s*true/i
]) {
  assert(!schedulerSource.match(forbidden), `scheduler must not cross into 88C: ${forbidden}`);
  assert(!queueSource.match(forbidden), `queue must not cross into 88C: ${forbidden}`);
}

assert(workerSource.includes("startAutomationScheduler"));
assert(workerSource.includes("PACK088_SCHEDULER_ENABLED") || schedulerSource.includes("runtimeGateEnv"));
assert(schedulerSource.includes("status: 'overlap_suppressed'"));
assert(schedulerSource.includes('pendingBeforeClaim'));
assert(schedulerSource.includes('markDispatchError'));

const RUN='11111111-1111-4111-8111-111111111111';
const OWNER='22222222-2222-4222-8222-222222222222';
const SCHEDULE='33333333-3333-4333-8333-333333333333';
const WORKFLOW='44444444-4444-4444-8444-444444444444';

const run=Object.freeze({
  runId:RUN,
  ownerId:OWNER,
  scheduleId:SCHEDULE,
  workflowId:WORKFLOW,
  workflowRevision:3,
  scheduleRevision:2,
  occurrenceKey:'abc123',
  scheduledFor:'2026-09-21T13:10:00.000Z',
  runState:'pending'
});

assert.equal(
  automationJobId(RUN),
  'pack088-11111111-1111-4111-8111-111111111111'
);
assert.equal(automationJobId(RUN), automationJobId(RUN));

class FakeQueue {
  constructor() {
    this.jobs=new Map();
    this.failuresRemaining=0;
    this.addCalls=0;
  }
  async add(name,data,options) {
    this.addCalls += 1;
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      const error=new Error('redis unavailable');
      error.code='ECONNREFUSED';
      throw error;
    }
    if (!this.jobs.has(options.jobId)) {
      this.jobs.set(options.jobId,{id:options.jobId,name,data,options});
    }
    return this.jobs.get(options.jobId);
  }
}

(async () => {
  const queue=new FakeQueue();
  const first=await enqueueAutomationOccurrence({queue,run});
  const second=await enqueueAutomationOccurrence({queue,run});
  assert.equal(first.jobId,second.jobId);
  assert.equal(queue.jobs.size,1);
  assert.equal(queue.addCalls,2);

  assert.equal(schedulerEnabledFromEnv({PACK088_SCHEDULER_ENABLED:'true'}),true);
  assert.equal(schedulerEnabledFromEnv({PACK088_SCHEDULER_ENABLED:'false'}),false);
  assert.equal(runtimeSchedulerOptions({
    PACK088_SCHEDULER_ENABLED:'true',
    PACK088_SCHEDULER_INTERVAL_MS:'500',
    PACK088_SCHEDULER_BATCH_SIZE:'999'
  }).intervalMs,CONFIG.scheduler.intervalMsMin);
  assert.equal(runtimeSchedulerOptions({
    PACK088_SCHEDULER_ENABLED:'true',
    PACK088_SCHEDULER_INTERVAL_MS:'500',
    PACK088_SCHEDULER_BATCH_SIZE:'999'
  }).batchSize,CONFIG.scheduler.batchSizeMax);

  assert.equal(dedupeRuns([run,run]).length,1);
  assert.equal(dedupeRuns([{...run,runState:'skipped'}]).length,0);

  const recoveryState={
    pending:[],
    claims:[run],
    queued:[],
    errors:[]
  };
  const repo={
    async listPending(){return recoveryState.pending.slice();},
    async claimDue(){
      const rows=recoveryState.claims.slice();
      recoveryState.claims=[];
      return rows;
    },
    async markQueued(input){
      recoveryState.queued.push(input);
      recoveryState.pending=recoveryState.pending.filter(x=>x.runId!==input.runId);
    },
    async markDispatchError(input){
      recoveryState.errors.push(input);
      if (!recoveryState.pending.some(x=>x.runId===input.runId)) {
        recoveryState.pending.push(run);
      }
    }
  };

  const flakyQueue=new FakeQueue();
  flakyQueue.failuresRemaining=1;

  const failedTick=await runAutomationSchedulerTick({
    repository:repo,
    queue:flakyQueue,
    now:'2026-09-21T13:10:00.000Z'
  });
  assert.equal(failedTick.claimed,1);
  assert.equal(failedTick.queued,0);
  assert.equal(failedTick.failed,1);
  assert.equal(recoveryState.pending.length,1);
  assert.equal(recoveryState.errors[0].runId,RUN);

  const recoveredTick=await runAutomationSchedulerTick({
    repository:repo,
    queue:flakyQueue,
    now:'2026-09-21T13:10:15.000Z'
  });
  assert.equal(recoveredTick.recovered,1);
  assert.equal(recoveredTick.queued,1);
  assert.equal(recoveredTick.failed,0);
  assert.equal(recoveryState.pending.length,0);
  assert.equal(recoveryState.queued.length,1);
  assert.equal(recoveryState.queued[0].queueJobId,automationJobId(RUN));
  assert.equal(flakyQueue.jobs.size,1);

  console.log('PASS: PACK088 88B stable BullMQ job identity suppresses logical duplicates');
  console.log('PASS: Redis enqueue failure preserves a pending occurrence for restart recovery');
  console.log('PASS: recovered dispatch reuses the exact same run and queue job identity');
  console.log('PASS: scheduler runtime remains gated and cannot execute providers or billing');
  console.log('PASS: database contract includes row locks plus unique occurrence identity');
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode=1;
});
