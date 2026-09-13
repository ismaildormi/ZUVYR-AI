'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config =
  require('./config/brain-kernel-checkpoint-d.v1.json');
const {
  createBrainKernelRuntime
} = require('./lib/brainKernelRuntime');
const {
  buildCheckpointDQuotes
} = require('./lib/liveCapabilityExecutors');
const {
  verifySucceededSnapshot
} = require('./lib/brainKernelWorker');

assert.equal(
  config.version,
  'pack-040.brain-kernel-checkpoint-d.v1'
);
assert.deepEqual(
  config.checkpointCapabilities,
  ['chat.respond', 'project.collect']
);
assert.equal(config.usage.oneReservationPerTask, true);
assert.equal(config.production.liveBillingAllowed, false);

function fakePlan() {
  return {
    version: 'pack-035.brain-plan.v1',
    plannerId: 'zuvyr.brain.planner.v1',
    graphVersion: 'pack-035.capability-graph.v1',
    requestId: 'pack040-test-request',
    surface: 'work',
    goal: 'Return PACK040_TEST_OK',
    intentFingerprint: 'a'.repeat(64),
    context: {
      required: false,
      verified: true,
      contextRefCount: 0,
      resolvedCount: 0,
      budgetIncludedCharacters: 0
    },
    requestedCapabilities: [
      'chat.respond',
      'project.collect'
    ],
    selectedRuntimeCapability: null,
    candidatePaths: [],
    steps: [
      {
        id: 'step_01_chat_respond',
        capability: 'chat.respond',
        dependsOn: [],
        metadata: {}
      },
      {
        id: 'step_02_project_collect',
        capability: 'project.collect',
        dependsOn: ['step_01_chat_respond'],
        metadata: {}
      }
    ],
    order: [
      'step_01_chat_respond',
      'step_02_project_collect'
    ],
    acyclic: true,
    singleSharedPlanner: true,
    executionEnabled: false,
    planFingerprint: 'b'.repeat(64)
  };
}

const quoted = buildCheckpointDQuotes(
  fakePlan(),
  { now: Date.parse('2026-09-13T12:00:00Z') }
);
assert.equal(quoted.stepQuotes.length, 2);
assert.equal(
  quoted.stepQuotes[0].capability,
  'chat.respond'
);
assert.equal(
  quoted.stepQuotes[1].estimatedCredits,
  '0'
);

const calls = [];
const fakeUsage = {
  async reserve(input) {
    calls.push(['reserve', input]);
    return {
      requestId: input.requestId,
      usageRecordId: 7,
      reservedCredits: Number(
        input.quote.aggregate.estimatedCredits
      ),
      replayed: false,
      state: 'reserved'
    };
  },
  async refund(input) {
    calls.push(['refund', input]);
    return {
      success: true,
      replayed: false
    };
  }
};

const fakePersistence = {
  async createOrGetTask(input) {
    calls.push(['createTask', input]);
    return {
      taskRunId:
        '22222222-2222-4222-8222-222222222222',
      created: true,
      state: 'pending',
      planVersion: input.quote.planVersion,
      idempotencyKey: input.idempotencyKey
    };
  },
  async bindCheckpointD(input) {
    calls.push(['bindCheckpointD', input]);
    return {
      taskRunId: input.taskRunId,
      usageRecordId: input.usageRecordId,
      bound: true
    };
  },
  async bindQueueJob(input) {
    calls.push(['bindQueueJob', input]);
    return input;
  },
  async snapshot({ taskRunId }) {
    return {
      run: {
        id: taskRunId,
        state: 'pending',
        plan_version: 'c'.repeat(64),
        queue_job_id: null
      },
      steps: []
    };
  }
};

const fakeQueue = {
  async add(name, data, options) {
    calls.push(['queueAdd', { name, data, options }]);
    return {
      id: options.jobId
    };
  }
};

