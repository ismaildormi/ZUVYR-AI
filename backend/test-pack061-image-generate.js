'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveCostQuote } = require('./lib/costRegistry');
const { normalizeImageRequest } = require('./lib/imageRequestContract');
const { assertImageRequestAvailable } = require('./lib/imageOperationRegistry');
const { fetchImageBytes, MAX_CANONICAL_IMAGE_BYTES } = require('./lib/imageGenerationRepository');

async function run() {
  const imageSystem = require('./config/image-system.v1.json');
  assert.equal(imageSystem.version, 'pack-061.image-generate.v1');
  assert.equal(imageSystem.launchProvider.provider, 'fal');
  assert.equal(imageSystem.launchProvider.model, 'fal-ai/flux/schnell');
  assert.equal(imageSystem.launchProvider.pricing.fixedEffectiveCostMicroUsd, '3000');
  assert.equal(imageSystem.launchProvider.pricing.commercialUseVerified, true);
  assert.equal(imageSystem.launchProvider.externalGate, 'M12');
  assert.equal(imageSystem.operations.generate.status, 'implemented_m12_live_e2e_pending');
  assert.equal(imageSystem.providers.replicate.status, 'verified_launch_provider');
  assert.equal(imageSystem.providers.fal.status, 'verified_launch_provider_fix2');
  assert.equal(imageSystem.providers.fal.pricing.pack061EffectiveCostMicroUsd, '3000');

  const cost = resolveCostQuote({
    provider: 'replicate',
    modelToolId: 'black-forest-labs/flux-schnell',
    capability: 'image',
    operationType: 'image_generation'
  }, {}, {
    now: Date.parse('2026-09-15T12:00:00Z'),
    env: { REPLICATE_API_TOKEN: 'configured' }
  });
  assert.equal(cost.providerCostMicroUsd, '3000');
  assert.equal(cost.verificationStatus, 'verified');
  assert.equal(cost.unitType, 'images');
  assert.match(String(cost.source), /replicate\.com\/black-forest-labs\/flux-schnell/);

  const falCost = resolveCostQuote({
    provider: 'fal',
    modelToolId: 'fal-ai/flux/schnell',
    capability: 'image',
    operationType: 'image_generation'
  }, {}, {
    now: Date.parse('2026-09-15T12:00:00Z'),
    env: { FAL_KEY: 'configured' }
  });
  assert.equal(falCost.providerCostMicroUsd, '3000');
  assert.equal(falCost.verificationStatus, 'verified');
  assert.match(String(falCost.source), /fal\.ai\/models\/fal-ai\/flux\/schnell/);

  const {
    providerFailureEvidence,
    providerAttemptRetryable,
    sanitizeProviderMessage
  } = require('./src/modules/ai/providers/imageProviders');

  const providerEvidence = providerFailureEvidence({
    message: 'Provider request failed.',
    code: 'provider_adapter_error',
    providerCode: 'ApiError',
    statusCode: 402,
    retryable: false,
    cause: new Error('Request failed 402 Payment Required for token r8_SUPERSECRET')
  });
  assert.equal(providerEvidence.code, 'provider_adapter_error');
  assert.equal(providerEvidence.providerCode, 'ApiError');
  assert.equal(providerEvidence.statusCode, 402);
  assert.equal(providerEvidence.retryable, false);
  assert.match(providerEvidence.providerMessage, /402 Payment Required/);
  assert.doesNotMatch(providerEvidence.providerMessage, /r8_SUPERSECRET/);
  assert.match(sanitizeProviderMessage('Bearer abc.def.ghi'), /Bearer \[REDACTED\]/);
  assert.equal(providerAttemptRetryable({ status: 'error', statusCode: 402 }), false);
  assert.equal(providerAttemptRetryable({ status: 'error', statusCode: 429 }), true);
  assert.equal(providerAttemptRetryable({ status: 'error', statusCode: 503 }), true);

  const basic = normalizeImageRequest({ imageOperation: 'generate' });
  assert.equal(assertImageRequestAvailable(basic).operation, 'generate');
  assert.throws(
    () => assertImageRequestAvailable(normalizeImageRequest({ imageOperation: 'generate', imageOptions: { ratio: '16:9' } })),
    /image_generation_configuration_unavailable/
  );

  const fakeFetch = async () => ({
    ok: true,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === 'content-type') return 'image/webp';
        if (String(name).toLowerCase() === 'content-length') return '8';
        return null;
      }
    },
    async arrayBuffer() { return Uint8Array.from([82,73,70,70,1,2,3,4]).buffer; }
  });
  const fetched = await fetchImageBytes('https://replicate.delivery/example.webp', { fetchImpl: fakeFetch });
  assert.equal(fetched.mimeType, 'image/webp');
  assert.equal(fetched.buffer.length, 8);
  assert.ok(MAX_CANONICAL_IMAGE_BYTES >= 8);

  await assert.rejects(
    fetchImageBytes('http://replicate.delivery/example.webp', { fetchImpl: fakeFetch }),
    /invalid_image_result_protocol/
  );

  const read = rel => fs.readFileSync(path.join(__dirname, rel), 'utf8');
  const adapter = read('lib/replicateImageAdapter.js');
  const providers = read('src/modules/ai/providers/imageProviders.js');
  const worker = read('worker.js');
  const repo = read('lib/imageGenerationRepository.js');
  const memory = read('lib/conversationGeneration.js');
  const server = read('server.js');
  const frontend = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'index.html'), 'utf8');

  assert.match(adapter, /createNormalizedAdapter/);
  assert.match(adapter, /image\.generate/);
  assert.match(adapter, /black-forest-labs\/flux-schnell/);
  assert.match(providers, /chain \|\| \[DEFAULT_IMAGE_PROVIDER\]/);
  assert.match(providers, /return normalizeOutput\(output\[0\]/);
  assert.match(providers, /providerFailureEvidence\(error\)/);
  assert.match(providers, /statusCode/);
  assert.match(providers, /providerMessage/);
  assert.match(providers, /DEFAULT_FAL_IMAGE_MODEL/);
  assert.match(providers, /image_size: 'landscape_4_3'/);
  assert.match(worker, /chain: \['fal', 'replicate'\]/);
  assert.match(worker, /DEFAULT_FAL_IMAGE_MODEL/);
  assert.match(worker, /UnrecoverableError/);
  assert.match(worker, /getExisting\(\{ ownerId: userId, jobId: jobRowId \}\)/);
  assert.match(worker, /persistGenerated\(/);
  assert.match(worker, /await settleCredits\(requestId, finalCredits\)/);
  assert.match(worker, /canonicalContentId: persisted\.contentId/);
  assert.match(worker, /canonicalAssetId: persisted\.assetId/);
  assert.match(repo, /kind: 'image'/);
  assert.match(repo, /sourceSystem: IMAGE_SOURCE_SYSTEM/);
  assert.match(repo, /register\(\{/);
  assert.match(repo, /canonical_content_id: record\.contentId/);
  assert.match(memory, /canonical_content_id: canonicalContentId/);
  assert.match(server, /canonical_asset_id/);
  assert.match(frontend, /downloadCanonicalGeneration/);
  assert.match(frontend, /data\.canonical_content_id/);
  assert.match(frontend, /data\.canonical_asset_id/);

  const flags = require('./config/feature-flags.json');
  assert.equal(flags.image_generation.enabled, true);
  assert.equal(flags.image_generation.status, 'implemented_m12_live_e2e_pending');
  assert.equal(flags.image_history.status, 'implemented_m12_live_e2e_pending');
  const workspace = require('./config/workspace-system.v1.json');
  assert.ok(Number(workspace.pack) >= 61);
  assert.equal(workspace.foundations.imageGenerate, true);
  const product = require('./config/unified-product.v1.json');
  assert.equal(product.sections.find(item => item.id === 'images').status, 'implemented_m12_live_e2e_pending');

  console.log('PASS: Pack061 FIX2 verifies fal FLUX Schnell launch pricing/model, keeps Replicate fallback diagnostics, stores owned canonical images, settles exact reserved credits, exposes durable history/download identity, and blocks Pack062 options');
  console.log('PROVIDER / NETWORK CALLS: NONE (unit/static verification only; M12 live E2E remains external gate)');
}

run().catch(error => { console.error(error); process.exit(1); });
