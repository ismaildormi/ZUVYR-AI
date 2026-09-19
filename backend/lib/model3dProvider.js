'use strict';

const config = require('../config/model3d-system.v1.json');
const { assertModel3dLiveAvailable } = require('./model3dPolicy');

const MODELS = Object.freeze(
  Object.fromEntries(
    Object.entries(config.operations).map(([operation, spec]) => [
      operation,
      spec.model
    ])
  )
);

const PROVIDER_VIEW_FIELDS = Object.freeze({
  front: 'input_image_url',
  back: 'back_image_url',
  left: 'left_image_url',
  right: 'right_image_url',
  top: 'top_image_url',
  bottom: 'bottom_image_url',
  leftFront: 'left_front_image_url',
  rightFront: 'right_front_image_url'
});

function providerError(code, statusCode = 502, cause = null) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  error.retryable = false;
  if (cause) error.cause = cause;
  return error;
}

function requireCredential(env = process.env) {
  if (!String(env.FAL_KEY || '').trim()) {
    throw providerError('pack083_fal_not_configured', 503);
  }
  return env.FAL_KEY;
}

function buildInput(request, resolvedInputs = {}) {
  const input = {
    generate_type: request.options.generateType,
    face_count: request.options.faceCount
  };

  if (request.options.enablePbr === true) {
    input.enable_pbr = true;
  }

  if (request.operation === 'text_to_3d') {
    input.prompt = request.prompt;
  } else {
    for (const [role, field] of Object.entries(PROVIDER_VIEW_FIELDS)) {
      const url = resolvedInputs.views?.[role]?.url;
      if (url) input[field] = url;
    }
    if (!input.input_image_url) {
      throw providerError('pack083_front_view_url_required', 400);
    }
  }

  return Object.freeze(input);
}

function normalizeFile(raw, role, required = false) {
  if (!raw) {
    if (required) throw providerError('pack083_required_output_missing');
    return null;
  }
  const url = String(raw.url || '').trim();
  if (!/^https:\/\//i.test(url)) {
    throw providerError('pack083_output_url_invalid');
  }
  const fileSize = raw.file_size === undefined || raw.file_size === null
    ? null
    : Number(raw.file_size);
  if (
    fileSize !== null &&
    (!Number.isSafeInteger(fileSize) || fileSize < 0)
  ) {
    throw providerError('pack083_output_size_invalid');
  }
  return Object.freeze({
    role,
    url,
    mimeType: raw.content_type ? String(raw.content_type).toLowerCase() : null,
    fileName: raw.file_name ? String(raw.file_name).slice(0, 240) : null,
    fileSize
  });
}

function normalizeProviderResult(raw) {
  const data = raw?.data || raw;
  if (!data || typeof data !== 'object') {
    throw providerError('pack083_provider_result_invalid');
  }

  const primary = normalizeFile(data.model_glb, 'model_glb', true);
  if (
    primary.mimeType &&
    primary.mimeType !== config.output.primaryMimeType
  ) {
    throw providerError('pack083_primary_output_mime_invalid');
  }

  const artifacts = [primary];
  const thumbnail = normalizeFile(data.thumbnail, 'thumbnail');
  if (thumbnail) artifacts.push(thumbnail);

  const urls = data.model_urls && typeof data.model_urls === 'object'
    ? data.model_urls
    : {};

  for (const format of config.output.supportedExportFormats) {
    const candidate = normalizeFile(urls[format], 'export_' + format);
    if (!candidate) continue;
    if (
      format === 'glb' &&
      candidate.url === primary.url
    ) continue;
    artifacts.push(candidate);
  }

  return Object.freeze({
    provider: 'fal',
    seed:
      Number.isSafeInteger(Number(data.seed))
        ? Number(data.seed)
        : null,
    artifacts: Object.freeze(artifacts)
  });
}

function serializeProviderResult(result) {
  return Object.freeze({
    kind: 'pack083_fal_model3d_result',
    provider: result.provider,
    seed: result.seed,
    artifacts: result.artifacts.map(item => ({
      role: item.role,
      url: item.url,
      mimeType: item.mimeType,
      fileName: item.fileName,
      fileSize: item.fileSize
    }))
  });
}

function restoreProviderResult(value) {
  if (
    !value ||
    value.kind !== 'pack083_fal_model3d_result' ||
    !Array.isArray(value.artifacts)
  ) return null;
  return Object.freeze({
    provider: 'fal',
    seed:
      Number.isSafeInteger(Number(value.seed))
        ? Number(value.seed)
        : null,
    artifacts: Object.freeze(
      value.artifacts.map(item =>
        normalizeFile(
          {
            url: item.url,
            content_type: item.mimeType,
            file_name: item.fileName,
            file_size: item.fileSize
          },
          item.role,
          item.role === 'model_glb'
        )
      )
    )
  });
}

async function falClientFor(env, createFalClient) {
  const key = requireCredential(env);
  if (typeof createFalClient === 'function') {
    return createFalClient(key);
  }
  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: key });
  return fal;
}

async function submitModel3d(request, {
  resolvedInputs = {},
  env = process.env,
  createFalClient = null
} = {}) {
  assertModel3dLiveAvailable(env);
  const model = MODELS[request?.operation];
  if (!model) throw providerError('pack083_model_not_registered', 400);

  const client = await falClientFor(env, createFalClient);
  const input = buildInput(request, resolvedInputs);

  let submitted;
  try {
    submitted = await client.queue.submit(model, { input });
  } catch (cause) {
    throw providerError('pack083_fal_submit_failed', 502, cause);
  }

  const providerRequestId =
    String(submitted?.request_id || submitted?.requestId || '').trim();
  if (providerRequestId.length < 6 || providerRequestId.length > 200) {
    throw providerError('pack083_fal_request_id_missing');
  }

  return Object.freeze({
    provider:'fal',
    model,
    providerRequestId
  });
}

async function fetchModel3dResult({
  operation,
  providerRequestId
} = {}, {
  env = process.env,
  createFalClient = null
} = {}) {
  const model = MODELS[operation];
  if (!model) throw providerError('pack083_model_not_registered', 400);
  const requestId = String(providerRequestId || '').trim();
  if (requestId.length < 6 || requestId.length > 200) {
    throw providerError('pack083_fal_request_id_invalid', 400);
  }

  // Retrieval/cleanup must remain possible after an operator closes the live
  // creation gate. Only the credential is required here.
  const client = await falClientFor(env, createFalClient);

  let raw;
  try {
    raw = await client.queue.result(model, { requestId });
  } catch (cause) {
    throw providerError('pack083_fal_result_failed', 502, cause);
  }

  return Object.freeze({
    provider:'fal',
    model,
    providerRequestId:requestId,
    ...normalizeProviderResult(raw)
  });
}

module.exports = {
  MODELS,
  PROVIDER_VIEW_FIELDS,
  buildInput,
  normalizeProviderResult,
  serializeProviderResult,
  restoreProviderResult,
  submitModel3d,
  fetchModel3dResult
};
