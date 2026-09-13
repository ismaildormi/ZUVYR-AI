'use strict';

const assert = require('node:assert/strict');
const cfg = require('./config/router-checkpoint-c.v1.json');
const { routerCheckpointC } = require('./lib/routerCheckpointC');

if (process.env.PACK030_LIVE_PROVIDER_PROOF !== '1') {
  throw new Error('PACK030_LIVE_PROVIDER_PROOF_required');
}

const apiKey = String(process.env.GROQ_API_KEY || '').trim();
if (!apiKey) throw new Error('GROQ_API_KEY_missing_in_railway_environment');

const messages = [
  { role: 'user', content: cfg.liveProof.prompt }
];

async function invokeGroq(route, routedMessages) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: route.model,
        messages: routedMessages,
        temperature: 0,
        max_tokens: cfg.liveProof.maxCompletionTokens
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const error = new Error(`groq_http_${response.status}`);
      error.code = `GROQ_HTTP_${response.status}`;
      throw error;
    }

    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new Error('groq_live_empty_text');
    }

    return {
      textPresent: true,
      providerModel: payload?.model || route.model,
      usagePresent: !!payload?.usage
    };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const summaries = [];

  for (const proof of cfg.liveProof.routes) {
    const result = await routerCheckpointC.execute({
      chain: [{ provider: proof.provider, model: proof.model }],
      feature: 'chat',
      capability: proof.capability,
      rankingMode: 'smart',
      messages,
      invoke: invokeGroq,
      env: process.env,
      minimumGrossMarginBps: 5000,
      quotedGrossMarginBps: 7000,
      requestId: `pack030:${proof.provider}:${proof.model}`
    });

    assert.equal(result.success, true);
    assert.equal(result.provider, proof.provider);
    assert.equal(result.model, proof.model);
    assert.equal(result.attempts.length, 1);
    assert.equal(result.attempts[0].status, 'success');
    assert.equal(result.billingScope.finalState, 'SUCCESS');

    summaries.push({
      provider: result.provider,
      model: result.model,
      attempts: result.attempts.length,
      success: result.success
    });
  }

  assert.equal(summaries.length, 2);
  assert.notEqual(summaries[0].model, summaries[1].model);

  console.log('PACK030_LIVE_TEXT_ROUTE_1=PASS provider=groq model=openai/gpt-oss-20b');
  console.log('PACK030_LIVE_TEXT_ROUTE_2=PASS provider=groq model=openai/gpt-oss-120b');
  console.log('PACK030_LIVE_TEXT_ROUTES=2');
  console.log('PACK030_LIVE_MODEL_OUTPUT_PRINTED=false');
  console.log('PACK030_LIVE_BILLING_MUTATION=false');
  console.log('PACK030_LIVE_DB_MUTATION=false');
})().catch(error => {
  console.error(`PACK030_LIVE_ERROR=${error.message}`);
  process.exitCode = 1;
});
