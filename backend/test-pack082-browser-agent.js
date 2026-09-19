'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const crypto = require('node:crypto');
const {
  MODEL_PRICING_REGISTRY_VERSION,
  quoteModelCost,
  providerReportedCostTelemetry
} = require('./lib/modelPricingAuthority');

const read = file =>
  fs.readFileSync(path.join(__dirname, file), 'utf8');

const config = require('./config/browser-agent.v1.json');
const {
  normalizeText,
  classifyAction,
  assertObservationBoundary,
  permissionRequestForAction,
  assertConsumedGrantMatches
} = require('./lib/browserAgentPolicy');
const {
  redactGoal
} = require('./lib/browserAgentPlanner');
const {
  parseDecisionText,
  actionFromDecision
} = require('./lib/browserAgentController');
const {
  createStepExecutor
} = require('./lib/stepExecutor');

const migration = read('82_pack082_browser_agent.sql');
const permission79 = read('79_pack079_real_zip_deploy_rollback.sql');
const cancel39 = read('47_pack039_cancel_compensation.sql');
const routes = read('lib/browserAgentRoutes.js');
const controller = read('lib/browserAgentController.js');
const repository = read('lib/browserAgentRepository.js');
const durable = read('lib/durableTaskPersistence.js');
const server = read('server.js');
const aiRouter = read('aiRouter.js');
const decisionLog = read('lib/routerDecisionLog.js');
const pricingAuthority = read('lib/modelPricingAuthority.js');
const providerRegistry = read('src/modules/ai/providers/index.js');
const graph = require('./config/capability-graph.v1.json');
const routerHardFilters = require('./config/router-hard-filters.v1.json');

function count(source, value) {
  return source.split(value).length - 1;
}

function functionBody(source, name) {
  const marker = 'create or replace function public.' + name + '(';
  const start = source.toLowerCase().indexOf(marker.toLowerCase());
  assert(start >= 0, name + ' function missing');
  const tail = source.slice(start);
  const tagMatch = tail.match(/\bas\s+(\$[A-Za-z0-9_]*\$|\$\$)/i);
  assert(tagMatch, name + ' function delimiter missing');
  const tag = tagMatch[1];
  const bodyStart = start + tagMatch.index + tagMatch[0].length - tag.length;
  const end = source.indexOf(tag + ';', bodyStart + tag.length);
  assert(end > bodyStart, name + ' function end missing');
  return source.slice(start, end + tag.length + 1);
}

for (const table of [
  'browser_agent_runs',
  'browser_agent_actions',
  'browser_agent_reasoning_turns'
]) {
  assert.equal(
    count(
      migration.toLowerCase(),
      'create table if not exists public.' + table
    ),
    1,
    table + ' must be created exactly once'
  );
  assert(
    migration.includes(
      'alter table public.' + table + ' enable row level security'
    ),
    table + ' RLS missing'
  );
  assert(
    migration.includes(
      'revoke all on public.' + table +
      ' from public, anon, authenticated'
    ),
    table + ' browser grants must remain revoked'
  );
}

const pack82Functions = [
  'zuvyr_permission_resource_owned',
  'create_zuvyr_permission_grant',
  'reserve_zuvyr_browser_agent_run_pack082',
  'transition_zuvyr_browser_agent_run_pack082',
  'reserve_zuvyr_browser_agent_action_pack082',
  'transition_zuvyr_browser_agent_action_pack082',
  'request_stop_zuvyr_browser_agent_run_pack082',
  'defer_zuvyr_task_step_pack082',
  'resume_zuvyr_task_step_pack082',
  'request_cancel_zuvyr_task',
  'cancel_zuvyr_task_step'
];

for (const fn of pack82Functions) {
  assert.equal(
    count(
      migration.toLowerCase(),
      'create or replace function public.' + fn.toLowerCase() + '('
    ),
    1,
    fn + ' must exist exactly once'
  );
}

assert(!/grant\s+(?:select|insert|update|delete)[^;]*\s+to\s+(?:anon|authenticated)/i.test(migration));

