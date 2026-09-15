'use strict';

const {
  resolveCostEntry,
  resolveCostQuote
} = require('./costRegistry');
const { quoteTechnicalCost } = require('./technicalCostModel');
const { economicsFromEnv } = require('./dynamicPricing');

const DEFAULT_ATTACHMENT_MODEL =
  process.env.GEMINI_ATTACHMENT_MODEL ||
  'gemini-3.8-flash';

const MODEL_TOKEN_LIMITS = Object.freeze({
  'gemini-3.7-flash': Object.freeze({
    inputTokens: 1048576,
    outputTokens: 65536
  }),
  'gemini-3.8-flash': Object.freeze({
    inputTokens: 1048576,
    outputTokens: 65536
  })
});

function pricingError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function nonNegativeInteger(value, code) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) {
    throw pricingError(code);
  }
  return number;
}

function pricingQuery(model) {
  const normalized = String(model || '').trim();
  if (!MODEL_TOKEN_LIMITS[normalized]) {
    throw pricingError('attachment_analysis_model_unpriced');
  }
  return {
    provider: 'google-gemini',
    modelToolId: normalized,
    capability: 'attachment_analysis',
    operationType: 'multimodal_generation'
  };
}

function preflightAttachmentAnalysisPricing({
  model = DEFAULT_ATTACHMENT_MODEL,
  env = process.env,
  now = Date.now()
} = {}) {
  try {
    const entry = resolveCostEntry(
      pricingQuery(model),
      { env, now }
    );
    return Object.freeze({
      model: entry.modelToolId,
      pricingVersion: entry.registryVersion,
      costEntryId: entry.id,
      limits: MODEL_TOKEN_LIMITS[entry.modelToolId]
    });
  } catch (error) {
    throw pricingError(
      'attachment_analysis_pricing_unavailable',
      error
    );
  }
}

function normalizeGeminiUsage(usage = {}) {
  const totalInput =
    nonNegativeInteger(
      usage.total_input_tokens,
      'attachment_usage_input_invalid'
    );
  const totalCached =
    Math.min(
      totalInput,
      nonNegativeInteger(
        usage.total_cached_tokens,
        'attachment_usage_cached_invalid'
      )
    );
  const totalOutput =
    nonNegativeInteger(
      usage.total_output_tokens,
      'attachment_usage_output_invalid'
    );
  const thought =
    nonNegativeInteger(
      usage.total_thought_tokens,
      'attachment_usage_thought_invalid'
    );
  const toolUse =
    nonNegativeInteger(
      usage.total_tool_use_tokens,
      'attachment_usage_tool_invalid'
    );

  return Object.freeze({
    inputUnits:
      Math.max(0, totalInput - totalCached) +
      toolUse,
    cachedUnits: totalCached,
    outputUnits: totalOutput + thought,
    providerUsage: Object.freeze({
      total_input_tokens: totalInput,
      total_cached_tokens: totalCached,
      total_output_tokens: totalOutput,
      total_thought_tokens: thought,
      total_tool_use_tokens: toolUse
    })
  });
}

function quoteAttachmentAnalysis({
  model = DEFAULT_ATTACHMENT_MODEL,
  usage,
  env = process.env,
  now = Date.now(),
  basis = 'actual'
} = {}) {
  let costQuote;
  try {
    costQuote = resolveCostQuote(
      pricingQuery(model),
      usage,
      { env, now }
    );
  } catch (error) {
    throw pricingError(
      'attachment_analysis_cost_unavailable',
      error
    );
  }

  const technical = quoteTechnicalCost({
    providerCostMicroUsd:
      costQuote.providerCostMicroUsd,
    components: [],
    pricingVersion:
      costQuote.pricingVersion,
    basis,
    economics: economicsFromEnv(env)
  });

  const chargedCredits =
    Number(technical.charge.chargedCredits);

  if (
    !Number.isSafeInteger(chargedCredits) ||
    chargedCredits < 1
  ) {
    throw pricingError(
      'attachment_analysis_credit_quote_invalid'
    );
  }

  return Object.freeze({
    model: costQuote.modelToolId,
    costEntryId: costQuote.costEntryId,
    pricingVersion: costQuote.pricingVersion,
    providerCostMicroUsd:
      costQuote.providerCostMicroUsd,
    chargedCredits,
    costBasis: basis,
    settlementAudit:
      technical.settlementAudit
  });
}

function quoteAttachmentAnalysisReservation({
  model = DEFAULT_ATTACHMENT_MODEL,
  env = process.env,
  now = Date.now()
} = {}) {
  const preflight =
    preflightAttachmentAnalysisPricing({
      model,
      env,
      now
    });
  const limits = preflight.limits;

  return quoteAttachmentAnalysis({
    model,
    env,
    now,
    basis: 'conservative_upper_bound',
    usage: {
      inputUnits: limits.inputTokens,
      outputUnits: limits.outputTokens,
      cachedUnits: 0
    }
  });
}

function quoteAttachmentAnalysisActual({
  model = DEFAULT_ATTACHMENT_MODEL,
  usage,
  env = process.env,
  now = Date.now()
} = {}) {
  const normalized =
    normalizeGeminiUsage(usage);

  const quote = quoteAttachmentAnalysis({
    model,
    env,
    now,
    basis: 'actual',
    usage: normalized
  });

  return Object.freeze({
    ...quote,
    providerUsage:
      normalized.providerUsage
  });
}

module.exports = {
  DEFAULT_ATTACHMENT_MODEL,
  MODEL_TOKEN_LIMITS,
  pricingError,
  pricingQuery,
  preflightAttachmentAnalysisPricing,
  normalizeGeminiUsage,
  quoteAttachmentAnalysisReservation,
  quoteAttachmentAnalysisActual
};
