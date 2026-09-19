'use strict';

const config = require('../config/model3d-system.v1.json');

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OPERATIONS = new Set(Object.keys(config.operations));
const VIEW_ROLES = Object.freeze([...config.input.viewRoles]);
const VIEW_ROLE_SET = new Set(VIEW_ROLES);
const GENERATE_TYPES = new Set(config.options.generateTypes);

function requestError(code, statusCode = 400) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  error.retryable = false;
  return error;
}

function normalizeUuid(value, code) {
  const id = String(value || '').trim();
  if (!UUID.test(id)) throw requestError(code);
  return id;
}

function normalizePrompt(value, required) {
  const prompt = String(value || '').trim();
  const bytes = Buffer.byteLength(prompt, 'utf8');
  if (
    (required && !prompt) ||
    bytes > Number(config.input.maxPromptUtf8Bytes)
  ) {
    throw requestError('model3d_prompt_invalid');
  }
  return prompt;
}

function normalizeViews(raw) {
  if (raw === null || raw === undefined) return Object.freeze({});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw requestError('model3d_views_invalid');
  }

  const normalized = {};
  for (const [role, rawId] of Object.entries(raw)) {
    if (!VIEW_ROLE_SET.has(role)) {
      throw requestError('model3d_view_role_invalid');
    }
    if (rawId === null || rawId === undefined || rawId === '') continue;
    normalized[role] = normalizeUuid(rawId, 'model3d_view_asset_invalid');
  }

  const values = Object.values(normalized);
  if (values.length > config.input.maxViews) {
    throw requestError('model3d_too_many_views');
  }
  if (new Set(values).size !== values.length) {
    throw requestError('model3d_duplicate_view_asset');
  }

  return Object.freeze(normalized);
}

function normalizeOptions(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw requestError('model3d_options_invalid');
  }

  const generateType =
    raw.generateType === undefined
      ? config.options.defaultGenerateType
      : String(raw.generateType || '').trim();

  if (!GENERATE_TYPES.has(generateType)) {
    throw requestError('model3d_generate_type_invalid');
  }

  const faceCount =
    raw.faceCount === undefined
      ? config.options.defaultFaceCount
      : Number(raw.faceCount);

  if (
    !Number.isSafeInteger(faceCount) ||
    faceCount < config.options.minFaceCount ||
    faceCount > config.options.maxFaceCount
  ) {
    throw requestError('model3d_face_count_invalid');
  }

  const requestedPbr =
    raw.enablePbr === undefined
      ? config.options.defaultEnablePbr
      : raw.enablePbr;

  if (typeof requestedPbr !== 'boolean') {
    throw requestError('model3d_enable_pbr_invalid');
  }

  const enablePbr =
    generateType === 'Geometry' ? false : requestedPbr;

  return Object.freeze({
    generateType,
    enablePbr,
    faceCount,
    customFaceCount:
      faceCount !== Number(config.options.defaultFaceCount)
  });
}

function normalizeModel3dRequest({
  prompt,
  model3dOperation = 'text_to_3d',
  model3dViews = {},
  model3dOptions = {}
} = {}) {
  const operation = String(model3dOperation || '').trim().toLowerCase();
  if (!OPERATIONS.has(operation)) {
    throw requestError('unknown_model3d_operation');
  }

  const views = normalizeViews(model3dViews);
  const roles = Object.keys(views);

  if (operation === 'text_to_3d') {
    if (roles.length) throw requestError('model3d_text_views_not_allowed');
  }

  if (operation === 'image_to_3d') {
    if (!views.front || roles.length !== 1) {
      throw requestError('model3d_image_front_view_required');
    }
  }

  if (operation === 'multiview_to_3d') {
    if (!views.front || roles.length < 2) {
      throw requestError('model3d_multiview_requires_multiple_views');
    }
  }

  const normalizedPrompt = normalizePrompt(
    prompt,
    operation === 'text_to_3d'
  );
  const options = normalizeOptions(model3dOptions);

  return Object.freeze({
    operation,
    prompt: normalizedPrompt,
    views,
    viewCount: roles.length,
    options,
    pricing: Object.freeze({
      usesPbrAddon: options.enablePbr === true,
      usesMultiviewAddon: operation === 'multiview_to_3d',
      usesCustomFaceCountAddon: options.customFaceCount === true
    })
  });
}

module.exports = {
  OPERATIONS,
  VIEW_ROLES,
  normalizeModel3dRequest,
  normalizeOptions,
  normalizeViews,
  requestError
};