const owned82 = functionBody(
  migration,
  'zuvyr_permission_resource_owned'
);
assert(owned82.includes("p_resource_namespace = 'workspace_project'"));
assert(owned82.includes("p_resource_namespace = 'code_project'"));
assert(owned82.includes("p_resource_namespace = 'browser_session'"));
assert(owned82.includes('from public.browser_sessions'));
assert(owned82.includes('s.owner_id=p_owner_id'));
assert(owned82.includes("s.status in ('running','detached')"));

const grant79 = functionBody(
  permission79,
  'create_zuvyr_permission_grant'
);
const grant82 = functionBody(
  migration,
  'create_zuvyr_permission_grant'
);

// PACK082 must preserve all latest PACK079 action classes and hardening.
for (const marker of [
  'project.read',
  'project.write',
  'dependency.install',
  'runtime.execute',
  'preview.view',
  'preview.open',
  'network.egress',
  'deploy.execute',
  'deploy.rollback',
  'permission_mode_scope_mismatch',
  'permission_deploy_allow_once_required',
  'permission_network_hosts_required',
  'blocked_permission_network_host'
]) {
  assert(grant79.includes(marker), 'PACK079 baseline marker missing: ' + marker);
  assert(grant82.includes(marker), 'PACK082 regressed PACK079 marker: ' + marker);
}

for (const marker of [
  'browser.interact',
  'browser.input',
  'browser.submit',
  'browser.upload',
  "'browser_session'",
  'permission_browser_allow_once_required',
  'permission_browser_host_required',
  'permission_browser_action_fingerprint_required',
  'permission_browser_host_invalid'
]) {
  assert(grant82.includes(marker), 'PACK082 browser permission marker missing: ' + marker);
}

const cancelRequest39 = functionBody(
  cancel39,
  'request_cancel_zuvyr_task'
);
const cancelRequest82 = functionBody(
  migration,
  'request_cancel_zuvyr_task'
);
const cancelStep39 = functionBody(
  cancel39,
  'cancel_zuvyr_task_step'
);
const cancelStep82 = functionBody(
  migration,
  'cancel_zuvyr_task_step'
);

for (const marker of [
  'pack039_cancel_reason_invalid',
  'pack039_task_not_found',
  'cancel_requested=true',
  'cancellation_receipt',
  'lateResultIgnored'
]) {
  assert(
    cancelRequest82.replace(/\s+/g, '').includes(
      marker.replace(/\s+/g, '')
    ),
    'PACK082 cancel request lost canonical PACK039 marker: ' + marker
  );
}
for (const marker of [
  'pack039_cancellation_receipt_invalid',
  'pack039_cancel_lease_not_current',
  'pack039_cancel_not_requested',
  'late_result'
]) {
  if (cancelStep39.includes(marker)) {
    assert(
      cancelStep82.includes(marker),
      'PACK082 cancel step lost canonical PACK039 marker: ' + marker
    );
  }
}
assert(cancelRequest82.includes("'pending','running','deferred'"));
assert(cancelStep82.includes("'pending','running','deferred'"));

const deferBody = functionBody(
  migration,
  'defer_zuvyr_task_step_pack082'
);
const resumeBody = functionBody(
  migration,
  'resume_zuvyr_task_step_pack082'
);
assert(deferBody.includes("set state='deferred'"));
assert(deferBody.includes('greatest(attempts - 1, 0)'));
assert(deferBody.includes('lease_owner=null'));
assert(deferBody.includes('lease_token=null'));
assert(resumeBody.includes("v_step.state <> 'deferred'"));
assert(resumeBody.includes("set state='pending'"));
assert(resumeBody.includes('resume_count=resume_count + 1'));
assert(resumeBody.includes('v_run.cancel_requested'));

assert.equal(config.version, 'pack-082.browser-agent.v1');
assert.equal(config.planner.canonicalPlanner, 'zuvyr.brain.planner.v1');
assert.equal(config.planner.capability, 'browser.agent.run');
assert.equal(config.planner.duplicatePlannerForbidden, true);
assert.equal(config.authBoundaries.passwordEntryByAgent, false);
assert.equal(config.authBoundaries.otpEntryByAgent, false);
assert.equal(config.authBoundaries.paymentCardEntryByAgent, false);
assert.equal(config.authBoundaries.captchaSolveByAgent, false);
assert.equal(config.siteBoundaries.privateNetworkBlocked, true);
assert.equal(config.siteBoundaries.robotsPolicy, 'respect');
assert.equal(config.cancellation.globalStop, true);
assert.equal(config.cancellation.uncertainExternalOutcomeNeverBlindRetry, true);
assert.equal(config.liveGate.inheritedFromPack081, 'M17');
assert.equal(config.liveGate.providerCallsAllowedWhenPack081Live, false);

