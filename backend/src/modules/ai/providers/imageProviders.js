'use strict';

const { createReplicateImageAdapter, REPLICATE_IMAGE_MODEL } = require('../../../../lib/replicateImageAdapter');

const DEFAULT_IMAGE_PROVIDER = 'replicate';
const DEFAULT_IMAGE_MODEL = REPLICATE_IMAGE_MODEL;
const DEFAULT_FAL_IMAGE_MODEL = 'fal-ai/flux/schnell';
const DEFAULT_FAL_KONTEXT_MODEL = 'fal-ai/flux-pro/kontext/multi';
const DEFAULT_FAL_EDIT_MODEL = 'fal-ai/flux-pro/kontext';
const DEFAULT_FAL_INPAINT_MODEL = 'fal-ai/qwen-image-edit/inpaint';
const DEFAULT_FAL_OUTPAINT_MODEL = 'fal-ai/image-apps-v2/outpaint';
const DEFAULT_FAL_BACKGROUND_MODEL = 'fal-ai/birefnet/v2';
const DEFAULT_FAL_UPSCALE_MODEL = 'fal-ai/flux-vision-upscaler';
const DEFAULT_FAL_RELIGHT_MODEL = 'fal-ai/image-apps-v2/relighting';
const HF_FAL_ROUTER_BASE = 'https://router.huggingface.co/fal-ai';
const providers = new Map();
const { assertImageProviderCapabilities } = require('../../../../lib/imageCapabilityGate');
const { assertImageRequestAvailable } = require('../../../../lib/imageOperationRegistry');
const { normalizeImageRequest } = require('../../../../lib/imageRequestContract');

function registerImageProvider(key, adapter) {
  if (!key || typeof adapter?.generate !== 'function') {
    throw new Error('Image provider must implement generate(prompt, opts)');
  }

  providers.set(key, {
    label: adapter.label || key,
    generate: adapter.generate,
    // Defaults fail closed until an adapter implements a capability.
    capabilities: Object.freeze({ operations: ['generate'], ...(adapter.capabilities || {}) }),
    isConfigured: adapter.isConfigured || (() => true),
  });
}

function getImageProvider(key) {
  return providers.get(key);
}

function listImageProviders() {
  return [...providers.entries()].map(([key, provider]) => ({
    key,
    label: provider.label,
    configured: Boolean(provider.isConfigured()),
  }));
}

function normalizeOutput(output) {
  if (Array.isArray(output)) return normalizeOutput(output[0] || null);
  if (typeof output === 'string') return output;

  if (output && typeof output.url === 'function') {
    return output.url();
  }

  if (output?.url) return output.url;
  return null;
}

function normalizeOutputUrls(output) {
  if (Array.isArray(output)) {
    return output.flatMap(item => normalizeOutputUrls(item));
  }
  if (typeof output === 'string') {
    return /^https:\/\//i.test(output) ? [output] : [];
  }
  if (output && Array.isArray(output.images)) {
    return output.images.flatMap(item => normalizeOutputUrls(item));
  }
  if (output && typeof output.url === 'function') {
    const url = output.url();
    return typeof url === 'string' ? [url] : [];
  }
  if (output?.url && typeof output.url === 'string') {
    return [output.url];
  }
  return [];
}

function modelFor(providerKey, opts = {}) {
  if (opts.models && opts.models[providerKey]) return String(opts.models[providerKey]);
  if (opts.model) return String(opts.model);
  if (providerKey === 'replicate') {
    return process.env.REPLICATE_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  }
  if (providerKey === 'fal') {
    return process.env.FAL_IMAGE_MODEL || DEFAULT_FAL_IMAGE_MODEL;
  }
  return null;
}

function sanitizeProviderMessage(value) {
  const text = value == null ? '' : String(value);
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\br8_[A-Za-z0-9_-]+\b/g, 'r8_[REDACTED]')
    .replace(/\bhf_[A-Za-z0-9_-]+\b/g, 'hf_[REDACTED]')
    .replace(/([?&](?:token|key|api_key|access_token)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, 600);
}

