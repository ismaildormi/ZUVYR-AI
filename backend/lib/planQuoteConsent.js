'use strict';

const crypto = require('crypto');
const CONFIG = require('../config/plan-quote-consent.v1.json');

const RISK_ORDER = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
});

function contractError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function stable(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function nonNegativeIntegerString(value, code) {
  const text = String(value == null ? '' : value).trim();
  if (!/^(0|[1-9]\d*)$/.test(text)) throw contractError(code);
  return text;
}

function addIntegerStrings(values, code) {
  let total = 0n;
  for (const value of values) {
    try {
      total += BigInt(value);
    } catch {
      throw contractError(code);
    }
  }
  return total.toString();
}

function normalizeRisk(value, code) {
  const risk = String(value || '').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(RISK_ORDER, risk)) {
    throw contractError(code, { risk: risk || null });
  }
  return risk;
}

function normalizeStepQuote(planStep, raw) {
  if (!isObject(raw)) {
    throw contractError('PLAN_QUOTE_STEP_MISSING', { stepId: planStep.id });
  }

  if (
    raw.stepId !== planStep.id ||
    raw.capability !== planStep.capability
  ) {
    throw contractError('PLAN_QUOTE_STEP_IDENTITY_MISMATCH', {
      stepId: planStep.id,
      capability: planStep.capability
    });
  }

  if (raw.pricingVerified !== true) {
    throw contractError('PLAN_QUOTE_PRICING_UNVERIFIED', { stepId: planStep.id });
  }

  const pricingVersion = String(raw.pricingVersion || '').trim();
  const pricingSource = String(raw.pricingSource || '').trim();
  if (!pricingVersion || !pricingSource) {
    throw contractError('PLAN_QUOTE_PRICING_EVIDENCE_REQUIRED', { stepId: planStep.id });
  }

  const estimatedCredits = nonNegativeIntegerString(
    raw.estimatedCredits,
    'PLAN_QUOTE_CREDITS_INVALID'
  );
  const estimatedCostMicroUsd = nonNegativeIntegerString(
    raw.estimatedCostMicroUsd,
    'PLAN_QUOTE_COST_INVALID'
  );

  if (
    !Number.isSafeInteger(raw.estimatedDurationMs) ||
    raw.estimatedDurationMs < 0
  ) {
    throw contractError('PLAN_QUOTE_DURATION_INVALID', { stepId: planStep.id });
  }

  const riskLevel = normalizeRisk(
    raw.riskLevel,
    'PLAN_QUOTE_RISK_INVALID'
  );

  return Object.freeze({
    stepId: planStep.id,
    capability: planStep.capability,
    estimatedCredits,
    estimatedCostMicroUsd,
    estimatedDurationMs: raw.estimatedDurationMs,
    riskLevel,
    pricingVerified: true,
    pricingVersion,
    pricingSource
  });
}

function assertPlan(plan) {
  if (!isObject(plan) || plan.version !== 'pack-035.brain-plan.v1') {
    throw contractError('PLAN_QUOTE_PLAN_INVALID');
  }
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw contractError('PLAN_QUOTE_PLAN_STEPS_REQUIRED');
  }
  if (!/^[0-9a-f]{64}$/.test(String(plan.planFingerprint || ''))) {
    throw contractError('PLAN_QUOTE_PLAN_FINGERPRINT_INVALID');
  }
  if (!/^[0-9a-f]{64}$/.test(String(plan.intentFingerprint || ''))) {
    throw contractError('PLAN_QUOTE_INTENT_FINGERPRINT_INVALID');
  }
  return plan;
}

function aggregateRisk(stepQuotes) {
  return stepQuotes.reduce((highest, item) => (
    RISK_ORDER[item.riskLevel] > RISK_ORDER[highest]
      ? item.riskLevel
      : highest
  ), 'low');
}

