'use strict';

const CONTRACT_VERSION = 'pack-023.provider-adapter-contract.v1';
const SURFACES = Object.freeze(new Set([
  'text', 'image', 'video', 'audio', 'research', '3d', 'browser', 'sandbox'
]));

class ProviderAdapterError extends Error {
  constructor({
    code = 'provider_adapter_error',
    message = 'Provider request failed.',
    providerCode = null,
    statusCode = null,
    retryAfterSeconds = null,
    retryable = null,
    cancelled = false,
    timedOut = false,
    providerId = null,
    capability = null,
    cause = null
  } = {}) {
    super(message);
    this.name = 'ProviderAdapterError';
    this.code = code;
    this.providerCode = providerCode;
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
    this.retryable = retryable;
    this.cancelled = Boolean(cancelled);
    this.timedOut = Boolean(timedOut);
    this.providerId = providerId;
    this.capability = capability;
    if (cause) this.cause = cause;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      providerCode: this.providerCode,
      statusCode: this.statusCode,
      retryAfterSeconds: this.retryAfterSeconds,
      retryable: this.retryable,
      cancelled: this.cancelled,
      timedOut: this.timedOut,
      providerId: this.providerId,
      capability: this.capability,
      message: this.message
    };
  }
}

function text(value) {
  if (value == null) return null;
  const out = String(value).trim();
  return out || null;
}

function nonNegativeNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function nonNegativeInteger(value) {
  const number = nonNegativeNumber(value);
  return Number.isSafeInteger(number) ? number : null;
}

function statusCode(value) {
  const number = nonNegativeInteger(value);
  return number && number >= 100 && number <= 599 ? number : null;
}

function safeOptions(options) {
  const source = options && typeof options === 'object' && !Array.isArray(options)
    ? options
    : {};
  const allowed = [
    'timeoutMs',
    'maxOutputTokens',
    'temperature',
    'topP',
    'seed',
    'size',
    'width',
    'height',
    'durationSeconds',
    'format',
    'responseFormat'
  ];
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  return Object.freeze(out);
}

function validateSignal(signal) {
  if (signal == null) return null;
  if (
    typeof signal !== 'object' ||
    typeof signal.aborted !== 'boolean' ||
    typeof signal.addEventListener !== 'function'
  ) {
    throw new ProviderAdapterError({
      code: 'provider_invalid_abort_signal',
      message: 'Invalid provider cancellation signal.'
    });
  }
  return signal;
}

function normalizeProviderRequest(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ProviderAdapterError({
      code: 'provider_invalid_request',
      message: 'Invalid provider request.'
    });
  }

  const requestId = text(raw.requestId);
  const capability = text(raw.capability);
  const providerId = text(raw.providerId);
  const modelId = text(raw.modelId);
  const surface = text(raw.surface) || inferSurface(capability);

  if (!requestId) {
    throw new ProviderAdapterError({
      code: 'provider_request_id_required',
      message: 'Provider request ID is required.'
    });
  }
  if (!capability) {
    throw new ProviderAdapterError({
      code: 'provider_capability_required',
      message: 'Provider capability is required.'
    });
  }
  if (!providerId) {
    throw new ProviderAdapterError({
      code: 'provider_id_required',
      message: 'Provider ID is required.'
    });
  }
  if (!surface || !SURFACES.has(surface)) {
    throw new ProviderAdapterError({
      code: 'provider_surface_invalid',
      message: 'Provider surface is invalid.',
      providerId,
      capability
    });
  }

  const input = raw.input && typeof raw.input === 'object' && !Array.isArray(raw.input)
    ? JSON.parse(JSON.stringify(raw.input))
    : {};
  const signal = validateSignal(raw.signal);

  const request = {
    contractVersion: CONTRACT_VERSION,
    requestId,
    capability,
    surface,
    providerId,
    modelId,
    input: Object.freeze(input),
    options: safeOptions(raw.options),
    metadata: Object.freeze(sanitizeMetadata(raw.metadata)),
    signal
  };

  throwIfCancelled(request);
  return Object.freeze(request);
}

function inferSurface(capability) {
  const value = text(capability);
  if (!value) return null;
  if (/^(chat|code|multimodal_chat|text)/.test(value)) return 'text';
  if (/^image/.test(value)) return 'image';
  if (/^video/.test(value)) return 'video';
  if (/^(audio|voice|speech|tts|stt)/.test(value)) return 'audio';
  if (/^research/.test(value)) return 'research';
  if (/^(3d|model3d)/.test(value)) return '3d';
  if (/^browser/.test(value)) return 'browser';
  if (/^(sandbox|code_runtime)/.test(value)) return 'sandbox';
  return null;
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const out = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/key|secret|token|authorization|password|credential/i.test(key)) continue;
    if (
      value == null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = value;
    }
  }
  return out;
}

function throwIfCancelled(request) {
  if (request && request.signal && request.signal.aborted) {
    throw new ProviderAdapterError({
      code: 'provider_request_cancelled',
      message: 'Provider request was cancelled.',
      providerId: request.providerId || null,
      capability: request.capability || null,
      cancelled: true,
      retryable: false
    });
  }
}

