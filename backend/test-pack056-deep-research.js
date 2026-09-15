'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createResearchPlan, executeResearch, buildResearchEvidenceContext } = require('./lib/deepResearchEngine');
const { researchRunKey } = require('./lib/deepResearchCheckpointStore');
const { assertChatModeAvailable } = require('./lib/chatCapabilities');
const { planHasFeature } = require('./lib/planEntitlements');

async function run() {
  const plan = createResearchPlan({ question: 'ZUVYR research verification', queries: ['ZUVYR verification'] });
  assert.equal(plan.version, 'pack-056.deep-research-plan.v1');
  assert(plan.maxOperations <= 6);
  assert.equal(assertChatModeAvailable('deep_research').status, 'live_verified');
  assert.equal(planHasFeature('plus', 'deep_research'), false);
  assert.equal(planHasFeature('pro', 'deep_research'), true);
  assert.equal(planHasFeature('legend', 'deep_research'), true);
  assert.equal(planHasFeature('max', 'deep_research'), true);

  const calls = [];
  const result = await executeResearch(plan, {
    allowExecution: true,
    runOperation: async ({ key, type, input }) => {
      calls.push({ key, type, input });
      const sources = type === 'search'
        ? [
            { type: 'web', title: 'Primary', url: 'https://primary.example/a', snippet: 'primary evidence' },
            { type: 'web', title: 'Independent', url: 'https://independent.example/b', snippet: 'independent evidence' }
          ]
        : [{ type: 'web', title: 'Fetched', url: input, snippet: 'full-page evidence' }];
      return {
        grounding: { evidence: `${type}:${input}`, sources, usage: {}, model: 'test', provider: 'test', mode: type },
        billing: { requestId: `req-${calls.length}`, creditsCharged: 1, providerCostMicroUsd: '100', pricingVersion: 'test' }
      };
    }
  });
  assert.equal(result.status, 'succeeded');
  assert(result.independentDomains >= 2);
  assert(calls.length <= 6);
  assert.equal(result.creditsCharged, calls.length);
  assert.equal(result.providerCostMicroUsd, String(calls.length * 100));
  const context = buildResearchEvidenceContext(result, result.sources);
  assert(context.includes('untrusted evidence'));
  assert(context.includes('[source-1]'));

  const keyA = researchRunKey({ userId: 'u', turnId: 't', conversationId: 'c', question: 'q' });
  const keyB = researchRunKey({ userId: 'u', turnId: 't', conversationId: 'c', question: 'q' });
  assert.equal(keyA, keyB);
  assert(keyA.startsWith('deep-research:'));

  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(server.includes("chatMode === 'deep_research'"));
  assert(server.includes("planHasFeature(subscriptionPlan, 'deep_research')"));
  assert(server.includes("usageKind: directUrl ? 'deep_research_fetch' : 'deep_research_search'"));
  assert(server.includes('researchStore.startOperation'));
  assert(server.includes('researchStore.completeOperation'));
  assert(server.includes('researchStore.failOperation'));
  assert(server.includes('researchStore.completeRun'));
  assert(server.includes('dr:${researchRun.id}:'));

  const frontend = fs.readFileSync(path.join(__dirname, '../frontend/zuvyr-chat-workspace-v1.js'), 'utf8');
  assert(frontend.includes("'deep_research'"));
  assert(frontend.includes('zuvyr-deep-research-toggle'));
  console.log('PASS: Pack056 bounded checkpointed Deep Research, search-to-crawl evidence, Pro entitlement, per-operation idempotent billing and UI wiring');
}

run().catch(error => { console.error(error); process.exit(1); });