assert(graph.capabilities['browser.agent.run']);
assert.equal(graph.outputAliases.browser, 'browser.agent.run');
assert.equal(graph.outputAliases.web_agent, 'browser.agent.run');
assert.equal(
  Object.prototype.hasOwnProperty.call(
    graph.plannerRules.surfaceDefaults,
    'work'
  ),
  false,
  'Work must require an explicit browser/web_agent output'
);
assert(
  graph.edges.some(edge =>
    Array.isArray(edge) &&
    edge[0] === 'browser.agent.run' &&
    edge[1] === 'project.collect'
  )
);

const safeNavigate = classifyAction(
  {
    type: 'navigate',
    url: 'https://example.com/path'
  },
  { allowedHosts: ['example.com'] }
);
assert.equal(safeNavigate.type, 'navigate');
assert.equal(safeNavigate.permissionAction, null);
assert.equal(safeNavigate.persistedTarget.host, 'example.com');
assert.equal(safeNavigate.persistedTarget.path, '/path');

assert.throws(
  () => classifyAction(
    { type: 'navigate', url: 'https://example.com/path?q=secret' },
    { allowedHosts: ['example.com'] }
  ),
  error => error.code === 'browser_agent_navigation_query_forbidden'
);

assert.throws(
  () => classifyAction(
    { type: 'navigate', url: 'https://127.0.0.1/' },
    { allowedHosts: ['127.0.0.1'] }
  ),
  error => error.code === 'cloud_browser_private_network_blocked'
);

assert.throws(
  () => classifyAction(
    { type: 'navigate', url: 'https://user:password@example.com/' },
    { allowedHosts: ['example.com'] }
  ),
  error => error.code === 'cloud_browser_url_credentials_forbidden'
);

const submitClick = classifyAction({
  type: 'click',
  target: {
    handle: 'za_12345678',
    tag: 'button',
    text: 'Buy',
    host: 'example.com',
    path: '/checkout',
    submitLike: true
  }
});
assert.equal(submitClick.permissionAction, 'browser.submit');
assert.equal(submitClick.risk, 'critical');
assert.equal(submitClick.retry, 'never_blind');

const typedText = 'hello browser';
const typed = classifyAction({
  type: 'type',
  text: typedText,
  target: {
    handle: 'za_abcdefgh',
    tag: 'input',
    type: 'text',
    host: 'example.com',
    path: '/form'
  }
});
assert.equal(typed.permissionAction, 'browser.input');
assert.match(typed.inputSha256, /^[0-9a-f]{64}$/);
assert.equal(typed.inputLength, typedText.length);
assert.equal(
  JSON.stringify(typed.persistedTarget).includes(typedText),
  false,
  'Raw typed text must not enter the durable target'
);

assert.throws(
  () => normalizeText('password: hunter2'),
  error => error.code === 'browser_agent_sensitive_input_blocked'
);
assert.throws(
  () => classifyAction({
    type: 'type',
    text: 'hello',
    target: {
      handle: 'za_abcdefgh',
      authChallenge: true
    }
  }),
  error => error.code === 'browser_agent_auth_user_required'
);
assert.throws(
  () => classifyAction({
    type: 'submit',
    target: {
      handle: 'za_abcdefgh',
      captcha: true
    }
  }),
  error => error.code === 'browser_agent_captcha_user_required'
);
assert.throws(
  () => classifyAction({
    type: 'upload',
    assetId: 'not-a-uuid',
    target: { handle: 'za_abcdefgh' }
  }),
  error => error.code === 'browser_agent_upload_asset_invalid'
);

