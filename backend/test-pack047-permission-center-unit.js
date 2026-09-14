'use strict';

const assert = require('assert');
const {
  ACTIONS,
  buildChallenge,
  normalizeHost,
  publicPolicy
} = require('./lib/permissionCenterPolicy');
const {
  actionForRuntimeOperation
} = require('./lib/codePermissionGuard');

const ownerId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const now = Date.parse('2026-09-14T17:00:00.000Z');

assert.deepEqual(Object.keys(ACTIONS).sort(), [
  'dependency.install',
  'deploy.execute',
  'network.egress',
  'preview.open',
  'preview.view',
  'project.read',
  'project.write',
  'runtime.execute'
]);

const runtime = buildChallenge({
  action: 'runtime.execute',
  grantMode: 'session',
  scopeType: 'project_session',
  resourceNamespace: 'code_project',
  resourceId: projectId,
  sessionId: 'session-1',
  expiresAt: '2026-09-14T17:30:00.000Z'
}, { ownerId, now });
assert.equal(runtime.consequenceId, 'permission.runtime.execute.v1');
assert.match(runtime.fingerprint, /^[0-9a-f]{64}$/);

assert.throws(() => buildChallenge({
  action: 'deploy.execute',
  grantMode: 'session',
  scopeType: 'project_session',
  resourceNamespace: 'code_project',
  resourceId: projectId,
  sessionId: 'session-1',
  expiresAt: '2026-09-14T17:05:00.000Z'
}, { ownerId, now }), { code: 'permission_mode_action_mismatch' });

assert.throws(() => buildChallenge({
  action: 'runtime.execute',
  grantMode: 'session',
  scopeType: 'project',
  resourceNamespace: 'code_project',
  resourceId: projectId,
  expiresAt: '2026-09-14T17:05:00.000Z'
}, { ownerId, now }), { code: 'permission_scope_action_mismatch' });

const net = buildChallenge({
  action: 'network.egress',
  grantMode: 'allow_once',
  scopeType: 'project_session',
  resourceNamespace: 'code_project',
  resourceId: projectId,
  sessionId: 'session-2',
  expiresAt: '2026-09-14T17:10:00.000Z',
  constraints: { allowedHosts: ['api.example.com', 'API.EXAMPLE.COM'] }
}, { ownerId, now });
assert.deepEqual(net.normalized.constraints.allowedHosts, ['api.example.com']);
assert.throws(() => normalizeHost('127.0.0.1'), { code: 'blocked_permission_network_host' });
assert.throws(() => normalizeHost('metadata.google.internal'), { code: 'blocked_permission_network_host' });
assert.throws(() => normalizeHost('*'), { code: 'invalid_permission_network_host' });

assert.equal(actionForRuntimeOperation('dependencies'), 'dependency.install');
assert.equal(actionForRuntimeOperation('run'), 'runtime.execute');
assert.equal(actionForRuntimeOperation('deploy'), 'deploy.execute');

const policy = publicPolicy();
assert.equal(policy.defaultDecision, 'deny');
assert.equal(policy.wildcardGrants, false);
assert.deepEqual(policy.actions['deploy.execute'].modes, ['allow_once']);
assert.deepEqual(policy.actions['runtime.execute'].scopes, ['project_session']);

console.log('PASS: Pack047 permission policy is deny-by-default with exact action classes');
console.log('PASS: Code runtime/preview/network/deploy grants are owner/project/session scoped');
console.log('PASS: deploy is allow-once; internal/private network hosts are blocked');
