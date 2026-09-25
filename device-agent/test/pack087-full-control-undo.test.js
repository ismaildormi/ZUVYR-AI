'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { executeAction, executeUndo } = require('../src/actionExecutor');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zuvyr-pack087-full-control-undo-'));
  const scopedRoot = path.join(root, 'scoped');
  const stateDir = path.join(root, 'state');
  fs.mkdirSync(scopedRoot, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  const env = {
    ...process.env,
    ZUVYR_AGENT_FILE_ROOTS: scopedRoot
  };
  const target = path.join(root, 'outside-scoped-root.txt');
  fs.writeFileSync(target, 'before\n', 'utf8');
  const fullControl = {
    fullControl: true,
    grantMode: 'full_control',
    missionBound: true,
    missionDigest: 'c'.repeat(64)
  };

  try {
    const written = await executeAction({
      ...fullControl,
      type: 'write_file',
      target,
      input: 'after\n'
    }, { stateDir, env });

    assert.equal(written.success, true);
    assert.match(written.backupRef, /^backup:[0-9a-f-]{36}$/);
    assert.equal(fs.readFileSync(target, 'utf8'), 'after\n');

    const undone = await executeUndo({
      backupRef: written.backupRef,
      target
    }, { stateDir, env });

    assert.equal(undone.success, true);
    assert.equal(undone.deviceActionExecuted, true);
    assert.equal(fs.readFileSync(target, 'utf8'), 'before\n');

    const backupId = written.backupRef.slice('backup:'.length);
    const metadata = JSON.parse(fs.readFileSync(path.join(stateDir, 'backups', backupId + '.json'), 'utf8'));
    assert.deepEqual(metadata.authority, {
      grantMode: 'full_control',
      missionBound: true,
      fullControl: true,
      missionDigest: 'c'.repeat(64)
    });

    console.log('PASS: PACK087 full-control backup preserves mission-bound authority and exact undo restores outside scoped roots.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
