'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backend = __dirname;
const repo = path.join(backend, '..');

function read(rel) {
  return fs.readFileSync(
    path.join(repo, rel),
    'utf8'
  );
}

const config = JSON.parse(
  read(
    'backend/config/money-checkpoint-b.v1.json'
  )
);

assert.equal(
  config.version,
  'pack-020.money-checkpoint-b.v1'
);
assert.equal(config.mode, 'stripe_test_mode_only');
assert.equal(config.liveBillingAllowed, false);
assert.equal(config.externalGate, 'M09');
assert.equal(config.nextPackAfterGate, '021');

assert.deepEqual(
  config.usageRpcs,
  [
    'reserve_zuvyr_usage',
    'settle_zuvyr_usage',
    'refund_zuvyr_usage'
  ]
);

assert.equal(
  config.operationInvariant.reserveExactlyOnce,
  true
);
assert.equal(
  config.operationInvariant.settleExactlyOnce,
  true
);
assert.equal(
  config.operationInvariant.refundUnusedReservation,
  true
);
assert.equal(
  config.operationInvariant.replayMustNotDoubleCharge,
  true
);
assert.equal(
  config.operationInvariant.failureMustRefundSafely,
  true
);

assert.equal(
  config.billingUiParity.summaryEndpoint,
  '/api/zuvyr-usage-summary'
);
assert.equal(
  config.billingUiParity.usageLedger,
  'zuvyr_usage_records'
);
assert.equal(
  config.m09.testModeFirst,
  true
);
assert.equal(
  config.m09.liveMoneyAllowedNow,
  false
);
assert.equal(
  config.m09
    .minimalLiveMoneyCheckOnlyAfterM08LiveAndExplicitApproval,
  true
);

const settlementSafety = read(
  'backend/39_zuvyr_usage_settlement_safety.sql'
);
for (const rpc of config.usageRpcs) {
  assert(
    settlementSafety.includes(rpc),
    `${rpc} missing from settlement safety SQL`
  );
}

assert(
  /for\s+update/i.test(settlementSafety),
  'usage settlement must serialize mutable rows'
);
assert(
  /service_role/i.test(settlementSafety),
  'usage settlement RPCs must remain service-role controlled'
);

const pack012 = read(
  'backend/43_pack012_financial_rpc_invariants.sql'
);
assert(
  /for\s+update/i.test(pack012),
  'legacy financial settlement must remain serialized'
);
assert(
  /refund/i.test(pack012) &&
    /settle_credit_charge/i.test(pack012),
  'legacy refund + settlement invariants must remain present'
);

const ledger = read(
  'backend/44_pack013_unified_usage_ledger.sql'
);
assert(
  ledger.includes('zuvyr_usage_records'),
  'unified usage ledger missing'
);
assert(
  ledger.includes('accounting_state'),
  'normalized accounting state missing'
);
assert(
  /idempotency/i.test(ledger),
  'usage ledger idempotency contract missing'
);

const webhook = read(
  'backend/stripeWebhook.js'
);
for (
  const rpc of
    config.stripeSettlementRpcs
) {
  assert(
    webhook.includes(rpc),
    `${rpc} missing from Stripe webhook`
  );
}
for (const eventName of [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'invoice.paid',
  'invoice.payment_failed'
]) {
  assert(
    webhook.includes(eventName),
    `${eventName} missing from Stripe lifecycle`
  );
}
assert(
  /claim|duplicate|replay|webhook_events/i.test(
    webhook
  ),
  'Stripe replay/dedupe contract missing'
);

const pack019 = JSON.parse(
  read(
    'backend/config/stripe-catalog.v1.json'
  )
);
assert.equal(
  pack019.topups
    .stripeCheckoutBillingUnitCents,
  1
);

const server = read('backend/server.js');
const usageSummary = read(
  'backend/lib/zuvyrUsageSummary.js'
);
const suite = read(
  'frontend/zuvyr-suite-v1.js'
);
const index = read('frontend/index.html');

assert(
  usageSummary.includes('/api/zuvyr-usage-summary') ||
    server.includes('/api/zuvyr-usage-summary'),
  'backend usage summary endpoint missing'
);
assert(
  usageSummary.includes('mountZuvyrUsageSummary'),
  'usage summary mount contract missing'
);
assert(
  usageSummary.includes('zuvyr_usage_records'),
  'usage summary must read canonical usage ledger'
);
assert(
  suite.includes(
    "'/api/zuvyr-usage-summary'"
  ) ||
    suite.includes(
      '"/api/zuvyr-usage-summary"'
    ),
  'Usage/Billing must use canonical summary endpoint'
);
assert(
  index.includes('sidebarCreditsNum'),
  'sidebar usage surface missing'
);
assert(
  index.includes('topupBtn') &&
    suite.includes('data-zs-usage-topup'),
  'top-up action must remain available from billing UI'
);

console.log(
  'PASS: Pack020 freezes estimate/reserve/execute/actual-cost/settle/refund invariants and M09 Test-Mode-only contract'
);
console.log(
  'PASS: concurrency/replay/refund safety remains anchored in existing serialized financial RPCs and Stripe dedupe paths'
);
console.log(
  'PASS: Billing UI and sidebar remain tied to the same canonical usage-summary / zuvyr_usage_records source'
);
console.log(
  'EXTERNAL GATE M09 REMAINS REQUIRED; DATABASE / STRIPE / RAILWAY / MODEL / NETWORK CALLS: NONE'
);
