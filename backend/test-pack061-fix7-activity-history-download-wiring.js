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
  count(
    "buildHistorySection('Recents',recentItems)+\n" +
    "        buildHistorySection('Pinned',pinnedItems)"
  ),
  2
);

assert.strictEqual(
  count("feature==='images'?'Images':"),
  2
);

assert.strictEqual(
  count("escapeHtml(featureLabel+' · '+date+pin)"),
  2
);

assert.strictEqual(
  count(
    "wrap.dataset.zuvyrCanonicalContentId=\n" +
    "    canonicalContentId;"
  ),
  2
);

assert.strictEqual(
  count(
    "wrap.dataset.zuvyrCanonicalAssetId=\n" +
    "    canonicalAssetId;"
  ),
  2
);

assert.strictEqual(
  count("meta.canonicalContentId||''"),
  2
);

assert.strictEqual(
  count("meta.canonicalAssetId||''"),
  2
);

assert.strictEqual(
  count(
    "canonicalContentId&&canonicalAssetId\n" +
    "        ? 'artifact.download'\n" +
    "        : 'feedback.download'"
  ),
  2
);

assert.strictEqual(
  count(
    "canonicalContentId:String(\n" +
    "              content.canonicalContentId||"
  ),
  2
);

assert.strictEqual(
  count(
    "canonicalAssetId:String(\n" +
    "              content.canonicalAssetId||"
  ),
  2
);

assert.ok(
  count(
    "canonicalContentId:\n" +
    "          String(data.canonical_content_id || '').trim() || null"
  ) >= 1
);

assert.ok(
  count(
    "canonicalAssetId:\n" +
    "          String(data.canonical_asset_id || '').trim() || null"
  ) >= 1
);

assert.strictEqual(
  count(
    "downloadCanonicalGeneration(\n" +
    "            canonicalContentId,\n" +
    "            canonicalAssetId,\n" +
    "            button"
  ),
  2
);

assert.strictEqual(
  count('/* ZUVYR PACK061 FIX5 IMAGE HISTORY RELOAD */'),
  2
);

assert.strictEqual(
  count(
    "const featureQueries=Array.from(\n" +
    "      ROX_CONVERSATION_FEATURES"
  ),
  2
);

console.log(
  'PASS: Pack061 FIX7 R5 unified context-aware Download action'
);
