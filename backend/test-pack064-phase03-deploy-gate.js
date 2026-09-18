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

assert.equal(
  packageJson.dependencies.sharp,
  '0.34.4'
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

const costs =
  new Map(
    costRegistry.entries.map(
      item => [item.id, item]
    )
  );

assert.equal(
  costs.get(
    'fal-image-apps-v2-relighting'
  ).fixedOperationPriceMicroUsd,
  '40000'
);

assert.equal(
  costs.get(
    'fal-birefnet-v2-background-removal'
  ).fixedOperationPriceMicroUsd,
  '0'
);

assert.equal(
  costs.get(
    'fal-flux-vision-upscaler'
  ).enabledState,
  'blocked'
);

for (const id of [
  'local-sharp-crop',
  'local-sharp-resize',
  'local-sharp-canvas',
  'local-sharp-layers',
  'local-sharp-text',
  'local-sharp-batch'
]) {
  const entry = costs.get(id);
  assert(entry);
  assert.equal(
    entry.provider,
    'local'
  );
  assert.equal(
    entry.fixedOperationPriceMicroUsd,
    '0'
  );
}

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
    migration.includes(
      "'" + operation + "'"
    )
  );
}

console.log(
  'PASS: PACK064 Phase03 deploy gate confirms migration identity, local runtime, guarded external executors, blocked upscale, exact dependencies and pricing registry state'
);
console.log(
  'AI PROVIDER / PAYMENT / NETWORK CALLS: NONE'
);
