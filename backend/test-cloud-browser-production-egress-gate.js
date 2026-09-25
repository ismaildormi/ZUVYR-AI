'use strict';

const assert = require('node:assert/strict');
const { availability, assertLiveAvailable } = require('./lib/cloudBrowserPolicy');

const base = {
  RAILWAY_ENVIRONMENT_NAME: 'production',
  LIVE_BILLING_ALLOWED: 'true',
  ZUVYR_M17_VERIFIED: 'true',
  ZUVYR_BROWSER_PRICING_VERIFIED: 'true',
  BROWSERBASE_API_KEY: 'test-only',
  BROWSERBASE_PROJECT_ID: 'test-project',
  BROWSERBASE_BROWSER_HOUR_PRICE_MICRO_USD: '120000',
  BROWSERBASE_PRICING_VERSION: 'test-version'
};

const blocked = availability(base);
assert.equal(blocked.live, false);
assert.equal(blocked.privateEgressVerified, false);
assert(blocked.blockers.includes('pack081_private_egress_unverified'));
assert.throws(
  () => assertLiveAvailable(base),
  error => error.code === 'cloud_browser_live_gate_closed' && error.blockers.includes('pack081_private_egress_unverified')
);

const verified = availability({
  ...base,
  ZUVYR_BROWSER_PRIVATE_EGRESS_VERIFIED: 'true'
});
assert.equal(verified.privateEgressVerified, true);
assert.equal(verified.blockers.includes('pack081_private_egress_unverified'), false);
assert.equal(verified.live, true);

const nonProd = availability({
  ...base,
  RAILWAY_ENVIRONMENT_NAME: 'test'
});
assert.equal(nonProd.blockers.includes('pack081_private_egress_unverified'), false);

console.log('PASS: production Cloud Browser stays fail-closed until private-egress/DNS-rebinding verification is explicitly recorded.');
