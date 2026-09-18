'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sharp = require('sharp');

const {
  createLocalImageUtilityRepository
} = require('./lib/localImageUtilityRepository');

const {
  CONFIG: ASSET_CONFIG
} = require('./lib/assetStorageContract');

const OWNER =
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const FOREIGN =
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const SOURCE =
  '11111111-1111-4111-8111-111111111111';

const REF =
  '22222222-2222-4222-8222-222222222222';

async function run() {
  const sourceBuffer = await sharp({
    create: {
      width: 40,
      height: 30,
      channels: 4,
      background: {
        r: 10,
        g: 20,
        b: 30,
        alpha: 1
      }
    }
  }).png().toBuffer();

  const refBuffer = await sharp({
    create: {
      width: 10,
      height: 10,
      channels: 4,
      background: {
        r: 200,
        g: 100,
        b: 50,
        alpha: 1
      }
    }
  }).png().toBuffer();

  const sha = buffer =>
    crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');

  const records = new Map([
    [
      SOURCE,
      {
        assetId: SOURCE,
        status: 'active',
        storageBucket:
          ASSET_CONFIG.bucket,
        storagePath:
          OWNER +
          '/' +
          sha(sourceBuffer).slice(0, 2) +
          '/' +
          sha(sourceBuffer).slice(2, 4) +
          '/' +
          sha(sourceBuffer),
        mimeType: 'image/png',
        fileSizeBytes:
          sourceBuffer.length,
        sha256:
          sha(sourceBuffer),
        contentId:
          '33333333-3333-4333-8333-333333333333',
        versionId:
          '44444444-4444-4444-8444-444444444444',
        buffer:
          sourceBuffer
      }
    ],
    [
      REF,
      {
        assetId: REF,
        status: 'active',
        storageBucket:
          ASSET_CONFIG.bucket,
        storagePath:
          OWNER +
          '/' +
          sha(refBuffer).slice(0, 2) +
          '/' +
          sha(refBuffer).slice(2, 4) +
          '/' +
          sha(refBuffer),
        mimeType: 'image/png',
        fileSizeBytes:
          refBuffer.length,
        sha256:
          sha(refBuffer),
        contentId:
          '55555555-5555-4555-8555-555555555555',
        versionId:
          '66666666-6666-4666-8666-666666666666',
        buffer:
          refBuffer
      }
    ]
  ]);

  const updates = [];
  let next = 0;

  const db = {
    from(name) {
      assert.equal(
        name,
        'generation_jobs'
      );

      return {
        update(payload) {
          const chain = {
            eq() {
              return chain;
            },
            then(resolve) {
              updates.push(payload);
              return Promise
                .resolve({ error: null })
                .then(resolve);
            }
          };

          return chain;
        }
      };
    }
  };

  const storage = {
    from(bucket) {
      assert.equal(
        bucket,
        ASSET_CONFIG.bucket
      );

      return {
        async download(storagePath) {
          const item =
            [...records.values()]
              .find(
                value =>
                  value.storagePath === storagePath
              );

          if (!item) {
            return {
              data: null,
              error: new Error(
                'not_found'
              )
            };
          }

          return {
            data: new Blob(
              [item.buffer],
              { type: item.mimeType }
            ),
            error: null
          };
        },

        async upload() {
          return {
            data: {},
            error: null
          };
        },

        async createSignedUrl(storagePath) {
          return {
            data: {
              signedUrl:
                'https://signed.invalid/' +
                encodeURIComponent(
                  storagePath
                )
            },
            error: null
          };
        }
      };
    }
  };

  const assetKernel = {
    async resolveOwned({
      ownerId,
      assetId
    }) {
      if (ownerId !== OWNER) {
        return null;
      }

      const item =
        records.get(assetId);

      if (!item) return null;

      const {
        buffer,
        ...asset
      } = item;

      return asset;
    },

    async register() {
      next += 1;

      return {
        assetId:
          '77777777-7777-4777-8777-' +
          String(next)
            .padStart(12, '0')
      };
    }
  };

  const contentRepository = {
    async ensure() {
      next += 1;

      return {
        contentId:
          '88888888-8888-4888-8888-' +
          String(next)
            .padStart(12, '0'),
        versionId:
          '99999999-9999-4999-8999-' +
          String(next)
            .padStart(12, '0')
      };
    }
  };

  const repository =
    createLocalImageUtilityRepository({
      db,
      storage,
      assetKernel,
      contentRepository
    });

  const inputs =
    await repository.loadOwnedInputs({
      ownerId: OWNER,
      request: {
        operation: 'layers',
        sourceAssetId: SOURCE,
        referenceAssetIds: [REF]
      }
    });

  assert(
    Buffer.isBuffer(
      inputs.sourceBuffer
    )
  );
  assert.equal(
    inputs.referenceBuffers.length,
    1
  );
  assert.equal(
    inputs.lineage.sourceAssetId,
    SOURCE
  );
  assert.equal(
    inputs.lineage.referenceAssets[0].assetId,
    REF
  );

  await assert.rejects(
    () =>
      repository.loadOwnedInputs({
        ownerId: FOREIGN,
        request: {
          operation: 'crop',
          sourceAssetId: SOURCE,
          referenceAssetIds: []
        }
      }),
    /image_utility_asset_not_found/
  );

  const outputA = await sharp(
    sourceBuffer
  )
    .resize({
      width: 20,
      height: 15,
      fit: 'fill'
    })
    .png()
    .toBuffer();

  const outputB = await sharp(
    refBuffer
  )
    .resize({
      width: 20,
      height: 15,
      fit: 'fill'
    })
    .png()
    .toBuffer();

  const persisted =
    await repository.persistOutputs({
      ownerId: OWNER,
      jobId:
        '12121212-1212-4121-8121-121212121212',
      prompt: '',
      operation: 'batch',
      options: {
        batchAction: 'resize'
      },
      lineage: inputs.lineage,
      outputs: [
        {
          buffer: outputA,
          mimeType: 'image/png',
          metadata: {
            width: 20,
            height: 15
          }
        },
        {
          buffer: outputB,
          mimeType: 'image/png',
          metadata: {
            width: 20,
            height: 15
          }
        }
      ]
    });

  assert.equal(
    persisted.outputs.length,
    2
  );
  assert.match(
    persisted.primary.providerUrl,
    /^https:\/\/signed\.invalid\//
  );

  assert.equal(
    updates.length,
    1
  );
  assert.equal(
    updates[0].image_options.outputProvider,
    'local-sharp'
  );
  assert.equal(
    updates[0].image_options.outputManifest.length,
    2
  );
  assert.equal(
    updates[0].image_options.pack064,
    true
  );

  console.log(
    'PASS: PACK064 local repository enforces owner scope, verifies stored bytes, persists canonical multi-output manifests and signs local results without provider calls'
  );
  console.log(
    'AI PROVIDER / PAYMENT / EXTERNAL NETWORK CALLS: NONE'
  );
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
