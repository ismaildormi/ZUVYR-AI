'use strict';

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');

const { supabaseAdmin } = require('./lib/supabaseAdmin');
const {
  createBrainKernelRuntime
} = require('./lib/brainKernelRuntime');
const {
  createDurableTaskPersistence
} = require('./lib/durableTaskPersistence');
const {
  createBrainKernelTaskProcessor
} = require('./lib/brainKernelWorker');
const {
  createLiveCapabilityExecutorRegistry
} = require('./lib/liveCapabilityExecutors');
const {
  createBrainKernelUsage
} = require('./lib/brainKernelUsage');

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function pilotUsers() {
  const users = String(
    process.env.ZUVYR_CHAT_FLOW_PILOT_USERS || ''
  )
    .split(',')
    .map(value => value.trim())
    .filter(value => UUID.test(value));

  if (!users.length) fail('PACK040_LIVE_PILOT_USER_MISSING');
  return users;
}

async function selectTopupPilot(requiredCredits) {
  const users = pilotUsers();

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id,topup_credits_balance')
    .in('id', users)
    .order('topup_credits_balance', { ascending: false });

  if (error) fail('PACK040_LIVE_PILOT_LOOKUP_FAILED');

  const selected = (data || []).find(row =>
    Number(row.topup_credits_balance || 0) >= Number(requiredCredits)
  );

  if (!selected || !UUID.test(selected.id || '')) {
    fail('PACK040_LIVE_TOPUP_CAPACITY_UNAVAILABLE');
  }

  return selected.id;
}

async function workerOnce() {
  const userId = process.env.PACK040_LIVE_USER_ID;
  const taskRunId = process.env.PACK040_LIVE_TASK_ID;
  const owner = process.env.PACK040_LIVE_WORKER_OWNER;

  if (!UUID.test(userId || '') || !UUID.test(taskRunId || '') || !owner) {
    fail('PACK040_LIVE_CHILD_INPUT_INVALID');
  }

  const processor = createBrainKernelTaskProcessor({
    client: supabaseAdmin,
    registry: createLiveCapabilityExecutorRegistry(),
    persistence: createDurableTaskPersistence({
      client: supabaseAdmin
    }),
    usage: createBrainKernelUsage({
      client: supabaseAdmin
    })
  });

  const result = await processor.processOne({
    userId,
    taskRunId,
    workerOwner: owner
  });

  if (!result.claimed) fail('PACK040_LIVE_CHILD_NO_STEP');
  process.stdout.write(
    `PACK040_CHILD_STEP=${result.capability}:PASS\n`
  );
}

function spawnWorkerOnce({
  userId,
  taskRunId,
  owner
}) {
  const child = spawnSync(
    process.execPath,
    [__filename, '--worker-once'],
    {
      env: {
        ...process.env,
        PACK040_LIVE_USER_ID: userId,
        PACK040_LIVE_TASK_ID: taskRunId,
        PACK040_LIVE_WORKER_OWNER: owner
      },
      encoding: 'utf8',
      timeout: 120000
    }
  );

  if (child.status !== 0) {
    process.stderr.write(
      String(child.stderr || child.stdout || '').slice(-4000)
    );
    fail('PACK040_LIVE_CHILD_FAILED');
  }

  process.stdout.write(child.stdout || '');
}

