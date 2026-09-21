'use strict';

const { Worker } = require('bullmq');
const CONFIG = require('../config/brain-kernel-checkpoint-d.v1.json');
const {
  createDurableTaskPersistence
} = require('./durableTaskPersistence');
const {
  createStepExecutor
} = require('./stepExecutor');
const {
  createLiveCapabilityExecutorRegistry
} = require('./liveCapabilityExecutors');
const {
  createBrainKernelUsage
} = require('./brainKernelUsage');
const {
  createAutomationExecutionRepository
} = require('./automationExecutionRepository');

function workerError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function stepOutput(step) {
  return step && step.output && typeof step.output === 'object'
    ? step.output
    : {};
}

function usageFromSnapshot(snapshot) {
  const chatStep = snapshot.steps.find(
    step => step.capability === 'chat.respond'
  );

  const billing = stepOutput(chatStep).billing || {};
  const quoteMeta =
    snapshot.run &&
    snapshot.run.checkpoint_d_quote &&
    snapshot.run.checkpoint_d_quote.pack040 || {};

  if (
    !Number.isSafeInteger(Number(billing.credits)) ||
    Number(billing.credits) < 0 ||
    !/^(0|[1-9]\d*)$/.test(
      String(billing.providerCostMicroUsd || '')
    ) ||
    !/^(0|[1-9]\d*)$/.test(
      String(
        billing.creditValueMicroUsd ||
        quoteMeta.creditValueMicroUsd ||
        ''
      )
    )
  ) {
    throw workerError('PACK040_TERMINAL_BILLING_EVIDENCE_INVALID');
  }

  return Object.freeze({
    actualCredits: Number(billing.credits),
    actualProviderCostMicroUsd:
      String(billing.providerCostMicroUsd),
    creditValueMicroUsd:
      String(
        billing.creditValueMicroUsd ||
        quoteMeta.creditValueMicroUsd
      ),
    providerUsage: billing.usage || {}
  });
}

function verifySucceededSnapshot(snapshot, {
  forcedProcessRestart = false
} = {}) {
  if (!snapshot || !snapshot.run || snapshot.run.state !== 'succeeded') {
    throw workerError('PACK040_TASK_NOT_SUCCEEDED');
  }

  const capabilities = snapshot.steps.map(step => step.capability);
  const allSucceeded = snapshot.steps.every(step => step.state === 'succeeded');
  const singleChat =
    capabilities.length === 1 &&
    capabilities[0] === 'chat.respond';
  const legacyChatProject =
    capabilities.length === 2 &&
    capabilities[0] === 'chat.respond' &&
    capabilities[1] === 'project.collect';

  if (!allSucceeded || (!singleChat && !legacyChatProject)) {
    throw workerError('PACK040_TWO_CAPABILITY_RESULT_INVALID', {
      capabilities,
      supportedPlanShapes: [
        ['chat.respond'],
        ['chat.respond', 'project.collect']
      ]
    });
  }

  if (singleChat) {
    const chat = stepOutput(snapshot.steps[0]);
    if (chat.kind !== 'chat_response' || typeof chat.text !== 'string') {
      throw workerError('PACK040_DURABLE_SAVE_INVALID');
    }
  } else {
    const project = stepOutput(snapshot.steps[1]);
    if (
      project.kind !== 'project_collection' ||
      !Array.isArray(project.items) ||
      project.items.length !== 1
    ) {
      throw workerError('PACK040_DURABLE_SAVE_INVALID');
    }
  }

  return Object.freeze({
    version: 'pack-040.verification-receipt.v1',
    taskState: 'succeeded',
    capabilities: Object.freeze([...capabilities]),
    forcedProcessRestart: forcedProcessRestart === true,
    sameTaskAcrossRestart: true,
    durableSaveVerified: true,
    providerOutputIncluded: false
  });
}

