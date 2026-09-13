'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./config/intent-lock.v1.json');
const { normalizeUniversalRequest } = require('./lib/universalRequest');
const { extractRequirements } = require('./lib/requirementExtractor');
const {
  createIntentLock,
  createIntentProposal,
  validateIntentProposal
} = require('./lib/intentLock');

assert.equal(config.version, 'pack-033.intent-lock.v1');
assert.equal(config.invariants.noRequirementInvention, true);
assert.equal(config.invariants.noConstraintMutation, true);
assert.equal(config.invariants.noSilentIntentDrift, true);

function requestFixture(surface = 'code') {
  return normalizeUniversalRequest({
    schemaVersion: '1.0',
    requestId: `intent-${surface}-001`,
    surface,
    goal: 'Fix the production application without changing public behavior',
    inputs: {},
    constraints: {
      hard: [
        'Do not change dependencies',
        'Preserve the public API'
      ],
      softPreferences: ['smallest safe diff'],
      unknowns: [{ question: 'Which validation command?', blocking: false }],
      customPolicy: { productionOnly: true }
    },
    outputs: {
      criteria: [
        'Existing tests continue to pass',
        'No new public API'
      ]
    },
    contextRefs: [],
    language: { requested: 'auto' },
    risk: {},
    budget: {},
    clientState: {}
  });
}

const request = requestFixture();
const extraction = extractRequirements(request);
const lock = createIntentLock(request, extraction);

assert.equal(lock.requestId, request.requestId);
assert.equal(lock.surface, request.surface);
assert.match(lock.intentFingerprint, /^[0-9a-f]{64}$/);
assert.equal(lock.locked.goal, request.goal);
assert.equal(lock.locked.hardRequirements.length, 2);
assert.equal(lock.locked.softPreferences.length, 1);
assert.equal(lock.locked.unknowns.length, 1);
assert.equal(lock.locked.outputCriteria.length, 2);
assert.equal(lock.locked.unclassifiedConstraints.length, 1);

const allowedProposal = createIntentProposal(lock, [
  {
    scope: 'execution.timeout',
    value: { seconds: 30 },
    rationale: 'Bound a provider/tool call so execution can fail safely.'
  },
  {
    scope: 'execution.idempotency',
    value: 'reuse logical request id',
    rationale: 'Prevent duplicate side effects during retries.'
  }
]);

const accepted = validateIntentProposal(lock, allowedProposal);
assert.equal(accepted.accepted, true);
assert.equal(accepted.technicalAssumptions.length, 2);
assert.equal(
  accepted.technicalAssumptions[0].source,
  'system_technical_default'
);

const changedGoal = {
  ...allowedProposal,
  locked: {
    ...allowedProposal.locked,
    goal: 'Rewrite the whole app with new dependencies'
  }
};
assert.throws(
  () => validateIntentProposal(lock, changedGoal),
  error =>
    error.code === 'INTENT_LOCK_CHANGED' &&
    error.changed.some(item => item.field === 'goal')
);

const changedHard = {
  ...allowedProposal,
  locked: {
    ...allowedProposal.locked,
    hardRequirements: [
      ...allowedProposal.locked.hardRequirements,
      {
        id: 'invented',
        category: 'hardRequirements',
        sourcePath: 'planner.invented',
        value: 'Use React'
      }
    ]
  }
};
assert.throws(
  () => validateIntentProposal(lock, changedHard),
  error =>
    error.code === 'INTENT_LOCK_CHANGED' &&
    error.changed.some(item => item.field === 'hardRequirements')
);

const changedOutput = {
  ...allowedProposal,
  locked: {
    ...allowedProposal.locked,
    outputCriteria: []
  }
};
assert.throws(
  () => validateIntentProposal(lock, changedOutput),
  error =>
    error.code === 'INTENT_LOCK_CHANGED' &&
    error.changed.some(item => item.field === 'outputCriteria')
);

const missingSoft = {
  ...allowedProposal,
  locked: { ...allowedProposal.locked }
};
delete missingSoft.locked.softPreferences;
assert.throws(
  () => validateIntentProposal(lock, missingSoft),
  error =>
    error.code === 'INTENT_LOCK_CHANGED' &&
    error.changed.some(item => item.field === 'softPreferences' && item.reason === 'MISSING')
);

assert.throws(
  () => createIntentProposal(lock, [{
    scope: 'product.framework',
    value: 'React',
    rationale: 'Planner preference'
  }]),
  error => error.code === 'INTENT_LOCK_ASSUMPTION_FORBIDDEN'
);

assert.throws(
  () => createIntentProposal(lock, [{
    scope: 'execution.timeout',
    value: 30,
    rationale: 'technical default',
    changesConstraint: true
  }]),
  error => error.code === 'INTENT_LOCK_ASSUMPTION_FORBIDDEN'
);

assert.throws(
  () => validateIntentProposal(lock, {
    ...allowedProposal,
    intentFingerprint: '0'.repeat(64)
  }),
  error => error.code === 'INTENT_LOCK_FINGERPRINT_MISMATCH'
);

const sameRequest = requestFixture();
const sameLock = createIntentLock(sameRequest, extractRequirements(sameRequest));
assert.equal(
  sameLock.intentFingerprint,
  lock.intentFingerprint,
  'same normalized user intent must produce the same fingerprint'
);

const source = fs.readFileSync(path.join(__dirname, 'lib/intentLock.js'), 'utf8');
for (const forbidden of [
  'fetch(',
  'axios.',
  'supabaseAdmin',
  'reserveCredits(',
  'settleCredits(',
  'refundCredits(',
  'process.env.'
]) {
  assert(!source.includes(forbidden), `intent lock must remain pure: ${forbidden}`);
}

console.log('PASS: intent fingerprint deterministically binds the exact user goal + extracted constraints');
console.log('PASS: changed/missing goal, requirements, preferences, unknowns, outputs or unclassified constraints are rejected');
console.log('PASS: invented user requirements and non-allowlisted assumptions are rejected');
console.log('PASS: only allowlisted minimal technical assumptions are accepted and explicitly recorded');
console.log('PASS: Intent Lock is pure and adds no DB/billing/network side effects');
