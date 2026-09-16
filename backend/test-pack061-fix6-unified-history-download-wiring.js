'use strict';

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
  count("'/api/conversations?limit=100&archived='+"),
  2,
  'Existing global History request must remain intact.'
);

assert.strictEqual(
  count(
    "const historyQuerySuffix=\n" +
    "      query.includes('&archived=')"
  ),
  2,
  'Both frontend copies must reuse archive/search/cache state.'
);

assert.strictEqual(
  count(
    'const featureQueries=Array.from(\n' +
    '      ROX_CONVERSATION_FEATURES'
  ),
  2,
  'Both copies must supplement History from every registered conversation tool.'
);

assert.strictEqual(
  count("'/api/conversations?feature='+"),
  2,
  'Both copies must construct per-tool History requests.'
);

assert.strictEqual(
  count('const historyById=new Map('),
  2,
  'Both copies must deduplicate global and per-tool History rows.'
);

assert.strictEqual(
  count('items=Array.from(historyById.values())'),
  2,
  'Both copies must render one merged History.'
);

assert.strictEqual(
  count("{method:'GET',cache:'no-store'}"),
  4,
  'Per-tool History and image restore must bypass stale caches.'
);

assert.strictEqual(
  count(
    'async function downloadCanonicalGeneration(contentId, assetId, button)'
  ),
  1,
  'Canonical download helper must remain shared.'
);

const downloadStart = html.indexOf(
  'async function downloadCanonicalGeneration(contentId, assetId, button)'
);
const downloadEnd = html.indexOf(
  'async function sendGeneration(feature, text, msgBox)',
  downloadStart
);

assert.ok(
  downloadStart >= 0 && downloadEnd > downloadStart,
  'Canonical download helper boundaries must exist.'
);

const downloadFlow = html.slice(
  downloadStart,
  downloadEnd
);

[
  "download.signed_url ||\n      download.signedUrl ||",
  'window.location.assign(signedUrl);',
  "window.alert('Download failed. Please try again.');"
].forEach(literal => {
  assert.ok(
    downloadFlow.includes(literal),
    `Download flow must contain ${literal}`
  );
});

assert.ok(
  !downloadFlow.includes('fetch(signedUrl'),
  'Signed download must not perform a second cross-origin fetch.'
);

assert.ok(
  !downloadFlow.includes('URL.createObjectURL'),
  'Signed download must use the backend attachment URL directly.'
);

assert.strictEqual(
  count('/* ZUVYR PACK061 FIX5 IMAGE HISTORY RELOAD */'),
  2,
  'FIX5 image reload wiring must remain intact.'
);

console.log(
  'PASS: Pack061 FIX6 unified History + canonical download wiring'
);
