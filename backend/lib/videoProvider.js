'use strict';

const Replicate = require('replicate');
const { providerSupports } = require('./videoOperationRegistry');

const DEFAULT_VIDEO_MODEL = 'wan-video/wan-2.2-t2v-fast';
const PACK066_FPS = 16;

function providerError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizeProviderOutput(output) {
  const first = Array.isArray(output) ? output[0] : output;
  if (typeof first === 'string') return first;
  if (first && typeof first.url === 'function') return first.url();
  if (first && typeof first.url === 'string') return first.url;
  throw providerError('video_provider_returned_no_url');
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
  if (fps !== PACK066_FPS) {
    throw providerError('video_fps_not_supported_by_provider');
  }
  if (!['16:9', '9:16'].includes(request.options?.ratio)) {
    throw providerError('video_ratio_not_supported_by_provider');
  }
  if (!['480p', '720p'].includes(request.options?.resolution)) {
    throw providerError('video_resolution_not_supported_by_provider');
  }
  if (request.options?.audio !== false) {
    throw providerError('video_audio_not_supported_by_provider');
  }
  if (request.options?.exportFormat !== 'mp4') {
    throw providerError('video_export_not_supported_by_provider');
  }

  const numFrames = durationSeconds * PACK066_FPS + 1;
  const input = {
    prompt: request.prompt,
    go_fast: true,
    num_frames: numFrames,
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

async function generateVideo(request, {
  env = process.env,
  createClient = token => new Replicate({ auth: token })
} = {}) {
  if (!providerSupports('replicate', request.operation)) {
    throw providerError('video_operation_not_supported_by_provider');
  }
  if (String(env.PACK066_PAID_EXECUTION_ENABLED || '').toLowerCase() !== 'true') {
    throw providerError('pack066_paid_execution_disabled');
  }
  if (!env.REPLICATE_API_TOKEN) {
    throw providerError('replicate_video_provider_not_configured');
  }
  const model = env.REPLICATE_VIDEO_MODEL || DEFAULT_VIDEO_MODEL;
  if (model !== DEFAULT_VIDEO_MODEL) {
    throw providerError('replicate_video_model_unverified');
  }

  const input = buildWan22TextToVideoInput(request);
  const client = createClient(env.REPLICATE_API_TOKEN);
  const output = await client.run(model, { input });
  const url = normalizeProviderOutput(output);

  return Object.freeze({
    url,
    provider: 'replicate',
    model,
    requestedDurationSeconds: request.options.durationSeconds,
    numFrames: input.num_frames,
    fps: input.frames_per_second,
    billableUnits: Object.freeze({
      unitType: 'videos',
      units: 1,
      resolution: request.options.resolution
    })
  });
}

module.exports = {
  DEFAULT_VIDEO_MODEL,
  PACK066_FPS,
  normalizeProviderOutput,
  buildWan22TextToVideoInput,
  generateVideo
};