function providerFailureEvidence(error) {
  const cause = error && error.cause ? error.cause : null;
  const statusCode =
    error?.statusCode ??
    cause?.statusCode ??
    cause?.status ??
    cause?.response?.status ??
    null;
  const providerCode =
    error?.providerCode ??
    cause?.code ??
    cause?.name ??
    null;
  const providerMessage = sanitizeProviderMessage(
    cause?.message || error?.message || ''
  );

  return {
    error: error?.message || 'provider_request_failed',
    code: error?.code || null,
    providerCode: providerCode ? String(providerCode) : null,
    statusCode: Number.isFinite(Number(statusCode)) ? Number(statusCode) : null,
    retryable:
      typeof error?.retryable === 'boolean'
        ? error.retryable
        : null,
    providerMessage
  };
}

function providerAttemptRetryable(attempt) {
  if (!attempt || attempt.status !== 'error') return false;
  if (typeof attempt.retryable === 'boolean') return attempt.retryable;
  const status = Number(attempt.statusCode);
  if ([400, 401, 402, 403, 404, 409, 422].includes(status)) return false;
  if (status === 408 || status === 429 || status >= 500) return true;
  return true;
}

function huggingFaceProviderError(message, response, body = '') {
  const error = new Error(message);
  error.statusCode = Number(response && response.status) || null;
  error.providerCode = 'HuggingFaceInferenceProviderError';
  error.retryable =
    error.statusCode === 408 ||
    error.statusCode === 429 ||
    Number(error.statusCode) >= 500;
  error.cause = new Error(
    `${message}: ${error.statusCode || 'unknown'} ${sanitizeProviderMessage(body || response?.statusText || '')}`
  );
  return error;
}

async function fetchJson(url, options = {}, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    const error = new Error('provider_fetch_unavailable');
    error.retryable = false;
    throw error;
  }

  const response = await fetchImpl(url, options);
  const body = await response.text();
  if (!response.ok) {
    throw huggingFaceProviderError('huggingface_provider_request_failed', response, body);
  }

  try {
    return JSON.parse(body);
  } catch (cause) {
    const error = new Error('huggingface_provider_invalid_json');
    error.providerCode = 'HuggingFaceInferenceProviderOutputError';
    error.statusCode = Number(response.status) || null;
    error.retryable = false;
    error.cause = cause;
    throw error;
  }
}

function validateFalProviderModel(model) {
  const value = String(model || '').trim();
  if (!/^fal-ai\/[A-Za-z0-9._/-]+$/.test(value) || value.includes('..')) {
    const error = new Error('invalid_fal_provider_model');
    error.statusCode = 400;
    error.retryable = false;
    throw error;
  }
  return value;
}

async function generateViaHuggingFaceFal(prompt, opts = {}) {
  const token = String(opts.apiKey || process.env.HF_TOKEN || '').trim();
  if (!token) {
    const error = new Error('missing_huggingface_token');
    error.statusCode = 401;
    error.retryable = false;
    throw error;
  }

  const model = validateFalProviderModel(
    opts.model || process.env.FAL_IMAGE_MODEL || DEFAULT_FAL_IMAGE_MODEL
  );
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  const query = '?_subdomain=queue';
  const submitUrl = `${HF_FAL_ROUTER_BASE}/${model}${query}`;
  const submitted = await fetchJson(
    submitUrl,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: String(prompt || ''),
        image_size: 'landscape_4_3',
        num_images: 1,
        enable_safety_checker: true,
        output_format: 'jpeg',
        ...(opts.input || {})
      })
    },
    fetchImpl
  );

  if (!submitted || typeof submitted.response_url !== 'string') {
    const error = new Error('huggingface_fal_missing_response_url');
    error.providerCode = 'HuggingFaceInferenceProviderOutputError';
    error.retryable = false;
    throw error;
  }

  let routedPath;
  try {
    routedPath = new URL(submitted.response_url).pathname;
  } catch (_) {
    const error = new Error('huggingface_fal_invalid_response_url');
    error.providerCode = 'HuggingFaceInferenceProviderOutputError';
    error.retryable = false;
    throw error;
  }

  if (
    !/^\/fal-ai\/[A-Za-z0-9._/-]+\/requests\/[A-Za-z0-9._-]+$/.test(routedPath) ||
    routedPath.includes('..')
  ) {
    const error = new Error('huggingface_fal_unsafe_response_path');
    error.providerCode = 'HuggingFaceInferenceProviderOutputError';
    error.retryable = false;
    throw error;
  }

  const statusUrl = `${HF_FAL_ROUTER_BASE}${routedPath}/status${query}`;
  const resultUrl = `${HF_FAL_ROUTER_BASE}${routedPath}${query}`;
  let status = String(submitted.status || '').toUpperCase();
  const deadline = Date.now() + Number(opts.pollTimeoutMs || 90_000);

  while (status !== 'COMPLETED') {
    if (['FAILED', 'CANCELLED', 'ERROR'].includes(status)) {
      const error = new Error(`huggingface_fal_${status.toLowerCase()}`);
      error.providerCode = 'HuggingFaceInferenceProviderJobError';
      error.retryable = false;
      throw error;
    }
    if (Date.now() >= deadline) {
      const error = new Error('huggingface_fal_poll_timeout');
      error.providerCode = 'HuggingFaceInferenceProviderTimeout';
      error.statusCode = 408;
      error.retryable = true;
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, Number(opts.pollIntervalMs || 500)));
    const polled = await fetchJson(statusUrl, { method: 'GET', headers }, fetchImpl);
    status = String(polled && polled.status || '').toUpperCase();
  }

  const result = await fetchJson(resultUrl, { method: 'GET', headers }, fetchImpl);
  const url = result?.images?.[0]?.url;
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
    const error = new Error('huggingface_fal_returned_no_image_url');
    error.providerCode = 'HuggingFaceInferenceProviderOutputError';
    error.retryable = false;
    throw error;
  }

  return url;
}

