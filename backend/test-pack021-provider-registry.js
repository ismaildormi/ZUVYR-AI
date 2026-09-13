'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const configPath = path.join(__dirname, 'config/provider-registry.v1.json');
const raw = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(raw);
const registry = require('./lib/providerRegistry');

assert.equal(config.version, 'pack-021.provider-registry.v1');
assert.equal(config.externalGate, 'M10');
assert.equal(config.costAuthority, 'backend/config/cost-registry.v1.json');

const expectedProviders = [
  'groq',
  'openrouter',
  'anthropic',
  'openai',
  'google',
  'local',
  'fal',
  'replicate'
];

for (const id of expectedProviders) {
  const provider = config.providers[id];
  assert(provider, `provider missing: ${id}`);
  assert(Array.isArray(provider.regions) && provider.regions.length > 0, `regions missing: ${id}`);
  assert(provider.quotaType, `quota type missing: ${id}`);
  assert(provider.termsLicenseNotes, `terms/license notes missing: ${id}`);
  assert(provider.adapter, `adapter missing: ${id}`);
  assert(Array.isArray(provider.capabilities) && provider.capabilities.length > 0, `capabilities missing: ${id}`);
  for (const capability of provider.capabilities) {
    assert(capability.id, `capability id missing: ${id}`);
    assert(capability.verification, `capability verification missing: ${id}/${capability.id}`);
    assert(capability.cost && capability.cost.authority === 'backend/config/cost-registry.v1.json',
      `cost authority missing: ${id}/${capability.id}`);
  }
}

assert(!/sk_(?:live|test)_/i.test(raw), 'Stripe-like secret leaked');
assert(!/whsec_/i.test(raw), 'Webhook secret leaked');
assert(!/-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(raw), 'Private key leaked');

const secret = 'SYNTHETIC_SECRET_VALUE_THAT_MUST_NEVER_APPEAR';
const env = {
  GROQ_API_KEY: secret,
  ZUVYR_GROQ_FREE_TIER_CONFIRMED: 'true',
  ZUVYR_LAUNCH_PROVIDERS: 'groq',
  FAL_KEY: 'another-secret',
  FAL_IMAGE_COST_USD: '0.004'
};

const groq = registry.providerSnapshot('groq', env);
assert(groq);
assert.equal(groq.credentialPresent, true);
assert.equal(groq.launchAuthorized, true);
assert.equal(groq.enabled, true);
assert(groq.capabilities.some(cap => cap.eligible));
assert.equal(groq.health.state, 'PREFLIGHT_READY');

const rendered = JSON.stringify(registry.listProviderSnapshots(env));
assert(!rendered.includes(secret), 'credential value leaked through snapshot');
assert(!rendered.includes('another-secret'), 'provider credential leaked through snapshot');

const unauthorized = registry.providerSnapshot('groq', {
  GROQ_API_KEY: secret,
  ZUVYR_GROQ_FREE_TIER_CONFIRMED: 'true'
});
assert.equal(unauthorized.enabled, false);
assert.equal(unauthorized.health.state, 'BLOCKED_PENDING_M10');

const missingCredential = registry.providerSnapshot('groq', {
  ZUVYR_GROQ_FREE_TIER_CONFIRMED: 'true',
  ZUVYR_LAUNCH_PROVIDERS: 'groq'
});
assert.equal(missingCredential.enabled, false);
assert.equal(missingCredential.health.state, 'BLOCKED_CREDENTIAL_MISSING');

const unverified = registry.providerSnapshot('anthropic', {
  ANTHROPIC_API_KEY: secret,
  ZUVYR_LAUNCH_PROVIDERS: 'anthropic'
});
assert.equal(unverified.enabled, false);
assert(
  ['BLOCKED_CAPABILITY_UNVERIFIED', 'BLOCKED_COST_UNVERIFIED'].includes(unverified.health.state)
);

assert.equal(registry.assertRegistryInvariant(env), true);

const intelligencePath = path.join(__dirname, 'config/intelligence-core.v1.json');
if (fs.existsSync(intelligencePath)) {
  const intelligence = JSON.parse(fs.readFileSync(intelligencePath, 'utf8'));
  const current = Array.isArray(intelligence.providers)
    ? intelligence.providers.map(item => item && item.id).filter(Boolean)
    : [];
  for (const id of current) {
    assert(config.providers[id], `current intelligence provider absent from authoritative registry: ${id}`);
  }
}

const source = fs.readFileSync(path.join(__dirname, 'lib/providerRegistry.js'), 'utf8');
assert(source.includes('credentialPresent'));
assert(source.includes('costSourceVerified'));
assert(source.includes('assertRegistryInvariant'));
assert(source.includes('ZUVYR_GROQ_FREE_TIER_CONFIRMED'));

console.log('PASS: Pack021 creates one authoritative provider registry with credential-presence booleans, regions, capabilities, quota, terms/license notes, health preflight and cost-registry links');
console.log('PASS: providers cannot become enabled unless launch-authorized and backed by credential + verified capability + verified cost source');
console.log('PASS: credential values are never returned or stored in the registry');
console.log('EXTERNAL GATE M10 REMAINS REQUIRED; DATABASE / RAILWAY / PROVIDER / PAYMENT / NETWORK CALLS: NONE');
