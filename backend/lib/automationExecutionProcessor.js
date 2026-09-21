'use strict';

const CONFIG = require('../config/automations.v1.json');
const { ACTIONS } = require('./permissionCenterPolicy');
const {
  createAutomationExecutionRepository
} = require('./automationExecutionRepository');
const {
  createBrainKernelRuntime
} = require('./brainKernelRuntime');
const {
  createDurableTaskPersistence
} = require('./durableTaskPersistence');
const {
  createDurableTaskQueue,
  enqueueDurableTask
} = require('./durableTaskQueue');
const {
  normalizeUniversalRequest
} = require('./universalRequest');

function executionError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function inferSurface(capabilities = [], explicit = null) {
  const supplied = String(explicit || '').trim().toLowerCase();
  if (['chat','work','create','code'].includes(supplied)) return supplied;

  const set = new Set(capabilities.map(value => String(value || '').trim().toLowerCase()));
  if (set.has('code')) return 'code';
  if (
    ['image','video','audio','document','spreadsheet','presentation','export']
      .some(value => set.has(value))
  ) return 'create';
  if (set.has('research') || set.has('ip')) return 'work';
  return 'chat';
}

const PACK040_AUTOMATION_LIVE_CAPABILITIES = new Set([
  'chat',
  'ip'
]);

function workflowCapabilities(claim) {
  const steps = Array.isArray(claim && claim.steps) ? claim.steps : [];
  const values = [
    ...new Set(
      steps
        .map(step => String(step && step.capability || '').trim().toLowerCase())
        .filter(Boolean)
    )
  ];
  if (values.length === 0) {
    throw executionError('PACK088_PERMISSION_WORKFLOW_STEPS_REQUIRED');
  }
  return values;
}

function workflowBrainOutputs(claim) {
  const capabilities = workflowCapabilities(claim);
  const unsupported = capabilities.filter(
    capability => !PACK040_AUTOMATION_LIVE_CAPABILITIES.has(capability)
  );

  if (unsupported.length > 0) {
    throw executionError('PACK088_PERMISSION_BRAIN_RUNTIME_UNSUPPORTED', {
      capabilities: unsupported
    });
  }

  // PACK040 production currently proves exactly:
  // chat.respond -> project.collect.
  // IP-only automations use chat.respond as the control-plane reasoning step;
  // device authority itself still comes only from PACK087's fresh mission grant.
  return Object.freeze(['chat','project']);
}

function allowedBrainPlanCapabilities(claim) {
  const authorized = new Set(
    (Array.isArray(claim && claim.authorizationCapabilities)
      ? claim.authorizationCapabilities
      : []
    ).map(value => String(value || '').trim().toLowerCase())
  );

  const allowed = new Set(['project.collect']);
  if (authorized.has('chat') || authorized.has('ip')) {
    allowed.add('chat.respond');
  }
  return allowed;
}

function assertBrainPlanAuthorized(claim, plan) {
  const allowed = allowedBrainPlanCapabilities(claim);
  const steps = Array.isArray(plan && plan.steps) ? plan.steps : [];
  const unauthorized = [
    ...new Set(
      steps
        .map(step => String(step && step.capability || '').trim())
        .filter(Boolean)
        .filter(capability => !allowed.has(capability))
    )
  ];

  if (unauthorized.length > 0) {
    throw executionError('PACK088_PERMISSION_PLAN_CAPABILITY_UNAUTHORIZED', {
      unauthorized,
      authorized: [...allowed].sort()
    });
  }

  return true;
}

async function claimExecutionWithBarrier({
  repository,
  runId,
  queueJobId,
  now,
  attempts = 5,
  delayMs = 150,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await repository.claimExecution({
        runId,
        queueJobId,
        now
      });
    } catch (error) {
      lastError = error;
      if (
        String(error && error.code || '') !== 'PACK088_EXECUTION_CLAIM_FAILED' ||
        attempt >= attempts
      ) {
        throw error;
      }
      await wait(delayMs);
    }
  }

  throw lastError || executionError('PACK088_EXECUTION_CLAIM_FAILED');
}

