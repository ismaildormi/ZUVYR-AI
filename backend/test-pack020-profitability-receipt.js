'use strict';

const assert = require('node:assert/strict');
const {
  buildProfitabilityReceipt
} = require('./lib/profitabilityReceipt');

const receipt = buildProfitabilityReceipt({
  operationId: 'pack020:test-operation',
  revenueKnown: true,
  technicalCostKnown: true,
  recognizedRevenueMicrousd: 1000000,
  technicalCostMicrousd: 400000,
  reservedCredits: 100,
  settledCredits: 60,
  refundedCredits: 40
});

assert.equal(
  receipt.version,
  'pack-020.profitability-receipt.v1'
);
assert.equal(receipt.grossMarginMicrousd, 600000);
assert.equal(receipt.grossMarginBps, 6000);
assert.equal(receipt.profitable, true);
assert.equal(
  receipt.settledCredits +
    receipt.refundedCredits,
  receipt.reservedCredits
);

assert.throws(
  () =>
    buildProfitabilityReceipt({
      operationId: 'unknown-cost',
      revenueKnown: true,
      technicalCostKnown: false,
      recognizedRevenueMicrousd: 100,
      technicalCostMicrousd: 0,
      reservedCredits: 1,
      settledCredits: 1,
      refundedCredits: 0
    }),
  /technical_cost_unknown/
);

assert.throws(
  () =>
    buildProfitabilityReceipt({
      operationId: 'unknown-revenue',
      revenueKnown: false,
      technicalCostKnown: true,
      recognizedRevenueMicrousd: 0,
      technicalCostMicrousd: 0,
      reservedCredits: 1,
      settledCredits: 1,
      refundedCredits: 0
    }),
  /recognized_revenue_unknown/
);

assert.throws(
  () =>
    buildProfitabilityReceipt({
      operationId: 'broken-conservation',
      revenueKnown: true,
      technicalCostKnown: true,
      recognizedRevenueMicrousd: 100,
      technicalCostMicrousd: 50,
      reservedCredits: 10,
      settledCredits: 4,
      refundedCredits: 5
    }),
  /reservation_conservation_failed/
);

assert.throws(
  () =>
    buildProfitabilityReceipt({
      operationId: 'fractional-cost',
      revenueKnown: true,
      technicalCostKnown: true,
      recognizedRevenueMicrousd: 100,
      technicalCostMicrousd: 0.5,
      reservedCredits: 1,
      settledCredits: 1,
      refundedCredits: 0
    }),
  /technical_cost_microusd_invalid/
);

console.log(
  'PASS: Pack020 profitability receipts use exact known integer micro-USD and conserve reserved/settled/refunded credits'
);
console.log(
  'DATABASE / STRIPE / RAILWAY / MODEL / NETWORK CALLS: NONE'
);