function buildFalKontextInput(prompt, request, resolved) {
  const references = Array.isArray(resolved?.references)
    ? resolved.references.map(item => item?.url).filter(Boolean)
    : [];
  const sourceUrl = resolved?.source?.url || null;
  const imageUrls = [...references];

  if (sourceUrl && !imageUrls.includes(sourceUrl)) {
    imageUrls.push(sourceUrl);
  }

  if (imageUrls.length < 1 || imageUrls.length > 4) {
    const error = new Error('fal_kontext_reference_count_invalid');
    error.statusCode = 400;
    error.retryable = false;
    throw error;
  }

  const options = request?.options || {};
  return Object.freeze({
    prompt: String(prompt || ''),
    image_urls: Object.freeze([...imageUrls]),
    aspect_ratio: options.ratio || '1:1',
    num_images: Number(options.quantity || 1),
    ...(options.seed === null || options.seed === undefined
      ? {}
      : { seed: Number(options.seed) }),
    output_format: 'jpeg',
    safety_tolerance: '2'
  });
}


function buildFalEditInput(prompt, request, resolved) {
  const sourceUrl = resolved?.source?.url || null;
  if (!sourceUrl) {
    const error = new Error('fal_edit_source_required');
    error.statusCode = 400;
    error.retryable = false;
    throw error;
  }

  const options = request?.options || {};
  return Object.freeze({
    prompt: String(prompt || ''),
    image_url: sourceUrl,
    aspect_ratio: options.ratio || '1:1',
    num_images: Number(options.quantity || 1),
    ...(options.seed === null || options.seed === undefined
      ? {}
      : { seed: Number(options.seed) }),
    output_format: 'jpeg',
    safety_tolerance: '2'
  });
}

function buildFalInpaintInput(prompt, request, resolved) {
  const sourceUrl = resolved?.source?.url || null;
  const maskUrl = resolved?.mask?.url || null;
  if (!sourceUrl || !maskUrl) {
    const error = new Error('fal_inpaint_source_mask_required');
    error.statusCode = 400;
    error.retryable = false;
    throw error;
  }

  const options = request?.options || {};
  const imageSizeByRatio = {
    '1:1': 'square_hd',
    '16:9': 'landscape_16_9',
    '9:16': 'portrait_16_9',
    '4:3': 'landscape_4_3',
    '3:4': 'portrait_4_3'
  };

  return Object.freeze({
    prompt: String(prompt || ''),
    image_url: sourceUrl,
    mask_url: maskUrl,
    image_size: imageSizeByRatio[options.ratio || '1:1'],
    num_images: Number(options.quantity || 1),
    ...(options.seed === null || options.seed === undefined
      ? {}
      : { seed: Number(options.seed) }),
    ...(options.strength === undefined
      ? {}
      : { strength: Number(options.strength) }),
    acceleration: 'regular',
    enable_safety_checker: true,
    output_format: 'png'
  });
}

