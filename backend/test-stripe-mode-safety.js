'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  stripeSecretMode,
  configuredStripeMode,
  stripeModeStatus,
  billingExecutionStatus,
  stripeWebhookEventDecision,
  hardenWebhookParser
} = require('./lib/stripeClient');
const {
  requiredSubscriptionPriceKeys,
  validateServerEnvironment
} = require('./lib/envValidation');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

assert.deepEqual(
  [...requiredSubscriptionPriceKeys()].sort(),
  [
    'STRIPE_PLUS_PRICE_ID',
    'STRIPE_PRO_PRICE_ID',
    'STRIPE_LEGEND_PRICE_ID',
    'STRIPE_MAX_PRICE_ID'
  ].sort()
);

assert.equal(stripeSecretMode('sk_test_example'), 'test');
assert.equal(stripeSecretMode('rk_test_example'), 'test');
assert.equal(stripeSecretMode('sk_live_example'), 'live');
assert.equal(stripeSecretMode('rk_live_example'), 'live');
assert.equal(stripeSecretMode('not-a-stripe-key'), null);
assert.equal(configuredStripeMode({ STRIPE_BILLING_MODE: 'TEST' }), 'test');
assert.equal(configuredStripeMode({ STRIPE_BILLING_MODE: 'live' }), 'live');
assert.equal(configuredStripeMode({ STRIPE_BILLING_MODE: 'unknown' }), null);

let status = stripeModeStatus({
  STRIPE_BILLING_MODE: 'test',
  STRIPE_SECRET_KEY: 'sk_live_example'
});
assert.equal(status.valid, false);
assert(status.blockers.includes('stripe_secret_key_mode_mismatch'));

status = stripeModeStatus({
  STRIPE_BILLING_MODE: 'test',
  STRIPE_SECRET_KEY: 'sk_test_example'
});
assert.equal(status.valid, true);

let execution = billingExecutionStatus({
  STRIPE_BILLING_MODE: 'live',
  STRIPE_SECRET_KEY: 'sk_live_example',
  ZUVYR_BILLING_V1_ACTIVE: 'true',
  LIVE_BILLING_ALLOWED: 'false'
});
assert.equal(execution.allowed, false);
assert(execution.blockers.includes('live_billing_not_allowed'));

execution = billingExecutionStatus({
  STRIPE_BILLING_MODE: 'test',
  STRIPE_SECRET_KEY: 'sk_test_example',
  ZUVYR_BILLING_V1_ACTIVE: 'false'
});
assert.equal(execution.allowed, false);
assert(execution.blockers.includes('billing_v1_not_active'));

let decision = stripeWebhookEventDecision(
  { livemode: true },
  {
    NODE_ENV: 'production',
    STRIPE_BILLING_MODE: 'test',
    STRIPE_SECRET_KEY: 'sk_test_example'
  }
);
assert.equal(decision.accepted, false);
assert.equal(decision.reason, 'stripe_event_mode_mismatch');

decision = stripeWebhookEventDecision(
  { livemode: false },
  {
    NODE_ENV: 'production',
    STRIPE_BILLING_MODE: 'test',
    STRIPE_SECRET_KEY: 'sk_test_example'
  }
);
assert.equal(decision.accepted, false);
assert.equal(decision.reason, 'stripe_test_settlement_disabled');

decision = stripeWebhookEventDecision(
  { livemode: false },
  {
    NODE_ENV: 'production',
    STRIPE_BILLING_MODE: 'test',
    STRIPE_SECRET_KEY: 'sk_test_example',
    ZUVYR_STRIPE_TEST_SETTLEMENT_ALLOWED: 'true'
  }
);
assert.equal(decision.accepted, true);

const fakeClient = {
  webhooks: {
    constructEvent: (_payload, _signature, _secret, event) => event
  }
};
const hardened = hardenWebhookParser(fakeClient, {
  NODE_ENV: 'production',
  STRIPE_BILLING_MODE: 'live',
  STRIPE_SECRET_KEY: 'sk_live_example'
});
assert.throws(
  () => hardened.webhooks.constructEvent(null, null, null, { livemode: false }),
  error => error.code === 'stripe_event_mode_mismatch'
);
assert.equal(
  hardened.webhooks.constructEvent(null, null, null, { livemode: true }).livemode,
  true
);

const completeStripeEnv = {
  NODE_ENV: 'production',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  REDIS_URL: 'redis://redis:6379',
  OPENROUTER_API_KEY: 'openrouter-key',
  ALLOWED_ORIGINS: 'https://app.example.com',
  METRICS_TOKEN: 'metrics-token',
  CRON_SECRET: 'cron-secret',
  MAINTENANCE_STRATEGY: 'railway_internal_route',
  STRIPE_SECRET_KEY: 'sk_test_example',
  STRIPE_WEBHOOK_SECRET: 'whsec_example',
  STRIPE_BILLING_MODE: 'test',
  STRIPE_PLUS_PRICE_ID: 'price_plus',
  STRIPE_PRO_PRICE_ID: 'price_pro',
  STRIPE_LEGEND_PRICE_ID: 'price_legend',
  STRIPE_MAX_PRICE_ID: 'price_max',
  APP_URL: 'https://app.example.com',
  ZUVYR_BILLING_V1_ACTIVE: 'false'
};

let validation = validateServerEnvironment(completeStripeEnv);
assert.deepEqual(validation.errors, []);
assert(
  !validation.warnings.some(message => message.includes('Stripe is partially configured'))
);

validation = validateServerEnvironment({
  ...completeStripeEnv,
  ZUVYR_BILLING_V1_ACTIVE: 'true',
  STRIPE_PLUS_PRICE_ID: ''
});
assert(
  validation.errors.some(message => message.includes('STRIPE_PLUS_PRICE_ID'))
);

validation = validateServerEnvironment({
  ...completeStripeEnv,
  ZUVYR_BILLING_V1_ACTIVE: 'true',
  STRIPE_BILLING_MODE: 'live',
  STRIPE_SECRET_KEY: 'sk_live_example',
  LIVE_BILLING_ALLOWED: 'false'
});
assert(
  validation.warnings.some(message => message.includes('LIVE_BILLING_ALLOWED'))
);

const subscriptionRoute = read('createCheckoutSession.js');
const topupRoute = read('createTopupSession.js');
const packageJson = read('package.json');

for (const [name, source] of [
  ['subscription checkout', subscriptionRoute],
  ['top-up checkout', topupRoute]
]) {
  assert(source.includes('billingV1IsActive'));
  assert(source.includes('billingExecutionStatus'));
  assert(source.includes("'STRIPE_BILLING_MODE'"));
  assert(
    source.indexOf('billingExecutionStatus') < source.indexOf('checkout.sessions.create'),
    `${name} must gate billing before creating a Stripe Checkout Session`
  );
}

assert(
  packageJson.includes('node test-stripe-mode-safety.js') &&
    packageJson.includes('node test-stripe-webhook-runtime.js'),
  'Stripe safety/runtime tests must be part of the unit-test gate'
);

console.log('PASS: Stripe secret and configured modes must match');
console.log('PASS: production test webhooks are blocked unless explicitly authorized');
console.log('PASS: live checkout stays fail-closed until LIVE_BILLING_ALLOWED=true');
console.log('PASS: all four paid-plan Stripe price IDs are validated');
console.log('PASS: subscription and top-up checkout share the explicit billing activation gate');
console.log('NETWORK / DATABASE / STRIPE CALLS: NONE');
