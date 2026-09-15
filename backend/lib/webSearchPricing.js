'use strict';

const { resolveCostEntry, resolveCostQuote } = require('./costRegistry');
const { quoteTechnicalCost } = require('./technicalCostModel');
const { economicsFromEnv } = require('./dynamicPricing');

const WEB_GROUNDING_MODEL = 'google/gemini-2.5-flash';
const WEB_SEARCH_ENGINE = 'exa';
const WEB_MODEL_MAX_OUTPUT_TOKENS = 768;
const WEB_RESERVATION_INPUT_TOKENS = 65536;
const WEB_RESERVATION_SEARCH_REQUESTS = 5;

function pricingError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function nonNegativeInt(value, code) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) {
    throw pricingError(code);
  }
  return number;
}

function modelQuery() {
  return {
    provider: 'openrouter',
    modelToolId: WEB_GROUNDING_MODEL,
    capability: 'web_search',
    operationType: 'grounded_web_context'
  };
}

function searchQuery() {
  return {
    provider: 'openrouter',
    modelToolId: 'openrouter:web_search:exa',
    capability: 'web_search',
    operationType: 'web_search'
  };
}

function preflightWebSearchPricing({ env = process.env, now = Date.now() } = {}) {
  if (!String(env.OPENROUTER_API_KEY || '').trim()) {
    throw pricingError('web_search_provider_credential_missing');
  }
  try {
    const model = resolveCostEntry(modelQuery(), { env, now });
    const search = resolveCostEntry(searchQuery(), { env, now });
    return Object.freeze({
      model: model.modelToolId,
      engine: WEB_SEARCH_ENGINE,
      pricingVersion: model.registryVersion,
      modelCostEntryId: model.id,
      searchCostEntryId: search.id
    });
  } catch (error) {
    throw pricingError('web_search_pricing_unavailable', error);
  }
}

function normalizeOpenRouterUsage(usage = {}) {
  const promptTokens = nonNegativeInt(
    usage.prompt_tokens ?? usage.input_tokens,
    'web_usage_input_invalid'
  );
  const completionTokens = nonNegativeInt(
    usage.completion_tokens ?? usage.output_tokens,
    'web_usage_output_invalid'
  );
  const cachedTokens = Math.min(
    promptTokens,
    nonNegativeInt(
      usage.prompt_tokens_details?.cached_tokens ?? usage.cached_tokens,
      'web_usage_cached_invalid'
    )
  );
  const searchRequests = nonNegativeInt(
    usage.server_tool_use?.web_search_requests,
    'web_usage_search_requests_invalid'
  );
  const fetchRequests = nonNegativeInt(
    usage.server_tool_use?.web_fetch_requests,
    'web_usage_fetch_requests_invalid'
  );

  return Object.freeze({
    modelUsage: Object.freeze({
      inputUnits: Math.max(0, promptTokens - cachedTokens),
      cachedUnits: cachedTokens,
      outputUnits: completionTokens
    }),
    searchRequests,
    fetchRequests,
    providerUsage: Object.freeze({
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cached_tokens: cachedTokens,
      web_search_requests: searchRequests,
      web_fetch_requests: fetchRequests
    })
  });
}

function quoteComposite({
  modelUsage,
  searchRequests,
  env = process.env,
  now = Date.now(),
  basis = 'actual'
}) {
  try {
    const model = resolveCostQuote(modelQuery(), modelUsage, { env, now });
    const search = resolveCostQuote(
      searchQuery(),
      { inputUnits: searchRequests },
      { env, now }
    );
    const providerCostMicroUsd = (
      BigInt(model.providerCostMicroUsd) +
      BigInt(search.providerCostMicroUsd)
    ).toString();

    const technical = quoteTechnicalCost({
      providerCostMicroUsd,
      components: [],
      pricingVersion: `${model.pricingVersion}:pack055-web`,
      basis,
      economics: economicsFromEnv(env)
    });
    const chargedCredits = Number(technical.charge.chargedCredits);
    if (!Number.isSafeInteger(chargedCredits) || chargedCredits < 1) {
      throw pricingError('web_search_credit_quote_invalid');
    }

    return Object.freeze({
      model: model.modelToolId,
      engine: WEB_SEARCH_ENGINE,
      modelCostEntryId: model.costEntryId,
      searchCostEntryId: search.costEntryId,
      pricingVersion: model.pricingVersion,
      providerCostMicroUsd,
      providerCostUsd: Number(providerCostMicroUsd) / 1_000_000,
      chargedCredits,
      searchRequests,
      costBasis: basis,
      settlementAudit: technical.settlementAudit
    });
  } catch (error) {
    if (error?.code && String(error.code).startsWith('web_')) throw error;
    throw pricingError('web_search_cost_unavailable', error);
  }
}

function quoteWebSearchReservation({
  directUrl = false,
  env = process.env,
  now = Date.now()
} = {}) {
  preflightWebSearchPricing({ env, now });
  return quoteComposite({
    env,
    now,
    basis: 'conservative_upper_bound',
    modelUsage: {
      inputUnits: WEB_RESERVATION_INPUT_TOKENS,
      cachedUnits: 0,
      outputUnits: WEB_MODEL_MAX_OUTPUT_TOKENS
    },
    searchRequests: directUrl ? 0 : WEB_RESERVATION_SEARCH_REQUESTS
  });
}

function quoteWebSearchActual({ usage, env = process.env, now = Date.now() } = {}) {
  preflightWebSearchPricing({ env, now });
  const normalized = normalizeOpenRouterUsage(usage);
  return Object.freeze({
    ...quoteComposite({
      env,
      now,
      basis: 'actual',
      modelUsage: normalized.modelUsage,
      searchRequests: normalized.searchRequests
    }),
    providerUsage: normalized.providerUsage,
    fetchRequests: normalized.fetchRequests
  });
}

module.exports = {
  WEB_GROUNDING_MODEL,
  WEB_SEARCH_ENGINE,
  WEB_MODEL_MAX_OUTPUT_TOKENS,
  WEB_RESERVATION_INPUT_TOKENS,
  WEB_RESERVATION_SEARCH_REQUESTS,
  preflightWebSearchPricing,
  normalizeOpenRouterUsage,
  quoteWebSearchReservation,
  quoteWebSearchActual
};
