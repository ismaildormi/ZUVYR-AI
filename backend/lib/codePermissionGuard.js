'use strict';

const { getDefaultPermissionCenterStore } = require('./permissionCenterRepository');
const { normalizeHost } = require('./permissionCenterPolicy');

function guardError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function required(value, code, max = 200) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text.length > max) throw guardError(code);
  return text;
}

function actionForRuntimeOperation(operation) {
  const normalized = String(operation || '').trim().toLowerCase();
  if (normalized === 'dependencies') return 'dependency.install';
  if (['terminal', 'run', 'build', 'test'].includes(normalized)) return 'runtime.execute';
  if (normalized === 'deploy') return 'deploy.execute';
  throw guardError('permission_unknown_code_operation');
}

async function consumeCodePermission({
  permissionApi = null,
  ownerId,
  action,
  projectId,
  sessionId,
  requestId
}) {
  const permissions = permissionApi || getDefaultPermissionCenterStore();
  const result = await permissions.consume({
    ownerId: required(ownerId, 'permission_owner_required'),
    action: required(action, 'invalid_permission_action', 120),
    resourceNamespace: 'code_project',
    resourceId: required(projectId, 'permission_code_project_required'),
    sessionId: required(sessionId, 'permission_session_required'),
    requestId: required(requestId, 'permission_request_id_required')
  });
  if (result?.replayed === true) {
    throw guardError('permission_request_replayed');
  }
  if (!result || result.allowed !== true) {
    throw guardError(result?.error || 'permission_required');
  }
  return result;
}

async function guardCodeActionBeforeExecution(input) {
  return consumeCodePermission({
    ...input,
    action: actionForRuntimeOperation(input.operation)
  });
}

async function guardPreviewBeforeExecution(input) {
  const action = input.openInteractive === true ? 'preview.open' : 'preview.view';
  return consumeCodePermission({ ...input, action });
}

async function guardNetworkEgressBeforeExecution(input) {
  const targetHost = normalizeHost(input.targetHost);
  const result = await consumeCodePermission({ ...input, action: 'network.egress' });
  const allowedHosts = Array.isArray(result?.constraints?.allowedHosts)
    ? result.constraints.allowedHosts.map(normalizeHost)
    : [];
  if (!allowedHosts.includes(targetHost)) {
    throw guardError('permission_network_host_not_granted');
  }
  return Object.freeze({ ...result, targetHost });
}

async function guardDeploymentBeforeExecution(input) {
  return consumeCodePermission({
    ...input,
    action: 'deploy.execute'
  });
}

async function guardDeploymentRollbackBeforeExecution(input) {
  return consumeCodePermission({
    ...input,
    action: 'deploy.rollback'
  });
}

module.exports = {
  actionForRuntimeOperation,
  guardCodeActionBeforeExecution,
  guardPreviewBeforeExecution,
  guardNetworkEgressBeforeExecution,
  guardDeploymentBeforeExecution,
  guardDeploymentRollbackBeforeExecution
};
