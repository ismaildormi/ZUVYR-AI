'use strict';

const CONFIG = require('../config/provider-error-policy.v1.json');

const ERROR_CATEGORIES = Object.freeze(
  Object.fromEntries(CONFIG.categories.map(category => [category, category]))
);

const CATEGORY_SET = new Set(CONFIG.categories);
const POLICY = Object.freeze(
  Object.fromEntries(
    Object.entries(CONFIG.policy).map(([category, value]) => [
      category,
      Object.freeze({ ...value })
    ])
  )
);

function optionalText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function integerOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function statusOf(error) {
  const value =
    error?.statusCode ??
    error?.status ??
    error?.response?.status ??
    error?.cause?.statusCode ??
    error?.cause?.status ??
    error?.cause?.response?.status;
  const status = integerOrNull(value);
  return status != null && status >= 100 && status <= 599 ? status : null;
}

function retryAfterOf(error) {
  const raw =
    error?.retryAfterSeconds ??
    error?.retry_after_seconds ??
    error?.cause?.retryAfterSeconds ??
    error?.cause?.retry_after_seconds;
  const seconds = finiteOrNull(raw);
  if (seconds == null || seconds < 0) return null;
  return Math.min(seconds, 86400);
}

function signalText(error) {
  const values = [
    error?.code,
    error?.providerCode,
    error?.name,
    error?.message,
    error?.error,
    error?.type,
    error?.details?.code,
    error?.details?.type,
    error?.response?.data?.code,
    error?.response?.data?.error?.code,
    error?.response?.data?.error?.type,
    error?.cause?.code,
    error?.cause?.providerCode,
    error?.cause?.name,
    error?.cause?.message
  ]
    .map(optionalText)
    .filter(Boolean);

  return values.join(' ').toLowerCase();
}

function hasAny(text, patterns) {
  return patterns.some(pattern =>
    pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern)
  );
}

function isCancelled(error, context, signals) {
  return Boolean(
    context?.cancelled === true ||
    error?.cancelled === true ||
    hasAny(signals, [
      'provider_request_cancelled',
      'cancelled',
      'canceled',
      'aborterror',
      'aborted'
    ])
  );
}

function classifyProviderError(error, context = {}) {
  const signals = signalText(error);
  const statusCode = statusOf(error);

  if (isCancelled(error, context, signals)) return null;

  if (hasAny(signals, [
    'content_filter',
    'content restriction',
    'content_restriction',
    'content policy',
    'policy_violation',
    'moderation',
    'safety',
    'unsafe',
    'blocked_content',
    'blocked content'
  ])) {
    return ERROR_CATEGORIES.CONTENT_RESTRICTION;
  }

  if (hasAny(signals, [
    'insufficient_quota',
    'quota_exceeded',
    'quota exceeded',
    'quota_exhausted',
    'quota exhausted',
    'billing_hard_limit',
    'billing hard limit',
    'credit balance exhausted',
    'capacity exhausted'
  ])) {
    return ERROR_CATEGORIES.QUOTA;
  }

  if (
    statusCode === 429 ||
    hasAny(signals, [
      'rate_limit',
      'rate limit',
      'rate-limited',
      'rate limited',
      'too_many_requests',
      'too many requests',
      'throttl'
    ])
  ) {
    return ERROR_CATEGORIES.RATE_LIMIT;
  }

  if (
    error?.timedOut === true ||
    context?.timedOut === true ||
    statusCode === 408 ||
    statusCode === 504 ||
    hasAny(signals, [
      'provider_request_timeout',
      'timeout',
      'timed out',
      'deadline exceeded',
      'deadline_exceeded'
    ])
  ) {
    return ERROR_CATEGORIES.TIMEOUT;
  }

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    hasAny(signals, [
      'invalid_api_key',
      'invalid api key',
      'authentication',
      'unauthorized',
      'forbidden',
      'auth_error',
      'auth error',
      'provider_not_configured',
      'credential',
      'permission_denied'
    ])
  ) {
    return ERROR_CATEGORIES.AUTH;
  }

  if (
    hasAny(signals, [
      'model_not_found',
      'model not found',
      'model_unavailable',
      'model unavailable',
      'unsupported_model',
      'unsupported model',
      'provider_not_registered',
      'deployment_not_found',
      'deployment not found'
    ]) ||
    (statusCode === 404 && hasAny(signals, ['model', 'deployment']))
  ) {
    return ERROR_CATEGORIES.MODEL_UNAVAILABLE;
  }

  if (
    statusCode === 502 ||
    statusCode === 503 ||
    hasAny(signals, [
      'provider_down',
      'provider down',
      'service_unavailable',
      'service unavailable',
      'upstream_unavailable',
      'upstream unavailable',
      'all_models_failed',
      'all models failed',
      'all_providers_failed',
      'all providers failed',
      'all_image_providers_failed',
      'connection refused',
      'econnrefused',
      'econnreset',
      'network error',
      'network_error'
    ])
  ) {
    return ERROR_CATEGORIES.DOWN;
  }

  if (
    statusCode === 400 ||
    statusCode === 405 ||
    statusCode === 409 ||
    statusCode === 413 ||
    statusCode === 415 ||
    statusCode === 422 ||
    hasAny(signals, [
      'invalid_request',
      'invalid request',
      'bad_request',
      'bad request',
      'validation_error',
      'validation error',
      'malformed',
      'unsupported operation',
      'unsupported_operation'
    ])
  ) {
    return ERROR_CATEGORIES.INVALID_REQUEST;
  }

  return ERROR_CATEGORIES.INTERNAL;
}

