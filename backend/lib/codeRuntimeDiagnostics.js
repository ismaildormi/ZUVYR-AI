'use strict';

const crypto = require('node:crypto');

const MAX_SOURCE_CHARS = 96 * 1024;
const MAX_MESSAGE_CHARS = 4000;
const MAX_STACK_LINES = 24;

function redact(value) {
  return String(value || '')
    .replace(
      /\b(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*['"]?[^\s'",;]+/gi,
      match => match.replace(/([:=]\s*['"]?).*$/,'$1[redacted]')
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{12,}/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|pk|vcp|sbp)_[A-Za-z0-9_-]{12,}\b/g, '[redacted]');
}

function safePath(value) {
  let path = String(value || '').replace(/\\/g, '/').trim();
  path = path.replace(/^file:\/\//i, '');
  const workspace = '/vercel/sandbox/';
  const index = path.indexOf(workspace);
  if (index >= 0) path = path.slice(index + workspace.length);
  path = path.replace(/^\.\//, '');
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('../') ||
    path.includes('\0') ||
    path.length > 300
  ) return null;
  return path;
}

function fingerprint(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''), 'utf8')
    .digest('hex');
}

function diagnosticKind(operation, exitCode) {
  if (Number(exitCode) === 0) return 'none';
  if (operation === 'build') return 'build_error';
  if (operation === 'test') return 'test_failure';
  return 'runtime_error';
}

function extractLocation(text) {
  const patterns = [
    /(?:^|\s|\()([^\s():]+\.[A-Za-z0-9]+):(\d{1,7}):(\d{1,7})(?:\)|\s|$)/m,
    /(?:^|\s|\()([^\s():]+\.[A-Za-z0-9]+):(\d{1,7})(?:\)|\s|$)/m,
    /(?:at\s+)?\(?([^\s():]+\.[A-Za-z0-9]+):(\d{1,7}):(\d{1,7})\)?/m
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const path = safePath(match[1]);
    if (!path) continue;
    const line = Number(match[2]);
    const column = match[3] ? Number(match[3]) : null;
    if (!Number.isInteger(line) || line < 1) continue;
    return Object.freeze({
      path,
      line,
      column:
        Number.isInteger(column) && column >= 1
          ? column
          : null
    });
  }
  return null;
}

function structuredDiagnostic({
  operation,
  exitCode,
  chunks = [],
  fallbackCode = null
} = {}) {
  const rows = (Array.isArray(chunks) ? chunks : [])
    .map(chunk => redact(chunk?.message || ''))
    .filter(Boolean);
  const source = rows.join('\n').slice(-MAX_SOURCE_CHARS);
  const lines = source.split(/\r?\n/).filter(Boolean);
  const location = extractLocation(source);

  const errorLine =
    [...lines].reverse().find(line =>
      /\b(error|failed|failure|exception|syntaxerror|typeerror|referenceerror)\b/i.test(line)
    ) ||
    lines[lines.length - 1] ||
    String(fallbackCode || 'runtime_failed');

  const stack = lines
    .filter(line => /^\s*at\s+|:\d+(?::\d+)?\)?\s*$/.test(line) || /error|failed/i.test(line))
    .slice(-MAX_STACK_LINES)
    .map(line => line.slice(0, 1000));

  const kind = diagnosticKind(operation, exitCode);
  const normalizedMessage = String(errorLine || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);

  const stable = [
    kind,
    location?.path || '',
    location?.line || '',
    normalizedMessage.toLowerCase()
  ].join('|');

  return Object.freeze({
    kind,
    code: String(fallbackCode || (kind === 'none' ? 'ok' : 'code_runtime_command_failed')).slice(0, 200),
    message: normalizedMessage || 'Runtime command failed.',
    file: location?.path || null,
    line: location?.line || null,
    column: location?.column || null,
    stack: Object.freeze(stack),
    fingerprint: fingerprint(stable),
    truncated: source.length >= MAX_SOURCE_CHARS
  });
}

module.exports = {
  redact,
  safePath,
  fingerprint,
  diagnosticKind,
  extractLocation,
  structuredDiagnostic
};
