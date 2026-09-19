'use strict';

const Replicate = require('replicate');
const { providerSupports } = require('./videoOperationRegistry');

const DEFAULT_VIDEO_MODEL = 'wan-video/wan-2.2-t2v-fast';
const DEFAULT_IMAGE_TO_VIDEO_MODEL = 'wan-video/wan-2.2-i2v-fast';
const DEFAULT_REFERENCE_TO_VIDEO_MODEL = 'wan-video/wan-2.7-r2v';
const DEFAULT_VIDEO_EDIT_MODEL = 'fal-ai/ltx-2.3/retake-video';
const DEFAULT_VIDEO_EXTEND_MODEL = 'fal-ai/ltx-2.3/extend-video';
const DEFAULT_VIDEO_OBJECT_REMOVE_MODEL = 'bria/video/erase/prompt';
const DEFAULT_VIDEO_BACKGROUND_REMOVE_MODEL = 'bria/video/background-removal/v3';
const DEFAULT_VIDEO_RELIGHT_MODEL = 'fal-ai/lightx/relight';
const DEFAULT_VIDEO_RECAMERA_MODEL = 'fal-ai/lightx/recamera';
const DEFAULT_VIDEO_LIPSYNC_MODEL = 'fal-ai/kling-video/lipsync/audio-to-video';
const DEFAULT_VIDEO_SUBTITLES_MODEL = 'fal-ai/workflow-utilities/auto-subtitle';
const DEFAULT_VIDEO_DUB_MODEL = 'fal-ai/elevenlabs/dubbing';
const DEFAULT_VIDEO_ENHANCE_MODEL = 'bria/video/increase-resolution';
const DEFAULT_VIDEO_EXPORT_MODEL = 'ffmpeg-alpine';
const PACK066_FPS = 16;
const PACK067_I2V_FPS = 16;

function providerError(code) {
  const error = new Error(code);
  error.code = code;
  error.retryable = false;
  return error;
}

function normalizeProviderOutput(output) {
  const root =
    output && output.data && typeof output.data === 'object'
      ? output.data
      : output;
  const first = Array.isArray(root) ? root[0] : root;
  if (typeof first === 'string') return first;
  if (first && typeof first.url === 'function') return first.url();
  if (first && typeof first.url === 'string') return first.url;
  if (first && first.video) {
    if (typeof first.video === 'string') return first.video;
    if (typeof first.video.url === 'function') return first.video.url();
    if (typeof first.video.url === 'string') return first.video.url;
  }
  throw providerError('video_provider_returned_no_url');
}

function frameCount(durationSeconds, fps) {
  const duration = Number(durationSeconds);
  if (!Number.isSafeInteger(duration) || duration < 1) {
    throw providerError('invalid_video_duration');
  }
  return duration * fps + 1;
}

function requireResolvedSource(resolvedInputs, type = 'video') {
  const source = resolvedInputs && resolvedInputs.source;
  if (!source || !source.url || source.assetType !== type) {
    throw providerError(
      type === 'video'
        ? 'video_source_video_not_resolved'
        : 'video_source_image_not_resolved'
    );
  }
  return source;
}

function durationMilliseconds(value, code = 'invalid_video_duration') {
  const text = String(value === undefined || value === null ? '' : value).trim();
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,3}))?$/.exec(text);
  if (!match) throw providerError(code);
  const milliseconds =
    BigInt(match[1]) * 1000n +
    BigInt(((match[2] || '') + '000').slice(0, 3));
  if (milliseconds <= 0n) throw providerError(code);
  return milliseconds;
}

function lipSyncBillingIncrements(value) {
  const milliseconds = durationMilliseconds(value);
  const increments = (milliseconds + 4999n) / 5000n;
  if (increments > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw providerError('video_lipsync_billing_units_invalid');
  }
  return Number(increments);
}

function requireTrustedDuration(item, code = 'video_source_duration_unavailable') {
  const duration = Number(item && item.durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) throw providerError(code);
  return duration;
}