function buildAutomationRequest(claim) {
  const template = plainObject(claim.requestTemplate);
  const runInput = plainObject(claim.runInput);
  const steps = Array.isArray(claim.steps) ? claim.steps : [];
  const capabilities = [...new Set(steps.map(step => String(step.capability || '').trim()).filter(Boolean))];

  const goal = String(
    runInput.goal != null ? runInput.goal :
    template.goal != null ? template.goal :
    ''
  ).trim();

  if (!goal) throw executionError('PACK088_AUTOMATION_GOAL_REQUIRED');

  const controlledInputs = {
    ...plainObject(template.inputs),
    ...plainObject(runInput.inputs),
    feature: 'chat'
  };
  const controlledOutputs = {
    ...plainObject(template.outputs),
    ...plainObject(runInput.outputs)
  };
  delete controlledOutputs.kind;
  delete controlledOutputs.kinds;
  controlledOutputs.requested = workflowBrainOutputs(claim);

  return normalizeUniversalRequest({
    ...template,
    ...runInput,
    requestId: `${CONFIG.execution.brainIdempotencyPrefix}${claim.runId}`,
    surface: inferSurface(capabilities, runInput.surface || template.surface),
    goal,
    inputs: controlledInputs,
    constraints: {
      ...plainObject(template.constraints),
      ...plainObject(runInput.constraints)
    },
    outputs: controlledOutputs,
    language: {
      ...plainObject(template.language),
      ...plainObject(runInput.language)
    },
    risk: {
      ...plainObject(template.risk),
      ...plainObject(runInput.risk)
    },
    budget: {
      ...plainObject(template.budget),
      ...plainObject(runInput.budget)
    },
    clientState: {
      ...plainObject(template.clientState),
      ...plainObject(runInput.clientState)
    },
    metadata: {
      ...plainObject(template.metadata),
      ...plainObject(runInput.metadata),
      automationRunId: claim.runId,
      automationScheduleId: claim.scheduleId,
      automationWorkflowId: claim.workflowId,
      automationOccurrenceKey: claim.occurrenceKey,
      automationScheduledFor: claim.scheduledFor
    }
  });
}

function permissionDescriptors(claim) {
  const steps = Array.isArray(claim.steps) ? claim.steps : [];
  return steps.flatMap(step => {
    const input = plainObject(step.inputTemplate);
    const permission = plainObject(input.permission);
    if (Object.keys(permission).length === 0) return [];

    const action = String(permission.action || '').trim().toLowerCase();
    if (!Object.hasOwn(ACTIONS, action)) {
      throw executionError('PACK088_PERMISSION_ACTION_INVALID', {
        stepKey: step.stepKey,
        action
      });
    }

    const resourceNamespace = String(permission.resourceNamespace || '').trim().toLowerCase();
    const resourceId = String(permission.resourceId || '').trim();
    const sessionId = permission.sessionId == null
      ? null
      : String(permission.sessionId).trim();

    if (!resourceNamespace || !resourceId) {
      throw executionError('PACK088_PERMISSION_BINDING_INVALID', {
        stepKey: step.stepKey
      });
    }

    return [Object.freeze({
      stepKey: String(step.stepKey || ''),
      action,
      resourceNamespace,
      resourceId,
      sessionId
    })];
  });
}

function ipSessionId(claim) {
  const input = plainObject(claim.runInput);
  const ip = plainObject(input.ip);
  const value = input.ipSessionId != null ? input.ipSessionId : ip.sessionId;
  return value == null ? null : String(value).trim();
}

function pricingSnapshotFromQuote({ quote, liveQuote } = {}) {
  if (!quote || typeof quote !== 'object') {
    throw executionError('PACK088_PRICING_QUOTE_REQUIRED');
  }

  return Object.freeze({
    version: 'pack-088.88c.pricing-snapshot.v1',
    planVersion: quote.planVersion,
    quoteFingerprint: quote.quoteFingerprint,
    estimatedCredits: Number(quote.aggregate && quote.aggregate.estimatedCredits),
    estimatedCostMicroUsd: String(
      quote.aggregate && quote.aggregate.estimatedCostMicroUsd || '0'
    ),
    pricingVersion: liveQuote && liveQuote.pricingVersion || null,
    modelTool: liveQuote && liveQuote.modelTool || null
  });
}

