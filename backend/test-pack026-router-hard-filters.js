'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cfg = require('./config/router-hard-filters.v1.json');
const {
  REASONS,
  createRouterHardFilters
} = require('./lib/routerHardFilters');

assert.equal(cfg.version, 'pack-026.router-hard-filters.v1');
assert.equal(cfg.fallback.unknownCostCannotFallback, true);
assert.equal(cfg.margin.defaultMinimumGrossMarginBps, 5000);

const baseCandidates = [
  {
    id: 'groq:m1',
    providerId: 'groq',
    modelId: 'm1',
    validBaseCandidate: true,
    capabilityStates: [
      { capability: 'chat', providerCostEligible: true }
    ]
  },
  {
    id: 'openrouter:unknown',
    providerId: 'openrouter',
    modelId: 'unknown',
    validBaseCandidate: false,
    capabilityStates: [
      { capability: 'chat', providerCostEligible: false }
    ]
  }
];

function makeHarness({
  candidates = baseCandidates,
  health = 'HEALTHY',
  quota = 'UNKNOWN',
  regions = ['provider_managed'],
  finiteCost = true
} = {}) {
  return createRouterHardFilters({
    listCandidates: () => candidates.filter(item => item.validBaseCandidate),
    modelSnapshot: id => candidates.find(item => item.id === id) || null,
    providerSnapshot: providerId => ({
      id: providerId,
      enabled: true,
      regions
    }),
    healthState: {
      getSnapshot: providerId => ({
        providerId,
        health: { state: health },
        quota: { state: quota }
      })
    },
    costTier: () => finiteCost ? 0 : Number.POSITIVE_INFINITY
  });
}

const chain = [
  { provider: 'groq', model: 'm1' },
  { provider: 'openrouter', model: 'unknown' }
];

let result = makeHarness().filterLegacyChain({
  capability: 'chat',
  chain,
  entitlementAllowed: true,
  permissionAllowed: true,
  minimumGrossMarginBps: 5000,
  quotedGrossMarginBps: 5000
});
assert.deepEqual(result.routes, [{ provider: 'groq', model: 'm1' }]);
assert.equal(result.filtered.length, 1);
assert.equal(
  result.filtered[0].decision.reasons.includes(
    REASONS.REGISTRY_INELIGIBLE_OR_UNKNOWN_COST
  ),
  true
);
assert.equal(result.fallbackCannotBypassFilters, true);
assert.equal(
  result.routes.some(route => route.provider === 'openrouter'),
  false,
  'unknown-cost fallback must not survive the pre-loop hard-filter pass'
);

result = makeHarness().filterLegacyChain({
  capability: 'chat',
  chain: [{ provider: 'groq', model: 'm1' }],
  entitlementAllowed: false,
  permissionAllowed: true,
  minimumGrossMarginBps: 5000,
  quotedGrossMarginBps: 5000
});
assert.equal(result.routes.length, 0);
assert(result.filtered[0].decision.reasons.includes(REASONS.ENTITLEMENT_DENIED));

result = makeHarness().filterLegacyChain({
  capability: 'chat',
  chain: [{ provider: 'groq', model: 'm1' }],
  entitlementAllowed: true,
  permissionAllowed: false,
  minimumGrossMarginBps: 5000,
  quotedGrossMarginBps: 5000
});
assert.equal(result.routes.length, 0);
assert(result.filtered[0].decision.reasons.includes(REASONS.PERMISSION_DENIED));

result = makeHarness({ health: 'OPEN' }).filterLegacyChain({
  capability: 'chat',
  chain: [{ provider: 'groq', model: 'm1' }],
  entitlementAllowed: true,
  permissionAllowed: true,
  minimumGrossMarginBps: 5000,
  quotedGrossMarginBps: 5000
});
assert.equal(result.routes.length, 0);
assert(result.filtered[0].decision.reasons.includes(REASONS.PROVIDER_HEALTH_OPEN));

result = makeHarness({ health: 'DEGRADED' }).filterLegacyChain({
  capability: 'chat',
  chain: [{ provider: 'groq', model: 'm1' }],
  entitlementAllowed: true,
  permissionAllowed: true,
  minimumGrossMarginBps: 5000,
  quotedGrossMarginBps: 5000
});
assert.equal(result.routes.length, 1, 'DEGRADED is eligible; Pack027 may rank it lower');

result = makeHarness({ quota: 'EXHAUSTED' }).filterLegacyChain({
  capability: 'chat',
  chain: [{ provider: 'groq', model: 'm1' }],
  entitlementAllowed: true,
  permissionAllowed: true,
  minimumGrossMarginBps: 5000,
  quotedGrossMarginBps: 5000
});
assert.equal(result.routes.length, 0);
assert(result.filtered[0].decision.reasons.includes(REASONS.PROVIDER_QUOTA_EXHAUSTED));

