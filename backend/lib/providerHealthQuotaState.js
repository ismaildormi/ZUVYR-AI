'use strict';

const CONFIG = require('../config/provider-health-quota-state.v1.json');

const HEALTH_STATES = Object.freeze({
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  OPEN: 'OPEN'
});

const QUOTA_STATES = Object.freeze({
  UNKNOWN: 'UNKNOWN',
  AVAILABLE: 'AVAILABLE',
  LIMITED: 'LIMITED',
  EXHAUSTED: 'EXHAUSTED'
});

const ALLOWED_QUOTA_SCOPES = new Set(CONFIG.providerQuota.allowedScopes);
const FORBIDDEN_USER_FIELDS = new Set(CONFIG.providerQuota.forbiddenUserFields);

function integer(value, name, minimum = 0) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) {
    throw new Error(`provider_health_invalid_${name}`);
  }
  return number;
}

function optionalInteger(value, name, minimum = 0) {
  if (value == null) return null;
  return integer(value, name, minimum);
}

function optionalFinite(value, name, minimum = 0) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) {
    throw new Error(`provider_quota_invalid_${name}`);
  }
  return number;
}

function requiredText(value, name) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`provider_health_${name}_required`);
  return text;
}

function optionalText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function freezeSnapshot(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value;
}

function createProviderHealthQuotaState(options = {}) {
  const failureThreshold = integer(
    options.failureThreshold ?? CONFIG.defaults.failureThreshold,
    'failure_threshold',
    1
  );
  const cooldownMs = integer(
    options.cooldownMs ?? CONFIG.defaults.cooldownMs,
    'cooldown_ms',
    1
  );
  const probeLeaseMs = integer(
    options.probeLeaseMs ?? CONFIG.defaults.probeLeaseMs,
    'probe_lease_ms',
    1
  );
  const clock = typeof options.clock === 'function' ? options.clock : Date.now;

  const providers = new Map();
  let probeSequence = 0;

  function nowMs(value) {
    return value == null ? integer(clock(), 'clock_ms', 0) : integer(value, 'timestamp_ms', 0);
  }

  function newQuota() {
    return {
      state: QUOTA_STATES.UNKNOWN,
      scope: null,
      limit: null,
      remaining: null,
      resetAtMs: null,
      retryAfterSeconds: null,
      observedAtMs: null,
      source: null
    };
  }

  function ensure(providerId, atMs = null) {
    const id = requiredText(providerId, 'provider_id');
    if (!providers.has(id)) {
      const at = nowMs(atMs);
      providers.set(id, {
        providerId: id,
        healthState: HEALTH_STATES.HEALTHY,
        stateSinceMs: at,
        consecutiveFailures: 0,
        lastSuccessAtMs: null,
        lastFailureAtMs: null,
        openedAtMs: null,
        cooldownUntilMs: null,
        lastProbeAtMs: null,
        probeLeaseToken: null,
        probeLeaseUntilMs: null,
        quota: newQuota()
      });
    }
    return providers.get(id);
  }

  function publicSnapshot(record, atMs = null) {
    const at = nowMs(atMs);
    const probeLeaseActive =
      record.probeLeaseToken != null &&
      record.probeLeaseUntilMs != null &&
      record.probeLeaseUntilMs > at;
    const cooldownElapsed =
      record.healthState === HEALTH_STATES.OPEN &&
      record.cooldownUntilMs != null &&
      at >= record.cooldownUntilMs;

    return freezeSnapshot({
      providerId: record.providerId,
      health: {
        state: record.healthState,
        stateSinceMs: record.stateSinceMs,
        consecutiveFailures: record.consecutiveFailures,
        lastSuccessAtMs: record.lastSuccessAtMs,
        lastFailureAtMs: record.lastFailureAtMs,
        openedAtMs: record.openedAtMs,
        cooldownUntilMs: record.cooldownUntilMs,
        cooldownElapsed,
        probeLeaseActive,
        probeLeaseUntilMs: probeLeaseActive ? record.probeLeaseUntilMs : null,
        lastProbeAtMs: record.lastProbeAtMs
      },
      quota: clone(record.quota),
      separation: {
        providerQuotaSeparateFromUserQuota: true,
        userBillingMutation: false
      }
    });
  }

  function getSnapshot(providerId, atMs = null) {
    return publicSnapshot(ensure(providerId, atMs), atMs);
  }

  function transition(record, nextState, at) {
    if (record.healthState !== nextState) {
      record.healthState = nextState;
      record.stateSinceMs = at;
    }
  }

  function recordOutcome(providerId, outcome = {}) {
    const at = nowMs(outcome.atMs);
    const record = ensure(providerId, at);
    if (typeof outcome.success !== 'boolean') {
      throw new Error('provider_health_success_boolean_required');
    }

    if (outcome.success) {
      record.consecutiveFailures = 0;
      record.lastSuccessAtMs = at;
      record.openedAtMs = null;
      record.cooldownUntilMs = null;
      record.probeLeaseToken = null;
      record.probeLeaseUntilMs = null;
      transition(record, HEALTH_STATES.HEALTHY, at);
      return publicSnapshot(record, at);
    }

    record.consecutiveFailures += 1;
    record.lastFailureAtMs = at;
    record.probeLeaseToken = null;
    record.probeLeaseUntilMs = null;

    if (record.consecutiveFailures >= failureThreshold) {
      record.openedAtMs = at;
      record.cooldownUntilMs = at + cooldownMs;
      transition(record, HEALTH_STATES.OPEN, at);
    } else {
      transition(record, HEALTH_STATES.DEGRADED, at);
    }

    return publicSnapshot(record, at);
  }

  function canAttempt(providerId, atMs = null) {
    const at = nowMs(atMs);
    const record = ensure(providerId, at);

    if (record.healthState !== HEALTH_STATES.OPEN) {
      return freezeSnapshot({
        allowed: true,
        reason: record.healthState === HEALTH_STATES.DEGRADED
          ? 'provider_degraded'
          : 'provider_healthy',
        recoveryProbeEligible: false,
        billableProbe: false
      });
    }

    const cooldownElapsed =
      record.cooldownUntilMs != null &&
      at >= record.cooldownUntilMs;
    const activeLease =
      record.probeLeaseToken != null &&
      record.probeLeaseUntilMs != null &&
      record.probeLeaseUntilMs > at;

    return freezeSnapshot({
      allowed: false,
      reason: cooldownElapsed
        ? (activeLease ? 'recovery_probe_in_flight' : 'recovery_probe_required')
        : 'provider_circuit_open',
      recoveryProbeEligible: cooldownElapsed && !activeLease,
      billableProbe: false
    });
  }

  function beginRecoveryProbe(providerId, atMs = null) {
    const at = nowMs(atMs);
    const record = ensure(providerId, at);

    if (record.healthState !== HEALTH_STATES.OPEN) {
      return freezeSnapshot({
        started: false,
        reason: 'provider_not_open',
        providerId: record.providerId,
        billable: false
      });
    }
    if (record.cooldownUntilMs == null || at < record.cooldownUntilMs) {
      return freezeSnapshot({
        started: false,
        reason: 'provider_cooldown_active',
        providerId: record.providerId,
        billable: false
      });
    }

    if (
      record.probeLeaseToken != null &&
      record.probeLeaseUntilMs != null &&
      record.probeLeaseUntilMs > at
    ) {
      return freezeSnapshot({
        started: false,
        reason: 'provider_probe_already_in_flight',
        providerId: record.providerId,
        billable: false
      });
    }

    probeSequence += 1;
    const token = `${record.providerId}:${at}:${probeSequence}`;
    record.probeLeaseToken = token;
    record.probeLeaseUntilMs = at + probeLeaseMs;
    record.lastProbeAtMs = at;

    return freezeSnapshot({
      started: true,
      providerId: record.providerId,
      token,
      leaseUntilMs: record.probeLeaseUntilMs,
      billable: false,
      reserveCredits: false,
      usageLedgerMutation: false
    });
  }

  function completeRecoveryProbe(providerId, token, outcome = {}) {
    const at = nowMs(outcome.atMs);
    const record = ensure(providerId, at);
    const supplied = requiredText(token, 'probe_token');

    if (
      record.probeLeaseToken == null ||
      record.probeLeaseToken !== supplied
    ) {
      throw new Error('provider_recovery_probe_token_invalid');
    }

    if (typeof outcome.success !== 'boolean') {
      throw new Error('provider_recovery_probe_success_boolean_required');
    }

    record.probeLeaseToken = null;
    record.probeLeaseUntilMs = null;
    record.lastProbeAtMs = at;

    if (outcome.success) {
      record.consecutiveFailures = 0;
      record.lastSuccessAtMs = at;
      record.openedAtMs = null;
      record.cooldownUntilMs = null;
      transition(record, HEALTH_STATES.HEALTHY, at);
    } else {
      record.consecutiveFailures = Math.max(record.consecutiveFailures, failureThreshold);
      record.lastFailureAtMs = at;
      record.openedAtMs = at;
      record.cooldownUntilMs = at + cooldownMs;
      transition(record, HEALTH_STATES.OPEN, at);
    }

    return freezeSnapshot({
      provider: publicSnapshot(record, at),
      probe: {
        success: outcome.success,
        billable: false,
        reserveCredits: false,
        usageLedgerMutation: false
      }
    });
  }

  function validateQuotaObservation(observation) {
    if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
      throw new Error('provider_quota_observation_required');
    }

    for (const field of FORBIDDEN_USER_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(observation, field)) {
        throw new Error(`provider_quota_user_scope_forbidden:${field}`);
      }
    }

    const scope = requiredText(observation.scope, 'quota_scope');
    if (!ALLOWED_QUOTA_SCOPES.has(scope)) {
      throw new Error('provider_quota_scope_invalid');
    }

    const explicitState = observation.state == null
      ? null
      : requiredText(observation.state, 'quota_state').toUpperCase();
    if (explicitState && !Object.values(QUOTA_STATES).includes(explicitState)) {
      throw new Error('provider_quota_state_invalid');
    }

    return {
      scope,
      explicitState,
      limit: optionalFinite(observation.limit, 'limit', 0),
      remaining: optionalFinite(observation.remaining, 'remaining', 0),
      resetAtMs: optionalInteger(observation.resetAtMs, 'reset_at_ms', 0),
      retryAfterSeconds: optionalFinite(observation.retryAfterSeconds, 'retry_after_seconds', 0),
      source: optionalText(observation.source)
    };
  }

  function deriveQuotaState(parsed) {
    if (parsed.explicitState) return parsed.explicitState;
    if (parsed.remaining === 0) return QUOTA_STATES.EXHAUSTED;
    if (parsed.remaining != null && parsed.remaining > 0) return QUOTA_STATES.AVAILABLE;
    return QUOTA_STATES.UNKNOWN;
  }

  function observeQuota(providerId, observation = {}) {
    const at = nowMs(observation.observedAtMs);
    const record = ensure(providerId, at);
    const parsed = validateQuotaObservation(observation);

    if (
      parsed.limit != null &&
      parsed.remaining != null &&
      parsed.remaining > parsed.limit
    ) {
      throw new Error('provider_quota_remaining_exceeds_limit');
    }

    record.quota = {
      state: deriveQuotaState(parsed),
      scope: parsed.scope,
      limit: parsed.limit,
      remaining: parsed.remaining,
      resetAtMs: parsed.resetAtMs,
      retryAfterSeconds: parsed.retryAfterSeconds,
      observedAtMs: at,
      source: parsed.source
    };

    return publicSnapshot(record, at);
  }

  function clearQuota(providerId, atMs = null) {
    const at = nowMs(atMs);
    const record = ensure(providerId, at);
    record.quota = {
      ...newQuota(),
      observedAtMs: at
    };
    return publicSnapshot(record, at);
  }

  function listSnapshots(atMs = null) {
    const at = nowMs(atMs);
    return Object.freeze(
      [...providers.values()]
        .map(record => publicSnapshot(record, at))
        .sort((a, b) => a.providerId.localeCompare(b.providerId))
    );
  }

  return Object.freeze({
    version: CONFIG.version,
    failureThreshold,
    cooldownMs,
    probeLeaseMs,
    getSnapshot,
    listSnapshots,
    canAttempt,
    recordOutcome,
    beginRecoveryProbe,
    completeRecoveryProbe,
    observeQuota,
    clearQuota
  });
}

const providerHealthQuotaState = createProviderHealthQuotaState();

module.exports = {
  HEALTH_STATES,
  QUOTA_STATES,
  createProviderHealthQuotaState,
  providerHealthQuotaState
};
