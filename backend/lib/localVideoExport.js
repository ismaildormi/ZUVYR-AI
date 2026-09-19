'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const MAX_SOURCE_BYTES = 500 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 600 * 1024 * 1024;

function exportError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  error.cause = cause;
  return error;
}

const FORMAT = Object.freeze({
  mp4: Object.freeze({
    extension: 'mp4',
    mimeType: 'video/mp4',
    args: ['-c:v','libx264','-preset','medium','-crf','20','-c:a','aac','-movflags','+faststart']
  }),
  webm: Object.freeze({
    extension: 'webm',
    mimeType: 'video/webm',
    args: ['-c:v','libvpx-vp9','-crf','30','-b:v','0','-c:a','libopus']
  }),
  mov: Object.freeze({
    extension: 'mov',
    mimeType: 'video/quicktime',
    args: ['-c:v','libx264','-preset','medium','-crf','20','-c:a','aac','-movflags','+faststart']
  })
});

function sourceExtension(mimeType) {
  return ({
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-m4v': 'm4v',
    'image/gif': 'gif'
  })[String(mimeType || '').toLowerCase()] || 'bin';
}

function buildFfmpegArgs({ inputPath, outputPath, format }) {
  const spec = FORMAT[format];
  if (!spec) throw exportError('invalid_video_export_format');
  return Object.freeze([
    '-y',
    '-nostdin',
    '-hide_banner',
    '-loglevel','error',
    '-i', inputPath,
    '-map','0:v:0',
    '-map','0:a?',
    ...spec.args,
    outputPath
  ]);
}

async function downloadSource(url, {
  fetchImpl = globalThis.fetch,
  maxBytes = MAX_SOURCE_BYTES
} = {}) {
  if (typeof fetchImpl !== 'function') throw exportError('video_export_fetch_unavailable');
  let parsed;
  try { parsed = new URL(String(url || '')); } catch (_) {
    throw exportError('invalid_video_export_source_url');
  }
  if (parsed.protocol !== 'https:') throw exportError('invalid_video_export_source_protocol');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  let response;
  try {
    response = await fetchImpl(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal
    });
  } catch (error) {
    throw exportError('video_export_source_download_failed', error);
  } finally {
    clearTimeout(timeout);
  }
  if (!response || !response.ok) throw exportError('video_export_source_download_failed');

  const declared = Number(response.headers?.get?.('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw exportError('video_export_source_too_large');
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > maxBytes) {
    throw exportError('video_export_source_size_invalid');
  }
  return buffer;
}

async function runCommand(file, args, {
  execFileImpl = execFileAsync,
  timeout = 180000
} = {}) {
  try {
    return await execFileImpl(file, args, {
      timeout,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true
    });
  } catch (error) {
    throw exportError('video_export_runtime_failed', error);
  }
}

function parseProbe(stdout, format) {
  let payload;
  try { payload = JSON.parse(String(stdout || '')); } catch (_) {
    throw exportError('video_export_probe_invalid');
  }
  const duration = Number(payload?.format?.duration);
  const formatName = String(payload?.format?.format_name || '').toLowerCase();
  if (!Number.isFinite(duration) || duration <= 0) {
    throw exportError('video_export_duration_invalid');
  }
  if (
    format === 'webm'
      ? !formatName.includes('webm')
      : !formatName.includes('mov') && !formatName.includes('mp4')
  ) {
    throw exportError('video_export_container_mismatch');
  }
  return duration;
}

async function executeLocalVideoExport({
  sourceUrl,
  sourceMimeType,
  format,
  fetchImpl = globalThis.fetch,
  execFileImpl = execFileAsync,
  tempRoot = os.tmpdir()
} = {}) {
  const spec = FORMAT[format];
  if (!spec) throw exportError('invalid_video_export_format');

  const token = crypto.randomUUID();
  const workdir = await fs.mkdtemp(path.join(tempRoot, 'zuvyr-video-export-'));
  const inputPath = path.join(workdir, token + '.' + sourceExtension(sourceMimeType));
  const outputPath = path.join(workdir, token + '.' + spec.extension);

  try {
    const source = await downloadSource(sourceUrl, { fetchImpl });
    await fs.writeFile(inputPath, source, { flag: 'wx' });

    const args = buildFfmpegArgs({ inputPath, outputPath, format });
    await runCommand('ffmpeg', args, { execFileImpl });

    const probe = await runCommand('ffprobe', [
      '-v','error',
      '-show_entries','format=duration,format_name',
      '-of','json',
      outputPath
    ], { execFileImpl });

    const actualDurationSeconds = parseProbe(probe.stdout, format);
    const buffer = await fs.readFile(outputPath);
    if (!buffer.length || buffer.length > MAX_OUTPUT_BYTES) {
      throw exportError('video_export_output_size_invalid');
    }

    return Object.freeze({
      buffer,
      mimeType: spec.mimeType,
      extension: spec.extension,
      actualDurationSeconds,
      provider: 'local-ffmpeg',
      model: 'ffmpeg-alpine',
      providerCalls: 0
    });
  } finally {
    await fs.rm(workdir, { recursive: true, force: true }).catch(() => null);
  }
}

module.exports = {
  FORMAT,
  MAX_SOURCE_BYTES,
  MAX_OUTPUT_BYTES,
  buildFfmpegArgs,
  downloadSource,
  executeLocalVideoExport
};
