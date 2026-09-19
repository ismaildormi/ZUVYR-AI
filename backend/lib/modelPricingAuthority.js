'use strict';

// Canonical model pricing authority.
// Every monetary rate is resolved from cost-registry.v1.json through
// lib/costRegistry. Provider-reported monetary fields are telemetry only.
const {
  registry,
  resolveCostQuote
} = require('./costRegistry');

function pricingError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function operationForCapability(capability) {
  const value = String(capability || '').trim();
  if (value === 'multimodal_chat') return 'multimodal_generation';
  if (value === 'chat' || value === 'code') return 'text_generation';
  throw pricingError('model_pricing_capability_invalid', { capability: value });
}

function tokenField(usage, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(usage || {}, name)) {
      const value = Number(usage[name]);
      if (!Number.isSafeInteger(value) || value < 0) {
        throw pricingError('model_pricing_usage_invalid', { field: name });
      }
      return { present: true, value };
    }
  }
  return { present: false, value: 0 };
}

function measuredUsage(usage, { requireMeasured = false } = {}) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    if (requireMeasured) throw pricingError('model_pricing_usage_missing');
    return Object.freeze({ input_tokens: 0, output_tokens: 0, cached_tokens: 0 });
  }

  const input = tokenField(usage, [
    'input_tokens',
    'prompt_tokens',
    'inputUnits'
  ]);
  const output = tokenField(usage, [
    'output_tokens',
    'completion_tokens',
    'outputUnits'
  ]);
  const cached = tokenField(usage, [
    'cached_tokens',
    'cachedUnits'
  ]);

  if (requireMeasured && (!input.present || !output.present)) {
    throw pricingError('model_pricing_measured_usage_required');
  }

  return Object.freeze({
    input_tokens: input.value,
    output_tokens: output.value,
    cached_tokens: cached.value
  });
}

function quoteModelCost({
  provider,
  model,
  capability,
  usage = {},
  requireMeasuredUsage = false,
  env = process.env,
  now = Date.now()
} = {}) {
  const providerId = String(provider || '').trim();
  const modelId = String(model || '').trim();
  const capabilityId = String(capability || '').trim();
  if (!providerId || !modelId) {
    throw pricingError('model_pricing_provider_model_required');
  }

  const normalizedUsage = measuredUsage(usage, {
    requireMeasured: requireMeasuredUsage
  });
  const quote = resolveCostQuote({
    provider: providerId,
    modelToolId: modelId,
    capability: capabilityId,
    operationType: operationForCapability(capabilityId)
  }, normalizedUsage, { env, now });

  const micro = BigInt(quote.providerCostMicroUsd);
  if (micro < 0n) throw pricingError('model_pricing_negative_cost');

  return Object.freeze({
    ...quote,
    providerCostUsd: Number(micro) / 1_000_000,
    usage: normalizedUsage,
    registryVersion: quote.pricingVersion || registry.version
  });
}

function modelCostUsd(input = {}) {
  return quoteModelCost(input).providerCostUsd;
}

function modelCostTier({
  provider,
  model,
  capability,
  env = process.env,
  now = Date.now()
} = {}) {
  try {
    return modelCostUsd({
      provider,
      model,
      capability,
      usage: {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000
      },
      env,
      now
    });
  } catch (_) {
    return Number.POSITIVE_INFINITY;
  }
}

function providerReportedCostTelemetry(usage = {}) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
  if (!Object.prototype.hasOwnProperty.call(usage, 'cost')) return null;
  const value = Number(usage.cost);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

module.exports = {
  operationForCapability,
  measuredUsage,
  quoteModelCost,
  modelCostUsd,
  modelCostTier,
  providerReportedCostTelemetry
};