function buildPlanQuote({ plan, stepQuotes } = {}) {
  const normalizedPlan = assertPlan(plan);

  if (!Array.isArray(stepQuotes)) {
    throw contractError('PLAN_QUOTE_STEPS_INVALID');
  }

  if (stepQuotes.length !== normalizedPlan.steps.length) {
    throw contractError('PLAN_QUOTE_STEP_COUNT_MISMATCH', {
      expected: normalizedPlan.steps.length,
      actual: stepQuotes.length
    });
  }

  const byId = new Map();
  for (const raw of stepQuotes) {
    if (!isObject(raw) || !raw.stepId) {
      throw contractError('PLAN_QUOTE_STEP_ID_REQUIRED');
    }
    if (byId.has(raw.stepId)) {
      throw contractError('PLAN_QUOTE_STEP_DUPLICATE', { stepId: raw.stepId });
    }
    byId.set(raw.stepId, raw);
  }

  const normalizedStepQuotes = normalizedPlan.steps.map(step =>
    normalizeStepQuote(step, byId.get(step.id))
  );

  const planVersionPayload = {
    plannerVersion: normalizedPlan.version,
    plannerId: normalizedPlan.plannerId,
    graphVersion: normalizedPlan.graphVersion,
    requestId: normalizedPlan.requestId,
    surface: normalizedPlan.surface,
    intentFingerprint: normalizedPlan.intentFingerprint,
    planFingerprint: normalizedPlan.planFingerprint,
    orderedStepIdentity: normalizedPlan.steps.map(step => ({
      id: step.id,
      capability: step.capability,
      dependsOn: step.dependsOn
    }))
  };

  const planVersion = sha256(planVersionPayload);

  const aggregate = Object.freeze({
    estimatedCredits: addIntegerStrings(
      normalizedStepQuotes.map(item => item.estimatedCredits),
      'PLAN_QUOTE_CREDITS_AGGREGATION_FAILED'
    ),
    estimatedCostMicroUsd: addIntegerStrings(
      normalizedStepQuotes.map(item => item.estimatedCostMicroUsd),
      'PLAN_QUOTE_COST_AGGREGATION_FAILED'
    ),
    estimatedDurationMs: normalizedStepQuotes.reduce(
      (sum, item) => {
        const next = sum + item.estimatedDurationMs;
        if (!Number.isSafeInteger(next)) {
          throw contractError('PLAN_QUOTE_DURATION_AGGREGATION_FAILED');
        }
        return next;
      },
      0
    ),
    riskLevel: aggregateRisk(normalizedStepQuotes)
  });

  const quoteCore = {
    contractVersion: CONFIG.version,
    planVersion,
    requestId: normalizedPlan.requestId,
    surface: normalizedPlan.surface,
    intentFingerprint: normalizedPlan.intentFingerprint,
    aggregate,
    stepQuotes: normalizedStepQuotes
  };

  return Object.freeze({
    ...quoteCore,
    quoteFingerprint: sha256(quoteCore),
    executionEnabled: false
  });
}

function createConsent({ plan, quote, approved } = {}) {
  const normalizedPlan = assertPlan(plan);

  if (approved !== true) {
    throw contractError('PLAN_CONSENT_EXPLICIT_APPROVAL_REQUIRED');
  }

  if (!isObject(quote) || quote.contractVersion !== CONFIG.version) {
    throw contractError('PLAN_CONSENT_QUOTE_INVALID');
  }

  const rebuilt = buildPlanQuote({
    plan: normalizedPlan,
    stepQuotes: quote.stepQuotes
  });

  if (
    rebuilt.planVersion !== quote.planVersion ||
    rebuilt.quoteFingerprint !== quote.quoteFingerprint ||
    rebuilt.intentFingerprint !== quote.intentFingerprint ||
    rebuilt.requestId !== quote.requestId ||
    rebuilt.surface !== quote.surface
  ) {
    throw contractError('PLAN_CONSENT_STALE_OR_TAMPERED_QUOTE');
  }

  const binding = {
    contractVersion: CONFIG.version,
    planVersion: quote.planVersion,
    quoteFingerprint: quote.quoteFingerprint,
    intentFingerprint: quote.intentFingerprint,
    requestId: quote.requestId,
    surface: quote.surface,
    approved: true
  };

  return Object.freeze({
    ...binding,
    consentFingerprint: sha256(binding),
    executionAuthorized: false
  });
}

function assertConsentCurrent({ plan, quote, consent } = {}) {
  const normalizedPlan = assertPlan(plan);
  const rebuilt = buildPlanQuote({
    plan: normalizedPlan,
    stepQuotes: quote && quote.stepQuotes
  });

  if (!isObject(consent) || consent.approved !== true) {
    throw contractError('PLAN_CONSENT_REQUIRED');
  }

  if (
    consent.contractVersion !== CONFIG.version ||
    consent.planVersion !== rebuilt.planVersion ||
    consent.quoteFingerprint !== rebuilt.quoteFingerprint ||
    consent.intentFingerprint !== rebuilt.intentFingerprint ||
    consent.requestId !== rebuilt.requestId ||
    consent.surface !== rebuilt.surface
  ) {
    throw contractError('PLAN_CONSENT_STALE');
  }

  const binding = {
    contractVersion: CONFIG.version,
    planVersion: consent.planVersion,
    quoteFingerprint: consent.quoteFingerprint,
    intentFingerprint: consent.intentFingerprint,
    requestId: consent.requestId,
    surface: consent.surface,
    approved: true
  };

  if (consent.consentFingerprint !== sha256(binding)) {
    throw contractError('PLAN_CONSENT_FINGERPRINT_INVALID');
  }

  return Object.freeze({
    current: true,
    planVersion: rebuilt.planVersion,
    quoteFingerprint: rebuilt.quoteFingerprint,
    consentFingerprint: consent.consentFingerprint,
    executionAuthorized: false
  });
}

module.exports = {
  CONFIG,
  buildPlanQuote,
  createConsent,
  assertConsentCurrent
};
