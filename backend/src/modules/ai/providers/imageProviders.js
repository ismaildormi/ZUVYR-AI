'use strict';

const { createReplicateImageAdapter, REPLICATE_IMAGE_MODEL } = require('../../../../lib/replicateImageAdapter');

const DEFAULT_IMAGE_PROVIDER = 'replicate';
const DEFAULT_IMAGE_MODEL = REPLICATE_IMAGE_MODEL;
const DEFAULT_FAL_IMAGE_MODEL = 'fal-ai/flux/schnell';
const providers = new Map();

function registerImageProvider(key, adapter) {
  if (!key || typeof adapter?.generate !== 'function') {
    throw new Error('Image provider must implement generate(prompt, opts)');
  }

  providers.set(key, {
    label: adapter.label || key,
    generate: adapter.generate,
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
      const startedAt = Date.now();
      const result = await provider.generate(prompt, { ...opts, model });
      const url = normalizeOutput(result);

      if (!url) throw new Error('provider_returned_no_image_url');

      attempts.push({ provider: providerKey, model, status: 'success', latencyMs: Date.now() - startedAt });
      return { url, provider: providerKey, model, attempts };
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
  isConfigured: () => Boolean(process.env.FAL_KEY),
  async generate(prompt, opts = {}) {
    const { fal } = await import('@fal-ai/client');
    fal.config({ credentials: opts.apiKey || process.env.FAL_KEY });
    const model = opts.model || process.env.FAL_IMAGE_MODEL || DEFAULT_FAL_IMAGE_MODEL;
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
  registerImageProvider,
  getImageProvider,
  listImageProviders,
  normalizeOutput,
  sanitizeProviderMessage,
  providerFailureEvidence,
  providerAttemptRetryable,
  generateImage,
};
