'use strict';

const crypto = require('node:crypto');

const MAX_TEXT_CHARS = 200000;

function privacyError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizeTrainingText(value) {
  const text = String(value == null ? '' : value)
    .replace(/\u0000/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .normalize('NFKC');

  if (!text.trim()) throw privacyError('pack094_training_text_empty');
  if (text.length > MAX_TEXT_CHARS) {
    throw privacyError('pack094_training_text_too_large');
  }
  return text;
}

const REDACTORS = Object.freeze([
  {
    key: 'email',
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: '[REDACTED_EMAIL]'
  },
  {
    key: 'phone',
    regex: /(?<!\w)(?:\+?\d[\d .()\-]{7,}\d)(?!\w)/g,
    replacement: '[REDACTED_PHONE]'
  },
  {
    key: 'ipv4',
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
    replacement: '[REDACTED_IP]'
  },
  {
    key: 'jwt',
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: '[REDACTED_TOKEN]'
  },
  {
    key: 'bearer',
    regex: /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/gi,
    replacement: 'Bearer [REDACTED_TOKEN]'
  },
  {
    key: 'secret_key',
    regex: /\b(?:sk|pk|rk|ghp|github_pat|xox[baprs]|AIza)[-_A-Za-z0-9]{12,}\b/g,
    replacement: '[REDACTED_SECRET]'
  },
  {
    key: 'aws_access_key',
    regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: '[REDACTED_SECRET]'
  },
  {
    key: 'card_number',
    regex: /(?<!\d)(?:\d[ -]*?){13,19}(?!\d)/g,
    replacement: '[REDACTED_PAYMENT_NUMBER]'
  }
]);

function redactTrainingText(value) {
  const normalized = normalizeTrainingText(value);
  let redacted = normalized;
  const counts = {};

  for (const item of REDACTORS) {
    let count = 0;
    redacted = redacted.replace(item.regex, () => {
      count += 1;
      return item.replacement;
    });
    if (count) counts[item.key] = count;
  }

  const canonical = redacted
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  if (!canonical) throw privacyError('pack094_redacted_text_empty');

  const sha256 = crypto
    .createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex');

  const redactionCount = Object.values(counts).reduce((sum, count) => sum + count, 0);

  return Object.freeze({
    redactedText: canonical,
    sha256,
    summary: Object.freeze({
      processor: 'pack094-deterministic-redaction-v1',
      redactionCount,
      categories: Object.freeze(Object.keys(counts).sort()),
      counts: Object.freeze({ ...counts }),
      originalLength: normalized.length,
      redactedLength: canonical.length
    })
  });
}

function sanitizeNonContentMetadata(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.freeze({});

  const allowed = [
    'usage_kind',
    'ledger_source',
    'funding_source',
    'credits',
    'refunded_credits',
    'plan_version',
    'cancel_requested',
    'compensation_version',
    'step_key',
    'sequence_number',
    'resume_count',
    'route_class',
    'rollback',
    'repair'
  ];

  const clean = {};
  for (const key of allowed) {
    if (!(key in value)) continue;
    const raw = value[key];
    if (
      raw === null ||
      typeof raw === 'boolean' ||
      (typeof raw === 'number' && Number.isFinite(raw)) ||
      (typeof raw === 'string' && raw.length <= 200)
    ) {
      clean[key] = raw;
    }
  }
  return Object.freeze(clean);
}

function candidateLearningValueScore({
  qualityScore = 5000,
  difficulty = 3,
  redactionCount = 0,
  sourceLearningValue = 0
} = {}) {
  const quality = Math.max(0, Math.min(10000, Number(qualityScore) || 0));
  const level = Math.max(1, Math.min(5, Number(difficulty) || 3));
  const source = Math.max(0, Math.min(10000, Number(sourceLearningValue) || 0));
  const privacyPenalty = Math.min(2500, Math.max(0, Number(redactionCount) || 0) * 150);

  return Math.max(
    0,
    Math.min(
      10000,
      Math.round(quality * 0.55 + source * 0.25 + level * 400 - privacyPenalty)
    )
  );
}

module.exports = {
  MAX_TEXT_CHARS,
  REDACTORS,
  normalizeTrainingText,
  redactTrainingText,
  sanitizeNonContentMetadata,
  candidateLearningValueScore
};
