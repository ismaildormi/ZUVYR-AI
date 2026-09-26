'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { executeAction } = require('../src/actionExecutor');
const { executeAuthorizedUndo } = require('../src/authorizedUndoExecutor');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zuvyr-authorized-undo-'));
  const scopedRoot = path.join(root, 'scoped');
  const stateDir = path.join(root, 'state');
  fs.mkdirSync(scopedRoot, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  const env = {
    ...process.env,
    ZUVYR_AGENT_FILE_ROOTS: scopedRoot,
    ZUVYR_AGENT_ALLOWED_EXECUTABLES: '',
    ZUVYR_AGENT_ALLOWED_APPLICATIONS: ''
  };
  const permissionGrantId = '11111111-1111-4111-8111-111111111111';
  const missionDigest = 'c'.repeat(64);
  const fullControl = Object.freeze({
    fullControl: true,
    grantMode: 'full_control',
    missionBound: true,
    permissionGrantId,
    missionDigest
  });

  try {
    const outsideTarget = path.join(root, 'outside.txt');
    fs.writeFileSync(outsideTarget, 'before\n', 'utf8');
    const write = await executeAction({
      ...fullControl,
      type: 'write_file',
      target: outsideTarget,
      input: 'after\n'
    }, { stateDir, env });
    assert.equal(write.success, true);
    assert.equal(fs.readFileSync(outsideTarget, 'utf8'), 'after\n');

    const missingServerAuthority = await executeAuthorizedUndo({
      backupRef: write.backupRef,
      target: outsideTarget
    }, { stateDir, env });
    assert.equal(missingServerAuthority.success, false);
    assert.equal(missingServerAuthority.errorCode, 'pack087_backup_authority_mismatch');
    assert.equal(fs.readFileSync(outsideTarget, 'utf8'), 'after\n');

    const wrongMission = await executeAuthorizedUndo({
      ...fullControl,
      missionDigest: 'd'.repeat(64),
      backupRef: write.backupRef,
      target: outsideTarget
    }, { stateDir, env });
    assert.equal(wrongMission.success, false);
    assert.equal(wrongMission.errorCode, 'pack087_backup_authority_mismatch');
    assert.equal(fs.readFileSync(outsideTarget, 'utf8'), 'after\n');

    const malformedGrant = await executeAuthorizedUndo({
      ...fullControl,
      permissionGrantId: 'not-a-uuid',
      backupRef: write.backupRef,
      target: outsideTarget
    }, { stateDir, env });
    assert.equal(malformedGrant.success, false);
    assert.equal(malformedGrant.errorCode, 'pack087_backup_authority_mismatch');

    const exact = await executeAuthorizedUndo({
      ...fullControl,
      backupRef: write.backupRef,
      target: outsideTarget
    }, { stateDir, env });
    assert.equal(exact.success, true);
    assert.equal(exact.deviceActionExecuted, true);
    assert.equal(fs.readFileSync(outsideTarget, 'utf8'), 'before\n');

    const scopedTarget = path.join(scopedRoot, 'scoped.txt');
    fs.writeFileSync(scopedTarget, 'scoped-before\n', 'utf8');
    const scopedWrite = await executeAction({
      type: 'write_file',
      target: scopedTarget,
      input: 'scoped-after\n'
    }, { stateDir, env });
    assert.equal(scopedWrite.success, true);

    const forgedElevation = await executeAuthorizedUndo({
      ...fullControl,
      backupRef: scopedWrite.backupRef,
      target: scopedTarget
    }, { stateDir, env });
    assert.equal(forgedElevation.success, false);
    assert.equal(forgedElevation.errorCode, 'pack087_backup_authority_mismatch');
    assert.equal(fs.readFileSync(scopedTarget, 'utf8'), 'scoped-after\n');

    const scopedUndo = await executeAuthorizedUndo({
      backupRef: scopedWrite.backupRef,
      target: scopedTarget
    }, { stateDir, env });
    assert.equal(scopedUndo.success, true);
    assert.equal(fs.readFileSync(scopedTarget, 'utf8'), 'scoped-before\n');

    console.log('PASS: out-of-scope undo requires matching server Full Control authority.');
    console.log('PASS: missing/mismatched authority and forged scoped elevation fail closed.');
    console.log('PASS: ordinary scoped undo remains functional without authority widening.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
