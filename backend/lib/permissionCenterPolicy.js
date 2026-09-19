'use strict';

const crypto = require('crypto');

const ACTIONS = Object.freeze({
  'project.read': Object.freeze({
    risk: 'low',
    consequenceId: 'permission.project.read.v1',
    consequence: 'Allow ZUVYR to read this owned project for the approved scope.',
    maxGrantSeconds: 86400,
    modes: Object.freeze(['session', 'scoped']),
    scopes: Object.freeze(['project', 'project_session']),
    namespaces: Object.freeze(['workspace_project', 'code_project'])
  }),
  'project.write': Object.freeze({
    risk: 'medium',
    consequenceId: 'permission.project.write.v1',
    consequence: 'Allow ZUVYR to modify this owned project for the approved scope.',
    maxGrantSeconds: 14400,
    modes: Object.freeze(['session', 'scoped']),
    scopes: Object.freeze(['project', 'project_session']),
    namespaces: Object.freeze(['workspace_project', 'code_project'])
  }),
  'dependency.install': Object.freeze({
    risk: 'high',
    consequenceId: 'permission.dependency.install.v1',
    consequence: 'Allow this Code Studio session to install dependencies inside this owned project sandbox.',
    maxGrantSeconds: 1800,
    modes: Object.freeze(['allow_once', 'session']),
    scopes: Object.freeze(['project_session']),
    namespaces: Object.freeze(['code_project'])
  }),
  'runtime.execute': Object.freeze({
    risk: 'high',
    consequenceId: 'permission.runtime.execute.v1',
    consequence: 'Allow this Code Studio session to execute code inside the isolated project runtime.',
    maxGrantSeconds: 3600,
    modes: Object.freeze(['allow_once', 'session']),
    scopes: Object.freeze(['project_session']),
    namespaces: Object.freeze(['code_project'])
  }),
  'preview.view': Object.freeze({
    risk: 'medium',
    consequenceId: 'permission.preview.view.v1',
    consequence: 'Allow this Code Studio session to view the live preview for this owned project.',
    maxGrantSeconds: 14400,
    modes: Object.freeze(['allow_once', 'session']),
    scopes: Object.freeze(['project_session']),
    namespaces: Object.freeze(['code_project'])
  }),
  'preview.open': Object.freeze({
    risk: 'high',
    consequenceId: 'permission.preview.open.v1',
    consequence: 'Allow this Code Studio session to open an interactive live preview for this owned project.',
    maxGrantSeconds: 3600,
    modes: Object.freeze(['allow_once', 'session']),
    scopes: Object.freeze(['project_session']),
    namespaces: Object.freeze(['code_project'])
  }),
  'network.egress': Object.freeze({
    risk: 'high',
    consequenceId: 'permission.network.egress.v1',
    consequence: 'Allow this Code Studio session to contact only the explicitly approved external hosts.',
    maxGrantSeconds: 900,
    modes: Object.freeze(['allow_once', 'session']),
    scopes: Object.freeze(['project_session']),
    namespaces: Object.freeze(['code_project'])
  }),
  'deploy.execute': Object.freeze({
    risk: 'critical',
    consequenceId: 'permission.deploy.execute.v1',
    consequence: 'Allow one deployment attempt for this owned Code Studio project and session.',
    maxGrantSeconds: 600,
    modes: Object.freeze(['allow_once']),
    scopes: Object.freeze(['project_session']),
    namespaces: Object.freeze(['code_project']),
  }),
  'deploy.rollback': Object.freeze({
    risk: 'critical',
    consequenceId: 'permission.deploy.rollback.v1',
    consequence: 'Allow one rollback attempt for this owned Code Studio project and deployment.',
    maxGrantSeconds: 600,
    modes: Object.freeze(['allow_once']),
    scopes: Object.freeze(['project_session']),
    namespaces: Object.freeze(['code_project'])
  })
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function permissionError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function text(value, code, max = 200) {
  const result = String(value == null ? '' : value).trim();
  if (!result || result.length > max) throw permissionError(code);
  return result;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function normalizeAction(value) {
  const action = String(value || '').trim().toLowerCase();
  if (!Object.hasOwn(ACTIONS, action)) throw permissionError('invalid_permission_action');
  return action;
}

function normalizeHost(value) {
  const host = text(value, 'invalid_permission_network_host', 253).toLowerCase().replace(/\.$/, '');
  if (host === '*' || !host.includes('.') || !HOST_RE.test(host)) throw permissionError('invalid_permission_network_host');
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === 'host.docker.internal' ||
    host === 'metadata.google.internal' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  ) {
    throw permissionError('blocked_permission_network_host');
  }
  return host;
}

function normalizeConstraints(action, value) {
  const constraints = value == null ? {} : value;
  if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) {
    throw permissionError('invalid_permission_constraints');
  }
  if (action !== 'network.egress') return Object.freeze({});
  if (!Array.isArray(constraints.allowedHosts) || constraints.allowedHosts.length < 1 || constraints.allowedHosts.length > 32) {
    throw permissionError('permission_network_hosts_required');
  }
  const allowedHosts = [...new Set(constraints.allowedHosts.map(normalizeHost))].sort();
  return Object.freeze({ allowedHosts: Object.freeze(allowedHosts) });
}

function normalizePermissionRequest(value, { ownerId, now = Date.now() } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw permissionError('invalid_permission_request');
  }
  const owner = text(ownerId, 'permission_owner_required', 200);
  const action = normalizeAction(value.action);
  const definition = ACTIONS[action];
  const grantMode = String(value.grantMode || '').trim().toLowerCase();
  const scopeType = String(value.scopeType || '').trim().toLowerCase();
  const resourceNamespace = String(value.resourceNamespace || '').trim().toLowerCase();
  const resourceId = text(value.resourceId, 'permission_resource_required', 200);
  const sessionId = value.sessionId == null || value.sessionId === '' ? null : text(value.sessionId, 'permission_session_invalid', 200);

  if (!definition.modes.includes(grantMode)) throw permissionError('permission_mode_action_mismatch');
  if (!definition.scopes.includes(scopeType)) throw permissionError('permission_scope_action_mismatch');
  if (!definition.namespaces.includes(resourceNamespace)) throw permissionError('permission_resource_action_mismatch');
  if ((grantMode === 'allow_once' || grantMode === 'session') && scopeType !== 'project_session') {
    throw permissionError('permission_mode_scope_mismatch');
  }
  if (grantMode === 'scoped' && scopeType !== 'project') {
    throw permissionError('permission_mode_scope_mismatch');
  }
  if (!UUID_RE.test(resourceId)) throw permissionError('invalid_permission_resource_id');
  if (scopeType === 'project_session' && !sessionId) throw permissionError('permission_session_required');
  if (scopeType === 'project' && sessionId) throw permissionError('permission_session_not_allowed');

  const expiresAtMs = Date.parse(value.expiresAt || '');
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) throw permissionError('permission_expiry_invalid');
  if (expiresAtMs - now > definition.maxGrantSeconds * 1000) throw permissionError('permission_expiry_too_long');

  const constraints = normalizeConstraints(action, value.constraints);
  return Object.freeze({
    ownerId: owner,
    action,
    grantMode,
    scopeType,
    resourceNamespace,
    resourceId: resourceId.toLowerCase(),
    sessionId,
    expiresAt: new Date(expiresAtMs).toISOString(),
    consequenceId: definition.consequenceId,
    constraints
  });
}

