'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const command = config.ignoreCommand;

assert.equal(typeof command, 'string');
assert(command.includes('VERCEL_GIT_PREVIOUS_SHA'), 'ignoreCommand must use Vercel previous-success SHA');
assert(!/\bHEAD\^/.test(command), 'ignoreCommand must not depend on HEAD^ being present in a shallow clone');
assert(command.includes('git cat-file -e'), 'ignoreCommand must fail open when the comparison commit is unavailable');
assert(command.includes('-- frontend/'), 'ignoreCommand must scope build relevance to frontend/');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zuvyr-vercel-ignore-'));
function git(...args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
}
function run(previousSha) {
  const env = { ...process.env };
  if (previousSha == null) delete env.VERCEL_GIT_PREVIOUS_SHA;
  else env.VERCEL_GIT_PREVIOUS_SHA = previousSha;
  return spawnSync('sh', ['-c', command], { cwd: dir, env, encoding: 'utf8' }).status;
}

try {
  git('init', '-q');
  git('config', 'user.email', 'ci@zuvyr.local');
  git('config', 'user.name', 'ZUVYR CI');
  fs.mkdirSync(path.join(dir, 'frontend'));
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'frontend', 'app.js'), 'console.log("v1");\n');
  fs.writeFileSync(path.join(dir, 'docs', 'note.md'), 'base\n');
  git('add', 'frontend/app.js', 'docs/note.md');
  git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');

  fs.appendFileSync(path.join(dir, 'docs', 'note.md'), 'docs only\n');
  git('add', 'docs/note.md');
  git('commit', '-qm', 'docs only');
  const docsHead = git('rev-parse', 'HEAD');
  assert.equal(run(base), 0, 'docs-only commit must be ignored');

  fs.appendFileSync(path.join(dir, 'frontend', 'app.js'), 'console.log("v2");\n');
  git('add', 'frontend/app.js');
  git('commit', '-qm', 'frontend change');
  assert.equal(run(docsHead), 1, 'frontend change must continue the Vercel build');

  assert.equal(run(null), 1, 'missing VERCEL_GIT_PREVIOUS_SHA must fail open and build');
  assert.equal(run('0000000000000000000000000000000000000000'), 1, 'unavailable comparison commit must fail open and build');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('PASS Vercel ignored-build command semantics');
