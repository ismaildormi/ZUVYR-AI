'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cfg = require('./config/provider-health-quota-state.v1.json');
const {
  HEALTH_STATES,
  QUOTA_STATES,
  createProviderHealthQuotaState
} = require('./lib/providerHealthQuotaState');

assert.equal(cfg.version, 'pack-024.provider-health-quota-state.v1');
assert.deepEqual(cfg.healthStates, ['HEALTHY', 'DEGRADED', 'OPEN']);
assert.deepEqual(cfg.quotaStates, ['UNKNOWN', 'AVAILABLE', 'LIMITED', 'EXHAUSTED']);
assert.equal(cfg.providerQuota.separateFromUserQuota, true);
assert.equal(cfg.recoveryProbe.billable, false);
assert.equal(cfg.recoveryProbe.creditReservation, false);
assert.equal(cfg.recoveryProbe.usageLedgerMutation, false);

let now = 1000;
const state = createProviderHealthQuotaState({
  failureThreshold: 2,
  cooldownMs: 100,
  probeLeaseMs: 25,
  clock: () => now
});

let snapshot = state.getSnapshot('groq');
assert.equal(snapshot.health.state, HEALTH_STATES.HEALTHY);
assert.equal(snapshot.quota.state, QUOTA_STATES.UNKNOWN);
assert.equal(snapshot.separation.providerQuotaSeparateFromUserQuota, true);
assert.equal(snapshot.separation.userBillingMutation, false);

snapshot = state.recordOutcome('groq', { success: false, atMs: 1010 });
assert.equal(snapshot.health.state, HEALTH_STATES.DEGRADED);
assert.equal(snapshot.health.consecutiveFailures, 1);
assert.equal(snapshot.health.lastFailureAtMs, 1010);

snapshot = state.recordOutcome('groq', { success: false, atMs: 1020 });
assert.equal(snapshot.health.state, HEALTH_STATES.OPEN);
assert.equal(snapshot.health.consecutiveFailures, 2);
assert.equal(snapshot.health.openedAtMs, 1020);
assert.equal(snapshot.health.cooldownUntilMs, 1120);

let decision = state.canAttempt('groq', 1119);
assert.equal(decision.allowed, false);
assert.equal(decision.reason, 'provider_circuit_open');
assert.equal(decision.recoveryProbeEligible, false);

decision = state.canAttempt('groq', 1120);
assert.equal(decision.allowed, false);
assert.equal(decision.reason, 'recovery_probe_required');
assert.equal(decision.recoveryProbeEligible, true);
assert.equal(decision.billableProbe, false);

const probe = state.beginRecoveryProbe('groq', 1120);
assert.equal(probe.started, true);
assert.equal(probe.billable, false);
assert.equal(probe.reserveCredits, false);
assert.equal(probe.usageLedgerMutation, false);

const duplicateProbe = state.beginRecoveryProbe('groq', 1121);
assert.equal(duplicateProbe.started, false);
assert.equal(duplicateProbe.reason, 'provider_probe_already_in_flight');
assert.equal(duplicateProbe.billable, false);

const recovered = state.completeRecoveryProbe('groq', probe.token, {
  success: true,
  atMs: 1122
});
assert.equal(recovered.provider.health.state, HEALTH_STATES.HEALTHY);
assert.equal(recovered.provider.health.lastSuccessAtMs, 1122);
assert.equal(recovered.probe.billable, false);
assert.equal(recovered.probe.reserveCredits, false);
assert.equal(recovered.probe.usageLedgerMutation, false);
assert.equal(state.canAttempt('groq', 1123).allowed, true);

state.recordOutcome('groq', { success: false, atMs: 1200 });
state.recordOutcome('groq', { success: false, atMs: 1201 });
const failedProbe = state.beginRecoveryProbe('groq', 1301);
assert.equal(failedProbe.started, true);
const reopened = state.completeRecoveryProbe('groq', failedProbe.token, {
  success: false,
  atMs: 1302
});
assert.equal(reopened.provider.health.state, HEALTH_STATES.OPEN);
assert.equal(reopened.provider.health.cooldownUntilMs, 1402);
assert.equal(reopened.probe.billable, false);

