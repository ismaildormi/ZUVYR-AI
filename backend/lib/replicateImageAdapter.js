'use strict';

const Replicate = require('replicate');
const { createNormalizedAdapter } = require('./providerAdapterContract');

const REPLICATE_IMAGE_PROVIDER = 'replicate';
const REPLICATE_IMAGE_MODEL = 'black-forest-labs/flux-schnell';

function outputUrl(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.url === 'function') return value.url();
  if (value && typeof value.url === 'string') return value.url;
  return null;
}

function normalizeReplicateOutputs(raw) {
  const values = Array.isArray(raw) ? raw : [raw];
  return values.map(outputUrl).filter(Boolean);
}

function createReplicateImageAdapter({ token = process.env.REPLICATE_API_TOKEN, createClient = null } = {}) {
  return createNormalizedAdapter({
    id: 'pack061-replicate-image-generate',
    providerId: REPLICATE_IMAGE_PROVIDER,
    capabilities: ['image.generate'],
    async execute(request) {
      if (!token) {
        const error = new Error('replicate_image_provider_not_configured');
        error.code = 'replicate_image_provider_not_configured';
        throw error;
      }
      const client = createClient ? createClient(token) : new Replicate({ auth: token });
      const model = request.modelId || REPLICATE_IMAGE_MODEL;
      const raw = await client.run(model, {
        input: {
          prompt: String(request.input.prompt || ''),
          aspect_ratio: '1:1',
          num_outputs: 1,
          output_format: 'webp'
        }
      });
      const urls = normalizeReplicateOutputs(raw);
      if (!urls.length) {
        const error = new Error('replicate_returned_no_image_url');
        error.code = 'replicate_returned_no_image_url';
        throw error;
      }
      return {
        output: urls,
        usage: { images: urls.length }
      };
    }
  });
}

module.exports = {
  REPLICATE_IMAGE_PROVIDER,
  REPLICATE_IMAGE_MODEL,
  outputUrl,
  normalizeReplicateOutputs,
  createReplicateImageAdapter
};
