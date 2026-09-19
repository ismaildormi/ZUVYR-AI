'use strict';

const { CREDIT_PRICE_USD } = require('./creditEconomics');
const { config, browserError } = require('./cloudBrowserPolicy');

const USAGE_KIND = 'browser_runtime';
const MODEL_USED = 'browserbase-cloud-browser';

function quoteError(code) {
  return browserError(code);
}

function browserCostQuote(seconds) {
  const duration = Number(seconds);
  if (!Number.isFinite(duration) || duration < 0 || duration > config.session.maxTtlSeconds) {
    throw quoteError('cloud_browser_duration_invalid');
  }

  if (
    config.pricing.verificationStatus !== 'verified' ||
    config.pricing.billingAuthority !== true
  ) {
    throw quoteError('cloud_browser_pricing_unverified');
  }

  const microUsdPerHour = Number(
    config.pricing.connectedAccountMicroUsdPerBrowserHour
  );

  if (!Number.isSafeInteger(microUsdPerHour) || microUsdPerHour < 0) {
    throw quoteError('cloud_browser_effective_price_invalid');
  }

  const providerMicroUsd = Math.ceil(
    (microUsdPerHour * Math.ceil(duration)) / 3600
  );

  const providerUsd = providerMicroUsd / 1_000_000;
  const credits = Math.max(
    0,
    Math.ceil((providerUsd * 2) / CREDIT_PRICE_USD)
  );

  return Object.freeze({
    seconds: Math.ceil(duration),
    providerMicroUsd,
    providerUsd,
    credits,
    targetGrossMarginBps: 5000,
    pricingVersion: config.version + ':connected-account'
  });
}

function createCloudBrowserUsageBridge(creditApi = {}) {
  const reserveCredits = creditApi.reserveCredits;
  const settleCredits = creditApi.settleCredits;
  const refundCredits = creditApi.refundCredits;

  async function reserveSession({
    userId,
    requestId,
    taskRunId = null
  } = {}) {
    if (typeof reserveCredits !== 'function') {
      throw quoteError('cloud_browser_usage_reserve_unavailable');
    }

    const quote = browserCostQuote(config.session.maxTtlSeconds);

    if (quote.credits < 1) {
      throw quoteError('cloud_browser_zero_cost_policy_unverified');
    }

    const reservation = await reserveCredits({
      userId,
      requestId,
      feature: 'browser',
      modelUsed: MODEL_USED,
      creditsConsumed: quote.credits,
      projectId: null,
      taskId: taskRunId || requestId,
      stepId: 'browser-session',
      usageKind: USAGE_KIND,
      pricingVersion: quote.pricingVersion
    });

    return Object.freeze({
      quote,
      reservation
    });
  }

  async function settleSession(requestId, usageSeconds) {
    if (typeof settleCredits !== 'function') {
      throw quoteError('cloud_browser_usage_settle_unavailable');
    }
    const quote = browserCostQuote(usageSeconds);
    const settlement = await settleCredits(requestId, quote.credits);
    return Object.freeze({ quote, settlement });
  }

  async function refundSession(requestId) {
    if (typeof refundCredits !== 'function') {
      throw quoteError('cloud_browser_usage_refund_unavailable');
    }
    return refundCredits(requestId);
  }

  function status() {
    return Object.freeze({
      usageKind: USAGE_KIND,
      feature: 'browser',
      modelUsed: MODEL_USED,
      reserve: typeof reserveCredits === 'function',
      settle: typeof settleCredits === 'function',
      refund: typeof refundCredits === 'function',
      pricingVerified:
        config.pricing.verificationStatus === 'verified' &&
        config.pricing.billingAuthority === true
    });
  }

  return Object.freeze({
    reserveSession,
    settleSession,
    refundSession,
    status
  });
}

module.exports = {
  USAGE_KIND,
  MODEL_USED,
  browserCostQuote,
  createCloudBrowserUsageBridge
};
