'use strict';

const { buildFalLipSyncInput } = require('./videoProvider');
const { providerSupports } = require('./audioOperationRegistry');

const MODELS = Object.freeze({
  music_generation: 'cassetteai/music-generator',
  sound_effects: 'cassetteai/sound-effects-generator',
  remix: 'fal-ai/ace-step/audio-to-audio',
  stem_separation: 'fal-ai/sam-audio/separate',
  translate_dub: 'fal-ai/elevenlabs/dubbing',
  audio_to_video: 'fal-ai/kling-video/lipsync/audio-to-video'
});

const GATES = Object.freeze({
  music_generation: 'PACK074_MUSIC_PAID_EXECUTION_ENABLED',
  sound_effects: 'PACK074_SFX_PAID_EXECUTION_ENABLED',
  remix: 'PACK074_REMIX_PAID_EXECUTION_ENABLED',
  stem_separation: 'PACK074_STEMS_PAID_EXECUTION_ENABLED',
  translate_dub: 'PACK074_DUB_PAID_EXECUTION_ENABLED',
  audio_to_video: 'PACK074_AUDIO_TO_VIDEO_PAID_EXECUTION_ENABLED'
});

function providerError(code, status = 500, cause = null) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.cause = cause;
  error.retryable = false;
  return error;
}

function fileRef(value, code) {
  if (!value || typeof value !== 'object') throw providerError(code, 502);
  const url = typeof value.url === 'function' ? value.url() : value.url;
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) throw providerError(code, 502);
  return Object.freeze({
    url,
    mimeType: typeof value.content_type === 'string' ? value.content_type : null,
    fileName: typeof value.file_name === 'string' ? value.file_name : null,
    fileSize: Number.isSafeInteger(Number(value.file_size)) ? Number(value.file_size) : null
  });
}

function providerPayload(output) {
  return output && output.data && typeof output.data === 'object'
    ? output.data
    : output;
}

function requireAudioSource(resolvedInputs) {
  const source = resolvedInputs?.source;
  if (!source?.url || !source?.assetId) throw providerError('pack074_audio_source_not_resolved', 400);
  return source;
}

function buildInput(request, resolvedInputs = {}) {
  const operation = request?.operation;
  if (operation === 'music_generation' || operation === 'sound_effects') {
    return Object.freeze({
      prompt: request.prompt,
      duration: request.durationSeconds
    });
  }
  if (operation === 'remix') {
    const source = requireAudioSource(resolvedInputs);
    const input = {
      audio_url: source.url,
      edit_mode: 'remix',
      original_tags: request.options.originalTags,
      original_lyrics: request.options.originalLyrics || '',
      tags: request.prompt,
      lyrics: request.options.lyrics || '',
      number_of_steps: request.options.numberOfSteps
    };
    if (request.options.seed !== null) input.seed = request.options.seed;
    return Object.freeze(input);
  }
  if (operation === 'stem_separation') {
    const source = requireAudioSource(resolvedInputs);
    return Object.freeze({
      audio_url: source.url,
      prompt: request.prompt,
      predict_spans: false,
      reranking_candidates: 1,
      acceleration: 'balanced',
      max_chunk_duration: 60,
      chunk_overlap: 5,
      output_format: request.outputFormat
    });
  }
  if (operation === 'translate_dub') {
    const source = requireAudioSource(resolvedInputs);
    const input = {
      audio_url: source.url,
      target_lang: request.options.targetLanguage,
      highest_resolution: true
    };
    if (request.options.sourceLanguage && request.options.sourceLanguage !== 'auto') {
      input.source_lang = request.options.sourceLanguage;
    }
    if (request.options.numSpeakers !== null) input.num_speakers = request.options.numSpeakers;
    return Object.freeze(input);
  }
  if (operation === 'audio_to_video') {
    return buildFalLipSyncInput(
      { operation: 'lip_sync', options: {} },
      resolvedInputs
    );
  }
  throw providerError('pack074_operation_not_supported_by_provider', 400);
}

