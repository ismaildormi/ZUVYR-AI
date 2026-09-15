'use strict';

const assert = require('node:assert/strict');
const { registerSearchProvider, executeWebSearch } = require('./lib/webSearchEngine');
const { createResearchPlan, executeResearch } = require('./lib/deepResearchEngine');
const { normalizeProduct, compareProducts } = require('./lib/shoppingEngine');

async function main() {
  let calls = 0;
  registerSearchProvider('offline', { async search({ query, limit }) {
    calls++;
    assert.equal(query, 'ZUVYR'); assert.equal(limit, 2);
    return [{ title: 'Result', url: 'https://example.com/result', snippet: 'Verified snippet' }];
  } });
  await assert.rejects(executeWebSearch({ provider: 'offline', query: 'ZUVYR' }), error => error.code === 'web_search_disabled');
  assert.equal(calls, 0);
  const search = await executeWebSearch({ provider: 'offline', query: 'ZUVYR', limit: 2 }, { allowExecution: true });
  assert.equal(search[0].type, 'web'); assert.equal(calls, 1);

  const plan = createResearchPlan({ question: 'compare current evidence', queries: ['current evidence'] });
  await assert.rejects(
    executeResearch(plan, { runOperation: async () => ({ grounding: { sources: [] }, billing: {} }) }),
    error => error.code === 'deep_research_disabled'
  );
  const research = await executeResearch(plan, {
    allowExecution: true,
    runOperation: async ({ key, type, input }) => ({
      grounding: {
        evidence: `evidence for ${input}`,
        sources: type === 'search'
          ? [
              { type: 'web', title: 'A', url: 'https://a.example/x', snippet: 'a' },
              { type: 'web', title: 'B', url: 'https://b.example/y', snippet: 'b' }
            ]
          : [{ type: 'web', title: input, url: input, snippet: 'fetched' }],
        usage: {}, model: 'test', provider: 'test', mode: type
      },
      billing: { creditsCharged: 1, providerCostMicroUsd: '10' }
    })
  });
  assert.equal(research.status, 'succeeded');
  assert(research.independentDomains >= 2);

  const products = await compareProducts({
    query: 'camera', allowExecution: true,
    searchProducts: async () => [
      { id: 'b', title: 'B', price: 20, currency: 'USD', url: 'https://shop.example/b' },
      { id: 'a', title: 'A', price: 10, currency: 'USD', url: 'https://shop.example/a', availability: 'in_stock' }
    ]
  });
  assert.deepEqual(products.map(item => item.id), ['a', 'b']);
  console.log('PASS: Pack 03 injected Web Search, multi-source research and product comparison engines');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
