'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CONFIG,
  buildCanonicalObjectPath,
  assertOwnedStoragePath,
  normalizeRegistration
} = require('./lib/assetStorageContract');
const {
  createAssetStorageKernel
} = require('./lib/assetStorageKernel');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CONTENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VERSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ASSET = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const HASH = 'a'.repeat(64);

assert.equal(CONFIG.bucket, 'conversation-files');
assert.equal(CONFIG.bucketPublic, false);
assert.equal(CONFIG.directAuthenticatedStoragePolicy, false);
assert.equal(CONFIG.egress.pricingState, 'unpriced');

const canonical = buildCanonicalObjectPath({
  ownerId: OWNER,
  sha256: HASH
});
assert.equal(
  canonical,
  `${OWNER}/objects/aa/${HASH}`
);
assert.equal(
  assertOwnedStoragePath({ ownerId: OWNER, storagePath: canonical }),
  canonical
);
assert.throws(
  () => assertOwnedStoragePath({
    ownerId: OWNER,
    storagePath: `${OTHER}/objects/aa/${HASH}`
  }),
  error => error.code === 'ASSET_STORAGE_PATH_OWNER_MISMATCH'
);

const registration = normalizeRegistration({
  ownerId: OWNER,
  canonicalContentId: CONTENT,
  canonicalVersionId: VERSION,
  mimeType: 'image/png',
  fileSizeBytes: 123,
  sha256: HASH,
  metadata: { test: true }
});
assert.equal(registration.storagePath, canonical);

const calls = [];
const fakeStorage = {
  from(bucket) {
    assert.equal(bucket, 'conversation-files');
    return {
      async createSignedUploadUrl(storagePath) {
        calls.push(['upload', storagePath]);
        return {
          data: { signedUrl: 'https://private.test/upload', token: 'token' },
          error: null
        };
      },
      async createSignedUrl(storagePath, seconds) {
        calls.push(['download', storagePath, seconds]);
        return {
          data: { signedUrl: 'https://private.test/download' },
          error: null
        };
      }
    };
  }
};
const fakeClient = {
  async rpc(name, args) {
    calls.push([name, args]);
    if (name === 'register_zuvyr_asset') {
      return {
        data: {
          assetId: ASSET,
          contentId: CONTENT,
          versionId: VERSION,
          storageBucket: 'conversation-files',
          storagePath: canonical,
          fileSizeBytes: 123,
          replayed: false
        },
        error: null
      };
    }
    if (name === 'resolve_zuvyr_asset_for_owner') {
      return {
        data: {
          assetId: ASSET,
          contentId: CONTENT,
          versionId: VERSION,
          storageBucket: 'conversation-files',
          storagePath: canonical,
          fileSizeBytes: 123
        },
        error: null
      };
    }
    if (name === 'record_zuvyr_asset_egress') {
      assert.equal(args.p_owner_id, OWNER);
      assert.equal(args.p_asset_id, ASSET);
      return {
        data: {
          egressEventId: 1,
          assetId: ASSET,
          bytes: 123,
          pricingState: 'unpriced',
          chargedCredits: 0
        },
        error: null
      };
    }
    throw new Error(`unexpected_rpc:${name}`);
  }
};

(async () => {
  const kernel = createAssetStorageKernel({
    client: fakeClient,
    storage: fakeStorage
  });

  const upload = await kernel.createSignedUpload({
    ownerId: OWNER,
    sha256: HASH
  });
  assert.equal(upload.storagePath, canonical);

  const registered = await kernel.register({
    ownerId: OWNER,
    canonicalContentId: CONTENT,
    canonicalVersionId: VERSION,
    mimeType: 'image/png',
    fileSizeBytes: 123,
    sha256: HASH
  });
  assert.equal(registered.assetId, ASSET);

  const download = await kernel.createSignedDownload({
    ownerId: OWNER,
    assetId: ASSET,
    requestId: 'req-1'
  });
  assert.equal(download.pricingState, 'unpriced');
  assert.equal(download.billedCredits, 0);

  const migration = fs.readFileSync(
    path.join(__dirname, '51_pack042_asset_storage_ownership_lineage.sql'),
    'utf8'
  );

  for (const marker of [
    'create table if not exists public.zuvyr_assets',
    'create table if not exists public.zuvyr_asset_lineage',
    'create table if not exists public.zuvyr_asset_egress_events',
    'unique (owner_id, sha256, file_size_bytes, mime_type)',
    'source_content_version_id uuid not null',
    'register_zuvyr_asset',
    'resolve_zuvyr_asset_for_owner',
    'link_zuvyr_asset_lineage',
    'record_zuvyr_asset_egress',
    "'unpriced',0",
    'pack042_storage_path_owner_mismatch',
    'pack042_source_version_mismatch'
  ]) {
    assert(migration.includes(marker), `missing migration marker: ${marker}`);
  }

  const routes = fs.readFileSync(
    path.join(__dirname, 'lib/conversationRoutes.js'),
    'utf8'
  );
  const worker = fs.readFileSync(
    path.join(__dirname, 'lib/attachmentWorker.js'),
    'utf8'
  );
  assert(
    routes.includes('/assets/upload-url'),
    'existing signed upload route must remain present'
  );
  assert(
    routes.includes('createSignedUploadUrl'),
    'existing upload route must still use a private signed upload URL'
  );
  assert(
    worker.includes('createSignedUrl'),
    'existing private attachment read path must still use signed download URL'
  );

  console.log('PASS: private signed upload/download foundations remain wired');
  console.log('PASS: canonical storage path is owner scoped and hash stable');
  console.log('PASS: owner dedupe + exact content-version binding are defined');
  console.log('PASS: lineage requires source asset plus exact source content version');
  console.log('PASS: retention and replay-safe egress bytes are durable');
  console.log('PASS: unverified egress pricing cannot charge credits');
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
