'use strict';

const crypto = require('node:crypto');

function protocolError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function uuid(value, code) {
  const text = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    throw protocolError(code);
  }
  return text;
}

function iso(value, code) {
  const text = String(value || '').trim();
  if (!text || !Number.isFinite(Date.parse(text))) throw protocolError(code);
  return new Date(text).toISOString();
}

function hex64(value, code) {
  const text = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(text)) throw protocolError(code);
  return text;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
}

function bodySha256(body) {
  return crypto.createHash('sha256').update(Buffer.from(canonicalJson(body === undefined ? null : body))).digest('hex');
}

function pairingProofMessage(input = {}) {
  const challenge = String(input.challenge || '').trim();
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(challenge)) throw protocolError('pack086_challenge_invalid');
  const payload = {
    version: 'pack086.pairing-proof.v1',
    challengeId: uuid(input.challengeId, 'pack086_challenge_id_invalid'),
    challenge,
    ownerId: uuid(input.ownerId, 'pack086_owner_id_invalid'),
    backendDeviceId: uuid(input.backendDeviceId, 'pack086_backend_device_id_invalid'),
    agentDeviceId: uuid(input.agentDeviceId, 'pack086_agent_device_id_invalid'),
    fingerprint: hex64(input.fingerprint, 'pack086_fingerprint_invalid'),
    expiresAt: iso(input.expiresAt, 'pack086_challenge_expiry_invalid')
  };
  return Buffer.from(canonicalJson(payload), 'utf8');
}

function sessionRequestMessage(input = {}) {
  const counter = Number(input.counter);
  if (!Number.isSafeInteger(counter) || counter <= 0) throw protocolError('pack086_counter_invalid');
  const method = String(input.method || '').trim().toUpperCase();
  if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(method)) throw protocolError('pack086_method_invalid');
  const route = String(input.path || '').trim();
  if (!route.startsWith('/api/device-agent/') || route.length > 200) throw protocolError('pack086_path_invalid');
  const payload = {
    version: 'pack086.session-request.v2',
    sessionId: uuid(input.sessionId, 'pack086_session_id_invalid'),
    counter,
    method,
    path: route,
    tokenHash: hex64(input.tokenHash, 'pack086_token_hash_invalid'),
    bodySha256: hex64(input.bodySha256, 'pack086_body_hash_invalid')
  };
  return Buffer.from(canonicalJson(payload), 'utf8');
}

function strictSignature(value) {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length % 4 !== 0) {
    throw protocolError('pack086_signature_invalid');
  }
  const bytes = Buffer.from(text, 'base64');
  if (bytes.length !== 64 || bytes.toString('base64') !== text) throw protocolError('pack086_signature_invalid');
  return bytes;
}

function normalizeEd25519PublicKey(publicKeyPem) {
  let key;
  try { key = crypto.createPublicKey(String(publicKeyPem || '')); }
  catch (_) { throw protocolError('pack086_public_key_invalid'); }
  if (key.asymmetricKeyType !== 'ed25519') throw protocolError('pack086_public_key_invalid');
  const der = key.export({ type: 'spki', format: 'der' });
  return Object.freeze({
    key,
    publicKeyPem: String(key.export({ type: 'spki', format: 'pem' })),
    fingerprint: crypto.createHash('sha256').update(der).digest('hex')
  });
}

function verifySignature(publicKeyPem, message, signatureBase64) {
  const normalized = normalizeEd25519PublicKey(publicKeyPem);
  const signature = strictSignature(signatureBase64);
  return crypto.verify(null, Buffer.from(message), normalized.key, signature);
}

module.exports = {
  protocolError,
  canonicalJson,
  bodySha256,
  pairingProofMessage,
  sessionRequestMessage,
  strictSignature,
  normalizeEd25519PublicKey,
  verifySignature
};
