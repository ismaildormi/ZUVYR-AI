'use strict';

const crypto = require('node:crypto');
const config = require('../config/browser-agent.v1.json');
const { normalizePublicUrl } = require('./cloudBrowserPolicy');

const HANDLE_RE = /^za_[a-z0-9]{8,80}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function agentError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, stable(value[key])])
    );
  }
  return value;
}

function fingerprint(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stable(value)), 'utf8')
    .digest('hex');
}

function normalizeHandle(value) {
  const handle = String(value || '').trim();
  if (!HANDLE_RE.test(handle)) throw agentError('browser_agent_handle_invalid');
  return handle;
}

function normalizeText(value) {
  const text = String(value == null ? '' : value);
  if (text.length > config.run.typedTextMaxLength) {
    throw agentError('browser_agent_text_too_long');
  }
  if (
    /(password|passcode|otp|one[- ]?time|verification\s+code|cvv|cvc|card\s*number)\s*[:=]/i.test(text) ||
    /\b(?:\d[ -]*?){13,19}\b/.test(text)
  ) {
    throw agentError('browser_agent_sensitive_input_blocked');
  }
  return text;
}

function actionDefinition(type) {
  const key = String(type || '').trim().toLowerCase();
  const definition = config.actionPolicy[key];
  if (!definition) throw agentError('browser_agent_action_unsupported');
  return { type: key, definition };
}

function targetSummary(target = {}) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    throw agentError('browser_agent_target_invalid');
  }
  const handle = target.handle == null ? null : normalizeHandle(target.handle);
  return Object.freeze({
    handle,
    tag: String(target.tag || '').toLowerCase().slice(0, 30),
    role: String(target.role || '').toLowerCase().slice(0, 80),
    type: String(target.type || '').toLowerCase().slice(0, 40),
    text: String(target.text || '').trim().slice(0, 300),
    host: target.host == null ? null : String(target.host).toLowerCase().slice(0, 253),
    path: target.path == null ? null : String(target.path).slice(0, 1000),
    sensitive: target.sensitive === true,
    submitLike: target.submitLike === true,
    captcha: target.captcha === true,
    authChallenge: target.authChallenge === true
  });
}

function classifyAction(action, { allowedHosts = [] } = {}) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    throw agentError('browser_agent_action_invalid');
  }

  const { type, definition } = actionDefinition(action.type);
  const target = targetSummary(action.target || {});

  if (target.captcha) throw agentError('browser_agent_captcha_user_required');
  if (target.authChallenge && ['type','submit'].includes(type)) {
    throw agentError('browser_agent_auth_user_required');
  }
  if (target.sensitive && ['type','submit'].includes(type)) {
    throw agentError('browser_agent_sensitive_input_blocked');
  }

  let permissionAction = definition.permissionAction;
  let risk = definition.risk;
  let input = null;
  let targetUrl = null;

  if (type === 'navigate') {
    targetUrl = normalizePublicUrl(action.url, { allowedHosts });
    const parsed = new URL(targetUrl.url);
    if (parsed.search || parsed.hash) {
      throw agentError('browser_agent_navigation_query_forbidden');
    }
  }

  if (type === 'click' && target.submitLike) {
    permissionAction = 'browser.submit';
    risk = 'critical';
  }

  if (type === 'type') {
    input = normalizeText(action.text);
  }

  if (type === 'submit') {
    permissionAction = 'browser.submit';
    risk = 'critical';
  }

  if (type === 'upload') {
    if (!UUID_RE.test(String(action.assetId || ''))) {
      throw agentError('browser_agent_upload_asset_invalid');
    }
  }

  const deltaY =
    type === 'scroll'
      ? Math.max(-2000, Math.min(2000, Number(action.deltaY) || 600))
      : null;
  const waitMs =
    type === 'wait'
      ? Math.max(50, Math.min(config.run.waitMaxMs, Number(action.waitMs) || 500))
      : null;

  const canonical = {
    type,
    target,
    url: targetUrl ? targetUrl.url : null,
    deltaY,
    waitMs,
    inputSha256:
      input == null
        ? null
        : crypto.createHash('sha256').update(input, 'utf8').digest('hex'),
    inputLength: input == null ? null : input.length,
    assetId: type === 'upload' ? String(action.assetId).toLowerCase() : null
  };

  return Object.freeze({
    type,
    target,
    targetUrl,
    text: input,
    assetId: canonical.assetId,
    risk,
    permissionAction,
    retry: permissionAction ? 'never_blind' : definition.retry,
    actionFingerprint: fingerprint(canonical),
    persistedTarget: Object.freeze({
      handle: target.handle,
      tag: target.tag,
      role: target.role,
      type: target.type,
      text: target.text,
      protocol: targetUrl ? new URL(targetUrl.url).protocol : null,
      host: targetUrl ? targetUrl.host : target.host,
      path: targetUrl ? new URL(targetUrl.url).pathname : target.path,
      submitLike: target.submitLike,
      deltaY,
      waitMs,
      assetId: canonical.assetId
    }),
    inputSha256: canonical.inputSha256,
    inputLength: canonical.inputLength
  });
}

function assertObservationBoundary(observation = {}) {
  if (observation.captchaDetected === true) {
    throw agentError('browser_agent_captcha_user_required');
  }
  if (observation.authChallengeDetected === true) {
    throw agentError('browser_agent_auth_user_required');
  }
  if (observation.page?.host && observation.robots === 'disallowed') {
    throw agentError('browser_agent_robots_disallowed');
  }
  if (observation.page?.host && observation.robots === 'unknown') {
    throw agentError('browser_agent_robots_unknown');
  }
  return true;
}

function permissionRequestForAction({
  ownerId,
  browserSessionId,
  classified,
  host,
  now = Date.now()
} = {}) {
  if (!classified?.permissionAction) return null;
  if (!UUID_RE.test(String(browserSessionId || ''))) {
    throw agentError('browser_agent_session_invalid');
  }
  const allowOnce = ['browser.submit','browser.upload'].includes(
    classified.permissionAction
  );
  return Object.freeze({
    action: classified.permissionAction,
    grantMode: allowOnce ? 'allow_once' : 'allow_once',
    scopeType: 'project_session',
    resourceNamespace: 'browser_session',
    resourceId: String(browserSessionId).toLowerCase(),
    sessionId: String(browserSessionId).toLowerCase(),
    expiresAt: new Date(
      now + (allowOnce ? 10 : 10) * 60 * 1000
    ).toISOString(),
    constraints: Object.freeze({
      ...(host ? { host } : {}),
      actionFingerprint: classified.actionFingerprint
    })
  });
}

function assertConsumedGrantMatches(classified, consumed) {
  if (!classified.permissionAction) return true;
  if (!consumed || consumed.allowed !== true) {
    throw agentError('browser_agent_permission_required');
  }
  const constraints = consumed.constraints || {};
  if (
    constraints.actionFingerprint &&
    constraints.actionFingerprint !== classified.actionFingerprint
  ) {
    throw agentError('browser_agent_permission_fingerprint_mismatch');
  }
  if (
    classified.target.host &&
    constraints.host &&
    constraints.host !== classified.target.host
  ) {
    throw agentError('browser_agent_permission_host_mismatch');
  }
  return true;
}

module.exports = {
  HANDLE_RE,
  agentError,
  fingerprint,
  normalizeHandle,
  normalizeText,
  classifyAction,
  assertObservationBoundary,
  permissionRequestForAction,
  assertConsumedGrantMatches
};
