'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./config/automations.v1.json');
const {
  normalizeWorkflowDraft,
  normalizeWorkflowStep,
  normalizeScheduleDraft,
  createAutomationRepository
} = require('./lib/automationRepository');

const migration = fs.readFileSync(
  path.join(__dirname, '88_pack088_automations_durable_workflows.sql'),
  'utf8'
);
const repositorySource = fs.readFileSync(
  path.join(__dirname, 'lib', 'automationRepository.js'),
  'utf8'
);

assert.equal(config.version, 'pack-088.88a.automations.v1');
assert.equal(config.implementationPhase, '88A_SCHEMA_INVARIANTS');
assert.equal(config.executionEnabled, false);
assert.equal(config.schedulerEnabled, false);
assert.equal(config.providerCallsEnabled, false);
assert.equal(config.billingMutationsEnabled, false);
assert.equal(config.sourceOfTruth, 'postgres');
assert.equal(config.invariants.rlsRequired, true);
assert.equal(config.invariants.serviceRoleWritesOnly, true);
assert.equal(config.invariants.exactlyOnceOccurrenceIdentity, true);
assert.equal(config.invariants.staleAuthorizationAutoInvalidated, true);

for (const marker of [
  'create table if not exists public.workspace_schedule_runs',
  'constraint workspace_schedule_runs_occurrence_unique',
  'unique(schedule_id, occurrence_key)',
  'workspace_schedule_runs_task_unique',
  'alter table public.workspace_schedule_runs enable row level security',
  'revoke all on table public.workspace_schedule_runs from public, anon, authenticated',
  'grant select, insert, update on table public.workspace_schedule_runs to service_role',
  'add column if not exists revision integer not null default 1',
  'add column if not exists request_template jsonb',
  'add column if not exists input_template jsonb',
  'add column if not exists definition_revision integer not null default 1',
  'add column if not exists next_run_at timestamptz',
  'add column if not exists recurrence_spec jsonb',
  'add column if not exists run_input jsonb',
  'add column if not exists max_credits_per_run integer',
  'add column if not exists authorization_digest text',
  'add column if not exists authorization_schedule_revision integer',
  'add column if not exists authorized_device_id uuid references public.ip_devices',
  "state in ('ready','active','running')",
  "misfire_policy in ('run_once','skip')",
  "authorization_digest ~ '^[0-9a-f]{64}$'",
  'pg_timezone_names',
  'pack088_workflow_owner_mismatch',
  'pack088_workflow_revision_stale',
  'pack088_schedule_revision_stale',
  "last_error_code='workflow_revision_changed'",
  "last_error_code='schedule_definition_changed'",
  'trg_pack088_workflow_step_revision',
  'trg_pack088_workflow_schedule_invalidation',
  'trg_pack088_schedule_definition_guard'
]) {
  assert(migration.includes(marker), `missing PACK088 migration marker: ${marker}`);
}

for (const forbidden of [
  /drop\s+table/i,
  /truncate\s+/i,
  /delete\s+from\s+public\.workspace_/i,
  /grant\s+.*\s+to\s+authenticated/i
]) {
  assert(!forbidden.test(migration), `forbidden destructive/client mutation marker: ${forbidden}`);
}

for (const forbiddenSource of [
  "require('./brainKernelRuntime')",
  "require('./durableTaskQueue')",
  'reserveCredits(',
  'settleCredits(',
  'refundCredits(',
  'queue.add(',
  'execution_enabled: true'
]) {
  assert(!repositorySource.includes(forbiddenSource), `88A repository must remain draft-only: ${forbiddenSource}`);
}

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const WORKFLOW = '33333333-3333-4333-8333-333333333333';
const SCHEDULE = '44444444-4444-4444-8444-444444444444';
const STEP = '55555555-5555-4555-8555-555555555555';

const wf = normalizeWorkflowDraft({
  ownerId: OWNER,
  name: 'Daily research brief',
  description: 'Build a reusable research result',
  requestTemplate: { goal: 'Research the approved topic' }
});
assert.equal(wf.execution_enabled, false);
assert.equal(wf.external_writes_enabled, false);
assert.deepEqual(wf.request_template, { goal: 'Research the approved topic' });

const step = normalizeWorkflowStep({
  stepKey: 'computerTask',
  position: 0,
  capability: 'ip',
  dependsOn: [],
  inputTemplate: { mission: 'Open the approved app' }
});
assert.equal(step.execution_enabled, false);
assert.equal(step.capability, 'ip');

const once = normalizeScheduleDraft({
  ownerId: OWNER,
  workflowId: WORKFLOW,
  title: 'One time',
  scheduleType: 'once',
  runAt: '2026-09-21T12:00:00Z',
  timezone: 'Africa/Casablanca',
  maxCreditsPerRun: 100
});
assert.equal(once.state, 'draft');
assert.equal(once.execution_enabled, false);
assert.equal(once.allow_topup, false);
assert.deepEqual(once.notification_policy, { in_app: true });

const recurring = normalizeScheduleDraft({
  ownerId: OWNER,
  workflowId: WORKFLOW,
  title: 'Daily',
  scheduleType: 'recurring',
  runAt: '2026-09-21T12:00:00Z',
  timezone: 'Africa/Casablanca',
  recurrenceSpec: { frequency: 'daily', localTime: '09:00' },
  misfirePolicy: 'skip'
});
assert.equal(recurring.schedule_type, 'recurring');
assert.equal(recurring.misfire_policy, 'skip');