function buildFalOutpaintInput(prompt, request, resolved) {
  const sourceUrl = resolved?.source?.url || null;
  if (!sourceUrl) {
    const error = new Error('fal_outpaint_source_required');
    error.statusCode = 400;
    error.retryable = false;
    throw error;
  }

  const options = request?.options || {};
  const input = {
    image_url: sourceUrl,
    prompt: String(prompt || ''),
    num_images: Number(options.quantity || 1),
    enable_safety_checker: true,
    output_format: 'png'
  };

  for (const [optionKey, providerKey] of [
    ['expandLeft', 'expand_left'],
    ['expandRight', 'expand_right'],
    ['expandTop', 'expand_top'],
    ['expandBottom', 'expand_bottom']
  ]) {
    if (options[optionKey] !== undefined) {
      input[providerKey] = Number(options[optionKey]);
    }
  }

  if (options.zoomOutPercentage !== undefined) {
    input.zoom_out_percentage = Number(options.zoomOutPercentage);
  }
  if (options.seed !== null && options.seed !== undefined) {
    input.seed = Number(options.seed);
  }

  return Object.freeze(input);
}

async function generateDirectFalImages({
  model,
  input,
  apiKey,
  falClient
}) {
  const client =
    falClient ||
    (await import('@fal-ai/client')).fal;

  client.config({
    credentials: apiKey || process.env.FAL_KEY
  });

  const result = await client.subscribe(model, {
    input,
    logs: false
  });

  return normalizeOutputUrls(
    result?.data?.images || result?.data || result
  );
}


function buildFalBackgroundRemovalInput(request, resolved) {
  const sourceUrl = resolved?.source?.url || null;
  if (!sourceUrl) {
    const error = new Error('fal_background_source_required');
    error.statusCode = 400;
    error.retryable = false;
    throw error;
  }

  return Object.freeze({
    image_url: sourceUrl,
    model: 'General Use (Light)',
    operating_resolution: '1024x1024',
    refine_foreground: true,
    output_format: 'png'
  });
}

function buildFalUpscaleInput(request, resolved) {
  const sourceUrl = resolved?.source?.url || null;
  if (!sourceUrl) {
    const error = new Error('fal_upscale_source_required');
    error.statusCode = 400;
    error.retryable = false;
    throw error;
  }

  const options = request?.options || {};
  const upscaleFactor =
    options.upscaleFactor === undefined
      ? 2
      : Number(options.upscaleFactor);

  const creativity =
    options.upscaleCreativity === undefined
      ? 0.3
      : Number(options.upscaleCreativity);

  if (
    !Number.isFinite(upscaleFactor) ||
    upscaleFactor < 1 ||
    upscaleFactor > 4
  ) {
    const error = new Error('invalid_fal_upscale_factor');
    error.statusCode = 400;
    error.retryable = false;
    throw error;
  }

  if (
    !Number.isFinite(creativity) ||
    creativity < 0 ||
    creativity > 1
  ) {
    const error = new Error('invalid_fal_upscale_creativity');
    error.statusCode = 400;
    error.retryable = false;
    throw error;
  }

  return Object.freeze({
    image_url: sourceUrl,
    upscale_factor: upscaleFactor,
    creativity,
    guidance: 1,
    steps: 20,
    enable_safety_checker: true,
    ...(options.seed === null || options.seed === undefined
      ? {}
      : { seed: Number(options.seed) })
  });
}

function buildFalRelightInput(request, resolved) {
  const sourceUrl = resolved?.source?.url || null;
  if (!sourceUrl) {
    const error = new Error('fal_relight_source_required');
    error.statusCode = 400;
    error.retryable = false;
    throw error;
  }

  const options = request?.options || {};
  const lightingStyle =
    String(options.lightingStyle || 'natural')
      .trim()
      .toLowerCase();

  const styles = new Set([
    'natural',
    'studio',
    'golden_hour',
    'blue_hour',
    'dramatic',
    'soft',
    'hard',
    'backlight',
    'side_light',
    'front_light',
    'rim_light',
    'sunset',
    'sunrise',
    'neon',
    'candlelight',
    'moonlight',
    'spotlight',
    'ambient'
  ]);

  if (!styles.has(lightingStyle)) {
    const error = new Error('invalid_fal_relight_style');
    error.statusCode = 400;
    error.retryable = false;
    throw error;
  }

  return Object.freeze({
    image_url: sourceUrl,
    lighting_style: lightingStyle,
    aspect_ratio: {
      ratio: options.ratio || '1:1'
    }
  });
}