function createBrainKernelTaskProcessor({
  client = null,
  registry = null,
  persistence = null,
  usage = null,
  automationRepository = null
} = {}) {
  const databaseClient =
    client ||
    (
      persistence && usage
        ? null
        : require('./supabaseAdmin').supabaseAdmin
    );

  const durable = persistence || createDurableTaskPersistence({
    client: databaseClient
  });
  const usageApi = usage || createBrainKernelUsage({
    client: databaseClient
  });
  const capabilityRegistry =
    registry || createLiveCapabilityExecutorRegistry();
  const automation =
    automationRepository ||
    (databaseClient
      ? createAutomationExecutionRepository({ client: databaseClient })
      : null);

  async function reconcileAutomation(snapshot, settlementReceipt = null) {
    if (!automation || !snapshot || !snapshot.run) return null;
    const state = snapshot.run.state;
    if (!['succeeded','failed','cancelled'].includes(state)) return null;
    const receipt = settlementReceipt || snapshot.run.checkpoint_d_settlement_receipt || {};
    const fundingState = receipt.mode === 'settled' ? 'settled' : 'refunded';
    return automation.finalizeFromTask({
      taskRunId: snapshot.run.id,
      taskState: state,
      fundingState,
      errorCode: snapshot.run.error_code || null
    });
  }

  async function finalizeTerminal({
    userId,
    taskRunId,
    forcedProcessRestart = false
  }) {
    const snapshot = await durable.snapshot({
      userId,
      taskRunId
    });

    const usageRequestId =
      snapshot.run &&
      snapshot.run.plan &&
      snapshot.run.plan.pack040 &&
      snapshot.run.plan.pack040.usageRequestId;

    if (!usageRequestId) {
      throw workerError('PACK040_USAGE_REQUEST_ID_MISSING');
    }

    if (
      snapshot.run.checkpoint_d_verification_receipt &&
      snapshot.run.checkpoint_d_settlement_receipt
    ) {
      await reconcileAutomation(
        snapshot,
        snapshot.run.checkpoint_d_settlement_receipt
      );
      return Object.freeze({
        replayed: true,
        snapshot
      });
    }

    let verification;
    let settlementReceipt;

    if (snapshot.run.state === 'succeeded') {
      verification = verifySucceededSnapshot(snapshot, {
        forcedProcessRestart
      });

      const usageEvidence = usageFromSnapshot(snapshot);
      const settlement = await usageApi.settle({
        requestId: usageRequestId,
        ...usageEvidence
      });

      settlementReceipt = Object.freeze({
        version: 'pack-040.settlement-receipt.v1',
        mode: 'settled',
        replayed: settlement.replayed === true,
        actualCredits: usageEvidence.actualCredits,
        providerCostMicroUsd:
          usageEvidence.actualProviderCostMicroUsd
      });
    } else if (
      ['failed', 'cancelled'].includes(snapshot.run.state)
    ) {
      const refund = await usageApi.refund({
        requestId: usageRequestId
      });

      verification = Object.freeze({
        version: 'pack-040.verification-receipt.v1',
        taskState: snapshot.run.state,
        forcedProcessRestart: forcedProcessRestart === true,
        sameTaskAcrossRestart: true,
        durableSaveVerified: true,
        providerOutputIncluded: false
      });

      settlementReceipt = Object.freeze({
        version: 'pack-040.settlement-receipt.v1',
        mode: 'refunded',
        replayed: refund.replayed === true
      });
    } else {
      return Object.freeze({
        replayed: false,
        terminal: false,
        snapshot
      });
    }

    await durable.recordCheckpointD({
      userId,
      taskRunId,
      verificationReceipt: verification,
      settlementReceipt
    });

    const finalSnapshot = await durable.snapshot({
      userId,
      taskRunId
    });

    await reconcileAutomation(finalSnapshot, settlementReceipt);

    return Object.freeze({
      replayed: false,
      terminal: true,
      verification,
      settlementReceipt,
      snapshot: finalSnapshot
    });
  }

  async function processOne({
    userId,
    taskRunId,
    workerOwner
  }) {
    const executor = createStepExecutor({
      persistence: durable,
      registry: capabilityRegistry
    });

    return executor.runNext({
      userId,
      taskRunId,
      workerOwner
    });
  }

  async function processToTerminal({
    userId,
    taskRunId,
    workerOwner
  }) {
    for (let index = 0; index < 16; index += 1) {
      const result = await processOne({
        userId,
        taskRunId,
        workerOwner
      });

      if (!result.claimed) break;
    }

    return finalizeTerminal({
      userId,
      taskRunId
    });
  }

  return Object.freeze({
    processOne,
    processToTerminal,
    finalizeTerminal
  });
}

function startBrainKernelWorker({
  connection,
  concurrency = 1
} = {}) {
  if (!connection) {
    throw workerError('PACK040_REDIS_CONNECTION_REQUIRED');
  }

  const processor = createBrainKernelTaskProcessor();

  const worker = new Worker(
    CONFIG.production.queueName,
    async job => {
      const data = job && job.data || {};
      return processor.processToTerminal({
        userId: data.userId,
        taskRunId: data.taskRunId,
        workerOwner:
          `pack040-worker:${process.pid}:${String(job.id)}`
      });
    },
    {
      connection,
      concurrency: Math.max(1, Math.floor(concurrency))
    }
  );

  return worker;
}

module.exports = {
  createBrainKernelTaskProcessor,
  startBrainKernelWorker,
  verifySucceededSnapshot,
  usageFromSnapshot
};