function pricingSnapshotFromTask(task) {
  const quote = plainObject(task && task.checkpoint_d_quote);
  const pack040 = plainObject(quote.pack040);
  return Object.freeze({
    version: 'pack-088.88c.pricing-snapshot.v1',
    planVersion: quote.planVersion || task.plan_version || null,
    quoteFingerprint: quote.quoteFingerprint || null,
    estimatedCredits: Number(quote.aggregate && quote.aggregate.estimatedCredits || 0),
    estimatedCostMicroUsd: String(
      quote.aggregate && quote.aggregate.estimatedCostMicroUsd || '0'
    ),
    pricingVersion: pack040.pricingVersion || null,
    modelTool: pack040.modelTool || null,
    recoveredFromTask: true
  });
}

function capErrorSnapshot(error) {
  const details = plainObject(error && error.details);
  return Object.freeze({
    version: 'pack-088.88c.pricing-snapshot.v1',
    planVersion: details.planVersion || null,
    quoteFingerprint: details.quoteFingerprint || null,
    estimatedCredits: Number(details.estimatedCredits || 0),
    estimatedCostMicroUsd: String(details.estimatedCostMicroUsd || '0'),
    cap: Number(details.maxEstimatedCredits || 0),
    blockedByCap: true
  });
}

const FUNDING_BLOCK_CODES = new Set([
  'PACK040_CREDIT_CAP_EXCEEDED',
  'plan_limits_unconfigured',
  'five_hour_allowance_exhausted',
  'weekly_allowance_exhausted',
  'insufficient_topup_credits',
  'weekly_anchor_is_in_the_future'
]);

function isFundingBlock(error) {
  return FUNDING_BLOCK_CODES.has(String(error && error.code || ''));
}

function isPermissionBlock(error) {
  const code = String(error && error.code || '');
  return (
    code.startsWith('PACK088_PERMISSION_') ||
    code.startsWith('PACK088_IP_') ||
    code.startsWith('pack087_permission_') ||
    code.startsWith('pack087_session_') ||
    code.startsWith('pack087_device_')
  );
}

async function authorizeOccurrence({
  claim,
  request,
  repository,
  now = new Date()
} = {}) {
  const descriptors = permissionDescriptors(claim);
  const capabilities = new Set(
    (Array.isArray(claim.authorizationCapabilities)
      ? claim.authorizationCapabilities
      : []
    ).map(value => String(value || '').trim().toLowerCase())
  );

  if (
    claim.authorizationExternalWrites === true &&
    descriptors.length === 0 &&
    !capabilities.has('ip')
  ) {
    throw executionError('PACK088_PERMISSION_BINDING_REQUIRED');
  }

  const receipt = {
    version: 'pack-088.88c.permission-receipt.v1',
    scheduleAuthorization: true,
    generic: {},
    ipMission: null
  };

  for (const descriptor of descriptors) {
    const result = await repository.consumePermission({
      runId: claim.runId,
      claimToken: claim.claimToken,
      stepKey: descriptor.stepKey,
      action: descriptor.action,
      resourceNamespace: descriptor.resourceNamespace,
      resourceId: descriptor.resourceId,
      sessionId: descriptor.sessionId,
      requestId:
        `${CONFIG.execution.permissionRequestPrefix}${claim.runId}:${descriptor.stepKey}`,
      now: now.toISOString()
    });

    if (!result || result.allowed !== true) {
      throw executionError('PACK088_PERMISSION_DENIED', {
        stepKey: descriptor.stepKey,
        reason: result && result.error || 'permission_required'
      });
    }
    receipt.generic[descriptor.stepKey] = result.receipt || result.permission || result;
  }

  if (capabilities.has('ip')) {
    const sessionId = ipSessionId(claim);
    if (!sessionId) throw executionError('PACK088_IP_SESSION_REQUIRED');

    const maxSeconds = Math.min(
      CONFIG.execution.freshIpMissionGrantSeconds,
      CONFIG.execution.freshIpMissionGrantMaxSeconds
    );

    let expiryMs = now.getTime() + maxSeconds * 1000;
    if (claim.authorizationExpiresAt) {
      const authExpiry = Date.parse(claim.authorizationExpiresAt);
      if (Number.isFinite(authExpiry)) expiryMs = Math.min(expiryMs, authExpiry);
    }

    if (expiryMs <= now.getTime()) {
      throw executionError('PACK088_IP_MISSION_EXPIRY_INVALID');
    }

    const result = await repository.grantIpMission({
      runId: claim.runId,
      claimToken: claim.claimToken,
      sessionId,
      mission: request.goal,
      expiresAt: new Date(expiryMs).toISOString(),
      now: now.toISOString()
    });

    receipt.ipMission = result && result.receipt || result;
  }

  return Object.freeze(receipt);
}

