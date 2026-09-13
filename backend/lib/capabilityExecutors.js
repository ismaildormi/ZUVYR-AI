'use strict';

const { assertCapability } = require('./capabilityGraph');

const ALLOWED_SIDE_EFFECT_MODES = new Set([
  'read_only',
  'idempotent_external'
]);

function registryError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function normalizeDefinition(capability, definition) {
  assertCapability(capability);

  if (!definition || typeof definition !== 'object') {
    throw registryError('STEP_EXECUTOR_DEFINITION_REQUIRED', { capability });
  }
  if (typeof definition.execute !== 'function') {
    throw registryError('STEP_EXECUTOR_HANDLER_REQUIRED', { capability });
  }

  const sideEffectMode = String(definition.sideEffectMode || '').trim();
  if (!ALLOWED_SIDE_EFFECT_MODES.has(sideEffectMode)) {
    throw registryError('STEP_EXECUTOR_SIDE_EFFECT_MODE_FORBIDDEN', {
      capability,
      sideEffectMode: sideEffectMode || null
    });
  }

  if (
    sideEffectMode === 'idempotent_external' &&
    definition.supportsIdempotency !== true
  ) {
    throw registryError('STEP_EXECUTOR_IDEMPOTENCY_SUPPORT_REQUIRED', {
      capability
    });
  }

  const timeoutMs = definition.timeoutMs == null
    ? null
    : Number(definition.timeoutMs);

  if (
    timeoutMs !== null &&
    (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
  ) {
    throw registryError('STEP_EXECUTOR_TIMEOUT_INVALID', { capability });
  }

  return Object.freeze({
    capability,
    execute: definition.execute,
    sideEffectMode,
    supportsIdempotency:
      sideEffectMode === 'read_only'
        ? true
        : definition.supportsIdempotency === true,
    timeoutMs,
    retryable: definition.retryable !== false
  });
}

function createCapabilityExecutorRegistry(definitions = {}) {
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) {
    throw registryError('STEP_EXECUTOR_REGISTRY_INVALID');
  }

  const normalized = new Map();
  for (const [capability, definition] of Object.entries(definitions)) {
    normalized.set(
      capability,
      normalizeDefinition(capability, definition)
    );
  }

  return Object.freeze({
    has(capability) {
      return normalized.has(capability);
    },

    get(capability) {
      const value = normalized.get(capability);
      if (!value) {
        throw registryError('STEP_EXECUTOR_CAPABILITY_UNBOUND', {
          capability
        });
      }
      return value;
    },

    capabilities() {
      return Object.freeze([...normalized.keys()].sort());
    }
  });
}

module.exports = {
  ALLOWED_SIDE_EFFECT_MODES,
  createCapabilityExecutorRegistry
};
