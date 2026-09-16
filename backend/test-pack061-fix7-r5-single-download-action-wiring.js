"use strict";

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'index.html'),
  'utf8'
).replaceAll('\r\n', '\n');

const count = literal =>
  html.split(literal).length - 1;

assert.strictEqual(
  count(
    "makeAction(\n" +
    "        '⇩',\n" +
    "        'artifact.download'"
  ),
  0,
  'No second image-only Download action may remain.'
);

assert.strictEqual(
  count(
    "canonicalContentId&&canonicalAssetId\n" +
    "        ? 'artifact.download'\n" +
    "        : 'feedback.download'"
  ),
  2,
  'Both runtimes must expose one context-aware Download action.'
);

assert.strictEqual(
  count(
    "if(canonicalContentId&&canonicalAssetId){\n" +
    "          await downloadCanonicalGeneration(\n" +
    "            canonicalContentId,\n" +
    "            canonicalAssetId,\n" +
    "            button"
  ),
  2,
  'Media Download must use canonical signed flow in both runtimes.'
);

assert.strictEqual(
  count("link.download = 'rox-ai-response.txt';"),
  2,
  'Text download must remain available.'
);

assert.strictEqual(
  count(
    'async function downloadCanonicalGeneration(contentId, assetId, button)'
  ),
  1,
  'Canonical helper must remain shared.'
);

const start = html.indexOf(
  'async function downloadCanonicalGeneration(contentId, assetId, button) {'
);

const end = html.indexOf(
  'async function sendGeneration(feature, text, msgBox)',
  start
);

assert.ok(
  start >= 0 && end > start,
  'Canonical helper boundaries must exist.'
);

const flow = html.slice(start, end);

assert.ok(
  flow.includes('window.location.assign(signedUrl);'),
  'Signed attachment navigation must remain.'
);

assert.ok(
  !flow.includes('fetch(signedUrl'),
  'No second cross-origin signed-url fetch may return.'
);

assert.ok(
  !flow.includes('URL.createObjectURL'),
  'Canonical media flow must not use an object URL.'
);

assert.strictEqual(
  count(
    "buildHistorySection('Recents',recentItems)+\n" +
    "        buildHistorySection('Pinned',pinnedItems)"
  ),
  2,
  'Verified global History behavior must remain unchanged.'
);

console.log(
  'PASS: Pack061 FIX7 R5 single context-aware Download action'
);
