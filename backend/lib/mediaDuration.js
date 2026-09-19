'use strict';

const {
  isMp4,
  readMp4DurationSeconds
} = require('./videoGenerationRepository');

function durationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function readWavDurationSeconds(buffer) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 44 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw durationError('media_duration_not_wav');
  }

  let offset = 12;
  let byteRate = null;
  let dataBytes = null;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > buffer.length) throw durationError('media_duration_wav_invalid');

    if (id === 'fmt ' && size >= 16) {
      byteRate = buffer.readUInt32LE(dataStart + 8);
    } else if (id === 'data') {
      dataBytes = size;
    }

    offset = dataEnd + (size % 2);
    if (byteRate && dataBytes !== null) break;
  }

  if (!byteRate || !dataBytes) throw durationError('media_duration_wav_missing');
  const duration = dataBytes / byteRate;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw durationError('media_duration_wav_invalid');
  }
  return duration;
}

function readTrustedMediaDurationSeconds(buffer, {
  assetType,
  mimeType
} = {}) {
  const type = String(assetType || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();

  if (isMp4(buffer)) {
    return readMp4DurationSeconds(buffer);
  }
  if (
    type === 'audio' &&
    ['audio/wav','audio/x-wav','audio/wave'].includes(mime)
  ) {
    return readWavDurationSeconds(buffer);
  }

  return null;
}

module.exports = {
  readWavDurationSeconds,
  readTrustedMediaDurationSeconds
};
