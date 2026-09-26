'use strict';

const {
  SUBSCRIPTION_PRICE_ENV_KEYS
} = require('./billingCatalog');
const {
  canonicalStripeCatalogActive,
  requiredPriceBindings
} = require('./stripeCanonicalCatalog');
const {
  stripeModeStatus,
  billingV1IsActive,
  liveBillingAllowed
} = require('./stripeClient');

function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidHttpUrl(value) {
  if (!isNonEmpty(value)) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function collectMissing(env, keys) {
  return keys.filter(key => !isNonEmpty(env[key]));
}

function requiredSubscriptionPriceKeys() {
  return Object.freeze(Object.values(SUBSCRIPTION_PRICE_ENV_KEYS));
}

function validateBillingConfiguration(env, warnings, errors, production) {
  const stripeKeys = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_BILLING_MODE',
    ...requiredSubscriptionPriceKeys(),
    'APP_URL'
  ];

  const configured = stripeKeys.filter(key => isNonEmpty(env[key]));
  const billingActive = billingV1IsActive(env);
  const stripePresent = configured.length > 0;

  if (stripePresent) {
    const missing = collectMissing(env, stripeKeys);
    if (missing.length > 0) {
      const message =
        `Stripe is partially configured. Missing: ${missing.join(', ')}. Billing routes will fail closed.`;
      if (billingActive && production) errors.push(message);
      else warnings.push(message);
    }

    const mode = stripeModeStatus(env);
    if (!mode.valid) {
      const message =
        `Stripe mode contract is invalid: ${mode.blockers.join(', ')}. Billing routes will fail closed.`;
      if (billingActive && production) errors.push(message);
      else warnings.push(message);
    }
  }

  if (canonicalStripeCatalogActive(env)) {
    const missingBindings = collectMissing(env, requiredPriceBindings());
    if (missingBindings.length > 0) {
      const message =
        `Canonical Stripe catalog is active but price bindings are missing: ${missingBindings.join(', ')}.`;
      if (billingActive && production) errors.push(message);
      else warnings.push(message);
    }
  }

  if (
    production &&
    billingActive &&
    stripeModeStatus(env).configuredMode === 'live' &&
    !liveBillingAllowed(env)
  ) {
    warnings.push(
      'ZUVYR billing is active in Stripe live mode but LIVE_BILLING_ALLOWED is not true. New live checkout creation remains fail-closed.'
    );
  }

  if (isNonEmpty(env.APP_URL) && !isValidHttpUrl(env.APP_URL)) {
    warnings.push('APP_URL must be an absolute http(s) URL.');
  }
}

function validateProviderConfiguration(env, warnings) {
  if (!isNonEmpty(env.FAL_KEY) && !isNonEmpty(env.REPLICATE_API_TOKEN)) {
    warnings.push(
      'No image provider is configured. Image generation jobs will fail until FAL_KEY or REPLICATE_API_TOKEN is set.'
    );
  }

  if (!isNonEmpty(env.REPLICATE_API_TOKEN)) {
    warnings.push(
      'REPLICATE_API_TOKEN is not set. Video generation is unavailable.'
    );
  }
}

function validateServerEnvironment(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  const coreKeys = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];

  if (production) {
    coreKeys.push('REDIS_URL', 'OPENROUTER_API_KEY');
  }

  const missingCore = collectMissing(env, coreKeys);
  if (missingCore.length > 0) {
    errors.push(`Missing required environment variables: ${missingCore.join(', ')}`);
  }

  if (isNonEmpty(env.SUPABASE_URL) && !isValidHttpUrl(env.SUPABASE_URL)) {
    errors.push('SUPABASE_URL must be an absolute http(s) URL.');
  }

  if (production && !isNonEmpty(env.ALLOWED_ORIGINS)) {
    warnings.push(
      'ALLOWED_ORIGINS is empty. Only built-in localhost and exact ZUVYR Vercel aliases (rox-ai-sepia.vercel.app, rox-ai-rox-ai.vercel.app, rox-ai-git-main-rox-ai.vercel.app) will be allowed.'
    );
  }

  if (production && !isNonEmpty(env.METRICS_TOKEN)) {
    warnings.push('METRICS_TOKEN is not set. /metrics is fail-closed until M02 configures the operator token.');
  }

  const maintenanceStrategy = String(env.MAINTENANCE_STRATEGY || '').trim();

  if (
    maintenanceStrategy &&
    maintenanceStrategy !== 'railway_internal_route'
  ) {
    errors.push('MAINTENANCE_STRATEGY must be railway_internal_route when configured.');
  }

  if (
    production &&
    isNonEmpty(env.CRON_SECRET) &&
    maintenanceStrategy !== 'railway_internal_route'
  ) {
    errors.push('CRON_SECRET may only be enabled with MAINTENANCE_STRATEGY=railway_internal_route.');
  }

  if (
    production &&
    maintenanceStrategy === 'railway_internal_route' &&
    !isNonEmpty(env.CRON_SECRET)
  ) {
    errors.push('MAINTENANCE_STRATEGY is enabled but CRON_SECRET is missing.');
  }

  if (production && !isNonEmpty(env.CRON_SECRET)) {
    warnings.push('CRON_SECRET is not set. Internal scheduled routes remain disabled.');
  }

  validateBillingConfiguration(env, warnings, errors, production);
  validateProviderConfiguration(env, warnings);

  return { errors, warnings };
}

function validateWorkerEnvironment(env = process.env) {
  const errors = [];
  const warnings = [];

  const missingCore = collectMissing(env, [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'REDIS_URL'
  ]);

  if (missingCore.length > 0) {
    errors.push(`Missing required worker environment variables: ${missingCore.join(', ')}`);
  }

  if (!isNonEmpty(env.FAL_KEY) && !isNonEmpty(env.REPLICATE_API_TOKEN)) {
    warnings.push(
      'No image provider is configured. Image jobs will exhaust retries and be refunded.'
    );
  }

  if (!isNonEmpty(env.REPLICATE_API_TOKEN)) {
    warnings.push(
      'REPLICATE_API_TOKEN is not set. Video jobs will exhaust retries and be refunded.'
    );
  }

  return { errors, warnings };
}

function reportEnvironmentValidation(result, options = {}) {
  const logger = options.logger || console;
  const component = options.component || 'server';

  for (const warning of result.warnings) {
    logger.warn(`[env:${component}] ${warning}`);
  }

  if (result.errors.length > 0) {
    const error = new Error(
      `[env:${component}] ${result.errors.join(' ')}`
    );
    error.code = 'invalid_environment';
    error.validationErrors = result.errors;
    throw error;
  }

  return result;
}

module.exports = {
  isNonEmpty,
  isValidHttpUrl,
  requiredSubscriptionPriceKeys,
  validateServerEnvironment,
  validateWorkerEnvironment,
  reportEnvironmentValidation
};
