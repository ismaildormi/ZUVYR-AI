'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./config/plan-quote-consent.v1.json');
const { normalizeUniversalRequest } = require('./lib/universalRequest');
const { extractRequirements } = require('./lib/requirementExtractor');
const { createIntentLock } = require('./lib/intentLock');
const { createBrainPlan } = require('./lib/brainPlanner');
const {
  buildPlanQuote,
  createConsent,
  assertConsentCurrent
} = require('./lib/planQuoteConsent');

assert.equal(config.version, 'pack-036.plan-quote-consent.v1');
assert.equal(config.invariants.noInventedPrice, true);
assert.equal(config.invariants.noInventedDuration, true);
assert.equal(config.invariants.noInventedRisk, true);
assert.equal(config.consent.executionEnabledByThisPack, false);

function makePlan(surface = 'code') {
  const request = normalizeUniversalRequest({
    schemaVersion: '1.0',
    requestId: `pack036-${surface}-001`,
    surface,
    goal: 'Build the approved experience exactly as requested',
    inputs: {},
    constraints: {
      hard: ['Preserve the public API']
    },
    outputs: {},
    contextRefs: [],
    language: {},
    risk: {},
    budget: {},
    clientState: {}
  });

  const extraction = extractRequirements(request);
  const intentLock = createIntentLock(request, extraction);
  return createBrainPlan({ request, extraction, intentLock });
}

function quotesFor(plan) {
  return plan.steps.map((step, index) => ({
    stepId: step.id,
    capability: step.capability,
    estimatedCredits: String(index + 1),
    estimatedCostMicroUsd: String((index + 1) * 100),
    estimatedDurationMs: (index + 1) * 1000,
    riskLevel: index === plan.steps.length - 1 ? 'medium' : 'low',
    pricingVerified: true,
    pricingVersion: 'fixture.pricing.v1',
    pricingSource: `fixture:${step.capability}`
  }));
}

const plan = makePlan();
const stepQuotes = quotesFor(plan);
const quote = buildPlanQuote({ plan, stepQuotes });

assert.match(quote.planVersion, /^[0-9a-f]{64}$/);
assert.match(quote.quoteFingerprint, /^[0-9a-f]{64}$/);
assert.equal(quote.executionEnabled, false);
assert.equal(quote.stepQuotes.length, plan.steps.length);
assert.equal(quote.aggregate.estimatedCredits, '15');
assert.equal(quote.aggregate.estimatedCostMicroUsd, '1500');
assert.equal(quote.aggregate.estimatedDurationMs, 15000);
assert.equal(quote.aggregate.riskLevel, 'medium');

assert.throws(
  () => buildPlanQuote({
    plan,
    stepQuotes: stepQuotes.slice(0, -1)
  }),
  error => error.code === 'PLAN_QUOTE_STEP_COUNT_MISMATCH'
);

const unverified = stepQuotes.map(item => ({ ...item }));
unverified[0].pricingVerified = false;
assert.throws(
  () => buildPlanQuote({ plan, stepQuotes: unverified }),
  error => error.code === 'PLAN_QUOTE_PRICING_UNVERIFIED'
);

const unknownDuration = stepQuotes.map(item => ({ ...item }));
unknownDuration[0].estimatedDurationMs = null;
assert.throws(
  () => buildPlanQuote({ plan, stepQuotes: unknownDuration }),
  error => error.code === 'PLAN_QUOTE_DURATION_INVALID'
);

const unknownRisk = stepQuotes.map(item => ({ ...item }));
unknownRisk[0].riskLevel = 'unknown';
assert.throws(
  () => buildPlanQuote({ plan, stepQuotes: unknownRisk }),
  error => error.code === 'PLAN_QUOTE_RISK_INVALID'
);

assert.throws(
  () => createConsent({ plan, quote, approved: false }),
  error => error.code === 'PLAN_CONSENT_EXPLICIT_APPROVAL_REQUIRED'
);

const consent = createConsent({
  plan,
  quote,
  approved: true
});

assert.match(consent.consentFingerprint, /^[0-9a-f]{64}$/);
assert.equal(consent.executionAuthorized, false);

const current = assertConsentCurrent({ plan, quote, consent });
assert.equal(current.current, true);
assert.equal(current.executionAuthorized, false);

const changedPriceStepQuotes = stepQuotes.map(item => ({ ...item }));
changedPriceStepQuotes[0].estimatedCredits = '99';
const changedPriceQuote = buildPlanQuote({
  plan,
  stepQuotes: changedPriceStepQuotes
});
assert.notEqual(changedPriceQuote.quoteFingerprint, quote.quoteFingerprint);
assert.throws(
  () => assertConsentCurrent({
    plan,
    quote: changedPriceQuote,
    consent
  }),
  error => error.code === 'PLAN_CONSENT_STALE'
);

const changedDurationStepQuotes = stepQuotes.map(item => ({ ...item }));
changedDurationStepQuotes[1].estimatedDurationMs += 1;
const changedDurationQuote = buildPlanQuote({
  plan,
  stepQuotes: changedDurationStepQuotes
});
assert.notEqual(changedDurationQuote.quoteFingerprint, quote.quoteFingerprint);
assert.throws(
  () => assertConsentCurrent({
    plan,
    quote: changedDurationQuote,
    consent
  }),
  error => error.code === 'PLAN_CONSENT_STALE'
);

const changedRiskStepQuotes = stepQuotes.map(item => ({ ...item }));
changedRiskStepQuotes[2].riskLevel = 'high';
const changedRiskQuote = buildPlanQuote({
  plan,
  stepQuotes: changedRiskStepQuotes
});
assert.notEqual(changedRiskQuote.quoteFingerprint, quote.quoteFingerprint);
assert.throws(
  () => assertConsentCurrent({
    plan,
    quote: changedRiskQuote,
    consent
  }),
  error => error.code === 'PLAN_CONSENT_STALE'
);

const changedPlan = {
  ...plan,
  planFingerprint: 'f'.repeat(64)
};
const changedPlanQuote = buildPlanQuote({
  plan: changedPlan,
  stepQuotes
});
assert.notEqual(changedPlanQuote.planVersion, quote.planVersion);
assert.throws(
  () => assertConsentCurrent({
    plan: changedPlan,
    quote: changedPlanQuote,
    consent
  }),
  error => error.code === 'PLAN_CONSENT_STALE'
);

const tamperedConsent = {
  ...consent,
  consentFingerprint: '0'.repeat(64)
};
assert.throws(
  () => assertConsentCurrent({
    plan,
    quote,
    consent: tamperedConsent
  }),
  error => error.code === 'PLAN_CONSENT_FINGERPRINT_INVALID'
);

const source = fs.readFileSync(path.join(__dirname, 'lib/planQuoteConsent.js'), 'utf8');
for (const forbidden of [
  'fetch(',
  'axios.',
  'supabaseAdmin',
  'reserveCredits(',
  'settleCredits(',
  'refundCredits(',
  'process.env.'
]) {
  assert(!source.includes(forbidden), `Pack036 consent core must remain pure: ${forbidden}`);
}

console.log('PASS: every Brain step requires verified price, duration and risk evidence');
console.log('PASS: immutable planVersion and quoteFingerprint bind exact plan + material quote fields');
console.log('PASS: explicit consent binds planVersion + quoteFingerprint + intent + request + surface');
console.log('PASS: changed plan, price, duration or risk invalidates stale consent');
console.log('PASS: Pack036 authorizes no execution/reservation and adds no DB/billing/model/network side effects');
