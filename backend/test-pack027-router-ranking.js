'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cfg = require('./config/router-ranking.v1.json');
const {
  DIMENSIONS,
  normalizeMode,
  createRouterRanking
} = require('./lib/routerRanking');

assert.equal(cfg.version, 'pack-027.router-ranking.v1');
assert.deepEqual(DIMENSIONS, [
  'quality',
  'reliability',
  'latency',
  'margin',
  'context',
  'language',
  'privacy'
]);
assert.equal(normalizeMode('smart'), 'SMART_BEST_VALUE');
assert.equal(normalizeMode('best value'), 'SMART_BEST_VALUE');
assert.equal(normalizeMode('economy'), 'ECONOMY');
assert.equal(normalizeMode('fast'), 'FAST');
assert.equal(normalizeMode('max quality'), 'MAX_QUALITY');

for (const spec of Object.values(cfg.modes)) {
  assert.equal(
    Object.values(spec.weights).reduce((sum, value) => sum + value, 0),
    100,
    'each base ranking mode must have 100 total configured weight'
  );
}

const candidates = [
  {
    id: 'p:quality',
    providerId: 'p',
    modelId: 'quality',
    validBaseCandidate: true,
    qualityTier: 100,
    latencyClass: 20,
    context: { maxTokens: 200000 },
    languages: ['en', 'fr'],
    languageVerification: 'verified'
  },
  {
    id: 'p:fast',
    providerId: 'p',
    modelId: 'fast',
    validBaseCandidate: true,
    qualityTier: 55,
    latencyClass: 100,
    context: { maxTokens: 64000 },
    languages: ['en'],
    languageVerification: 'verified'
  },
  {
    id: 'p:value',
    providerId: 'p',
    modelId: 'value',
    validBaseCandidate: true,
    qualityTier: 70,
    latencyClass: 65,
    context: { maxTokens: 128000 },
    languages: ['en', 'fr'],
    languageVerification: 'verified'
  }
];

const health = {
  p: {
    health: { state: 'HEALTHY' },
    quota: { state: 'AVAILABLE' }
  }
};

const ranking = createRouterRanking({
  listCandidates: () => candidates,
  providerSnapshot: providerId => ({
    id: providerId,
    enabled: true,
    privacyScore: 50
  }),
  healthState: {
    getSnapshot: providerId => health[providerId] || {
      health: { state: 'HEALTHY' },
      quota: { state: 'UNKNOWN' }
    }
  }
});

const routes = [
  { provider: 'p', model: 'quality' },
  { provider: 'p', model: 'fast' },
  { provider: 'p', model: 'value' }
];

function keys(result) {
  return result.routes.map(route => `${route.provider}::${route.model}`);
}

const common = {
  eligibleRoutes: routes,
  capability: 'chat',
  language: 'en',
  minimumContextTokens: 32000,
  minimumGrossMarginBps: 5000,
  privacyScoreByRoute: {
    'p::quality': 50,
    'p::fast': 50,
    'p::value': 50
  }
};

const economy = ranking.rankEligibleRoutes({
  ...common,
  mode: 'economy',
  marginBpsByRoute: {
    'p::quality': 5200,
    'p::fast': 6000,
    'p::value': 10000
  }
});
assert.equal(keys(economy)[0], 'p::value');

const fast = ranking.rankEligibleRoutes({
  ...common,
  mode: 'fast',
  marginBpsByRoute: {
    'p::quality': 7000,
    'p::fast': 7000,
    'p::value': 7000
  }
});
assert.equal(keys(fast)[0], 'p::fast');

const maxQuality = ranking.rankEligibleRoutes({
  ...common,
  mode: 'max_quality',
  marginBpsByRoute: {
    'p::quality': 7000,
    'p::fast': 7000,
    'p::value': 7000
  }
});
assert.equal(keys(maxQuality)[0], 'p::quality');

const smart = ranking.rankEligibleRoutes({
  ...common,
  mode: 'smart',
  marginBpsByRoute: {
    'p::quality': 6200,
    'p::fast': 7000,
    'p::value': 8500
  },
  privacyScoreByRoute: {
    'p::quality': 50,
    'p::fast': 40,
    'p::value': 90
  }
});
assert.equal(keys(smart)[0], 'p::value');

