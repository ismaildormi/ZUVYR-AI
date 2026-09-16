'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'index.html'),
  'utf8'
);

const c = (s) => html.split(s).length - 1;
const r = (re) => (html.match(re) || []).length;

assert.strictEqual(c('/* ZUVYR PACK061 FIX5 IMAGE HISTORY RELOAD */'), 2);
assert.strictEqual(c('zuvyr.pack061.images.active.'), 2);

const freshImageQueries =
  c('feature=images&limit=100&archived=false&_zuvyr=') +
  c('limit=100&archived=false&feature=images&_zuvyr=');

assert.strictEqual(freshImageQueries, 2);
assert.strictEqual(c("'&_zuvyr='+Date.now();"), 2);
assert.strictEqual(c("cache:'no-store'"), 2);

assert.ok(
  r(/async\s+function\s+downloadCanonicalGeneration\s*\(\s*contentId\s*,\s*assetId\s*,\s*button\s*\)/g) >= 1
);

assert.strictEqual(
  r(/downloadCanonicalGeneration\s*\(\s*canonicalContentId\s*,\s*canonicalAssetId\s*,\s*downloadButton\s*\)/g),
  2
);

assert.strictEqual(
  r(/async\s+function\s+sendGeneration\s*\(\s*feature\s*,\s*text\s*,\s*msgBox\s*\)/g),
  2
);

assert.strictEqual(
  r(/const\s+GEN_ROUTES\s*=\s*\{\s*images\s*:\s*['"]\/api\/generate-image['"]\s*,\s*videos\s*:\s*['"]\/api\/generate-video['"]\s*\}\s*;/g),
  2
);

assert.ok(r(/rememberRoxImageConversationId\s*\(/g) >= 8);

console.log('PASS');
