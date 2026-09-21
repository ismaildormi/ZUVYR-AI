'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const config = require('../config.v1.json');
const { ensureIdentity } = require('../src/security');
const {
  pairingProofMessage,
  sessionRequestMessage,
  bodySha256
} = require('../src/pairingProtocol');
const {
  strictHttpsOrigin,
  signPairingChallenge,
  saveSession,
  loadSession,
  buildSignedSessionRequest,
  clearSession
} = require('../src/pairingSession');
const { capabilities, createAgentServer } = require('../src/server');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zuvyr-pack086-agent-'));
try {
  assert.match(config.version, /^pack-08[67]\.device-agent\.v1$/);
  assert.equal(config.execution.pairingEnabled, true);
  assert.equal(config.execution.computerControlEnabled, false);
  assert.equal(config.session.transport, 'https_only');
  assert.equal(config.session.tokenTtlSeconds, 600);
  assert.deepEqual(config.session.allowedScopes, ['heartbeat','session_status','session_rotate']);
  assert.equal(config.session.rawIpTrust, false);

  const identity = ensureIdentity(root);
  const challenge = {
    challengeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    challenge: crypto.randomBytes(32).toString('base64url'),
    ownerId: '11111111-1111-4111-8111-111111111111',
    backendDeviceId: '22222222-2222-4222-8222-222222222222',
    agentDeviceId: identity.deviceId,
    fingerprint: identity.fingerprint,
    expiresAt: new Date(Date.now() + 120000).toISOString()
  };
  const proof = signPairingChallenge(root, challenge);
  assert.equal(proof.agentDeviceId, identity.deviceId);
  assert.equal(
    crypto.verify(
      null,
      pairingProofMessage(challenge),
      crypto.createPublicKey(identity.publicKeyPem),
      Buffer.from(proof.signature, 'base64')
    ),
    true
  );

  assert.equal(strictHttpsOrigin('https://api.zuvyr.example'), 'https://api.zuvyr.example');
  assert.throws(() => strictHttpsOrigin('http://api.zuvyr.example'), { code: 'pack086_backend_origin_invalid' });
  assert.throws(() => strictHttpsOrigin('https://127.0.0.1'), { code: 'pack086_backend_origin_forbidden' });

  const token = 'zst_' + crypto.randomBytes(32).toString('base64url');
  saveSession(root, {
    backendOrigin: 'https://api.zuvyr.example',
    deviceId: challenge.backendDeviceId,
    sessionId: '33333333-3333-4333-8333-333333333333',
    token,
    tokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    scopes: ['heartbeat','session_status','session_rotate']
  });

  const stored = loadSession(root);
  assert.equal(stored.token, token);
  assert.equal(stored.counter, 0);
  assert.deepEqual(stored.scopes, ['heartbeat','session_status','session_rotate']);
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(path.join(root, 'session.json')).mode & 0o077, 0);
  }

  const body = { status: 'ok' };
  const first = buildSignedSessionRequest(root, {
    method: 'POST',
    path: '/api/device-agent/heartbeat',
    body
  });
  assert.equal(first.headers.Authorization, 'Bearer ' + token);
  assert.equal(first.headers['X-ZUVYR-Device-Counter'], '1');
  assert.equal(first.bodySha256, bodySha256(body));
  assert.equal(
    crypto.verify(
      null,
      sessionRequestMessage({
        sessionId: stored.sessionId,
        counter: 1,
        method: 'POST',
        path: '/api/device-agent/heartbeat',
        tokenHash: crypto.createHash('sha256').update(token, 'utf8').digest('hex'),
        bodySha256: first.bodySha256
      }),
      crypto.createPublicKey(identity.publicKeyPem),
      Buffer.from(first.headers['X-ZUVYR-Device-Signature'], 'base64')
    ),
    true
  );

  const second = buildSignedSessionRequest(root, {
    method: 'POST',
    path: '/api/device-agent/heartbeat',
    body
  });
  assert.equal(second.headers['X-ZUVYR-Device-Counter'], '2');

  const statusProof = buildSignedSessionRequest(root, {
    method: 'POST',
    path: '/api/device-agent/status',
    body: {}
  });
  assert.equal(statusProof.headers['X-ZUVYR-Device-Counter'], '3');
  assert.equal(
    crypto.verify(
      null,
      sessionRequestMessage({
        sessionId: stored.sessionId,
        counter: 3,
        method: 'POST',
        path: '/api/device-agent/status',
        tokenHash: crypto.createHash('sha256').update(token, 'utf8').digest('hex'),
        bodySha256: bodySha256({})
      }),
      crypto.createPublicKey(identity.publicKeyPem),
      Buffer.from(statusProof.headers['X-ZUVYR-Device-Signature'], 'base64')
    ),
    true
  );

  const localServer = createAgentServer({ stateDir: root });
  assert.equal(Object.hasOwn(localServer, 'token'), false);
  localServer.server.close();

  assert.throws(
    () => saveSession(root, {
      backendOrigin: 'https://api.zuvyr.example',
      deviceId: 'not-a-uuid',
      sessionId: '33333333-3333-4333-8333-333333333333',
      token,
      tokenExpiresAt: new Date(Date.now() + 10000).toISOString(),
      scopes: ['heartbeat']
    }),
    { code: 'pack086_session_identity_invalid' }
  );

  const caps = capabilities(true, { env: {} });
  assert.equal(caps.paired, true);
  assert.equal(caps.pairingEnabled, true);
  assert.equal(caps.executionEnabled, false);
  assert.equal(caps.executionEngineBuilt, true);
  for (const enabled of Object.values(caps.actions)) assert.equal(typeof enabled, 'boolean');

  assert.equal(clearSession(root).cleared, true);
  assert.equal(fs.existsSync(path.join(root, 'session.json')), false);

  console.log('PASS: PACK086 agent signs pairing proof with its PACK085 Ed25519 identity');
  console.log('PASS: PACK086 stores 10-minute bounded-scope session state privately and emits monotonic signed proofs');
  console.log('PASS: PACK086 agent requires HTTPS origin and rejects raw IP/local backend origins');
  console.log('PASS: PACK087 executor cannot self-authorize; backend permission remains required');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
