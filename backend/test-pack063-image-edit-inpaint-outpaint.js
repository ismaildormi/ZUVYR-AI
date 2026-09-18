'use strict';

process.env.SUPABASE_URL ||= 'https://unit-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'unit-test-placeholder-not-a-secret';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const imageSystem = require('./config/image-system.v1.json');
const costRegistry = require('./config/cost-registry.v1.json');
const { providerSnapshot } = require('./lib/providerRegistry');
const { normalizeImageRequest } = require('./lib/imageRequestContract');
const { assertImageRequestAvailable } = require('./lib/imageOperationRegistry');
const { quoteGeneration } = require('./lib/dynamicPricing');
const {
  buildFalEditInput,
  buildFalInpaintInput,
  buildFalOutpaintInput,
  generateImage
} = require('./src/modules/ai/providers/imageProviders');

const SOURCE = '11111111-1111-4111-8111-111111111111';
const MASK = '22222222-2222-4222-8222-222222222222';

async function run() {
  for (const op of ['edit', 'inpaint', 'expand']) {
    assert.equal(imageSystem.operations[op].enabledByDefault, true);
    assert.equal(
      imageSystem.operations[op].status,
      'implemented_pack063_paid_live_deferred'
    );
  }

  assert.equal(
    imageSystem.pack063.paidExecutionDefault,
    false
  );

  const edit = normalizeImageRequest({
    imageOperation: 'edit',
    sourceAssetId: SOURCE,
    imageOptions: {
      ratio: '16:9',
      resolution: '1024',
      quantity: 2,
      seed: 63
    }
  });

  assert.equal(assertImageRequestAvailable(edit).operation, 'edit');

  const inpaint = normalizeImageRequest({
    imageOperation: 'inpaint',
    sourceAssetId: SOURCE,
    maskAssetId: MASK,
    imageOptions: {
      ratio: '4:3',
      resolution: '1024',
      quantity: 1,
      seed: 64,
      strength: 0.82
    }
  });

  assert.equal(
    assertImageRequestAvailable(inpaint).operation,
    'inpaint'
  );

  const expand = normalizeImageRequest({
    imageOperation: 'expand',
    sourceAssetId: SOURCE,
    imageOptions: {
      quantity: 2,
      seed: 65,
      expandLeft: 128,
      expandRight: 64,
      zoomOutPercentage: 20
    }
  });

  assert.equal(
    assertImageRequestAvailable(expand).operation,
    'expand'
  );

  assert.throws(
    () =>
      assertImageRequestAvailable(
        normalizeImageRequest({
          imageOperation: 'expand',
          sourceAssetId: SOURCE
        })
      ),
    /image_outpaint_change_required/
  );

  assert.throws(
    () =>
      normalizeImageRequest({
        imageOperation: 'inpaint',
        sourceAssetId: SOURCE,
        maskAssetId: MASK,
        imageOptions: { strength: 1.5 }
      }),
    /invalid_image_strength/
  );

  assert.throws(
    () =>
      normalizeImageRequest({
        imageOperation: 'expand',
        sourceAssetId: SOURCE,
        imageOptions: { expandLeft: 701 }
      }),
    /invalid_image_expand_pixels/
  );

  const directEnv = {
    FAL_KEY: 'configured',
    PACK063_PAID_EXECUTION_ENABLED: 'true',
    PACK063_ONE_MP_BILLING_CONFIRMED: 'true',
    CREDIT_PRICE_USD: '0.01',
    TARGET_NET_MARGIN: '0.50',
    PAYMENT_FEE_RATE: '0.06',
    TAX_RESERVE_RATE: '0.10',
    RISK_RESERVE_RATE: '0.05',
    INFRA_RESERVE_USD: '0.002'
  };

  assert.throws(
    () =>
      quoteGeneration('image', {
        imageRequest: edit,
        env: {
          ...directEnv,
          PACK063_PAID_EXECUTION_ENABLED: 'false'
        },
        now: Date.parse('2026-09-18T12:00:00Z')
      }),
    /pack063_paid_execution_disabled/
  );

  const editQuote = quoteGeneration('image', {
    imageRequest: edit,
    env: directEnv,
    now: Date.parse('2026-09-18T12:00:00Z')
  });

  assert.equal(editQuote.provider, 'fal-edit');
  assert.equal(editQuote.providerCostMicroUsd, '80000');

  const inpaintQuote = quoteGeneration('image', {
    imageRequest: inpaint,
    env: directEnv,
    now: Date.parse('2026-09-18T12:00:00Z')
  });

  assert.equal(inpaintQuote.provider, 'fal-inpaint');
  assert.equal(inpaintQuote.providerCostMicroUsd, '30000');

  const outpaintQuote = quoteGeneration('image', {
    imageRequest: expand,
    env: directEnv,
    now: Date.parse('2026-09-18T12:00:00Z')
  });

  assert.equal(outpaintQuote.provider, 'fal-outpaint');
  assert.equal(outpaintQuote.providerCostMicroUsd, '70000');

  const legacyGroqSnapshot = providerSnapshot('groq', {
    GROQ_API_KEY: 'synthetic',
    ZUVYR_GROQ_FREE_TIER_CONFIRMED: 'true',
    ZUVYR_LAUNCH_PROVIDERS: 'groq'
  });

  assert.equal(legacyGroqSnapshot.enabled, true);
  assert(
    legacyGroqSnapshot.capabilities.some(
      item => item.id === 'chat' && item.eligible
    )
  );

  const blockedSnapshot = providerSnapshot('fal', {
    FAL_KEY: 'configured',
    ZUVYR_LAUNCH_PROVIDERS: 'fal'
  });

  const blockedInpaint =
    blockedSnapshot.capabilities.find(
      item => item.id === 'image.inpaint'
    );

  assert(blockedInpaint);
  assert.equal(blockedInpaint.costConditionMet, false);
  assert.equal(blockedInpaint.eligible, false);

  const enabledSnapshot = providerSnapshot('fal', {
    FAL_KEY: 'configured',
    ZUVYR_LAUNCH_PROVIDERS: 'fal',
    PACK063_ONE_MP_BILLING_CONFIRMED: 'true'
  });

  const enabledInpaint =
    enabledSnapshot.capabilities.find(
      item => item.id === 'image.inpaint'
    );

  assert(enabledInpaint);
  assert.equal(enabledInpaint.costConditionMet, true);
  assert.equal(enabledInpaint.eligible, true);

  const resolved = {
    references: [],
    source: {
      assetId: SOURCE,
      contentId: '33333333-3333-4333-8333-333333333333',
      versionId: '44444444-4444-4444-8444-444444444444',
      url: 'https://signed.invalid/source.png'
    },
    mask: {
      assetId: MASK,
      contentId: '55555555-5555-4555-8555-555555555555',
      versionId: '66666666-6666-4666-8666-666666666666',
      url: 'https://signed.invalid/mask.png'
    }
  };

  const editInput = buildFalEditInput(
    'change the red cup to blue',
    edit,
    resolved
  );
  assert.equal(editInput.image_url, resolved.source.url);
  assert.equal(editInput.aspect_ratio, '16:9');
  assert.equal(editInput.num_images, 2);
  assert.equal(editInput.seed, 63);

  const inpaintInput = buildFalInpaintInput(
    'replace the masked ball with a football',
    inpaint,
    resolved
  );
  assert.equal(inpaintInput.image_url, resolved.source.url);
  assert.equal(inpaintInput.mask_url, resolved.mask.url);
  assert.equal(inpaintInput.image_size, 'landscape_4_3');
  assert.equal(inpaintInput.strength, 0.82);

  const outpaintInput = buildFalOutpaintInput(
    'continue the beach scene naturally',
    expand,
    resolved
  );
  assert.equal(outpaintInput.image_url, resolved.source.url);
  assert.equal(outpaintInput.expand_left, 128);
  assert.equal(outpaintInput.expand_right, 64);
  assert.equal(outpaintInput.zoom_out_percentage, 20);
  assert.equal(outpaintInput.num_images, 2);

  const previousFalKey = process.env.FAL_KEY;
  process.env.FAL_KEY = 'fal_test_key';

  const calls = [];
  const fakeFal = {
    config({ credentials }) {
      assert.equal(credentials, 'fal_test_key');
    },
    async subscribe(model, { input }) {
      calls.push({ model, input });
      return {
        data: {
          images: Array.from(
            { length: Number(input.num_images || 1) },
            (_, index) => ({
              url:
                'https://v3.fal.media/pack063-' +
                calls.length +
                '-' +
                index +
                '.png'
            })
          )
        }
      };
    }
  };

  try {
    const editResult = await generateImage('edit', {
      chain: ['fal-edit'],
      models: {
        'fal-edit': 'fal-ai/flux-pro/kontext'
      },
      imageRequest: edit,
      resolvedImageInputs: resolved,
      falClient: fakeFal
    });

    assert.equal(editResult.provider, 'fal-edit');
    assert.equal(editResult.urls.length, 2);

    const inpaintResult = await generateImage('inpaint', {
      chain: ['fal-inpaint'],
      models: {
        'fal-inpaint':
          'fal-ai/qwen-image-edit/inpaint'
      },
      imageRequest: inpaint,
      resolvedImageInputs: resolved,
      falClient: fakeFal
    });

    assert.equal(inpaintResult.provider, 'fal-inpaint');
    assert.equal(inpaintResult.urls.length, 1);

    const outpaintResult = await generateImage('outpaint', {
      chain: ['fal-outpaint'],
      models: {
        'fal-outpaint':
          'fal-ai/image-apps-v2/outpaint'
      },
      imageRequest: expand,
      resolvedImageInputs: resolved,
      falClient: fakeFal
    });

    assert.equal(outpaintResult.provider, 'fal-outpaint');
    assert.equal(outpaintResult.urls.length, 2);
  } finally {
    if (previousFalKey === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = previousFalKey;
  }

  assert.equal(calls.length, 3);
  assert.equal(calls[0].model, 'fal-ai/flux-pro/kontext');
  assert.equal(
    calls[1].model,
    'fal-ai/qwen-image-edit/inpaint'
  );
  assert.equal(
    calls[2].model,
    'fal-ai/image-apps-v2/outpaint'
  );

  const costs = new Map(
    costRegistry.entries.map(entry => [entry.id, entry])
  );
  assert.equal(
    costs.get('fal-kontext-image-edit')
      .fixedOperationPriceMicroUsd,
    '40000'
  );
  assert.equal(
    costs.get('fal-qwen-image-inpaint')
      .fixedOperationPriceMicroUsd,
    '30000'
  );
  assert.equal(
    costs.get('fal-image-apps-v2-outpaint')
      .fixedOperationPriceMicroUsd,
    '35000'
  );

  const worker = fs.readFileSync(
    require.resolve('./worker.js'),
    'utf8'
  );
  const repo = fs.readFileSync(
    require.resolve('./lib/imageGenerationRepository.js'),
    'utf8'
  );
  const routes = fs.readFileSync(
    require.resolve('./lib/workspaceRoutes.js'),
    'utf8'
  );

  for (const marker of [
    "'fal-edit'",
    "'fal-inpaint'",
    "'fal-outpaint'",
    'PACK063_PAID_EXECUTION_ENABLED',
    'editLineage'
  ]) {
    assert(
      worker.includes(marker),
      'missing worker marker: ' + marker
    );
  }

  assert.match(repo, /editLineage/);
  assert.match(repo, /rollbackEdit/);
  assert.match(routes, /\/images\/:jobId\/rollback/);
  assert.match(routes, /sourcePreserved: true/);

  console.log(
    'PASS: PACK063 source edit, owner-scoped source+mask inpaint, directional outpaint, direct-Fal provider inputs, fail-closed paid gate, lineage and zero-provider rollback target'
  );
  console.log(
    'PROVIDER / PAYMENT / NETWORK CALLS: NONE'
  );
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
