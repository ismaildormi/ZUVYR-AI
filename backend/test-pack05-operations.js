'use strict';

const assert = require('node:assert/strict');
const {
  config,
  assertVideoOperationAvailable,
  assertVideoRequestAvailable,
  providerSupports,
  inventory
} = require('./lib/videoOperationRegistry');

assert.equal(config.version, 'pack-05.video-system.v1');

for (const operation of [
  'edit', 'extend', 'subtitles', 'enhance', 'export'
]) {
  assert.throws(
    () => assertVideoOperationAvailable(operation),
    error => error.code === 'video_operation_unpriced' && error.operation === operation
  );
}

for (const [operation, gate] of [
  ['text_to_video', 'PACK066_PAID_EXECUTION_ENABLED'],
  ['image_to_video', 'PACK067_I2V_PAID_EXECUTION_ENABLED'],
  ['reference_to_video', 'PACK067_R2V_PAID_EXECUTION_ENABLED']
]) {
  assert.throws(
    () => assertVideoOperationAvailable(operation, { env: {} }),
    error => error.code === 'video_operation_paid_execution_disabled'
  );
  assert.equal(
    assertVideoRequestAvailable(
      { operation },
      { env: { [gate]: 'true' } }
    ).operation,
    operation
  );
}

assert.throws(
  () => assertVideoOperationAvailable('not-real'),
  error => error.code === 'unknown_video_operation'
);
assert.equal(providerSupports('replicate', 'text_to_video'), true);
assert.equal(providerSupports('replicate', 'image_to_video'), true);
assert.equal(providerSupports('replicate', 'reference_to_video'), true);
assert.equal(providerSupports('unknown', 'text_to_video'), false);
assert.deepEqual(Object.keys(inventory().operations), Object.keys(config.operations));
assert.equal(inventory().jobs.cancelEnabledByDefault, false);

console.log('PASS: Pack05 registry preserves blocked future operations while Pack066/067 video modes remain explicit paid-execution gates');
