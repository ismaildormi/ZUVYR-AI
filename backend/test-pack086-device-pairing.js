'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const {
  pairingProofMessage,
  sessionRequestMessage,
  bodySha256,
  normalizeEd25519PublicKey
} = require('./lib/ipPairingProtocol');
const { hashSecret, createIpPairingService, SESSION_TTL_MS } = require('./lib/ipPairingService');
const { createDeviceSessionRouter } = require('./lib/deviceSessionRoutes');
const agentProtocol = require('../device-agent/src/pairingProtocol');

function e(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

class FakeRepository {
  constructor() {
    this.deviceId = '22222222-2222-4222-8222-222222222222';
    this.challengeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    this.sessionId = '33333333-3333-4333-8333-333333333333';
    this.device = null;
    this.challenge = null;
    this.session = null;
  }

  async startPairing(input) {
    this.device = {
      id: this.deviceId,
      owner_id: input.ownerId,
      agent_device_id: input.agentDeviceId,
      status: 'pending_pairing',
      public_key_fingerprint: input.fingerprint,
      public_key_pem: input.publicKeyPem,
      revoked_at: null
    };
    this.challenge = {
      id: this.challengeId,
      owner_id: input.ownerId,
      device_id: this.deviceId,
      challenge_hash: input.challengeHash,
      state: 'pending',
      expires_at: input.expiresAt
    };
    return {
      success: true,
      device_id: this.deviceId,
      challenge_id: this.challengeId,
      expires_at: input.expiresAt
    };
  }

  async getPairingContext({ ownerId, challengeId }) {
    if (!this.challenge || challengeId !== this.challenge.id || ownerId !== this.challenge.owner_id) {
      throw e('pack086_challenge_not_found');
    }
    return { challenge: { ...this.challenge }, device: { ...this.device } };
  }

  async completePairing(input) {
    if (this.challenge.state !== 'pending') throw e('pack086_challenge_not_pending');
    this.challenge.state = 'consumed';
    this.device.status = 'paired';
    this.session = {
      id: this.sessionId,
      owner_id: input.ownerId,
      device_id: this.deviceId,
      state: 'ready',
      execution_enabled: false,
      token_hash: input.tokenHash,
      token_expires_at: input.tokenExpiresAt,
      revoked_at: null,
      last_client_counter: 0,
      permission_scopes: ['heartbeat','session_status','session_rotate']
    };
    return {
      success: true,
      device_id: this.deviceId,
      session_id: this.sessionId,
      token_expires_at: input.tokenExpiresAt,
      scopes: ['heartbeat','session_status','session_rotate'],
      execution_enabled: false
    };
  }

  async rotateSessionToken(input) {
    if (!this.session || this.session.id !== input.sessionId || this.session.owner_id !== input.ownerId) {
      throw e('pack086_session_not_found');
    }
    if (this.device.status !== 'paired') throw e('pack086_device_not_paired');
    if (input.expectedTokenHash !== this.session.token_hash) throw e('pack086_token_invalid');
    this.session.token_hash = input.tokenHash;
    this.session.token_expires_at = input.tokenExpiresAt;
    this.session.last_client_counter = 0;
    return {
      success: true,
      device_id: this.deviceId,
      session_id: this.sessionId,
      token_expires_at: input.tokenExpiresAt,
      scopes: ['heartbeat','session_status','session_rotate']
    };
  }

  async revokeDevice({ ownerId, deviceId }) {
    if (!this.device || this.device.owner_id !== ownerId || this.device.id !== deviceId) {
      throw e('pack086_device_not_found');
    }
    this.device.status = 'revoked';
    this.device.revoked_at = new Date().toISOString();
    if (this.session) {
      this.session.revoked_at = new Date().toISOString();
      this.session.state = 'stopped';
      this.session.token_hash = null;
    }
    return {
      success: true,
      device_id: deviceId,
      sessions_revoked: this.session ? 1 : 0,
      execution_enabled: false
    };
  }

  async getSessionContext({ sessionId }) {
    if (!this.session || this.session.id !== sessionId) throw e('pack086_session_not_found');
    return { session: { ...this.session }, device: { ...this.device } };
  }

  async advanceSessionCounter({ sessionId, tokenHash, counter }) {
    if (!this.session || this.session.id !== sessionId) throw e('pack086_session_not_found');
    if (this.session.token_hash !== tokenHash) throw e('pack086_token_invalid');
    if (counter <= this.session.last_client_counter) throw e('pack086_counter_replay');
    this.session.last_client_counter = counter;
    return {
      success: true,
      owner_id: this.session.owner_id,
      device_id: this.deviceId,
      session_id: this.sessionId,
      counter,
      token_expires_at: this.session.token_expires_at,
      scopes: ['heartbeat','session_status','session_rotate'],
      heartbeat_at: new Date().toISOString(),
      execution_enabled: false
    };
  }
}

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '86_pack086_device_pairing_secure_session.sql'), 'utf8');
  const roxRoutes = fs.readFileSync(path.join(__dirname, 'lib', 'roxIpRoutes.js'), 'utf8');
  const deviceRoutes = fs.readFileSync(path.join(__dirname, 'lib', 'deviceSessionRoutes.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

  assert.equal(SESSION_TTL_MS, 10 * 60 * 1000);
  assert(sql.includes("array['heartbeat','session_status','session_rotate']::text[]"));
  assert(sql.includes("interval '15 minutes'"));
  assert.equal(sql.includes("interval '1 hour'"), false);
  assert.equal(sql.includes('p_expected_token_hash text'), true);
  assert(sql.includes("v_session.token_hash <> lower(btrim(p_expected_token_hash))"));
  assert.equal(sql.includes("'session_heartbeat'"), false, 'heartbeat must not create one audit row per ping');

  for (const marker of [
    'ip_pairing_challenges',
    'agent_device_id uuid',
    'token_hash text',
    'last_client_counter bigint',
    'execution_enabled boolean not null default false',
    'start_ip_pairing_pack086',
    'complete_ip_pairing_pack086',
    'advance_ip_session_counter_pack086',
    'revoke_ip_device_pack086',
    'revoke all on table public.ip_pairing_challenges from public,anon,authenticated',
    'grant execute on function public.advance_ip_session_counter_pack086'
  ]) assert(sql.includes(marker), marker);

  assert(roxRoutes.includes("router.post('/pairing/start'"));
  assert(roxRoutes.includes("router.post('/pairing/complete'"));
  assert(roxRoutes.includes("router.post('/devices/:deviceId/revoke'"));
  assert(roxRoutes.includes("router.post('/sessions/:sessionId/token/rotate'"));
  assert(deviceRoutes.includes("router.post('/heartbeat'"));
  assert(deviceRoutes.includes("router.post('/status'"));
  assert(deviceRoutes.includes("router.post('/rotate-token'"));
  assert(deviceRoutes.includes("pack086_session_scope_forbidden"));
  assert(server.includes("'/api/device-agent'"));
  assert(server.includes("createRoxIpRouter({ db: supabaseAdmin })"));

  const ownerId = '11111111-1111-4111-8111-111111111111';
  const agentDeviceId = '44444444-4444-4444-8444-444444444444';
  const pair = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const normalized = normalizeEd25519PublicKey(publicKeyPem);

  const parityPairing = {
    challengeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    challenge: 'A'.repeat(43),
    ownerId,
    backendDeviceId: '22222222-2222-4222-8222-222222222222',
    agentDeviceId,
    fingerprint: normalized.fingerprint,
    expiresAt: '2026-09-20T20:05:00.000Z'
  };
  assert.deepEqual(
    pairingProofMessage(parityPairing),
    agentProtocol.pairingProofMessage(parityPairing)
  );
  const parityBody = { nested: { b: 2, a: 1 }, ok: true };
  assert.equal(bodySha256(parityBody), agentProtocol.bodySha256(parityBody));
  const parityRequest = {
    sessionId: '33333333-3333-4333-8333-333333333333',
    counter: 7,
    method: 'POST',
    path: '/api/device-agent/heartbeat',
    bodySha256: bodySha256(parityBody)
  };
  assert.deepEqual(
    sessionRequestMessage(parityRequest),
    agentProtocol.sessionRequestMessage(parityRequest)
  );
  const repo = new FakeRepository();
  const fixedNow = new Date('2026-09-20T20:00:00.000Z');
  const service = createIpPairingService({
    repository: repo,
    clock: () => new Date(fixedNow),
    randomBytes: crypto.randomBytes
  });

  const challenge = await service.startPairing({
    ownerId,
    agentDeviceId,
    displayName: 'Test device',
    publicKeyPem
  });
  assert.equal(challenge.agentDeviceId, agentDeviceId);
  assert.equal(challenge.backendDeviceId, repo.deviceId);
  assert.equal(challenge.executionEnabled, false);
  assert.equal(repo.challenge.challenge_hash, hashSecret(challenge.challenge));
  assert.equal(repo.device.public_key_fingerprint, normalized.fingerprint);

  const signature = crypto.sign(null, pairingProofMessage(challenge), pair.privateKey).toString('base64');
  const paired = await service.completePairing({
    ownerId,
    challengeId: challenge.challengeId,
    challenge: challenge.challenge,
    signature
  });
  assert.equal(paired.sessionId, repo.sessionId);
  assert.deepEqual(paired.scopes, ['heartbeat','session_status','session_rotate']);
  assert.equal(paired.executionEnabled, false);
  assert.notEqual(repo.session.token_hash, paired.token);
  assert.equal(repo.session.token_hash, hashSecret(paired.token));

  const body = { status: 'ready' };
  const digest = bodySha256(body);
  const heartbeatMessage = sessionRequestMessage({
    sessionId: paired.sessionId,
    counter: 1,
    method: 'POST',
    path: '/api/device-agent/heartbeat',
    bodySha256: digest
  });
  const heartbeatSignature = crypto.sign(null, heartbeatMessage, pair.privateKey).toString('base64');
  const heartbeat = await service.authenticateSessionRequest({
    sessionId: paired.sessionId,
    token: paired.token,
    counter: 1,
    signature: heartbeatSignature,
    method: 'POST',
    path: '/api/device-agent/heartbeat',
    body
  });
  assert.equal(heartbeat.deviceId, repo.deviceId);
  assert.equal(heartbeat.counter, 1);
  assert.equal(heartbeat.executionEnabled, false);

  await assert.rejects(
    () => service.authenticateSessionRequest({
      sessionId: paired.sessionId,
      token: paired.token,
      counter: 1,
      signature: heartbeatSignature,
      method: 'POST',
      path: '/api/device-agent/heartbeat',
      body
    }),
    { code: 'pack086_counter_replay' }
  );

  await assert.rejects(
    () => service.authenticateSessionRequest({
      sessionId: paired.sessionId,
      token: 'zst_' + crypto.randomBytes(32).toString('base64url'),
      counter: 2,
      signature: heartbeatSignature,
      method: 'POST',
      path: '/api/device-agent/heartbeat',
      body
    }),
    { code: 'pack086_token_invalid' }
  );

  const wrong = crypto.generateKeyPairSync('ed25519');
  const badSignature = crypto.sign(null, sessionRequestMessage({
    sessionId: paired.sessionId,
    counter: 2,
    method: 'POST',
    path: '/api/device-agent/heartbeat',
    bodySha256: digest
  }), wrong.privateKey).toString('base64');

  await assert.rejects(
    () => service.authenticateSessionRequest({
      sessionId: paired.sessionId,
      token: paired.token,
      counter: 2,
      signature: badSignature,
      method: 'POST',
      path: '/api/device-agent/heartbeat',
      body
    }),
    { code: 'pack086_session_signature_invalid' }
  );

  const preRotateHash = repo.session.token_hash;
  const rotated = await service.rotateSessionToken({
    ownerId,
    sessionId: paired.sessionId,
    expectedTokenHash: preRotateHash
  });
  assert.notEqual(rotated.token, paired.token);
  assert.deepEqual(rotated.scopes, ['heartbeat','session_status','session_rotate']);
  assert.equal(repo.session.last_client_counter, 0);
  await assert.rejects(
    () => service.rotateSessionToken({
      ownerId,
      sessionId: paired.sessionId,
      expectedTokenHash: preRotateHash
    }),
    { code: 'pack086_token_invalid' }
  );

  await assert.rejects(
    () => service.authenticateSessionRequest({
      sessionId: paired.sessionId,
      token: paired.token,
      counter: 1,
      signature: heartbeatSignature,
      method: 'POST',
      path: '/api/device-agent/heartbeat',
      body
    }),
    { code: 'pack086_token_invalid' }
  );

  const revoked = await service.revokeDevice({ ownerId, deviceId: repo.deviceId });
  assert.equal(revoked.sessions_revoked, 1);

  await assert.rejects(
    () => service.authenticateSessionRequest({
      sessionId: paired.sessionId,
      token: rotated.token,
      counter: 1,
      signature: heartbeatSignature,
      method: 'POST',
      path: '/api/device-agent/heartbeat',
      body
    }),
    { code: 'pack086_session_revoked' }
  );

  const app = express();
  app.use(express.json());
  let insecureReachedAuth = false;
  app.use('/api/device-agent', createDeviceSessionRouter({
    env: { NODE_ENV: 'production' },
    service: {
      authenticateSessionRequest: async () => {
        insecureReachedAuth = true;
        throw e('unexpected_auth_call');
      }
    }
  }));
  const listener = await new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
  try {
    const address = listener.address();
    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: address.port,
        method: 'POST',
        path: '/api/device-agent/heartbeat',
        headers: { 'Content-Type': 'application/json' }
      }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
          });
        });
      });
      req.on('error', reject);
      req.end('{}');
    });
    assert.equal(response.status, 426);
    assert.equal(response.body.code, 'pack086_https_required');
    assert.equal(insecureReachedAuth, false);
  } finally {
    await new Promise(resolve => listener.close(resolve));
  }

  console.log('PASS: PACK086 backend/device canonical signature protocol remains byte-identical');
  console.log('PASS: PACK086 pairing challenge is hash-only at rest and Ed25519 proof-of-possession bound');
  console.log('PASS: PACK086 session token is hash-only, 10-minute issued, scope-bounded and CAS-rotated');
  console.log('PASS: PACK086 wrong token, wrong signature, replayed counter and revoked session are rejected');
  console.log('PASS: PACK086 revocation invalidates device sessions while execution_enabled remains false');
  console.log('LIVE DEVICE / COMPUTER-CONTROL / PAYMENT / PROVIDER CALLS: NONE');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