const sessionId = '11111111-1111-4111-8111-111111111111';
const permissionRequest = permissionRequestForAction({
  ownerId: '22222222-2222-4222-8222-222222222222',
  browserSessionId: sessionId,
  classified: submitClick,
  host: 'example.com',
  now: 1_700_000_000_000
});
assert.equal(permissionRequest.action, 'browser.submit');
assert.equal(permissionRequest.grantMode, 'allow_once');
assert.equal(permissionRequest.scopeType, 'project_session');
assert.equal(permissionRequest.resourceNamespace, 'browser_session');
assert.equal(permissionRequest.resourceId, sessionId);
assert.equal(permissionRequest.sessionId, sessionId);
assert.equal(permissionRequest.constraints.host, 'example.com');
assert.equal(
  permissionRequest.constraints.actionFingerprint,
  submitClick.actionFingerprint
);

assert.equal(
  assertConsumedGrantMatches(submitClick, {
    allowed: true,
    constraints: {
      host: 'example.com',
      actionFingerprint: submitClick.actionFingerprint
    }
  }),
  true
);
assert.throws(
  () => assertConsumedGrantMatches(submitClick, {
    allowed: true,
    constraints: {
      host: 'example.com',
      actionFingerprint: 'f'.repeat(64)
    }
  }),
  error => error.code === 'browser_agent_permission_fingerprint_mismatch'
);
assert.throws(
  () => assertConsumedGrantMatches(submitClick, {
    allowed: true,
    constraints: {
      host: 'other.example.com',
      actionFingerprint: submitClick.actionFingerprint
    }
  }),
  error => error.code === 'browser_agent_permission_host_mismatch'
);

assert.equal(
  assertObservationBoundary({
    page: { host: 'example.com' },
    robots: 'allowed'
  }),
  true
);
for (const [observation, code] of [
  [{ captchaDetected: true }, 'browser_agent_captcha_user_required'],
  [{ authChallengeDetected: true }, 'browser_agent_auth_user_required'],
  [{ page: { host: 'example.com' }, robots: 'disallowed' }, 'browser_agent_robots_disallowed'],
  [{ page: { host: 'example.com' }, robots: 'unknown' }, 'browser_agent_robots_unknown']
]) {
  assert.throws(
    () => assertObservationBoundary(observation),
    error => error.code === code
  );
}

const redacted = redactGoal(
  'Login password: secret123 OTP: 123456 card 4111 1111 1111 1111 api_key=abc'
);
assert(!redacted.includes('secret123'));
assert(!redacted.includes('123456'));
assert(!redacted.includes('4111 1111 1111 1111'));
assert(!redacted.includes('api_key=abc'));
assert(redacted.includes('[REDACTED_SECRET]'));

const doneDecision = parseDecisionText(
  '{"done":true,"expectedOutcome":"Complete"}'
);
assert.equal(doneDecision.done, true);
assert.equal(doneDecision.expectedOutcome, 'Complete');

const clickDecision = parseDecisionText(
  '{"done":false,"action":{"type":"click","handle":"za_12345678"},"expectedOutcome":"Open item"}'
);
const observedAction = actionFromDecision(
  clickDecision,
  {
    page: { host: 'example.com', path: '/items' },
    robots: 'allowed',
    captchaDetected: false,
    authChallengeDetected: false,
    items: [{
      handle: 'za_12345678',
      tag: 'button',
      role: 'button',
      type: 'button',
      text: 'Open',
      sensitive: false,
      submitLike: false
    }]
  }
);
assert.equal(observedAction.target.handle, 'za_12345678');
assert.equal(observedAction.target.host, 'example.com');
assert.throws(
  () => actionFromDecision(
    clickDecision,
    {
      page: { host: 'example.com', path: '/' },
      items: []
    }
  ),
  error => error.code === 'browser_agent_decision_target_not_observed'
);
assert.throws(
  () => parseDecisionText('not-json'),
  error => error.code === 'browser_agent_decision_invalid'
);

// Controller must reuse the canonical router/ledger/artifact systems.
for (const marker of [
  "routeRequestImpl(",
  "'chat'",
  'creditApi.reserveCredits',
  'creditApi.settleCredits',
  'creditApi.refundCredits',
  'creditApi.logCreditEvent',
  'browser.uploadCanonical',
  "status: 'uncertain'",
  'execution_state_recovered_after_interruption',
  'visibleEvidenceAfterAction'
]) {
  assert(controller.includes(marker), marker);
}

