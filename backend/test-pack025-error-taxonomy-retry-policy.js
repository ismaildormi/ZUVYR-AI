'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cfg = require('./config/provider-error-policy.v1.json');
const {
  ERROR_CATEGORIES,
  classifyProviderError,
  normalizeProviderFailure,
  retryDecision,
  fallbackDecision,
  publicProviderError,
  assertPolicyInvariant
} = require('./lib/providerErrorPolicy');
const { ProviderAdapterError } = require('./lib/providerAdapterContract');

const expectedCategories = [
  'RATE_LIMIT',
  'QUOTA',
  'DOWN',
  'TIMEOUT',
  'MODEL_UNAVAILABLE',
  'AUTH',
  'INVALID_REQUEST',
  'CONTENT_RESTRICTION',
  'INTERNAL'
];

assert.equal(cfg.version, 'pack-025.provider-error-policy.v1');
assert.deepEqual(cfg.categories, expectedCategories);
assert.deepEqual(Object.keys(ERROR_CATEGORIES), expectedCategories);
assert.equal(assertPolicyInvariant(), true);

function normalize(error, context = {}) {
  return normalizeProviderFailure(error, {
    providerId: context.providerId || 'synthetic-provider',
    capability: context.capability || 'chat',
    ...context
  });
}

const cases = [
  [{ code: 'groq_rate_limited', statusCode: 429, retryAfterSeconds: 3 }, 'RATE_LIMIT'],
  [{ code: 'openrouter_http_429', status: 429 }, 'RATE_LIMIT'],
  [{ code: 'replicate_quota_exceeded', message: 'quota exceeded' }, 'QUOTA'],
  [{ code: 'fal_insufficient_quota' }, 'QUOTA'],
  [{ code: 'provider_down', statusCode: 503 }, 'DOWN'],
  [{ code: 'upstream_unavailable', status: 502 }, 'DOWN'],
  [{ code: 'groq_timeout' }, 'TIMEOUT'],
  [{ code: 'replicate_timeout', message: 'deadline exceeded' }, 'TIMEOUT'],
  [{ code: 'model_not_found', statusCode: 404 }, 'MODEL_UNAVAILABLE'],
  [{ code: 'provider_not_registered' }, 'MODEL_UNAVAILABLE'],
  [{ code: 'invalid_api_key', statusCode: 401 }, 'AUTH'],
  [{ code: 'provider_not_configured' }, 'AUTH'],
  [{ code: 'invalid_request_error', statusCode: 400 }, 'INVALID_REQUEST'],
  [{ code: 'validation_error', statusCode: 422 }, 'INVALID_REQUEST'],
  [{ code: 'content_filter' }, 'CONTENT_RESTRICTION'],
  [{ code: 'safety_blocked', message: 'blocked content' }, 'CONTENT_RESTRICTION'],
  [{ code: 'mystery_provider_bug', statusCode: 500 }, 'INTERNAL'],
  [{ code: 'mystery_provider_bug' }, 'INTERNAL']
];

for (const [error, expected] of cases) {
  assert.equal(classifyProviderError(error), expected, JSON.stringify(error));
  const normalized = normalize(error);
  assert.equal(normalized.category, expected);
  assert.equal(normalized.code, `PROVIDER_${expected}`);
  assert.equal(normalized.kind, 'PROVIDER_FAILURE');
  assert.equal(typeof normalized.userMessage, 'string');
  assert(normalized.userMessage.length > 0);
}

function sameSemantics(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  assert.equal(left.category, right.category);
  assert.equal(left.retryable, right.retryable);
  assert.deepEqual(left.retry, right.retry);
  assert.equal(left.fallbackAllowed, right.fallbackAllowed);
  assert.equal(left.userMessage, right.userMessage);
}

sameSemantics(
  { code: 'groq_rate_limited', statusCode: 429, retryAfterSeconds: 2 },
  { code: 'openrouter_throttled', statusCode: 429, retryAfterSeconds: 2 }
);
sameSemantics(
  { code: 'replicate_timeout' },
  { code: 'groq_timeout' }
);
sameSemantics(
  { code: 'anthropic_auth_error', statusCode: 401 },
  { code: 'openai_invalid_api_key', statusCode: 401 }
);
sameSemantics(
  { code: 'content_filter' },
  { code: 'safety_blocked' }
);

const rate = normalize({
  code: 'groq_rate_limited',
  statusCode: 429,
  retryAfterSeconds: 60
});
let retry = retryDecision(rate, 0);
assert.equal(retry.shouldRetrySameProvider, true);
assert.equal(retry.delayMs, 30000, 'Retry-After must be bounded by maxDelayMs');
assert.equal(retry.retriesRemaining, 0);
retry = retryDecision(rate, 1);
assert.equal(retry.shouldRetrySameProvider, false);
assert.equal(retry.retriesRemaining, 0);

for (const category of expectedCategories) {
  const policy = cfg.policy[category];
  assert(policy.maxSameProviderRetries <= 1, `${category} retry bound too high`);
  assert(policy.maxDelayMs <= 30000, `${category} delay bound too high`);
}

