'use strict';

const MAX_SUBTITLE_CUES = 10000;
const MAX_TRANSCRIPTION_CHARS = 200000;

function subtitleError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function milliseconds(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw subtitleError(code);
  const result = Math.round(number * 1000);
  if (!Number.isSafeInteger(result) || result < 0) throw subtitleError(code);
  return result;
}

function cleanText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeWord(item) {
  if (!item || typeof item !== 'object') return null;
  const text = cleanText(item.text ?? item.word ?? item.value);
  const startRaw =
    item.start ?? item.start_time ?? item.startTime ?? item.start_seconds;
  const endRaw =
    item.end ?? item.end_time ?? item.endTime ?? item.end_seconds;
  if (!text || startRaw === undefined || endRaw === undefined) return null;
  const startMs = milliseconds(startRaw, 'invalid_video_subtitle_word_start');
  const endMs = milliseconds(endRaw, 'invalid_video_subtitle_word_end');
  if (endMs <= startMs) return null;
  return Object.freeze({ text, startMs, endMs });
}

function normalizeSegment(item) {
  if (!item || typeof item !== 'object') return null;
  const text = cleanText(item.text ?? item.transcript ?? item.value);
  const startRaw =
    item.start ?? item.start_time ?? item.startTime ?? item.start_seconds;
  const endRaw =
    item.end ?? item.end_time ?? item.endTime ?? item.end_seconds;
  if (!text || startRaw === undefined || endRaw === undefined) return null;
  const startMs = milliseconds(startRaw, 'invalid_video_subtitle_segment_start');
  const endMs = milliseconds(endRaw, 'invalid_video_subtitle_segment_end');
  if (endMs <= startMs) return null;
  return Object.freeze({ text, startMs, endMs });
}

function cuesFromWords(words, wordsPerSubtitle) {
  const normalized = (Array.isArray(words) ? words : [])
    .map(normalizeWord)
    .filter(Boolean);
  if (!normalized.length) return [];

  const size = Number(wordsPerSubtitle);
  if (!Number.isInteger(size) || size < 1 || size > 12) {
    throw subtitleError('invalid_video_words_per_subtitle');
  }

  const cues = [];
  for (let i = 0; i < normalized.length; i += size) {
    if (cues.length >= MAX_SUBTITLE_CUES) {
      throw subtitleError('video_subtitle_cue_limit');
    }
    const group = normalized.slice(i, i + size);
    cues.push(Object.freeze({
      startMs: group[0].startMs,
      endMs: group[group.length - 1].endMs,
      text: group.map(item => item.text).join(' ').trim()
    }));
  }
  return cues;
}

function cuesFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return [];
  const candidates = [
    metadata.segments,
    metadata.subtitle_segments,
    metadata.subtitles
  ].find(Array.isArray);
  if (!candidates) return [];
  const cues = candidates.map(normalizeSegment).filter(Boolean);
  if (cues.length > MAX_SUBTITLE_CUES) {
    throw subtitleError('video_subtitle_cue_limit');
  }
  return cues;
}

function normalizeSubtitleEvidence({
  transcription = '',
  words = [],
  transcriptionMetadata = null,
  wordsPerSubtitle = 3
} = {}) {
  const text = cleanText(transcription);
  if (text.length > MAX_TRANSCRIPTION_CHARS) {
    throw subtitleError('video_transcription_too_large');
  }

  let cues = cuesFromWords(words, wordsPerSubtitle);
  if (!cues.length) cues = cuesFromMetadata(transcriptionMetadata);
  if (!cues.length) {
    throw subtitleError('video_subtitle_timing_unavailable');
  }

  let previousEnd = -1;
  const monotonic = cues.map(cue => {
    if (cue.startMs < previousEnd || cue.endMs <= cue.startMs) {
      throw subtitleError('video_subtitle_timing_invalid');
    }
    previousEnd = cue.endMs;
    return cue;
  });

  return Object.freeze({
    transcription: text,
    cues: Object.freeze(monotonic)
  });
}

function clock(ms, separator) {
  const total = Number(ms);
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return (
    String(hours).padStart(2, '0') + ':' +
    String(minutes).padStart(2, '0') + ':' +
    String(seconds).padStart(2, '0') + separator +
    String(millis).padStart(3, '0')
  );
}

function renderSrt(evidence) {
  return Buffer.from(
    evidence.cues.map((cue, index) =>
      String(index + 1) + '\n' +
      clock(cue.startMs, ',') + ' --> ' + clock(cue.endMs, ',') + '\n' +
      cue.text + '\n'
    ).join('\n'),
    'utf8'
  );
}

function renderVtt(evidence) {
  return Buffer.from(
    'WEBVTT\n\n' +
    evidence.cues.map(cue =>
      clock(cue.startMs, '.') + ' --> ' + clock(cue.endMs, '.') + '\n' +
      cue.text + '\n'
    ).join('\n'),
    'utf8'
  );
}

function buildSubtitleArtifacts(input, formats = ['srt', 'vtt']) {
  const evidence = normalizeSubtitleEvidence(input);
  const unique = [...new Set((formats || []).map(item => String(item).toLowerCase()))];
  if (!unique.length || unique.some(item => !['srt','vtt'].includes(item))) {
    throw subtitleError('invalid_video_subtitle_formats');
  }
  return Object.freeze({
    evidence,
    artifacts: Object.freeze(unique.map(format => Object.freeze({
      format,
      mimeType: format === 'srt' ? 'application/x-subrip' : 'text/vtt',
      extension: format,
      buffer: format === 'srt' ? renderSrt(evidence) : renderVtt(evidence)
    })))
  });
}

module.exports = {
  MAX_SUBTITLE_CUES,
  normalizeSubtitleEvidence,
  buildSubtitleArtifacts,
  renderSrt,
  renderVtt
};
