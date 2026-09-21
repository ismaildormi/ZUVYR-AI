'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const root = __dirname;
const migration = fs.readFileSync(path.join(root, '92_pack088_88d_ui_notifications_pause_cancel.sql'), 'utf8');
const frontend = fs.readFileSync(path.join(root, '..', 'frontend', 'zuvyr-suite-v1.js'), 'utf8');
const css = fs.readFileSync(path.join(root, '..', 'frontend', 'zuvyr-suite-v1.css'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const processorSource = fs.readFileSync(path.join(root, 'lib', 'automationExecutionProcessor.js'), 'utf8');
const routesSource = fs.readFileSync(path.join(root, 'lib', 'automationRoutes.js'), 'utf8');
const serviceSource = fs.readFileSync(path.join(root, 'lib', 'automationService.js'), 'utf8');
const {
  createAutomationService
} = require('./lib/automationService');
const {
  createAutomationRoutes,
  createAutomationRunRoutes
} = require('./lib/automationRoutes');

for (const marker of [
  'add column if not exists control_revision integer not null default 0',
  'add column if not exists cancel_requested_at timestamptz',
  'add column if not exists event_key text',
  'zuvyr_notifications_owner_event_pack088_idx',
  'emit_workspace_automation_notification_pack088',
  'pack088_notify_run_transition',
  'check_workspace_schedule_run_control_pack088',
  'create_workspace_automation_pack088',
  'control_workspace_schedule_pack088',
  "p_action='pause'",
  "p_action='resume'",
  "p_action='cancel'",
  "p_action='run_now'",
  'pack088_first_future_occurrence',
  'request_cancel_zuvyr_task',
  'trg_pack088_late_bind_cancel_guard',
  'to service_role'
]) assert(migration.includes(marker), 'Missing migration marker: ' + marker);

assert(
  migration.includes('on conflict (owner_id,event_key) where event_key is not null do nothing'),
  'Notification event must be exactly-once'
);
assert(
  !/grant\s+(?:all|select|insert|update|delete|execute)[\s\S]{0,120}\bto\s+(?:anon|authenticated|public)\b/i.test(migration),
  '88D must not grant browser mutation/execute authority'
);

for (const marker of [
  "['presentations','▧','Presentations','ready'],['scheduled','◷','Scheduled','ready']",
  'function scheduledView()',
  'data-zs-scheduled-form',
  'data-zs-scheduled-refresh',
  'data-zs-scheduled-action',
  'data-zs-scheduled-open',
  'data-zs-scheduled-notification',
  '/api/automations?limit=100',
  '/api/automations/notifications?limit=50',
  'Create draft',
  'No credits are charged at schedule creation',
  'Maximum credits per run',
  'Run now',
  'Pause',
  'Resume',
  'Cancel'
]) assert(frontend.includes(marker), 'Missing Scheduled UI marker: ' + marker);

assert.doesNotThrow(() => new Function(frontend), 'Scheduled UI source must parse');
assert(css.includes('ZUVYR PACK088 / 88D'));
assert(css.includes('[dir="rtl"] .zs-scheduled-notification'));
assert(css.includes('@media (max-width:820px)'));

for (const marker of [
  "app.use(\n  '/api/automations',\n  requireAuth",
  "app.use(\n  '/api/automation-runs',\n  requireAuth",
  'createAutomationRoutes({ client: supabaseAdmin })',
  'createAutomationRunRoutes({ client: supabaseAdmin })'
]) assert(serverSource.includes(marker), 'Missing server route marker: ' + marker);

assert(processorSource.includes('executionRepository.checkControl'));
assert(processorSource.includes("throw executionError('PACK088_CONTROL_CANCELLED')"));
assert(serviceSource.includes('createTaskCancellation'));
assert(serviceSource.includes("reason: 'automation_schedule_cancelled'"));
assert(routesSource.includes("router.post('/:id/run-now'"));
assert(routesSource.includes("router.get('/notifications'"));

const OWNER = '11111111-1111-4111-8111-111111111111';
const SCHEDULE = '22222222-2222-4222-8222-222222222222';
const RUN = '33333333-3333-4333-8333-333333333333';
const NOTICE = '44444444-4444-4444-8444-444444444444';
const TOKEN = '55555555-5555-4555-8555-555555555555';

async function serviceCancellationProof() {
  const calls = [];
  const repository = {
    async control(input) {
      calls.push(['control', input]);
      return {
        scheduleId: input.scheduleId,
        state: 'cancelled',
        taskRunIds: [RUN],
        replayed: false
      };
    }
  };
  const cancellation = {
    async request(input) {
      calls.push(['pack039', input]);
      return { accepted: true, state: 'cancelled' };
    }
  };
  const service = createAutomationService({
    client: {},
    repository,
    cancellation
  });
  const result = await service.cancel({ ownerId: OWNER, scheduleId: SCHEDULE });
  assert.equal(result.state, 'cancelled');
  assert.equal(result.cancellationRequests.length, 1);
  assert.equal(calls[1][0], 'pack039');
  assert.equal(calls[1][1].taskRunId, RUN);
  assert.equal(calls[1][1].reason, 'automation_schedule_cancelled');
}

async function routeProof() {
  const calls = [];
  const service = {
    async list(input) { calls.push(['list', input]); return [{ id: SCHEDULE, state: 'active' }]; },
    async create(input) { calls.push(['create', input]); return { scheduleId: SCHEDULE, state: 'draft', chargedCredits: 0 }; },
    async notifications(input) { calls.push(['notifications', input]); return [{ id: NOTICE }]; },
    async markNotificationRead(input) { calls.push(['read', input]); return { id: NOTICE, read_at: new Date().toISOString() }; },
    async runs(input) { calls.push(['runs', input]); return [{ id: RUN, state: 'pending' }]; },
    async get(input) { calls.push(['get', input]); return { schedule: { id: SCHEDULE }, workflow: { id: 'wf' } }; },
    async activate(input) { calls.push(['activate', input]); return { state: 'active' }; },
    async pause(input) { calls.push(['pause', input]); return { state: 'paused' }; },
    async resume(input) { calls.push(['resume', input]); return { state: 'active' }; },
    async cancel(input) { calls.push(['cancel', input]); return { state: 'cancelled' }; },
    async runNow(input) { calls.push(['runNow', input]); return { runId: RUN, state: 'active' }; },
    async run(input) { calls.push(['run', input]); return { id: RUN, state: 'pending' }; }
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = OWNER; next(); });
  app.use('/api/automations', createAutomationRoutes({ service }));
  app.use('/api/automation-runs', createAutomationRunRoutes({ service }));
  const server = await new Promise(resolve => {
    const value = app.listen(0, () => resolve(value));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    let response = await fetch(base + '/api/automations');
    assert.equal(response.status, 200);
    let data = await response.json();
    assert.equal(data.items[0].id, SCHEDULE);

    response = await fetch(base + '/api/automations', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        title:'Daily brief',
        goal:'Summarize the approved task',
        scheduleType:'once',
        runAt:new Date(Date.now()+60000).toISOString(),
        timezone:'UTC',
        maxCreditsPerRun:25
      })
    });
    assert.equal(response.status, 201);
    data = await response.json();
    assert.equal(data.chargedCredits, 0);

    for (const action of ['activate','pause','resume','cancel']) {
      response = await fetch(base + '/api/automations/' + SCHEDULE + '/' + action, { method:'POST' });
      assert.equal(response.status, 200);
    }

    response = await fetch(base + '/api/automations/' + SCHEDULE + '/run-now', {
      method:'POST',
      headers:{'Content-Type':'application/json','Idempotency-Key':TOKEN},
      body:'{}'
    });
    assert.equal(response.status, 202);
    const runNowCall = calls.find(call => call[0] === 'runNow');
    assert.equal(runNowCall[1].requestToken, TOKEN);

    response = await fetch(base + '/api/automations/' + SCHEDULE + '/runs');
    assert.equal(response.status, 200);

    response = await fetch(base + '/api/automation-runs/' + RUN);
    assert.equal(response.status, 200);

    response = await fetch(base + '/api/automations/notifications');
    assert.equal(response.status, 200);

    response = await fetch(base + '/api/automations/notifications/' + NOTICE + '/read', { method:'POST' });
    assert.equal(response.status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

(async () => {
  await serviceCancellationProof();
  await routeProof();
  console.log('PASS PACK088/88D UI notifications pause cancel');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
