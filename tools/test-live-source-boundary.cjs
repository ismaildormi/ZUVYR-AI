'use strict';

const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const archiveNeedles = [
  'ROX-LIVE-CHECKPOINT-HISTORY-',
  'ROX-FRONTEND-EMERGENCY-BACKUP-',
  'logs_backup/'
];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const operationalFiles = new Set([
  'package.json',
  'vercel.json',
  '.railwayignore',
  'backend/Dockerfile'
]);
for (const name of ['railway.json', 'nixpacks.toml', 'Procfile', 'docker-compose.yml', 'compose.yml']) {
  if (fs.existsSync(path.join(root, name))) operationalFiles.add(name);
}
const workflowDir = path.join(root, '.github', 'workflows');
for (const name of fs.readdirSync(workflowDir)) {
  if (/\.ya?ml$/i.test(name)) operationalFiles.add(path.posix.join('.github/workflows', name));
}

for (const rel of operationalFiles) {
  const text = read(rel);
  if (rel === '.railwayignore') continue; // archive names are required here as deny rules.
  for (const needle of archiveNeedles) {
    assert.equal(
      text.includes(needle),
      false,
      `${rel} must not reference archive source ${needle}`
    );
  }
}

const railwayIgnore = read('.railwayignore');
for (const required of [
  'logs/',
  'logs_backup/',
  'ROX-LIVE-CHECKPOINT-HISTORY-*/',
  'ROX-FRONTEND-EMERGENCY-BACKUP-*/',
  '*.zip'
]) {
  assert(railwayIgnore.includes(required), `.railwayignore missing ${required}`);
}

const trackedRuntimeLogs = cp.execFileSync('git', ['ls-files', 'logs/'], {
  cwd: root,
  encoding: 'utf8'
}).trim();
assert.equal(trackedRuntimeLogs, '', 'runtime logs must not be tracked in accepted live source');

assert.equal(
  fs.existsSync(path.join(root, '.github/workflows/qh002-stop-apply.yml')),
  false,
  'temporary write-capable QH002 apply workflow must not survive the audit branch'
);

const packageJson = JSON.parse(read('package.json'));
for (const [name, command] of Object.entries(packageJson.scripts || {})) {
  for (const needle of archiveNeedles) {
    assert.equal(String(command).includes(needle), false, `package script ${name} references ${needle}`);
  }
}

console.log(`PASS: ${operationalFiles.size} active operational manifests do not execute historical archive roots.`);
console.log('PASS: Railway excludes historical checkpoints/backups and runtime logs.');
console.log('PASS: runtime logs are untracked and temporary write-capable audit workflow is absent.');
