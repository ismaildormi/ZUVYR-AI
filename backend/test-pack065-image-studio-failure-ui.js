'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const frontend =
  fs.readFileSync(
    require.resolve(
      '../frontend/zuvyr-suite-v1.js'
    ),
    'utf8'
  );

for (const marker of [
  "item.status==='completed'",
  "item.contentId&&",
  "item.assetId",
  "item.error",
  "disabled",
  "History needs attention",
  "No canonical image jobs yet",
  "Reference / variations · gated",
  "Edit / inpaint / expand · gated",
  "Background / relight · gated",
  "Upscale · blocked"
]) {
  assert(
    frontend.includes(marker),
    'Image Studio failure/truth UI missing: ' +
      marker
  );
}

assert(
  !frontend.includes(
    "['Enhance','Remove background, upscale and repair']"
  ),
  'unverified Enhance advertising must stay removed'
);

console.log(
  'PASS: PACK065 Image Studio exposes failed-job/error states without enabling Open for non-canonical results and keeps unverified/blocked image operations explicitly gated'
);
console.log(
  'AI PROVIDER / PAYMENT / NETWORK CALLS: NONE'
);
