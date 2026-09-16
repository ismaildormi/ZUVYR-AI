'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const frontend = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'index.html'),
  'utf8'
).replaceAll('\r\n', '\n');

const workspaceRepository = fs.readFileSync(
  path.join(__dirname, 'lib', 'workspaceLibraryRepository.js'),
  'utf8'
).replaceAll('\r\n', '\n');

const start = frontend.indexOf(
  'async function downloadCanonicalGeneration(contentId, assetId, button) {'
);
const end = frontend.indexOf(
  'async function sendGeneration(feature, text, msgBox)',
  start
);

assert.ok(start >= 0 && end > start, 'download helper must exist');
const flow = frontend.slice(start, end);

assert.ok(
  flow.includes(
    "'/api/workspace/library/items/' + encodeURIComponent(contentId) + '/download'"
  ),
  'canonical Library download route must be used'
);
assert.ok(
  flow.includes('body: JSON.stringify({ assetId })'),
  'canonical asset id must be sent'
);
assert.ok(
  flow.includes('download.signed_url ||\n      download.signedUrl ||'),
  'signed URL response must be accepted'
);
assert.ok(
  flow.includes('window.location.assign(signedUrl);'),
  'browser must navigate directly to the signed attachment URL'
);
assert.ok(
  !flow.includes('fetch(signedUrl'),
  'signed URL must not be fetched again cross-origin'
);
assert.ok(
  !flow.includes('URL.createObjectURL'),
  'object URL download path must be removed'
);
assert.ok(
  flow.includes("window.alert('Download failed. Please try again.');"),
  'failure feedback must remain'
);

assert.ok(
  /createSignedUrl\(a\.data\.storage_path,60,\{download:true\}\)/.test(
    workspaceRepository
  ),
  'backend signed URL must preserve attachment download semantics'
);

assert.strictEqual(
  frontend.split(
    "canonicalContentId&&canonicalAssetId\n" +
    "        ? 'artifact.download'\n" +
    "        : 'feedback.download'"
  ).length - 1,
  2,
  'both runtimes must route the visible Download action by message type'
);

assert.strictEqual(
  frontend.split("buildHistorySection('Recents',recentItems)+\n        buildHistorySection('Pinned',pinnedItems)").length - 1,
  2,
  'global History ordering must remain unchanged'
);

console.log(
  'PASS: Pack061 FIX7 R4 direct signed attachment download wiring'
);
