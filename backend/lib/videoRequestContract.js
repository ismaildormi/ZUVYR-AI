'use strict';

const { config, normalizeVideoOperation } = require('./videoOperationRegistry');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LANGUAGE = /^(?:auto|[a-z]{2,3}(?:-[a-z]{2})?)$/i;

function requestError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function optionalUuid(value, code) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value);
  if (!UUID.test(normalized)) throw requestError(code);
  return normalized;
}

function normalizeUuidList(value, code, maxItems) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw requestError(code);
  const normalized = value.map(item => String(item || ''));
  if (normalized.some(item => !UUID.test(item))) throw requestError(code);
  return [...new Set(normalized)];
}

function normalizeLanguage(value, fallback) {
  const normalized = String(value || fallback).trim();
  if (!LANGUAGE.test(normalized)) throw requestError('invalid_video_language');
  return normalized.toLowerCase();
}

function normalizeVideoRequest(body = {}) {
  const operation = normalizeVideoOperation(body.videoOperation);
  const definition = config.operations[operation];
  const prompt = String(body.prompt || '').trim();
  if (definition.requiresPrompt && !prompt) throw requestError('video_prompt_required');
  if (prompt.length > config.requestLimits.maxPromptCharacters) {
    throw requestError('video_prompt_too_long');
  }

  const sourceImageAssetId = optionalUuid(body.sourceImageAssetId, 'invalid_video_source_image');
  const sourceVideoAssetId = optionalUuid(body.sourceVideoAssetId, 'invalid_video_source_video');
  const startFrameAssetId = optionalUuid(body.startFrameAssetId, 'invalid_video_start_frame');
  const endFrameAssetId = optionalUuid(body.endFrameAssetId, 'invalid_video_end_frame');
  const referenceImageAssetIds = normalizeUuidList(
    body.referenceImageAssetIds,
    'invalid_video_reference_images',
    Number(config.pack067?.maxReferenceImages || 4)
  );

  const isTextToVideo = operation === 'text_to_video';
  const isImageToVideo = operation === 'image_to_video';
  const isReferenceToVideo = operation === 'reference_to_video';

  if (definition.requiresSourceImage && !sourceImageAssetId && !startFrameAssetId) {
    throw requestError('video_source_image_required');
  }
  if (
    isImageToVideo &&
    sourceImageAssetId &&
    startFrameAssetId &&
    sourceImageAssetId !== startFrameAssetId
  ) {
    throw requestError('video_source_image_conflict');
  }
  if (definition.requiresSourceVideo && !sourceVideoAssetId) {
    throw requestError('video_source_video_required');
  }
  if (isImageToVideo && endFrameAssetId && !sourceImageAssetId && !startFrameAssetId) {
    throw requestError('video_start_frame_required');
  }
  if (!isImageToVideo && endFrameAssetId && !startFrameAssetId) {
    throw requestError('video_start_frame_required');
  }
  if (isReferenceToVideo) {
    if (referenceImageAssetIds.length === 0) {
      throw requestError('video_reference_images_required');
    }
    if (
      sourceImageAssetId ||
      sourceVideoAssetId ||
      startFrameAssetId ||
      endFrameAssetId
    ) {
      throw requestError('video_reference_source_conflict');
    }
  } else if (referenceImageAssetIds.length > 0) {
    throw requestError('video_reference_images_not_supported');
  }

  const raw = body.videoOptions;
  if (raw !== undefined && (!raw || typeof raw !== 'object' || Array.isArray(raw))) {
    throw requestError('invalid_video_options');
  }
  const options = raw || {};

  let allowed;
  let limits;
  if (isTextToVideo) {
    allowed = new Set(['durationSeconds','ratio','resolution','fps','audio','seed','exportFormat']);
    limits = config.pack066.textToVideo;
  } else if (isImageToVideo) {
    allowed = new Set(['durationSeconds','resolution','fps','audio','seed','exportFormat']);
    limits = config.pack067.imageToVideo;
  } else if (isReferenceToVideo) {
    allowed = new Set([
      'durationSeconds','ratio','resolution','audio','seed','exportFormat',
      'negativePrompt','shotType'
    ]);
    limits = config.pack067.referenceToVideo;
  } else {
    allowed = new Set([
      'durationSeconds','ratio','resolution','fps','audio','seed',
      'subtitleLanguage','targetLanguage','exportFormat'
    ]);
    limits = {
      allowedDurationSeconds: config.requestLimits.allowedDurationSeconds,
      allowedRatios: config.requestLimits.allowedRatios,
      allowedResolutions: config.requestLimits.allowedResolutions,
      allowedFps: config.requestLimits.allowedFps,
      allowedExportFormats: config.requestLimits.allowedExportFormats
    };
  }

  if (Object.keys(options).some(key => !allowed.has(key))) {
    throw requestError('unsupported_video_option');
  }

  const durationSeconds = options.durationSeconds === undefined
    ? 5
    : Number(options.durationSeconds);
  const ratio = isImageToVideo
    ? null
    : String(options.ratio || '16:9');
  const resolution = String(
    options.resolution ||
      (isReferenceToVideo ? '1080p' : (isTextToVideo || isImageToVideo ? '480p' : '720p'))
  ).toLowerCase();
  const fps = isReferenceToVideo
    ? null
    : (options.fps === undefined ? (isTextToVideo || isImageToVideo ? 16 : 24) : Number(options.fps));
  const audio = options.audio === undefined ? false : options.audio;
  const seed = options.seed === undefined || options.seed === null
    ? null
    : Number(options.seed);
  const exportFormat = String(options.exportFormat || 'mp4').toLowerCase();

  if (!limits.allowedDurationSeconds.includes(durationSeconds)) {
    throw requestError('invalid_video_duration');
  }
  if (
    !isImageToVideo &&
    Array.isArray(limits.allowedRatios) &&
    !limits.allowedRatios.includes(ratio)
  ) {
    throw requestError('invalid_video_ratio');
  }
  if (!limits.allowedResolutions.includes(resolution)) {
    throw requestError('invalid_video_resolution');
  }
  if (
    !isReferenceToVideo &&
    Array.isArray(limits.allowedFps) &&
    !limits.allowedFps.includes(fps)
  ) {
    throw requestError('invalid_video_fps');
  }
  if (typeof audio !== 'boolean') throw requestError('invalid_video_audio');
  if ((isTextToVideo || isImageToVideo || isReferenceToVideo) && audio) {
    throw requestError('video_audio_unsupported');
  }
  if (seed !== null && (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647)) {
    throw requestError('invalid_video_seed');
  }
  if (!limits.allowedExportFormats.includes(exportFormat)) {
    throw requestError('invalid_video_export_format');
  }

  const normalizedOptions = {
    durationSeconds,
    ratio,
    resolution,
    fps,
    audio,
    seed,
    subtitleLanguage:
      isTextToVideo || isImageToVideo || isReferenceToVideo
        ? 'auto'
        : normalizeLanguage(options.subtitleLanguage, 'auto'),
    targetLanguage:
      isTextToVideo || isImageToVideo || isReferenceToVideo
        ? 'auto'
        : normalizeLanguage(options.targetLanguage, 'auto'),
    exportFormat
  };

  if (isReferenceToVideo) {
    const negativePrompt = String(options.negativePrompt || '').trim();
    if (negativePrompt.length > config.requestLimits.maxPromptCharacters) {
      throw requestError('video_negative_prompt_too_long');
    }
    const shotType = String(options.shotType || 'single').toLowerCase();
    if (!limits.allowedShotTypes.includes(shotType)) {
      throw requestError('invalid_video_shot_type');
    }
    normalizedOptions.negativePrompt = negativePrompt;
    normalizedOptions.shotType = shotType;
  }

  return Object.freeze({
    operation,
    prompt,
    sourceImageAssetId,
    sourceVideoAssetId,
    startFrameAssetId,
    endFrameAssetId,
    referenceImageAssetIds: Object.freeze(referenceImageAssetIds),
    options: Object.freeze(normalizedOptions)
  });
}

module.exports = { normalizeVideoRequest };
