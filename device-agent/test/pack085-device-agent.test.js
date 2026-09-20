'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const config = require('../config.v1.json');
const {
  ensureIdentity,
  publicIdentity,
  ensureAuthToken,
  secureTokenEqual
} = require('../src/security');
const { installUser, uninstallUser, safeStateDir, assertLeastPrivilege } = require('../src/lifecycle');
const { verifySignedManifest, verifyArtifact } = require('../src/updateVerifier');
const { startSecureAgent } = require('../src/server');
const { assertIpExecutionAvailable, publicInventory } = require('../../backend/lib/ipCapabilityRegistry');

function request({ port, method = 'GET', route, token, origin, host } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Host: host || ('127.0.0.1:' + port) };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (origin) headers.Origin = origin;
    const req = http.request({ host: '127.0.0.1', port, path: route, method, headers, timeout: 3000 }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.once('end', () => {
        let body = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.once('error', reject);
    req.once('timeout', () => req.destroy(new Error('test_request_timeout')));
    req.end();
  });
}

(async () => {
  assert.equal(config.version, 'pack-085.device-agent.v1');
  assert.equal(config.bind.host, '127.0.0.1');
  assert.equal(config.bind.browserOriginsAllowed, false);
  assert.equal(config.install.scope, 'user');
  assert.equal(config.install.requiresAdmin, false);
  assert.equal(config.execution.rawIpTrust, false);
  for (const value of Object.values(config.execution)) assert.equal(value, false);
  assert.equal(config.update.enabled, false);
  assert.equal(config.update.releasePublicKeyPem, null);
  assert.deepEqual(config.update.allowedHosts, []);

  assert.throws(() => assertIpExecutionAvailable(), { code: 'roxip_execution_disabled' });
  const ip = publicInventory();
  assert.equal(ip.execution.enabled, false);
  for (const capabilityName of [
    'device_connection',
    'screen_capture',
    'pointer_control',
    'keyboard_control',
    'application_control',
    'filesystem_control',
    'shell_control'
  ]) {
    assert.equal(ip.capabilities[capabilityName].enabled, false, capabilityName);
  }
  assert.equal(ip.capabilities.planning.enabled, true);
  assert.equal(ip.capabilities.permission_validation.enabled, true);
  assert.equal(ip.capabilities.audit_contract.enabled, true);
  assert.equal(ip.capabilities.stop_contract.enabled, true);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zuvyr-pack085-'));
  try {
    assert.equal(assertLeastPrivilege({ platform: 'linux', effectiveUid: 1000 }), true);
    assert.throws(
      () => assertLeastPrivilege({ platform: 'linux', effectiveUid: 0 }),
      { code: 'device_agent_elevation_forbidden' }
    );
    assert.equal(
      safeStateDir(path.join(root, 'inside-home'), { home: root }),
      path.join(root, 'inside-home')
    );
    assert.throws(
      () => safeStateDir(path.resolve(root, '..', 'outside-home'), { home: root }),
      { code: 'device_agent_state_dir_outside_user_home' }
    );
    const identityDir = path.join(root, 'identity');
    const first = ensureIdentity(identityDir);
    const second = ensureIdentity(identityDir);
    assert.equal(first.deviceId, second.deviceId);
    assert.equal(first.fingerprint, second.fingerprint);
    const exposed = publicIdentity(first);
    assert.equal(Object.hasOwn(exposed, 'privateKeyPem'), false);
    assert.match(exposed.fingerprint, /^[0-9a-f]{64}$/);

    const token = ensureAuthToken(identityDir);
    assert.equal(token, ensureAuthToken(identityDir));
    assert.equal(secureTokenEqual(token, token), true);
    assert.equal(secureTokenEqual(token, token + 'x'), false);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(path.join(identityDir, 'identity.json')).mode & 0o077, 0);
      assert.equal(fs.statSync(path.join(identityDir, 'auth.token')).mode & 0o077, 0);
    }

    const installDir = path.join(root, 'installed');
    const installed = installUser({
      stateDir: installDir,
      sourceDir: path.resolve(__dirname, '..'),
      platform: process.platform,
      home: root,
      effectiveUid: 1000
    });
    assert.equal(installed.scope, 'user');
    assert.equal(installed.requiresAdmin, false);
    assert.equal(installed.autoStartEnabled, false);
    assert(fs.existsSync(path.join(installDir, 'app', 'bin', 'zuvyr-device-agent.js')));
    assert(fs.existsSync(installed.launcher));
    assert(fs.existsSync(path.join(installDir, 'identity.json')));
    const removed = uninstallUser({ stateDir: installDir, home: root, effectiveUid: 1000 });
    assert.equal(removed.uninstalled, true);
    assert.equal(removed.identityPreserved, true);
    assert.equal(removed.localTokenRemoved, true);
    assert.equal(fs.existsSync(path.join(installDir, 'app')), false);
    assert.equal(fs.existsSync(path.join(installDir, 'identity.json')), true);
    assert.equal(fs.existsSync(path.join(installDir, 'auth.token')), false);
    const rotatedToken = ensureAuthToken(installDir);
    assert.notEqual(rotatedToken, token);
    fs.rmSync(path.join(installDir, 'auth.token'), { force: true });

    const updateKeys = crypto.generateKeyPairSync('ed25519');
    const artifact = Buffer.from('zuvyr-device-agent-test-artifact');
    const manifestBytes = Buffer.from(JSON.stringify({
      version: '1.2.3',
      sha256: crypto.createHash('sha256').update(artifact).digest('hex'),
      sizeBytes: artifact.length,
      url: 'https://updates.example.test/zuvyr-device-agent.bin'
    }));
    const signature = crypto.sign(null, manifestBytes, updateKeys.privateKey).toString('base64');
    const verified = verifySignedManifest({
      manifestBytes,
      signatureBase64: signature,
      publicKeyPem: updateKeys.publicKey.export({ type: 'spki', format: 'pem' }),
      allowedHosts: ['updates.example.test']
    });
    assert.equal(verified.version, '1.2.3');
    assert.equal(verifyArtifact(verified, artifact), true);
    const credentialUrlBytes = Buffer.from(JSON.stringify({
      version: '1.2.3',
      sha256: crypto.createHash('sha256').update(artifact).digest('hex'),
      sizeBytes: artifact.length,
      url: 'https://user:secret@updates.example.test/zuvyr-device-agent.bin'
    }));
    const credentialSignature = crypto.sign(null, credentialUrlBytes, updateKeys.privateKey).toString('base64');
    assert.throws(() => verifySignedManifest({
      manifestBytes: credentialUrlBytes,
      signatureBase64: credentialSignature,
      publicKeyPem: updateKeys.publicKey.export({ type: 'spki', format: 'pem' }),
      allowedHosts: ['updates.example.test']
    }), { code: 'device_agent_update_url_credentials_forbidden' });

    const ipUrlBytes = Buffer.from(JSON.stringify({
      version: '1.2.3',
      sha256: crypto.createHash('sha256').update(artifact).digest('hex'),
      sizeBytes: artifact.length,
      url: 'https://127.0.0.1/zuvyr-device-agent.bin'
    }));
    const ipSignature = crypto.sign(null, ipUrlBytes, updateKeys.privateKey).toString('base64');
    assert.throws(() => verifySignedManifest({
      manifestBytes: ipUrlBytes,
      signatureBase64: ipSignature,
      publicKeyPem: updateKeys.publicKey.export({ type: 'spki', format: 'pem' }),
      allowedHosts: ['127.0.0.1']
    }), { code: 'device_agent_update_host_forbidden' });
    assert.throws(() => verifySignedManifest({
      manifestBytes,
      signatureBase64: '%%%not-base64%%%',
      publicKeyPem: updateKeys.publicKey.export({ type: 'spki', format: 'pem' }),
      allowedHosts: ['updates.example.test']
    }), { code: 'device_agent_update_signature_invalid' });
    assert.throws(() => verifySignedManifest({
      manifestBytes: Buffer.concat([manifestBytes, Buffer.from(' ')]),
      signatureBase64: signature,
      publicKeyPem: updateKeys.publicKey.export({ type: 'spki', format: 'pem' }),
      allowedHosts: ['updates.example.test']
    }), { code: 'device_agent_update_signature_invalid' });
    assert.throws(() => verifySignedManifest({ manifestBytes, signatureBase64: signature }), {
      code: 'device_agent_update_verification_not_configured'
    });

    const serverDir = path.join(root, 'server');
    const agent = await startSecureAgent({ stateDir: serverDir, port: 0 });
    const port = agent.address.port;
    const localToken = ensureAuthToken(serverDir);
    assert.equal(agent.address.host, '127.0.0.1');

    const health = await request({ port, route: '/healthz' });
    assert.equal(health.status, 200);
    assert.equal(health.body.executionEnabled, false);
    assert.equal(health.headers['access-control-allow-origin'], undefined);

    const unauthorized = await request({ port, route: '/v1/capabilities' });
    assert.equal(unauthorized.status, 401);

    const capabilities = await request({ port, route: '/v1/capabilities', token: localToken });
    assert.equal(capabilities.status, 200);
    assert.equal(capabilities.body.capabilities.executionEnabled, false);
    assert.equal(capabilities.body.capabilities.paired, false);
    assert.equal(capabilities.body.capabilities.nextAuthority.pairing, 'PACK086');
    assert.equal(capabilities.body.capabilities.nextAuthority.actions, 'PACK087');
    for (const enabled of Object.values(capabilities.body.capabilities.actions)) assert.equal(enabled, false);

    const browserOrigin = await request({
      port,
      route: '/v1/capabilities',
      token: localToken,
      origin: 'https://rox-ai-sepia.vercel.app'
    });
    assert.equal(browserOrigin.status, 403);
    assert.equal(browserOrigin.body.code, 'device_agent_browser_origin_rejected');

    const badHost = await request({ port, route: '/healthz', host: 'evil.example' });
    assert.equal(badHost.status, 421);

    const execution = await request({ port, method: 'POST', route: '/v1/execute', token: localToken });
    assert.equal(execution.status, 404);
    assert.equal(execution.body.executionEnabled, false);

    const runtimePath = path.join(serverDir, 'runtime.json');
    assert.equal(fs.existsSync(runtimePath), true);
    const shutdown = await request({ port, method: 'POST', route: '/v1/shutdown', token: localToken });
    assert.equal(shutdown.status, 202);
    await new Promise(resolve => agent.server.once('close', resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fs.existsSync(runtimePath), false);

    console.log('PASS: PACK085 device identity and auth-token custody are local, private and stable');
    console.log('PASS: PACK085 user-scope install/uninstall works without admin and preserves identity by default');
    console.log('PASS: PACK085 update manifests require Ed25519 verification, HTTPS and a pinned allowlisted host');
    console.log('PASS: PACK085 service binds only to loopback, rejects browser Origin/bad Host and requires bearer auth');
    console.log('PASS: PACK085 exposes no pairing or computer-control executor; PACK086/087 authority remains separate');
    console.log('LIVE DEVICE / PAIRING / COMPUTER-CONTROL / PAYMENT / PROVIDER CALLS: NONE');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
