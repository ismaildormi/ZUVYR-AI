'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./config/context-resolver.v1.json');
const { normalizeUniversalRequest } = require('./lib/universalRequest');
const { normalizeRefs, resolveContext } = require('./lib/contextResolver');

assert.equal(config.version, 'pack-034.context-resolver.v1');
assert.equal(config.ownership.required, true);
assert.equal(config.invariants.noCrossOwnerContext, true);
assert.equal(config.invariants.noSilentBudgetOverflow, true);

function request(contextRefs) {
  return normalizeUniversalRequest({
    schemaVersion: '1.0',
    requestId: 'ctx-request-001',
    surface: 'work',
    goal: 'Reuse authorized project context',
    inputs: {},
    constraints: {},
    outputs: {},
    contextRefs,
    language: {},
    risk: {},
    budget: {},
    clientState: {}
  });
}

const ownerId = 'owner-a';
const calls = [];

function adapter(type, contents) {
  return async ({ ownerId: requestedOwner, id, sourceRef }) => {
    calls.push({ type, requestedOwner, id, sourceRef });
    const entry = contents[id];
    if (!entry) return null;
    return {
      ownerId: entry.ownerId,
      text: entry.text || '',
      metadata: { kind: type, id }
    };
  };
}

const adapters = {
  conversation: adapter('conversation', {
    c1: { ownerId, text: 'conversation-context' }
  }),
  project: adapter('project', {
    p1: { ownerId, text: 'project-context-without-reupload' }
  }),
  file: adapter('file', {
    f1: { ownerId, text: 'file-context' }
  }),
  asset: adapter('asset', {
    a1: { ownerId, text: 'asset-context' }
  }),
  memory: adapter('memory', {
    m1: { ownerId, text: 'memory-context' }
  }),
  connected_source: adapter('connected_source', {
    s1: { ownerId, text: 'connected-source-context' }
  }),
  task_output: adapter('task_output', {
    t1: { ownerId, text: 'prior-task-output-context' }
  })
};

(async () => {
  const allTypes = request([
    { type: 'conversation', id: 'c1' },
    { ref: 'project:p1' },
    { type: 'file', id: 'f1' },
    { type: 'asset', id: 'a1' },
    { type: 'memory', id: 'm1' },
    { type: 'connected_source', id: 's1' },
    { type: 'task_output', id: 't1' }
  ]);

  const resolved = await resolveContext({
    request: allTypes,
    ownerId,
    adapters
  });

  assert.equal(resolved.resolvedCount, 7);
  assert.equal(resolved.contextRefCount, 7);
  assert.equal(resolved.ownershipVerified, true);
  assert(resolved.items.every(item => item.ownerFingerprint && !('ownerId' in item)));
  assert.deepEqual(
    resolved.items.map(item => item.type),
    [
      'conversation',
      'project',
      'file',
      'asset',
      'memory',
      'connected_source',
      'task_output'
    ]
  );

  const beforeReuseCalls = calls.length;
  const reusableProjectRequest = request([{ ref: 'project:p1' }]);

  const firstReuse = await resolveContext({
    request: reusableProjectRequest,
    ownerId,
    adapters
  });
  const secondReuse = await resolveContext({
    request: reusableProjectRequest,
    ownerId,
    adapters
  });

  assert.equal(firstReuse.items[0].text, 'project-context-without-reupload');
  assert.equal(secondReuse.items[0].text, 'project-context-without-reupload');
  assert.equal(calls.length, beforeReuseCalls + 2);
  assert.equal(
    calls.slice(-2).every(call => call.id === 'p1' && call.requestedOwner === ownerId),
    true
  );

  const duplicateRefs = normalizeRefs([
    { ref: 'project:p1' },
    { type: 'project', id: 'p1' }
  ]);
  assert.equal(duplicateRefs.length, 1);

  const hostileAdapters = {
    ...adapters,
    project: async () => ({
      ownerId: 'owner-b',
      text: 'must-not-cross-account-boundary'
    })
  };
  await assert.rejects(
    () => resolveContext({
      request: request([{ ref: 'project:p1' }]),
      ownerId,
      adapters: hostileAdapters
    }),
    error => error.code === 'CONTEXT_OWNER_MISMATCH'
  );

  await assert.rejects(
    () => resolveContext({
      request: request([{ ref: 'project:missing' }]),
      ownerId,
      adapters
    }),
    error => error.code === 'CONTEXT_NOT_FOUND'
  );

  await assert.rejects(
    () => resolveContext({
      request: request([{ ref: 'project:p1' }]),
      ownerId,
      adapters: {}
    }),
    error => error.code === 'CONTEXT_ADAPTER_MISSING'
  );

  assert.throws(
    () => normalizeRefs([{ ref: 'unknown_type:123' }]),
    error => error.code === 'CONTEXT_REF_TYPE_UNSUPPORTED'
  );

  const budgetAdapters = {
    project: async ({ ownerId }) => ({
      ownerId,
      text: 'x'.repeat(120)
    }),
    file: async ({ ownerId }) => ({
      ownerId,
      text: 'y'.repeat(120)
    })
  };

  const budgeted = await resolveContext({
    request: request([
      { ref: 'project:p1' },
      { ref: 'file:f1' }
    ]),
    ownerId,
    adapters: budgetAdapters,
    budget: {
      maxTotalCharacters: 100,
      maxItemCharacters: 70
    }
  });

  assert.equal(budgeted.budget.maxTotalCharacters, 100);
  assert.equal(budgeted.budget.includedCharacters, 100);
  assert.equal(budgeted.budget.remainingCharacters, 0);
  assert.equal(budgeted.budget.truncated, true);
  assert.equal(budgeted.items[0].includedCharacters, 70);
  assert.equal(budgeted.items[1].includedCharacters, 30);
  assert.equal(budgeted.items[0].truncated, true);
  assert.equal(budgeted.items[1].truncated, true);

  const source = fs.readFileSync(path.join(__dirname, 'lib/contextResolver.js'), 'utf8');
  for (const forbidden of [
    'fetch(',
    'axios.',
    'supabaseAdmin',
    'reserveCredits(',
    'settleCredits(',
    'refundCredits(',
    'process.env.'
  ]) {
    assert(!source.includes(forbidden), `context resolver core must remain adapter-driven/pure: ${forbidden}`);
  }

  console.log('PASS: conversation/project/file/asset/memory/connected-source/task-output refs resolve through one ownership-checked contract');
  console.log('PASS: same authorized project ref is reusable across requests without re-upload');
  console.log('PASS: cross-owner, missing, unsupported and adapter-missing context fails closed');
  console.log('PASS: deterministic context budget truncates with receipts and never silently exceeds the limit');
  console.log('PASS: resolver core adds no DB/billing/model/network side effects');
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
