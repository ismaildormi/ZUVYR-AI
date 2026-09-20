'use strict';

const crypto = require('node:crypto');
const {
  bodySha256,
  pairingProofMessage,
  sessionRequestMessage,
  normalizeEd25519PublicKey,
  verifySignature
} = require('./ipPairingProtocol');

const PAIRING_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 10 * 60 * 1000;
const HEARTBEAT_SCOPE = 'heartbeat';
const SESSION_SCOPES = Object.freeze(['heartbeat','session_status','session_rotate']);

function pairingError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function uuid(value, code) {
  const text = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    throw pairingError(code);
  }
  return text;
}

function displayName(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 100) throw pairingError('pack086_display_name_invalid');
  return text;
}

function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function newToken(randomBytes = crypto.randomBytes) {
  return 'zst_' + randomBytes(32).toString('base64url');
}

function timingSafeHexEqual(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}

function parseTime(value, code) {
  const ms = Date.parse(String(value || ''));
  if (!Number.isFinite(ms)) throw pairingError(code);
  return ms;
}

function createIpPairingService({
  repository,
  clock = () => new Date(),
  randomBytes = crypto.randomBytes
} = {}) {
  if (!repository) throw pairingError('pack086_repository_required');

  async function startPairing({ ownerId, agentDeviceId, displayName: name, publicKeyPem }) {
    const owner = uuid(ownerId, 'pack086_owner_id_invalid');
    const agentId = uuid(agentDeviceId, 'pack086_agent_device_id_invalid');
    const normalizedKey = normalizeEd25519PublicKey(publicKeyPem);
    const challenge = randomBytes(32).toString('base64url');
    const expiresAt = new Date(clock().getTime() + PAIRING_TTL_MS).toISOString();
    const result = await repository.startPairing({
      ownerId: owner,
      agentDeviceId: agentId,
      displayName: displayName(name),
      fingerprint: normalizedKey.fingerprint,
      publicKeyPem: normalizedKey.publicKeyPem,
      challengeHash: hashSecret(challenge),
      expiresAt
    });
    return Object.freeze({
      challengeId: result.challenge_id,
      challenge,
      ownerId: owner,
      backendDeviceId: result.device_id,
      agentDeviceId: agentId,
      fingerprint: normalizedKey.fingerprint,
      expiresAt: result.expires_at || expiresAt,
      executionEnabled: false
    });
  }

  async function completePairing({ ownerId, challengeId, challenge, signature }) {
    const owner = uuid(ownerId, 'pack086_owner_id_invalid');
    const challengeUuid = uuid(challengeId, 'pack086_challenge_id_invalid');
    const context = await repository.getPairingContext({ ownerId: owner, challengeId: challengeUuid });
    const ch = context.challenge;
    const device = context.device;

    if (ch.state !== 'pending') throw pairingError('pack086_challenge_not_pending');
    if (parseTime(ch.expires_at, 'pack086_challenge_expiry_invalid') <= clock().getTime()) {
      throw pairingError('pack086_challenge_expired');
    }
    if (device.status === 'revoked' || device.revoked_at) throw pairingError('pack086_device_revoked');
    if (device.status !== 'pending_pairing') throw pairingError('pack086_device_not_pending');
    if (!timingSafeHexEqual(hashSecret(challenge), ch.challenge_hash)) throw pairingError('pack086_challenge_mismatch');

    const normalizedKey = normalizeEd25519PublicKey(device.public_key_pem);
    if (!timingSafeHexEqual(normalizedKey.fingerprint, device.public_key_fingerprint)) {
      throw pairingError('pack086_device_key_mismatch');
    }

    const message = pairingProofMessage({
      challengeId: challengeUuid,
      challenge,
      ownerId: owner,
      backendDeviceId: device.id,
      agentDeviceId: device.agent_device_id,
      fingerprint: normalizedKey.fingerprint,
      expiresAt: ch.expires_at
    });
    if (!verifySignature(normalizedKey.publicKeyPem, message, signature)) {
      throw pairingError('pack086_pairing_signature_invalid');
    }

    const token = newToken(randomBytes);
    const tokenExpiresAt = new Date(clock().getTime() + SESSION_TTL_MS).toISOString();
    const result = await repository.completePairing({
      ownerId: owner,
      challengeId: challengeUuid,
      tokenHash: hashSecret(token),
      tokenExpiresAt
    });

    return Object.freeze({
      deviceId: result.device_id,
      sessionId: result.session_id,
      token,
      tokenExpiresAt: result.token_expires_at || tokenExpiresAt,
      scopes: Array.isArray(result.scopes) ? result.scopes : SESSION_SCOPES,
      executionEnabled: false
    });
  }

  async function rotateSessionToken({ ownerId, sessionId, expectedTokenHash = null }) {
    const owner = uuid(ownerId, 'pack086_owner_id_invalid');
    const session = uuid(sessionId, 'pack086_session_id_invalid');
    const context = await repository.getSessionContext({ sessionId: session });
    if (context.session.owner_id !== owner) throw pairingError('pack086_wrong_session');
    if (context.session.revoked_at || ['stopped','failed'].includes(context.session.state)) {
      throw pairingError('pack086_session_revoked');
    }
    if (context.device.status !== 'paired' || context.device.revoked_at) {
      throw pairingError('pack086_device_not_paired');
    }

    const currentHash = String(expectedTokenHash || context.session.token_hash || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(currentHash)) throw pairingError('pack086_token_invalid');

    const token = newToken(randomBytes);
    const tokenExpiresAt = new Date(clock().getTime() + SESSION_TTL_MS).toISOString();
    const result = await repository.rotateSessionToken({
      ownerId: owner,
      sessionId: session,
      expectedTokenHash: currentHash,
      tokenHash: hashSecret(token),
      tokenExpiresAt
    });
    return Object.freeze({
      deviceId: result.device_id,
      sessionId: result.session_id,
      token,
      tokenExpiresAt: result.token_expires_at || tokenExpiresAt,
      scopes: Array.isArray(result.scopes) ? result.scopes : SESSION_SCOPES,
      executionEnabled: false
    });
  }

  async function revokeDevice({ ownerId, deviceId }) {
    return repository.revokeDevice({
      ownerId: uuid(ownerId, 'pack086_owner_id_invalid'),
      deviceId: uuid(deviceId, 'pack086_backend_device_id_invalid')
    });
  }

  async function authenticateSessionRequest({
    sessionId,
    token,
    counter,
    signature,
    method,
    path,
    body
  }) {
    const sessionUuid = uuid(sessionId, 'pack086_session_id_invalid');
    const rawToken = String(token || '').trim();
    if (!/^zst_[A-Za-z0-9_-]{40,80}$/.test(rawToken)) throw pairingError('pack086_token_invalid');
    const requestTokenHash = hashSecret(rawToken);
    const numericCounter = Number(counter);
    if (!Number.isSafeInteger(numericCounter) || numericCounter <= 0) throw pairingError('pack086_counter_invalid');

    const context = await repository.getSessionContext({ sessionId: sessionUuid });
    const session = context.session;
    const device = context.device;

    if (session.id !== sessionUuid) throw pairingError('pack086_wrong_session');
    if (session.execution_enabled !== false) throw pairingError('pack086_execution_invariant_failed');
    if (session.revoked_at || ['stopped','failed'].includes(session.state)) throw pairingError('pack086_session_revoked');
    if (parseTime(session.token_expires_at, 'pack086_token_expiry_invalid') <= clock().getTime()) throw pairingError('pack086_token_expired');
    if (!timingSafeHexEqual(requestTokenHash, session.token_hash)) throw pairingError('pack086_token_invalid');
    if (device.id !== session.device_id || device.owner_id !== session.owner_id) throw pairingError('pack086_wrong_device');
    if (device.status !== 'paired' || device.revoked_at) throw pairingError('pack086_device_not_paired');

    const normalizedKey = normalizeEd25519PublicKey(device.public_key_pem);
    if (!timingSafeHexEqual(normalizedKey.fingerprint, device.public_key_fingerprint)) {
      throw pairingError('pack086_device_key_mismatch');
    }

    const digest = bodySha256(body);
    const message = sessionRequestMessage({
      sessionId: sessionUuid,
      counter: numericCounter,
      method,
      path,
      tokenHash: requestTokenHash,
      bodySha256: digest
    });
    if (!verifySignature(normalizedKey.publicKeyPem, message, signature)) {
      throw pairingError('pack086_session_signature_invalid');
    }

    const advanced = await repository.advanceSessionCounter({
      sessionId: sessionUuid,
      tokenHash: requestTokenHash,
      counter: numericCounter
    });
    return Object.freeze({
      ownerId: advanced.owner_id || session.owner_id,
      deviceId: advanced.device_id || device.id,
      sessionId: advanced.session_id || sessionUuid,
      counter: Number(advanced.counter || numericCounter),
      tokenExpiresAt: advanced.token_expires_at || session.token_expires_at,
      scopes: Array.isArray(advanced.scopes) ? advanced.scopes : session.permission_scopes,
      heartbeatAt: advanced.heartbeat_at || clock().toISOString(),
      tokenHash: requestTokenHash,
      executionEnabled: false
    });
  }

  return Object.freeze({
    startPairing,
    completePairing,
    rotateSessionToken,
    revokeDevice,
    authenticateSessionRequest
  });
}

module.exports = {
  PAIRING_TTL_MS,
  SESSION_TTL_MS,
  HEARTBEAT_SCOPE,
  SESSION_SCOPES,
  pairingError,
  hashSecret,
  createIpPairingService
};