async function directFalSingleImage({
  model,
  input,
  falClient,
  apiKey,
  outputSelector
}) {
  const client =
    falClient ||
    (await import('@fal-ai/client')).fal;

  client.config({
    credentials: apiKey || process.env.FAL_KEY
  });

  const result = await client.subscribe(model, {
    input,
    logs: false
  });

  const selected =
    typeof outputSelector === 'function'
      ? outputSelector(result)
      : result?.data;

  const urls = normalizeOutputUrls(selected);

  if (urls.length !== 1) {
    const error = new Error('fal_utility_output_count_mismatch');
    error.statusCode = 502;
    error.retryable = false;
    throw error;
  }

  return urls;
}

async function generateImage(prompt, opts = {}) {
  const chain = opts.chain || [DEFAULT_IMAGE_PROVIDER];
  const attempts = [];

  for (const providerKey of chain) {
    const provider = getImageProvider(providerKey);

    if (!provider) {
      attempts.push({ provider: providerKey, status: 'skipped', error: 'provider_not_registered' });
      continue;
    }

    if (!provider.isConfigured()) {
      attempts.push({ provider: providerKey, status: 'skipped', error: 'provider_not_configured' });
      continue;
    }

    const model = modelFor(providerKey, opts);

    try {
      const request = opts.imageRequest || normalizeImageRequest({
        imageOperation: opts.imageOperation,
        referenceAssetIds: opts.referenceAssetIds,
        sourceAssetId: opts.sourceAssetId,
        maskAssetId: opts.maskAssetId,
        imageOptions: opts.imageOptions
      });
      assertImageProviderCapabilities(request, provider.capabilities);
      // Preserve the price/option gate for every fallback, before any provider call.
      try { assertImageRequestAvailable(request); }
      catch (error) { error.statusCode = 400; error.retryable = false; throw error; }
      const startedAt = Date.now();
      const result = await provider.generate(prompt, { ...opts, model });
      const urls = normalizeOutputUrls(result);
      const url = urls[0] || null;

      if (!url) throw new Error('provider_returned_no_image_url');

      attempts.push({
        provider: providerKey,
        model,
        status: 'success',
        latencyMs: Date.now() - startedAt
      });
      return {
        url,
        urls: Object.freeze([...urls]),
        provider: providerKey,
        model,
        attempts
      };
    } catch (error) {
      attempts.push({
        provider: providerKey,
        model,
        status: 'error',
        ...providerFailureEvidence(error)
      });
    }
  }

  const error = new Error('all_image_providers_failed');
  error.code = 'all_image_providers_failed';
  error.attempts = attempts;
  const actualErrors = attempts.filter(attempt => attempt.status === 'error');
  error.retryable =
    actualErrors.length === 0 ||
    actualErrors.some(providerAttemptRetryable);
  throw error;
}

registerImageProvider('fal', {
  label: 'Fal AI',
  isConfigured: () => Boolean(process.env.HF_TOKEN || process.env.FAL_KEY),
  async generate(prompt, opts = {}) {
    const model = opts.model || process.env.FAL_IMAGE_MODEL || DEFAULT_FAL_IMAGE_MODEL;

    // Prefer Hugging Face Inference Providers routing when an HF token exists.
    // This keeps the same Fal model/cost semantics but uses the user's Hugging Face
    // Inference Providers credits instead of a separate direct Fal account balance.
    if (process.env.HF_TOKEN) {
      return generateViaHuggingFaceFal(prompt, {
        ...opts,
        model,
        apiKey: process.env.HF_TOKEN
      });
    }

    const { fal } = await import('@fal-ai/client');
    fal.config({ credentials: opts.apiKey || process.env.FAL_KEY });
    const result = await fal.subscribe(model, {
      input: {
        prompt,
        image_size: 'landscape_4_3',
        num_images: 1,
        enable_safety_checker: true,
        output_format: 'jpeg',
        ...(opts.input || {})
      },
      logs: false,
    });
    const url = result?.data?.images?.[0]?.url;
    if (!url) throw new Error('fal_returned_no_image_url');
    return url;
  },
});