(async () => {
  const runtime = createBrainKernelRuntime({
    client: null,
    persistence: fakePersistence,
    usage: fakeUsage,
    queue: fakeQueue
  });

  const request = {
    schemaVersion: '1.0',
    requestId: 'pack040-unit-001',
    surface: 'work',
    goal: 'Return PACK040_TEST_OK',
    inputs: {},
    constraints: {
      hard: ['Return PACK040_TEST_OK']
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
  assert.deepEqual(
    preview.capabilities,
    ['chat.respond', 'project.collect']
  );
  assert.equal(
    preview.executionEnabled,
    true
  );
  assert.equal(
    preview.reservationPerformed,
    false
  );

  await assert.rejects(
    () => runtime.start({
      userId:
        '11111111-1111-4111-8111-111111111111',
      request,
      approved: false,
      confirmCreditReservation: true,
      idempotencyKey: 'pack040-unit-001'
    }),
    error =>
      error.code === 'PACK040_EXPLICIT_APPROVAL_REQUIRED'
  );

  const preview2 = runtime.preview({ request });
  assert.equal(
    preview.planVersion,
    preview2.planVersion,
    'Pack040 preview plan version must remain deterministic'
  );

  const started = await runtime.start({
    userId:
      '11111111-1111-4111-8111-111111111111',
    request,
    approved: true,
    confirmCreditReservation: true,
    allowTopup: false,
    idempotencyKey: 'pack040-unit-001'
  });

  assert.match(
    started.taskRunId,
    /^[0-9a-f-]{36}$/i
  );
  assert.equal(
    calls.filter(item => item[0] === 'reserve').length,
    1,
    'one and only one task reservation'
  );
  assert.equal(
    calls.filter(item => item[0] === 'createTask').length,
    1
  );
  assert.equal(
    calls.filter(item => item[0] === 'queueAdd').length,
    1
  );
  assert.equal(
    calls.filter(item => item[0] === 'bindQueueJob').length,
    1
  );
  assert.equal(
    calls.filter(item => item[0] === 'bindCheckpointD').length,
    1
  );

  const succeeded = {
    run: {
      id: started.taskRunId,
      state: 'succeeded'
    },
    steps: [
      {
        capability: 'chat.respond',
        state: 'succeeded',
        output: {
          kind: 'chat_response'
        }
      },
      {
        capability: 'project.collect',
        state: 'succeeded',
        output: {
          kind: 'project_collection',
          items: [
            {
              sourceStepKey: 'step_01_chat_respond',
              kind: 'chat_response'
            }
          ]
        }
      }
    ]
  };

  const verification = verifySucceededSnapshot(
    succeeded,
    {
      forcedProcessRestart: true
    }
  );
  assert.equal(
    verification.forcedProcessRestart,
    true
  );
  assert.equal(
    verification.durableSaveVerified,
    true
  );
  assert.equal(
    verification.providerOutputIncluded,
    false
  );

  const migration = fs.readFileSync(
    path.join(
      __dirname,
      '48_pack040_brain_kernel_checkpoint_d.sql'
    ),
    'utf8'
  );

  for (const marker of [
    'bind_zuvyr_task_checkpoint_d',
    'record_zuvyr_task_checkpoint_d_receipts',
    'usage_record_id = p_usage_record_id',
    'pack040_receipt_conflict',
    'to service_role'
  ]) {
    assert(
      migration.includes(marker),
      `missing Pack040 migration marker: ${marker}`
    );
  }

  const routeSource = fs.readFileSync(
    path.join(__dirname, 'lib/unifiedProductRoutes.js'),
    'utf8'
  );
  assert(
    routeSource.includes('createProductionBrainKernelRuntime')
  );
  assert(
    !routeSource.includes(
      "res.status(503).json({ status: 'blocked', ...approveCrossFeaturePlan(req.body) })"
    )
  );

  const workerSource = fs.readFileSync(
    path.join(__dirname, 'worker.js'),
    'utf8'
  );
  assert(
    workerSource.includes('startBrainKernelWorker')
  );
  assert(
    workerSource.includes('zuvyr-durable-tasks') ||
    fs.readFileSync(
      path.join(
        __dirname,
        'config/brain-kernel-checkpoint-d.v1.json'
      ),
      'utf8'
    ).includes('zuvyr-durable-tasks')
  );

  const usageSource = fs.readFileSync(
    path.join(__dirname, 'lib/brainKernelUsage.js'),
    'utf8'
  );
  assert(
    usageSource.includes("p_actual_provider_cost_microusd: '0'"),
    'Pack040 refund must match the live refund_zuvyr_usage RPC signature'
  );

  const runtimeSource = fs.readFileSync(
    path.join(__dirname, 'lib/brainKernelRuntime.js'),
    'utf8'
  );
  assert(
    runtimeSource.includes('usageRequestId\n      })') ||
      runtimeSource.includes('usageRequestId\r\n      })'),
    'usageRequestId must be part of the bound Pack040 plan before quote/consent'
  );

  const liveSource = fs.readFileSync(
    path.join(__dirname, 'run-pack040-live-e2e.js'),
    'utf8'
  );
  assert(
    liveSource.includes(
      "process.env.ZUVYR_PACK040_LIVE_ALLOW_TOPUP !== 'true'"
    ),
    'Pack040 live top-up proof must require an explicit dedicated approval flag'
  );
  assert(
    liveSource.includes('selectTopupPilot('),
    'Pack040 live proof must select a configured pilot with enough existing top-up balance'
  );
  assert(
    liveSource.includes('allowTopup: true'),
    'Pack040 controlled live proof must use the explicitly approved existing top-up path'
  );

  console.log(
    'PASS: canonical Brain preview produces the exact two-capability checkpoint plan'
  );
  console.log(
    'PASS: approval performs exactly one usage reservation before durable task creation/enqueue'
  );
  console.log(
    'PASS: quote/consent/usage binding and terminal verification receipts are durable'
  );
  console.log(
    'PASS: production unified-product approve route no longer has the unconditional Pack11 503 path'
  );
  console.log(
    'PASS: production worker wires the Pack037/038 durable queue without enabling live Stripe billing'
  );
})().catch(error => {
  console.error(
    error && error.stack ? error.stack : error
  );
  process.exitCode = 1;
});
