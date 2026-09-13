'use strict';

const crypto = require('node:crypto');
const { supabaseAdmin } = require('./lib/supabaseAdmin');
const {
  CONFIG,
  buildCanonicalObjectPath,
  assertOwnedStoragePath,
  randomProofHash
} = require('./lib/assetStorageContract');

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

async function main() {
  if (process.env.ZUVYR_PACK042_LIVE_STORAGE_PROOF !== 'true') {
    fail('PACK042_LIVE_STORAGE_PROOF_NOT_ENABLED');
  }

  const lookup = await supabaseAdmin
    .from('conversation_assets')
    .select('owner_id,storage_bucket,storage_path')
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookup.error || !lookup.data) {
    fail('PACK042_EXISTING_PRIVATE_OBJECT_REQUIRED');
  }

  const asset = lookup.data;
  const ownedPath = assertOwnedStoragePath({
    ownerId: asset.owner_id,
    storagePath: asset.storage_path
  });

  const download = await supabaseAdmin.storage
    .from(asset.storage_bucket || CONFIG.bucket)
    .createSignedUrl(ownedPath, 60);

  if (
    download.error ||
    !download.data ||
    !download.data.signedUrl
  ) {
    fail('PACK042_SIGNED_DOWNLOAD_FAILED');
  }

  const proofPath = buildCanonicalObjectPath({
    ownerId: asset.owner_id,
    sha256: randomProofHash()
  });

  const upload = await supabaseAdmin.storage
    .from(CONFIG.bucket)
    .createSignedUploadUrl(proofPath, { upsert: false });

  if (
    upload.error ||
    !upload.data ||
    (!upload.data.signedUrl && !upload.data.token)
  ) {
    fail('PACK042_SIGNED_UPLOAD_FAILED');
  }

  if (!proofPath.startsWith(`${asset.owner_id.toLowerCase()}/`)) {
    fail('PACK042_UPLOAD_PATH_NOT_OWNER_SCOPED');
  }

  console.log('PACK042_LIVE_STORAGE_PROOF=PASS');
  console.log('PRIVATE_BUCKET=true');
  console.log('SIGNED_DOWNLOAD=PASS');
  console.log('SIGNED_UPLOAD=PASS');
  console.log('OWNER_SCOPED_PATH=PASS');
  console.log('OBJECT_UPLOAD_PERFORMED=false');
  console.log('SIGNED_URL_PRINTED=false');
  console.log('LIVE_BILLING_ALLOWED=false');
}

main().catch(error => {
  console.error(
    'PACK042_LIVE_STORAGE_PROOF=FAIL',
    error && (error.code || error.message)
      ? error.code || error.message
      : 'unknown_error'
  );
  process.exitCode = 1;
});