// Repository and route ownership/idempotency boundaries.
for (const marker of [
  ".eq('owner_id', ownerId)",
  'reserve_zuvyr_browser_agent_run_pack082',
  'reserve_zuvyr_browser_agent_action_pack082',
  'request_stop_zuvyr_browser_agent_run_pack082'
]) {
  assert(repository.includes(marker), marker);
}
for (const marker of [
  "router.get('/capabilities'",
  "router.get('/runs'",
  "router.post('/runs'",
  "router.get('/runs/:runId'",
  "router.post('/runs/:runId/advance'",
  "'/runs/:runId/actions/:actionId/approve'",
  "router.post('/runs/:runId/resume'",
  "router.post('/runs/:runId/stop'",
  'requiredIdempotency',
  "planHasFeature(planId, 'ip')"
]) {
  assert(routes.includes(marker), marker);
}

// Server mount must be authenticated and reuse Pack081 storage + canonical ledger.
assert(server.includes("const { createBrowserAgentRouter } = require('./lib/browserAgentRoutes');"));
const mountAt = server.indexOf("'/api/browser-agent'");
assert(mountAt >= 0, 'Browser Agent route mount missing');
const mountSegment = server.slice(Math.max(0, mountAt - 250), mountAt + 1400);
for (const marker of [
  'requireAuth',
  "rateLimit('chat')",
  'db: supabaseAdmin',
  'storage: supabaseAdmin.storage',
  'routeRequestImpl: routeRequest',
  'reserveCredits',
  'settleCredits',
  'refundCredits',
  'logCreditEvent',
  'reportRefundFailure'
]) {
  assert(mountSegment.includes(marker), 'mount missing ' + marker);
}

// Durable bridge must use canonical persistence, not a second task/queue system.
assert(durable.includes("rpc('defer_zuvyr_task_step_pack082'"));
assert(durable.includes("rpc('resume_zuvyr_task_step_pack082'"));
assert(!durable.includes('browser_agent_task_queue'));


// PACK082 regression locks: the migration must never return to the corrupted
// 10k-line/multi-copy draft, and typed values must remain transient.
assert(
  migration.split(/\r?\n/).length < 2000,
  'PACK082 migration unexpectedly expanded'
);
assert(!/input_text_redacted/i.test(migration));
assert(!/input_text_redacted/i.test(repository));
assert(!/input_text_redacted/i.test(controller));
assert(!/public\.conversations\b/i.test(migration));
assert(!/zuvyr_task_runs[\s\S]{0,180}\.owner_id/i.test(migration));
assert(migration.includes('pricing_version text'));
assert(migration.includes('cost_entry_id text'));
assert(migration.includes('pack082_type_input_digest_required'));
assert(migration.includes('pack082_non_type_input_digest_forbidden'));

const reserveActionBody = functionBody(
  migration,
  'reserve_zuvyr_browser_agent_action_pack082'
);
assert(reserveActionBody.includes('p_input_sha256 text'));
assert(reserveActionBody.includes('p_input_length integer'));
assert(!reserveActionBody.includes('p_input_text'));
assert(repository.includes('p_input_sha256: classified.inputSha256'));
assert(repository.includes('p_input_length: classified.inputLength'));
assert(!repository.includes('p_input_text_redacted'));

const transientValue = 'private-but-noncredential-value';
const typedPrivacyAction = classifyAction({
  type: 'type',
  target: {
    handle: 'za_abcdef12',
    tag: 'input',
    role: 'textbox',
    type: 'text',
    text: 'Email address',
    host: 'example.com',
    path: '/form'
  },
  text: transientValue
}, {
  allowedHosts: ['example.com']
});
assert.equal(typedPrivacyAction.text, transientValue);
assert.equal(
  typedPrivacyAction.inputSha256,
  crypto.createHash('sha256').update(transientValue, 'utf8').digest('hex')
);
assert.equal(typedPrivacyAction.inputLength, transientValue.length);
assert(
  !JSON.stringify(typedPrivacyAction.persistedTarget).includes(transientValue),
  'typed input leaked into persistedTarget'
);
assert.throws(
  () => classifyAction({
    type: 'type',
    target: {
      handle: 'za_abcdef12',
      tag: 'input',
      role: 'textbox',
      type: 'password',
      text: 'Password',
      host: 'example.com',
      path: '/login'
    },
    text: 'password: secret123'
  }, {
    allowedHosts: ['example.com']
  }),
  error => error.code === 'browser_agent_sensitive_input_blocked'
);

