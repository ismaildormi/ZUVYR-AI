'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { executeAction } = require('../src/actionExecutor');
const {
  isMissionBoundFullControl,
  loadBackupMetadata,
  assertUndoAuthority,
  executeAuthorizedUndo
} = require('../src/authorizedUndoExecutor');

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
    assert.equal(isMissionBoundFullControl(null), false);
    assert.equal(isMissionBoundFullControl({ fullControl: false }), false);
    assert.equal(isMissionBoundFullControl({ ...fullControl, grantMode: 'scoped' }), false);
    assert.equal(isMissionBoundFullControl({ ...fullControl, missionBound: false }), false);
    assert.equal(isMissionBoundFullControl({ ...fullControl, permissionGrantId: 'not-a-uuid' }), false);
    assert.equal(isMissionBoundFullControl({ ...fullControl, missionDigest: 'bad-digest' }), false);
    assert.equal(isMissionBoundFullControl(fullControl), true);

    assert.throws(
      () => assertUndoAuthority({ backupRef: 'backup:11111111-1111-4111-8111-111111111111' }),
      /pack087_state_dir_required/
    );
    assert.throws(
      () => loadBackupMetadata(stateDir, 'bad-ref'),
      /pack087_backup_ref_invalid/
    );
    assert.throws(
      () => loadBackupMetadata(stateDir, 'backup:22222222-2222-4222-8222-222222222222'),
      /pack087_backup_not_found/
    );

    const backupsDir = path.join(stateDir, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const malformedId = '33333333-3333-4333-8333-333333333333';
    const malformedPath = path.join(backupsDir, `${malformedId}.json`);
    fs.writeFileSync(malformedPath, JSON.stringify({
      version: 'wrong-version',
      ref: `backup:${malformedId}`
    }), 'utf8');
    assert.throws(
      () => loadBackupMetadata(stateDir, `backup:${malformedId}`),
      /pack087_backup_invalid/
    );
    fs.writeFileSync(malformedPath, JSON.stringify({
      version: 'pack087.file-backup.v1',
      ref: 'backup:44444444-4444-4444-8444-444444444444'
    }), 'utf8');
    assert.throws(
      () => loadBackupMetadata(stateDir, `backup:${malformedId}`),
      /pack087_backup_invalid/
    );
    fs.rmSync(malformedPath, { force: true });

    const invalidRefResult = await executeAuthorizedUndo({
      backupRef: 'bad-ref',
      target: path.join(scopedRoot, 'unused.txt')
    }, { stateDir, env });
    assert.equal(invalidRefResult.success, false);
    assert.equal(invalidRefResult.errorCode, 'pack087_backup_ref_invalid');
    assert.equal(invalidRefResult.deviceActionExecuted, false);

    const missingBackupResult = await executeAuthorizedUndo({
      backupRef: 'backup:55555555-5555-4555-8555-555555555555',
      target: path.join(scopedRoot, 'unused.txt')
    }, { stateDir, env });
    assert.equal(missingBackupResult.success, false);
    assert.equal(missingBackupResult.errorCode, 'pack087_backup_not_found');

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

    const exactAuthority = assertUndoAuthority({
      ...fullControl,
      backupRef: write.backupRef,
      target: outsideTarget
    }, { stateDir });
    assert.equal(exactAuthority.fullControl, true);
    assert.equal(exactAuthority.grantMode, 'full_control');
    assert.equal(exactAuthority.permissionGrantId, permissionGrantId);
    assert.equal(exactAuthority.missionDigest, missionDigest);

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

    const scopedAuthority = assertUndoAuthority({
      backupRef: scopedWrite.backupRef,
      target: scopedTarget
    }, { stateDir });
    assert.equal(scopedAuthority.fullControl, false);
    assert.equal(scopedAuthority.grantMode, 'scoped');
    assert.equal(scopedAuthority.permissionGrantId, null);
    assert.equal(scopedAuthority.missionDigest, null);

    const scopedUndo = await executeAuthorizedUndo({
      backupRef: scopedWrite.backupRef,
      target: scopedTarget
    }, { stateDir, env });
    assert.equal(scopedUndo.success, true);
    assert.equal(fs.readFileSync(scopedTarget, 'utf8'), 'scoped-before\n');

    console.log('PASS: malformed backup references and metadata fail closed.');
    console.log('PASS: every server Full Control authority field is required and validated.');
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
