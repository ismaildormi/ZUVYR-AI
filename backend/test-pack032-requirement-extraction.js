'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./config/requirement-extraction.v1.json');
const { normalizeUniversalRequest } = require('./lib/universalRequest');
const { extractRequirements } = require('./lib/requirementExtractor');

assert.equal(config.version, 'pack-032.requirement-extraction.v1');
assert.equal(config.invariants.doNotInventRequirements, true);
assert.equal(config.invariants.preserveExplicitValues, true);

function req(surface, overrides = {}) {
  return normalizeUniversalRequest({
    schemaVersion: '1.0',
    requestId: `bench-${surface}`,
    surface,
    goal: `Representative ${surface} task`,
    inputs: {},
    constraints: {},
    outputs: {},
    contextRefs: [],
    language: {},
    risk: {},
    budget: {},
    clientState: {},
    ...overrides
  });
}

const fixtures = [
  {
    name: 'chat preserves hard/soft/output criteria',
    request: req('chat', {
      constraints: {
        hard: ['Answer only from supplied sources'],
        preferences: { tone: 'concise', format: 'bullets' }
      },
      outputs: { criteria: ['Include citations'] },
      language: { requested: 'fr' }
    }),
    expect: {
      hardValues: ['Answer only from supplied sources', 'fr'],
      softPaths: ['constraints.preferences'],
      outputValues: ['Include citations'],
      clarify: false
    }
  },
  {
    name: 'work keeps blocking unknown and forces clarification',
    request: req('work', {
      constraints: {
        hardRequirements: ['Do not publish externally'],
        unknowns: [{ question: 'Which workspace?', blocking: true }]
      },
      outputs: { acceptanceCriteria: ['Produce a reviewed draft'] }
    }),
    expect: {
      hardValues: ['Do not publish externally'],
      outputValues: ['Produce a reviewed draft'],
      clarify: true,
      reason: 'BLOCKING_UNKNOWN'
    }
  },
  {
    name: 'create preserves explicit visual constraints',
    request: req('create', {
      inputs: { aspectRatio: '16:9', duration: 8 },
      constraints: {
        required: ['No visible text'],
        soft: ['cinematic lighting']
      },
      outputs: { required: ['PNG preview'] }
    }),
    expect: {
      hardValues: ['No visible text'],
      outputValues: ['PNG preview', '16:9', 8],
      clarify: false
    }
  },
  {
    name: 'code preserves hard constraints and unknown threshold',
    request: req('code', {
      constraints: {
        hard: ['Do not change dependencies', 'Keep public API compatible'],
        softPreferences: ['smallest safe diff'],
        unknowns: [
          { question: 'Target Node version?' },
          { question: 'Preferred formatter?' },
          { question: 'CI command?' }
        ],
        customPolicy: { ownerOnly: true }
      },
      outputs: { criteria: ['Tests pass', 'No lint regressions'] },
      budget: { max: 25 }
    }),
    expect: {
      hardValues: ['Do not change dependencies', 'Keep public API compatible', 25],
      outputValues: ['Tests pass', 'No lint regressions'],
      clarify: true,
      reason: 'UNKNOWN_COUNT_THRESHOLD',
      unclassifiedPath: 'constraints.customPolicy'
    }
  }
];

for (const fixture of fixtures) {
  const out = extractRequirements(fixture.request);

  const hardValues = out.hardRequirements.map(item => item.value);
  for (const value of fixture.expect.hardValues || []) {
    assert(
      hardValues.some(actual => JSON.stringify(actual) === JSON.stringify(value)),
      `${fixture.name}: missing hard requirement ${JSON.stringify(value)}`
    );
  }

  const outputValues = out.outputCriteria.map(item => item.value);
  for (const value of fixture.expect.outputValues || []) {
    assert(
      outputValues.some(actual => JSON.stringify(actual) === JSON.stringify(value)),
      `${fixture.name}: missing output criterion ${JSON.stringify(value)}`
    );
  }

  for (const sourcePath of fixture.expect.softPaths || []) {
    assert(
      out.softPreferences.some(item => item.sourcePath === sourcePath),
      `${fixture.name}: missing soft preference source ${sourcePath}`
    );
  }

  if (fixture.expect.unclassifiedPath) {
    assert(
      out.unclassifiedConstraints.some(item => item.sourcePath === fixture.expect.unclassifiedPath),
      `${fixture.name}: unrecognized constraint was silently lost`
    );
  }

  assert.equal(out.clarification.required, fixture.expect.clarify, fixture.name);
  if (fixture.expect.reason) assert.equal(out.clarification.reason, fixture.expect.reason, fixture.name);

  assert.equal(out.requestId, fixture.request.requestId);
  assert.equal(out.surface, fixture.request.surface);
}

const explicitClarify = extractRequirements(req('chat', {
  constraints: { clarification: { required: true } }
}));
assert.equal(explicitClarify.clarification.required, true);
assert.equal(explicitClarify.clarification.reason, 'EXPLICIT_REQUIRED');

const noInvent = extractRequirements(req('chat', {
  constraints: {},
  outputs: {}
}));
assert.deepEqual(noInvent.hardRequirements, []);
assert.deepEqual(noInvent.softPreferences, []);
assert.deepEqual(noInvent.unknowns, []);
assert.deepEqual(noInvent.outputCriteria, []);
assert.deepEqual(noInvent.unclassifiedConstraints, []);
assert.equal(noInvent.clarification.required, false);

const source = fs.readFileSync(path.join(__dirname, 'lib/requirementExtractor.js'), 'utf8');
for (const forbidden of [
  'fetch(',
  'axios.',
  'supabaseAdmin',
  'reserveCredits(',
  'settleCredits(',
  'refundCredits(',
  'process.env.'
]) {
  assert(!source.includes(forbidden), `requirement extractor must remain pure: ${forbidden}`);
}

console.log('PASS: representative Chat/Work/Create/Code benchmarks preserve explicit constraints');
console.log('PASS: hard requirements, soft preferences, unknowns and output criteria are structured with source paths');
console.log('PASS: clarification threshold triggers only from explicit force/blocking unknowns/versioned unknown-count threshold');
console.log('PASS: unrecognized constraint keys remain visible instead of being silently dropped');
console.log('PASS: empty input invents no requirements and extraction has no DB/billing/network side effects');
