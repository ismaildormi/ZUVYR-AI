'use strict';

const assert = require('node:assert/strict');

const {
  assertImageProviderCapabilities
} = require('./lib/imageCapabilityGate');

function expectCode(fn, code) {
  assert.throws(
    fn,
    error =>
      error &&
      error.code === code &&
      error.status === 400
  );
}

/* Baseline generate remains valid. */
{
  const result =
    assertImageProviderCapabilities(
      {
        operation: 'generate',
        referenceAssetIds: [],
        options: { quantity: 1 }
      },
      {
        operations: ['generate']
      }
    );

  assert.equal(result.operation, 'generate');
  assert.equal(result.options.quantity, 1);
}

/* Ordered references must never be reordered. */
{
  const result =
    assertImageProviderCapabilities(
      {
        operation: 'generate',
        referenceAssetIds: [
          'asset-third',
          'asset-first',
          'asset-second'
        ],
        options: { quantity: 1 }
      },
      {
        operations: ['generate'],
        referenceAssets: true
      }
    );

  assert.deepEqual(
    result.referenceAssetIds,
    [
      'asset-third',
      'asset-first',
      'asset-second'
    ]
  );
}

/* Unsupported references must fail instead of being ignored. */
expectCode(
  () =>
    assertImageProviderCapabilities(
      {
        referenceAssetIds: ['asset-a']
      },
      {
        operations: ['generate']
      }
    ),
  'unsupported_image_reference_assets_for_provider'
);

/* Source image capability is separate. */
expectCode(
  () =>
    assertImageProviderCapabilities(
      {
        sourceAssetId: 'source-a'
      },
      {
        operations: ['generate']
      }
    ),
  'unsupported_image_source_asset_for_provider'
);

/* Mask capability is separate. */
expectCode(
  () =>
    assertImageProviderCapabilities(
      {
        maskAssetId: 'mask-a'
      },
      {
        operations: ['generate']
      }
    ),
  'unsupported_image_mask_asset_for_provider'
);

/* Seed cannot silently disappear. */
expectCode(
  () =>
    assertImageProviderCapabilities(
      {
        options: {
          quantity: 1,
          seed: 42
        }
      },
      {
        operations: ['generate']
      }
    ),
  'unsupported_image_seed_for_provider'
);

/* Multiple outputs cannot silently collapse to one. */
expectCode(
  () =>
    assertImageProviderCapabilities(
      {
        options: {
          quantity: 3
        }
      },
      {
        operations: ['generate']
      }
    ),
  'unsupported_image_quantity_for_provider'
);

/* Provider max quantity is enforced. */
expectCode(
  () =>
    assertImageProviderCapabilities(
      {
        options: {
          quantity: 5
        }
      },
      {
        operations: ['generate'],
        quantity: true,
        maxQuantity: 4
      }
    ),
  'image_quantity_exceeds_provider_limit'
);

/* Variation is provider capability, not assumed globally. */
expectCode(
  () =>
    assertImageProviderCapabilities(
      {
        operation: 'variation'
      },
      {
        operations: ['generate']
      }
    ),
  'unsupported_image_operation_for_provider'
);

{
  const input = {
    operation: 'variation',
    referenceAssetIds: ['character', 'product'],
    sourceAssetId: 'source',
    options: {
      quantity: 2,
      seed: 123
    }
  };

  const before = JSON.stringify(input);

  const result =
    assertImageProviderCapabilities(
      input,
      {
        operations: ['generate', 'variation'],
        referenceAssets: true,
        sourceAsset: true,
        seed: true,
        quantity: true,
        maxQuantity: 4
      }
    );

  assert.equal(result.operation, 'variation');
  assert.equal(result.options.seed, 123);
  assert.equal(result.options.quantity, 2);

  assert.deepEqual(
    result.referenceAssetIds,
    ['character', 'product']
  );

  assert.equal(
    JSON.stringify(input),
    before,
    'capability validation must not mutate request'
  );
}

console.log(
  'PASS: Pack062 provider capability gate preserves ordered references and blocks unsupported operation/reference/source/mask/seed/quantity instead of silently ignoring them'
);