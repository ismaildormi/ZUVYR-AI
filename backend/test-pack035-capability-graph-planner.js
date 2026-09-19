'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const graphConfig = require('./config/capability-graph.v1.json');
const { normalizeUniversalRequest } = require('./lib/universalRequest');
const { extractRequirements } = require('./lib/requirementExtractor');
const { createIntentLock } = require('./lib/intentLock');
const {
  validatePlanSteps,
  publicCapabilityGraph
} = require('./lib/capabilityGraph');
const { createBrainPlan } = require('./lib/brainPlanner');

assert.equal(graphConfig.singleSharedPlanner, true);
assert.equal(graphConfig.plannerId, 'zuvyr.brain.planner.v1');
assert.equal(graphConfig.plannerRules.keywordIntentGuessing, false);

function fixture(surface, {
  outputs = {},
  inputs = {},
  clientState = {},
  contextRefs = []
} = {}) {
  const request = normalizeUniversalRequest({
    schemaVersion: '1.0',
    requestId: `pack035-${surface}-${Math.random().toString(16).slice(2)}`,
    surface,
    goal: `Representative ${surface} goal`,
    inputs,
    constraints: {
      hard: ['Preserve the requested constraints']
    },
    outputs,
    contextRefs,
    language: {},
    risk: {},
    budget: {},
    clientState
  });

  const extraction = extractRequirements(request);
  const intentLock = createIntentLock(request, extraction);
  return { request, extraction, intentLock };
}

function plan(input, contextReceipt = null) {
  return createBrainPlan({
    ...input,
    contextReceipt
  });
}

const graph = publicCapabilityGraph();
assert.equal(graph.singleSharedPlanner, true);
assert(graph.capabilities.some(item => item.id === 'code.inspect'));
assert(graph.capabilities.some(item => item.id === 'code.preview.verify'));

const chat = plan(fixture('chat'));
assert.equal(chat.singleSharedPlanner, true);
assert.equal(chat.acyclic, true);
assert.deepEqual(chat.steps.map(step => step.capability), ['chat.respond']);

const codeNew = plan(fixture('code'));
assert.deepEqual(
  codeNew.steps.map(step => step.capability),
  [
    'code.inspect',
    'code.edit',
    'code.validate',
    'code.runtime.start',
    'code.preview.verify'
  ]
);
assert.equal(codeNew.selectedRuntimeCapability, 'code.runtime.start');
assert.equal(codeNew.candidatePaths.length, 2);
assert.deepEqual(
  codeNew.candidatePaths[0].capabilities,
  graphConfig.code.newRuntimePath
);
assert.deepEqual(
  codeNew.candidatePaths[1].capabilities,
  graphConfig.code.existingRuntimePath
);

const codeExisting = plan(fixture('code', {
  clientState: { codeRuntimeState: 'running' }
}));
assert.deepEqual(
  codeExisting.steps.map(step => step.capability),
  [
    'code.inspect',
    'code.edit',
    'code.validate',
    'code.runtime.update',
    'code.preview.verify'
  ]
);
assert.equal(codeExisting.selectedRuntimeCapability, 'code.runtime.update');

const codeWithSharedHandoffs = plan(fixture('code', {
  outputs: { requested: ['code', 'research', 'images', 'audio'] }
}));
const codeHandoffCapabilities = codeWithSharedHandoffs.steps.map(step => step.capability);
for (const capability of [
  'research.run',
  'image.generate',
  'audio.generate'
]) {
  assert(codeHandoffCapabilities.includes(capability), `missing shared handoff ${capability}`);
}
assert(!codeHandoffCapabilities.some(value => value.includes('agent')));
assert.equal(codeHandoffCapabilities.filter(value => value === 'code.inspect').length, 1);
assert.equal(codeHandoffCapabilities.filter(value => value === 'code.edit').length, 1);
assert.equal(codeHandoffCapabilities.filter(value => value === 'code.validate').length, 1);
assert.equal(codeHandoffCapabilities.filter(value => value === 'code.preview.verify').length, 1);

