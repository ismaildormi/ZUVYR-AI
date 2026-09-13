'use strict';

const crypto = require('crypto');
const { assertUniversalRequest } = require('./universalRequest');
const { createIntentLock, validateIntentProposal } = require('./intentLock');
const {
  CONFIG: GRAPH,
  assertCapability,
  validatePlanSteps
} = require('./capabilityGraph');

function plannerError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function stable(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function explicitOutputs(request) {
  const raw = [];

  for (const candidate of [
    request.outputs && request.outputs.requested,
    request.outputs && request.outputs.kinds,
    request.outputs && request.outputs.kind
  ]) {
    if (Array.isArray(candidate)) raw.push(...candidate);
    else if (typeof candidate === 'string') raw.push(candidate);
  }

  if (typeof request.inputs?.feature === 'string') {
    raw.push(request.inputs.feature);
  }

  return [...new Set(
    raw
      .map(value => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  )];
}

function outputCapabilities(request) {
  const requested = explicitOutputs(request);
  const outputs = [];

  for (const output of requested) {
    const mapped = GRAPH.outputAliases[output];
    if (!mapped) {
      throw plannerError('BRAIN_PLANNER_OUTPUT_UNSUPPORTED', { output });
    }
    outputs.push(mapped);
  }

  if (outputs.length === 0) {
    const defaults = GRAPH.plannerRules.surfaceDefaults[request.surface] || [];
    outputs.push(...defaults);
  }

  if (outputs.length === 0) {
    throw plannerError('BRAIN_PLANNER_EXPLICIT_OUTPUT_REQUIRED', {
      surface: request.surface
    });
  }

  return [...new Set(outputs)];
}

function assertIntentBinding(request, extraction, intentLock) {
  const expected = createIntentLock(request, extraction);

  if (
    !intentLock ||
    intentLock.version !== expected.version ||
    intentLock.intentFingerprint !== expected.intentFingerprint
  ) {
    throw plannerError('BRAIN_PLANNER_INTENT_LOCK_MISMATCH');
  }

  validateIntentProposal(intentLock, {
    intentFingerprint: intentLock.intentFingerprint,
    locked: intentLock.locked,
    technicalAssumptions: []
  });

  return intentLock.intentFingerprint;
}

function contextBinding(request, contextReceipt) {
  const count = Array.isArray(request.contextRefs) ? request.contextRefs.length : 0;

  if (count === 0) {
    return Object.freeze({
      required: false,
      verified: true,
      contextRefCount: 0,
      resolvedCount: 0,
      budgetIncludedCharacters: 0
    });
  }

  if (!contextReceipt || typeof contextReceipt !== 'object') {
    throw plannerError('BRAIN_PLANNER_CONTEXT_RECEIPT_REQUIRED');
  }

  if (
    contextReceipt.requestId !== request.requestId ||
    contextReceipt.surface !== request.surface ||
    contextReceipt.ownershipVerified !== true ||
    contextReceipt.contextRefCount !== count ||
    contextReceipt.resolvedCount !== count
  ) {
    throw plannerError('BRAIN_PLANNER_CONTEXT_RECEIPT_INVALID');
  }

  return Object.freeze({
    required: true,
    verified: true,
    contextRefCount: count,
    resolvedCount: contextReceipt.resolvedCount,
    budgetIncludedCharacters: Number(
      contextReceipt.budget && contextReceipt.budget.includedCharacters || 0
    )
  });
}

function stepId(index, capability) {
  return `step_${String(index).padStart(2, '0')}_${capability.replace(/[^a-z0-9]+/g, '_')}`;
}

function addStep(steps, capability, dependsOn = [], metadata = {}) {
  assertCapability(capability);
  const step = Object.freeze({
    id: stepId(steps.length + 1, capability),
    capability,
    dependsOn: Object.freeze([...dependsOn]),
    metadata: Object.freeze({ ...metadata })
  });
  steps.push(step);
  return step.id;
}

function runtimeOperation(request) {
  const raw = String(
    request.clientState?.codeRuntimeState ||
    request.clientState?.runtimeState ||
    ''
  ).trim().toLowerCase();

  if (['running', 'started', 'ready', 'active'].includes(raw)) {
    return 'code.runtime.update';
  }

  return 'code.runtime.start';
}

function codeCandidatePaths() {
  return Object.freeze([
    Object.freeze({
      id: 'code_new_runtime',
      capabilities: Object.freeze([...GRAPH.code.newRuntimePath])
    }),
    Object.freeze({
      id: 'code_existing_runtime',
      capabilities: Object.freeze([...GRAPH.code.existingRuntimePath])
    })
  ]);
}

function buildCodeSteps(steps, requested, request) {
  const inspect = addStep(steps, 'code.inspect');

  const handoffIds = [];
  const requestedShared = new Set(
    requested.filter(value => GRAPH.code.sharedHandoffs.includes(value))
  );

  for (const capability of GRAPH.code.sharedHandoffs) {
    if (!requestedShared.has(capability)) continue;
    handoffIds.push(
      addStep(steps, capability, [inspect], {
        handoff: 'shared_capability',
        duplicateAgent: false
      })
    );
  }

  const edit = addStep(steps, 'code.edit', [inspect, ...handoffIds]);
  const validate = addStep(steps, 'code.validate', [edit]);
  const runtimeCapability = runtimeOperation(request);
  const runtime = addStep(steps, runtimeCapability, [validate]);
  const preview = addStep(steps, 'code.preview.verify', [runtime]);

  return {
    terminalStepId: preview,
    selectedRuntimeCapability: runtimeCapability,
    candidatePaths: codeCandidatePaths()
  };
}

function buildNonCodeSteps(steps, requested) {
  const terminalIds = [];
  for (const capability of requested) {
    if (capability === 'code' || capability === 'project.collect') continue;
    terminalIds.push(addStep(steps, capability));
  }
  return terminalIds;
}

function createBrainPlan({
  request,
  extraction,
  intentLock,
  contextReceipt = null
} = {}) {
  const normalizedRequest = assertUniversalRequest(request);
  const intentFingerprint = assertIntentBinding(
    normalizedRequest,
    extraction,
    intentLock
  );
  const context = contextBinding(normalizedRequest, contextReceipt);
  const requested = outputCapabilities(normalizedRequest);

  for (const forbiddenPrefix of GRAPH.code.forbiddenDuplicateAgentPrefixes) {
    if (requested.some(value => value.startsWith(forbiddenPrefix))) {
      throw plannerError('BRAIN_PLANNER_DUPLICATE_AGENT_FORBIDDEN', {
        capability: requested.find(value => value.startsWith(forbiddenPrefix))
      });
    }
  }

  const steps = [];
  let selectedRuntimeCapability = null;
  let candidatePaths = [];

  const wantsCode = requested.includes('code');
  const wantsProject = requested.includes('project.collect');

  if (wantsCode) {
    const codeResult = buildCodeSteps(steps, requested, normalizedRequest);
    selectedRuntimeCapability = codeResult.selectedRuntimeCapability;
    candidatePaths = codeResult.candidatePaths;
  } else {
    buildNonCodeSteps(steps, requested);
    candidatePaths = Object.freeze([
      Object.freeze({
        id: 'explicit_outputs',
        capabilities: Object.freeze(
          requested.filter(value => value !== 'project.collect')
        )
      })
    ]);
  }

  if (wantsProject) {
    const terminalDependencies = steps
      .filter(step => !steps.some(other => other.dependsOn.includes(step.id)))
      .map(step => step.id);
    addStep(steps, 'project.collect', terminalDependencies);
  }

  if (steps.length === 0) {
    throw plannerError('BRAIN_PLANNER_NO_EXECUTION_PATH');
  }

  const graphValidation = validatePlanSteps(steps);

  const planCore = {
    plannerId: GRAPH.plannerId,
    graphVersion: GRAPH.version,
    requestId: normalizedRequest.requestId,
    surface: normalizedRequest.surface,
    goal: normalizedRequest.goal,
    intentFingerprint,
    context,
    requestedCapabilities: requested,
    selectedRuntimeCapability,
    candidatePaths,
    steps,
    order: graphValidation.order
  };

  return Object.freeze({
    version: 'pack-035.brain-plan.v1',
    ...planCore,
    acyclic: true,
    singleSharedPlanner: true,
    executionEnabled: false,
    planFingerprint: fingerprint(planCore)
  });
}

module.exports = {
  createBrainPlan
};
