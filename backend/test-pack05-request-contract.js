'use strict';

const assert = require('node:assert/strict');
const { normalizeVideoRequest } = require('./lib/videoRequestContract');
const IMAGE = '11111111-1111-4111-8111-111111111111';
const VIDEO = '22222222-2222-4222-8222-222222222222';
const END = '33333333-3333-4333-8333-333333333333';
const REF = '44444444-4444-4444-8444-444444444444';

const text = normalizeVideoRequest({ prompt: '  Moroccan coast at sunrise  ' });
assert.equal(text.operation, 'text_to_video');
assert.equal(text.prompt, 'Moroccan coast at sunrise');
assert.deepEqual(text.options, {
  durationSeconds: 5, ratio: '16:9', resolution: '480p', fps: 16,
  audio: false, seed: null, subtitleLanguage: 'auto',
  targetLanguage: 'auto', exportFormat: 'mp4'
});

const image = normalizeVideoRequest({
  videoOperation: 'image_to_video',
  prompt: 'Move slowly',
  startFrameAssetId: IMAGE,
  endFrameAssetId: END,
  videoOptions: { durationSeconds: 6, resolution: '720p' }
});
assert.equal(image.startFrameAssetId, IMAGE);
assert.equal(image.endFrameAssetId, END);
assert.equal(image.options.durationSeconds, 6);
assert.equal(image.options.ratio, null);
assert.equal(image.options.fps, 16);

const reference = normalizeVideoRequest({
  videoOperation: 'reference_to_video',
  prompt: 'Keep the product identity',
  referenceImageAssetIds: [REF],
  videoOptions: { durationSeconds: 5, ratio: '1:1', resolution: '1080p' }
});
assert.deepEqual(reference.referenceImageAssetIds, [REF]);
assert.equal(reference.options.shotType, 'single');

const edit = normalizeVideoRequest({ videoOperation: 'edit', sourceVideoAssetId: VIDEO });
assert.equal(edit.prompt, '');
assert.equal(edit.sourceVideoAssetId, VIDEO);

for (const [body, code] of [
  [{}, 'video_prompt_required'],
  [{ videoOperation: 'image_to_video', prompt: 'Move' }, 'video_source_image_required'],
  [{ videoOperation: 'reference_to_video', prompt: 'Move' }, 'video_reference_images_required'],
  [{ videoOperation: 'edit' }, 'video_source_video_required'],
  [{ prompt: 'x', endFrameAssetId: END }, 'video_start_frame_required'],
  [{ prompt: 'x', sourceImageAssetId: 'bad' }, 'invalid_video_source_image'],
  [{ prompt: 'x', videoOptions: [] }, 'invalid_video_options'],
  [{ prompt: 'x', videoOptions: { durationSeconds: 99 } }, 'invalid_video_duration'],
  [{ prompt: 'x', videoOptions: { ratio: '2:1' } }, 'invalid_video_ratio'],
  [{ prompt: 'x', videoOptions: { resolution: '4k' } }, 'invalid_video_resolution'],
  [{ prompt: 'x', videoOptions: { fps: 60 } }, 'invalid_video_fps'],
  [{ prompt: 'x', videoOptions: { audio: 'yes' } }, 'invalid_video_audio'],
  [{ prompt: 'x', videoOptions: { exportFormat: 'exe' } }, 'invalid_video_export_format'],
  [{ prompt: 'x', videoOptions: { secret: true } }, 'unsupported_video_option'],
  [{ videoOperation: 'image_to_video', prompt: 'x', sourceImageAssetId: IMAGE, videoOptions: { ratio: '9:16' } }, 'unsupported_video_option'],
  [{ videoOperation: 'reference_to_video', prompt: 'x', referenceImageAssetIds: [REF], sourceImageAssetId: IMAGE }, 'video_reference_source_conflict']
]) assert.throws(() => normalizeVideoRequest(body), error => error.code === code, code);

console.log('PASS: Pack05/067 text, image, reference and legacy source contracts remain bounded and operation-specific');
