'use strict';

const crypto = require('node:crypto');
const { normalizeUniversalRequest } = require('./universalRequest');
const { extractRequirements } = require('./requirementExtractor');
const { createIntentLock } = require('./intentLock');
const { createBrainPlan } = require('./brainPlanner');

function plannerError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requestId(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 200) throw plannerError('pack082_request_id_invalid');
  return raw;
}

function cleanGoal(value) {
  const goal = String(value || '').trim();
  if (!goal || goal.length > 4000) throw plannerError('pack082_goal_invalid');
  return goal;
}

function redactGoal(value) {
  const goal = cleanGoal(value);
  const secretPatterns = [
    /(password|passcode|pin)\s*[:=]\s*\S+/ig,
    /(otp|one[- ]?time\s+code|verification\s+code)\s*[:=]?\s*\d{4,10}/ig,
    /(cvv|cvc)\s*[:=]?\s*\d{3,4}/ig,
    /\b(?:\d[ -]*?){13,19}\b/g,
    /(api[_ -]?key|access[_ -]?token|secret)\s*[:=]\s*\S+/ig
  ];
  let redacted = goal;
  for (const pattern of secretPatterns) {
    redacted = redacted.replace(pattern, '[REDACTED_SECRET]');
  }
  return redacted;
}

function createBrowserAgentBrainPlan({
  requestId: suppliedRequestId,
  goal,
  conversationId = null,
  taskRunId = null,
  allowedHosts = [],
  maxSteps = 20
} = {}) {
  const id = requestId(suppliedRequestId);
  const redactedGoal = redactGoal(goal);
  const universalRequest = normalizeUniversalRequest({
    requestId: id,
    surface: 'work',
    goal: redactedGoal,
    inputs: {
      feature: 'browser',
      conversationId,
      taskRunId
    },
    constraints: {
      allowedHosts,
      maxSteps,
      browserAgent: true
    },
    outputs: {
      requested: ['browser']
    },
    contextRefs: [],
    language: {},
    risk: {
      externalActions: true,
      approvalBoundaries: true
    },
    budget: {},
    clientState: {},
    metadata: {
      pack: '082',
      adapter: 'browser_agent'
    }
  });

  const extraction = extractRequirements(universalRequest);
  if (extraction.clarification?.required === true) {
    const error = plannerError('pack082_brain_clarification_required');
    error.extraction = extraction;
    throw error;
  }

  const intentLock = createIntentLock(universalRequest, extraction);
  const plan = createBrainPlan({
    request: universalRequest,
    extraction,
    intentLock
  });

  if (
    !Array.isArray(plan.steps) ||
    plan.steps.length !== 1 ||
    plan.steps[0]?.capability !== 'browser.agent.run'
  ) {
    throw plannerError('pack082_brain_plan_invalid');
  }

  const goalSha256 = crypto
    .createHash('sha256')
    .update(redactedGoal, 'utf8')
    .digest('hex');

  return Object.freeze({
    request: universalRequest,
    extraction,
    intentLock,
    plan,
    goalRedacted: redactedGoal,
    goalSha256,
    planVersion: plan.version,
    intentFingerprint: intentLock.intentFingerprint
  });
}

module.exports = {
  cleanGoal,
  redactGoal,
  createBrowserAgentBrainPlan
};
