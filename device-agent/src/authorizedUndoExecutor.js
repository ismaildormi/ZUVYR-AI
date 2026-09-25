'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { executeUndo: executeLocalUndo } = require('./actionExecutor');

const BACKUP_REF = /^backup:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/i;

function authorityError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function isMissionBoundFullControl(value) {
  return Boolean(
    value &&
    value.fullControl === true &&
    value.grantMode === 'full_control' &&
    value.missionBound === true &&
    UUID.test(String(value.permissionGrantId || '')) &&
    HEX64.test(String(value.missionDigest || ''))
  );
}

function loadBackupMetadata(stateDir, backupRef) {
  const match = BACKUP_REF.exec(String(backupRef || '').trim());
  if (!match) throw authorityError('pack087_backup_ref_invalid');
  const metadataPath = path.join(stateDir, 'backups', match[1].toLowerCase() + '.json');
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (cause) {
    throw authorityError('pack087_backup_not_found');
  }
  if (
    metadata?.version !== 'pack087.file-backup.v1' ||
    String(metadata?.ref || '').toLowerCase() !== `backup:${match[1].toLowerCase()}`
  ) {
    throw authorityError('pack087_backup_invalid');
  }
  return metadata;
}

function assertUndoAuthority(undo, { stateDir } = {}) {
  if (!stateDir) throw authorityError('pack087_state_dir_required');
  const metadata = loadBackupMetadata(stateDir, undo?.backupRef);
  const localFullControl = Boolean(
    metadata?.authority?.fullControl === true &&
    metadata?.authority?.grantMode === 'full_control' &&
    metadata?.authority?.missionBound === true &&
    HEX64.test(String(metadata?.authority?.missionDigest || ''))
  );
  const serverFullControl = isMissionBoundFullControl(undo);

  if (localFullControl !== serverFullControl) {
    throw authorityError('pack087_backup_authority_mismatch');
  }
  if (
    localFullControl &&
    String(metadata.authority.missionDigest).toLowerCase() !== String(undo.missionDigest).toLowerCase()
  ) {
    throw authorityError('pack087_backup_authority_mismatch');
  }

  return Object.freeze({
    fullControl: serverFullControl,
    grantMode: serverFullControl ? 'full_control' : 'scoped',
    missionDigest: serverFullControl ? String(undo.missionDigest).toLowerCase() : null,
    permissionGrantId: serverFullControl ? String(undo.permissionGrantId).toLowerCase() : null
  });
}

async function executeAuthorizedUndo(undo, options = {}) {
  try {
    assertUndoAuthority(undo, options);
    return await executeLocalUndo(undo, options);
  } catch (error) {
    return Object.freeze({
      success: false,
      result: {},
      errorCode: error?.code || 'pack087_backup_authority_invalid',
      deviceActionExecuted: false,
      secretRedacted: false
    });
  }
}

module.exports = {
  isMissionBoundFullControl,
  loadBackupMetadata,
  assertUndoAuthority,
  executeAuthorizedUndo
};
