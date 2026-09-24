'use strict';

const Stripe = require('stripe');

let stripeClient = null;
let stripeSecretSnapshot = null;

const STRIPE_BILLING_MODES = new Set(['test', 'live']);

function envTrue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function missingEnvironmentVariables(keys, env = process.env) {
  return keys.filter(
    key => typeof env[key] !== 'string' || env[key].trim().length === 0
  );
}

function stripeSecretMode(secret) {
  const value = String(secret || '').trim();
  if (/^(?:sk|rk)_test_/i.test(value)) return 'test';
  if (/^(?:sk|rk)_live_/i.test(value)) return 'live';
  return null;
}

function configuredStripeMode(env = process.env) {
  const mode = String(env.STRIPE_BILLING_MODE || '').trim().toLowerCase();
  return STRIPE_BILLING_MODES.has(mode) ? mode : null;
}

function stripeModeStatus(env = process.env) {
  const configuredMode = configuredStripeMode(env);
  const secretMode = stripeSecretMode(env.STRIPE_SECRET_KEY);
  const blockers = [];

  if (!configuredMode) blockers.push('stripe_billing_mode_missing_or_invalid');
  if (!secretMode) blockers.push('stripe_secret_key_mode_unknown');
  if (configuredMode && secretMode && configuredMode !== secretMode) {
    blockers.push('stripe_secret_key_mode_mismatch');
  }

  return Object.freeze({
    valid: blockers.length === 0,
    configuredMode,
    secretMode,
    blockers: Object.freeze(blockers)
  });
}

function billingV1IsActive(env = process.env) {
  return envTrue(env.ZUVYR_BILLING_V1_ACTIVE);
}

function liveBillingAllowed(env = process.env) {
  return envTrue(env.LIVE_BILLING_ALLOWED);
}

function billingExecutionStatus(env = process.env) {
  const mode = stripeModeStatus(env);
  const blockers = [...mode.blockers];

  if (!billingV1IsActive(env)) blockers.push('billing_v1_not_active');
  if (mode.configuredMode === 'live' && !liveBillingAllowed(env)) {
    blockers.push('live_billing_not_allowed');
  }

  return Object.freeze({
    allowed: blockers.length === 0,
    configuredMode: mode.configuredMode,
    secretMode: mode.secretMode,
    blockers: Object.freeze(blockers)
  });
}

function stripeWebhookEventDecision(event, env = process.env) {
  const mode = stripeModeStatus(env);

  if (!mode.valid) {
    return Object.freeze({
      accepted: false,
      retryable: true,
      reason: 'stripe_mode_not_configured',
      configuredMode: mode.configuredMode,
      eventMode: event?.livemode === true ? 'live' : 'test'
    });
  }

  const eventMode = event?.livemode === true ? 'live' : 'test';
  if (eventMode !== mode.configuredMode) {
    return Object.freeze({
      accepted: false,
      retryable: false,
      reason: 'stripe_event_mode_mismatch',
      configuredMode: mode.configuredMode,
      eventMode
    });
  }

  if (
    mode.configuredMode === 'test' &&
    env.NODE_ENV === 'production' &&
    !envTrue(env.ZUVYR_STRIPE_TEST_SETTLEMENT_ALLOWED)
  ) {
    return Object.freeze({
      accepted: false,
      retryable: false,
      reason: 'stripe_test_settlement_disabled',
      configuredMode: mode.configuredMode,
      eventMode
    });
  }

  return Object.freeze({
    accepted: true,
    retryable: false,
    reason: null,
    configuredMode: mode.configuredMode,
    eventMode
  });
}

function getStripeClient(env = process.env) {
  const secret = env.STRIPE_SECRET_KEY;
  const mode = stripeModeStatus(env);

  if (!secret || !mode.valid) {
    return null;
  }

  if (!stripeClient || stripeSecretSnapshot !== secret) {
    stripeClient = new Stripe(secret);
    stripeSecretSnapshot = secret;
  }

  return stripeClient;
}

function normalizeAppUrl(value = process.env.APP_URL) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function sendBillingUnavailable(res, missing = [], code = 'billing_not_configured') {
  if (missing.length > 0) {
    console.error(
      '[billing] configuration incomplete:',
      missing.join(', ')
    );
  }

  return res.status(503).json({
    status: 'error',
    code,
    message: 'Billing is temporarily unavailable.'
  });
}

module.exports = {
  STRIPE_BILLING_MODES,
  envTrue,
  getStripeClient,
  missingEnvironmentVariables,
  stripeSecretMode,
  configuredStripeMode,
  stripeModeStatus,
  billingV1IsActive,
  liveBillingAllowed,
  billingExecutionStatus,
  stripeWebhookEventDecision,
  sendBillingUnavailable,
  normalizeAppUrl
};
