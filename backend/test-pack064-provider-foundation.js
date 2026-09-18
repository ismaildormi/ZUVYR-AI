'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const imageSystem =
  require('./config/image-system.v1.json');

const costRegistry =
  require('./config/cost-registry.v1.json');

const {
  getImageProvider,
  buildFalBackgroundRemovalInput,
  buildFalUpscaleInput,
  buildFalRelightInput
} = require('./src/modules/ai/providers/imageProviders');

async function run() {
  for (const operation of [
    'remove_background',
    'relight',
    'crop',
    'resize',
    'canvas',
    'layers',
    'text',
    'batch'
  ]) {
    assert(imageSystem.operations[operation]);
    assert.equal(
      imageSystem.operations[operation].enabledByDefault,
      true
    );
  }

  assert(imageSystem.operations.upscale);
  assert.equal(
    imageSystem.operations.upscale.enabledByDefault,
    false
  );
  assert.equal(
    imageSystem.operations.upscale.status,
    'blocked_pack064_exact_precharge_output_megapixel_pricing'
  );

  assert.equal(
    imageSystem.pack064.phase,
    'PHASE03_DEPLOY_CANDIDATE'
  );
  assert.equal(
    imageSystem.pack064.externalExecutionDefault,
    false
  );
  assert.equal(
    imageSystem.pack064.externalExecutionEnvironment,
    'PACK064_EXTERNAL_EXECUTION_ENABLED'
  );
  assert.equal(
    imageSystem.pack064.localExecutionWired,
    true
  );
  assert.equal(
    imageSystem.pack064.productionMigrationApplied,
    true
  );
  assert.equal(
    imageSystem.pack064.productionMigrationIdentity,
    'pack064_image_utility_operations'
  );

  for (const operation of [
    'remove_background',
    'relight',
    'crop',
    'resize',
    'canvas',
    'layers',
    'text',
    'batch'
  ]) {
    assert.equal(
      imageSystem.pack064.operations[operation].runtimeWired,
      true
    );
  }

  assert.equal(
    imageSystem.pack064.operations.upscale.runtimeWired,
    false
  );
  assert.equal(
    imageSystem.pack064.operations.upscale.blocker,
    'exact_precharge_output_megapixel_quote'
  );

  const resolved = {
    source: {
      url: 'https://signed.invalid/source.png'
    }
  };

  const bgInput =
    buildFalBackgroundRemovalInput(
      { options: {} },
      resolved
    );

  assert.equal(
    bgInput.image_url,
    resolved.source.url
  );
  assert.equal(
    bgInput.operating_resolution,
    '1024x1024'
  );
  assert.equal(bgInput.output_format, 'png');

  const upscaleInput =
    buildFalUpscaleInput(
      {
        options: {
          upscaleFactor: 2,
          upscaleCreativity: 0.2,
          seed: 64
        }
      },
      resolved
    );

  assert.equal(upscaleInput.upscale_factor, 2);
  assert.equal(upscaleInput.creativity, 0.2);
  assert.equal(upscaleInput.seed, 64);

  const relightInput =
    buildFalRelightInput(
      {
        options: {
          lightingStyle: 'golden_hour',
          ratio: '16:9'
        }
      },
      resolved
    );

  assert.equal(
    relightInput.lighting_style,
    'golden_hour'
  );
  assert.deepEqual(
    relightInput.aspect_ratio,
    { ratio: '16:9' }
  );

  const calls = [];
  const fakeFal = {
    configuredWith: null,
    config({ credentials }) {
      this.configuredWith = credentials;
    },
    async subscribe(model, { input }) {
      calls.push({ model, input });

      if (model === 'fal-ai/birefnet/v2') {
        return {
          data: {
            image: {
              url: 'https://v3.fal.media/bg.png'
            }
          }
        };
      }

      if (model === 'fal-ai/flux-vision-upscaler') {
        return {
          data: {
            image: {
              url: 'https://v3.fal.media/upscale.png'
            }
          }
        };
      }

      if (model === 'fal-ai/image-apps-v2/relighting') {
        return {
          data: {
            images: [
              {
                url: 'https://v3.fal.media/relight.png'
              }
            ]
          }
        };
      }

      throw new Error('unexpected_model');
    }
  };

  const background =
    getImageProvider('fal-background');
  const upscale =
    getImageProvider('fal-upscale');
  const relight =
    getImageProvider('fal-relight');

  assert(background);
  assert(upscale);
  assert(relight);

  const bgUrls = await background.generate('', {
    model: 'fal-ai/birefnet/v2',
    apiKey: 'fal_test_key',
    falClient: fakeFal,
    imageRequest: { options: {} },
    resolvedImageInputs: resolved
  });

  const upscaleUrls = await upscale.generate('', {
    model: 'fal-ai/flux-vision-upscaler',
    apiKey: 'fal_test_key',
    falClient: fakeFal,
    imageRequest: {
      options: {
        upscaleFactor: 2,
        upscaleCreativity: 0.2,
        seed: 64
      }
    },
    resolvedImageInputs: resolved
  });

  const relightUrls = await relight.generate('', {
    model: 'fal-ai/image-apps-v2/relighting',
    apiKey: 'fal_test_key',
    falClient: fakeFal,
    imageRequest: {
      options: {
        lightingStyle: 'studio',
        ratio: '1:1'
      }
    },
    resolvedImageInputs: resolved
  });

  assert.deepEqual(
    bgUrls,
    ['https://v3.fal.media/bg.png']
  );
  assert.deepEqual(
    upscaleUrls,
    ['https://v3.fal.media/upscale.png']
  );
  assert.deepEqual(
    relightUrls,
    ['https://v3.fal.media/relight.png']
  );

  assert.equal(calls.length, 3);

  const entries = new Map(
    costRegistry.entries.map(entry => [
      entry.id,
      entry
    ])
  );

  assert.equal(
    entries.get(
      'fal-birefnet-v2-background-removal'
    ).fixedOperationPriceMicroUsd,
    '0'
  );

  assert.equal(
    entries.get(
      'fal-image-apps-v2-relighting'
    ).fixedOperationPriceMicroUsd,
    '40000'
  );

  assert.equal(
    entries.get(
      'fal-flux-vision-upscaler'
    ).enabledState,
    'blocked'
  );

  const migration = fs.readFileSync(
    require.resolve(
      './32_pack064_image_utility_operations.sql'
    ),
    'utf8'
  );

  for (const operation of [
    'relight',
    'crop',
    'resize',
    'canvas',
    'layers',
    'text',
    'batch'
  ]) {
    assert(
      migration.includes("'" + operation + "'"),
      'migration missing operation: ' +
        operation
    );
  }

  console.log(
    'PASS: PACK064 provider foundation matches Phase03 deploy-candidate state: migration is applied, local tools plus guarded background/relight are wired, upscale remains blocked, and provider adapters/cost evidence stay repository-grounded'
  );
  console.log(
    'PROVIDER / PAYMENT / NETWORK CALLS: NONE'
  );
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