const quota = normalize({ code: 'quota_exhausted' });
assert.equal(retryDecision(quota, 0).shouldRetrySameProvider, false);
assert.equal(fallbackDecision(quota).allowed, true);

const invalid = normalize({ code: 'invalid_request', statusCode: 400 });
assert.equal(retryDecision(invalid, 0).shouldRetrySameProvider, false);
assert.equal(fallbackDecision(invalid).allowed, false);

const restricted = normalize({ code: 'content_filter' });
assert.equal(retryDecision(restricted, 0).shouldRetrySameProvider, false);
assert.equal(fallbackDecision(restricted).allowed, false);

const down = normalize({ code: 'service_unavailable', statusCode: 503 });
assert.equal(down.countAsProviderHealthFailure, true);
assert.equal(fallbackDecision(down).allowed, true);

const limited = normalize({ code: 'rate_limit', statusCode: 429 });
assert.equal(limited.countAsProviderHealthFailure, false);
assert.equal(limited.quotaImpact, 'LIMITED');

const exhausted = normalize({ code: 'quota_exhausted' });
assert.equal(exhausted.countAsProviderHealthFailure, false);
assert.equal(exhausted.quotaImpact, 'EXHAUSTED');

const adapterError = new ProviderAdapterError({
  code: 'provider_adapter_error',
  providerCode: 'groq_rate_limited',
  statusCode: 429,
  retryAfterSeconds: 4,
  retryable: null,
  providerId: 'groq',
  capability: 'chat'
});
const adapted = normalizeProviderFailure(adapterError);
assert.equal(adapted.category, 'RATE_LIMIT');
assert.equal(adapted.providerId, 'groq');
assert.equal(adapted.providerCode, 'groq_rate_limited');
assert.equal(adapted.retryAfterSeconds, 4);

const cancelled = normalize({
  code: 'provider_request_cancelled',
  cancelled: true
});
assert.equal(cancelled.kind, 'CONTROL_FLOW');
assert.equal(cancelled.category, null);
assert.equal(cancelled.code, 'CANCELLED');
assert.equal(cancelled.retryable, false);
assert.equal(cancelled.fallbackAllowed, false);
assert.equal(retryDecision(cancelled, 0).shouldRetrySameProvider, false);
assert.equal(fallbackDecision(cancelled).allowed, false);

const publicRate = publicProviderError(rate);
assert.deepEqual(publicRate, {
  code: 'PROVIDER_RATE_LIMIT',
  category: 'RATE_LIMIT',
  message: cfg.policy.RATE_LIMIT.userMessage,
  retryable: true
});
assert(!JSON.stringify(publicRate).includes('groq'));
assert(!JSON.stringify(publicRate).includes('retryAfterSeconds'));

const source = fs.readFileSync(path.join(__dirname, 'lib/providerErrorPolicy.js'), 'utf8');
for (const forbidden of [
  'reserveCredits(',
  'refundCredits(',
  'settleCredits(',
  'reserve_zuvyr_usage',
  'zuvyr_usage_records',
  'fetch(',
  'axios.',
  'supabaseAdmin'
]) {
  assert(
    !source.includes(forbidden),
    `Pack025 policy must remain pure and non-billing/non-network: ${forbidden}`
  );
}

const groqSource = fs.readFileSync(
  path.join(__dirname, 'src/modules/ai/providers/groqFree.js'),
  'utf8'
);
assert(groqSource.includes('retryAfterSeconds'));
assert(groqSource.includes('groq_timeout'));

const imageSource = fs.readFileSync(
  path.join(__dirname, 'src/modules/ai/providers/imageProviders.js'),
  'utf8'
);
assert(imageSource.includes('provider_not_registered'));
assert(imageSource.includes('provider_not_configured'));

const adapterConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'config/provider-adapter-contract.v1.json'), 'utf8')
);
assert.equal(
  adapterConfig.error.taxonomy,
  'minimal_transport_shape_only_pack025_owns_final_error_taxonomy'
);

const healthConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'config/provider-health-quota-state.v1.json'), 'utf8')
);
assert.equal(healthConfig.ownership.finalErrorTaxonomy, '025');

console.log('PASS: Pack025 defines exactly RATE_LIMIT, QUOTA, DOWN, TIMEOUT, MODEL_UNAVAILABLE, AUTH, INVALID_REQUEST, CONTENT_RESTRICTION and INTERNAL provider error categories');
console.log('PASS: equivalent errors from different providers map to identical bounded retry, fallback and user-message semantics');
console.log('PASS: Retry-After is honored only where allowed and is clamped; every same-provider retry policy is bounded to at most one retry');
console.log('PASS: INVALID_REQUEST and CONTENT_RESTRICTION cannot trigger provider fallback; cancellation remains non-retry control flow');
console.log('PASS: provider health/quota impacts are explicit and remain separate from user billing/allowance state');
console.log('DATABASE / RAILWAY / PROVIDER ACCOUNT / PAYMENT / MODEL NETWORK CALLS: NONE');
