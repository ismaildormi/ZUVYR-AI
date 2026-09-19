'use strict';

const { config, normalizeAudioOperation } = require('./audioOperationRegistry');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

function requestError(code, field) {
  const error = new Error(code);
  error.code = code;
  if (field) error.field = field;
  return error;
}

function optionalText(value, field, max) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw requestError(`invalid_${field}`, field);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw requestError(`invalid_${field}`, field);
  return normalized;
}

function optionalUuid(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw requestError(`invalid_${field}`, field);
  return value.toLowerCase();
}

function optionalBoolean(value, field, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw requestError(`invalid_${field}`, field);
  return value;
}

function optionalInteger(value, field, fallback, min, max) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw requestError(`invalid_${field}`, field);
  }
  return number;
}

function iso6391(value, field, { allowAuto = false, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw requestError(`${field}_required`, field);
    return allowAuto ? 'auto' : null;
  }
  const text = String(value).trim().toLowerCase();
  if (allowAuto && text === 'auto') return text;
  if (!/^[a-z]{2}$/.test(text)) throw requestError(`invalid_${field}`, field);
  return text;
}

function sourceRights(value, operation) {
  const required = ['remix','stem_separation','translate_dub','audio_to_video'].includes(operation);
  const confirmed = optionalBoolean(value.sourceRightsConfirmed, 'source_rights_confirmed', false);
  const basis = optionalText(value.rightsBasis, 'rights_basis', 240);
  if (required && confirmed !== true) throw requestError('source_rights_confirmation_required','sourceRightsConfirmed');
  if (required && !basis) throw requestError('source_rights_basis_required','rightsBasis');
  return Object.freeze({ confirmed, basis });
}

function normalizeAudioRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw requestError('invalid_audio_request');
  const operation = normalizeAudioOperation(value.operation);
  const definition = config.operations[operation];
  const prompt = optionalText(value.prompt, 'audio_prompt', config.requestLimits.maxPromptCharacters);
  const text = optionalText(value.text, 'speech_text', config.requestLimits.maxSpeechCharacters);
  const sourceAudioAssetId = optionalUuid(value.sourceAudioAssetId, 'source_audio_asset_id');
  const sourceVideoAssetId = optionalUuid(value.sourceVideoAssetId, 'source_video_asset_id');
  const conversationId = optionalUuid(value.conversationId, 'conversation_id');
  const language = optionalText(value.language, 'audio_language', 12);
  if (language && !LANGUAGE_PATTERN.test(language)) throw requestError('invalid_audio_language', 'language');
  if (definition.requiresPrompt && !prompt) throw requestError('audio_prompt_required', 'prompt');
  if (definition.requiresText && !text) throw requestError('speech_text_required', 'text');
  if (definition.requiresSourceAudio && !sourceAudioAssetId) throw requestError('source_audio_asset_required', 'sourceAudioAssetId');
  if (definition.requiresSourceVideo && !sourceVideoAssetId) throw requestError('source_video_asset_required', 'sourceVideoAssetId');
  if (!definition.requiresSourceVideo && sourceVideoAssetId) throw requestError('source_video_asset_not_supported', 'sourceVideoAssetId');
  if (definition.requiresConsent && value.microphoneConsent !== true) throw requestError('microphone_consent_required', 'microphoneConsent');

  const durationSeconds = value.durationSeconds === undefined ? null : value.durationSeconds;
  if (durationSeconds !== null && (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > config.requestLimits.maxDurationSeconds)) {
    throw requestError('invalid_audio_duration', 'durationSeconds');
  }

  if (operation === 'music_generation' && (durationSeconds === null || durationSeconds > 180)) {
    throw requestError('invalid_music_duration','durationSeconds');
  }
  if (operation === 'sound_effects' && (durationSeconds === null || durationSeconds > 30)) {
    throw requestError('invalid_sfx_duration','durationSeconds');
  }
  const outputFormat = String(
    value.outputFormat ||
    (operation === 'audio_to_video' ? 'mp4' : ['audio_cleanup','music_generation','sound_effects','remix','stem_separation'].includes(operation) ? 'wav' : 'mp3')
  ).toLowerCase();
  const allowedFormats = operation === 'audio_to_video' ? config.requestLimits.allowedVideoFormats : config.requestLimits.allowedOutputFormats;
  if (!allowedFormats.includes(outputFormat)) throw requestError('invalid_audio_output_format', 'outputFormat');
  if (operation === 'audio_cleanup' && !['wav','mp3'].includes(outputFormat)) {
    throw requestError('invalid_audio_cleanup_format', 'outputFormat');
  }
  if (operation === 'text_to_speech' && !['mp3','wav'].includes(outputFormat)) {
    throw requestError('invalid_tts_output_format', 'outputFormat');
  }

  if (['music_generation','sound_effects','remix'].includes(operation) && outputFormat !== 'wav') {
    throw requestError('invalid_pack074_generated_audio_format','outputFormat');
  }
  if (operation === 'stem_separation' && !['wav','mp3'].includes(outputFormat)) {
    throw requestError('invalid_pack074_stem_format','outputFormat');
  }
  if (operation === 'translate_dub' && !['mp3','wav'].includes(outputFormat)) {
    throw requestError('invalid_pack074_dub_format','outputFormat');
  }
  if (operation === 'audio_to_video' && outputFormat !== 'mp4') {
    throw requestError('invalid_pack074_audio_to_video_format','outputFormat');
  }
  const sampleRate = value.sampleRate === undefined ? null : value.sampleRate;
  if (sampleRate !== null && !config.requestLimits.allowedSampleRates.includes(sampleRate)) throw requestError('invalid_audio_sample_rate', 'sampleRate');

  const cleanupStrength = String(value.cleanupStrength || 'balanced').toLowerCase();
  if (!['light','balanced','strong'].includes(cleanupStrength)) {
    throw requestError('invalid_audio_cleanup_strength', 'cleanupStrength');
  }
  const visualAssetIds = value.visualAssetIds === undefined ? [] : value.visualAssetIds;
  if (!Array.isArray(visualAssetIds) || visualAssetIds.length > config.requestLimits.maxVisualAssets) throw requestError('invalid_visual_asset_ids', 'visualAssetIds');
  const normalizedVisuals = [...new Set(visualAssetIds.map(id => optionalUuid(id, 'visual_asset_id')))];
  if (operation !== 'audio_to_video' && normalizedVisuals.length) throw requestError('visual_assets_audio_to_video_only', 'visualAssetIds');

  const rights = sourceRights(value, operation);
  const originalTags = optionalText(value.originalTags, 'original_tags', 1200);
  const originalLyrics = optionalText(value.originalLyrics, 'original_lyrics', 5000) || '';
  const lyrics = optionalText(value.lyrics, 'lyrics', 5000) || '';
  const targetLanguage = iso6391(value.targetLanguage, 'target_language', {
    required: operation === 'translate_dub'
  });
  const sourceLanguage = iso6391(value.sourceLanguage, 'source_language', { allowAuto: true });
  const numSpeakers = value.numSpeakers === undefined || value.numSpeakers === null
    ? null
    : optionalInteger(value.numSpeakers, 'num_speakers', 1, 1, 20);
  const rerankingCandidates = optionalInteger(
    value.rerankingCandidates,
    'reranking_candidates',
    1,
    1,
    1
  );
  const seed = value.seed === undefined || value.seed === null
    ? null
    : optionalInteger(value.seed, 'audio_seed', 0, 0, 2147483647);
  const numberOfSteps = optionalInteger(value.numberOfSteps, 'number_of_steps', 27, 1, 100);

  if (operation === 'remix' && !originalTags) {
    throw requestError('original_tags_required','originalTags');
  }
  if (operation !== 'remix' && (originalTags || originalLyrics || lyrics || value.numberOfSteps !== undefined || value.seed !== undefined)) {
    if (!['music_generation'].includes(operation) || originalTags || originalLyrics || lyrics || value.numberOfSteps !== undefined) {
      throw requestError('pack074_remix_options_not_supported');
    }
  }
  if (operation !== 'translate_dub' && (value.targetLanguage !== undefined || value.sourceLanguage !== undefined || value.numSpeakers !== undefined)) {
    throw requestError('pack074_dub_options_not_supported');
  }
  if (operation !== 'stem_separation' && value.rerankingCandidates !== undefined) {
    throw requestError('pack074_stem_options_not_supported');
  }

  return Object.freeze({
    operation, prompt, text, sourceAudioAssetId, sourceVideoAssetId, conversationId, language,
    voiceId: optionalText(value.voiceId, 'voice_id', 120),
    durationSeconds, outputFormat, sampleRate,
    subtitles: value.subtitles === true,
    visualAssetIds: Object.freeze(normalizedVisuals),
    microphoneConsent: value.microphoneConsent === true,
    options: Object.freeze({
      diarization: value.diarization !== false,
      detectLanguage: value.detectLanguage !== false,
      smartFormat: value.smartFormat !== false,
      utterances: value.utterances !== false,
      cleanupStrength,
      cleanupFormat:
        operation === 'audio_cleanup'
          ? (['wav','mp3'].includes(String(value.outputFormat || 'wav').toLowerCase())
              ? String(value.outputFormat || 'wav').toLowerCase()
              : 'wav')
          : null
,
      sourceRightsConfirmed: rights.confirmed,
      rightsBasis: rights.basis,
      originalTags,
      originalLyrics,
      lyrics,
      targetLanguage,
      sourceLanguage,
      numSpeakers,
      rerankingCandidates,
      acceleration: 'balanced',
      maxChunkDuration: 60,
      chunkOverlap: 5,
      seed,
      numberOfSteps
    })
  });
}

module.exports = { requestError, normalizeAudioRequest };
