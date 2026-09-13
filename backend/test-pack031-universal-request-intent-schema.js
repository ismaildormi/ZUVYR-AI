'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schema = require('./config/universal-request-schema.v1.json');
const {
  normalizeUniversalRequest,
  normalizeSurfaceRequest,
  assertUniversalRequest
} = require('./lib/universalRequest');

assert.equal(schema.version, '1.0');
assert.deepEqual(schema.surfaces, ['chat', 'work', 'create', 'code']);

const base = {
  schemaVersion: '1.0',
  requestId: 'req-031',
  goal: 'Build the requested thing',
  inputs: { text: 'input' },
  constraints: { hard: ['do not invent requirements'] },
  outputs: { kind: 'text' },
  contextRefs: [{ ref: 'conversation:1' }],
  language: { requested: 'auto' },
  risk: { level: 'unknown' },
  budget: { currency: 'USD', max: null },
  clientState: { screen: 'chat' }
};

const canonical = {};
for (const surface of ['chat', 'work', 'create', 'code']) {
  canonical[surface] = assertUniversalRequest({ ...base, surface });
  assert.equal(canonical[surface].schemaVersion, '1.0');
  assert.equal(canonical[surface].surface, surface);
  assert.equal(canonical[surface].goal, base.goal);
  for (const required of schema.required) {
    assert(required in canonical[surface], `${surface} missing ${required}`);
  }
}

const keys = Object.keys(canonical.chat).sort();
for (const surface of ['work', 'create', 'code']) {
  assert.deepEqual(
    Object.keys(canonical[surface]).sort(),
    keys,
    `${surface} envelope shape diverged`
  );
}

const legacyChat = normalizeSurfaceRequest({
  surface: 'chat',
  requestId: 'chat-legacy',
  body: {
    messages: [
      { role: 'assistant', content: 'old' },
      { role: 'user', content: 'Latest user goal' }
    ],
    feature: 'chat'
  }
});
assert.equal(legacyChat.goal, 'Latest user goal');
assert.equal(legacyChat.surface, 'chat');
assert.equal(legacyChat.metadata.legacyAdapted, true);
assert.equal(legacyChat.requestId, 'chat-legacy');

const legacyCode = normalizeSurfaceRequest({
  surface: 'code',
  requestId: 'code-legacy',
  body: {
    messages: [{ role: 'user', content: 'Fix the application' }],
    feature: 'code'
  }
});
assert.equal(legacyCode.surface, 'code');
assert.equal(legacyCode.goal, 'Fix the application');

const legacyCreate = normalizeSurfaceRequest({
  surface: 'create',
  requestId: 'create-legacy',
  body: {
    prompt: 'Create a cinematic image',
    aspectRatio: '16:9'
  }
});
assert.equal(legacyCreate.surface, 'create');
assert.equal(legacyCreate.goal, 'Create a cinematic image');
assert.equal(legacyCreate.inputs.aspectRatio, '16:9');

const submittedEnvelope = normalizeSurfaceRequest({
  surface: 'work',
  requestId: 'outer-id',
  body: {
    request: {
      ...base,
      requestId: 'inner-id',
      surface: 'work',
      goal: 'Execute durable work'
    }
  }
});
assert.equal(submittedEnvelope.requestId, 'inner-id');
assert.equal(submittedEnvelope.surface, 'work');
assert.equal(submittedEnvelope.goal, 'Execute durable work');
assert.equal(submittedEnvelope.metadata.legacyAdapted, undefined);

assert.throws(
  () => normalizeUniversalRequest({ ...base, surface: 'unknown' }),
  /universal_request_surface_invalid/
);
assert.throws(
  () => normalizeUniversalRequest({ ...base, surface: 'chat', goal: '   ' }),
  /universal_request_goal_required/
);

const source = fs.readFileSync(
  path.join(__dirname, 'lib/universalRequest.js'),
  'utf8'
);
for (const forbidden of [
  'supabaseAdmin',
  'reserveCredits(',
  'settleCredits(',
  'refundCredits(',
  'fetch(',
  'axios.',
  'process.env.'
]) {
  assert(!source.includes(forbidden), `universal request normalizer must remain pure: ${forbidden}`);
}

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
assert(server.includes("require('./lib/universalRequest')"));
assert(server.includes('req.universalRequest = normalizeSurfaceRequest'));
assert(server.includes("surface: feature === 'code' ? 'code' : 'chat'"));
assert(server.includes("surface: 'create'"));

console.log('PASS: Chat/Work/Create/Code share one canonical Universal Request v1 envelope');
console.log('PASS: legacy chat/code/create payloads normalize without changing endpoint contract');
console.log('PASS: explicit canonical request envelope is accepted without inventing user requirements');
console.log('PASS: universal request normalization is pure and adds no DB/billing/network side effects');