for (const marker of [
  'browser_agent_input_resubmission_required',
  'browser_agent_input_integrity_mismatch',
  'verifiedTransientInput(',
  'requiredOnApprove: true',
  'available: false',
  'available: true',
  'inputText: transientText'
]) {
  assert(controller.includes(marker), marker);
}
assert(!controller.includes("internal.input_text_redacted || ''"));
const approveStart = controller.indexOf('async function approveAction({');
const approveEnd = controller.indexOf(
  'async function resumeHumanBoundary',
  approveStart
);
const approveBlock = controller.slice(approveStart, approveEnd);
assert(approveStart >= 0 && approveEnd > approveStart);
assert(
  approveBlock.indexOf('verifiedTransientInput(') >= 0 &&
  approveBlock.indexOf('verifiedTransientInput(') <
    approveBlock.indexOf('permissions.consume('),
  'typed input integrity must be checked before permission consumption'
);
assert(routes.includes('inputText:'));
assert(routes.includes('no-store'));

// Canonical registry is the only monetary authority. Provider-reported
// usage.cost remains telemetry and must not override verified rates.
assert.equal(
  MODEL_PRICING_REGISTRY_VERSION,
  'pack-014.single-cost-registry.v1'
);
const canonicalQuote = quoteModelCost({
  provider: 'groq',
  model: 'openai/gpt-oss-20b',
  capability: 'chat',
  usage: {
    prompt_tokens: 1000000,
    completion_tokens: 1000000,
    cost: 0
  },
  requireMeasuredUsage: true,
  now: Date.parse('2026-09-19T12:00:00Z')
});
assert.equal(canonicalQuote.providerCostMicroUsd, '375000');
assert.equal(canonicalQuote.providerCostUsd, 0.375);
assert.equal(canonicalQuote.verificationStatus, 'verified');
assert.equal(canonicalQuote.costEntryId, 'groq-gpt-oss-20b-chat');
assert.equal(providerReportedCostTelemetry({ cost: 0 }), 0);

assert.throws(
  () => quoteModelCost({
    provider: 'openrouter',
    model: 'openrouter/free',
    capability: 'chat',
    usage: {
      prompt_tokens: 10,
      completion_tokens: 10,
      cost: 0
    },
    requireMeasuredUsage: true,
    now: Date.parse('2026-09-19T12:00:00Z')
  }),
  error => /cost_entry_/i.test(String(error.code || error.message || ''))
);
assert.throws(
  () => quoteModelCost({
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    capability: 'chat',
    usage: { cost: 0 },
    requireMeasuredUsage: true,
    now: Date.parse('2026-09-19T12:00:00Z')
  }),
  error => error.code === 'model_pricing_measured_usage_required'
);

assert(pricingAuthority.includes("require('./costRegistry')"));
assert(!pricingAuthority.includes("require('./modelCosts')"));
assert(!pricingAuthority.includes('models.json'));
assert(!aiRouter.includes("require('./lib/modelCosts')"));
assert(!aiRouter.includes('result.usage?.cost'));
assert(aiRouter.includes('quoteModelCost({'));
assert(aiRouter.includes('provider_cost_micro_usd: actualQuote.providerCostMicroUsd'));
assert(aiRouter.includes('cost_usd: actualRouteCost'));
assert(aiRouter.includes('provider_reported_cost_usd: providerReportedCostUsd'));
assert(!decisionLog.includes("require('./modelCosts')"));
assert(decisionLog.includes("require('./modelPricingAuthority')"));
assert(providerRegistry.includes('modelPricingAuthority/costRegistry'));
assert(!providerRegistry.includes('lib/modelCosts.js already normalizes'));

