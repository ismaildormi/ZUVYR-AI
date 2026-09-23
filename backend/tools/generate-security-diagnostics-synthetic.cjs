#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  buildSyntheticCorpus,
  buildHoldoutEvalSuite
} = require('../lib/securityDiagnosticsLearning');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const mode = String(arg('mode', 'train')).toLowerCase();
const count = Math.max(1, Math.min(10000, Number(arg('count', 1000)) || 1000));
const defaultName = mode === 'eval'
  ? 'security-diagnostics-eval-holdout.jsonl'
  : 'security-diagnostics-train.jsonl';
const out = path.resolve(arg('out', defaultName));

if (!['train', 'eval'].includes(mode)) {
  throw new Error('security_diagnostics_generator_mode_must_be_train_or_eval');
}

const corpus = mode === 'eval'
  ? buildHoldoutEvalSuite()
  : buildSyntheticCorpus({ count });

const rows = corpus.cases.map(item => JSON.stringify({
  domain: 'security_diagnostics',
  split: mode === 'eval' ? 'eval_holdout' : 'train',
  synthetic: true,
  containsRealUserTelemetry: false,
  record: item
}));

fs.writeFileSync(out, rows.join('\n') + '\n', { encoding: 'utf8', flag: 'wx' });

process.stdout.write(JSON.stringify({
  status: 'ok',
  mode,
  count: rows.length,
  output: out,
  corpusSha256: corpus.corpusSha256,
  containsRealUserTelemetry: false
}) + '\n');
