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

for (const operation of ['subtitles', 'enhance', 'export']) {
  assert.throws(
    () => assertVideoOperationAvailable(operation),
    error => error.code === 'video_operation_unpriced' && error.operation === operation
  );
}

for (const operation of ['relight','recamera']) {
  assert.throws(
    () => assertVideoOperationAvailable(operation),
    error => error.code === 'video_operation_disabled' && error.operation === operation
  );
}

for (const [operation, gate] of [
  ['text_to_video', 'PACK066_PAID_EXECUTION_ENABLED'],
  ['image_to_video', 'PACK067_I2V_PAID_EXECUTION_ENABLED'],
  ['reference_to_video', 'PACK067_R2V_PAID_EXECUTION_ENABLED'],
  ['edit', 'PACK068_EDIT_PAID_EXECUTION_ENABLED'],
  ['extend', 'PACK068_EXTEND_PAID_EXECUTION_ENABLED'],
  ['object_remove', 'PACK068_OBJECT_REMOVE_PAID_EXECUTION_ENABLED'],
  ['background_remove', 'PACK068_BACKGROUND_PAID_EXECUTION_ENABLED'],
  ['lip_sync', 'PACK068_LIPSYNC_PAID_EXECUTION_ENABLED']
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
for (const operation of ['text_to_video','image_to_video','reference_to_video']) {
  assert.equal(providerSupports('replicate', operation), true);
}
for (const operation of [
  'edit','extend','object_remove','background_remove','relight','recamera','lip_sync'
]) {
  assert.equal(providerSupports('fal', operation), true);
}
assert.equal(providerSupports('unknown', 'text_to_video'), false);
assert.deepEqual(Object.keys(inventory().operations), Object.keys(config.operations));
assert.equal(inventory().jobs.cancelEnabledByDefault, false);
assert.equal(inventory().pack068.phase, 'IMPLEMENTED_PAID_LIVE_DEFERRED');

console.log('PASS: Video registry preserves blocked future work, Pack066/067 gates and Pack068 operation-specific paid gates');
