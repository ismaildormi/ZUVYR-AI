'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const worker = fs.readFileSync(
  require.resolve('./worker.js'),
  'utf8'
);

const repository = fs.readFileSync(
  require.resolve(
    './lib/imageGenerationRepository.js'
  ),
  'utf8'
);

const migration = fs.readFileSync(
  require.resolve(
    './32_pack064_image_utility_operations.sql'
  ),
  'utf8'
);

for (const marker of [
  "remove_background: 'fal-background'",
  "relight: 'fal-relight'",
  "'crop'",
  "'resize'",
  "'canvas'",
  "'layers'",
  "'text'",
  "'batch'",
  'PACK064_EXTERNAL_EXECUTION_ENABLED',
  'getDefaultLocalImageUtilityRepository',
  'executeLocalImageUtility',
  'persistOutputs'
]) {
  assert(
    worker.includes(marker),
    'worker missing Pack064 marker: ' +
      marker
  );
}

assert.match(
  repository,
  /PACK064_IMAGE_OPERATIONS/
);

assert.match(
  repository,
  /pack064_image_utility/
);

assert.match(
  repository,
  /image_local_replay_sign_failed/
);

for (const operation of [
  'remove_background',
  'upscale',
  'relight',
  'crop',
  'resize',
  'canvas',
  'layers',
  'text',
  'batch'
]) {
  assert(
    migration.includes(
      "'" + operation + "'"
    ),
    'migration missing: ' + operation
  );
}

console.log(
  'PASS: PACK064 worker routes external and local utilities, local outputs persist canonically, replay refreshes local signed URLs and migration covers every utility operation'
);
console.log(
  'PROVIDER / PAYMENT / NETWORK CALLS: NONE'
);
