'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { normalizeChatCoreRequest, chatCoreEvidence } = require('./lib/chatCoreNormalization');

const binding = normalizeChatCoreRequest({
  requestId: 'pack051-test-request',
  body: { feature: 'chat', messages: [{ role: 'user', content: 'Hello ZUVYR' }] }
});
assert.equal(binding.request.surface, 'chat');
assert.equal(binding.plan.steps.length, 1);
assert.equal(binding.plan.steps[0].capability, 'chat.respond');
assert.ok(binding.intentLock.intentFingerprint);
assert.ok(binding.plan.planFingerprint);
assert.ok(binding.kernelContractVersion);

const evidence = chatCoreEvidence(binding, {
  ranking_mode: 'smart',
  decision_receipt: { decisionId: 'decision-1' },
  billing_scope: { requestId: 'pack051-test-request', logicalChargeCount: 1 }
});
assert.equal(evidence.pack, '051');
assert.equal(evidence.capability, 'chat.respond');
assert.equal(evidence.router_decision_id, 'decision-1');
assert.ok(evidence.billing_scope);

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const flowRoutes = fs.readFileSync(path.join(__dirname, 'lib/zuvyrChatFlowRoutes.js'), 'utf8');
assert(server.includes('normalizeChatCoreRequest({ body: req.body, requestId })'));
assert(server.includes('chat_core: chatCoreBinding ? chatCoreEvidence(chatCoreBinding, result) : null'));
assert(flowRoutes.includes("ZUVYR_CHAT_FLOW_LEGACY_PILOT_ENABLED === 'true'"));
assert(!/if\s*\(\s*enabledFor\(req\.userId,env\)/.test(flowRoutes), 'pilot eligibility must not be the default Chat selector');
console.log('PASS: Pack051 standard Chat is normalized through the shared Brain plan/kernel contract, keeps Router billing evidence, and no longer depends on pilot-user eligibility');
