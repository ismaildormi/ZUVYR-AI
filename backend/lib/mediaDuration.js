'use strict';

const { execFile } = require('child_process');

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
  const milliseconds =
    (BigInt(dataBytes) * 1000n) / BigInt(byteRate);
  if (milliseconds <= 0n || milliseconds > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw durationError('media_duration_wav_invalid');
  }
  return Number(milliseconds) / 1000;
}

async function probeMediaFileDurationSeconds(filePath, {
  assetType,
  timeoutMs = 15000,
  execFileImpl = execFile
} = {}) {
  if (String(assetType || '').toLowerCase() !== 'audio') return null;
  const target = String(filePath || '').trim();
  if (!target) throw durationError('media_duration_probe_path_missing');

  const stdout = await new Promise((resolve, reject) => {
    execFileImpl(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        target
      ],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 64 * 1024 },
      (error, out) => error ? reject(error) : resolve(String(out || '').trim())
    );
  }).catch(error => {
    const wrapped = durationError('media_duration_probe_failed');
    wrapped.cause = error;
    throw wrapped;
  });

  const seconds = Number(stdout);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw durationError('media_duration_probe_invalid');
  }
  return Math.round(seconds * 1000) / 1000;
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
  readTrustedMediaDurationSeconds,
  probeMediaFileDurationSeconds
};
