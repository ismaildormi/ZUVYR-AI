'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const imageSystem = require('./config/image-system.v1.json');
const costRegistry = require('./config/cost-registry.v1.json');
const {
  normalizeImageRequest
} = require('./lib/imageRequestContract');
const {
  assertImageRequestAvailable
} = require('./lib/imageOperationRegistry');
const {
  quoteGeneration
} = require('./lib/dynamicPricing');
const {
  buildFalKontextInput,
  generateViaHuggingFaceFalKontext
} = require('./src/modules/ai/providers/imageProviders');

async function run() {
  assert.equal(
    imageSystem.operations.reference_generate.enabledByDefault,
    true
  );
  assert.equal(
    imageSystem.operations.variations.enabledByDefault,
    true
  );
  assert.deepEqual(
    imageSystem.providers['fal-kontext'].implementedOperations,
    ['reference_generate', 'variations']
  );

  const price = costRegistry.entries.find(
    item => item.id === 'fal-kontext-reference-variation'
  );
  assert(price);
  assert.equal(price.fixedOperationPriceMicroUsd, '40000');
  assert.equal(price.verificationStatus, 'verified');

  const refs = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
  ];

  const request = normalizeImageRequest({
    imageOperation: 'reference_generate',
    referenceAssetIds: refs,
    imageOptions: {
      ratio: '16:9',
      resolution: '1024',
      quantity: 3,
      seed: 7
    }
  });

  assert.equal(
    assertImageRequestAvailable(request).operation,
    'reference_generate'
  );

  const quote = quoteGeneration('image', {
    imageRequest: request,
    env: {
      HF_TOKEN: 'configured',
      CREDIT_PRICE_USD: '0.01',
      TARGET_NET_MARGIN: '0.50',
      PAYMENT_FEE_RATE: '0.06',
      TAX_RESERVE_RATE: '0.10',
      RISK_RESERVE_RATE: '0.05',
      INFRA_RESERVE_USD: '0.002'
    },
    now: Date.parse('2026-09-17T12:00:00Z')
  });

  assert.equal(quote.provider, 'fal-kontext');
  assert.equal(quote.providerCostMicroUsd, '120000');
  assert.ok(quote.credits > 0);

  assert.throws(
    () =>
      assertImageRequestAvailable(
        normalizeImageRequest({
          imageOperation: 'reference_generate',
          referenceAssetIds: [refs[0]],
          imageOptions: { ratio: '5:2' }
        })
      ),
    /image_reference_ratio_unsupported/
  );

  assert.throws(
    () =>
      assertImageRequestAvailable(
        normalizeImageRequest({
          imageOperation: 'variations',
          sourceAssetId: refs[0],
          imageOptions: { style: 'watercolor' }
        })
      ),
    /image_reference_style_unsupported/
  );

  assert.throws(
    () =>
      assertImageRequestAvailable(
        normalizeImageRequest({
          imageOperation: 'reference_generate',
          referenceAssetIds: [
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
            '33333333-3333-4333-8333-333333333333',
            '44444444-4444-4444-8444-444444444444'
          ],
          sourceAssetId: '55555555-5555-4555-8555-555555555555'
        })
      ),
    /image_reference_input_limit_exceeded/
  );

  const built = buildFalKontextInput(
    'keep the same product, change the background',
    request,
    {
      references: [
        { assetId: refs[0], url: 'https://signed.invalid/a' },
        { assetId: refs[1], url: 'https://signed.invalid/b' }
      ],
      source: null
    }
  );

  assert.deepEqual(
    built.image_urls,
    [
      'https://signed.invalid/a',
      'https://signed.invalid/b'
    ]
  );
  assert.equal(built.aspect_ratio, '16:9');
  assert.equal(built.num_images, 3);
  assert.equal(built.seed, 7);

  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      options
    });

    const payload =
      calls.length === 1
        ? {
            request_id: 'kontext123',
            status: 'COMPLETED',
            response_url:
              'https://queue.fal.run/fal-ai/flux-pro/kontext/multi/requests/kontext123'
          }
        : {
            images: [
              { url: 'https://v3.fal.media/out-1.jpeg' },
              { url: 'https://v3.fal.media/out-2.jpeg' },
              { url: 'https://v3.fal.media/out-3.jpeg' }
            ]
          };

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      async text() {
        return JSON.stringify(payload);
      }
    };
  };

  const urls = await generateViaHuggingFaceFalKontext(
    'keep the same product, change the background',
    {
      apiKey: 'hf_test',
      imageRequest: request,
      resolvedImageInputs: {
        references: [
          { url: 'https://signed.invalid/a' },
          { url: 'https://signed.invalid/b' }
        ],
        source: null
      },
      fetchImpl: fakeFetch,
      pollIntervalMs: 1,
      pollTimeoutMs: 1000
    }
  );

  assert.deepEqual(urls, [
    'https://v3.fal.media/out-1.jpeg',
    'https://v3.fal.media/out-2.jpeg',
    'https://v3.fal.media/out-3.jpeg'
  ]);

  const submitted = JSON.parse(calls[0].options.body);
  assert.deepEqual(submitted.image_urls, built.image_urls);
  assert.equal(submitted.num_images, 3);
  assert.equal(submitted.seed, 7);
  assert.equal(submitted.aspect_ratio, '16:9');

  const server = fs.readFileSync(
    require.resolve('./server.js'),
    'utf8'
  );
  const worker = fs.readFileSync(
    require.resolve('./worker.js'),
    'utf8'
  );
  const repository = fs.readFileSync(
    require.resolve('./lib/imageGenerationRepository.js'),
    'utf8'
  );

  assert.match(
    server,
    /quoteGeneration\(\s*feature,\s*imageRequest\s*\?\s*\{\s*imageRequest\s*\}\s*:\s*\{\s*\}\s*\)/
  );
  assert.match(
    worker,
    /resolveImageReferences/
  );
  assert.match(
    worker,
    /\['fal-kontext'\]/
  );
  assert.match(
    worker,
    /persistGeneratedSet/
  );
  assert.match(
    repository,
    /outputManifest/
  );
  assert.match(
    repository,
    /image_output_manifest_incomplete/
  );

  console.log(
    'PASS: PACK062 full reference/variation contract, ordered owned references, seed/count provider input, quantity pricing and canonical multi-output persistence'
  );
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
