'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'config', 'v1-critical-coverage.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const outputArg = process.argv[2];
const outputPath = path.resolve(outputArg || path.join(os.tmpdir(), 'zuvyr-v1-critical-coverage.lcov'));

if (!config || config.version !== 'zuvyr-v1-critical-coverage.v1') {
  throw new Error('invalid_v1_critical_coverage_config');
}
if (!Array.isArray(config.files) || !config.files.length || !Array.isArray(config.tests) || !config.tests.length) {
  throw new Error('empty_v1_critical_coverage_contract');
}

for (const entry of config.files) {
  const target = path.join(root, entry.path);
  if (!fs.statSync(target).isFile()) throw new Error(`critical_coverage_source_missing:${entry.path}`);
}
for (const rel of config.tests) {
  const target = path.join(root, rel);
  if (!fs.statSync(target).isFile()) throw new Error(`critical_coverage_test_missing:${rel}`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
try { fs.rmSync(outputPath, { force: true }); } catch (_) {}

const args = [
  '--test',
  '--experimental-test-coverage',
  '--test-concurrency=1',
  '--test-reporter=spec',
  '--test-reporter-destination=stdout',
  '--test-reporter=lcov',
  `--test-reporter-destination=${outputPath}`,
  ...config.files.map(entry => `--test-coverage-include=${entry.path}`),
  ...config.tests
];

const result = spawnSync(process.execPath, args, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'test' },
  windowsHide: true
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 20) {
  throw new Error('v1_critical_coverage_lcov_missing');
}

process.stdout.write(`${outputPath}\n`);
