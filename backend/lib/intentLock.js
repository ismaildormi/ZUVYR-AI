'use strict';

const crypto = require('crypto');
const CONFIG = require('../config/intent-lock.v1.json');
const { assertUniversalRequest } = require('./universalRequest');

const ALLOWED_ASSUMPTION_SCOPES = new Set(
  CONFIG.minimalTechnicalAssumptions.allowedScopes
);

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clone(item)])
    );
  }
  return value;
}

function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value);
  }
  if (isObject(value)) {
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }
  return value;
}

function stable(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(payload) {
  return crypto
    .createHash('sha256')
    .update(stable(payload), 'utf8')
    .digest('hex');
}

function normalizedExtraction(extraction) {
  if (!isObject(extraction)) {
    const error = new Error('intent_lock_extraction_required');
    error.code = 'INTENT_LOCK_EXTRACTION_REQUIRED';
    throw error;
  }

  for (const key of [
    'hardRequirements',
    'softPreferences',
    'unknowns',
    'outputCriteria',
    'unclassifiedConstraints'
  ]) {
    if (!Array.isArray(extraction[key])) {
      const error = new Error(`intent_lock_extraction_field_invalid:${key}`);
      error.code = 'INTENT_LOCK_EXTRACTION_INVALID';
      throw error;
    }
  }

  return extraction;
}

function createIntentLock(universalRequest, extraction) {
  const request = assertUniversalRequest(universalRequest);
  const extracted = normalizedExtraction(extraction);

  if (
    extracted.requestId !== request.requestId ||
    extracted.surface !== request.surface
  ) {
    const error = new Error('intent_lock_request_extraction_mismatch');
    error.code = 'INTENT_LOCK_REQUEST_EXTRACTION_MISMATCH';
    throw error;
  }

  const locked = {
    goal: request.goal,
    hardRequirements: clone(extracted.hardRequirements),
    softPreferences: clone(extracted.softPreferences),
    unknowns: clone(extracted.unknowns),
    outputCriteria: clone(extracted.outputCriteria),
    unclassifiedConstraints: clone(extracted.unclassifiedConstraints)
  };

  const payload = {
    schemaVersion: '1.0',
    requestId: request.requestId,
    surface: request.surface,
    locked
  };

  return deepFreeze({
    version: CONFIG.version,
    requestId: request.requestId,
    surface: request.surface,
    locked,
    intentFingerprint: fingerprint(payload)
  });
}

function normalizeTechnicalAssumption(value, index) {
  if (!isObject(value)) {
    const error = new Error(`intent_lock_assumption_invalid:${index}`);
    error.code = 'INTENT_LOCK_ASSUMPTION_INVALID';
    throw error;
  }

  const scope = String(value.scope || '').trim();
  const rationale = String(value.rationale || '').trim();

  if (!ALLOWED_ASSUMPTION_SCOPES.has(scope)) {
    const error = new Error(`intent_lock_assumption_scope_forbidden:${scope || 'missing'}`);
    error.code = 'INTENT_LOCK_ASSUMPTION_FORBIDDEN';
    throw error;
  }

  if (!Object.prototype.hasOwnProperty.call(value, 'value') || !rationale) {
    const error = new Error(`intent_lock_assumption_fields_required:${index}`);
    error.code = 'INTENT_LOCK_ASSUMPTION_INVALID';
    throw error;
  }

  if (
    value.userRequirement === true ||
    value.changesGoal === true ||
    value.changesOutputCriteria === true ||
    value.changesConstraint === true
  ) {
    const error = new Error(`intent_lock_assumption_changes_user_intent:${scope}`);
    error.code = 'INTENT_LOCK_ASSUMPTION_FORBIDDEN';
    throw error;
  }

  return deepFreeze({
    scope,
    value: clone(value.value),
    rationale,
    source: CONFIG.minimalTechnicalAssumptions.source
  });
}

function validateIntentProposal(lock, proposal = {}) {
  if (!isObject(lock) || lock.version !== CONFIG.version) {
    const error = new Error('intent_lock_invalid');
    error.code = 'INTENT_LOCK_INVALID';
    throw error;
  }

  if (!isObject(proposal)) {
    const error = new Error('intent_lock_proposal_invalid');
    error.code = 'INTENT_LOCK_PROPOSAL_INVALID';
    throw error;
  }

  if (proposal.intentFingerprint !== lock.intentFingerprint) {
    const error = new Error('intent_lock_fingerprint_mismatch');
    error.code = 'INTENT_LOCK_FINGERPRINT_MISMATCH';
    throw error;
  }

  const candidate = proposal.locked;
  if (!isObject(candidate)) {
    const error = new Error('intent_lock_locked_payload_required');
    error.code = 'INTENT_LOCK_CHANGED';
    throw error;
  }

  const changed = [];
  for (const field of CONFIG.lockedFields) {
    if (!Object.prototype.hasOwnProperty.call(candidate, field)) {
      changed.push({ field, reason: 'MISSING' });
      continue;
    }

    if (stable(candidate[field]) !== stable(lock.locked[field])) {
      changed.push({ field, reason: 'CHANGED' });
    }
  }

  if (changed.length) {
    const error = new Error(
      `intent_lock_changed:${changed.map(item => `${item.field}:${item.reason}`).join(',')}`
    );
    error.code = 'INTENT_LOCK_CHANGED';
    error.changed = changed;
    throw error;
  }

  const assumptions = Array.isArray(proposal.technicalAssumptions)
    ? proposal.technicalAssumptions.map(normalizeTechnicalAssumption)
    : [];

  return deepFreeze({
    accepted: true,
    intentFingerprint: lock.intentFingerprint,
    technicalAssumptions: assumptions
  });
}

function createIntentProposal(lock, technicalAssumptions = []) {
  if (!isObject(lock) || lock.version !== CONFIG.version) {
    const error = new Error('intent_lock_invalid');
    error.code = 'INTENT_LOCK_INVALID';
    throw error;
  }

  return deepFreeze({
    intentFingerprint: lock.intentFingerprint,
    locked: clone(lock.locked),
    technicalAssumptions: technicalAssumptions.map(normalizeTechnicalAssumption)
  });
}

module.exports = {
  CONFIG,
  createIntentLock,
  createIntentProposal,
  validateIntentProposal
};
