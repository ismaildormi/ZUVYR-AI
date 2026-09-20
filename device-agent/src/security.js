'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const config = require('../config.v1.json');

function agentError(code, cause) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function defaultStateDir({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (platform === 'win32') {
    const base = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    return path.join(base, 'ZUVYR', 'device-agent');
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'ZUVYR', 'device-agent');
  }
  const base = env.XDG_STATE_HOME || path.join(home, '.local', 'state');
  return path.join(base, 'zuvyr', 'device-agent');
}

function ensurePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch (_) {}
  return dir;
}

function writePrivateExclusive(filePath, data) {
  let handle;
  try {
    handle = fs.openSync(filePath, 'wx', 0o600);
    fs.writeFileSync(handle, data, { encoding: 'utf8' });
  } catch (cause) {
    if (cause && cause.code === 'EEXIST') return false;
    throw agentError('device_agent_private_write_failed', cause);
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
  try { fs.chmodSync(filePath, 0o600); } catch (_) {}
  return true;
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (cause) {
    throw agentError(code, cause);
  }
}

function publicKeyFingerprint(publicKeyPem) {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    const der = key.export({ type: 'spki', format: 'der' });
    return crypto.createHash('sha256').update(der).digest('hex');
  } catch (cause) {
    throw agentError('device_agent_public_key_invalid', cause);
  }
}

function validateIdentity(identity) {
  if (!identity || typeof identity !== 'object') throw agentError('device_agent_identity_invalid');
  if (!/^[0-9a-f-]{36}$/i.test(String(identity.deviceId || ''))) throw agentError('device_agent_device_id_invalid');
  if (!String(identity.publicKeyPem || '').includes('BEGIN PUBLIC KEY')) throw agentError('device_agent_public_key_invalid');
  if (!String(identity.privateKeyPem || '').includes('BEGIN PRIVATE KEY')) throw agentError('device_agent_private_key_invalid');
  const expected = publicKeyFingerprint(identity.publicKeyPem);
  if (expected !== identity.fingerprint) throw agentError('device_agent_identity_fingerprint_mismatch');
  return identity;
}

function ensureIdentity(stateDir = defaultStateDir()) {
  ensurePrivateDir(stateDir);
  const filePath = path.join(stateDir, 'identity.json');
  if (fs.existsSync(filePath)) return validateIdentity(readJson(filePath, 'device_agent_identity_read_failed'));

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const identity = {
    version: 1,
    deviceId: crypto.randomUUID(),
    algorithm: 'Ed25519',
    fingerprint: publicKeyFingerprint(publicKey),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    createdAt: new Date().toISOString()
  };
  const payload = JSON.stringify(identity, null, 2) + '\n';
  if (!writePrivateExclusive(filePath, payload)) {
    return validateIdentity(readJson(filePath, 'device_agent_identity_read_failed'));
  }
  return validateIdentity(identity);
}

function publicIdentity(identity) {
  const checked = validateIdentity(identity);
  return Object.freeze({
    version: checked.version,
    deviceId: checked.deviceId,
    algorithm: checked.algorithm,
    fingerprint: checked.fingerprint,
    publicKeyPem: checked.publicKeyPem,
    createdAt: checked.createdAt
  });
}

function ensureAuthToken(stateDir = defaultStateDir()) {
  ensurePrivateDir(stateDir);
  const filePath = path.join(stateDir, 'auth.token');
  if (!fs.existsSync(filePath)) {
    const token = crypto.randomBytes(config.identity.tokenBytes).toString('base64url');
    writePrivateExclusive(filePath, token + '\n');
  }
  const token = fs.readFileSync(filePath, 'utf8').trim();
  if (token.length < 32) throw agentError('device_agent_auth_token_invalid');
  try { fs.chmodSync(filePath, 0o600); } catch (_) {}
  return token;
}

function secureTokenEqual(actual, expected) {
  const a = Buffer.from(String(actual || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  agentError,
  defaultStateDir,
  ensurePrivateDir,
  ensureIdentity,
  publicIdentity,
  publicKeyFingerprint,
  ensureAuthToken,
  secureTokenEqual
};