result = makeHarness({ finiteCost: false }).filterLegacyChain({
  capability: 'chat',
  chain: [{ provider: 'groq', model: 'm1' }],
  entitlementAllowed: true,
  permissionAllowed: true,
  minimumGrossMarginBps: 5000,
  quotedGrossMarginBps: 5000
});
assert.equal(result.routes.length, 0);
assert(result.filtered[0].decision.reasons.includes(REASONS.VERIFIED_COST_REQUIRED));

result = makeHarness({ regions: ['us-east'] }).filterLegacyChain({
  capability: 'chat',
  chain: [{ provider: 'groq', model: 'm1' }],
  entitlementAllowed: true,
  permissionAllowed: true,
  region: 'eu-west',
  minimumGrossMarginBps: 5000,
  quotedGrossMarginBps: 5000
});
assert.equal(result.routes.length, 0);
assert(result.filtered[0].decision.reasons.includes(REASONS.REGION_UNVERIFIED));

result = makeHarness().filterLegacyChain({
  capability: 'chat',
  chain: [{ provider: 'groq', model: 'm1' }],
  entitlementAllowed: true,
  permissionAllowed: true,
  minimumGrossMarginBps: 5000,
  quotedGrossMarginBps: 4999
});
assert.equal(result.routes.length, 0);
assert(result.filtered[0].decision.reasons.includes(REASONS.MARGIN_FLOOR));

result = makeHarness().filterLegacyChain({
  capability: 'chat',
  chain: [{ provider: 'groq', model: 'm1' }],
  entitlementAllowed: true,
  permissionAllowed: true,
  minimumGrossMarginBps: 5000
});
assert.equal(result.routes.length, 0);
assert(result.filtered[0].decision.reasons.includes(REASONS.MARGIN_FLOOR_UNKNOWN));

const registryBehavior = [];
const languageContextHarness = createRouterHardFilters({
  listCandidates: query => {
    registryBehavior.push(query);
    if (query.language === 'fr') return [];
    if (query.minimumContextTokens === 999999) return [];
    if (query.inputModality === 'image') return [];
    return [baseCandidates[0]];
  },
  providerSnapshot: () => ({ enabled: true, regions: ['provider_managed'] }),
  healthState: {
    getSnapshot: () => ({
      health: { state: 'HEALTHY' },
      quota: { state: 'UNKNOWN' }
    })
  },
  costTier: () => 0
});

for (const request of [
  { language: 'fr' },
  { minimumContextTokens: 999999 },
  { inputModality: 'image' }
]) {
  const filtered = languageContextHarness.filterLegacyChain({
    capability: 'chat',
    chain: [{ provider: 'groq', model: 'm1' }],
    entitlementAllowed: true,
    permissionAllowed: true,
    minimumGrossMarginBps: 5000,
    quotedGrossMarginBps: 5000,
    ...request
  });
  assert.equal(filtered.routes.length, 0);
}
assert.equal(registryBehavior.length, 3);

const aiRouterSource = fs.readFileSync(path.join(__dirname, 'aiRouter.js'), 'utf8');
assert(
  aiRouterSource.includes("require('./lib/routerHardFilters')"),
  'aiRouter must import Pack026 hard filters'
);
assert(
  aiRouterSource.includes('routerHardFilters.filterLegacyChain'),
  'aiRouter must hard-filter the chain before provider attempts'
);
assert(
  aiRouterSource.includes('const attempts = [...hardFilterAttempts]'),
  'hard-filtered routes must be recorded before the fallback loop'
);
assert(
  aiRouterSource.indexOf('routerHardFilters.filterLegacyChain') <
    aiRouterSource.indexOf('for (let i = 0; i < chain.length; i++)'),
  'hard filters must run before the fallback loop'
);

const hardFilterSource = fs.readFileSync(
  path.join(__dirname, 'lib/routerHardFilters.js'),
  'utf8'
);
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
  assert(
    !hardFilterSource.includes(forbidden),
    `Pack026 filters must remain non-billing and non-network: ${forbidden}`
  );
}

console.log('PASS: Pack026 hard-filters entitlement, permission, registry/base eligibility, modality, language, context, region, provider health, provider quota, verified cost and margin floor');
console.log('PASS: fallback routes are filtered before the provider-attempt loop; an ineligible or unknown-cost route cannot re-enter as fallback');
console.log('PASS: OPEN provider and EXHAUSTED provider quota are blocked; DEGRADED remains eligible for Pack027 ranking');
console.log('PASS: explicit denied authorization, unverified region, unknown margin and below-floor margin all fail closed');
console.log('DATABASE / RAILWAY / PROVIDER ACCOUNT / PAYMENT / MODEL NETWORK CALLS: NONE');
