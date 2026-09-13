'use strict';

const crypto = require('crypto');
const SCHEMA = require('../config/universal-request-schema.v1.json');

const SURFACES = Object.freeze(new Set(SCHEMA.surfaces));
const MAX_GOAL = Number(SCHEMA.fields.goal.maxLength || 4000);

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanString(value, max = null) {
  if (value == null) return '';
  const text = String(value).trim();
  return max == null ? text : text.slice(0, max);
}

function generatedRequestId() {
  return `zreq_${crypto.randomUUID()}`;
}

function normalizeRequestId(value) {
  const text = cleanString(value, 200);
  return text || generatedRequestId();
}

function normalizeSurface(value) {
  const surface = cleanString(value).toLowerCase();
  if (!SURFACES.has(surface)) {
    const error = new Error(`universal_request_surface_invalid:${surface || 'missing'}`);
    error.code = 'UNIVERSAL_REQUEST_SURFACE_INVALID';
    throw error;
  }
  return surface;
}

function normalizeContextRefs(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 100)
    .map(item => {
      if (typeof item === 'string') {
        const id = cleanString(item, 500);
        return id ? Object.freeze({ ref: id }) : null;
      }
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const copy = {};
      for (const [key, raw] of Object.entries(item)) {
        if (raw == null) continue;
        if (['string', 'number', 'boolean'].includes(typeof raw)) copy[key] = raw;
      }
      return Object.keys(copy).length ? Object.freeze(copy) : null;
    })
    .filter(Boolean);
}

function freezeEnvelope(envelope) {
  for (const key of [
    'inputs',
    'constraints',
    'outputs',
    'language',
    'risk',
    'budget',
    'clientState',
    'metadata'
  ]) {
    Object.freeze(envelope[key]);
  }
  Object.freeze(envelope.contextRefs);
  return Object.freeze(envelope);
}

function normalizeUniversalRequest(source = {}, options = {}) {
  const body = plainObject(source);
  const opts = plainObject(options);

  const surface = normalizeSurface(
    body.surface != null ? body.surface : opts.surface
  );

  const goal = cleanString(
    body.goal != null ? body.goal : opts.goal,
    MAX_GOAL
  );
  if (!goal) {
    const error = new Error('universal_request_goal_required');
    error.code = 'UNIVERSAL_REQUEST_GOAL_REQUIRED';
    throw error;
  }

  const envelope = {
    schemaVersion: '1.0',
    requestId: normalizeRequestId(
      body.requestId != null
        ? body.requestId
        : body.request_id != null
          ? body.request_id
          : opts.requestId
    ),
    surface,
    goal,
    inputs: { ...plainObject(body.inputs) },
    constraints: { ...plainObject(body.constraints) },
    outputs: { ...plainObject(body.outputs) },
    contextRefs: normalizeContextRefs(
      body.contextRefs != null ? body.contextRefs : body.context_refs
    ),
    language: { ...plainObject(body.language) },
    risk: { ...plainObject(body.risk) },
    budget: { ...plainObject(body.budget) },
    clientState: {
      ...plainObject(
        body.clientState != null ? body.clientState : body.client_state
      )
    },
    metadata: { ...plainObject(body.metadata) }
  };

  if (opts.legacy === true) {
    envelope.metadata = {
      ...envelope.metadata,
      legacyAdapted: true
    };
  }

  return freezeEnvelope(envelope);
}

function firstUserGoal(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || String(message.role || '').toLowerCase() !== 'user') continue;
    if (typeof message.content === 'string') {
      const text = cleanString(message.content, MAX_GOAL);
      if (text) return text;
    }
    if (Array.isArray(message.content)) {
      const text = message.content
        .filter(part => part && part.type === 'text' && typeof part.text === 'string')
        .map(part => part.text)
        .join('\n')
        .trim();
      if (text) return text.slice(0, MAX_GOAL);
    }
  }
  return '';
}

function legacyGoal(body, surface) {
  const source = plainObject(body);
  if (surface === 'chat' || surface === 'code' || surface === 'work') {
    return (
      cleanString(source.prompt, MAX_GOAL) ||
      cleanString(source.message, MAX_GOAL) ||
      firstUserGoal(source.messages)
    );
  }
  return (
    cleanString(source.prompt, MAX_GOAL) ||
    cleanString(source.description, MAX_GOAL) ||
    cleanString(source.goal, MAX_GOAL)
  );
}

function normalizeSurfaceRequest({
  surface,
  body = {},
  requestId = null,
  existingEnvelope = null
} = {}) {
  const legacyBody = plainObject(body);
  const suppliedEnvelope =
    existingEnvelope ||
    (legacyBody.request && typeof legacyBody.request === 'object'
      ? legacyBody.request
      : legacyBody.universalRequest && typeof legacyBody.universalRequest === 'object'
        ? legacyBody.universalRequest
        : null);

  if (suppliedEnvelope) {
    return normalizeUniversalRequest(
      {
        ...suppliedEnvelope,
        surface:
          suppliedEnvelope.surface != null ? suppliedEnvelope.surface : surface,
        requestId:
          suppliedEnvelope.requestId != null
            ? suppliedEnvelope.requestId
            : requestId
      },
      { surface, requestId }
    );
  }

  const normalizedSurface = normalizeSurface(surface);
  const goal = legacyGoal(legacyBody, normalizedSurface);
  if (!goal) {
    const error = new Error('universal_request_goal_required');
    error.code = 'UNIVERSAL_REQUEST_GOAL_REQUIRED';
    throw error;
  }

  const inputs = {};
  if (Array.isArray(legacyBody.messages)) inputs.messages = legacyBody.messages;
  if (legacyBody.prompt != null) inputs.prompt = legacyBody.prompt;
  if (legacyBody.feature != null) inputs.feature = legacyBody.feature;
  if (legacyBody.aspectRatio != null) inputs.aspectRatio = legacyBody.aspectRatio;
  if (legacyBody.duration != null) inputs.duration = legacyBody.duration;
  if (legacyBody.model != null) inputs.model = legacyBody.model;
  if (legacyBody.attachment != null) inputs.attachment = legacyBody.attachment;

  const constraints = {};
  if (legacyBody.preferences != null) constraints.preferences = legacyBody.preferences;
  if (legacyBody.options != null) constraints.options = legacyBody.options;

  return normalizeUniversalRequest(
    {
      requestId,
      surface: normalizedSurface,
      goal,
      inputs,
      constraints,
      outputs: {},
      contextRefs: legacyBody.contextRefs || legacyBody.context_refs || [],
      language:
        typeof legacyBody.language === 'string'
          ? { requested: legacyBody.language }
          : plainObject(legacyBody.language),
      risk: {},
      budget: {},
      clientState: plainObject(
        legacyBody.clientState || legacyBody.client_state
      ),
      metadata: {
        legacyFeature:
          legacyBody.feature == null ? null : String(legacyBody.feature)
      }
    },
    { legacy: true }
  );
}

function assertUniversalRequest(value) {
  const normalized = normalizeUniversalRequest(value);
  for (const key of SCHEMA.required) {
    if (!(key in normalized)) {
      const error = new Error(`universal_request_required_field_missing:${key}`);
      error.code = 'UNIVERSAL_REQUEST_INVALID';
      throw error;
    }
  }
  return normalized;
}

module.exports = {
  SCHEMA,
  normalizeUniversalRequest,
  normalizeSurfaceRequest,
  assertUniversalRequest
};
