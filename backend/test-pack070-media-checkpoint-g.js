'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8').replace(/^\uFEFF/, '');
}
function json(rel) {
  return JSON.parse(read(rel));
}
function exists(rel) {
  return fs.existsSync(path.join(__dirname, rel));
}

const checkpoint = json('config/media-checkpoint-g.v1.json');
const flags = json('config/feature-flags.json');
const imageSystem = json('config/image-system.v1.json');
const videoSystem = json('config/video-system.v1.json');
const master = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'ZUVYR_MASTER_STATE.json'), 'utf8')
    .replace(/^\uFEFF/, '')
);
const frontend = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'zuvyr-suite-v1.js'),
  'utf8'
);
const usageSql = read('44_pack013_unified_usage_ledger.sql');
const assetSql = read('51_pack042_asset_storage_ownership_lineage.sql');
const universal = read('lib/universalActionsRepository.js');
const workspace = read('lib/workspaceRoutes.js');
const server = read('server.js');
const worker = read('worker.js');
const pkg = json('package.json');

assert.equal(checkpoint.version, 'pack-070.media-checkpoint-g.v1');
assert.deepEqual(
  checkpoint.dependencies,
  ['042','044','049','061','062','063','064','065','066','067','068','069']
);

const receipts = [
  ['061','../zuvyr-pack-evidence/pack-061/2026-09-17-final/receipt.json','LOCKED_VERIFIED',true],
  ['062','../zuvyr-pack-evidence/pack-062/2026-09-18-no-cost-final/receipt.json','LOCKED_ENGINEERING_VERIFIED',false],
  ['063','../zuvyr-pack-evidence/pack-063/2026-09-18-no-cost-final/receipt.json','LOCKED_ENGINEERING_VERIFIED',false],
  ['064','../zuvyr-pack-evidence/pack-064/2026-09-18-no-cost-final/receipt.json','LOCKED_ENGINEERING_VERIFIED',false],
  ['065','../zuvyr-pack-evidence/pack-065/2026-09-18-no-cost-final/receipt.json','LOCKED_ENGINEERING_VERIFIED',false],
  ['066','../zuvyr-pack-evidence/pack-066/2026-09-19-no-cost-final/receipt.json','LOCKED_ENGINEERING_VERIFIED',false],
  ['067','../zuvyr-pack-evidence/pack-067/2026-09-19-no-cost-final/receipt.json','LOCKED_ENGINEERING_VERIFIED',false],
  ['068','../zuvyr-pack-evidence/pack-068/2026-09-19-no-cost-final/receipt.json','LOCKED_ENGINEERING_VERIFIED',false],
  ['069','../zuvyr-pack-evidence/pack-069/2026-09-19-no-cost-final/receipt.json','LOCKED_ENGINEERING_VERIFIED',false]
];

for (const [pack, rel, status, canonical] of receipts) {
  assert(exists(rel), 'missing authoritative Pack' + pack + ' receipt');
  const receipt = json(rel);
  assert.equal(String(receipt.pack ?? receipt.pack_id), pack);
  assert.equal(receipt.status, status, 'receipt status mismatch for Pack' + pack);
  const receiptCanonical =
    receipt.canonicalLockedVerified ??
    receipt.canonical_locked_verified ??
    receipt.status === 'LOCKED_VERIFIED';
  assert.equal(Boolean(receiptCanonical), canonical, 'canonical gate mismatch for Pack' + pack);

  const state = master['pack' + pack];
  assert(state, 'master state missing pack' + pack);
  assert.equal(state.status, status, 'master status mismatch for Pack' + pack);
}

assert.equal(master.pack070.status, 'OPEN');
assert.equal(master.pack070.next_pack_allowed, false);
assert.equal(master.pack070.receipt_authority_order[0], 'dated_final_receipt');

// Truthful advertising: Pack061 really has authenticated live proof.
// All later provider-paid paths remain explicitly non-live while their gates are off.
assert.equal(flags.image_generation.enabled, true);
assert.equal(master.pack061.status, 'LOCKED_VERIFIED');
assert.equal(master.pack061.authenticated_live_image_generate, 'PASS');
assert(frontend.includes('Generate · Pack061 live proof'));
assert(!frontend.includes('Generate · engineering ready / paid live proof deferred'));

for (const key of [
  'image_reference','image_editing','image_variations','image_remove_background',
  'image_upscale','image_inpainting','image_expand',
  'video_generation','video_image_to_video','video_editing','video_extend',
  'video_subtitles','video_dubbing','video_enhance'
]) {
  assert.equal(flags[key].enabled, false, key + ' must not be advertised as live');
}
assert.equal(flags.video_export.enabled, true);
assert.equal(flags.video_cancel.enabled, true);

// Image operation truth must keep unknown/unproven pricing fail-closed.
assert.equal(imageSystem.operations.upscale.enabledByDefault, false);
assert.match(imageSystem.operations.upscale.status, /blocked_pack064_exact_precharge/);
assert.equal(imageSystem.pack063.paidExecutionDefault, false);
assert.equal(imageSystem.pack064.externalExecutionEnabled, false);

// Video provider paths are engineering-ready but all paid execution defaults remain false.
assert.equal(videoSystem.pack066.paidExecutionDefault, false);
assert.equal(videoSystem.pack067.paidExecutionDefault, false);
assert.equal(videoSystem.pack068.paidExecutionDefault, false);
assert.equal(videoSystem.pack069.paidExecutionDefault, false);
assert.equal(videoSystem.jobs.cancelEnabledByDefault, true);
assert.equal(videoSystem.operations.export.enabledByDefault, true);

