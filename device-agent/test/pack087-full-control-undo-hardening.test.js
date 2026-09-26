'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { executeAction, executeUndo } = require('../src/actionExecutor');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zuvyr-pack087-full-undo-'));
  const scopedRoot = path.join(root, 'scoped');
  const stateDir = path.join(root, 'state');
  fs.mkdirSync(scopedRoot, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  const scopedEnv = {
    ...process.env,
    ZUVYR_AGENT_FILE_ROOTS: scopedRoot,
    ZUVYR_AGENT_ALLOWED_EXECUTABLES: '',
    ZUVYR_AGENT_ALLOWED_APPLICATIONS: ''
  };
  const fullControl = Object.freeze({
    fullControl: true,
    grantMode: 'full_control',
    missionBound: true,
    missionDigest: 'c'.repeat(64)
  });

  try {
    const outsideTarget = path.join(root, 'outside-scoped-root.txt');
    fs.writeFileSync(outsideTarget, 'before-full-control\n', 'utf8');

    const broadWrite = await executeAction({
      ...fullControl,
      type: 'write_file',
      target: outsideTarget,
      input: 'after-full-control\n'
    }, { stateDir, env: scopedEnv });

    assert.equal(broadWrite.success, true);
    assert.match(broadWrite.backupRef, /^backup:[0-9a-f-]{36}$/);
    assert.equal(fs.readFileSync(outsideTarget, 'utf8'), 'after-full-control\n');

    const exactUndo = await executeUndo({
      backupRef: broadWrite.backupRef,
      target: outsideTarget
    }, { stateDir, env: scopedEnv });

    assert.equal(exactUndo.success, true);
    assert.equal(exactUndo.deviceActionExecuted, true);
    assert.equal(fs.readFileSync(outsideTarget, 'utf8'), 'before-full-control\n');

    const scopedTarget = path.join(scopedRoot, 'scoped.txt');
    fs.writeFileSync(scopedTarget, 'before-scoped\n', 'utf8');
    const scopedWrite = await executeAction({
      type: 'write_file',
      target: scopedTarget,
      input: 'after-scoped\n'
    }, { stateDir, env: scopedEnv });

    assert.equal(scopedWrite.success, true);

    const escapedUndo = await executeUndo({
      backupRef: scopedWrite.backupRef,
      target: outsideTarget
    }, { stateDir, env: scopedEnv });

    assert.equal(escapedUndo.success, false);
    assert.equal(escapedUndo.deviceActionExecuted, false);
    assert.equal(escapedUndo.errorCode, 'pack087_file_scope_denied');
    assert.equal(fs.readFileSync(outsideTarget, 'utf8'), 'before-full-control\n');
    assert.equal(fs.readFileSync(scopedTarget, 'utf8'), 'after-scoped\n');

    console.log('PASS: mission-bound Full Control undo restores the exact out-of-scope target.');
    console.log('PASS: scoped backup authority cannot escape configured file roots during undo.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
