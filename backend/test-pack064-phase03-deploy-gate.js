'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const imageSystem =
  require('./config/image-system.v1.json');

const providerRegistry =
  require('./config/provider-registry.v1.json');

const costRegistry =
  require('./config/cost-registry.v1.json');

const packageJson =
  require('./package.json');

assert.equal(
  imageSystem.pack064.phase,
  'PHASE03_DEPLOY_CANDIDATE'
);

assert.equal(
  imageSystem.pack064.productionMigrationApplied,
  true
);

assert.equal(
  imageSystem.pack064.productionMigrationIdentity,
  'pack064_image_utility_operations'
);

assert.equal(
  imageSystem.pack064.externalExecutionDefault,
  false
);

assert.equal(
  imageSystem.pack064.externalExecutionEnabled,
  false
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
    imageSystem.operations[operation].enabledByDefault,
    true
  );
}

assert.equal(
  imageSystem.operations.upscale.enabledByDefault,
  false
);

assert.equal(
  imageSystem.pack064.operations.upscale.runtimeWired,
  false
);

assert.equal(
  imageSystem.pack064.operations.upscale.blocker,
  'exact_precharge_output_megapixel_quote'
);

// Keep the local image runtime on the audited libvips/libheif security baseline.
assert.equal(
  packageJson.dependencies.sharp,
  '0.35.4'
);

const fal =
  providerRegistry.providers.fal;

for (const id of [
  'image.remove_background',
  'image.relight'
]) {
  const capability =
    fal.capabilities.find(
      item => item.id === id
    );

  assert(capability);
  assert.equal(
    capability.verification,
    'verified_repository'
  );
  assert.deepEqual(
    capability.requiredCredentialEnvironment,
    ['FAL_KEY']
  );
  assert.deepEqual(
    capability.cost.requiredEnvironment,
    {
      name:
        'PACK064_EXTERNAL_EXECUTION_ENABLED',
      value: 'true'
    }
  );
}

const upscale =
  fal.capabilities.find(
    item => item.id === 'image.upscale'
  );

assert(upscale);
assert.notEqual(
  upscale.verification,
  'verified_repository'
);

console.log('PASS: PACK064 production deploy gate preserves local execution and patched Sharp baseline.');