// One usage ledger for both image and video.
assert(
  usageSql.includes("when lower(trim(a.feature)) in ('image','video') then 'generation'"),
  'image/video must converge into the canonical generation usage category'
);
for (const marker of [
  'reservation = await reserveCredits({',
  'requestId,',
  'quotedProviderCostMicroUsd',
  'imageRequest',
  'videoRequest'
]) assert(server.includes(marker), 'server unified usage marker missing: ' + marker);
for (const marker of [
  'settleCredits(requestId',
  'refundCredits(requestId',
  "recordRefund('video')",
  'recordRefund(feature)'
]) assert(worker.includes(marker), 'worker unified settlement marker missing: ' + marker);

// One canonical content/asset/lineage system.
for (const marker of [
  'create table if not exists public.zuvyr_assets',
  'create table if not exists public.zuvyr_asset_lineage',
  'link_zuvyr_asset_lineage',
  'record_zuvyr_asset_egress'
]) assert(assetSql.includes(marker), 'asset kernel marker missing: ' + marker);

for (const marker of [
  "destination:'video'",
  'canonical_content_id',
  'canonical_version_id'
]) {
  const pack049 = read('test-pack049-universal-actions-unit.js');
  assert(pack049.includes(marker), 'Pack049 image→video handoff marker missing: ' + marker);
}
assert(universal.includes("'video'"));
assert(workspace.includes("router.get('/library/items'"));
assert(workspace.includes("router.post('/library/items/:contentId/send-to'"));
assert(workspace.includes("router.post('/projects/:projectId/resources'"));

// Pack069 freezes the safe local/cancel end of the video pipeline.
for (const marker of [
  'executeLocalVideoExport({',
  'buildSubtitleArtifacts(',
  'assertVideoCommitAllowed({',
  'getDefaultVideoDerivedRepository()'
]) assert(worker.includes(marker), 'Pack069 worker marker missing: ' + marker);
assert(server.includes("app.post('/api/video-jobs/:jobId/cancel'"));
assert(server.includes('assetStorageKernel.createSignedDownload'));

// The checkpoint must continuously rerun the previously separated media regressions.
const mediaScript = String(pkg.scripts['test:media-checkpoint'] || '');
const requiredRegressionFiles = [
  'test-pack042-asset-storage-ownership-lineage.js',
  'test-pack044-library-wiring.js',
  'test-pack049-universal-actions-unit.js',
  'test-pack061-image-generate.js',
  'test-pack061-image-routes-unit.js',
  'test-pack061-final-image-experience-r6-r1-wiring.js',
  'test-pack061-fix5-image-history-wiring.js',
  'test-pack061-fix7-r5-single-download-action-wiring.js',
  'test-pack061-image-next-actions.js',
  'test-pack061-fix8-download-runtime.js',
  'test-pack061-download-owner-boundary.js',
  'test-pack062-capability-gate.js',
  'test-pack062-full-reference-variation.js',
  'test-pack062-provider-runtime.js',
  'test-pack062-reference-resolution.js',
  'test-pack063-image-edit-inpaint-outpaint.js',
  'test-pack063-image-rollback-route-unit.js',
  'test-pack064-local-repository.js',
  'test-pack064-local-utilities.js',
  'test-pack064-phase02-request-pricing.js',
  'test-pack064-phase02-worker-wiring.js',
  'test-pack064-phase03-deploy-gate.js',
  'test-pack064-provider-foundation.js',
  'test-pack065-image-studio-failure-ui.js',
  'test-pack065-image-studio-routes-unit.js',
  'test-pack065-image-studio-ui-wiring.js',
  'test-pack065-phase03-deploy-gate.js',
  'test-pack065-provider-failure-refund.js',
  'test-pack070-media-checkpoint-g.js'
];
for (const file of requiredRegressionFiles) {
  assert(mediaScript.includes(file), 'media checkpoint script missing ' + file);
}
assert(
  String(pkg.scripts['test:unit']).includes('npm run test:media-checkpoint'),
  'main backend CI must execute the Pack070 media checkpoint suite'
);

// Paid external operations stay fail-closed at checkpoint time.
for (const name of [
  'PACK063_PAID_EXECUTION_ENABLED',
  'PACK064_EXTERNAL_EXECUTION_ENABLED',
  'PACK066_PAID_EXECUTION_ENABLED',
  'PACK067_I2V_PAID_EXECUTION_ENABLED',
  'PACK067_R2V_PAID_EXECUTION_ENABLED',
  'PACK068_EDIT_PAID_EXECUTION_ENABLED',
  'PACK068_EXTEND_PAID_EXECUTION_ENABLED',
  'PACK068_OBJECT_REMOVE_PAID_EXECUTION_ENABLED',
  'PACK068_BACKGROUND_PAID_EXECUTION_ENABLED',
  'PACK068_LIPSYNC_PAID_EXECUTION_ENABLED',
  'PACK069_SUBTITLES_PAID_EXECUTION_ENABLED',
  'PACK069_DUB_PAID_EXECUTION_ENABLED',
  'PACK069_ENHANCE_PAID_EXECUTION_ENABLED'
]) {
  assert(
    server.includes(name) || worker.includes(name) || read('lib/dynamicPricing.js').includes(name),
    'expected fail-closed media gate missing from runtime contract: ' + name
  );
}

console.log('PASS: PACK070 reconciles authoritative receipts and master state across Packs061-069');
console.log('PASS: PACK070 continuously reruns Image/Video asset, Library, Send-To, history, pricing, failure and provider-gate regressions');
console.log('PASS: PACK070 preserves one usage ledger, canonical content/asset lineage and truthful media advertising');
console.log('LIVE PAID PROVIDER / PAYMENT / PRODUCTION MUTATION CALLS: NONE');