const create = plan(fixture('create', {
  outputs: { requested: ['images', 'video'] }
}));
assert.deepEqual(
  create.steps.map(step => step.capability),
  ['image.generate', 'video.generate']
);
assert.equal(create.acyclic, true);

const createLegacyFeature = plan(fixture('create', {
  inputs: { feature: 'image' }
}));
assert.deepEqual(
  createLegacyFeature.steps.map(step => step.capability),
  ['image.generate']
);

const workCode = plan(fixture('work', {
  outputs: { requested: ['code'] }
}));
assert.deepEqual(
  workCode.steps.map(step => step.capability),
  [
    'code.inspect',
    'code.edit',
    'code.validate',
    'code.runtime.start',
    'code.preview.verify'
  ]
);

const workDefault = plan(fixture('work'));
assert.deepEqual(
  workDefault.steps.map(step => step.capability),
  ['browser.agent.run']
);
assert.equal(workDefault.acyclic, true);

const contextInput = fixture('work', {
  outputs: { requested: ['research'] },
  contextRefs: [{ ref: 'project:p1' }]
});
assert.throws(
  () => plan(contextInput),
  error => error.code === 'BRAIN_PLANNER_CONTEXT_RECEIPT_REQUIRED'
);

const contextPlan = plan(contextInput, {
  version: 'pack-034.context-resolver.v1',
  requestId: contextInput.request.requestId,
  surface: 'work',
  contextRefCount: 1,
  resolvedCount: 1,
  ownershipVerified: true,
  budget: { includedCharacters: 1234 }
});
assert.equal(contextPlan.context.required, true);
assert.equal(contextPlan.context.verified, true);
assert.equal(contextPlan.context.budgetIncludedCharacters, 1234);

assert.throws(
  () => createBrainPlan({
    ...fixture('chat'),
    intentLock: {
      ...fixture('chat').intentLock,
      intentFingerprint: '0'.repeat(64)
    }
  }),
  error => error.code === 'BRAIN_PLANNER_INTENT_LOCK_MISMATCH'
);

assert.throws(
  () => validatePlanSteps([
    { id: 'a', capability: 'code.inspect', dependsOn: ['b'] },
    { id: 'b', capability: 'code.edit', dependsOn: ['a'] }
  ]),
  error =>
    error.code === 'CAPABILITY_EDGE_FORBIDDEN' ||
    error.code === 'PLAN_DEPENDENCY_CYCLE'
);

const plannerSource = fs.readFileSync(path.join(__dirname, 'lib/brainPlanner.js'), 'utf8');
const graphSource = fs.readFileSync(path.join(__dirname, 'lib/capabilityGraph.js'), 'utf8');

for (const source of [plannerSource, graphSource]) {
  for (const forbidden of [
    'fetch(',
    'axios.',
    'supabaseAdmin',
    'reserveCredits(',
    'settleCredits(',
    'refundCredits(',
    'process.env.'
  ]) {
    assert(!source.includes(forbidden), `Pack035 planning core must remain pure: ${forbidden}`);
  }
}

assert(!plannerSource.includes("require('./crossFeatureOrchestration')"));
assert(!plannerSource.includes("require('./taskPlanner')"));

console.log('PASS: one shared ZUVYR Brain planner consumes Pack031-034 contracts');
console.log('PASS: representative Chat/Work/Create/Code goals produce deterministic acyclic plans');
console.log('PASS: Code Studio uses inspect -> edit -> validate -> runtime start/update -> preview verify');
console.log('PASS: Images/Video/Audio/Research handoffs use shared graph capabilities, not duplicate coding/media agents');
console.log('PASS: intent fingerprint and authorized context receipt are fail-closed planner inputs');
console.log('PASS: Pack035 planner is proposal-only and adds no DB/billing/model/network side effects');
