'use strict';

const crypto = require('crypto');
const CONFIG = require('../config/context-resolver.v1.json');
const { assertUniversalRequest } = require('./universalRequest');

const SUPPORTED_TYPES = new Set(CONFIG.supportedTypes);

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function resolverError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function clean(value, max = 500) {
  return value == null ? '' : String(value).trim().slice(0, max);
}

function parseRef(ref, index) {
  if (!isObject(ref)) {
    throw resolverError('CONTEXT_REF_INVALID', { index });
  }

  let type = clean(ref.type, 100).toLowerCase();
  let id = clean(ref.id, 500);

  if ((!type || !id) && typeof ref.ref === 'string') {
    const raw = ref.ref.trim();
    const colon = raw.indexOf(':');
    if (colon > 0 && colon < raw.length - 1) {
      type = raw.slice(0, colon).trim().toLowerCase();
      id = raw.slice(colon + 1).trim();
    }
  }

  if (!SUPPORTED_TYPES.has(type)) {
    throw resolverError('CONTEXT_REF_TYPE_UNSUPPORTED', { index, type: type || null });
  }
  if (!id) {
    throw resolverError('CONTEXT_REF_ID_REQUIRED', { index, type });
  }

  return Object.freeze({
    type,
    id,
    sourceRef: `${type}:${id}`,
    version: clean(ref.version, 200) || null
  });
}

function normalizeRefs(refs) {
  if (!Array.isArray(refs)) {
    throw resolverError('CONTEXT_REFS_INVALID');
  }

  if (refs.length > CONFIG.reference.maxRefs) {
    throw resolverError('CONTEXT_REF_LIMIT_EXCEEDED', {
      count: refs.length,
      maxRefs: CONFIG.reference.maxRefs
    });
  }

  const seen = new Set();
  const normalized = [];

  refs.forEach((ref, index) => {
    const parsed = parseRef(ref, index);
    const key = `${parsed.type}\n${parsed.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(parsed);
  });

  return Object.freeze(normalized);
}

function ownerHash(ownerId) {
  return crypto
    .createHash('sha256')
    .update(String(ownerId), 'utf8')
    .digest('hex')
    .slice(0, 20);
}

function normalizeResolvedContent(value) {
  if (!isObject(value)) return null;

  const text =
    typeof value.text === 'string'
      ? value.text
      : typeof value.content === 'string'
        ? value.content
        : '';

  return {
    ownerId: value.ownerId,
    text,
    metadata: isObject(value.metadata) ? { ...value.metadata } : {}
  };
}

function freezeDeep(value) {
  if (Array.isArray(value)) {
    value.forEach(freezeDeep);
    return Object.freeze(value);
  }
  if (isObject(value)) {
    Object.values(value).forEach(freezeDeep);
    return Object.freeze(value);
  }
  return value;
}

async function resolveContext({
  request,
  ownerId,
  adapters = {},
  budget = {}
} = {}) {
  const normalizedRequest = assertUniversalRequest(request);
  const owner = clean(ownerId, 500);

  if (!owner) {
    throw resolverError('CONTEXT_OWNER_REQUIRED');
  }

  if (!isObject(adapters)) {
    throw resolverError('CONTEXT_ADAPTERS_INVALID');
  }

  const refs = normalizeRefs(normalizedRequest.contextRefs);

  const maxTotalCharacters =
    Number.isInteger(budget.maxTotalCharacters) &&
    budget.maxTotalCharacters > 0 &&
    budget.maxTotalCharacters <= CONFIG.budget.maxTotalCharacters
      ? budget.maxTotalCharacters
      : CONFIG.budget.maxTotalCharacters;

  const maxItemCharacters =
    Number.isInteger(budget.maxItemCharacters) &&
    budget.maxItemCharacters > 0 &&
    budget.maxItemCharacters <= CONFIG.budget.maxItemCharacters
      ? budget.maxItemCharacters
      : CONFIG.budget.maxItemCharacters;

  let remaining = maxTotalCharacters;
  const items = [];

  for (const ref of refs) {
    const adapter = adapters[ref.type];
    if (typeof adapter !== 'function') {
      throw resolverError('CONTEXT_ADAPTER_MISSING', {
        sourceRef: ref.sourceRef,
        type: ref.type
      });
    }

    const resolvedRaw = await adapter({
      ownerId: owner,
      id: ref.id,
      type: ref.type,
      version: ref.version,
      sourceRef: ref.sourceRef,
      request: normalizedRequest
    });

    const resolved = normalizeResolvedContent(resolvedRaw);
    if (!resolved) {
      throw resolverError('CONTEXT_NOT_FOUND', { sourceRef: ref.sourceRef });
    }

    const resolvedOwner = clean(resolved.ownerId, 500);
    if (!resolvedOwner) {
      throw resolverError('CONTEXT_OWNER_MISSING', { sourceRef: ref.sourceRef });
    }
    if (resolvedOwner !== owner) {
      throw resolverError('CONTEXT_OWNER_MISMATCH', {
        sourceRef: ref.sourceRef
      });
    }

    const originalCharacters = resolved.text.length;
    const perItemLimit = Math.min(maxItemCharacters, remaining);
    const includedText =
      perItemLimit > 0 ? resolved.text.slice(0, perItemLimit) : '';
    const includedCharacters = includedText.length;
    const truncated = includedCharacters < originalCharacters;

    remaining -= includedCharacters;

    items.push(freezeDeep({
      type: ref.type,
      id: ref.id,
      sourceRef: ref.sourceRef,
      version: ref.version,
      ownershipVerified: true,
      ownerFingerprint: ownerHash(owner),
      text: includedText,
      metadata: resolved.metadata,
      originalCharacters,
      includedCharacters,
      truncated
    }));
  }

  const includedCharacters = items.reduce(
    (sum, item) => sum + item.includedCharacters,
    0
  );
  const originalCharacters = items.reduce(
    (sum, item) => sum + item.originalCharacters,
    0
  );

  return freezeDeep({
    version: CONFIG.version,
    requestId: normalizedRequest.requestId,
    surface: normalizedRequest.surface,
    contextRefCount: refs.length,
    resolvedCount: items.length,
    ownershipVerified: items.every(item => item.ownershipVerified === true),
    budget: {
      unit: 'characters',
      maxTotalCharacters,
      maxItemCharacters,
      originalCharacters,
      includedCharacters,
      remainingCharacters: Math.max(0, remaining),
      truncated: includedCharacters < originalCharacters
    },
    items
  });
}

module.exports = {
  CONFIG,
  normalizeRefs,
  resolveContext
};
