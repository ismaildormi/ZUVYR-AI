'use strict';

const assert = require('assert');
const fs = require('fs');
const {
  buildChallenge,
  normalizeHost,
  publicPolicy
} = require('./lib/permissionCenterPolicy');
const {
  guardCodeActionBeforeExecution,
  guardNetworkEgressBeforeExecution
} = require('./lib/codePermissionGuard');

const ownerId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const now = Date.parse('2026-09-14T19:00:00.000Z');

assert.throws(() => buildChallenge({
  action: 'project.read',
  grantMode: 'session',
  scopeType: 'project',
  resourceNamespace: 'code_project',
  resourceId: projectId,
  expiresAt: '2026-09-14T19:05:00.000Z'
}, { ownerId, now }), { code: 'permission_mode_scope_mismatch' });

assert.throws(() => buildChallenge({
  action: 'preview.view',
  grantMode: 'scoped',
  scopeType: 'project_session',
  resourceNamespace: 'code_project',
  resourceId: projectId,
  sessionId: 's1',
  expiresAt: '2026-09-14T19:05:00.000Z'
}, { ownerId, now }), { code: 'permission_mode_action_mismatch' });

assert.throws(() => normalizeHost('internal-service'), { code: 'invalid_permission_network_host' });
assert.throws(() => normalizeHost('10.0.0.1'), { code: 'blocked_permission_network_host' });
assert.equal(normalizeHost('API.EXAMPLE.COM'), 'api.example.com');

const policy = publicPolicy();
assert.deepEqual(policy.actions['preview.view'].modes, ['allow_once', 'session']);

(async () => {
  const replayApi = {
    consume: async () => ({ success: true, allowed: true, replayed: true })
  };
  await assert.rejects(
    guardCodeActionBeforeExecution({
      permissionApi: replayApi,
      ownerId,
      operation: 'run',
      projectId,
      sessionId: 's1',
      requestId: 'r1'
    }),
    { code: 'permission_request_replayed' }
  );

  const networkApi = {
    consume: async () => ({
      success: true,
      allowed: true,
      replayed: false,
      constraints: { allowedHosts: ['api.example.com'] }
    })
  };
  const network = await guardNetworkEgressBeforeExecution({
    permissionApi: networkApi,
    ownerId,
    projectId,
    sessionId: 's1',
    requestId: 'net-1',
    targetHost: 'API.EXAMPLE.COM'
  });
  assert.equal(network.targetHost, 'api.example.com');

  await assert.rejects(
    guardNetworkEgressBeforeExecution({
      permissionApi: networkApi,
      ownerId,
      projectId,
      sessionId: 's1',
      requestId: 'net-2',
      targetHost: 'other.example.com'
    }),
    { code: 'permission_network_host_not_granted' }
  );

  const sql = fs.readFileSync('backend/62_pack047_permission_replay_scope_hardening.sql', 'utf8');
  for (const marker of [
    "'allowed',false",
    "'permission_request_replayed'",
    "'permission_mode_scope_mismatch'",
    "'blocked_permission_network_host'",
    "'constraints',v_grant.constraints"
  ]) assert(sql.includes(marker));

  console.log('PASS: Pack047 duplicate request replay is denied before execution');
  console.log('PASS: grant mode and scope semantics are coherent');
  console.log('PASS: private/internal network hosts are denied and approved hosts stay exact');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
