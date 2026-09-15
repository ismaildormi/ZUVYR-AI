'use strict';

const { normalizeSurfaceRequest } = require('./universalRequest');
const { extractRequirements } = require('./requirementExtractor');
const { createIntentLock } = require('./intentLock');
const { createBrainPlan } = require('./brainPlanner');
const KERNEL_CONFIG = require('../config/brain-kernel-checkpoint-d.v1.json');

function normalizeChatCoreRequest({ body = {}, requestId = null } = {}) {
  const request = normalizeSurfaceRequest({
    surface: 'chat',
    body: { ...body, feature: 'chat' },
    requestId
  });
  const extraction = extractRequirements(request);
  const intentLock = createIntentLock(request, extraction);
  const plan = createBrainPlan({ request, extraction, intentLock });

  if (
    plan.surface !== 'chat' ||
    !Array.isArray(plan.steps) ||
    plan.steps.length !== 1 ||
    plan.steps[0].capability !== 'chat.respond'
  ) {
    const error = new Error('PACK051_CHAT_PLAN_INVALID');
    error.code = 'PACK051_CHAT_PLAN_INVALID';
    throw error;
  }

  return Object.freeze({
    request,
    extraction,
    intentLock,
    plan,
    kernelContractVersion: KERNEL_CONFIG.version
  });
}

function chatCoreEvidence(binding, routedResult = null) {
  return Object.freeze({
    pack: '051',
    surface: 'chat',
    universal_request_id: binding.request.requestId,
    planner_id: binding.plan.plannerId,
    plan_version: binding.plan.version,
    plan_fingerprint: binding.plan.planFingerprint,
    intent_fingerprint: binding.intentLock.intentFingerprint,
    kernel_contract_version: binding.kernelContractVersion,
    capability: binding.plan.steps[0].capability,
    router_decision_id: routedResult?.decision_receipt?.decisionId || null,
    router_ranking_mode: routedResult?.ranking_mode || null,
    billing_scope: routedResult?.billing_scope || null
  });
}

module.exports = { normalizeChatCoreRequest, chatCoreEvidence };