function buildWan22TextToVideoInput(request) {
  if (!request || request.operation !== 'text_to_video') {
    throw providerError('video_operation_not_supported_by_provider');
  }
  const durationSeconds = Number(request.options?.durationSeconds);
  const fps = Number(request.options?.fps);
  if (!Number.isSafeInteger(durationSeconds) || ![5, 6, 7].includes(durationSeconds)) {
    throw providerError('video_duration_not_supported_by_provider');
  }
  if (fps !== PACK066_FPS) throw providerError('video_fps_not_supported_by_provider');
  if (!['16:9', '9:16'].includes(request.options?.ratio)) {
    throw providerError('video_ratio_not_supported_by_provider');
  }
  if (!['480p', '720p'].includes(request.options?.resolution)) {
    throw providerError('video_resolution_not_supported_by_provider');
  }
  if (request.options?.audio !== false) throw providerError('video_audio_not_supported_by_provider');
  if (request.options?.exportFormat !== 'mp4') throw providerError('video_export_not_supported_by_provider');

  const input = {
    prompt: request.prompt,
    go_fast: true,
    num_frames: frameCount(durationSeconds, PACK066_FPS),
    resolution: request.options.resolution,
    aspect_ratio: request.options.ratio,
    frames_per_second: PACK066_FPS,
    interpolate_output: false,
    optimize_prompt: false,
    disable_safety_checker: false
  };
  if (request.options.seed !== null) input.seed = request.options.seed;
  return Object.freeze(input);
}

function buildWan22ImageToVideoInput(request, resolvedInputs = {}) {
  if (!request || request.operation !== 'image_to_video') {
    throw providerError('video_operation_not_supported_by_provider');
  }
  const source = requireResolvedSource(resolvedInputs, 'image');
  const durationSeconds = Number(request.options?.durationSeconds);
  if (!Number.isSafeInteger(durationSeconds) || ![5, 6, 7].includes(durationSeconds)) {
    throw providerError('video_duration_not_supported_by_provider');
  }
  if (Number(request.options?.fps) !== PACK067_I2V_FPS) {
    throw providerError('video_fps_not_supported_by_provider');
  }
  if (!['480p', '720p'].includes(request.options?.resolution)) {
    throw providerError('video_resolution_not_supported_by_provider');
  }
  if (request.options?.audio !== false) throw providerError('video_audio_not_supported_by_provider');
  if (request.options?.exportFormat !== 'mp4') throw providerError('video_export_not_supported_by_provider');

  const input = {
    prompt: request.prompt,
    image: source.url,
    go_fast: true,
    num_frames: frameCount(durationSeconds, PACK067_I2V_FPS),
    resolution: request.options.resolution,
    sample_shift: 12,
    frames_per_second: PACK067_I2V_FPS,
    interpolate_output: false,
    disable_safety_checker: false
  };
  if (resolvedInputs.last && resolvedInputs.last.url) input.last_image = resolvedInputs.last.url;
  if (request.options.seed !== null) input.seed = request.options.seed;
  return Object.freeze(input);
}

function buildWan27ReferenceToVideoInput(request, resolvedInputs = {}) {
  if (!request || request.operation !== 'reference_to_video') {
    throw providerError('video_operation_not_supported_by_provider');
  }
  const references = Array.isArray(resolvedInputs.references)
    ? resolvedInputs.references
    : [];
  if (!references.length || references.some(item => !item || !item.url)) {
    throw providerError('video_reference_images_not_resolved');
  }
  const duration = Number(request.options?.durationSeconds);
  if (!Number.isSafeInteger(duration) || duration < 2 || duration > 10) {
    throw providerError('video_duration_not_supported_by_provider');
  }
  if (!['720p', '1080p'].includes(request.options?.resolution)) {
    throw providerError('video_resolution_not_supported_by_provider');
  }
  if (!['16:9', '9:16', '1:1', '4:3', '3:4'].includes(request.options?.ratio)) {
    throw providerError('video_ratio_not_supported_by_provider');
  }
  if (!['single', 'multi'].includes(request.options?.shotType)) {
    throw providerError('video_shot_type_not_supported_by_provider');
  }
  if (request.options?.audio !== false) throw providerError('video_audio_not_supported_by_provider');
  if (request.options?.exportFormat !== 'mp4') throw providerError('video_export_not_supported_by_provider');

  const input = {
    prompt: request.prompt,
    reference_images: references.map(item => item.url),
    reference_videos: [],
    negative_prompt: request.options.negativePrompt || '',
    resolution: request.options.resolution,
    aspect_ratio: request.options.ratio,
    duration,
    shot_type: request.options.shotType
  };
  if (request.options.seed !== null) input.seed = request.options.seed;
  return Object.freeze(input);
}

