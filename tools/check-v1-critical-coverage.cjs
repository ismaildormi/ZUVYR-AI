'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'v1-critical-coverage.json'), 'utf8'));
const lcovPath = path.resolve(process.argv[2] || 'coverage/v1-critical.lcov');
const baseRef = String(process.argv[3] || process.env.ZUVYR_COVERAGE_BASE_REF || '').trim();

function normalizeSource(value) {
  const text = String(value || '').trim();
  const relative = path.isAbsolute(text) ? path.relative(root, text) : text;
  return relative.replace(/\\/g, '/').replace(/^\.\//, '');
}

function percentage(hit, found) {
  if (!found) return 100;
  return (hit / found) * 100;
}

function parseLcov(text) {
  const records = new Map();
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith('SF:')) {
      current = {
        file: normalizeSource(raw.slice(3)),
        linesFound: 0,
        linesHit: 0,
        functionsFound: 0,
        functionsHit: 0,
        branchesFound: 0,
        branchesHit: 0,
        executableLines: new Map()
      };
      records.set(current.file, current);
      continue;
    }
    if (!current) continue;
    if (raw.startsWith('LF:')) current.linesFound = Number(raw.slice(3)) || 0;
    else if (raw.startsWith('LH:')) current.linesHit = Number(raw.slice(3)) || 0;
    else if (raw.startsWith('FNF:')) current.functionsFound = Number(raw.slice(4)) || 0;
    else if (raw.startsWith('FNH:')) current.functionsHit = Number(raw.slice(4)) || 0;
    else if (raw.startsWith('BRF:')) current.branchesFound = Number(raw.slice(4)) || 0;
    else if (raw.startsWith('BRH:')) current.branchesHit = Number(raw.slice(4)) || 0;
    else if (raw.startsWith('DA:')) {
      const [line, hits] = raw.slice(3).split(',');
      current.executableLines.set(Number(line), Number(hits) || 0);
    } else if (raw === 'end_of_record') current = null;
  }
  return records;
}

function addedLinesForFile(base, rel) {
  if (!base) return new Set();
  let diff;
  try {
    diff = execFileSync('git', ['diff', '--unified=0', '--no-color', `${base}...HEAD`, '--', rel], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024
    });
  } catch (error) {
    const stderr = String(error.stderr || '');
    throw new Error(`critical_coverage_diff_failed:${rel}:${stderr.slice(0, 300)}`);
  }
  const added = new Set();
  let newLine = null;
  for (const line of diff.split(/\r?\n/)) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (newLine === null || line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) {
      added.add(newLine);
      newLine += 1;
    } else if (line.startsWith('-')) {
      // deletion: no new-file line to advance
    } else {
      newLine += 1;
    }
  }
  return added;
}

function assertMinimum(label, actual, minimum, failures) {
  if (actual + 1e-9 < Number(minimum)) {
    failures.push(`${label}: ${actual.toFixed(2)}% < ${Number(minimum).toFixed(2)}%`);
  }
}

if (!fs.existsSync(lcovPath)) throw new Error(`critical_coverage_lcov_missing:${lcovPath}`);
const records = parseLcov(fs.readFileSync(lcovPath, 'utf8'));
const failures = [];
const totals = {
  linesFound: 0, linesHit: 0,
  functionsFound: 0, functionsHit: 0,
  branchesFound: 0, branchesHit: 0
};
let changedExecutableFound = 0;
let changedExecutableHit = 0;

for (const expected of config.files) {
  const rel = normalizeSource(expected.path);
  const record = records.get(rel);
  if (!record) {
    failures.push(`${rel}: missing from LCOV; critical production code was not exercised`);
    continue;
  }

  const linePct = percentage(record.linesHit, record.linesFound);
  const functionPct = percentage(record.functionsHit, record.functionsFound);
  const branchPct = percentage(record.branchesHit, record.branchesFound);
  assertMinimum(`${rel} lines`, linePct, expected.minimum.lines, failures);
  assertMinimum(`${rel} functions`, functionPct, expected.minimum.functions, failures);
  assertMinimum(`${rel} branches`, branchPct, expected.minimum.branches, failures);

  totals.linesFound += record.linesFound;
  totals.linesHit += record.linesHit;
  totals.functionsFound += record.functionsFound;
  totals.functionsHit += record.functionsHit;
  totals.branchesFound += record.branchesFound;
  totals.branchesHit += record.branchesHit;

  const added = addedLinesForFile(baseRef, rel);
  for (const line of added) {
    if (!record.executableLines.has(line)) continue;
    changedExecutableFound += 1;
    if (record.executableLines.get(line) > 0) changedExecutableHit += 1;
  }

  console.log(
    `${rel}: lines=${linePct.toFixed(2)}% functions=${functionPct.toFixed(2)}% branches=${branchPct.toFixed(2)}%`
  );
}

const aggregateLines = percentage(totals.linesHit, totals.linesFound);
const aggregateFunctions = percentage(totals.functionsHit, totals.functionsFound);
const aggregateBranches = percentage(totals.branchesHit, totals.branchesFound);
assertMinimum('aggregate lines', aggregateLines, config.aggregateMinimum.lines, failures);
assertMinimum('aggregate functions', aggregateFunctions, config.aggregateMinimum.functions, failures);
assertMinimum('aggregate branches', aggregateBranches, config.aggregateMinimum.branches, failures);

if (baseRef && changedExecutableFound > 0) {
  const changedPct = percentage(changedExecutableHit, changedExecutableFound);
  assertMinimum(
    `changed executable lines (${changedExecutableHit}/${changedExecutableFound})`,
    changedPct,
    config.aggregateMinimum.changedExecutableLines,
    failures
  );
  console.log(`changed executable lines: ${changedPct.toFixed(2)}% (${changedExecutableHit}/${changedExecutableFound})`);
} else {
  console.log(baseRef
    ? 'changed executable lines: none in the configured critical files'
    : 'changed executable lines: base ref not supplied; per-file/aggregate gates still enforced');
}

console.log(`aggregate: lines=${aggregateLines.toFixed(2)}% functions=${aggregateFunctions.toFixed(2)}% branches=${aggregateBranches.toFixed(2)}%`);

if (failures.length) {
  console.error('V1 critical coverage gate FAILED:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS: V1 critical coverage contract satisfied.');
