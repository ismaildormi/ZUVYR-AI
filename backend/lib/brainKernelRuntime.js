'use strict';

const crypto = require('crypto');

const CONFIG = require('../config/brain-kernel-checkpoint-d.v1.json');
const { normalizeUniversalRequest } = require('./universalRequest');
const { extractRequirements } = require('./requirementExtractor');
const { createIntentLock } = require('./intentLock');
const { createBrainPlan } = require('./brainPlanner');
const {
  buildPlanQuote,
  createConsent
} = require('./planQuoteConsent');
const {
  createDurableTaskPersistence
} = require('./durableTaskPersistence');
const {
  createDurableTaskQueue,
  enqueueDurableTask
} = require('./durableTaskQueue');
const {
  buildCheckpointDQuotes
} = require('./liveCapabilityExecutors');
const {
  createBrainKernelUsage
} = require('./brainKernelUsage');

function runtimeError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function required(value, code, max = 4000) {
  const text = value == null ? '' : String(value).trim();
  if (!text || text.length > max) throw runtimeError(code);
  return text;
}

function requestIdFrom(value) {
  const text = required(value, 'PACK040_REQUEST_ID_REQUIRED', 180);
  return `brain40:${text}`;
}

function taskIdempotency(value) {
  const text = required(value, 'PACK040_IDEMPOTENCY_KEY_REQUIRED', 96);
  return `pack040:${text}`;
}

function publicTask(snapshot) {
  if (!snapshot || !snapshot.run) {
    throw runtimeError('PACK040_TASK_SNAPSHOT_INVALID');
  }

  return Object.freeze({
    taskRunId: snapshot.run.id,
    state: snapshot.run.state,
    planVersion: snapshot.run.plan_version,
    queueJobId: snapshot.run.queue_job_id || null,
    stepStates: Object.freeze(
      Array.isArray(snapshot.steps)
        ? snapshot.steps.map(step => Object.freeze({
            stepKey: step.step_key,
            capability: step.capability,
            state: step.state,
            attempts: step.attempts,
            resumeCount: step.resume_count || 0
          }))
        : []
    ),
    verified: Boolean(snapshot.run.checkpoint_d_verification_receipt),
    settled: Boolean(snapshot.run.checkpoint_d_settlement_receipt)
  });
}

