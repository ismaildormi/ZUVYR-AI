'use strict';
const assert = require('node:assert/strict');
const { normalizeAudioRequest } = require('./lib/audioRequestContract');
const id = '11111111-1111-4111-8111-111111111111';

const transcription = normalizeAudioRequest({ operation: 'transcription', sourceAudioAssetId: id, language: 'ar-MA', diarization: true });
assert.equal(transcription.operation, 'transcription');
assert.equal(transcription.options.diarization, true);
assert.equal(transcription.options.smartFormat, true);
assert.equal(normalizeAudioRequest({ operation: 'text_to_speech', text: 'سلام', voiceId: 'voice-1', outputFormat: 'wav' }).outputFormat, 'wav');
assert.equal(normalizeAudioRequest({ operation: 'music_generation', prompt: 'calm instrumental', durationSeconds: 60 }).durationSeconds, 60);
assert.equal(normalizeAudioRequest({
  operation: 'audio_to_video',
  sourceAudioAssetId: id,
  sourceVideoAssetId: id,
  visualAssetIds: [id, id],
  subtitles: true,
  outputFormat: 'mp4',
  sourceRightsConfirmed: true,
  rightsBasis: 'owned_source_media'
}).visualAssetIds.length, 1);
assert.throws(() => normalizeAudioRequest({ operation: 'transcription' }), { code: 'source_audio_asset_required' });
assert.throws(() => normalizeAudioRequest({ operation: 'text_to_speech', text: '' }), { code: 'speech_text_required' });
assert.throws(() => normalizeAudioRequest({ operation: 'voice_chat' }), { code: 'microphone_consent_required' });
assert.throws(() => normalizeAudioRequest({ operation: 'music_generation', prompt: 'x', durationSeconds: 601 }), { code: 'invalid_audio_duration' });
assert.throws(() => normalizeAudioRequest({ operation: 'audio_cleanup', sourceAudioAssetId: 'not-a-uuid' }), { code: 'invalid_source_audio_asset_id' });
assert.equal(normalizeAudioRequest({ operation: 'audio_cleanup', sourceAudioAssetId: id, outputFormat: 'wav', cleanupStrength: 'strong' }).options.cleanupStrength, 'strong');
assert.throws(() => normalizeAudioRequest({ operation: 'audio_cleanup', sourceAudioAssetId: id, outputFormat: 'flac' }), { code: 'invalid_audio_cleanup_format' });
assert.throws(() => normalizeAudioRequest({ operation: 'transcription', sourceAudioAssetId: id, visualAssetIds: [id] }), { code: 'visual_assets_audio_to_video_only' });
console.log('PASS: Pack07 request contracts remain bounded and Pack071 adds diarization plus deterministic cleanup options');
