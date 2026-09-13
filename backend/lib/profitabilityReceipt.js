'use strict';

function requireNonEmptyString(value, field) {
  const text = String(value || '').trim();
  if (!text) {
    const error = new Error(`${field}_required`);
    error.code = `${field}_required`;
    throw error;
  }
  return text;
}

function requireSafeNonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    const error = new Error(`${field}_invalid`);
    error.code = `${field}_invalid`;
    throw error;
  }
  return value;
}

function buildProfitabilityReceipt(input = {}) {
  const operationId = requireNonEmptyString(
    input.operationId,
    'operation_id'
  );

  if (input.revenueKnown !== true) {
    const error = new Error('recognized_revenue_unknown');
    error.code = 'recognized_revenue_unknown';
    throw error;
  }

  if (input.technicalCostKnown !== true) {
    const error = new Error('technical_cost_unknown');
    error.code = 'technical_cost_unknown';
    throw error;
  }

  const recognizedRevenueMicrousd =
    requireSafeNonNegativeInteger(
      input.recognizedRevenueMicrousd,
      'recognized_revenue_microusd'
    );

  const technicalCostMicrousd =
    requireSafeNonNegativeInteger(
      input.technicalCostMicrousd,
      'technical_cost_microusd'
    );

  const reservedCredits =
    requireSafeNonNegativeInteger(
      input.reservedCredits,
      'reserved_credits'
    );

  const settledCredits =
    requireSafeNonNegativeInteger(
      input.settledCredits,
      'settled_credits'
    );

  const refundedCredits =
    requireSafeNonNegativeInteger(
      input.refundedCredits,
      'refunded_credits'
    );

  if (
    settledCredits + refundedCredits !==
    reservedCredits
  ) {
    const error =
      new Error('reservation_conservation_failed');
    error.code = 'reservation_conservation_failed';
    throw error;
  }

  const grossMarginMicrousd =
    recognizedRevenueMicrousd -
    technicalCostMicrousd;

  const grossMarginBps =
    recognizedRevenueMicrousd === 0
      ? null
      : Math.trunc(
          grossMarginMicrousd *
            10000 /
            recognizedRevenueMicrousd
        );

  return Object.freeze({
    version:
      'pack-020.profitability-receipt.v1',
    operationId,
    recognizedRevenueMicrousd,
    technicalCostMicrousd,
    grossMarginMicrousd,
    grossMarginBps,
    reservedCredits,
    settledCredits,
    refundedCredits,
    profitable: grossMarginMicrousd >= 0
  });
}

module.exports = {
  buildProfitabilityReceipt
};
