'use strict';

const {
  createCapabilityExecutorRegistry
} = require('./capabilityExecutors');
const chatFlow = require('./zuvyrChatFlow');

function liveError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function getChatStep(plan) {
  return plan.steps.find(step => step.capability === 'chat.respond') || null;
}

function getProjectStep(plan) {
  return plan.steps.find(step => step.capability === 'project.collect') || null;
}

function buildCheckpointDQuotes(plan, { now = Date.now() } = {}) {
  if (!plan || !Array.isArray(plan.steps)) {
    throw liveError('PACK040_PLAN_REQUIRED');
  }

  const chatStep = getChatStep(plan);
  const projectStep = getProjectStep(plan);
  const capabilities = plan.steps.map(step => step.capability);

  const singleChat =
    plan.steps.length === 1 &&
    chatStep &&
    !projectStep;

  const legacyChatProject =
    plan.steps.length === 2 &&
    chatStep &&
    projectStep &&
    Array.isArray(projectStep.dependsOn) &&
    projectStep.dependsOn.length === 1 &&
    projectStep.dependsOn[0] === chatStep.id;

  if (!singleChat && !legacyChatProject) {
    throw liveError('PACK040_TWO_CAPABILITY_PLAN_REQUIRED', {
      capabilities,
      supportedPlanShapes: [
        ['chat.respond'],
        ['chat.respond', 'project.collect']
      ]
    });
  }

  const providerQuote = chatFlow.makeQuote([
    {
      role: 'user',
      content: plan.goal
    }
  ], now);

  const stepQuotes = plan.steps.map(step => {
    if (step.capability === 'chat.respond') {
      return Object.freeze({
        stepId: step.id,
        capability: step.capability,
        estimatedCredits: String(providerQuote.maxCredits),
        estimatedCostMicroUsd: String(providerQuote.providerBound),
        estimatedDurationMs: 90000,
        riskLevel: 'low',
        pricingVerified: true,
        pricingVersion: providerQuote.pricingVersion,
        pricingSource: `groq:${providerQuote.model}`
      });
    }

    return Object.freeze({
      stepId: step.id,
      capability: step.capability,
      estimatedCredits: '0',
      estimatedCostMicroUsd: '0',
      estimatedDurationMs: 1000,
      riskLevel: 'low',
      pricingVerified: true,
      pricingVersion: 'pack040.local.project-collect.v1',
      pricingSource: 'local:project.collect'
    });
  });

  return Object.freeze({
    stepQuotes: Object.freeze(stepQuotes),
    providerQuotes: Object.freeze({
      [chatStep.id]: Object.freeze(providerQuote)
    }),
    modelTool: providerQuote.model,
    pricingVersion: providerQuote.pricingVersion,
    creditValueMicroUsd: String(providerQuote.economics.creditValueMicroUsd)
  });
}

function createLiveCapabilityExecutorRegistry({
  fetchImpl = global.fetch,
  apiKey = process.env.GROQ_API_KEY
} = {}) {
  return createCapabilityExecutorRegistry({
    'chat.respond': {
      sideEffectMode: 'read_only',
      retryable: false,
      timeoutMs: 90000,
      async execute({
        stepKey,
        taskPlan,
        signal
      }) {
        const providerQuote =
          taskPlan &&
          taskPlan.pack040 &&
          taskPlan.pack040.providerQuotes &&
          taskPlan.pack040.providerQuotes[stepKey];

        if (!providerQuote) {
          throw liveError('PACK040_PROVIDER_QUOTE_MISSING');
        }
        if (!apiKey) {
          throw liveError('PACK040_GROQ_KEY_MISSING');
        }

        const response = await fetchImpl(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            signal,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: providerQuote.model,
              messages: providerQuote.messages,
              max_completion_tokens: providerQuote.maxOutput,
              service_tier: 'on_demand',
              stream: false,
              n: 1,
              reasoning_effort: 'low',
              reasoning_format: 'hidden',
              tool_choice: 'none'
            })
          }
        );

        if (!response.ok) {
          const error = liveError(`PACK040_PROVIDER_HTTP_${response.status}`);
          error.retryable = false;
          throw error;
        }

        const measured = chatFlow.measure(
          await response.json(),
          providerQuote
        );

        return Object.freeze({
          kind: 'chat_response',
          provider: 'groq',
          model: measured.model,
          text: measured.text,
          billing: Object.freeze({
            credits: measured.credits,
            providerCostMicroUsd: measured.cost,
            pricingVersion: providerQuote.pricingVersion,
            creditValueMicroUsd: String(
              providerQuote.economics.creditValueMicroUsd
            ),
            usage: measured.usage
          })
        });
      }
    },

    'project.collect': {
      sideEffectMode: 'read_only',
      retryable: false,
      timeoutMs: 5000,
      async execute({
        dependencyOutputs,
        taskRunId
      }) {
        const entries = Object.entries(dependencyOutputs || {});
        if (entries.length !== 1) {
          throw liveError('PACK040_PROJECT_DEPENDENCY_OUTPUT_REQUIRED');
        }

        return Object.freeze({
          kind: 'project_collection',
          taskRunId,
          items: Object.freeze(
            entries.map(([stepKey, output]) => Object.freeze({
              sourceStepKey: stepKey,
              kind: output && output.kind || 'unknown',
              provider: output && output.provider || null,
              model: output && output.model || null,
              text: output && typeof output.text === 'string'
                ? output.text
                : null
            }))
          )
        });
      }
    }
  });
}

module.exports = {
  buildCheckpointDQuotes,
  createLiveCapabilityExecutorRegistry
};