function confirmationFingerprint(normalized) {
  const canonical = JSON.stringify(stable({
    ownerId: normalized.ownerId,
    action: normalized.action,
    grantMode: normalized.grantMode,
    scopeType: normalized.scopeType,
    resourceNamespace: normalized.resourceNamespace,
    resourceId: normalized.resourceId,
    sessionId: normalized.sessionId,
    expiresAt: normalized.expiresAt,
    consequenceId: normalized.consequenceId,
    constraints: normalized.constraints
  }));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function buildChallenge(value, options) {
  const normalized = normalizePermissionRequest(value, options);
  const definition = ACTIONS[normalized.action];
  return Object.freeze({
    normalized,
    fingerprint: confirmationFingerprint(normalized),
    consequenceId: definition.consequenceId,
    consequence: definition.consequence,
    risk: definition.risk,
    maxGrantSeconds: definition.maxGrantSeconds
  });
}

function publicPolicy() {
  return Object.freeze({
    version: 1,
    defaultDecision: 'deny',
    wildcardGrants: false,
    actions: Object.fromEntries(Object.entries(ACTIONS).map(([action, definition]) => [action, {
      risk: definition.risk,
      consequenceId: definition.consequenceId,
      consequence: definition.consequence,
      maxGrantSeconds: definition.maxGrantSeconds,
      modes: [...definition.modes],
      scopes: [...definition.scopes],
      resourceNamespaces: [...definition.namespaces]
    }]))
  });
}

module.exports = {
  ACTIONS,
  normalizeAction,
  normalizePermissionRequest,
  confirmationFingerprint,
  buildChallenge,
  publicPolicy,
  normalizeHost
};