function createBrainKernelRuntime({
  client,
  persistence = null,
  queue = null,
  usage = null,
  enqueue = enqueueDurableTask,
  allowUnqueuedProof = false
} = {}) {
  const durable = persistence || createDurableTaskPersistence({ client });
  const usageApi = usage || createBrainKernelUsage({ client });

  if (!durable || typeof durable.createOrGetTask !== 'function') {
    throw runtimeError('PACK040_DURABLE_PERSISTENCE_REQUIRED');
  }
  if (!usageApi || typeof usageApi.reserve !== 'function') {
    throw runtimeError('PACK040_USAGE_ADAPTER_REQUIRED');
  }

  async function existingTask(userId, idempotencyKey) {
    if (!client || typeof client.from !== 'function') return null;

    const result = await client
      .from('zuvyr_task_runs')
      .select('id')
      .eq('user_id', userId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (result.error) {
      throw runtimeError('PACK040_EXISTING_TASK_LOOKUP_FAILED');
    }
    if (!result.data) return null;

    return durable.snapshot({
      userId,
      taskRunId: result.data.id
    });
  }

  function buildBundle(requestInput) {
    const request = normalizeUniversalRequest(requestInput);
    const extraction = extractRequirements(request);
    const intentLock = createIntentLock(request, extraction);
    const plan = createBrainPlan({
      request,
      extraction,
      intentLock
    });

    const liveQuote = buildCheckpointDQuotes(plan);
    const usageRequestId = requestIdFrom(request.requestId);

    const taskPlan = Object.freeze({
      ...plan,
      pack040: Object.freeze({
        version: CONFIG.version,
        providerQuotes: liveQuote.providerQuotes,
        modelTool: liveQuote.modelTool,
        pricingVersion: liveQuote.pricingVersion,
        creditValueMicroUsd: liveQuote.creditValueMicroUsd,
        usageRequestId
      })
    });

    const quote = buildPlanQuote({
      plan: taskPlan,
      stepQuotes: liveQuote.stepQuotes
    });

    return {
      request,
      extraction,
      intentLock,
      plan: taskPlan,
      quote,
      liveQuote
    };
  }

  return Object.freeze({
    preview({ request } = {}) {
      const bundle = buildBundle(request);
      return Object.freeze({
        requestId: bundle.request.requestId,
        capabilities: Object.freeze(
          bundle.plan.steps.map(step => step.capability)
        ),
        planVersion: bundle.quote.planVersion,
        quoteFingerprint: bundle.quote.quoteFingerprint,
        estimatedCredits: bundle.quote.aggregate.estimatedCredits,
        estimatedCostMicroUsd:
          bundle.quote.aggregate.estimatedCostMicroUsd,
        estimatedDurationMs:
          bundle.quote.aggregate.estimatedDurationMs,
        riskLevel: bundle.quote.aggregate.riskLevel,
        executionEnabled: true,
        reservationPerformed: false
      });
    },

    async start({
      userId,
      request,
      approved,
      confirmCreditReservation,
      allowTopup = false,
      idempotencyKey,
      enqueueTask = true,
      maxEstimatedCredits = null,
      afterReservation = null
    } = {}) {
      if (approved !== true || confirmCreditReservation !== true) {
        throw runtimeError('PACK040_EXPLICIT_APPROVAL_REQUIRED');
      }

      if (!enqueueTask && !allowUnqueuedProof) {
        throw runtimeError('PACK040_UNQUEUED_EXECUTION_FORBIDDEN');
      }

      const normalizedIdempotency =
        taskIdempotency(idempotencyKey || request && request.requestId);
      const replay = await existingTask(userId, normalizedIdempotency);

      if (replay) {
        return Object.freeze({
          replayed: true,
          reservationPerformed: false,
          task: publicTask(replay)
        });
      }

      const bundle = buildBundle(request);
      if (maxEstimatedCredits != null) {
        const cap = Number(maxEstimatedCredits);
        if (!Number.isSafeInteger(cap) || cap < 0) {
          throw runtimeError('PACK040_CREDIT_CAP_INVALID');
        }
        if (Number(bundle.quote.aggregate.estimatedCredits) > cap) {
          throw runtimeError('PACK040_CREDIT_CAP_EXCEEDED', {
            estimatedCredits: Number(bundle.quote.aggregate.estimatedCredits),
            maxEstimatedCredits: cap
          });
        }
      }

      if (afterReservation != null && typeof afterReservation !== 'function') {
        throw runtimeError('PACK040_AFTER_RESERVATION_HOOK_INVALID');
      }

      const consent = createConsent({
        plan: bundle.plan,
        quote: bundle.quote,
        approved: true
      });

      const usageRequestId =
        bundle.plan.pack040.usageRequestId;

      const quoteRecord = Object.freeze({
        ...bundle.quote,
        pack040: Object.freeze({
          modelTool: bundle.liveQuote.modelTool,
          pricingVersion: bundle.liveQuote.pricingVersion,
          creditValueMicroUsd: bundle.liveQuote.creditValueMicroUsd
        })
      });

      const taskPlan = bundle.plan;

      let reservation = null;
      let task = null;

      try {
        reservation = await usageApi.reserve({
          userId,
          requestId: usageRequestId,
          taskIdentity: normalizedIdempotency,
          quote: bundle.quote,
          modelTool: bundle.liveQuote.modelTool,
          pricingVersion: bundle.liveQuote.pricingVersion,
          allowTopup: allowTopup === true
        });

        if (afterReservation) {
          await afterReservation(Object.freeze({
            request: bundle.request,
            plan: bundle.plan,
            quote: bundle.quote,
            reservation,
            liveQuote: bundle.liveQuote
          }));
        }

        task = await durable.createOrGetTask({
          userId,
          idempotencyKey: normalizedIdempotency,
          plan: taskPlan,
          quote: bundle.quote,
          consent
        });

        await durable.bindCheckpointD({
          userId,
          taskRunId: task.taskRunId,
          usageRecordId: reservation.usageRecordId,
          quote: quoteRecord,
          consent
        });

        let queued = null;
        if (enqueueTask) {
          if (!queue || typeof enqueue !== 'function') {
            throw runtimeError('PACK040_QUEUE_REQUIRED');
          }

          queued = await enqueue({
            queue,
            taskRunId: task.taskRunId,
            userId,
            requestId: bundle.request.requestId,
            planVersion: bundle.quote.planVersion
          });

          await durable.bindQueueJob({
            userId,
            taskRunId: task.taskRunId,
            queueJobId: queued.jobId
          });
        }

        return Object.freeze({
          replayed: task.created === false,
          reservationPerformed: true,
          taskRunId: task.taskRunId,
          queueJobId: queued ? queued.jobId : null,
          planVersion: bundle.quote.planVersion,
          quoteFingerprint: bundle.quote.quoteFingerprint,
          consentFingerprint: consent.consentFingerprint,
          reservedCredits: reservation.reservedCredits,
          executionEnabled: true
        });
      } catch (error) {
        if (reservation && !task) {
          try {
            await usageApi.refund({
              requestId: usageRequestId
            });
          } catch (_) {
            // Existing settlement safety/maintenance will surface a stranded
            // reservation. Never hide the original pipeline error.
          }
        }
        throw error;
      }
    },

    async status({ userId, taskRunId } = {}) {
      return publicTask(
        await durable.snapshot({
          userId,
          taskRunId
        })
      );
    }
  });
}

function createProductionBrainKernelRuntime() {
  const { supabaseAdmin } = require('./supabaseAdmin');
  const { connection } = require('./queue');

  return createBrainKernelRuntime({
    client: supabaseAdmin,
    queue: createDurableTaskQueue({ connection })
  });
}

module.exports = {
  CONFIG,
  createBrainKernelRuntime,
  createProductionBrainKernelRuntime
};