async function ensureBrainTaskQueued({
  task,
  runId,
  ownerId,
  durable,
  queue,
  enqueue = enqueueDurableTask
} = {}) {
  if (!task || !task.id) throw executionError('PACK088_BRAIN_TASK_REQUIRED');

  if (task.queue_job_id) {
    return Object.freeze({
      taskRunId: task.id,
      queueJobId: task.queue_job_id,
      replayed: true
    });
  }

  const queued = await enqueue({
    queue,
    taskRunId: task.id,
    userId: ownerId,
    requestId: `${CONFIG.execution.brainIdempotencyPrefix}${runId}`,
    planVersion: task.plan_version
  });

  await durable.bindQueueJob({
    userId: ownerId,
    taskRunId: task.id,
    queueJobId: queued.jobId
  });

  return Object.freeze({
    taskRunId: task.id,
    queueJobId: queued.jobId,
    replayed: false
  });
}

function createAutomationExecutionProcessor({
  client = null,
  repository = null,
  brain = null,
  durable = null,
  durableQueue = null,
  enqueue = enqueueDurableTask,
  nowFactory = () => new Date(),
  wait = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  const db = client || require('./supabaseAdmin').supabaseAdmin;
  const executionRepository =
    repository || createAutomationExecutionRepository({ client: db });
  const persistence =
    durable || createDurableTaskPersistence({ client: db });
  const brainRuntime =
    brain || createBrainKernelRuntime({
      client: db,
      persistence,
      allowUnqueuedProof: true
    });
  const queue =
    durableQueue || createDurableTaskQueue();

  return Object.freeze({
    async process({ runId, queueJobId } = {}) {
      const now = nowFactory();
      const claim = await claimExecutionWithBarrier({
        repository: executionRepository,
        runId,
        queueJobId,
        now: now.toISOString(),
        wait
      });

      if (!claim || claim.status === 'blocked_permission') {
        return Object.freeze({
          status: 'blocked_permission',
          runId,
          errorCode: claim && claim.errorCode || 'PACK088_PERMISSION_BLOCKED'
        });
      }

      const idempotencyKey =
        `${CONFIG.execution.brainIdempotencyPrefix}${runId}`;

      if (claim.status === 'replay') {
        const existing = await executionRepository.findBrainTask({
          ownerId: claim.ownerId,
          idempotencyKey
        });
        if (!existing) throw executionError('PACK088_REPLAY_TASK_MISSING');
        const queued = await ensureBrainTaskQueued({
          task: existing,
          runId,
          ownerId: claim.ownerId,
          durable: persistence,
          queue,
          enqueue
        });
        return Object.freeze({
          status: 'running',
          runId,
          taskRunId: existing.id,
          queueJobId: queued.queueJobId,
          replayed: true
        });
      }

      if (claim.status !== 'claimed') {
        throw executionError('PACK088_EXECUTION_CLAIM_RESULT_INVALID');
      }

      const preexisting = await executionRepository.findBrainTask({
        ownerId: claim.ownerId,
        idempotencyKey
      });

      if (preexisting) {
        const permissionReceipt = claim.permissionReceipt;
        if (!permissionReceipt) {
          throw executionError('PACK088_RECOVERY_PERMISSION_RECEIPT_MISSING');
        }
        await executionRepository.bindTask({
          runId,
          claimToken: claim.claimToken,
          taskRunId: preexisting.id,
          pricingSnapshot: pricingSnapshotFromTask(preexisting),
          permissionReceipt,
          now: now.toISOString()
        });
        const queued = await ensureBrainTaskQueued({
          task: preexisting,
          runId,
          ownerId: claim.ownerId,
          durable: persistence,
          queue,
          enqueue
        });
        return Object.freeze({
          status: 'running',
          runId,
          taskRunId: preexisting.id,
          queueJobId: queued.queueJobId,
          replayed: true
        });
      }

      let request = null;
      let permissionReceipt = null;
      let pricingSnapshot = null;

      let started;
      try {
        request = buildAutomationRequest(claim);
        started = await brainRuntime.start({
          userId: claim.ownerId,
          request,
          approved: true,
          confirmCreditReservation: true,
          allowTopup: claim.allowTopup === true,
          idempotencyKey,
          enqueueTask: false,
          maxEstimatedCredits:
            claim.maxCreditsPerRun == null
              ? null
              : Number(claim.maxCreditsPerRun),
          beforeReservation: async ({ plan }) => {
            assertBrainPlanAuthorized(claim, plan);
          },
          afterReservation: async ({ quote, liveQuote }) => {
            pricingSnapshot = pricingSnapshotFromQuote({ quote, liveQuote });
            permissionReceipt = await authorizeOccurrence({
              claim,
              request,
              repository: executionRepository,
              now
            });
          }
        });
      } catch (error) {
        if (isFundingBlock(error)) {
          const snapshot =
            error.code === 'PACK040_CREDIT_CAP_EXCEEDED'
              ? capErrorSnapshot(error)
              : null;
          await executionRepository.block({
            runId,
            claimToken: claim.claimToken,
            state: 'blocked_funding',
            errorCode: error.code,
            pricingSnapshot: snapshot,
            permissionReceipt,
            now: now.toISOString()
          });
          return Object.freeze({
            status: 'blocked_funding',
            runId,
            errorCode: error.code
          });
        }

        if (isPermissionBlock(error)) {
          await executionRepository.block({
            runId,
            claimToken: claim.claimToken,
            state: 'blocked_permission',
            errorCode: error.code,
            pricingSnapshot,
            permissionReceipt,
            now: now.toISOString()
          });
          return Object.freeze({
            status: 'blocked_permission',
            runId,
            errorCode: error.code
          });
        }

        throw error;
      }

      const taskRunId =
        started && started.taskRunId ||
        started && started.task && started.task.taskRunId ||
        null;

      if (!taskRunId) throw executionError('PACK088_BRAIN_TASK_ID_MISSING');

      const task = await executionRepository.findBrainTask({
        ownerId: claim.ownerId,
        idempotencyKey
      });
      if (!task || task.id !== taskRunId) {
        throw executionError('PACK088_BRAIN_TASK_LOOKUP_MISMATCH');
      }

      if (!pricingSnapshot) {
        pricingSnapshot = pricingSnapshotFromTask(task);
      }
      if (!permissionReceipt) {
        permissionReceipt = claim.permissionReceipt;
      }
      if (!permissionReceipt) {
        throw executionError('PACK088_PERMISSION_RECEIPT_MISSING');
      }

      await executionRepository.bindTask({
        runId,
        claimToken: claim.claimToken,
        taskRunId: task.id,
        pricingSnapshot,
        permissionReceipt,
        now: now.toISOString()
      });

      const queued = await ensureBrainTaskQueued({
        task,
        runId,
        ownerId: claim.ownerId,
        durable: persistence,
        queue,
        enqueue
      });

      return Object.freeze({
        status: 'running',
        runId,
        taskRunId: task.id,
        queueJobId: queued.queueJobId,
        replayed: started.replayed === true,
        reservedCredits: started.reservedCredits == null
          ? null
          : Number(started.reservedCredits)
      });
    }
  });
}

module.exports = {
  CONFIG,
  FUNDING_BLOCK_CODES,
  executionError,
  inferSurface,
  workflowCapabilities,
  workflowBrainOutputs,
  claimExecutionWithBarrier,
  allowedBrainPlanCapabilities,
  assertBrainPlanAuthorized,
  buildAutomationRequest,
  permissionDescriptors,
  pricingSnapshotFromQuote,
  pricingSnapshotFromTask,
  capErrorSnapshot,
  isFundingBlock,
  isPermissionBlock,
  authorizeOccurrence,
  ensureBrainTaskQueued,
  createAutomationExecutionProcessor
};