assert.throws(
  () => normalizeScheduleDraft({
    ownerId: OWNER,
    workflowId: WORKFLOW,
    title: 'Bad once',
    scheduleType: 'once',
    runAt: '2026-09-21T12:00:00Z',
    timezone: 'Africa/Casablanca',
    intervalMinutes: 60
  }),
  error => error.code === 'PACK088_ONCE_INTERVAL_FORBIDDEN'
);

assert.throws(
  () => normalizeScheduleDraft({
    ownerId: OWNER,
    workflowId: WORKFLOW,
    title: 'Bad recurring',
    scheduleType: 'recurring',
    runAt: '2026-09-21T12:00:00Z',
    timezone: 'Africa/Casablanca'
  }),
  error => error.code === 'PACK088_RECURRING_SPEC_REQUIRED'
);

assert.throws(
  () => normalizeWorkflowStep({
    stepKey: 'wild',
    position: 0,
    capability: '*'
  }),
  error => error.code === 'PACK088_WORKFLOW_CAPABILITY_INVALID'
);

class FakeQuery {
  constructor(table, store) {
    this.table = table;
    this.store = store;
    this.filters = [];
    this.rowsToInsert = null;
  }
  select() { return this; }
  eq(key, value) { this.filters.push([key, value]); return this; }
  order() { return this; }
  insert(rows) { this.rowsToInsert = rows; return this; }
  async maybeSingle() {
    const rows = this.store[this.table] || [];
    const row = rows.find(item =>
      this.filters.every(([key, value]) => item[key] === value)
    ) || null;
    return { data: row, error: null };
  }
  async single() {
    if (!this.rowsToInsert) return this.maybeSingle();
    const row = {
      ...this.rowsToInsert[0],
      id:
        this.table === 'workspace_workflows' ? WORKFLOW :
        this.table === 'workspace_workflow_steps' ? STEP :
        this.table === 'workspace_schedules' ? SCHEDULE :
        '66666666-6666-4666-8666-666666666666',
      revision: this.table === 'workspace_workflows' ? 1 : undefined,
      definition_revision: this.table === 'workspace_schedules' ? 1 : undefined
    };
    this.store[this.table].push(row);
    return { data: row, error: null };
  }
  async limit(limit) {
    let rows = (this.store[this.table] || []).filter(item =>
      this.filters.every(([key, value]) => item[key] === value)
    );
    return { data: rows.slice(0, limit), error: null };
  }
}

(async () => {
  const store = {
    workspace_workflows: [],
    workspace_workflow_steps: [],
    workspace_schedules: [],
    workspace_schedule_runs: []
  };
  const client = {
    from(table) {
      assert(store[table], `unexpected table ${table}`);
      return new FakeQuery(table, store);
    }
  };

  const repo = createAutomationRepository({ client });

  const createdWorkflow = await repo.createWorkflowDraft({
    ownerId: OWNER,
    name: 'Owner workflow',
    requestTemplate: { goal: 'test' }
  });
  assert.equal(createdWorkflow.id, WORKFLOW);
  assert.equal(createdWorkflow.execution_enabled, false);

  const createdStep = await repo.addWorkflowStep({
    ownerId: OWNER,
    workflowId: WORKFLOW,
    stepKey: 'research',
    position: 0,
    capability: 'research',
    inputTemplate: { topic: 'approved' }
  });
  assert.equal(createdStep.workflow_id, WORKFLOW);

  await assert.rejects(
    () => repo.addWorkflowStep({
      ownerId: OTHER,
      workflowId: WORKFLOW,
      stepKey: 'crossOwner',
      position: 1,
      capability: 'chat'
    }),
    error => error.code === 'PACK088_WORKFLOW_NOT_FOUND'
  );

  const createdSchedule = await repo.createScheduleDraft({
    ownerId: OWNER,
    workflowId: WORKFLOW,
    title: 'Draft schedule',
    scheduleType: 'once',
    runAt: '2026-09-21T12:00:00Z',
    timezone: 'Africa/Casablanca',
    maxCreditsPerRun: 25
  });
  assert.equal(createdSchedule.id, SCHEDULE);
  assert.equal(createdSchedule.execution_enabled, false);
  assert.equal(createdSchedule.state, 'draft');

  await assert.rejects(
    () => repo.createScheduleDraft({
      ownerId: OTHER,
      workflowId: WORKFLOW,
      title: 'Cross owner',
      scheduleType: 'once',
      runAt: '2026-09-21T12:00:00Z',
      timezone: 'Africa/Casablanca'
    }),
    error => error.code === 'PACK088_WORKFLOW_NOT_FOUND'
  );

  console.log('PASS: PACK088 88A schema is additive and preserves RLS/service-role boundaries');
  console.log('PASS: workflow and schedule revisions bind future authorization without enabling execution');
  console.log('PASS: one logical occurrence uniqueness is schema-enforced');
  console.log('PASS: workflow ownership is checked before draft steps or schedules are created');
  console.log('PASS: one-time/recurring draft validation is deterministic');
  console.log('PASS: PACK088 88A repository cannot enqueue, execute, call providers or mutate billing');
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