snapshot = state.observeQuota('groq', {
  scope: 'organization',
  limit: 100,
  remaining: 25,
  resetAtMs: 2000,
  observedAtMs: 1500,
  source: 'provider_headers'
});
assert.equal(snapshot.quota.state, QUOTA_STATES.AVAILABLE);
assert.equal(snapshot.quota.scope, 'organization');
assert.equal(snapshot.quota.limit, 100);
assert.equal(snapshot.quota.remaining, 25);
assert.equal(snapshot.quota.resetAtMs, 2000);
assert.equal(snapshot.quota.observedAtMs, 1500);

snapshot = state.observeQuota('groq', {
  scope: 'organization',
  state: 'LIMITED',
  remaining: 4,
  retryAfterSeconds: 2,
  observedAtMs: 1600,
  source: 'provider_signal'
});
assert.equal(snapshot.quota.state, QUOTA_STATES.LIMITED);
assert.equal(snapshot.quota.retryAfterSeconds, 2);

snapshot = state.observeQuota('groq', {
  scope: 'organization',
  remaining: 0,
  observedAtMs: 1700,
  source: 'provider_signal'
});
assert.equal(snapshot.quota.state, QUOTA_STATES.EXHAUSTED);

assert.throws(
  () => state.observeQuota('groq', {
    scope: 'organization',
    userId: 'must-not-be-here',
    remaining: 1,
    observedAtMs: 1800
  }),
  /provider_quota_user_scope_forbidden:userId/
);
assert.throws(
  () => state.observeQuota('groq', {
    scope: 'organization',
    creditsRemaining: 100,
    remaining: 1,
    observedAtMs: 1800
  }),
  /provider_quota_user_scope_forbidden:creditsRemaining/
);
assert.throws(
  () => state.observeQuota('groq', {
    scope: 'user',
    remaining: 1,
    observedAtMs: 1800
  }),
  /provider_quota_scope_invalid/
);

const serialized = JSON.stringify(state.getSnapshot('groq', 1801));
for (const forbidden of [
  'userId',
  'creditsRemaining',
  'topupBalance',
  'subscriptionStatus'
]) {
  assert(!serialized.includes(forbidden), `user quota field leaked into provider quota snapshot: ${forbidden}`);
}

const source = fs.readFileSync(path.join(__dirname, 'lib/providerHealthQuotaState.js'), 'utf8');
for (const billingSymbol of [
  'reserveCredits(',
  'refundCredits(',
  'deduct_credit',
  'reserve_zuvyr_usage',
  'zuvyr_usage_records'
]) {
  assert(
    !source.includes(billingSymbol),
    `provider health/quota state must not mutate user billing: ${billingSymbol}`
  );
}

const providerRegistry = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'config/provider-registry.v1.json'), 'utf8')
);
assert.equal(providerRegistry.healthAdapter.scope, 'preflight_only');
assert(
  providerRegistry.healthAdapter.note.includes('Pack024'),
  'Pack021 must preserve the boundary that Pack024 owns runtime circuit state'
);
assert.equal(providerRegistry.providers.groq.quotaType, 'organization');

const adapterCfg = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'config/provider-adapter-contract.v1.json'), 'utf8')
);
assert(
  adapterCfg.notes.some(note => note.includes('Pack024 owns health/quota runtime state')),
  'Pack023 must delegate provider health/quota runtime state to Pack024'
);

console.log('PASS: Pack024 implements provider HEALTHY/DEGRADED/OPEN runtime state with timestamps, cooldown and single recovery-probe lease');
console.log('PASS: simulated outage opens the provider circuit and a successful post-cooldown recovery probe restores HEALTHY');
console.log('PASS: recovery probes are explicitly non-billable and contain no user-credit or unified-usage-ledger mutation path');
console.log('PASS: provider quota pool state is separate from user quota and rejects user/billing fields');
console.log('DATABASE / RAILWAY / PROVIDER ACCOUNT / PAYMENT / MODEL NETWORK CALLS: NONE');
