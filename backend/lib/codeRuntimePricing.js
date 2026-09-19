'use strict';

const runtimeConfig = require('../config/code-runtime.v1.json');
const {
  registry,
  resolveCostQuote
} = require('./costRegistry');
const {
  quoteTechnicalCost
} = require('./technicalCostModel');
const {
  economicsFromEnv
} = require('./dynamicPricing');

function pricingError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function envTrue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function runtimeQuery() {
  return Object.freeze({
    modelToolId: 'code-studio-runtime',
    capability: 'code',
    operationType: runtimeConfig.metering.registryOperationType
  });
}

function runtimeSecondsFromMs(value, { allowZero = false } = {}) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) {
    throw pricingError('code_runtime_duration_invalid');
  }
  if (ms === 0) {
    if (allowZero) return 0;
    return 1;
  }
  return Math.max(1, Math.ceil(ms / 1000));
}

function runtimePricingStatus({
  env = process.env,
  now = Date.now(),
  value = registry
} = {}) {
  const blockers = [];

  if (!envTrue(env.PACK077_RUNTIME_PAID_EXECUTION_ENABLED)) {
    blockers.push('pack077_runtime_paid_execution_disabled');
  }
  if (!envTrue(env.ZUVYR_M15_VERIFIED)) {
    blockers.push('pack077_m15_unverified');
  }
  if (!envTrue(env.ZUVYR_SANDBOX_PRICING_VERIFIED)) {
    blockers.push('pack077_sandbox_pricing_operator_gate_closed');
  }

  let quoteEntry = null;
  try {
    quoteEntry = resolveCostQuote(
      runtimeQuery(),
      { inputUnits: 1 },
      { env, now, value }
    );
    if (quoteEntry.unitType !== runtimeConfig.metering.registryUnitType) {
      blockers.push('pack077_runtime_unit_mismatch');
    }
    if (quoteEntry.verificationStatus !== 'verified') {
      blockers.push('pack077_runtime_pricing_unverified');
    }
  } catch (cause) {
    blockers.push(
      cause?.code ||
      cause?.message ||
      'pack077_runtime_pricing_unavailable'
    );
  }

  return Object.freeze({
    live: blockers.length === 0,
    blockers: Object.freeze([...new Set(blockers)]),
    quoteEntry
  });
}

function quoteRuntimeSeconds(seconds, {
  env = process.env,
  now = Date.now(),
  value = registry
} = {}) {
  const units = Number(seconds);
  if (!Number.isSafeInteger(units) || units < 1 || units > 3600) {
    throw pricingError('code_runtime_seconds_invalid');
  }

  const status = runtimePricingStatus({ env, now, value });
  if (!status.live) {
    const error = pricingError('code_runtime_pricing_gate_closed');
    error.blockers = status.blockers;
    throw error;
  }

  let provider;
  try {
    provider = resolveCostQuote(
      runtimeQuery(),
      { inputUnits: units },
      { env, now, value }
    );
  } catch (cause) {
    throw pricingError('code_runtime_pricing_unavailable', cause);
  }

  let technical;
  try {
    technical = quoteTechnicalCost({
      providerCostMicroUsd: provider.providerCostMicroUsd,
      components: [],
      pricingVersion: provider.pricingVersion,
      basis: 'estimate',
      economics: economicsFromEnv(env)
    });
  } catch (cause) {
    throw pricingError(
      cause?.code || cause?.message || 'code_runtime_margin_quote_failed',
      cause
    );
  }

  const credits = Number(technical.charge.chargedCredits);
  if (!Number.isSafeInteger(credits) || credits < 1) {
    throw pricingError('code_runtime_credit_quote_invalid');
  }

  return Object.freeze({
    credits,
    seconds: units,
    provider: provider.provider,
    providerCostMicroUsd: provider.providerCostMicroUsd,
    pricingVersion: provider.pricingVersion,
    costEntryId: provider.costEntryId,
    unitType: provider.unitType,
    technicalCostMicroUsd: technical.trace.allInTechnicalCostMicroUsd,
    grossMarginBps: technical.charge.grossMarginBps,
    settlementAudit: technical.settlementAudit
  });
}

function quoteRuntimeReservation(operation, options = {}) {
  const normalized = String(operation || '').trim().toLowerCase();
  const seconds = runtimeConfig.metering.reserveSecondsByOperation[normalized];
  if (!Number.isSafeInteger(seconds) || seconds < 1) {
    throw pricingError('code_runtime_operation_unpriced');
  }
  return quoteRuntimeSeconds(seconds, options);
}

function quoteRuntimeFinal(runtimeMs, options = {}) {
  return quoteRuntimeSeconds(
    runtimeSecondsFromMs(runtimeMs),
    options
  );
}

function quoteRuntimeFinalAgainstReservation(
  runtimeMs,
  reservation,
  options = {}
) {
  if (
    !reservation ||
    typeof reservation !== 'object' ||
    !String(reservation.costEntryId || '').trim() ||
    !String(reservation.pricingVersion || '').trim()
  ) {
    throw pricingError('code_runtime_reservation_pricing_missing');
  }

  const quote = quoteRuntimeFinal(runtimeMs, options);
  if (
    quote.costEntryId !== reservation.costEntryId ||
    quote.pricingVersion !== reservation.pricingVersion
  ) {
    throw pricingError('code_runtime_pricing_snapshot_changed');
  }

  return quote;
}

module.exports = {
  runtimeQuery,
  runtimeSecondsFromMs,
  runtimePricingStatus,
  quoteRuntimeSeconds,
  quoteRuntimeReservation,
  quoteRuntimeFinal,
  quoteRuntimeFinalAgainstReservation
};
