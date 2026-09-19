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
  providerSnapshot
} = require('./lib/providerRegistry');
const {
  buildFalKontextInput,
  generateImage
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

  const hfOnlySnapshot = providerSnapshot('fal', {
    HF_TOKEN: 'hf_only',
    ZUVYR_LAUNCH_PROVIDERS: 'fal'
  });

  const hfOnlyReference =
    hfOnlySnapshot.capabilities.find(
      item => item.id === 'image.reference_variation'
    );

  assert(hfOnlyReference);
  assert.equal(hfOnlyReference.credentialPresent, false);
  assert.equal(hfOnlyReference.eligible, false);

  const directFalSnapshot = providerSnapshot('fal', {
    FAL_KEY: 'fal_configured',
    ZUVYR_LAUNCH_PROVIDERS: 'fal'
  });

  const directFalReference =
    directFalSnapshot.capabilities.find(
      item => item.id === 'image.reference_variation'
    );

  assert(directFalReference);
  assert.equal(directFalReference.credentialPresent, true);
  assert.equal(directFalReference.capabilityVerified, true);
  assert.equal(directFalReference.costSourceVerified, true);
  assert.equal(directFalReference.eligible, true);

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
      FAL_KEY: 'configured',
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

  assert.throws(
    () =>
      quoteGeneration('image', {
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
        now: Date.parse('2026-09-18T00:00:00Z')
      }),
    /no_configured_reference_image_provider/
  );

  const calls = [];
  const fakeFal = {
    configuredWith: null,
    config({ credentials }) {
      this.configuredWith = credentials;
    },
    async subscribe(model, options) {
      calls.push({ model, options });
      return {
        data: {
          images: [
            { url: 'https://v3.fal.media/out-1.jpeg' },
            { url: 'https://v3.fal.media/out-2.jpeg' },
            { url: 'https://v3.fal.media/out-3.jpeg' }
          ]
        }
      };
    }
  };

  const previousFalKey = process.env.FAL_KEY;
  const previousHfToken = process.env.HF_TOKEN;
  process.env.FAL_KEY = 'fal_test_key';
  process.env.HF_TOKEN = 'hf_present_but_not_used';

  try {
    const result = await generateImage(
      'keep the same product, change the background',
      {
        imageRequest: request,
        chain: ['fal-kontext'],
        models: {
          'fal-kontext': 'fal-ai/flux-pro/kontext/multi'
        },
        resolvedImageInputs: {
          references: [
            { url: 'https://signed.invalid/a' },
            { url: 'https://signed.invalid/b' }
          ],
          source: null
        },
        falClient: fakeFal,
        fetchImpl: async () => {
          throw new Error('HF_ROUTE_MUST_NOT_BE_USED');
        }
      }
    );

    assert.equal(fakeFal.configuredWith, 'fal_test_key');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, 'fal-ai/flux-pro/kontext/multi');
    assert.deepEqual(calls[0].options.input.image_urls, built.image_urls);
    assert.equal(calls[0].options.input.num_images, 3);
    assert.equal(calls[0].options.input.seed, 7);
    assert.equal(calls[0].options.input.aspect_ratio, '16:9');
    assert.equal(result.provider, 'fal-kontext');
    assert.deepEqual(result.urls, [
      'https://v3.fal.media/out-1.jpeg',
      'https://v3.fal.media/out-2.jpeg',
      'https://v3.fal.media/out-3.jpeg'
    ]);
  } finally {
    if (previousFalKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = previousFalKey;
    if (previousHfToken === undefined) delete process.env.HF_TOKEN;
    else process.env.HF_TOKEN = previousHfToken;
  }

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
    /quoteGeneration\(\s*feature,[\s\S]*?imageRequest\s*\?\s*\{\s*imageRequest\s*\}[\s\S]*?videoRequest\s*\?\s*\{\s*videoRequest,\s*videoPricingContext\s*\}[\s\S]*?:\s*\{\s*\}[\s\S]*?\)/
  );
  assert.match(
    worker,
    /resolveImageReferences/
  );
  assert.match(
    worker,
    /reference_generate:\s*'fal-kontext'/
  );
  assert.match(
    worker,
    /variations:\s*'fal-kontext'/
  );
  assert.match(
    worker,
    /chain:\s*selectedExecutor\s*\?\s*\[selectedExecutor\]\s*:\s*standardImageProviderOptions\.chain/
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

  const providers = fs.readFileSync(
    require.resolve('./src/modules/ai/providers/imageProviders.js'),
    'utf8'
  );
  assert.doesNotMatch(
    providers,
    /generateViaHuggingFaceFalKontext/
  );

  console.log(
    'PASS: PACK062 direct Fal Kontext route, ordered owned references, seed/count provider input, quantity pricing and canonical multi-output persistence'
  );
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
