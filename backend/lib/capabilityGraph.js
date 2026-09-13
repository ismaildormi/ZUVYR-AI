'use strict';

const CONFIG = require('../config/capability-graph.v1.json');

const CAPABILITIES = Object.freeze({ ...CONFIG.capabilities });
const EDGE_SET = new Set(CONFIG.edges.map(([from, to]) => `${from}\n${to}`));

function graphError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function assertCapability(id) {
  const capability = String(id || '').trim();
  const definition = CAPABILITIES[capability];
  if (!definition) {
    throw graphError('CAPABILITY_UNKNOWN', { capability: capability || null });
  }
  return Object.freeze({ id: capability, ...definition });
}

function assertEdge(from, to) {
  assertCapability(from);
  assertCapability(to);
  if (!EDGE_SET.has(`${from}\n${to}`)) {
    throw graphError('CAPABILITY_EDGE_FORBIDDEN', { from, to });
  }
  return true;
}

function validatePlanSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw graphError('PLAN_STEPS_REQUIRED');
  }

  const byId = new Map();
  for (const step of steps) {
    if (!step || typeof step.id !== 'string' || !step.id.trim()) {
      throw graphError('PLAN_STEP_ID_INVALID');
    }
    if (byId.has(step.id)) {
      throw graphError('PLAN_STEP_ID_DUPLICATE', { stepId: step.id });
    }
    assertCapability(step.capability);
    const dependsOn = Array.isArray(step.dependsOn) ? step.dependsOn : [];
    if (new Set(dependsOn).size !== dependsOn.length || dependsOn.includes(step.id)) {
      throw graphError('PLAN_STEP_DEPENDENCY_INVALID', { stepId: step.id });
    }
    byId.set(step.id, { ...step, dependsOn: [...dependsOn] });
  }

  for (const step of byId.values()) {
    for (const dependencyId of step.dependsOn) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        throw graphError('PLAN_STEP_DEPENDENCY_UNKNOWN', {
          stepId: step.id,
          dependencyId
        });
      }
      assertEdge(dependency.capability, step.capability);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const order = [];

  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw graphError('PLAN_DEPENDENCY_CYCLE', { stepId: id });
    }

    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  }

  for (const id of byId.keys()) visit(id);

  return Object.freeze({
    acyclic: true,
    order: Object.freeze(order),
    stepCount: byId.size
  });
}

function publicCapabilityGraph() {
  return Object.freeze({
    version: CONFIG.version,
    plannerId: CONFIG.plannerId,
    singleSharedPlanner: CONFIG.singleSharedPlanner === true,
    capabilities: Object.freeze(
      Object.entries(CAPABILITIES).map(([id, value]) =>
        Object.freeze({ id, ...value })
      )
    ),
    edges: Object.freeze(
      CONFIG.edges.map(edge => Object.freeze([...edge]))
    )
  });
}

module.exports = {
  CONFIG,
  assertCapability,
  assertEdge,
  validatePlanSteps,
  publicCapabilityGraph
};