function canonicalArtifactKind(surface) {
  return {
    image: 'image',
    video: 'video',
    audio: 'audio',
    '3d': 'model3d',
    browser: 'browser_artifact',
    sandbox: 'sandbox_artifact',
    research: 'research_artifact'
  }[surface] || 'file';
}

function validUrl(value) {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function artifactFrom(value, defaults = {}) {
  if (typeof value === 'string') {
    const url = validUrl(value);
    if (!url) return null;
    return {
      kind: defaults.kind || 'file',
      url,
      ref: null,
      mimeType: defaults.mimeType || null,
      name: defaults.name || null,
      providerArtifactId: null
    };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const url = validUrl(
    value.url ??
    value.outputUrl ??
    value.imageUrl ??
    value.videoUrl ??
    value.audioUrl ??
    value.fileUrl
  );
  const ref = text(
    value.ref ??
    value.path ??
    value.fileId ??
    value.artifactId ??
    value.id
  );

  if (!url && !ref) return null;

  return {
    kind: text(value.kind) || defaults.kind || 'file',
    url,
    ref,
    mimeType: text(value.mimeType ?? value.contentType ?? value.mediaType) || defaults.mimeType || null,
    name: text(value.name ?? value.filename) || defaults.name || null,
    providerArtifactId: text(value.providerArtifactId ?? value.artifactId) || null
  };
}

function collectArtifacts(raw, surface) {
  const kind = canonicalArtifactKind(surface);
  const values = [];

  if (typeof raw === 'string') {
    values.push(raw);
  } else if (raw && typeof raw === 'object') {
    for (const key of ['url', 'outputUrl', 'imageUrl', 'videoUrl', 'audioUrl', 'fileUrl']) {
      if (raw[key] != null) values.push(raw[key]);
    }
    if (Array.isArray(raw.urls)) values.push(...raw.urls);
    if (Array.isArray(raw.artifacts)) values.push(...raw.artifacts);
    else if (raw.artifact) values.push(raw.artifact);

    if (raw.output && typeof raw.output === 'object') {
      if (Array.isArray(raw.output)) values.push(...raw.output);
      else {
        if (raw.output.url != null) values.push(raw.output);
        if (Array.isArray(raw.output.artifacts)) values.push(...raw.output.artifacts);
      }
    }
  }

  const dedupe = new Set();
  const out = [];
  for (const value of values) {
    const artifact = artifactFrom(value, { kind });
    if (!artifact) continue;
    const key = `${artifact.kind}|${artifact.url || ''}|${artifact.ref || ''}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    out.push(Object.freeze(artifact));
  }
  return Object.freeze(out);
}

function readNested(source, paths) {
  for (const path of paths) {
    let value = source;
    let ok = true;
    for (const part of path) {
      if (value == null || typeof value !== 'object' || !(part in value)) {
        ok = false;
        break;
      }
      value = value[part];
    }
    if (ok && value != null) return value;
  }
  return null;
}

function normalizeProviderUsage(rawUsage = null, rawResult = null) {
  const usage =
    rawUsage && typeof rawUsage === 'object' && !Array.isArray(rawUsage)
      ? rawUsage
      : (
          rawResult &&
          typeof rawResult === 'object' &&
          rawResult.usage &&
          typeof rawResult.usage === 'object'
            ? rawResult.usage
            : {}
        );

  const inputTokens = nonNegativeInteger(readNested(usage, [
    ['inputTokens'], ['input_tokens'], ['promptTokens'], ['prompt_tokens']
  ]));
  const outputTokens = nonNegativeInteger(readNested(usage, [
    ['outputTokens'], ['output_tokens'], ['completionTokens'], ['completion_tokens']
  ]));
  let totalTokens = nonNegativeInteger(readNested(usage, [
    ['totalTokens'], ['total_tokens']
  ]));
  if (totalTokens == null && inputTokens != null && outputTokens != null) {
    totalTokens = inputTokens + outputTokens;
  }

  let durationMs = nonNegativeNumber(readNested(usage, [
    ['durationMs'], ['duration_ms']
  ]));
  if (durationMs == null) {
    const durationSeconds = nonNegativeNumber(readNested(usage, [
      ['durationSeconds'], ['duration_seconds'], ['seconds']
    ]));
    if (durationSeconds != null) durationMs = durationSeconds * 1000;
  }

  return Object.freeze({
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd: nonNegativeNumber(readNested(usage, [
      ['costUsd'], ['cost_usd'], ['cost']
    ])),
    durationMs,
    requests: nonNegativeInteger(readNested(usage, [['requests'], ['request_count']])),
    images: nonNegativeInteger(readNested(usage, [['images'], ['image_count']])),
    audioSeconds: nonNegativeNumber(readNested(usage, [['audioSeconds'], ['audio_seconds']])),
    videoSeconds: nonNegativeNumber(readNested(usage, [['videoSeconds'], ['video_seconds']])),
    megapixels: nonNegativeNumber(readNested(usage, [['megapixels'], ['mega_pixels']]))
  });
}

function extractText(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const direct = text(
    raw.text ??
    raw.outputText ??
    raw.output_text ??
    raw.content ??
    raw.answer
  );
  if (direct) return direct;

  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  const choice = choices[0];
  return text(
    choice?.message?.content ??
    choice?.text
  );
}

function extractJson(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.data && typeof raw.data === 'object') {
    return JSON.parse(JSON.stringify(raw.data));
  }
  if (raw.output && typeof raw.output === 'object' && !Array.isArray(raw.output)) {
    return JSON.parse(JSON.stringify(raw.output));
  }
  return null;
}

function normalizeProviderResult(raw, request, timing = {}) {
  if (!request || request.contractVersion !== CONTRACT_VERSION) {
    throw new ProviderAdapterError({
      code: 'provider_normalized_request_required',
      message: 'Normalized provider request is required.'
    });
  }

  throwIfCancelled(request);

  const artifacts = collectArtifacts(raw, request.surface);
  const outputText = typeof raw === 'string' && !validUrl(raw)
    ? text(raw)
    : extractText(raw);
  const outputJson = extractJson(raw);
  const usage = normalizeProviderUsage(raw?.usage, raw);

  const startedAtMs = nonNegativeNumber(timing.startedAtMs);
  const completedAtMs = nonNegativeNumber(timing.completedAtMs) ?? Date.now();
  const latencyMs =
    nonNegativeNumber(timing.latencyMs) ??
    (
      startedAtMs != null && completedAtMs >= startedAtMs
        ? completedAtMs - startedAtMs
        : null
    );

  return Object.freeze({
    contractVersion: CONTRACT_VERSION,
    status: 'ok',
    requestId: request.requestId,
    providerId: request.providerId,
    modelId: request.modelId,
    capability: request.capability,
    surface: request.surface,
    output: Object.freeze({
      text: outputText,
      json: outputJson,
      primaryUrl: artifacts[0]?.url || null
    }),
    artifacts,
    usage,
    timing: Object.freeze({
      startedAtMs,
      completedAtMs,
      latencyMs
    })
  });
}

function normalizeProviderError(error, context = {}) {
  if (error instanceof ProviderAdapterError) return error;

  const providerCode = text(error?.code ?? error?.name);
  const messageText = text(error?.message) || '';
  const lower = `${providerCode || ''} ${messageText}`.toLowerCase();
  const cancelled =
    Boolean(context.cancelled) ||
    lower.includes('cancelled') ||
    lower.includes('canceled') ||
    lower.includes('abort');
  const timedOut =
    Boolean(context.timedOut) ||
    lower.includes('timeout') ||
    lower.includes('timed out');

  return new ProviderAdapterError({
    code: cancelled
      ? 'provider_request_cancelled'
      : (timedOut ? 'provider_request_timeout' : 'provider_adapter_error'),
    message: cancelled
      ? 'Provider request was cancelled.'
      : (timedOut ? 'Provider request timed out.' : 'Provider request failed.'),
    providerCode,
    statusCode: statusCode(
      error?.statusCode ??
      error?.status ??
      error?.response?.status
    ),
    retryAfterSeconds: nonNegativeNumber(error?.retryAfterSeconds),
    retryable: typeof error?.retryable === 'boolean' ? error.retryable : null,
    cancelled,
    timedOut,
    providerId: text(context.providerId),
    capability: text(context.capability),
    cause: error || null
  });
}

function createNormalizedAdapter({
  id,
  providerId,
  capabilities,
  execute
} = {}) {
  const adapterId = text(id);
  const fixedProviderId = text(providerId);
  const allowedCapabilities = new Set(
    Array.isArray(capabilities) ? capabilities.map(text).filter(Boolean) : []
  );

  if (!adapterId || !fixedProviderId || typeof execute !== 'function') {
    throw new ProviderAdapterError({
      code: 'provider_adapter_definition_invalid',
      message: 'Provider adapter definition is invalid.'
    });
  }

  return Object.freeze({
    id: adapterId,
    providerId: fixedProviderId,
    capabilities: Object.freeze([...allowedCapabilities]),
    async invoke(rawRequest) {
      const request = normalizeProviderRequest({
        ...rawRequest,
        providerId: fixedProviderId
      });
      if (!allowedCapabilities.has(request.capability)) {
        throw new ProviderAdapterError({
          code: 'provider_capability_not_supported',
          message: 'Provider capability is not supported.',
          providerId: fixedProviderId,
          capability: request.capability,
          retryable: false
        });
      }

      throwIfCancelled(request);
      const startedAtMs = Date.now();
      try {
        const raw = await execute(request);
        throwIfCancelled(request);
        return normalizeProviderResult(raw, request, {
          startedAtMs,
          completedAtMs: Date.now()
        });
      } catch (error) {
        throw normalizeProviderError(error, {
          providerId: fixedProviderId,
          capability: request.capability,
          cancelled: request.signal?.aborted === true
        });
      }
    }
  });
}

module.exports = {
  CONTRACT_VERSION,
  SURFACES,
  ProviderAdapterError,
  inferSurface,
  normalizeProviderRequest,
  normalizeProviderUsage,
  normalizeProviderResult,
  normalizeProviderError,
  createNormalizedAdapter,
  throwIfCancelled
};