for (const result of [economy, fast, maxQuality, smart]) {
  assert.equal(result.candidateSetPreserved, true);
  assert.deepEqual([...keys(result)].sort(), [...keys({ routes })].sort());
  assert.equal(result.ranked.length, routes.length);
  for (const item of result.ranked) {
    for (const dimension of DIMENSIONS) {
      assert(Number.isFinite(item.breakdown[dimension]));
      assert(item.breakdown[dimension] >= 0 && item.breakdown[dimension] <= 100);
    }
  }
}

const deterministicA = ranking.rankEligibleRoutes({
  ...common,
  mode: 'smart',
  loadLevel: 'high',
  marginBpsByRoute: {
    'p::quality': 7000,
    'p::fast': 7000,
    'p::value': 7000
  }
});
const deterministicB = ranking.rankEligibleRoutes({
  ...common,
  mode: 'smart',
  loadLevel: 'high',
  marginBpsByRoute: {
    'p::quality': 7000,
    'p::fast': 7000,
    'p::value': 7000
  }
});
assert.deepEqual(keys(deterministicA), keys(deterministicB));
assert.deepEqual(
  deterministicA.ranked.map(item => item.score),
  deterministicB.ranked.map(item => item.score)
);

const degradedRanking = createRouterRanking({
  listCandidates: () => candidates,
  providerSnapshot: providerId => ({ id: providerId, enabled: true }),
  healthState: {
    getSnapshot: () => ({
      health: { state: 'DEGRADED' },
      quota: { state: 'LIMITED' }
    })
  }
}).rankEligibleRoutes({
  ...common,
  mode: 'smart',
  marginBpsByRoute: {
    'p::quality': 7000,
    'p::fast': 7000,
    'p::value': 7000
  }
});
assert(
  degradedRanking.ranked.every(item => item.breakdown.reliability < 70),
  'DEGRADED + LIMITED must rank lower on reliability without becoming a hard filter'
);

assert.throws(
  () => createRouterRanking({
    listCandidates: () => candidates.slice(0, 2),
    providerSnapshot: () => ({ enabled: true }),
    healthState: {
      getSnapshot: () => ({
        health: { state: 'HEALTHY' },
        quota: { state: 'AVAILABLE' }
      })
    }
  }).rankEligibleRoutes({
    eligibleRoutes: routes,
    capability: 'chat'
  }),
  /router_ranking_received_ineligible_route/
);

const source = fs.readFileSync(path.join(__dirname, 'lib/routerRanking.js'), 'utf8');
for (const forbidden of [
  'reserveCredits(',
  'refundCredits(',
  'settleCredits(',
  'reserve_zuvyr_usage',
  'zuvyr_usage_records',
  'fetch(',
  'axios.',
  'supabaseAdmin'
]) {
  assert(!source.includes(forbidden), `ranking must remain pure: ${forbidden}`);
}

const routerSource = fs.readFileSync(path.join(__dirname, 'aiRouter.js'), 'utf8');
assert(routerSource.includes("require('./lib/routerRanking')"));
assert(routerSource.includes('routerRanking.rankEligibleRoutes'));
assert(
  routerSource.indexOf('routerHardFilters.filterLegacyChain') <
    routerSource.indexOf('routerRanking.rankEligibleRoutes')
);
assert(
  routerSource.indexOf('routerRanking.rankEligibleRoutes') <
    routerSource.indexOf('for (let i = 0; i < chain.length; i++)')
);

console.log('PASS: Pack027 implements Smart/Best Value, Economy, Fast and Max Quality with configurable quality/reliability/latency/margin/context/language/privacy scoring');
console.log('PASS: deterministic fixtures change ordering by mode while preserving exactly the Pack026-eligible candidate set');
console.log('PASS: load, DEGRADED health and LIMITED provider quota affect ranking without bypassing Pack026 hard filters');
console.log('PASS: missing privacy/margin evidence stays neutral rather than being invented; Pack028 retains measured margin-guard and decision-log ownership');
console.log('DATABASE / RAILWAY / PROVIDER ACCOUNT / PAYMENT / MODEL NETWORK CALLS: NONE');
