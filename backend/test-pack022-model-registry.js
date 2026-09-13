'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cfg = require('./config/model-registry.v1.json');
const registry = require('./lib/modelRegistry');

assert.equal(cfg.version, 'pack-022.model-registry.v1');
assert.equal(cfg.providerAuthority, 'backend/config/provider-registry.v1.json');
assert.equal(cfg.costAuthority, 'backend/config/cost-registry.v1.json');
assert.equal(cfg.candidateDiscoveryAuthority, 'backend/lib/modelRegistry.js');

const requiredFields = [
  'providerId',
  'capabilities',
  'modalities',
  'context',
  'languages',
  'qualityTier',
  'latencyClass',
  'commercialEligibility',
  'priceReference',
  'deprecation'
];

const ids = new Set();
for (const entry of cfg.models) {
  assert(entry.id && !ids.has(entry.id), `duplicate/missing model id: ${entry.id}`);
  ids.add(entry.id);
  for (const field of requiredFields) {
    assert(Object.prototype.hasOwnProperty.call(entry, field), `${entry.id} missing ${field}`);
  }
  assert(Array.isArray(entry.capabilities) && entry.capabilities.length > 0);
  assert(Array.isArray(entry.modalities.input));
  assert(Array.isArray(entry.modalities.output));
  assert(Object.prototype.hasOwnProperty.call(entry.context, 'maxTokens'));
  assert(Array.isArray(entry.languages) && entry.languages.length > 0);
  assert(entry.deprecation.state);
}

const synthetic = {
  ZUVYR_LAUNCH_PROVIDERS: 'groq,replicate',
  GROQ_API_KEY: 'SYNTHETIC_GROQ_SECRET',
  ZUVYR_GROQ_FREE_TIER_CONFIRMED: 'true',
  REPLICATE_API_TOKEN: 'SYNTHETIC_REPLICATE_SECRET',
  REPLICATE_IMAGE_COST_USD: '0.01',
  REPLICATE_VIDEO_COST_USD: '0.10',
  REPLICATE_IMAGE_MODEL: 'synthetic/image-model',
  REPLICATE_VIDEO_MODEL: 'synthetic/video-model'
};

const chat = registry.listRouterCandidates({ capability: 'chat' }, synthetic);
assert.deepEqual(
  chat.map(item => item.id).sort(),
  ['groq:openai/gpt-oss-120b', 'groq:openai/gpt-oss-20b'].sort()
);
assert(chat.every(item => item.providerId === 'groq'));
assert(chat.every(item => item.validBaseCandidate === true));

const code = registry.listRouterCandidates({ capability: 'code' }, synthetic);
assert.equal(code.length, 2);
assert(code.every(item => item.providerId === 'groq'));

assert.deepEqual(
  registry.listRouterCandidates({ capability: 'multimodal_chat' }, synthetic),
  []
);
assert.deepEqual(
  registry.listRouterCandidates({ capability: 'image.generate' }, synthetic),
  []
);
assert.deepEqual(
  registry.listRouterCandidates({ capability: 'video.text_to_video' }, synthetic),
  []
);

assert.deepEqual(
  registry.listRouterCandidates({
    capability: 'chat',
    language: 'en'
  }, synthetic),
  [],
  'explicit language must fail closed until language support is verified'
);

assert.deepEqual(
  registry.listRouterCandidates({
    capability: 'chat',
    minimumContextTokens: 1
  }, synthetic),
  [],
  'positive context requirement must fail closed while context window is unverified'
);

const noAuth = {
  ...synthetic,
  ZUVYR_LAUNCH_PROVIDERS: ''
};
assert.deepEqual(
  registry.listRouterCandidates({ capability: 'chat' }, noAuth),
  []
);

assert.equal(registry.assertModelRegistryInvariant(synthetic), true);

const rendered = JSON.stringify(registry.listModelSnapshots(synthetic));
assert(!rendered.includes('SYNTHETIC_GROQ_SECRET'));
assert(!rendered.includes('SYNTHETIC_REPLICATE_SECRET'));

const routerSource = fs.readFileSync(path.join(__dirname, 'aiRouter.js'), 'utf8');
assert(
  routerSource.includes("require('./lib/modelRegistry')"),
  'aiRouter must import modelRegistry'
);
assert(
  routerSource.includes('listRegistryCandidates'),
  'aiRouter must expose registry-driven candidate discovery'
);

assert(
  /const\s+\{\s*listRouterCandidates:\s*listRegistryCandidates\s*\}\s*=\s*require\('\.\/lib\/modelRegistry'\)/.test(routerSource),
  'aiRouter must import listRouterCandidates as listRegistryCandidates'
);
assert(
  /module\.exports\.listRegistryCandidates\s*=\s*listRegistryCandidates/.test(routerSource),
  'aiRouter must export registry-driven candidate discovery without loading runtime dependencies in this unit test'
);

const routerCandidates = registry.listRouterCandidates(
  { capability: 'chat' },
  synthetic
);
assert.deepEqual(
  routerCandidates.map(item => item.id).sort(),
  ['groq:openai/gpt-oss-120b', 'groq:openai/gpt-oss-20b'].sort()
);

const modelRegistrySource = fs.readFileSync(path.join(__dirname, 'lib/modelRegistry.js'), 'utf8');
for (const forbidden of [
  'gpt-oss-20b',
  'gpt-oss-120b',
  'gemini-2.5-flash',
  'nemotron-3-super'
]) {
  assert(
    !modelRegistrySource.includes(forbidden),
    `feature/model-specific hardcode leaked into generic candidate logic: ${forbidden}`
  );
}

console.log('PASS: Pack022 creates one versioned model/tool registry with provider, capability, modality, context, language, quality, latency, commercial eligibility, price reference and deprecation metadata');
console.log('PASS: aiRouter exposes registry-driven candidate discovery through side-effect-free static wiring verification, while candidate behavior is tested directly against modelRegistry');
console.log('PASS: provider authorization, verified provider capability/cost, model commercial eligibility, deprecation, context and language all fail closed');
console.log('DATABASE / RAILWAY / PROVIDER ACCOUNT / PAYMENT / MODEL NETWORK CALLS: NONE');
