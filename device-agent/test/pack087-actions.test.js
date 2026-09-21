'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const config = require('../config.v1.json');
const {
  redactResult,
  detectActionCapabilities,
  executeAction,
  executeUndo
} = require('../src/actionExecutor');
const { runActionWithStop } = require('../src/actionWorker');

(async () => {
  assert.equal(config.version, 'pack-087.device-agent.v1');
  assert.equal(config.actionRuntime.built, true);
  assert.equal(config.actionRuntime.transport, 'outbound_https_pull');
  assert.equal(config.execution.rawIpTrust, false);

  const executorSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'actionExecutor.js'), 'utf8');
  for (const marker of [
    'ZUVYR_SCREEN_TARGET',
    'ZUVYR_POINTER_X',
    'ZUVYR_POINTER_Y',
    'ZUVYR_POINTER_DOWN',
    'ZUVYR_POINTER_UP',
    'ZUVYR_KEYBOARD_TEXT_B64',
    'ZUVYR_APP_TARGET'
  ]) assert(executorSource.includes(marker), marker);
  assert(!executorSource.includes('$i.Save($args[0]'));
  assert(!executorSource.includes('SendKeys]::SendWait($args[0])'));
  assert(!executorSource.includes('Start-Process -FilePath $args[0]'));
  assert(executorSource.includes('[System.Windows.Forms.Clipboard]::Clear()'));
  assert(executorSource.includes('[System.Windows.Forms.Clipboard]::SetText($v)'));
  assert(executorSource.includes('ZUVYR_CLIPBOARD_TEXT_B64'));
  assert(executorSource.includes("'-Sta','-NoProfile','-NonInteractive'"));
  assert(executorSource.includes('Math.min(Number(options?.timeoutMs) || DEFAULT_TIMEOUT_MS, 5000)'));
  assert(!executorSource.includes('[Console]::In.ReadToEnd()'));
  assert(!executorSource.includes('Set-Clipboard -Value'));

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zuvyr-pack087-'));
  const dataRoot = path.join(root, 'data');
  const stateDir = path.join(root, 'state');
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  const env = {
    ...process.env,
    ZUVYR_AGENT_FILE_ROOTS: dataRoot,
    ZUVYR_AGENT_ALLOWED_EXECUTABLES: process.execPath,
    ZUVYR_AGENT_ALLOWED_APPLICATIONS: ''
  };

  try {
    const target = path.join(dataRoot, 'note.txt');
    fs.writeFileSync(target, 'before\n', 'utf8');

    const written = await executeAction({
      type: 'write_file',
      target,
      input: 'after\n'
    }, { stateDir, env });
    assert.equal(written.success, true);
    assert.equal(written.deviceActionExecuted, true);
    assert.match(written.backupRef, /^backup:[0-9a-f-]{36}$/);
    assert.match(written.backupSha256, /^[0-9a-f]{64}$/);
    assert.equal(fs.readFileSync(target, 'utf8'), 'after\n');

    const undone = await executeUndo({
      backupRef: written.backupRef,
      target
    }, { stateDir, env });
    assert.equal(undone.success, true);
    assert.equal(undone.deviceActionExecuted, true);
    assert.equal(fs.readFileSync(target, 'utf8'), 'before\n');

    const secretFile = path.join(dataRoot, 'safe.txt');
    fs.writeFileSync(secretFile, 'Bearer AAAAAAAAAAAAAAAAAAAA\n', 'utf8');
    const read = await executeAction({
      type: 'read_file',
      target: secretFile
    }, { stateDir, env });
    assert.equal(read.success, true);
    assert.equal(read.secretRedacted, true);
    assert(!JSON.stringify(read.result).includes('AAAAAAAAAAAAAAAAAAAA'));
    assert(JSON.stringify(read.result).includes('[REDACTED]'));

    const sensitive = path.join(dataRoot, '.env');
    fs.writeFileSync(sensitive, 'SECRET=value\n', 'utf8');
    const blocked = await executeAction({
      type: 'read_file',
      target: sensitive
    }, { stateDir, env });
    assert.equal(blocked.success, false);
    assert.equal(blocked.errorCode, 'pack087_sensitive_target_blocked');
    assert.equal(blocked.deviceActionExecuted, false);

    const literal = '$(touch should-not-run);&|>';
    const command = await executeAction({
      type: 'run_command',
      target: process.execPath,
      input: JSON.stringify([
        '-e',
        'process.stdout.write(process.argv[1])',
        literal
      ])
    }, { stateDir, env });
    assert.equal(command.success, true);
    assert.equal(command.result.stdout, literal);
    assert.equal(command.deviceActionExecuted, true);

    const deniedCommand = await executeAction({
      type: 'run_command',
      target: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      input: JSON.stringify(['-c','echo unsafe'])
    }, { stateDir, env });
    assert.equal(deniedCommand.success, false);
    assert.equal(deniedCommand.errorCode, 'pack087_shell_executable_not_allowlisted');
    assert.equal(deniedCommand.deviceActionExecuted, false);

    const fullControl = Object.freeze({
      fullControl: true,
      grantMode: 'full_control',
      missionBound: true,
      missionDigest: 'a'.repeat(64)
    });

    const broadTarget = path.join(root, 'full-control-outside-scoped-root.txt');
    const broadWrite = await executeAction({
      ...fullControl,
      type: 'write_file',
      target: broadTarget,
      input: 'full-control\n'
    }, { stateDir, env: { ...process.env } });
    assert.equal(broadWrite.success, true);
    assert.equal(fs.readFileSync(broadTarget, 'utf8'), 'full-control\n');

    const broadCommand = await executeAction({
      ...fullControl,
      type: 'run_command',
      target: process.execPath,
      input: JSON.stringify(['-e','process.stdout.write("full-control-shell")'])
    }, { stateDir, env: { ...process.env } });
    assert.equal(broadCommand.success, true);
    assert.equal(broadCommand.result.stdout, 'full-control-shell');

    const forgedFullControl = await executeAction({
      fullControl: true,
      grantMode: 'full_control',
      missionBound: false,
      missionDigest: 'b'.repeat(64),
      type: 'run_command',
      target: process.execPath,
      input: '[]'
    }, { stateDir, env: { ...process.env, ZUVYR_AGENT_ALLOWED_EXECUTABLES: '' } });
    assert.equal(forgedFullControl.success, false);
    assert.equal(forgedFullControl.errorCode, 'pack087_shell_executable_not_allowlisted');

    const fullSensitive = path.join(root, '.env');
    fs.writeFileSync(fullSensitive, 'SECRET=value\n', 'utf8');
    const fullBlocked = await executeAction({
      ...fullControl,
      type: 'read_file',
      target: fullSensitive
    }, { stateDir, env: { ...process.env } });
    assert.equal(fullBlocked.success, false);
    assert.equal(fullBlocked.errorCode, 'pack087_sensitive_target_blocked');

    const redacted = redactResult({
      password: 'hello',
      nested: { Authorization: 'Bearer ABCDEFGHIJKLMNOPQRST' }
    });
    assert.equal(redacted.secretRedacted, true);
    assert.equal(redacted.result.password, '[REDACTED]');
    assert.equal(redacted.result.nested.Authorization, '[REDACTED]');

    const noConfigCaps = detectActionCapabilities({ env: {}, platform: process.platform });
    assert.equal(noConfigCaps.read_file, false);
    assert.equal(noConfigCaps.write_file, false);
    assert.equal(noConfigCaps.run_command, false);
    assert.equal(noConfigCaps.open_application, false);

    const stopId = crypto.randomUUID();
    let stopPolls = 0;
    let stopAcks = 0;
    const post = async (_stateDir, route, body) => {
      if (route === '/api/device-agent/stop/next') {
        stopPolls += 1;
        return stopPolls >= 1 ? { status: 'success', stop: { id: stopId } } : { status: 'success', stop: null };
      }
      if (route === '/api/device-agent/stop/ack') {
        assert.equal(body.signalId, stopId);
        stopAcks += 1;
        return { status: 'success' };
      }
      throw new Error('unexpected route ' + route);
    };
    const execute = async (_action, { signal }) => new Promise(resolve => {
      const finish = () => resolve(Object.freeze({
        success: false,
        result: { stopped: true },
        errorCode: 'pack087_action_stopped',
        deviceActionExecuted: false,
        backupRef: null,
        backupSha256: null,
        secretRedacted: false
      }));
      if (signal.aborted) finish();
      else signal.addEventListener('abort', finish, { once: true });
    });

    const stopped = await runActionWithStop(stateDir, {
      id: crypto.randomUUID(),
      type: 'run_command',
      target: process.execPath,
      input: '[]'
    }, {
      env,
      stopPollMs: 1,
      post,
      execute
    });
    assert.equal(stopped.success, false);
    assert.equal(stopped.errorCode, 'pack087_action_stopped');
    assert.equal(stopAcks, 1);

    const backupDir = path.join(stateDir, 'backups');
    const metadataFiles = fs.readdirSync(backupDir).filter(name => name.endsWith('.json'));
    assert(metadataFiles.length >= 1);
    if (process.platform !== 'win32') {
      for (const name of metadataFiles) {
        assert.equal(fs.statSync(path.join(backupDir, name)).mode & 0o077, 0);
      }
    }

    console.log('PASS: PACK087 file write creates a private backup and undo restores exact previous bytes');
    console.log('PASS: PACK087 sensitive paths and non-allowlisted shell executables are blocked');
    console.log('PASS: PACK087 command args are passed with shell=false and shell metacharacters stay literal');
    console.log('PASS: PACK087 mission-bound Full Control can use files and executables without manual environment allowlists');
    console.log('PASS: PACK087 Windows screen, pointer, keyboard and app bridges pass values via isolated environment variables');
    console.log('PASS: PACK087 Windows clipboard bridge uses Base64 environment transport, STA native API and a bounded timeout');
    console.log('PASS: PACK087 forged Full Control metadata cannot bypass scoped allowlists and sensitive paths remain blocked');
    console.log('PASS: PACK087 device and backend result paths redact secret-shaped values');
    console.log('PASS: PACK087 independent STOP channel aborts a long-running action and is acknowledged');
    console.log('PASS: PACK087 unsupported/config-missing capabilities fail closed instead of pretending success');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
