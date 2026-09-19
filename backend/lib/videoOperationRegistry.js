'use strict';

const config = require('../config/video-system.v1.json');

function videoOperationError(code, operation) {
  const error = new Error(code);
  error.code = code;
  error.operation = operation;
  return error;
}
function normalizeVideoOperation(value) {
  const operation = String(value || 'text_to_video').trim().toLowerCase();
  if (!Object.hasOwn(config.operations, operation)) throw videoOperationError('unknown_video_operation', operation);
  return operation;
}
function gateEnabled(name, env) {
  return Boolean(name) && String(env && env[name] || '').trim().toLowerCase() === 'true';
}
function assertVideoOperationAvailable(value, { env = process.env } = {}) {
  const operation = normalizeVideoOperation(value);
  const definition = config.operations[operation];
  if (definition.status === 'blocked_unpriced') throw videoOperationError('video_operation_unpriced', operation);
  if (definition.runtimeGateEnvironment) {
    if (!gateEnabled(definition.runtimeGateEnvironment, env)) throw videoOperationError('video_operation_disabled', operation);
  } else if (definition.enabledByDefault !== true) {
    throw videoOperationError('video_operation_disabled', operation);
  }
  return Object.freeze({ operation, ...definition });
}
function providerSupports(provider, operation) {
  const definition = config.providers[provider];
  return Boolean(definition && definition.implementedOperations.includes(normalizeVideoOperation(operation)));
}
function assertProviderOptions(provider, request) {
  const definition = config.providers[provider];
  const supported = definition && definition.supportedOptions;
  if (!supported) return true;
  const options = request && request.options || {durationSeconds:5,ratio:'16:9',resolution:'480p',fps:16,audio:false,exportFormat:'mp4'};
  const operation = normalizeVideoOperation(request && request.operation);
  if (!supported.durationSeconds.includes(Number(options.durationSeconds))) throw videoOperationError('video_duration_not_supported_by_provider', operation);
  if (!supported.ratios.includes(String(options.ratio))) throw videoOperationError('video_ratio_not_supported_by_provider', operation);
  if (!supported.resolutions.includes(String(options.resolution).toLowerCase())) throw videoOperationError('video_resolution_not_supported_by_provider', operation);
  if (!supported.fps.includes(Number(options.fps))) throw videoOperationError('video_fps_not_supported_by_provider', operation);
  if (!supported.audio.includes(Boolean(options.audio))) throw videoOperationError('video_audio_not_supported_by_provider', operation);
  if (!supported.exportFormats.includes(String(options.exportFormat || 'mp4').toLowerCase())) throw videoOperationError('video_export_not_supported_by_provider', operation);
  return true;
}
function assertVideoRequestAvailable(request, options = {}) {
  const available = assertVideoOperationAvailable(request && request.operation, options);
  const provider = available.provider;
  if (!provider || !providerSupports(provider, available.operation)) throw videoOperationError('video_operation_not_supported_by_provider', available.operation);
  assertProviderOptions(provider, request || {operation:available.operation});
  return Object.freeze({...available, provider});
}
function inventory() {
  return Object.freeze({version:config.version,operations:{...config.operations},providers:{...config.providers},jobs:{...config.jobs}});
}
module.exports={config,normalizeVideoOperation,assertVideoOperationAvailable,assertVideoRequestAvailable,assertProviderOptions,providerSupports,inventory};