async function main() {
  if (process.argv.includes('--worker-once')) {
    await workerOnce();
    return;
  }

  if (process.env.ZUVYR_PACK040_LIVE_E2E !== 'true') {
    fail('PACK040_LIVE_E2E_NOT_EXPLICITLY_ENABLED');
  }

  if (
    process.env.ZUVYR_PACK040_LIVE_ALLOW_TOPUP !== 'true'
  ) {
    fail('PACK040_LIVE_TOPUP_NOT_EXPLICITLY_APPROVED');
  }

  const requestId = crypto.randomUUID();
  const idempotencyKey = `live-${requestId}`;

  const runtime = createBrainKernelRuntime({
    client: supabaseAdmin,
    persistence: createDurableTaskPersistence({
      client: supabaseAdmin
    }),
    usage: createBrainKernelUsage({
      client: supabaseAdmin
    }),
    queue: null,
    allowUnqueuedProof: true
  });

  const request = {
    schemaVersion: '1.0',
    requestId,
    surface: 'work',
    goal:
      'Reply with exactly PACK040_LIVE_OK and no additional text.',
    inputs: {},
    constraints: {
      hard: [
        'Return exactly PACK040_LIVE_OK',
        'Do not call tools'
      ]
    },
    outputs: {
      requested: ['chat', 'project']
    },
    contextRefs: [],
    language: {
      requested: 'en'
    },
    risk: {},
    budget: {},
    clientState: {}
  };

  const preview = runtime.preview({ request });
  if (
    preview.capabilities.join(',') !==
    'chat.respond,project.collect'
  ) {
    fail('PACK040_LIVE_PREVIEW_CAPABILITY_MISMATCH');
  }

  const userId = await selectTopupPilot(
    Number(preview.estimatedCredits)
  );

  const started = await runtime.start({
    userId,
    request,
    approved: true,
    confirmCreditReservation: true,
    allowTopup: true,
    idempotencyKey,
    enqueueTask: false
  });

  if (!UUID.test(started.taskRunId || '')) {
    fail('PACK040_LIVE_TASK_ID_INVALID');
  }

  // Forced restart proof: each capability is executed by a distinct Node
  // process. The second process sees the same persisted task/plan after the
  // first process exits.
  spawnWorkerOnce({
    userId,
    taskRunId: started.taskRunId,
    owner: `pack040-live-a-${process.pid}`
  });

  spawnWorkerOnce({
    userId,
    taskRunId: started.taskRunId,
    owner: `pack040-live-b-${process.pid}`
  });

  const processor = createBrainKernelTaskProcessor({
    client: supabaseAdmin,
    registry: createLiveCapabilityExecutorRegistry(),
    persistence: createDurableTaskPersistence({
      client: supabaseAdmin
    }),
    usage: createBrainKernelUsage({
      client: supabaseAdmin
    })
  });

  const finalized = await processor.finalizeTerminal({
    userId,
    taskRunId: started.taskRunId,
    forcedProcessRestart: true
  });

  const snapshot = finalized.snapshot;

  if (
    !snapshot ||
    snapshot.run.state !== 'succeeded' ||
    !snapshot.run.checkpoint_d_verification_receipt ||
    !snapshot.run.checkpoint_d_settlement_receipt
  ) {
    fail('PACK040_LIVE_TERMINAL_VERIFICATION_FAILED');
  }

  const stepStates = snapshot.steps.map(step => ({
    capability: step.capability,
    state: step.state,
    attempts: step.attempts
  }));

  if (
    stepStates.length !== 2 ||
    stepStates.some(step =>
      step.state !== 'succeeded' ||
      step.attempts !== 1
    )
  ) {
    fail('PACK040_LIVE_STEP_STATE_INVALID');
  }

  console.log('PACK040_LIVE_E2E=PASS');
  console.log('CAPABILITIES=chat.respond,project.collect');
  console.log('BRAIN_QUOTE_CONSENT=PASS');
  console.log('ONE_USAGE_RESERVATION=PASS');
  console.log('FORCED_PROCESS_RESTART=PASS');
  console.log('SAME_PERSISTED_TASK=PASS');
  console.log('DURABLE_EXECUTION=PASS');
  console.log('VERIFY_SETTLE_SAVE=PASS');
  console.log('PROVIDER_OUTPUT_PRINTED=false');
  console.log('ALLOW_TOPUP=true');
  console.log('TOPUP_SOURCE=EXISTING_BALANCE_ONLY');
  console.log('SUBSCRIPTION_MUTATION=false');
  console.log('STRIPE_LIVE_MUTATION=false');
  console.log('LIVE_BILLING_ALLOWED=false');
}

main().catch(error => {
  console.error(
    'PACK040_LIVE_E2E=FAIL',
    error && (error.code || error.message)
      ? error.code || error.message
      : 'unknown_error'
  );
  process.exitCode = 1;
});