registerImageProvider('fal-kontext', {
  label: 'Fal AI Kontext',
  capabilities: {
    operations: ['reference_generate', 'variations'],
    referenceAssets: true,
    sourceAsset: true,
    maskAsset: false,
    seed: true,
    quantity: true,
    maxQuantity: 4
  },
  isConfigured: () => Boolean(process.env.FAL_KEY),
  async generate(prompt, opts = {}) {
    const model =
      opts.model ||
      process.env.FAL_KONTEXT_IMAGE_MODEL ||
      DEFAULT_FAL_KONTEXT_MODEL;

    const input = buildFalKontextInput(
      prompt,
      opts.imageRequest || {},
      opts.resolvedImageInputs || {}
    );

    const falClient =
      opts.falClient ||
      (await import('@fal-ai/client')).fal;

    falClient.config({
      credentials: opts.apiKey || process.env.FAL_KEY
    });

    const result = await falClient.subscribe(model, {
      input,
      logs: false
    });

    const urls =
      normalizeOutputUrls(result?.data?.images || result?.data);

    if (urls.length !== input.num_images) {
      const error = new Error('fal_kontext_output_count_mismatch');
      error.statusCode = 502;
      error.retryable = false;
      throw error;
    }

    return urls;
  }
});


registerImageProvider('fal-edit', {
  label: 'Fal AI Kontext Edit',
  capabilities: {
    operations: ['edit'],
    sourceAsset: true,
    maskAsset: false,
    seed: true,
    quantity: true,
    maxQuantity: 4
  },
  isConfigured: () => Boolean(process.env.FAL_KEY),
  async generate(prompt, opts = {}) {
    const model =
      opts.model ||
      process.env.FAL_EDIT_IMAGE_MODEL ||
      DEFAULT_FAL_EDIT_MODEL;

    const input = buildFalEditInput(
      prompt,
      opts.imageRequest || {},
      opts.resolvedImageInputs || {}
    );

    const urls = await generateDirectFalImages({
      model,
      input,
      apiKey: opts.apiKey || process.env.FAL_KEY,
      falClient: opts.falClient
    });

    if (urls.length !== Number(input.num_images)) {
      const error = new Error('fal_edit_output_count_mismatch');
      error.statusCode = 502;
      error.retryable = false;
      throw error;
    }
    return urls;
  }
});

registerImageProvider('fal-inpaint', {
  label: 'Fal AI Qwen Inpaint',
  capabilities: {
    operations: ['inpaint'],
    sourceAsset: true,
    maskAsset: true,
    seed: true,
    quantity: true,
    maxQuantity: 4
  },
  isConfigured: () => Boolean(process.env.FAL_KEY),
  async generate(prompt, opts = {}) {
    const model =
      opts.model ||
      process.env.FAL_INPAINT_IMAGE_MODEL ||
      DEFAULT_FAL_INPAINT_MODEL;

    const input = buildFalInpaintInput(
      prompt,
      opts.imageRequest || {},
      opts.resolvedImageInputs || {}
    );

    const urls = await generateDirectFalImages({
      model,
      input,
      apiKey: opts.apiKey || process.env.FAL_KEY,
      falClient: opts.falClient
    });

    if (urls.length !== Number(input.num_images)) {
      const error = new Error('fal_inpaint_output_count_mismatch');
      error.statusCode = 502;
      error.retryable = false;
      throw error;
    }
    return urls;
  }
});

registerImageProvider('fal-outpaint', {
  label: 'Fal AI Outpaint',
  capabilities: {
    operations: ['expand'],
    sourceAsset: true,
    maskAsset: false,
    seed: true,
    quantity: true,
    maxQuantity: 4
  },
  isConfigured: () => Boolean(process.env.FAL_KEY),
  async generate(prompt, opts = {}) {
    const model =
      opts.model ||
      process.env.FAL_OUTPAINT_IMAGE_MODEL ||
      DEFAULT_FAL_OUTPAINT_MODEL;

    const input = buildFalOutpaintInput(
      prompt,
      opts.imageRequest || {},
      opts.resolvedImageInputs || {}
    );

    const urls = await generateDirectFalImages({
      model,
      input,
      apiKey: opts.apiKey || process.env.FAL_KEY,
      falClient: opts.falClient
    });

    if (urls.length !== Number(input.num_images)) {
      const error = new Error('fal_outpaint_output_count_mismatch');
      error.statusCode = 502;
      error.retryable = false;
      throw error;
    }
    return urls;
  }
});


