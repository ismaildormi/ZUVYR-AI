'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cfg = require('./config/router-checkpoint-c.v1.json');
const { createRouterCheckpointC } = require('./lib/routerCheckpointC');

assert.equal(cfg.version, 'pack-030.router-checkpoint-c.v1');
assert.equal(cfg.liveProof.expectedLiveCalls, 2);
assert.equal(cfg.liveProof.maxCompletionTokens, 256);
assert.equal(cfg.safety.realMoney, false);
assert.equal(cfg.safety.liveBillingAllowed, false);
assert.equal(cfg.safety.secretValuesRecorded, false);

const routes = [
  { provider: 'p1', model: 'm1' },
  { provider: 'p2', model: 'm2' }
];

const fakeHardFilters = {
  filterLegacyChain({ chain }) {
    return { routes: [...chain], filtered: [] };
  }
};

const fakeRanking = {
  rankEligibleRoutes({ eligibleRoutes }) {
    return {
      mode: 'SMART_BEST_VALUE',
      routes: [...eligibleRoutes],
      ranked: eligibleRoutes.map((route, i) => ({ route, score: 100 - i })),
      candidateSetPreserved: true
    };
  }
};

const fakeMarginGuard = () => ({
  state: 'GREEN',
  allowed: true,
  quotedGrossMarginBps: 7000,
  minimumGrossMarginBps: 5000
});

const checkpoint = createRouterCheckpointC({
  hardFilters: fakeHardFilters,
  ranking: fakeRanking,
  marginGuard: fakeMarginGuard
});

(async () => {
  let callCount = 0;
  const result = await checkpoint.execute({
    chain: routes,
    requestId: 'logical-request-030',
    invoke: async route => {
      callCount += 1;
      if (callCount === 1) {
        const error = new Error('synthetic rate limit');
        error.code = 'RATE_LIMIT';
        throw error;
      }
      return { text: 'ok', route };
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.provider, 'p2');
  assert.equal(result.model, 'm2');
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].status, 'error');
  assert.equal(result.attempts[1].status, 'success');
  assert.equal(result.billingScope.providerAttemptsStarted, 2);
  assert.equal(result.billingScope.finalState, 'SUCCESS');
  assert(/^billing_[0-9a-f]{24}$/.test(result.billingScope.billingRef));

  const timeoutCheckpoint = createRouterCheckpointC({
    hardFilters: fakeHardFilters,
    ranking: fakeRanking,
    marginGuard: fakeMarginGuard
  });
  let timeoutCalls = 0;
  const timeoutResult = await timeoutCheckpoint.execute({
    chain: routes,
    requestId: 'logical-request-timeout',
    invoke: async route => {
      timeoutCalls += 1;
      if (timeoutCalls === 1) {
        const error = new Error('synthetic timeout');
        error.name = 'AbortError';
        throw error;
      }
      return { text: 'ok', route };
    }
  });
  assert.equal(timeoutResult.success, true);
  assert.equal(timeoutResult.attempts[0].code, 'AbortError');

  const providerDownHardFilters = {
    filterLegacyChain({ chain }) {
      return {
        routes: chain.slice(1),
        filtered: [{ route: chain[0], decision: { reasons: ['PROVIDER_HEALTH_OPEN'] } }]
      };
    }
  };
  const downResult = await createRouterCheckpointC({
    hardFilters: providerDownHardFilters,
    ranking: fakeRanking,
    marginGuard: fakeMarginGuard
  }).execute({
    chain: routes,
    requestId: 'logical-request-down',
    invoke: async route => ({ text: 'ok', route })
  });
  assert.equal(downResult.provider, 'p2');
  assert.equal(downResult.attempts.length, 1);

  const unknownCostHardFilters = {
    filterLegacyChain({ chain }) {
      return {
        routes: [],
        filtered: [{
          route: chain[0],
          decision: { reasons: ['REGISTRY_INELIGIBLE_OR_UNKNOWN_COST'] }
        }]
      };
    }
  };
  await assert.rejects(
    () => createRouterCheckpointC({
      hardFilters: unknownCostHardFilters,
      ranking: fakeRanking,
      marginGuard: fakeMarginGuard
    }).execute({
      chain: [{ provider: 'unknown', model: 'unknown-cost-model' }],
      requestId: 'unknown-cost',
      invoke: async () => ({ text: 'should-not-run' })
    }),
    /checkpoint_no_eligible_routes/
  );

  const libSource = fs.readFileSync(
    path.join(__dirname, 'lib/routerCheckpointC.js'),
    'utf8'
  );
  for (const forbidden of [
    'reserveCredits(',
    'settleCredits(',
    'refundCredits(',
    'supabaseAdmin',
    'fetch(',
    'axios.'
  ]) {
    assert(!libSource.includes(forbidden), `checkpoint harness must stay non-billing/non-network: ${forbidden}`);
  }

  console.log('PASS: Checkpoint C forced first-attempt failure then second success with one logical billing scope');
  console.log('PASS: timeout and provider-down simulations preserve bounded fallback');
  console.log('PASS: unknown-cost candidate is blocked before invocation');
  console.log('PASS: checkpoint harness contains no reserve/settle/refund/DB/network implementation');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
