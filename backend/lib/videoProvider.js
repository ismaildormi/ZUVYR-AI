'use strict';

const Replicate = require('replicate');
const { providerSupports } = require('./videoOperationRegistry');

const DEFAULT_VIDEO_MODEL = 'wan-video/wan-2.2-t2v-fast';
const DEFAULT_IMAGE_TO_VIDEO_MODEL = 'wan-video/wan-2.2-i2v-fast';
const DEFAULT_REFERENCE_TO_VIDEO_MODEL = 'wan-video/wan-2.7-r2v';
const PACK066_FPS = 16;
const PACK067_I2V_FPS = 16;

function providerError(code) {
  const error = new Error(code);
  error.code = code;
  error.retryable = false;
  return error;
}

function normalizeProviderOutput(output) {
  const first = Array.isArray(output) ? output[0] : output;
  if (typeof first === 'string') return first;
  if (first && typeof first.url === 'function') return first.url();
  if (first && typeof first.url === 'string') return first.url;
  throw providerError('video_provider_returned_no_url');
}

function frameCount(durationSeconds, fps) {
  const duration = Number(durationSeconds);
  if (!Number.isSafeInteger(duration) || duration < 1) {
    throw providerError('invalid_video_duration');
  }
  return duration * fps + 1;
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
  const source = resolvedInputs.source;
  if (!source || !source.url) throw providerError('video_source_image_not_resolved');
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
  if (resolvedInputs.last && resolvedInputs.last.url) {
    input.last_image = resolvedInputs.last.url;
  }
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

function defaultModelForOperation(operation) {
  if (operation === 'text_to_video') return DEFAULT_VIDEO_MODEL;
  if (operation === 'image_to_video') return DEFAULT_IMAGE_TO_VIDEO_MODEL;
  if (operation === 'reference_to_video') return DEFAULT_REFERENCE_TO_VIDEO_MODEL;
  throw providerError('video_operation_not_supported_by_provider');
}

function executionGateForOperation(operation) {
  if (operation === 'text_to_video') return 'PACK066_PAID_EXECUTION_ENABLED';
  if (operation === 'image_to_video') return 'PACK067_I2V_PAID_EXECUTION_ENABLED';
  if (operation === 'reference_to_video') return 'PACK067_R2V_PAID_EXECUTION_ENABLED';
  throw providerError('video_operation_not_supported_by_provider');
}

async function generateVideo(request, {
  env = process.env,
  resolvedInputs = {},
  createClient = token => new Replicate({ auth: token })
} = {}) {
  if (!providerSupports('replicate', request.operation)) {
    throw providerError('video_operation_not_supported_by_provider');
  }
  const gate = executionGateForOperation(request.operation);
  if (String(env[gate] || '').toLowerCase() !== 'true') {
    throw providerError('video_paid_execution_disabled');
  }
  if (!env.REPLICATE_API_TOKEN) throw providerError('replicate_video_provider_not_configured');

  let model = defaultModelForOperation(request.operation);
  let input;
  if (request.operation === 'text_to_video') {
    const configured = env.REPLICATE_VIDEO_MODEL || DEFAULT_VIDEO_MODEL;
    if (configured !== DEFAULT_VIDEO_MODEL) throw providerError('replicate_video_model_unverified');
    model = configured;
    input = buildWan22TextToVideoInput(request);
  } else if (request.operation === 'image_to_video') {
    input = buildWan22ImageToVideoInput(request, resolvedInputs);
  } else if (request.operation === 'reference_to_video') {
    input = buildWan27ReferenceToVideoInput(request, resolvedInputs);
  } else {
    throw providerError('video_operation_not_supported_by_provider');
  }

  const client = createClient(env.REPLICATE_API_TOKEN);
  const output = await client.run(model, { input });
  const url = normalizeProviderOutput(output);

  const isReference = request.operation === 'reference_to_video';
  return Object.freeze({
    url,
    provider: 'replicate',
    model,
    requestedDurationSeconds: request.options.durationSeconds,
    numFrames: isReference ? null : input.num_frames,
    fps: isReference ? null : input.frames_per_second,
    billableUnits: Object.freeze({
      unitType: isReference ? 'video_seconds' : 'videos',
      units: isReference ? request.options.durationSeconds : 1,
      resolution: request.options.resolution
    })
  });
}

module.exports = {
  DEFAULT_VIDEO_MODEL,
  DEFAULT_IMAGE_TO_VIDEO_MODEL,
  DEFAULT_REFERENCE_TO_VIDEO_MODEL,
  PACK066_FPS,
  PACK067_I2V_FPS,
  normalizeProviderOutput,
  buildWan22TextToVideoInput,
  buildWan22ImageToVideoInput,
  buildWan27ReferenceToVideoInput,
  defaultModelForOperation,
  generateVideo
};