function normalizeOutput(operation, output) {
  const root = providerPayload(output);
  if (!root || typeof root !== 'object') throw providerError('pack074_provider_result_invalid', 502);
  const requestId = output?.requestId || output?.request_id || root.request_id || null;

  if (operation === 'music_generation' || operation === 'sound_effects') {
    const primary = fileRef(root.audio_file, 'pack074_provider_audio_missing');
    return Object.freeze({
      outputs: Object.freeze([{ role: 'primary', assetType: operation === 'music_generation' ? 'music' : 'audio', ...primary }]),
      providerMetadata: Object.freeze({ requestId })
    });
  }
  if (operation === 'remix') {
    const primary = fileRef(root.audio, 'pack074_provider_audio_missing');
    return Object.freeze({
      outputs: Object.freeze([{ role: 'primary', assetType: 'audio', ...primary }]),
      providerMetadata: Object.freeze({
        requestId,
        seed: Number.isSafeInteger(Number(root.seed)) ? Number(root.seed) : null,
        tags: typeof root.tags === 'string' ? root.tags : null,
        lyrics: typeof root.lyrics === 'string' ? root.lyrics : null
      })
    });
  }
  if (operation === 'stem_separation') {
    const target = fileRef(root.target, 'pack074_provider_target_missing');
    const residual = fileRef(root.residual, 'pack074_provider_residual_missing');
    return Object.freeze({
      outputs: Object.freeze([
        { role: 'target', assetType: 'audio', ...target },
        { role: 'residual', assetType: 'audio', ...residual }
      ]),
      providerMetadata: Object.freeze({
        requestId,
        durationSeconds: Number.isFinite(Number(root.duration)) ? Number(root.duration) : null,
        sampleRate: Number.isSafeInteger(Number(root.sample_rate)) ? Number(root.sample_rate) : null
      })
    });
  }
  if (operation === 'translate_dub') {
    // fal documents audio_url input but only a video output field in the current schema.
    // Fail closed until a stable audio-only output field is provider-documented or live-verified.
    throw providerError('pack074_dub_audio_output_contract_unverified', 503);
  }
  if (operation === 'audio_to_video') {
    const primary = fileRef(root.video, 'pack074_provider_video_missing');
    return Object.freeze({
      outputs: Object.freeze([{ role: 'primary', assetType: 'video', ...primary }]),
      providerMetadata: Object.freeze({ requestId })
    });
  }
  throw providerError('pack074_operation_not_supported_by_provider', 400);
}

function serializeProviderResult({ operation, provider, model, outputs, providerMetadata }) {
  return Object.freeze({
    kind: 'pack074_fal_result',
    operation,
    provider,
    model,
    outputs: outputs.map(item => ({
      role: item.role,
      assetType: item.assetType,
      url: item.url,
      mimeType: item.mimeType || null,
      fileName: item.fileName || null,
      fileSize: item.fileSize || null
    })),
    providerMetadata: providerMetadata || {}
  });
}

function restoreProviderResult(value) {
  if (!value || value.kind !== 'pack074_fal_result' || !MODELS[value.operation]) return null;
  if (!Array.isArray(value.outputs) || value.outputs.length < 1) return null;
  const outputs = value.outputs.map(item => {
    if (!item || typeof item.url !== 'string' || !/^https:\/\//i.test(item.url)) {
      throw providerError('pack074_persisted_provider_result_invalid', 500);
    }
    return Object.freeze({
      role: String(item.role || 'primary'),
      assetType: String(item.assetType || 'audio'),
      url: item.url,
      mimeType: item.mimeType || null,
      fileName: item.fileName || null,
      fileSize: Number.isSafeInteger(Number(item.fileSize)) ? Number(item.fileSize) : null
    });
  });
  return Object.freeze({
    operation: value.operation,
    provider: String(value.provider || 'fal'),
    model: String(value.model || MODELS[value.operation]),
    outputs: Object.freeze(outputs),
    providerMetadata: Object.freeze(
      value.providerMetadata && typeof value.providerMetadata === 'object'
        ? value.providerMetadata
        : {}
    )
  });
}

async function generatePack074Audio(request, {
  resolvedInputs = {},
  env = process.env,
  createFalClient = async key => {
    const { fal } = await import('@fal-ai/client');
    fal.config({ credentials: key });
    return fal;
  }
} = {}) {
  const operation = request?.operation;
  const model = MODELS[operation];
  const gate = GATES[operation];
  if (!model || !gate || !providerSupports('fal', operation)) {
    throw providerError('pack074_operation_not_supported_by_provider', 400);
  }
  if (operation === 'translate_dub') {
    throw providerError('pack074_dub_audio_output_contract_unverified', 503);
  }
  if (String(env[gate] || '').toLowerCase() !== 'true') {
    throw providerError('pack074_' + operation + '_paid_execution_disabled', 503);
  }
  if (!env.FAL_KEY) throw providerError('fal_audio_provider_not_configured', 503);

  const input = buildInput(request, resolvedInputs);
  const client = await createFalClient(env.FAL_KEY);
  const raw = await client.subscribe(model, { input, logs: false })
    .catch(error => { throw providerError('pack074_fal_provider_failed', 502, error); });
  const normalized = normalizeOutput(operation, raw);
  return Object.freeze({
    operation,
    provider: 'fal',
    model,
    ...normalized
  });
}

module.exports = {
  MODELS,
  GATES,
  buildInput,
  normalizeOutput,
  serializeProviderResult,
  restoreProviderResult,
  generatePack074Audio
};
