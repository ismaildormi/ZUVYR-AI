'use strict';

const CONFIG = require('../config/universal-content.v1.json');

const KIND_SET = new Set(CONFIG.kinds);

function contentError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function requiredText(value, code, max = 500) {
  const text = value == null ? '' : String(value).trim();
  if (!text || text.length > max) throw contentError(code);
  return text;
}

function optionalText(value, max, code) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!text || text.length > max) throw contentError(code);
  return text;
}

function normalizeKind(value) {
  const kind = requiredText(value, 'CONTENT_KIND_REQUIRED', 32).toLowerCase();
  if (!KIND_SET.has(kind)) {
    throw contentError('CONTENT_KIND_UNSUPPORTED', { kind });
  }
  return kind;
}

function objectValue(value, code) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw contentError(code);
  return value;
}

function normalizeContentVersion(value = {}) {
  const input = objectValue(value, 'CONTENT_VERSION_INVALID');
  const sha256 = optionalText(input.sha256, 64, 'CONTENT_SHA256_INVALID');
  if (sha256 && !/^[0-9a-f]{64}$/i.test(sha256)) {
    throw contentError('CONTENT_SHA256_INVALID');
  }

  return Object.freeze({
    mimeType: optionalText(input.mimeType, 255, 'CONTENT_MIME_INVALID'),
    uri: optionalText(input.uri, 4000, 'CONTENT_URI_INVALID'),
    text: input.text == null ? null : String(input.text),
    sha256: sha256 ? sha256.toLowerCase() : null,
    payload: Object.freeze({ ...objectValue(input.payload, 'CONTENT_PAYLOAD_INVALID') }),
    provenance: Object.freeze({ ...objectValue(input.provenance, 'CONTENT_PROVENANCE_INVALID') })
  });
}

function normalizeContentInput(value = {}) {
  const input = objectValue(value, 'CONTENT_INPUT_INVALID');

  return Object.freeze({
    ownerId: requiredText(input.ownerId, 'CONTENT_OWNER_REQUIRED', 64),
    projectId: optionalText(input.projectId, 64, 'CONTENT_PROJECT_INVALID'),
    kind: normalizeKind(input.kind),
    title: optionalText(input.title, 500, 'CONTENT_TITLE_INVALID'),
    sourceKind: requiredText(input.sourceKind, 'CONTENT_SOURCE_KIND_REQUIRED', 80),
    sourceSystem: requiredText(input.sourceSystem, 'CONTENT_SOURCE_SYSTEM_REQUIRED', 80),
    sourceId: requiredText(input.sourceId, 'CONTENT_SOURCE_ID_REQUIRED', 500),
    sourceVersionKey: requiredText(input.sourceVersionKey, 'CONTENT_SOURCE_VERSION_REQUIRED', 500),
    metadata: Object.freeze({ ...objectValue(input.metadata, 'CONTENT_METADATA_INVALID') }),
    version: normalizeContentVersion(input.version)
  });
}

function normalizeContentRecord(value) {
  if (!value || typeof value !== 'object') {
    throw contentError('CONTENT_RECORD_INVALID');
  }

  return Object.freeze({
    contentId: requiredText(value.contentId, 'CONTENT_ID_MISSING', 64),
    versionId: requiredText(value.versionId, 'CONTENT_VERSION_ID_MISSING', 64),
    versionNumber: Number(value.versionNumber),
    kind: normalizeKind(value.kind),
    replayed: value.replayed === true
  });
}

module.exports = {
  CONFIG,
  normalizeKind,
  normalizeContentInput,
  normalizeContentVersion,
  normalizeContentRecord
};