assert(repository.includes('pricing_version: normalizedPricingVersion'));
assert(repository.includes('cost_entry_id: normalizedCostEntryId'));
assert(controller.includes('MODEL_PRICING_REGISTRY_VERSION'));
assert(controller.includes('browser_agent_reasoning_pricing_lineage_missing'));
assert(controller.includes('result.pricing?.provider_cost_micro_usd'));
assert(controller.includes('pricingVersion: reasoned.pricingVersion'));
assert(controller.includes('costEntryId: reasoned.costEntryId'));
assert(!controller.includes("'pack082.measured-model-cost.v1'"));

assert.equal(
  routerHardFilters.costAuthority,
  'backend/lib/modelPricingAuthority.js'
);
assert(aiRouter.includes('let providerSuccessAccepted = false'));
assert(aiRouter.includes('providerSuccessAccepted = logicalSuccess.accepted === true'));
assert(aiRouter.includes("'POST_SUCCESS_ACCOUNTING_FAILURE'"));
assert(aiRouter.includes("'model_post_success_accounting_failed'"));
assert(
  aiRouter.indexOf('if (providerSuccessAccepted)') <
    aiRouter.indexOf(
      "fallbackScope.completeAttempt(\n        billingAttempt.attemptId,\n        err && err.name"
    ) ||
  aiRouter.includes('if (providerSuccessAccepted)')
);

(async () => {
  const calls = {
    checkpoint: [],
    deferred: [],
    complete: 0,
    failed: 0
  };

  const persistence = {
    async claimNext() {
      return {
        claimed: true,
        stepId: 1,
        stepKey: 'browser-agent',
        capability: 'browser.agent.run',
        attempt: 1,
        maxAttempts: 1,
        resumed: false,
        resumeCount: 0,
        checkpoint: {},
        dependsOn: [],
        input: {
          browserSessionId: sessionId,
          goal: 'Inspect example.com'
        },
        leaseToken: '33333333-3333-4333-8333-333333333333'
      };
    },
    async snapshot() {
      return {
        run: {
          plan: {
            goal: 'Inspect example.com',
            steps: []
          }
        },
        steps: []
      };
    },
    async renewLease() {
      return { success: true };
    },
    async checkpoint(input) {
      calls.checkpoint.push(input);
      return { success: true };
    },
    async deferStep(input) {
      calls.deferred.push(input);
      return { state: 'deferred' };
    },
    async completeStep() {
      calls.complete += 1;
      return { state: 'succeeded' };
    },
    async failStep() {
      calls.failed += 1;
      return { state: 'failed', willRetry: false };
    }
  };

  const registry = {
    get(capability) {
      assert.equal(capability, 'browser.agent.run');
      return {
        sideEffectMode: 'idempotent_external',
        retryable: false,
        timeoutMs: 5000,
        async execute({ idempotencyKey }) {
          assert.match(idempotencyKey, /^[0-9a-f]{64}$/);
          return {
            deferred: true,
            reason: 'approval_required',
            deferredContext: {
              runId: '44444444-4444-4444-8444-444444444444',
              actionId: '55555555-5555-4555-8555-555555555555'
            }
          };
        }
      };
    }
  };

  const executor = createStepExecutor({
    persistence,
    registry,
    leaseRenewalMs: 1000,
    cancelPollMs: 1000
  });

  const result = await executor.runNext({
    userId: '22222222-2222-4222-8222-222222222222',
    taskRunId: '66666666-6666-4666-8666-666666666666',
    workerOwner: 'pack082-test-worker'
  });

  assert.equal(result.claimed, true);
  assert.equal(result.deferred, true);
  assert.equal(result.state, 'deferred');
  assert.equal(calls.deferred.length, 1);
  assert.equal(calls.complete, 0);
  assert.equal(calls.failed, 0);
  assert.equal(
    calls.deferred[0].checkpoint.reason,
    'approval_required'
  );

  console.log('PASS: PACK082 migration is clean and extends canonical Permission Center/Cancel behavior');
  console.log('PASS: PACK082 browser actions enforce scoped approvals, secret boundaries and no-blind-retry semantics');
  console.log('PASS: PACK082 Browser Agent routes are mounted on canonical auth/storage/router/ledger infrastructure');
  console.log('PASS: PACK082 durable approval deferral uses the existing task executor without a second queue');
  console.log('LIVE BROWSERBASE / PAYMENT / PROVIDER NETWORK CALLS: NONE');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
