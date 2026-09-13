'use strict';

const {
  createNormalizedAdapter,
  ProviderAdapterError
} = require('./providerAdapterContract');

function ensureFunction(value, code) {
  if (typeof value !== 'function') {
    throw new ProviderAdapterError({
      code,
      message: 'Provider compatibility bridge requires an executor.'
    });
  }
  return value;
}

function adaptLegacyTextCall({
  id,
  providerId,
  capabilities = ['chat', 'code', 'multimodal_chat'],
  call
} = {}) {
  const execute = ensureFunction(call, 'legacy_text_call_required');
  return createNormalizedAdapter({
    id: id || `${providerId}:legacy-text`,
    providerId,
    capabilities,
    execute: request => {
      const messages = Array.isArray(request.input.messages)
        ? request.input.messages
        : [];
      return execute(
        request.modelId,
        messages,
        {
          ...request.options,
          signal: request.signal
        }
      );
    }
  });
}

function adaptLegacyImageGenerate({
  id,
  providerId,
  capabilities = ['image.generate'],
  generate
} = {}) {
  const execute = ensureFunction(generate, 'legacy_image_generate_required');
  return createNormalizedAdapter({
    id: id || `${providerId}:legacy-image`,
    providerId,
    capabilities,
    execute: request => execute(
      String(request.input.prompt || ''),
      {
        ...request.options,
        signal: request.signal,
        input: request.input
      }
    )
  });
}

function adaptLegacyVideoGenerate({
  id,
  providerId,
  capabilities = ['video.text_to_video', 'video.image_to_video'],
  generate
} = {}) {
  const execute = ensureFunction(generate, 'legacy_video_generate_required');
  return createNormalizedAdapter({
    id: id || `${providerId}:legacy-video`,
    providerId,
    capabilities,
    execute: request => execute(
      {
        operation: request.input.operation || request.capability.replace(/^video\./, ''),
        prompt: request.input.prompt || '',
        imageUrl: request.input.imageUrl || null,
        ...request.input
      },
      {
        options: request.options,
        signal: request.signal
      }
    )
  });
}

function adaptLegacyGeneric({
  id,
  providerId,
  capabilities,
  invoke
} = {}) {
  const execute = ensureFunction(invoke, 'legacy_generic_invoke_required');
  return createNormalizedAdapter({
    id: id || `${providerId}:legacy-generic`,
    providerId,
    capabilities,
    execute: request => execute(request)
  });
}

module.exports = {
  adaptLegacyTextCall,
  adaptLegacyImageGenerate,
  adaptLegacyVideoGenerate,
  adaptLegacyGeneric
};