registerImageProvider('fal-background', {
  label: 'Fal AI BiRefNet V2 Background Removal',
  capabilities: {
    operations: ['remove_background'],
    sourceAsset: true,
    maskAsset: false,
    seed: false,
    quantity: false,
    maxQuantity: 1
  },
  isConfigured: () => Boolean(process.env.FAL_KEY),
  async generate(_prompt, opts = {}) {
    const model =
      opts.model ||
      process.env.FAL_BACKGROUND_IMAGE_MODEL ||
      DEFAULT_FAL_BACKGROUND_MODEL;

    const input = buildFalBackgroundRemovalInput(
      opts.imageRequest || {},
      opts.resolvedImageInputs || {}
    );

    return directFalSingleImage({
      model,
      input,
      falClient: opts.falClient,
      apiKey: opts.apiKey || process.env.FAL_KEY,
      outputSelector: result =>
        result?.data?.image || result?.data
    });
  }
});

registerImageProvider('fal-upscale', {
  label: 'Fal AI Flux Vision Upscaler',
  capabilities: {
    operations: ['upscale'],
    sourceAsset: true,
    maskAsset: false,
    seed: true,
    quantity: false,
    maxQuantity: 1
  },
  isConfigured: () => Boolean(process.env.FAL_KEY),
  async generate(_prompt, opts = {}) {
    const model =
      opts.model ||
      process.env.FAL_UPSCALE_IMAGE_MODEL ||
      DEFAULT_FAL_UPSCALE_MODEL;

    const input = buildFalUpscaleInput(
      opts.imageRequest || {},
      opts.resolvedImageInputs || {}
    );

    return directFalSingleImage({
      model,
      input,
      falClient: opts.falClient,
      apiKey: opts.apiKey || process.env.FAL_KEY,
      outputSelector: result =>
        result?.data?.image || result?.data
    });
  }
});

registerImageProvider('fal-relight', {
  label: 'Fal AI Image Apps V2 Relighting',
  capabilities: {
    operations: ['relight'],
    sourceAsset: true,
    maskAsset: false,
    seed: false,
    quantity: false,
    maxQuantity: 1
  },
  isConfigured: () => Boolean(process.env.FAL_KEY),
  async generate(_prompt, opts = {}) {
    const model =
      opts.model ||
      process.env.FAL_RELIGHT_IMAGE_MODEL ||
      DEFAULT_FAL_RELIGHT_MODEL;

    const input = buildFalRelightInput(
      opts.imageRequest || {},
      opts.resolvedImageInputs || {}
    );

    return directFalSingleImage({
      model,
      input,
      falClient: opts.falClient,
      apiKey: opts.apiKey || process.env.FAL_KEY,
      outputSelector: result =>
        result?.data?.images || result?.data
    });
  }
});

registerImageProvider('replicate', {
  label: 'Replicate',
  isConfigured: () => Boolean(process.env.REPLICATE_API_TOKEN),
  async generate(prompt, opts = {}) {
    const model = opts.model || process.env.REPLICATE_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
    const adapter = createReplicateImageAdapter({ token: opts.apiKey || process.env.REPLICATE_API_TOKEN });
    const normalized = await adapter.invoke({
      requestId: opts.requestId || `image-${Date.now()}`,
      capability: 'image.generate',
      surface: 'image',
      modelId: model,
      input: { prompt },
      options: { format: 'webp' }
    });
    if (!normalized.output.primaryUrl) throw new Error('replicate_returned_no_image_url');
    return normalized.output.primaryUrl;
  },
});

module.exports = {
  DEFAULT_IMAGE_PROVIDER,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_FAL_IMAGE_MODEL,
  DEFAULT_FAL_KONTEXT_MODEL,
  DEFAULT_FAL_EDIT_MODEL,
  DEFAULT_FAL_INPAINT_MODEL,
  DEFAULT_FAL_OUTPAINT_MODEL,
  DEFAULT_FAL_BACKGROUND_MODEL,
  DEFAULT_FAL_UPSCALE_MODEL,
  DEFAULT_FAL_RELIGHT_MODEL,
  HF_FAL_ROUTER_BASE,
  registerImageProvider,
  getImageProvider,
  listImageProviders,
  normalizeOutput,
  normalizeOutputUrls,
  buildFalKontextInput,
  buildFalEditInput,
  buildFalInpaintInput,
  buildFalOutpaintInput,
  buildFalBackgroundRemovalInput,
  buildFalUpscaleInput,
  buildFalRelightInput,
  sanitizeProviderMessage,
  providerFailureEvidence,
  providerAttemptRetryable,
  generateViaHuggingFaceFal,
  generateImage,
};