function buildFalRetakeInput(request, resolvedInputs = {}) {
  if (!request || request.operation !== 'edit') {
    throw providerError('video_operation_not_supported_by_provider');
  }
  const source = requireResolvedSource(resolvedInputs);
  const sourceDuration = requireTrustedDuration(source);
  const startTime = Number(request.options.startTimeSeconds || 0);
  const duration = Number(request.options.durationSeconds);
  if (!Number.isFinite(startTime) || startTime < 0 || !Number.isFinite(duration) || duration <= 0) {
    throw providerError('invalid_video_retake_window');
  }
  if (startTime + duration > sourceDuration + 0.001) {
    throw providerError('video_retake_window_out_of_bounds');
  }
  return Object.freeze({
    video_url: source.url,
    prompt: request.prompt,
    start_time: startTime,
    duration,
    retake_mode: request.options.retakeMode
  });
}

function buildFalExtendInput(request, resolvedInputs = {}) {
  if (!request || request.operation !== 'extend') {
    throw providerError('video_operation_not_supported_by_provider');
  }
  const source = requireResolvedSource(resolvedInputs);
  const input = {
    video_url: source.url,
    duration: Number(request.options.durationSeconds),
    mode: request.options.extendMode
  };
  if (request.prompt) input.prompt = request.prompt;
  if (request.options.contextSeconds !== null) {
    input.context = Number(request.options.contextSeconds);
  }
  return Object.freeze(input);
}

function buildFalObjectRemoveInput(request, resolvedInputs = {}) {
  if (!request || request.operation !== 'object_remove') {
    throw providerError('video_operation_not_supported_by_provider');
  }
  const source = requireResolvedSource(resolvedInputs);
  const duration = requireTrustedDuration(source);
  if (duration >= 5) throw providerError('video_object_remove_source_too_long');
  return Object.freeze({
    output_container_and_codec: 'mp4_h264',
    auto_trim: true,
    preserve_audio: request.options.preserveAudio,
    prompt: request.prompt,
    video_url: source.url
  });
}

function buildFalBackgroundRemoveInput(request, resolvedInputs = {}) {
  if (!request || request.operation !== 'background_remove') {
    throw providerError('video_operation_not_supported_by_provider');
  }
  const source = requireResolvedSource(resolvedInputs);
  requireTrustedDuration(source);
  return Object.freeze({
    output_container_and_codec: 'mp4_h264',
    preserve_audio: request.options.preserveAudio,
    video_url: source.url,
    background_color: request.options.backgroundColor,
    auto_zoom: request.options.autoZoom
  });
}

function buildFalRelightInput(request, resolvedInputs = {}) {
  if (!request || request.operation !== 'relight') {
    throw providerError('video_operation_not_supported_by_provider');
  }
  const source = requireResolvedSource(resolvedInputs);
  requireTrustedDuration(source);
  const input = {
    video_url: source.url,
    prompt: request.prompt,
    relit_cond_type: 'ic',
    relight_parameters: {
      relight_prompt: request.prompt,
      bg_source: request.options.lightDirection,
      cfg: 2,
      use_sky_mask: request.options.useSkyMask
    }
  };
  if (request.options.seed !== null) input.seed = request.options.seed;
  return Object.freeze(input);
}

function buildFalRecameraInput(request, resolvedInputs = {}) {
  if (!request || request.operation !== 'recamera') {
    throw providerError('video_operation_not_supported_by_provider');
  }
  const source = requireResolvedSource(resolvedInputs);
  requireTrustedDuration(source);
  const input = {
    video_url: source.url,
    camera: request.options.cameraMode,
    mode: request.options.motionMode
  };
  if (request.prompt) input.prompt = request.prompt;
  if (request.options.seed !== null) input.seed = request.options.seed;
  if (request.options.cameraMode === 'target') {
    input.target_pose = request.options.targetPose;
  } else {
    input.trajectory = request.options.trajectory;
  }
  return Object.freeze(input);
}

function buildFalLipSyncInput(request, resolvedInputs = {}) {
  if (!request || request.operation !== 'lip_sync') {
    throw providerError('video_operation_not_supported_by_provider');
  }
  const source = requireResolvedSource(resolvedInputs);
  const audio = resolvedInputs && resolvedInputs.audio;
  if (!audio || !audio.url || audio.assetType !== 'audio') {
    throw providerError('video_source_audio_not_resolved');
  }
  const videoDuration = requireTrustedDuration(source);
  const audioDuration = requireTrustedDuration(audio, 'video_source_audio_duration_unavailable');
  if (videoDuration < 2 || videoDuration > 10 || source.fileSizeBytes > 100 * 1024 * 1024) {
    throw providerError('video_lipsync_source_video_unsupported');
  }
  if (audioDuration < 2 || audioDuration > 60 || audio.fileSizeBytes > 5 * 1024 * 1024) {
    throw providerError('video_lipsync_source_audio_unsupported');
  }
  if (!['video/mp4','video/quicktime'].includes(source.mimeType)) {
    throw providerError('video_lipsync_source_video_unsupported');
  }
  if (!['audio/mpeg','audio/mp3','audio/ogg','audio/wav','audio/x-wav','audio/mp4','audio/x-m4a','audio/aac','audio/x-aac'].includes(audio.mimeType)) {
    throw providerError('video_lipsync_source_audio_unsupported');
  }
  return Object.freeze({
    video_url: source.url,
    audio_url: audio.url
  });
}

