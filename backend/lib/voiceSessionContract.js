'use strict';

const { config } = require('./audioOperationRegistry');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sessionError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizeVoiceSessionRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw sessionError('invalid_voice_session_request');
  }
  if (value.microphoneConsent !== true) {
    throw sessionError('microphone_consent_required');
  }
  if (value.continuousListening === true) {
    throw sessionError('continuous_listening_disabled');
  }
  if (value.backgroundRecording === true) {
    throw sessionError('background_recording_disabled');
  }
  if (value.storeRawAudio === true) {
    throw sessionError('raw_audio_storage_disabled');
  }

  const maxSeconds = value.maxSeconds === undefined ? 300 : value.maxSeconds;
  if (
    !Number.isInteger(maxSeconds) ||
    maxSeconds < 1 ||
    maxSeconds > config.requestLimits.maxVoiceSessionSeconds
  ) {
    throw sessionError('invalid_voice_session_duration');
  }

  const conversationId = value.conversationId == null || String(value.conversationId).trim() === ''
    ? null
    : String(value.conversationId).trim().toLowerCase();
  if (conversationId && !UUID.test(conversationId)) {
    throw sessionError('invalid_voice_session_conversation');
  }

  const retentionMode=String(value.retentionMode||'transcript_only').trim().toLowerCase();
  if (!['transcript_only','none'].includes(retentionMode)) {
    throw sessionError('invalid_voice_session_retention');
  }

  return Object.freeze({
    microphoneConsent: true,
    continuousListening: false,
    backgroundRecording: false,
    storeRawAudio: false,
    visibleRecordingIndicator: true,
    stopControl: true,
    maxSeconds,
    conversationId,
    retentionMode,
    transport: 'web_speech_api',
    provider: 'browser',
    bargeInEnabled: true,
    autoSpeak: value.autoSpeak !== false
  });
}

module.exports = { normalizeVoiceSessionRequest };