function policyForCategory(category) {
  if (!CATEGORY_SET.has(category)) {
    throw new Error(`provider_error_category_invalid:${String(category || '')}`);
  }
  return POLICY[category];
}

function normalizeProviderFailure(error, context = {}) {
  const signals = signalText(error);
  const cancelled = isCancelled(error, context, signals);
  const providerId = optionalText(context.providerId ?? error?.providerId);
  const capability = optionalText(context.capability ?? error?.capability);
  const providerCode = optionalText(
    error?.providerCode ??
    error?.code ??
    error?.cause?.providerCode ??
    error?.cause?.code
  );
  const statusCode = statusOf(error);
  const retryAfterSeconds = retryAfterOf(error);

  if (cancelled) {
    const control = CONFIG.controlFlow.CANCELLED;
    return Object.freeze({
      version: CONFIG.version,
      kind: 'CONTROL_FLOW',
      category: null,
      code: 'CANCELLED',
      providerId,
      capability,
      providerCode,
      statusCode,
      retryAfterSeconds,
      retryable: false,
      retry: Object.freeze({
        maxSameProviderRetries: 0,
        baseDelayMs: 0,
        maxDelayMs: 0,
        honorRetryAfter: false
      }),
      fallbackAllowed: false,
      countAsProviderHealthFailure: false,
      quotaImpact: 'NONE',
      userMessage: control.userMessage
    });
  }

  const category = classifyProviderError(error, context);
  const policy = policyForCategory(category);

  return Object.freeze({
    version: CONFIG.version,
    kind: 'PROVIDER_FAILURE',
    category,
    code: `PROVIDER_${category}`,
    providerId,
    capability,
    providerCode,
    statusCode,
    retryAfterSeconds,
    retryable: policy.retryable,
    retry: Object.freeze({
      maxSameProviderRetries: policy.maxSameProviderRetries,
      baseDelayMs: policy.baseDelayMs,
      maxDelayMs: policy.maxDelayMs,
      honorRetryAfter: policy.honorRetryAfter
    }),
    fallbackAllowed: policy.fallbackAllowed,
    countAsProviderHealthFailure: policy.countAsProviderHealthFailure,
    quotaImpact: policy.quotaImpact,
    userMessage: policy.userMessage
  });
}

