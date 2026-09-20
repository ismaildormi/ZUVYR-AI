'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { ensureIdentity, ensurePrivateDir, agentError } = require('./security');
const {
  bodySha256,
  pairingProofMessage,
  sessionRequestMessage
} = require('./pairingProtocol');

function sessionPath(stateDir) {
  return path.join(stateDir, 'session.json');
}

function strictUuid(value, code = 'pack086_session_identity_invalid') {
  const text = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    throw agentError(code);
  }
  return text;
}

function futureIso(value, code = 'pack086_session_token_expired') {
  const ms = Date.parse(String(value || ''));
  if (!Number.isFinite(ms) || ms <= Date.now()) throw agentError(code);
  return new Date(ms).toISOString();
}

function strictHttpsOrigin(value) {
  let url;
  try { url = new URL(String(value || '')); }
  catch (cause) { throw agentError('pack086_backend_origin_invalid', cause); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw agentError('pack086_backend_origin_invalid');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || net.isIP(host)) {
    throw agentError('pack086_backend_origin_forbidden');
  }
  return url.origin;
}

function signPairingChallenge(stateDir, challengeInput) {
  const identity = ensureIdentity(stateDir);
  if (String(challengeInput.agentDeviceId || '').toLowerCase() !== String(identity.deviceId).toLowerCase()) {
    throw agentError('pack086_agent_device_id_mismatch');
  }
  if (String(challengeInput.fingerprint || '').toLowerCase() !== String(identity.fingerprint).toLowerCase()) {
    throw agentError('pack086_fingerprint_mismatch');
  }
  const expiresAt = Date.parse(String(challengeInput.expiresAt || ''));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw agentError('pack086_challenge_expired');
  const message = pairingProofMessage(challengeInput);
  const privateKey = crypto.createPrivateKey(identity.privateKeyPem);
  const signature = crypto.sign(null, message, privateKey).toString('base64');
  return Object.freeze({
    challengeId: challengeInput.challengeId,
    signature,
    agentDeviceId: identity.deviceId,
    fingerprint: identity.fingerprint
  });
}

function saveSession(stateDir, input) {
  ensurePrivateDir(stateDir);
  const identity = ensureIdentity(stateDir);
  const data = {
    version: 'pack086.device-session.v1',
    backendOrigin: strictHttpsOrigin(input.backendOrigin),
    backendDeviceId: strictUuid(input.deviceId),
    sessionId: strictUuid(input.sessionId),
    token: String(input.token || '').trim(),
    tokenExpiresAt: futureIso(input.tokenExpiresAt),
    scopes: Array.isArray(input.scopes) ? input.scopes.map(String) : [],
    counter: 0,
    agentDeviceId: strictUuid(identity.deviceId, 'pack086_agent_device_id_invalid'),
    fingerprint: identity.fingerprint,
    importedAt: new Date().toISOString()
  };
  if (!/^zst_[A-Za-z0-9_-]{40,80}$/.test(data.token)) throw agentError('pack086_session_token_invalid');
  if (!Number.isFinite(Date.parse(data.tokenExpiresAt)) || Date.parse(data.tokenExpiresAt) <= Date.now()) {
    throw agentError('pack086_session_token_expired');
  }
  if (data.scopes.length !== 1 || data.scopes[0] !== 'heartbeat') throw agentError('pack086_session_scope_invalid');
  const target = sessionPath(stateDir);
  const temp = target + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, target);
  try { fs.chmodSync(target, 0o600); } catch (_) {}
  return Object.freeze({ ...data, token: '[stored-private]' });
}

function loadSession(stateDir) {
  let data;
  try { data = JSON.parse(fs.readFileSync(sessionPath(stateDir), 'utf8')); }
  catch (cause) { throw agentError('pack086_session_read_failed', cause); }
  if (data.version !== 'pack086.device-session.v1') throw agentError('pack086_session_version_invalid');
  data.backendOrigin = strictHttpsOrigin(data.backendOrigin);
  data.backendDeviceId = strictUuid(data.backendDeviceId);
  data.sessionId = strictUuid(data.sessionId);
  data.agentDeviceId = strictUuid(data.agentDeviceId, 'pack086_agent_device_id_invalid');
  if (!/^zst_[A-Za-z0-9_-]{40,80}$/.test(String(data.token || ''))) throw agentError('pack086_session_token_invalid');
  data.tokenExpiresAt = futureIso(data.tokenExpiresAt);
  if (!Array.isArray(data.scopes) || data.scopes.length !== 1 || data.scopes[0] !== 'heartbeat') {
    throw agentError('pack086_session_scope_invalid');
  }
  if (!Number.isSafeInteger(Number(data.counter)) || Number(data.counter) < 0) throw agentError('pack086_session_counter_invalid');
  data.counter = Number(data.counter);
  return data;
}

function buildSignedSessionRequest(stateDir, { method, path: route, body = {} } = {}) {
  const identity = ensureIdentity(stateDir);
  const session = loadSession(stateDir);
  if (String(session.agentDeviceId).toLowerCase() !== String(identity.deviceId).toLowerCase()) {
    throw agentError('pack086_session_agent_mismatch');
  }
  if (String(session.fingerprint).toLowerCase() !== String(identity.fingerprint).toLowerCase()) {
    throw agentError('pack086_session_fingerprint_mismatch');
  }
  const nextCounter = Number(session.counter || 0) + 1;
  if (!Number.isSafeInteger(nextCounter) || nextCounter <= 0) throw agentError('pack086_session_counter_invalid');
  const digest = bodySha256(body);
  const message = sessionRequestMessage({
    sessionId: session.sessionId,
    counter: nextCounter,
    method,
    path: route,
    bodySha256: digest
  });
  const privateKey = crypto.createPrivateKey(identity.privateKeyPem);
  const signature = crypto.sign(null, message, privateKey).toString('base64');

  session.counter = nextCounter;
  const target = sessionPath(stateDir);
  const temp = target + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(temp, JSON.stringify(session, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, target);
  try { fs.chmodSync(target, 0o600); } catch (_) {}

  return Object.freeze({
    backendOrigin: session.backendOrigin,
    path: route,
    method: String(method || '').toUpperCase(),
    body,
    bodySha256: digest,
    headers: Object.freeze({
      Authorization: 'Bearer ' + session.token,
      'X-ZUVYR-Session-Id': session.sessionId,
      'X-ZUVYR-Device-Counter': String(nextCounter),
      'X-ZUVYR-Device-Signature': signature
    }),
    executionEnabled: false
  });
}

function clearSession(stateDir) {
  fs.rmSync(sessionPath(stateDir), { force: true });
  return Object.freeze({ cleared: true });
}

module.exports = {
  sessionPath,
  strictUuid,
  futureIso,
  strictHttpsOrigin,
  signPairingChallenge,
  saveSession,
  loadSession,
  buildSignedSessionRequest,
  clearSession
};
