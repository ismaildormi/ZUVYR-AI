'use strict';

const crypto = require('crypto');
const CONFIG = require('../config/router-fallback-billing.v1.json');

function requiredText(value, code) {
  const text = value == null ? '' : String(value).trim();
  if (!text) throw new Error(code);
  return text;
}

function safeHash(kind, value) {
  return `${kind}_${crypto
    .createHash('sha256')
    .update(String(value), 'utf8')
    .digest('hex')
    .slice(0, 24)}`;
}

function routeKey(route) {
  return `${requiredText(route?.provider, 'router_attempt_provider_required')}::${requiredText(
    route?.model,
    'router_attempt_model_required'
  )}`;
}

function createFallbackBillingScope({ requestId = null, routes = [] } = {}) {
  if (!Array.isArray(routes)) throw new Error('router_attempt_routes_required');

  const logicalSeed =
    requestId == null || String(requestId).trim() === ''
      ? crypto.randomUUID()
      : String(requestId).trim();

  const billingRef = safeHash('billing', logicalSeed);
  const maxProviderAttempts = routes.length;

  const attempts = new Map();
  let startedCount = 0;
  let terminalSuccessAttemptId = null;
  let finalState = 'PENDING';

  function beginAttempt(route) {
    if (finalState === 'SUCCESS') {
      throw new Error('router_attempt_scope_already_succeeded');
    }
    if (startedCount >= maxProviderAttempts) {
      throw new Error('router_attempt_budget_exhausted');
    }

    const key = routeKey(route);
    startedCount += 1;
    const attemptId = safeHash(
      'attempt',
      `${billingRef}:${startedCount}:${key}:${crypto.randomUUID()}`
    );

    const record = {
      attemptId,
      ordinal: startedCount,
      routeKey: key,
      provider: String(route.provider),
      model: String(route.model),
      state: 'ACTIVE'
    };
    attempts.set(attemptId, record);

    return Object.freeze({
      attemptId,
      ordinal: startedCount,
      provider: record.provider,
      model: record.model,
      billingRef
    });
  }

  function completeAttempt(attemptId, outcome) {
    const record = attempts.get(requiredText(attemptId, 'router_attempt_id_required'));
    if (!record) throw new Error('router_attempt_unknown');

    const normalizedOutcome = requiredText(
      outcome,
      'router_attempt_outcome_required'
    ).toUpperCase();

    if (!['SUCCESS', 'ERROR', 'TIMEOUT', 'CANCELLED'].includes(normalizedOutcome)) {
      throw new Error(`router_attempt_outcome_invalid:${normalizedOutcome}`);
    }

    if (record.state !== 'ACTIVE') {
      return Object.freeze({
        accepted: false,
        replayed: true,
        late: finalState === 'SUCCESS',
        attemptId: record.attemptId,
        state: record.state,
        billingRef
      });
    }

    if (normalizedOutcome === 'SUCCESS') {
      if (terminalSuccessAttemptId && terminalSuccessAttemptId !== record.attemptId) {
        record.state = 'LATE_SUCCESS_IGNORED';
        return Object.freeze({
          accepted: false,
          replayed: false,
          late: true,
          attemptId: record.attemptId,
          state: record.state,
          billingRef
        });
      }

      terminalSuccessAttemptId = record.attemptId;
      finalState = 'SUCCESS';
      record.state = 'SUCCESS';
      return Object.freeze({
        accepted: true,
        replayed: false,
        late: false,
        attemptId: record.attemptId,
        state: record.state,
        billingRef
      });
    }

    record.state = normalizedOutcome;
    if (startedCount >= maxProviderAttempts) finalState = 'EXHAUSTED';

    return Object.freeze({
      accepted: true,
      replayed: false,
      late: false,
      attemptId: record.attemptId,
      state: record.state,
      billingRef
    });
  }

  function snapshot() {
    return Object.freeze({
      version: CONFIG.version,
      billingRef,
      maxProviderAttempts,
      providerAttemptsStarted: startedCount,
      finalState,
      firstAcceptedSuccessAttemptId: terminalSuccessAttemptId,
      attempts: Object.freeze(
        [...attempts.values()].map(record =>
          Object.freeze({
            attemptId: record.attemptId,
            ordinal: record.ordinal,
            provider: record.provider,
            model: record.model,
            state: record.state
          })
        )
      )
    });
  }

  return Object.freeze({
    version: CONFIG.version,
    billingRef,
    maxProviderAttempts,
    beginAttempt,
    completeAttempt,
    snapshot
  });
}

module.exports = {
  createFallbackBillingScope
};
