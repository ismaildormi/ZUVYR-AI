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
  assert.equal(imageSystem.launchProvider.provider, 'replicate');
  assert.equal(imageSystem.launchProvider.model, 'black-forest-labs/flux-schnell');
  assert.equal(imageSystem.launchProvider.pricing.fixedOperationPriceMicroUsd, '3000');
  assert.equal(imageSystem.launchProvider.pricing.commercialUseVerified, true);
  assert.equal(imageSystem.launchProvider.externalGate, 'M12');
  assert.equal(imageSystem.operations.generate.status, 'implemented_m12_live_e2e_pending');
  assert.equal(imageSystem.providers.replicate.status, 'verified_launch_provider');

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

  console.log('PASS: Pack061 pins verified Replicate FLUX Schnell pricing/model, normalizes provider output, stores owned canonical images, settles exact reserved credits, exposes durable history/download identity, and blocks Pack062 options');
  console.log('PROVIDER / NETWORK CALLS: NONE (unit/static verification only; M12 live E2E remains external gate)');
}

run().catch(error => { console.error(error); process.exit(1); });
