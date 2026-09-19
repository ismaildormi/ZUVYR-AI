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
function finiteNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw requestError(code);
  return number;
}
function booleanOption(value, fallback, code) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw requestError(code);
  return value;
}
function finiteArray(value, length, code) {
  if (!Array.isArray(value) || (length !== null && value.length !== length)) {
    throw requestError(code);
  }
  const out = value.map(item => Number(item));
  if (out.some(item => !Number.isFinite(item))) throw requestError(code);
  return out;
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
  const sourceAudioAssetId = optionalUuid(body.sourceAudioAssetId, 'invalid_video_source_audio');
  const startFrameAssetId = optionalUuid(body.startFrameAssetId, 'invalid_video_start_frame');
  const endFrameAssetId = optionalUuid(body.endFrameAssetId, 'invalid_video_end_frame');
  const referenceImageAssetIds = normalizeUuidList(
    body.referenceImageAssetIds,
    'invalid_video_reference_images',
    Number(config.pack067?.maxReferenceImages || 4)
  );

  if (definition.requiresSourceImage && !sourceImageAssetId && !startFrameAssetId) {
    throw requestError('video_source_image_required');
  }
  if (definition.requiresSourceVideo && !sourceVideoAssetId) {
    throw requestError('video_source_video_required');
  }
  if (definition.requiresSourceAudio && !sourceAudioAssetId) {
    throw requestError('video_source_audio_required');
  }

  const isText = operation === 'text_to_video';
  const isI2v = operation === 'image_to_video';
  const isR2v = operation === 'reference_to_video';
  const isPack068 = [
    'edit','extend','object_remove','background_remove',
    'relight','recamera','lip_sync'
  ].includes(operation);

  if (
    isI2v &&
    sourceImageAssetId &&
    startFrameAssetId &&
    sourceImageAssetId !== startFrameAssetId
  ) throw requestError('video_source_image_conflict');

  if (endFrameAssetId && !startFrameAssetId && !sourceImageAssetId) {
    throw requestError('video_start_frame_required');
  }

  if (isR2v) {
    if (!referenceImageAssetIds.length) throw requestError('video_reference_images_required');
    if (
      sourceImageAssetId || sourceVideoAssetId || sourceAudioAssetId ||
      startFrameAssetId || endFrameAssetId
    ) throw requestError('video_reference_source_conflict');
  } else if (referenceImageAssetIds.length) {
    throw requestError('video_reference_images_not_supported');
  }

  if (isPack068 && (sourceImageAssetId || startFrameAssetId || endFrameAssetId)) {
    throw requestError('video_image_source_not_supported_for_operation');
  }
  if (operation !== 'lip_sync' && sourceAudioAssetId) {
    throw requestError('video_source_audio_not_supported');
  }

  const raw = body.videoOptions;
  if (raw !== undefined && (!raw || typeof raw !== 'object' || Array.isArray(raw))) {
    throw requestError('invalid_video_options');
  }
  const options = raw || {};
  let normalizedOptions;

  if (isText) {
    const allowed = new Set(['durationSeconds','ratio','resolution','fps','audio','seed','exportFormat']);
    if (Object.keys(options).some(key => !allowed.has(key))) throw requestError('unsupported_video_option');
    const limits = config.pack066.textToVideo;
    const durationSeconds = options.durationSeconds === undefined ? 5 : Number(options.durationSeconds);
    const ratio = String(options.ratio || '16:9');
    const resolution = String(options.resolution || '480p').toLowerCase();
    const fps = options.fps === undefined ? 16 : Number(options.fps);
    const audio = booleanOption(options.audio, false, 'invalid_video_audio');
    const seed = options.seed == null ? null : Number(options.seed);
    const exportFormat = String(options.exportFormat || 'mp4').toLowerCase();
    if (!limits.allowedDurationSeconds.includes(durationSeconds)) throw requestError('invalid_video_duration');
    if (!limits.allowedRatios.includes(ratio)) throw requestError('invalid_video_ratio');
    if (!limits.allowedResolutions.includes(resolution)) throw requestError('invalid_video_resolution');
    if (!limits.allowedFps.includes(fps)) throw requestError('invalid_video_fps');
    if (audio) throw requestError('video_audio_unsupported');
    if (seed !== null && (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647)) throw requestError('invalid_video_seed');
    if (!limits.allowedExportFormats.includes(exportFormat)) throw requestError('invalid_video_export_format');
    normalizedOptions = {durationSeconds,ratio,resolution,fps,audio,seed,subtitleLanguage:'auto',targetLanguage:'auto',exportFormat};
  } else if (isI2v) {
    const allowed = new Set(['durationSeconds','resolution','fps','audio','seed','exportFormat']);
    if (Object.keys(options).some(key => !allowed.has(key))) throw requestError('unsupported_video_option');
    const limits = config.pack067.imageToVideo;
    const durationSeconds = options.durationSeconds === undefined ? 5 : Number(options.durationSeconds);
    const resolution = String(options.resolution || '480p').toLowerCase();
    const fps = options.fps === undefined ? 16 : Number(options.fps);
    const audio = booleanOption(options.audio, false, 'invalid_video_audio');
    const seed = options.seed == null ? null : Number(options.seed);
    const exportFormat = String(options.exportFormat || 'mp4').toLowerCase();
    if (!limits.allowedDurationSeconds.includes(durationSeconds)) throw requestError('invalid_video_duration');
    if (!limits.allowedResolutions.includes(resolution)) throw requestError('invalid_video_resolution');
    if (!limits.allowedFps.includes(fps)) throw requestError('invalid_video_fps');
    if (audio) throw requestError('video_audio_unsupported');
    if (seed !== null && (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647)) throw requestError('invalid_video_seed');
    if (!limits.allowedExportFormats.includes(exportFormat)) throw requestError('invalid_video_export_format');
    normalizedOptions = {durationSeconds,ratio:null,resolution,fps,audio,seed,subtitleLanguage:'auto',targetLanguage:'auto',exportFormat};
  } else if (isR2v) {
    const allowed = new Set(['durationSeconds','ratio','resolution','audio','seed','exportFormat','negativePrompt','shotType']);
    if (Object.keys(options).some(key => !allowed.has(key))) throw requestError('unsupported_video_option');
    const limits = config.pack067.referenceToVideo;
    const durationSeconds = options.durationSeconds === undefined ? 5 : Number(options.durationSeconds);
    const ratio = String(options.ratio || '16:9');
    const resolution = String(options.resolution || '1080p').toLowerCase();
    const audio = booleanOption(options.audio, false, 'invalid_video_audio');
    const seed = options.seed == null ? null : Number(options.seed);
    const exportFormat = String(options.exportFormat || 'mp4').toLowerCase();
    const negativePrompt = String(options.negativePrompt || '').trim();
    const shotType = String(options.shotType || 'single').toLowerCase();
    if (!limits.allowedDurationSeconds.includes(durationSeconds)) throw requestError('invalid_video_duration');
    if (!limits.allowedRatios.includes(ratio)) throw requestError('invalid_video_ratio');
    if (!limits.allowedResolutions.includes(resolution)) throw requestError('invalid_video_resolution');
    if (audio) throw requestError('video_audio_unsupported');
    if (seed !== null && (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647)) throw requestError('invalid_video_seed');
    if (!limits.allowedExportFormats.includes(exportFormat)) throw requestError('invalid_video_export_format');
    if (negativePrompt.length > config.requestLimits.maxPromptCharacters) throw requestError('video_negative_prompt_too_long');
    if (!limits.allowedShotTypes.includes(shotType)) throw requestError('invalid_video_shot_type');
    normalizedOptions = {durationSeconds,ratio,resolution,fps:null,audio,seed,subtitleLanguage:'auto',targetLanguage:'auto',exportFormat,negativePrompt,shotType};
  } else if (operation === 'edit') {
    const allowed = new Set(['durationSeconds','startTimeSeconds','retakeMode','exportFormat']);
    if (Object.keys(options).some(key => !allowed.has(key))) throw requestError('unsupported_video_option');
    const cfg = config.pack068.edit;
    const durationSeconds = options.durationSeconds === undefined ? 5 : Number(options.durationSeconds);
    const startTimeSeconds = options.startTimeSeconds === undefined
      ? 0
      : finiteNumber(options.startTimeSeconds, 'invalid_video_start_time');
    const retakeMode = String(options.retakeMode || 'replace_video').toLowerCase();
    const exportFormat = String(options.exportFormat || 'mp4').toLowerCase();
    if (!cfg.allowedDurationSeconds.includes(durationSeconds)) throw requestError('invalid_video_duration');
    if (startTimeSeconds < 0) throw requestError('invalid_video_start_time');
    if (!cfg.allowedRetakeModes.includes(retakeMode)) throw requestError('invalid_video_retake_mode');
    if (!cfg.allowedExportFormats.includes(exportFormat)) throw requestError('invalid_video_export_format');
    normalizedOptions = {durationSeconds,startTimeSeconds,retakeMode,exportFormat};
  } else if (operation === 'extend') {
    const allowed = new Set(['durationSeconds','extendMode','contextSeconds','exportFormat']);
    if (Object.keys(options).some(key => !allowed.has(key))) throw requestError('unsupported_video_option');
    const cfg = config.pack068.extend;
    const durationSeconds = options.durationSeconds === undefined ? 5 : finiteNumber(options.durationSeconds,'invalid_video_duration');
    const extendMode = String(options.extendMode || 'end').toLowerCase();
    const contextSeconds = options.contextSeconds === undefined ? null : finiteNumber(options.contextSeconds,'invalid_video_context');
    const exportFormat = String(options.exportFormat || 'mp4').toLowerCase();
    if (durationSeconds < cfg.minDurationSeconds || durationSeconds > cfg.maxDurationSeconds) throw requestError('invalid_video_duration');
    if (!cfg.allowedModes.includes(extendMode)) throw requestError('invalid_video_extend_mode');
    if (contextSeconds !== null && (contextSeconds < cfg.minContextSeconds || contextSeconds > cfg.maxContextSeconds)) throw requestError('invalid_video_context');
    if (!cfg.allowedExportFormats.includes(exportFormat)) throw requestError('invalid_video_export_format');
    normalizedOptions = {durationSeconds,extendMode,contextSeconds,exportFormat};
  } else if (operation === 'object_remove') {
    const allowed = new Set(['preserveAudio','exportFormat']);
    if (Object.keys(options).some(key => !allowed.has(key))) throw requestError('unsupported_video_option');
    const preserveAudio = booleanOption(options.preserveAudio,true,'invalid_video_preserve_audio');
    const exportFormat = String(options.exportFormat || 'mp4').toLowerCase();
    if (exportFormat !== 'mp4') throw requestError('invalid_video_export_format');
    normalizedOptions = {preserveAudio,exportFormat};
  } else if (operation === 'background_remove') {
    const allowed = new Set(['preserveAudio','backgroundColor','autoZoom','exportFormat']);
    if (Object.keys(options).some(key => !allowed.has(key))) throw requestError('unsupported_video_option');
    const cfg = config.pack068.backgroundRemove;
    const preserveAudio = booleanOption(options.preserveAudio,true,'invalid_video_preserve_audio');
    const autoZoom = booleanOption(options.autoZoom,false,'invalid_video_auto_zoom');
    const backgroundColor = String(options.backgroundColor || 'Black');
    const exportFormat = String(options.exportFormat || 'mp4').toLowerCase();
    if (!cfg.allowedBackgroundColors.includes(backgroundColor)) throw requestError('invalid_video_background_color');
    if (exportFormat !== 'mp4') throw requestError('invalid_video_export_format');
    normalizedOptions = {preserveAudio,backgroundColor,autoZoom,exportFormat};
  } else if (operation === 'relight') {
    const allowed = new Set(['seed','lightDirection','useSkyMask','exportFormat']);
    if (Object.keys(options).some(key => !allowed.has(key))) throw requestError('unsupported_video_option');
    const cfg = config.pack068.relight;
    const seed = options.seed == null ? null : Number(options.seed);
    const lightDirection = String(options.lightDirection || 'Left');
    const useSkyMask = booleanOption(options.useSkyMask,false,'invalid_video_sky_mask');
    const exportFormat = String(options.exportFormat || 'mp4').toLowerCase();
    if (!cfg.allowedLightDirections.includes(lightDirection)) throw requestError('invalid_video_light_direction');
    if (seed !== null && (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647)) throw requestError('invalid_video_seed');
    if (exportFormat !== 'mp4') throw requestError('invalid_video_export_format');
    normalizedOptions = {seed,lightDirection,useSkyMask,exportFormat};
  } else if (operation === 'recamera') {
    const allowed = new Set(['seed','cameraMode','motionMode','trajectory','targetPose','exportFormat']);
    if (Object.keys(options).some(key => !allowed.has(key))) throw requestError('unsupported_video_option');
    const cfg = config.pack068.recamera;
    const seed = options.seed == null ? null : Number(options.seed);
    const cameraMode = String(options.cameraMode || 'target').toLowerCase();
    const motionMode = String(options.motionMode || 'gradual').toLowerCase();
    const exportFormat = String(options.exportFormat || 'mp4').toLowerCase();
    if (!cfg.allowedCameraModes.includes(cameraMode)) throw requestError('invalid_video_camera_mode');
    if (!cfg.allowedMotionModes.includes(motionMode)) throw requestError('invalid_video_motion_mode');
    if (seed !== null && (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647)) throw requestError('invalid_video_seed');
    if (exportFormat !== 'mp4') throw requestError('invalid_video_export_format');

    let trajectory = null;
    let targetPose = null;
    if (cameraMode === 'target') {
      targetPose = finiteArray(options.targetPose,5,'invalid_video_target_pose');
      if (options.trajectory !== undefined) throw requestError('video_trajectory_not_allowed');
    } else {
      if (!options.trajectory || typeof options.trajectory !== 'object' || Array.isArray(options.trajectory)) throw requestError('invalid_video_trajectory');
      const theta = finiteArray(options.trajectory.theta,null,'invalid_video_trajectory');
      const phi = finiteArray(options.trajectory.phi,null,'invalid_video_trajectory');
      const radius = finiteArray(options.trajectory.radius,null,'invalid_video_trajectory');
      if (!theta.length || theta.length !== phi.length || theta.length !== radius.length) throw requestError('invalid_video_trajectory');
      trajectory = {theta,phi,radius};
      if (options.targetPose !== undefined) throw requestError('video_target_pose_not_allowed');
    }
    normalizedOptions = {seed,cameraMode,motionMode,trajectory,targetPose,exportFormat};
  } else if (operation === 'lip_sync') {
    const allowed = new Set(['exportFormat']);
    if (Object.keys(options).some(key => !allowed.has(key))) throw requestError('unsupported_video_option');
    const exportFormat = String(options.exportFormat || 'mp4').toLowerCase();
    if (exportFormat !== 'mp4') throw requestError('invalid_video_export_format');
    normalizedOptions = {exportFormat};
  } else {
    const allowed = new Set(['durationSeconds','ratio','resolution','fps','audio','seed','subtitleLanguage','targetLanguage','exportFormat']);
    if (Object.keys(options).some(key => !allowed.has(key))) throw requestError('unsupported_video_option');
    const durationSeconds = options.durationSeconds === undefined ? 5 : Number(options.durationSeconds);
    const ratio = String(options.ratio || '16:9');
    const resolution = String(options.resolution || '720p').toLowerCase();
    const fps = options.fps === undefined ? 24 : Number(options.fps);
    const audio = booleanOption(options.audio,false,'invalid_video_audio');
    const seed = options.seed == null ? null : Number(options.seed);
    const exportFormat = String(options.exportFormat || 'mp4').toLowerCase();
    if (!config.requestLimits.allowedDurationSeconds.includes(durationSeconds)) throw requestError('invalid_video_duration');
    if (!config.requestLimits.allowedRatios.includes(ratio)) throw requestError('invalid_video_ratio');
    if (!config.requestLimits.allowedResolutions.includes(resolution)) throw requestError('invalid_video_resolution');
    if (!config.requestLimits.allowedFps.includes(fps)) throw requestError('invalid_video_fps');
    if (seed !== null && (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647)) throw requestError('invalid_video_seed');
    if (!config.requestLimits.allowedExportFormats.includes(exportFormat)) throw requestError('invalid_video_export_format');
    normalizedOptions = {
      durationSeconds,ratio,resolution,fps,audio,seed,
      subtitleLanguage:normalizeLanguage(options.subtitleLanguage,'auto'),
      targetLanguage:normalizeLanguage(options.targetLanguage,'auto'),
      exportFormat
    };
  }

  return Object.freeze({
    operation,
    prompt,
    sourceImageAssetId,
    sourceVideoAssetId,
    sourceAudioAssetId,
    startFrameAssetId,
    endFrameAssetId,
    referenceImageAssetIds:Object.freeze(referenceImageAssetIds),
    options:Object.freeze(normalizedOptions)
  });
}

module.exports = { normalizeVideoRequest };
