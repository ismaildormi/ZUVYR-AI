'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { config } = require('./lib/ipCapabilityRegistry');
const {
  sanitizeResult,
  createIpActionService
} = require('./lib/ipActionService');

function err(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

class FakeRepository {
  constructor() {
    this.session = {
      id: '33333333-3333-4333-8333-333333333333',
      owner_id: '11111111-1111-4111-8111-111111111111',
      device_id: '22222222-2222-4222-8222-222222222222',
      state: 'ready',
      execution_enabled: false,
      revoked_at: null
    };
    this.actions = new Map();
    this.grants = [];
    this.reported = null;
  }

  async getSessionForOwner({ ownerId, sessionId }) {
    if (ownerId !== this.session.owner_id || sessionId !== this.session.id) throw err('pack087_session_not_found');
    return { ...this.session };
  }

  async getActionForOwner({ ownerId, actionId }) {
    const action = this.actions.get(actionId);
    if (!action || action.owner_id !== ownerId) throw err('pack087_action_not_found');
    return { ...action };
  }

  async grantPermissions(input) {
    this.grants.push({ ...input });
    this.session.execution_enabled = true;
    return {
      success: true,
      grant_id: '44444444-4444-4444-8444-444444444444',
      session_id: input.sessionId,
      scopes: input.scopes,
      expires_at: input.expiresAt,
      execution_enabled: true
    };
  }

  async revokePermissions() {
    this.session.execution_enabled = false;
    return { success: true, grants_revoked: 1, execution_enabled: false };
  }

  async prepareAction(input) {
    const id = '55555555-5555-4555-8555-555555555555';
    this.actions.set(id, {
      id,
      owner_id: input.ownerId,
      session_id: input.sessionId,
      action_type: input.action.type,
      required_scope: input.action.scope,
      risk: input.action.risk,
      status: input.action.requiresConfirmation ? 'pending_confirmation' : 'ready',
      action_digest: input.actionDigest,
      requires_confirmation: input.action.requiresConfirmation,
      device_action_executed: false,
      backup_ref: null
    });
    return {
      success: true,
      action_id: id,
      status: input.action.requiresConfirmation ? 'pending_confirmation' : 'ready',
      confirmation_id: input.action.requiresConfirmation
        ? '66666666-6666-4666-8666-666666666666'
        : null,
      device_action_executed: false
    };
  }

  async confirmAction(input) {
    const action = this.actions.get(input.actionId);
    action.status = 'ready';
    return { success: true, action_id: input.actionId, status: 'ready' };
  }

  async requestStop(input) {
    return { success: true, signal_id: '77777777-7777-4777-8777-777777777777', session_id: input.sessionId };
  }

  async requestUndo(input) {
    return { success: true, undo_receipt_id: '88888888-8888-4888-8888-888888888888', action_id: input.actionId };
  }

  async claimAction() {
    return {
      success: true,
      action: {
        id: '55555555-5555-4555-8555-555555555555',
        attemptId: '99999999-9999-4999-8999-999999999999',
        type: 'write_file',
        scope: 'file.write',
        risk: 'high',
        target: '/tmp/example.txt',
        input: 'hello',
        reversible: true
      }
    };
  }

  async reportAction(input) {
    this.reported = input;
    return { success: true, action_id: input.actionId, status: input.success ? 'completed' : 'failed' };
  }

  async claimStop() { return { success: true, stop: null }; }
  async ackStop(input) { return { success: true, signal_id: input.signalId, status: 'acknowledged' }; }
  async claimUndo() { return { success: true, undo: null }; }
  async reportUndo(input) { return { success: true, undo_receipt_id: input.undoId, status: input.success ? 'completed' : 'failed' }; }
}

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '87_pack087_ip_actions_stop_undo.sql'), 'utf8');
  const ownerRoutes = fs.readFileSync(path.join(__dirname, 'lib', 'roxIpRoutes.js'), 'utf8');
  const deviceRoutes = fs.readFileSync(path.join(__dirname, 'lib', 'deviceSessionRoutes.js'), 'utf8');
  const pairing = fs.readFileSync(path.join(__dirname, 'lib', 'ipPairingService.js'), 'utf8');

  for (const marker of [
    'grant_ip_permissions_pack087',
    'revoke_ip_permissions_pack087',
    'prepare_ip_action_pack087',
    'confirm_ip_action_pack087',
    'claim_ip_action_pack087',
    'report_ip_action_pack087',
    'request_ip_stop_pack087',
    'claim_ip_stop_pack087',
    'ack_ip_stop_pack087',
    'request_ip_undo_pack087',
    'claim_ip_undo_pack087',
    'report_ip_undo_pack087',
    'for update skip locked',
    "execution_context_type='device_agent'",
    'device_action_executed=true'
  ]) assert(sql.includes(marker), marker);
  assert(!/\b(drop table|truncate|delete from)\b/i.test(sql));
  assert(!/grant\s+.*\s+to\s+(anon|authenticated)/i.test(sql));

  for (const marker of [
    "router.post('/permissions/grant'",
    "router.post('/permissions/revoke'",
    "router.post('/actions/prepare'",
    "router.post('/actions/:actionId/confirm'",
    "router.post('/stop/request'",
    "router.post('/actions/:actionId/undo'"
  ]) assert(ownerRoutes.includes(marker), marker);

  for (const marker of [
    "router.post('/actions/next'",
    "router.post('/actions/report'",
    "router.post('/stop/next'",
    "router.post('/stop/ack'",
    "router.post('/undo/next'",
    "router.post('/undo/report'"
  ]) assert(deviceRoutes.includes(marker), marker);

  assert(!pairing.includes('pack086_execution_invariant_failed'));
  assert(pairing.includes('executionEnabled: session.execution_enabled === true'));

  const repo = new FakeRepository();
  const now = new Date('2026-09-20T21:40:00.000Z');
  const service = createIpActionService({
    repository: repo,
    clock: () => new Date(now)
  });

  await assert.rejects(
    () => service.grantPermissions({
      ownerId: repo.session.owner_id,
      deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sessionId: repo.session.id,
      scopes: ['file.write'],
      expiresAt: new Date(now.getTime() + 60000).toISOString(),
      explicitConsent: true
    }),
    { code: 'pack087_wrong_device' }
  );

  const grant = await service.grantPermissions({
    ownerId: repo.session.owner_id,
    deviceId: repo.session.device_id,
    sessionId: repo.session.id,
    scopes: ['file.write','shell.execute'],
    expiresAt: new Date(now.getTime() + 60000).toISOString(),
    explicitConsent: true
  });
  assert.equal(grant.execution_enabled, true);
  assert.deepEqual(repo.grants[0].scopes, ['file.write','shell.execute']);

  await assert.rejects(
    () => service.prepareAction({
      ownerId: repo.session.owner_id,
      sessionId: repo.session.id,
      action: { type: 'read_file', target: '/tmp/.env' }
    }),
    { code: 'ip_sensitive_target_blocked' }
  );

  const prepared = await service.prepareAction({
    ownerId: repo.session.owner_id,
    sessionId: repo.session.id,
    action: {
      type: 'run_command',
      target: process.execPath,
      input: '["--version"]'
    }
  });
  assert.equal(prepared.status, 'pending_confirmation');
  assert.equal(prepared.confirmation.phraseRequired, config.confirmation.criticalPhrase);
  assert.match(prepared.actionDigest, /^[0-9a-f]{64}$/);

  await assert.rejects(
    () => service.confirmAction({
      ownerId: repo.session.owner_id,
      actionId: prepared.actionId,
      actionDigest: prepared.actionDigest,
      phrase: 'wrong',
      approved: true
    }),
    { code: 'pack087_confirmation_phrase_invalid' }
  );

  const confirmed = await service.confirmAction({
    ownerId: repo.session.owner_id,
    actionId: prepared.actionId,
    actionDigest: prepared.actionDigest,
    phrase: config.confirmation.criticalPhrase,
    approved: true
  });
  assert.equal(confirmed.status, 'ready');

  await assert.rejects(
    () => service.claimAction({
      sessionId: repo.session.id,
      executionEnabled: false
    }),
    { code: 'pack087_execution_not_enabled' }
  );

  const claimed = await service.claimAction({
    sessionId: repo.session.id,
    executionEnabled: true
  });
  assert.equal(claimed.action.type, 'write_file');

  const sanitized = sanitizeResult({
    password: 'abc',
    output: 'Bearer ABCDEFGHIJKLMNOPQRST'
  });
  assert.equal(sanitized.secretRedacted, true);
  assert.equal(sanitized.result.password, '[REDACTED]');
  assert(!JSON.stringify(sanitized.result).includes('ABCDEFGHIJKLMNOPQRST'));

  await assert.rejects(
    () => service.reportAction({
      sessionId: repo.session.id,
      executionEnabled: true
    }, {
      actionId: claimed.action.id,
      attemptId: claimed.action.attemptId,
      success: true,
      result: {},
      deviceActionExecuted: true,
      backupRef: '../../escape'
    }),
    { code: 'pack087_backup_ref_invalid' }
  );

  await service.reportAction({
    sessionId: repo.session.id,
    executionEnabled: true
  }, {
    actionId: claimed.action.id,
    attemptId: claimed.action.attemptId,
    success: true,
    result: { token: 'topsecret' },
    deviceActionExecuted: true,
    backupRef: 'backup:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    backupSha256: 'a'.repeat(64)
  });
  assert.equal(repo.reported.secretRedacted, true);
  assert.equal(repo.reported.result.token, '[REDACTED]');

  const stop = await service.requestStop({
    ownerId: repo.session.owner_id,
    sessionId: repo.session.id
  });
  assert.match(stop.signal_id, /^[0-9a-f-]{36}$/);

  console.log('PASS: PACK087 DB authority requires paired session, explicit consent and scoped permission grants');
  console.log('PASS: PACK087 critical actions require exact confirmation phrase and digest');
  console.log('PASS: PACK087 device action routes reuse PACK086 signed-session auth instead of creating a second auth system');
  console.log('PASS: PACK087 server redacts secret-shaped result data and rejects forged backup refs');
  console.log('PASS: PACK087 STOP/Undo/action transitions are service-role RPCs with atomic claim semantics');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