function retryDecision(normalizedFailure, retriesAlreadyUsed = 0) {
  if (!normalizedFailure || normalizedFailure.kind !== 'PROVIDER_FAILURE') {
    return Object.freeze({
      shouldRetrySameProvider: false,
      delayMs: 0,
      retriesRemaining: 0,
      bounded: true
    });
  }

  const used = integerOrNull(retriesAlreadyUsed);
  if (used == null || used < 0) {
    throw new Error('provider_retry_count_invalid');
  }

  const retry = normalizedFailure.retry;
  const max = retry.maxSameProviderRetries;
  const shouldRetrySameProvider =
    normalizedFailure.retryable === true &&
    used < max;

  if (!shouldRetrySameProvider) {
    return Object.freeze({
      shouldRetrySameProvider: false,
      delayMs: 0,
      retriesRemaining: Math.max(0, max - used),
      bounded: true
    });
  }

  let delayMs = retry.baseDelayMs;
  if (
    retry.honorRetryAfter === true &&
    normalizedFailure.retryAfterSeconds != null
  ) {
    delayMs = normalizedFailure.retryAfterSeconds * 1000;
  } else if (used > 0) {
    delayMs = retry.baseDelayMs * (2 ** used);
  }

  delayMs = Math.max(0, Math.min(delayMs, retry.maxDelayMs));

  return Object.freeze({
    shouldRetrySameProvider: true,
    delayMs,
    retriesRemaining: Math.max(0, max - used - 1),
    bounded: true
  });
}

function fallbackDecision(normalizedFailure) {
  return Object.freeze({
    allowed: Boolean(
      normalizedFailure &&
      normalizedFailure.kind === 'PROVIDER_FAILURE' &&
      normalizedFailure.fallbackAllowed === true
    ),
    reason: normalizedFailure?.category || normalizedFailure?.code || 'UNKNOWN'
  });
}

function publicProviderError(normalizedFailure) {
  if (!normalizedFailure) {
    return Object.freeze({
      code: 'PROVIDER_INTERNAL',
      category: ERROR_CATEGORIES.INTERNAL,
      message: POLICY.INTERNAL.userMessage,
      retryable: true
    });
  }

  if (normalizedFailure.kind === 'CONTROL_FLOW') {
    return Object.freeze({
      code: normalizedFailure.code,
      category: null,
      message: normalizedFailure.userMessage,
      retryable: false
    });
  }

  return Object.freeze({
    code: normalizedFailure.code,
    category: normalizedFailure.category,
    message: normalizedFailure.userMessage,
    retryable: normalizedFailure.retryable
  });
}

function assertPolicyInvariant() {
  if (CONFIG.categories.length !== CATEGORY_SET.size) {
    throw new Error('provider_error_taxonomy_duplicate_category');
  }

  for (const category of CONFIG.categories) {
    const policy = POLICY[category];
    if (!policy) throw new Error(`provider_error_policy_missing:${category}`);
    if (typeof policy.retryable !== 'boolean') {
      throw new Error(`provider_error_retryable_invalid:${category}`);
    }
    if (!Number.isSafeInteger(policy.maxSameProviderRetries) || policy.maxSameProviderRetries < 0) {
      throw new Error(`provider_error_max_retries_invalid:${category}`);
    }
    if (policy.maxSameProviderRetries > 1) {
      throw new Error(`provider_error_retry_unbounded:${category}`);
    }
    if (!Number.isSafeInteger(policy.maxDelayMs) || policy.maxDelayMs < 0 || policy.maxDelayMs > 30000) {
      throw new Error(`provider_error_max_delay_invalid:${category}`);
    }
    if (!policy.userMessage || typeof policy.userMessage !== 'string') {
      throw new Error(`provider_error_user_message_missing:${category}`);
    }
    if (typeof policy.fallbackAllowed !== 'boolean') {
      throw new Error(`provider_error_fallback_invalid:${category}`);
    }
  }

  if (POLICY.CONTENT_RESTRICTION.fallbackAllowed !== false) {
    throw new Error('content_restriction_fallback_must_be_false');
  }
  if (POLICY.INVALID_REQUEST.fallbackAllowed !== false) {
    throw new Error('invalid_request_fallback_must_be_false');
  }
  return true;
}

module.exports = {
  ERROR_CATEGORIES,
  classifyProviderError,
  normalizeProviderFailure,
  retryDecision,
  fallbackDecision,
  publicProviderError,
  policyForCategory,
  assertPolicyInvariant
};
