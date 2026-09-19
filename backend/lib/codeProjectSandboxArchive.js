'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');
const path = require('node:path');
const config = require('../config/code-runtime.v1.json');

function archiveError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safePath(value) {
  const raw = String(value || '');
  if (
    !raw ||
    raw.length > 240 ||
    raw.includes('\0') ||
    raw.includes('\\') ||
    raw.startsWith('/') ||
    /^[A-Za-z]:/.test(raw)
  ) {
    throw archiveError('code_runtime_archive_path_invalid');
  }

  const normalized = path.posix.normalize(raw);
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.startsWith('/')
  ) {
    throw archiveError('code_runtime_archive_path_invalid');
  }

  const segments = normalized.split('/');
  const lowered = segments.map(segment => segment.toLowerCase());
  for (const forbidden of config.workspace.forbiddenPathSegments) {
    if (lowered.includes(String(forbidden).toLowerCase())) {
      throw archiveError('code_runtime_archive_path_forbidden');
    }
  }

  const basename = lowered[lowered.length - 1];
  if (
    config.workspace.forbiddenBasenames
      .map(value => String(value).toLowerCase())
      .includes(basename)
  ) {
    throw archiveError('code_runtime_archive_secret_path');
  }

  return normalized;
}

function splitUstarPath(value) {
  const name = Buffer.byteLength(value) <= 100 ? value : null;
  if (name) return { name, prefix: '' };

  const parts = value.split('/');
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const prefix = parts.slice(0, i).join('/');
    const leaf = parts.slice(i).join('/');
    if (
      Buffer.byteLength(prefix) <= 155 &&
      Buffer.byteLength(leaf) <= 100
    ) {
      return { name: leaf, prefix };
    }
  }
  throw archiveError('code_runtime_archive_path_too_long');
}

function writeString(buffer, offset, length, value) {
  const bytes = Buffer.from(String(value || ''), 'utf8');
  if (bytes.length > length) {
    throw archiveError('code_runtime_tar_field_too_long');
  }
  bytes.copy(buffer, offset);
}

function octal(value, width) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw archiveError('code_runtime_tar_number_invalid');
  }
  const digits = numeric.toString(8);
  if (digits.length > width - 1) {
    throw archiveError('code_runtime_tar_number_too_large');
  }
  return digits.padStart(width - 1, '0') + '\0';
}

function tarHeader(filePath, size) {
  const split = splitUstarPath(filePath);
  const header = Buffer.alloc(512, 0);

  writeString(header, 0, 100, split.name);
  writeString(header, 100, 8, octal(0o644, 8));
  writeString(header, 108, 8, octal(0, 8));
  writeString(header, 116, 8, octal(0, 8));
  writeString(header, 124, 12, octal(size, 12));
  writeString(header, 136, 12, octal(0, 12));

  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  writeString(header, 257, 6, 'ustar\0');
  writeString(header, 263, 2, '00');
  writeString(header, 345, 155, split.prefix);

  let checksum = 0;
  for (const byte of header) checksum += byte;
  const checksumText = checksum.toString(8).padStart(6, '0') + '\0 ';
  writeString(header, 148, 8, checksumText);
  return header;
}

function canonicalFiles(project) {
  const files = Array.isArray(project?.files) ? project.files : [];
  if (
    files.length < 1 ||
    files.length > config.workspace.maxFiles
  ) {
    throw archiveError('code_runtime_archive_file_count_invalid');
  }

  const seen = new Set();
  const normalized = files.map(file => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      throw archiveError('code_runtime_archive_file_invalid');
    }
    const filePath = safePath(file.path);
    if (seen.has(filePath)) {
      throw archiveError('code_runtime_archive_duplicate_path');
    }
    seen.add(filePath);

    if (typeof file.content !== 'string') {
      throw archiveError('code_runtime_archive_content_invalid');
    }
    const content = Buffer.from(file.content, 'utf8');
    return Object.freeze({
      path: filePath,
      content
    });
  });

  normalized.sort((a, b) => a.path.localeCompare(b.path));
  return normalized;
}

function buildProjectTarball(project) {
  const files = canonicalFiles(project);
  let totalBytes = 0;
  const chunks = [];
  const digest = crypto.createHash('sha256');

  for (const file of files) {
    totalBytes += file.content.length;
    if (totalBytes > config.workspace.maxUncompressedBytes) {
      throw archiveError('code_runtime_archive_too_large');
    }

    digest.update(file.path, 'utf8');
    digest.update(Buffer.from([0]));
    digest.update(file.content);
    digest.update(Buffer.from([0]));

    chunks.push(tarHeader(file.path, file.content.length));
    chunks.push(file.content);

    const remainder = file.content.length % 512;
    if (remainder !== 0) {
      chunks.push(Buffer.alloc(512 - remainder, 0));
    }
  }

  chunks.push(Buffer.alloc(1024, 0));
  const tar = Buffer.concat(chunks);
  const gzip = zlib.gzipSync(tar, {
    level: 6,
    mtime: 0
  });

  if (gzip.length > config.workspace.maxArchiveBytes) {
    throw archiveError('code_runtime_archive_compressed_too_large');
  }

  return Object.freeze({
    archive: gzip,
    digest: digest.digest('hex'),
    fileCount: files.length,
    uncompressedBytes: totalBytes,
    archiveBytes: gzip.length
  });
}

module.exports = {
  safePath,
  splitUstarPath,
  tarHeader,
  canonicalFiles,
  buildProjectTarball
};