function providerPayload(output) {
  return output && output.data && typeof output.data === 'object'
    ? output.data
    : output;
}

function buildFalSubtitlesInput(request, resolvedInputs = {}) {
  if (!request || request.operation !== 'subtitles') {
    throw providerError('video_operation_not_supported_by_provider');
  }
  const source = requireResolvedSource(resolvedInputs);
  requireTrustedDuration(source);
  const options = request.options || {};
  const input = {
    video_url: source.url,
    font_name: options.fontName,
    font_size: options.fontSize,
    font_weight: options.fontWeight,
    font_color: options.fontColor,
    highlight_color: options.highlightColor,
    stroke_width: options.strokeWidth,
    stroke_color: options.strokeColor,
    background_color: options.backgroundColor,
    background_opacity: options.backgroundOpacity,
    position: options.position,
    y_offset: options.yOffset,
    words_per_subtitle: options.wordsPerSubtitle,
    enable_animation: options.enableAnimation
  };
  if (options.subtitleLanguage && options.subtitleLanguage !== 'auto') {
    input.language = options.subtitleLanguage;
  }
  return Object.freeze(input);
}

function buildFalDubInput(request, resolvedInputs = {}) {
  if (!request || request.operation !== 'dub') {
    throw providerError('video_operation_not_supported_by_provider');
  }
  const source = requireResolvedSource(resolvedInputs);
  requireTrustedDuration(source);
  const input = {
    video_url: source.url,
    target_lang: request.options.targetLanguage,
    highest_resolution: request.options.highestResolution
  };
  if (request.options.sourceLanguage !== 'auto') {
    input.source_lang = request.options.sourceLanguage;
  }
  return Object.freeze(input);
}

function buildFalEnhanceInput(request, resolvedInputs = {}) {
  if (!request || request.operation !== 'enhance') {
    throw providerError('video_operation_not_supported_by_provider');
  }
  const source = requireResolvedSource(resolvedInputs);
  const duration = requireTrustedDuration(source);
  if (duration >= 30) throw providerError('video_enhance_source_too_long');
  const codec = {
    mp4: 'mp4_h264',
    webm: 'webm_vp9',
    mov: 'mov_h265'
  }[request.options.exportFormat];
  if (!codec) throw providerError('video_export_not_supported_by_provider');
  return Object.freeze({
    output_container_and_codec: codec,
    preserve_audio: request.options.preserveAudio,
    video_url: source.url,
    desired_increase: String(request.options.increaseFactor)
  });
}

function normalizePack069Metadata(operation, output) {
  const root = providerPayload(output);
  if (!root || typeof root !== 'object') return Object.freeze({});
  if (operation === 'subtitles') {
    return Object.freeze({
      transcription:
        typeof root.transcription === 'string' ? root.transcription : '',
      subtitleCount:
        Number.isSafeInteger(Number(root.subtitle_count))
          ? Number(root.subtitle_count)
          : null,
      words: Array.isArray(root.words) ? root.words : [],
      transcriptionMetadata:
        root.transcription_metadata &&
        typeof root.transcription_metadata === 'object'
          ? root.transcription_metadata
          : null
    });
  }
  if (operation === 'dub') {
    return Object.freeze({
      targetLanguage:
        typeof root.target_lang === 'string' ? root.target_lang : null
    });
  }
  return Object.freeze({});
}

