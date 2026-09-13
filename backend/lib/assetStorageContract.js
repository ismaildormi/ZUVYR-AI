'use strict';

const crypto = require('node:crypto');
const CONFIG = require('../config/asset-storage.v1.json');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

function assetError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function uuid(value, code) {
  const text = String(value || '').trim();
  if (!UUID.test(text)) throw assetError(code);
  return text.toLowerCase();
}

function sha256(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!SHA256.test(text)) throw assetError('ASSET_SHA256_INVALID');
  return text;
}

function bytes(value) {
  const number = Number(value);
  if (
    !Number.isSafeInteger(number) ||
    number < 0 ||
    number > CONFIG.maxFileBytes
  ) {
    throw assetError('ASSET_FILE_SIZE_INVALID');
  }
  return number;
}

function mimeType(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text || text.length > 255 || /[\r\n]/.test(text)) {
    throw assetError('ASSET_MIME_TYPE_INVALID');
  }
  return text;
}

function buildCanonicalObjectPath({ ownerId, sha256: digest }) {
  const owner = uuid(ownerId, 'ASSET_OWNER_INVALID');
  const hash = sha256(digest);
  return `${owner}/objects/${hash.slice(0, 2)}/${hash}`;
}

function assertOwnedStoragePath({ ownerId, storagePath }) {
  const owner = uuid(ownerId, 'ASSET_OWNER_INVALID');
  const path = String(storagePath || '').trim();
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('..') ||
    !path.startsWith(`${owner}/`)
  ) {
    throw assetError('ASSET_STORAGE_PATH_OWNER_MISMATCH');
  }
  return path;
}

function normalizeRegistration(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw assetError('ASSET_REGISTRATION_INVALID');
  }
  const ownerId = uuid(value.ownerId, 'ASSET_OWNER_INVALID');
  const digest = sha256(value.sha256);
  const fileSizeBytes = bytes(value.fileSizeBytes);
  const normalizedMime = mimeType(value.mimeType);
  const storagePath = assertOwnedStoragePath({
    ownerId,
    storagePath:
      value.storagePath ||
      buildCanonicalObjectPath({ ownerId, sha256: digest })
  });

  return Object.freeze({
    ownerId,
    canonicalContentId: uuid(
      value.canonicalContentId,
      'ASSET_CONTENT_ID_INVALID'
    ),
    canonicalVersionId: uuid(
      value.canonicalVersionId,
      'ASSET_VERSION_ID_INVALID'
    ),
    storageBucket: CONFIG.bucket,
    storagePath,
    mimeType: normalizedMime,
    fileSizeBytes,
    sha256: digest,
    retentionClass: String(
      value.retentionClass || 'standard'
    ).trim().toLowerCase(),
    retainUntil: value.retainUntil || null,
    metadata:
      value.metadata &&
      typeof value.metadata === 'object' &&
      !Array.isArray(value.metadata)
        ? { ...value.metadata }
        : {}
  });
}

function randomProofHash() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  CONFIG,
  assetError,
  buildCanonicalObjectPath,
  assertOwnedStoragePath,
  normalizeRegistration,
  randomProofHash
};
