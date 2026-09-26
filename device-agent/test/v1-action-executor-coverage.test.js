'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  MAX_READ_BYTES,
  MAX_WRITE_BYTES,
  redactResult,
  allowedFileRoots,
  allowedExecutables,
  allowedApplications,
  isMissionBoundFullControl,
  resolveFullControlExecutable,
  resolveFullControlApplication,
  detectActionCapabilities,
  executeAction,
  executeUndo
} = require('../src/actionExecutor');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zuvyr-action-executor-cov-'));
  const scopedRoot = path.join(root, 'scoped');
  const stateDir = path.join(root, 'state');
  fs.mkdirSync(scopedRoot, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  const env = {
    ...process.env,
    ZUVYR_AGENT_FILE_ROOTS: [scopedRoot, scopedRoot].join(path.delimiter),
    ZUVYR_AGENT_ALLOWED_EXECUTABLES: `${process.execPath},${process.execPath}`,
    ZUVYR_AGENT_ALLOWED_APPLICATIONS: `${process.execPath},${process.execPath}`
  };

  try {
    assert.equal(allowedFileRoots(env).length, 1);
    assert.deepEqual(allowedExecutables(env), [process.execPath]);
    assert.deepEqual(allowedApplications(env), [process.execPath]);

    const redacted = redactResult({
      authorization: 'Bearer abcdefghijklmnopqrstuvwxyz',
      nested: [{ api_key: 'sk-secretsecretsecretsecret' }],
      visible: 'ok'
    });
    assert.equal(redacted.secretRedacted, true);
    assert.equal(redacted.result.authorization, '[REDACTED]');
    assert.equal(redacted.result.nested[0].api_key, '[REDACTED]');
    assert.equal(redacted.result.visible, 'ok');

    assert.equal(isMissionBoundFullControl(null), false);
    assert.equal(isMissionBoundFullControl({ fullControl: true }), false);
    assert.equal(isMissionBoundFullControl({
      fullControl: true,
      grantMode: 'full_control',
      missionBound: true,
      missionDigest: 'a'.repeat(64)
    }), true);

    assert.throws(() => resolveFullControlExecutable(''), /pack087_shell_executable_invalid/);
    assert.throws(
      () => resolveFullControlExecutable(path.join(root, 'missing-executable')),
      /pack087_shell_executable_not_found/
    );
    assert.equal(resolveFullControlExecutable(process.execPath), process.execPath);

    assert.throws(() => resolveFullControlApplication(''), /pack087_application_invalid/);
    assert.throws(
      () => resolveFullControlApplication(path.join(root, 'missing-app')),
      /pack087_application_not_found/
    );
    assert.equal(resolveFullControlApplication(process.execPath), process.execPath);

    const capabilities = detectActionCapabilities({ env });
    assert.equal(capabilities.read_file, true);
    assert.equal(capabilities.write_file, true);
    assert.equal(capabilities.run_command, true);
    assert.equal(capabilities.open_application, true);

    await assert.rejects(
      () => executeAction(null, { stateDir, env }),
      /pack087_action_required/
    );
    await assert.rejects(
      () => executeAction({ type: 'read_file' }, { env }),
      /pack087_state_dir_required/
    );

    const textFile = path.join(scopedRoot, 'text.txt');
    fs.writeFileSync(textFile, 'hello world\n', 'utf8');
    const read = await executeAction({ type: 'read_file', target: textFile }, { stateDir, env });
    assert.equal(read.success, true);
    assert.equal(read.result.text, 'hello world\n');

    const binaryFile = path.join(scopedRoot, 'binary.dat');
    fs.writeFileSync(binaryFile, Buffer.from([1, 0, 2]));
    const binaryRead = await executeAction({ type: 'read_file', target: binaryFile }, { stateDir, env });
    assert.equal(binaryRead.success, false);
    assert.equal(binaryRead.errorCode, 'pack087_binary_file_read_blocked');

    const largeReadFile = path.join(scopedRoot, 'large-read.txt');
    fs.writeFileSync(largeReadFile, Buffer.alloc(MAX_READ_BYTES + 1, 65));
    const largeRead = await executeAction({ type: 'read_file', target: largeReadFile }, { stateDir, env });
    assert.equal(largeRead.success, false);
    assert.equal(largeRead.errorCode, 'pack087_file_read_too_large');

    const tooLargeWrite = await executeAction({
      type: 'write_file',
      target: path.join(scopedRoot, 'too-large.txt'),
      input: 'x'.repeat(MAX_WRITE_BYTES + 1)
    }, { stateDir, env });
    assert.equal(tooLargeWrite.success, false);
    assert.equal(tooLargeWrite.errorCode, 'pack087_file_write_too_large');

    const newFile = path.join(scopedRoot, 'new-file.txt');
    const newWrite = await executeAction({
      type: 'write_file',
      target: newFile,
      input: 'created\n'
    }, { stateDir, env });
    assert.equal(newWrite.success, true);
    assert.equal(fs.existsSync(newFile), true);
    const removeNewFile = await executeUndo({
      backupRef: newWrite.backupRef,
      target: newFile
    }, { stateDir, env });
    assert.equal(removeNewFile.success, true);
    assert.equal(fs.existsSync(newFile), false);

    const hashTarget = path.join(scopedRoot, 'hash.txt');
    fs.writeFileSync(hashTarget, 'before-hash\n', 'utf8');
    const hashWrite = await executeAction({
      type: 'write_file',
      target: hashTarget,
      input: 'after-hash\n'
    }, { stateDir, env });
    assert.equal(hashWrite.success, true);
    const backupId = hashWrite.backupRef.slice('backup:'.length);
    fs.writeFileSync(path.join(stateDir, 'backups', `${backupId}.bin`), 'tampered', 'utf8');
    const hashUndo = await executeUndo({ backupRef: hashWrite.backupRef, target: hashTarget }, { stateDir, env });
    assert.equal(hashUndo.success, false);
    assert.equal(hashUndo.errorCode, 'pack087_backup_hash_mismatch');

    const mismatchTarget = path.join(scopedRoot, 'mismatch.txt');
    fs.writeFileSync(mismatchTarget, 'mismatch\n', 'utf8');
    const mismatchUndo = await executeUndo({
      backupRef: hashWrite.backupRef,
      target: mismatchTarget
    }, { stateDir, env });
    assert.equal(mismatchUndo.success, false);
    assert.equal(mismatchUndo.errorCode, 'pack087_backup_target_mismatch');

    const invalidUndo = await executeUndo({ backupRef: 'bad-ref', target: hashTarget }, { stateDir, env });
    assert.equal(invalidUndo.success, false);
    assert.equal(invalidUndo.errorCode, 'pack087_backup_ref_invalid');

    const commandOk = await executeAction({
      type: 'run_command',
      target: process.execPath,
      input: JSON.stringify(['-e', "process.stdout.write('ok')"])
    }, { stateDir, env, timeoutMs: 5000 });
    assert.equal(commandOk.success, true);
    assert.equal(commandOk.result.stdout, 'ok');

    const commandFail = await executeAction({
      type: 'run_command',
      target: process.execPath,
      input: JSON.stringify(['-e', 'process.exit(3)'])
    }, { stateDir, env, timeoutMs: 5000 });
    assert.equal(commandFail.success, false);
    assert.equal(commandFail.errorCode, 'pack087_command_nonzero_exit');
    assert.equal(commandFail.deviceActionExecuted, true);

    const invalidArgs = await executeAction({
      type: 'run_command',
      target: process.execPath,
      input: '{not-json'
    }, { stateDir, env });
    assert.equal(invalidArgs.success, false);
    assert.equal(invalidArgs.errorCode, 'pack087_command_args_invalid');

    const unsupported = await executeAction({ type: 'future_action' }, { stateDir, env });
    assert.equal(unsupported.success, false);
    assert.equal(unsupported.errorCode, 'pack087_action_type_unsupported');

    console.log('PASS: hardened action executor success, failure, backup, command and capability branches are covered.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