function defaultModelForOperation(operation) {
  return ({
    text_to_video: DEFAULT_VIDEO_MODEL,
    image_to_video: DEFAULT_IMAGE_TO_VIDEO_MODEL,
    reference_to_video: DEFAULT_REFERENCE_TO_VIDEO_MODEL,
    edit: DEFAULT_VIDEO_EDIT_MODEL,
    extend: DEFAULT_VIDEO_EXTEND_MODEL,
    object_remove: DEFAULT_VIDEO_OBJECT_REMOVE_MODEL,
    background_remove: DEFAULT_VIDEO_BACKGROUND_REMOVE_MODEL,
    relight: DEFAULT_VIDEO_RELIGHT_MODEL,
    recamera: DEFAULT_VIDEO_RECAMERA_MODEL,
    lip_sync: DEFAULT_VIDEO_LIPSYNC_MODEL,
    subtitles: DEFAULT_VIDEO_SUBTITLES_MODEL,
    dub: DEFAULT_VIDEO_DUB_MODEL,
    enhance: DEFAULT_VIDEO_ENHANCE_MODEL,
    export: DEFAULT_VIDEO_EXPORT_MODEL
  })[operation] || (() => { throw providerError('video_operation_not_supported_by_provider'); })();
}

function providerForOperation(operation) {
  return ['text_to_video','image_to_video','reference_to_video'].includes(operation)
    ? 'replicate'
    : ['edit','extend','object_remove','background_remove','relight','recamera','lip_sync','subtitles','dub','enhance'].includes(operation)
      ? 'fal'
      : operation === 'export'
        ? 'local'
        : (() => { throw providerError('video_operation_not_supported_by_provider'); })();
}

function executionGateForOperation(operation) {
  const map = {
    text_to_video: 'PACK066_PAID_EXECUTION_ENABLED',
    image_to_video: 'PACK067_I2V_PAID_EXECUTION_ENABLED',
    reference_to_video: 'PACK067_R2V_PAID_EXECUTION_ENABLED',
    edit: 'PACK068_EDIT_PAID_EXECUTION_ENABLED',
    extend: 'PACK068_EXTEND_PAID_EXECUTION_ENABLED',
    object_remove: 'PACK068_OBJECT_REMOVE_PAID_EXECUTION_ENABLED',
    background_remove: 'PACK068_BACKGROUND_PAID_EXECUTION_ENABLED',
    relight: 'PACK068_RELIGHT_PAID_EXECUTION_ENABLED',
    recamera: 'PACK068_RECAMERA_PAID_EXECUTION_ENABLED',
    lip_sync: 'PACK068_LIPSYNC_PAID_EXECUTION_ENABLED',
    subtitles: 'PACK069_SUBTITLES_PAID_EXECUTION_ENABLED',
    dub: 'PACK069_DUB_PAID_EXECUTION_ENABLED',
    enhance: 'PACK069_ENHANCE_PAID_EXECUTION_ENABLED'
  };
  if (!map[operation]) throw providerError('video_operation_not_supported_by_provider');
  return map[operation];
}

function gateErrorForOperation(operation) {
  if (operation === 'text_to_video') return 'pack066_paid_execution_disabled';
  if (operation === 'image_to_video') return 'pack067_i2v_paid_execution_disabled';
  if (operation === 'reference_to_video') return 'pack067_r2v_paid_execution_disabled';
  if (['subtitles','dub','enhance'].includes(operation)) {
    return 'pack069_' + operation + '_paid_execution_disabled';
  }
  return 'pack068_' + operation + '_paid_execution_disabled';
}

function buildFalInput(request, resolvedInputs) {
  return ({
    edit: buildFalRetakeInput,
    extend: buildFalExtendInput,
    object_remove: buildFalObjectRemoveInput,
    background_remove: buildFalBackgroundRemoveInput,
    relight: buildFalRelightInput,
    recamera: buildFalRecameraInput,
    lip_sync: buildFalLipSyncInput,
    subtitles: buildFalSubtitlesInput,
    dub: buildFalDubInput,
    enhance: buildFalEnhanceInput
  })[request.operation]?.(request, resolvedInputs) ||
    (() => { throw providerError('video_operation_not_supported_by_provider'); })();
}

