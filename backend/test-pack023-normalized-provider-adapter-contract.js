'use strict';

(async () => {
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cfg = require('./config/provider-adapter-contract.v1.json');
const {
  CONTRACT_VERSION,
  SURFACES,
  ProviderAdapterError,
  normalizeProviderRequest,
  normalizeProviderUsage,
  normalizeProviderResult,
  normalizeProviderError,
  createNormalizedAdapter
} = require('./lib/providerAdapterContract');
const {
  adaptLegacyTextCall,
  adaptLegacyImageGenerate,
  adaptLegacyVideoGenerate,
  adaptLegacyGeneric
} = require('./lib/normalizedProviderAdapters');

assert.equal(cfg.version, 'pack-023.provider-adapter-contract.v1');
assert.equal(cfg.authority, 'backend/lib/providerAdapterContract.js');
assert.equal(cfg.compatibilityAuthority, 'backend/lib/normalizedProviderAdapters.js');

for (const surface of ['text', 'image', 'video', 'audio', 'research', '3d', 'browser', 'sandbox']) {
  assert(SURFACES.has(surface), `surface missing from contract: ${surface}`);
  assert(cfg.surfaces.includes(surface), `surface missing from config: ${surface}`);
}

for (const boundary of cfg.existingBoundaries) {
  const relative = boundary.path.replace(/^backend\//, '');
  assert(fs.existsSync(path.join(__dirname, relative)), `existing boundary path missing: ${boundary.path}`);
  if (boundary.artifactPath) {
    assert(
      fs.existsSync(path.join(__dirname, boundary.artifactPath.replace(/^backend\//, ''))),
      `existing artifact boundary missing: ${boundary.artifactPath}`
    );
  }
  assert(
    ['adaptLegacyTextCall', 'adaptLegacyImageGenerate', 'adaptLegacyVideoGenerate', 'adaptLegacyGeneric']
      .includes(boundary.normalizedBridge),
    `boundary missing normalized bridge: ${boundary.id}`
  );
}

const controller = new AbortController();

const textRequest = normalizeProviderRequest({
  requestId: 'req-text-1',
  capability: 'chat',
  providerId: 'groq',
  modelId: 'openai/gpt-oss-20b',
  input: { messages: [{ role: 'user', content: 'hello' }] },
  options: {
    maxOutputTokens: 100,
    timeoutMs: 1000,
    apiKey: 'MUST_NOT_SURVIVE',
    secret: 'MUST_NOT_SURVIVE'
  },
  metadata: {
    projectId: 'project-1',
    apiKey: 'MUST_NOT_SURVIVE'
  },
  signal: controller.signal
});

assert.equal(textRequest.contractVersion, CONTRACT_VERSION);
assert.equal(textRequest.surface, 'text');
assert.equal(textRequest.options.maxOutputTokens, 100);
assert.equal(textRequest.options.apiKey, undefined);
assert.equal(textRequest.options.secret, undefined);
assert.equal(textRequest.metadata.projectId, 'project-1');
assert.equal(textRequest.metadata.apiKey, undefined);

const textResult = normalizeProviderResult({
  text: 'hello back',
  usage: {
    prompt_tokens: 7,
    completion_tokens: 3,
    total_tokens: 10,
    cost: 0.001
  }
}, textRequest, {
  startedAtMs: 100,
  completedAtMs: 125
});

assert.equal(textResult.status, 'ok');
assert.equal(textResult.output.text, 'hello back');
assert.equal(textResult.artifacts.length, 0);
assert.equal(textResult.usage.inputTokens, 7);
assert.equal(textResult.usage.outputTokens, 3);
assert.equal(textResult.usage.totalTokens, 10);
assert.equal(textResult.usage.costUsd, 0.001);
assert.equal(textResult.timing.latencyMs, 25);

const imageRequest = normalizeProviderRequest({
  requestId: 'req-image-1',
  capability: 'image.generate',
  providerId: 'replicate',
  modelId: 'image-model',
  input: { prompt: 'a lighthouse' }
});
const imageResult = normalizeProviderResult({
  imageUrl: 'https://example.com/generated.png',
  usage: { images: 1, cost_usd: 0.02 }
}, imageRequest);
assert.equal(imageResult.output.primaryUrl, 'https://example.com/generated.png');
assert.equal(imageResult.artifacts[0].kind, 'image');
assert.equal(imageResult.usage.images, 1);
assert.equal(imageResult.usage.costUsd, 0.02);

const videoRequest = normalizeProviderRequest({
  requestId: 'req-video-1',
  capability: 'video.text_to_video',
  providerId: 'replicate',
  modelId: 'video-model',
  input: { prompt: 'ocean' }
});
const videoResult = normalizeProviderResult({
  url: 'https://example.com/generated.mp4',
  usage: { durationSeconds: 4.5, video_seconds: 4.5 }
}, videoRequest);
assert.equal(videoResult.artifacts[0].kind, 'video');
assert.equal(videoResult.usage.durationMs, 4500);
assert.equal(videoResult.usage.videoSeconds, 4.5);

for (const fixture of [
  ['audio', 'audio.tts', { audioUrl: 'https://example.com/a.mp3' }, 'audio'],
  ['research', 'research.deep', { text: 'answer', artifacts: [{ url: 'https://example.com/report.pdf' }] }, 'research_artifact'],
  ['3d', '3d.generate', { url: 'https://example.com/model.glb' }, 'model3d'],
  ['browser', 'browser.capture', { artifacts: [{ ref: 'browser:shot:1', mimeType: 'image/png' }] }, 'browser_artifact'],
  ['sandbox', 'sandbox.build', { artifacts: [{ ref: 'sandbox:artifact:1' }] }, 'sandbox_artifact']
]) {
  const [surface, capability, raw, kind] = fixture;
  const request = normalizeProviderRequest({
    requestId: `req-${surface}`,
    capability,
    surface,
    providerId: 'synthetic',
    input: {}
  });
  const result = normalizeProviderResult(raw, request);
  assert.equal(result.surface, surface);
  assert.equal(result.artifacts[0].kind, kind);
}

const usage = normalizeProviderUsage({
  input_tokens: 2,
  output_tokens: 3,
  duration_seconds: 1.25,
  audio_seconds: 1.25,
  megapixels: 2
});
assert.deepEqual(usage, {
  inputTokens: 2,
  outputTokens: 3,
  totalTokens: 5,
  costUsd: null,
  durationMs: 1250,
  requests: null,
  images: null,
  audioSeconds: 1.25,
  videoSeconds: null,
  megapixels: 2
});

const rateLike = new Error('provider rate limited');
rateLike.code = 'groq_rate_limited';
rateLike.statusCode = 429;
rateLike.retryAfterSeconds = 3;
const normalizedError = normalizeProviderError(rateLike, {
  providerId: 'groq',
  capability: 'chat'
});
assert(normalizedError instanceof ProviderAdapterError);
assert.equal(normalizedError.code, 'provider_adapter_error');
assert.equal(normalizedError.providerCode, 'groq_rate_limited');
assert.equal(normalizedError.statusCode, 429);
assert.equal(normalizedError.retryAfterSeconds, 3);
assert.equal(normalizedError.retryable, null, 'Pack025 owns final retry policy');

const abort = new AbortController();
abort.abort();
assert.throws(
  () => normalizeProviderRequest({
    requestId: 'req-cancelled',
    capability: 'chat',
    providerId: 'groq',
    input: { messages: [] },
    signal: abort.signal
  }),
  error =>
    error instanceof ProviderAdapterError &&
    error.code === 'provider_request_cancelled' &&
    error.cancelled === true
);

const textAdapter = adaptLegacyTextCall({
  providerId: 'synthetic-text',
  capabilities: ['chat'],
  call: async (model, messages, opts) => ({
    text: `${model}:${messages[0].content}`,
    usage: { input_tokens: 1, output_tokens: 1 }
  })
});
const bridgedText = await textAdapter.invoke({
  requestId: 'bridge-text',
  capability: 'chat',
  modelId: 'm1',
  input: { messages: [{ role: 'user', content: 'hi' }] }
});
assert.equal(bridgedText.output.text, 'm1:hi');
assert.equal(bridgedText.usage.totalTokens, 2);

const imageAdapter = adaptLegacyImageGenerate({
  providerId: 'synthetic-image',
  generate: async () => ({ url: 'https://example.com/i.png' })
});
const bridgedImage = await imageAdapter.invoke({
  requestId: 'bridge-image',
  capability: 'image.generate',
  input: { prompt: 'x' }
});
assert.equal(bridgedImage.output.primaryUrl, 'https://example.com/i.png');

const videoAdapter = adaptLegacyVideoGenerate({
  providerId: 'synthetic-video',
  capabilities: ['video.text_to_video'],
  generate: async () => ({ videoUrl: 'https://example.com/v.mp4' })
});
const bridgedVideo = await videoAdapter.invoke({
  requestId: 'bridge-video',
  capability: 'video.text_to_video',
  input: { prompt: 'x' }
});
assert.equal(bridgedVideo.output.primaryUrl, 'https://example.com/v.mp4');

const genericAdapter = adaptLegacyGeneric({
  providerId: 'synthetic-research',
  capabilities: ['research.deep'],
  invoke: async () => ({ text: 'research output' })
});
const bridgedGeneric = await genericAdapter.invoke({
  requestId: 'bridge-research',
  capability: 'research.deep',
  input: { query: 'x' }
});
assert.equal(bridgedGeneric.output.text, 'research output');

const genericContract = createNormalizedAdapter({
  id: 'synthetic:generic',
  providerId: 'synthetic',
  capabilities: ['sandbox.build'],
  execute: async () => ({ artifacts: [{ ref: 'sandbox:build:1' }] })
});
const genericResult = await genericContract.invoke({
  requestId: 'generic-1',
  capability: 'sandbox.build',
  input: {}
});
assert.equal(genericResult.artifacts[0].ref, 'sandbox:build:1');

const serialized = JSON.stringify({
  request: textRequest,
  result: textResult,
  config: cfg
});
assert(!serialized.includes('MUST_NOT_SURVIVE'));

const providerSource = fs.readFileSync(
  path.join(__dirname, 'src/modules/ai/providers/index.js'),
  'utf8'
);
const imageSource = fs.readFileSync(
  path.join(__dirname, 'src/modules/ai/providers/imageProviders.js'),
  'utf8'
);
const groqSource = fs.readFileSync(
  path.join(__dirname, 'src/modules/ai/providers/groqFree.js'),
  'utf8'
);
const videoSource = fs.readFileSync(
  path.join(__dirname, 'lib/videoProvider.js'),
  'utf8'
);

assert(providerSource.includes('call(model, messages, opts)'));
assert(imageSource.includes('generate(prompt, opts)'));
assert(groqSource.includes('AbortController'));
assert(groqSource.includes('retryAfterSeconds'));
assert(videoSource.includes('Replicate'));

console.log('PASS: Pack023 defines one normalized request/result/usage/error/cancel contract for text, image, video, audio, research, 3D, browser and sandbox provider surfaces');
console.log('PASS: every existing provider boundary found by the Pack023 audit is mapped to an explicit compatibility bridge');
console.log('PASS: URLs/artifacts and provider usage normalize to one canonical shape; credentials are excluded from normalized requests/metadata');
console.log('PASS: cancellation is AbortSignal-based and final retry/error taxonomy remains reserved for Pack025');
console.log('DATABASE / RAILWAY / PROVIDER ACCOUNT / PAYMENT / MODEL NETWORK CALLS: NONE');
})().catch(error => { console.error(error); process.exitCode = 1; });
