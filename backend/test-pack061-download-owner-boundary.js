'use strict';
const assert = require('node:assert/strict');
const { createWorkspaceLibraryStore } = require('./lib/workspaceLibraryRepository');
const rows = {
  zuvyr_content_objects: [{ id: 'content-a', owner_id: 'owner-a', kind: 'image', status: 'active' }, { id: 'content-b', owner_id: 'owner-b', kind: 'image', status: 'active' }],
  zuvyr_assets: [{ id: 'asset-a', owner_id: 'owner-a', canonical_content_id: 'content-a', status: 'active', storage_bucket: 'private', storage_path: 'owner-a/image', file_size_bytes: 100 }, { id: 'asset-b', owner_id: 'owner-b', canonical_content_id: 'content-b', status: 'active' }],
  zuvyr_content_versions: []
};
const signatures = [], egress = [];
const db = {
  from(table) {
    let result = rows[table] || [];
    const q = { select() { return q; }, eq(key, value) { result = result.filter(x => x[key] === value); return q; },
      in(key, values) { result = result.filter(x => values.includes(x[key])); return q; }, order() { return q; }, limit(n) { result = result.slice(0, n); return q; },
      async maybeSingle() { return { data: result[0] || null }; }, then(resolve, reject) { return Promise.resolve({ data: result }).then(resolve, reject); } };
    return q;
  },
  storage: { from(bucket) { return { async createSignedUrl(path, ttl, options) { signatures.push({ bucket, path, ttl, options }); return { data: { signedUrl: 'https://fixture.invalid/signed' } }; } }; } },
  async rpc(name, args) { egress.push({ name, args }); return { data: {} }; }
};
async function run() {
  const store = createWorkspaceLibraryStore(db);
  await assert.rejects(store.createDownload({ ownerId: 'owner-b', contentId: 'content-a', assetId: 'asset-a' }), /item_not_found/);
  await assert.rejects(store.createDownload({ ownerId: 'owner-a', contentId: 'content-a', assetId: 'asset-b' }), /asset_not_found/);
  assert.equal(signatures.length, 0, 'foreign content and foreign asset never receive a signed URL');
  assert.equal(egress.length, 0, 'denied requests cannot record egress or charge');
  await store.createDownload({ ownerId: 'owner-a', contentId: 'content-a', assetId: 'asset-a' });
  assert.equal(signatures.length, 1);
  assert.deepEqual(signatures[0], { bucket: 'private', path: 'owner-a/image', ttl: 60, options: { download: true } });
  assert.equal(egress.length, 1);
  assert.equal(egress[0].name, 'record_zuvyr_asset_egress');
  assert.equal(egress[0].args.p_owner_id, 'owner-a');
  console.log('PASS: actual library repository denies foreign content and foreign asset before signing; own asset uses 60-second attachment URL and egress only');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