async function generateVideo(request, {
  env = process.env,
  resolvedInputs = {},
  createClient = token => new Replicate({ auth: token }),
  createFalClient = async key => {
    const { fal } = await import('@fal-ai/client');
    fal.config({ credentials: key });
    return fal;
  }
} = {}) {
  const provider = providerForOperation(request.operation);
  if (provider === 'local') {
    throw providerError('video_local_operation_requires_local_executor');
  }
  if (!providerSupports(provider, request.operation)) {
    throw providerError('video_operation_not_supported_by_provider');
  }

  const gate = executionGateForOperation(request.operation);
  if (String(env[gate] || '').toLowerCase() !== 'true') {
    throw providerError(gateErrorForOperation(request.operation));
  }

  const model = defaultModelForOperation(request.operation);
  let output;
  let input;

  if (provider === 'replicate') {
    if (!env.REPLICATE_API_TOKEN) throw providerError('replicate_video_provider_not_configured');

    if (request.operation === 'text_to_video') {
      const configured = env.REPLICATE_VIDEO_MODEL || DEFAULT_VIDEO_MODEL;
      if (configured !== DEFAULT_VIDEO_MODEL) throw providerError('replicate_video_model_unverified');
      input = buildWan22TextToVideoInput(request);
    } else if (request.operation === 'image_to_video') {
      input = buildWan22ImageToVideoInput(request, resolvedInputs);
    } else {
      input = buildWan27ReferenceToVideoInput(request, resolvedInputs);
    }

    const client = createClient(env.REPLICATE_API_TOKEN);
    output = await client.run(model, { input });
  } else {
    if (!env.FAL_KEY) throw providerError('fal_video_provider_not_configured');
    input = buildFalInput(request, resolvedInputs);
    const client = await createFalClient(env.FAL_KEY);
    output = await client.subscribe(model, { input, logs: false });
  }

  const url = normalizeProviderOutput(output);
  const metadata = normalizePack069Metadata(request.operation, output);
  const sourceDuration = Number(resolvedInputs?.source?.durationSeconds || 0);
  let unitType = 'videos';
  let units = 1;

  if (request.operation === 'reference_to_video') {
    unitType = 'video_seconds';
    units = request.options.durationSeconds;
  } else if (['edit','extend'].includes(request.operation)) {
    unitType = 'video_seconds';
    units = request.options.durationSeconds;
  } else if (['object_remove','background_remove','relight','recamera'].includes(request.operation)) {
    unitType = 'video_seconds';
    units = sourceDuration;
  } else if (request.operation === 'lip_sync') {
    unitType = 'processing_operations';
    units = lipSyncBillingIncrements(sourceDuration);
  } else if (request.operation === 'subtitles') {
    unitType = 'video_seconds';
    units = sourceDuration;
  } else if (request.operation === 'dub') {
    unitType = 'processing_operations';
    units = Math.floor((sourceDuration * 1000 + 59999) / 60000);
  } else if (request.operation === 'enhance') {
    unitType = 'video_seconds';
    units = sourceDuration;
  }

  return Object.freeze({
    url,
    provider,
    model,
    requestedDurationSeconds: request.options?.durationSeconds ?? null,
    sourceDurationSeconds: sourceDuration || null,
    numFrames: input.num_frames || null,
    fps: input.frames_per_second || null,
    providerMetadata: metadata,
    billableUnits: Object.freeze({
      unitType,
      units,
      resolution: request.options?.resolution || null
    })
  });
}

module.exports = {
  DEFAULT_VIDEO_MODEL,
  DEFAULT_IMAGE_TO_VIDEO_MODEL,
  DEFAULT_REFERENCE_TO_VIDEO_MODEL,
  DEFAULT_VIDEO_EDIT_MODEL,
  DEFAULT_VIDEO_EXTEND_MODEL,
  DEFAULT_VIDEO_OBJECT_REMOVE_MODEL,
  DEFAULT_VIDEO_BACKGROUND_REMOVE_MODEL,
  DEFAULT_VIDEO_RELIGHT_MODEL,
  DEFAULT_VIDEO_RECAMERA_MODEL,
  DEFAULT_VIDEO_LIPSYNC_MODEL,
  DEFAULT_VIDEO_SUBTITLES_MODEL,
  DEFAULT_VIDEO_DUB_MODEL,
  DEFAULT_VIDEO_ENHANCE_MODEL,
  DEFAULT_VIDEO_EXPORT_MODEL,
  PACK066_FPS,
  PACK067_I2V_FPS,
  normalizeProviderOutput,
  buildWan22TextToVideoInput,
  buildWan22ImageToVideoInput,
  buildWan27ReferenceToVideoInput,
  buildFalRetakeInput,
  buildFalExtendInput,
  buildFalObjectRemoveInput,
  buildFalBackgroundRemoveInput,
  buildFalRelightInput,
  buildFalRecameraInput,
  buildFalLipSyncInput,
  buildFalSubtitlesInput,
  buildFalDubInput,
  buildFalEnhanceInput,
  normalizePack069Metadata,
  lipSyncBillingIncrements,
  defaultModelForOperation,
  providerForOperation,
  generateVideo
};
