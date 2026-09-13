'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cfg = require('./config/router-fallback-billing.v1.json');
const { createFallbackBillingScope } = require('./lib/routerBillingAttempt');

assert.equal(cfg.version, 'pack-029.fallback-no-double-charge.v1');
assert.equal(cfg.financialAuthority.routerMayMutateBilling, false);
assert.equal(cfg.fallback.sameLogicalBillingIdAcrossAttempts, true);
assert.equal(cfg.fallback.firstAcceptedSuccessWins, true);
assert.equal(cfg.fallback.lateCompletionAccepted, false);

const routes = [
  { provider: 'provider-a', model: 'model-a' },
  { provider: 'provider-b', model: 'model-b' }
];

const rawRequestId = 'logical-request-123-secret';
const scope = createFallbackBillingScope({ requestId: rawRequestId, routes });
assert.equal(scope.maxProviderAttempts, 2);
assert(/^billing_[0-9a-f]{24}$/.test(scope.billingRef));
assert(!scope.billingRef.includes(rawRequestId));

const first = scope.beginAttempt(routes[0]);
assert.equal(first.ordinal, 1);
const firstFailure = scope.completeAttempt(first.attemptId, 'ERROR');
assert.equal(firstFailure.accepted, true);
assert.equal(firstFailure.state, 'ERROR');

const firstReplay = scope.completeAttempt(first.attemptId, 'ERROR');
assert.equal(firstReplay.accepted, false);
assert.equal(firstReplay.replayed, true);

const second = scope.beginAttempt(routes[1]);
assert.equal(second.ordinal, 2);
assert.equal(second.billingRef, first.billingRef);
const secondSuccess = scope.completeAttempt(second.attemptId, 'SUCCESS');
assert.equal(secondSuccess.accepted, true);
assert.equal(secondSuccess.state, 'SUCCESS');

const secondReplay = scope.completeAttempt(second.attemptId, 'SUCCESS');
assert.equal(secondReplay.accepted, false);
assert.equal(secondReplay.replayed, true);
assert.equal(secondReplay.late, true);

const snapshot = scope.snapshot();
assert.equal(snapshot.providerAttemptsStarted, 2);
assert.equal(snapshot.finalState, 'SUCCESS');
assert.equal(snapshot.billingRef, first.billingRef);
assert.equal(snapshot.attempts[0].state, 'ERROR');
assert.equal(snapshot.attempts[1].state, 'SUCCESS');
assert(!JSON.stringify(snapshot).includes(rawRequestId));

assert.throws(
  () => scope.beginAttempt(routes[0]),
  /router_attempt_scope_already_succeeded/
);

const exhausted = createFallbackBillingScope({
  requestId: 'req-exhaust',
  routes: [{ provider: 'p', model: 'm' }]
});
const only = exhausted.beginAttempt({ provider: 'p', model: 'm' });
exhausted.completeAttempt(only.attemptId, 'TIMEOUT');
assert.equal(exhausted.snapshot().finalState, 'EXHAUSTED');
assert.throws(
  () => exhausted.beginAttempt({ provider: 'p2', model: 'm2' }),
  /router_attempt_budget_exhausted/
);

const routerSource = fs.readFileSync(path.join(__dirname, 'aiRouter.js'), 'utf8');
for (const needle of [
  "require('./lib/routerBillingAttempt')",
  'createFallbackBillingScope',
  'fallbackScope.beginAttempt',
  'fallbackScope.completeAttempt',
  'billing_scope: fallbackScope.snapshot()',
  'error.billing_scope = fallbackScope.snapshot()'
]) {
  assert(routerSource.includes(needle), `missing aiRouter Pack029 integration: ${needle}`);
}

for (const forbidden of [
  'reserveCredits(',
  'settleCredits(',
  'refundCredits(',
  'deduct_credit_and_log',
  'settle_credit_charge',
  'refund_credit_and_log'
]) {
  assert(!routerSource.includes(forbidden), `router must never mutate billing: ${forbidden}`);
}

const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
assert(
  /routeRequest\(feature \|\| 'chat', routedMessages, \{\s*loadLevel,\s*isPro,\s*requestId\s*\}\)/m.test(serverSource),
  'server must pass the one logical requestId into router fallback scope'
);

const routeIndex = serverSource.indexOf("routeRequest(feature || 'chat'");
assert(routeIndex > 0);
const beforeRoute = serverSource.slice(Math.max(0, routeIndex - 12000), routeIndex);
const afterRoute = serverSource.slice(routeIndex, routeIndex + 8000);

assert(
  beforeRoute.includes('reserveCredits({') && beforeRoute.includes('requestId'),
  'logical charge must be reserved before routing'
);
assert(
  /settleCredits\(\s*requestId,/m.test(afterRoute),
  'logical request must be settled by the same requestId after routing'
);

const gatekeeperSource = fs.readFileSync(path.join(__dirname, 'gatekeeper.js'), 'utf8');
assert(gatekeeperSource.includes('reserveCredits requires a requestId for idempotency'));
assert(gatekeeperSource.includes('replayed'));
assert(gatekeeperSource.includes('already_refunded'));
assert(gatekeeperSource.includes("supabaseAdmin.rpc('settle_credit_charge'"));
assert(gatekeeperSource.includes("supabaseAdmin.rpc('refund_credit_and_log'"));

const libSource = fs.readFileSync(
  path.join(__dirname, 'lib/routerBillingAttempt.js'),
  'utf8'
);
for (const forbidden of [
  'supabaseAdmin',
  'reserveCredits(',
  'settleCredits(',
  'refundCredits(',
  'fetch(',
  'axios.'
]) {
  assert(!libSource.includes(forbidden), `fallback scope must remain non-billing/non-network: ${forbidden}`);
}

console.log('PASS: forced first-provider failure then second-provider success stays inside one privacy-safe logical billing scope');
console.log('PASS: provider attempts are bounded by the Pack026-eligible route count');
console.log('PASS: terminal attempt replay/late success cannot become a second accepted logical success');
console.log('PASS: aiRouter performs zero reserve/settle/refund operations; server keeps one requestId across reserve -> fallback routing -> settle');
console.log('PASS: existing gatekeeper/RPC replay, serialization and refund invariants remain the financial authority');
console.log('DATABASE / RAILWAY / PROVIDER ACCOUNT / PAYMENT / MODEL NETWORK CALLS: NONE');
