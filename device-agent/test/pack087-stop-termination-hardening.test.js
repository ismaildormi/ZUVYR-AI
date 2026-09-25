'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { executeAction } = require('../src/actionExecutor');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(20);
  }
  return predicate();
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

(async () => {
  if (process.platform === 'win32') {
    console.log('SKIP: stubborn-SIGTERM escalation proof is POSIX-specific; Windows requires its own process-tree proof in QH-003.');
    return;
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zuvyr-pack087-stop-'));
  const stateDir = path.join(root, 'state');
  const pidFile = path.join(root, 'child.pid');
  const termFile = path.join(root, 'sigterm-observed.txt');
  fs.mkdirSync(stateDir, { recursive: true });

  let childPid = null;
  try {
    const script = [
      "const fs=require('node:fs');",
      "const pidFile=process.argv[1];",
      "const termFile=process.argv[2];",
      "fs.writeFileSync(pidFile,String(process.pid));",
      "process.on('SIGTERM',()=>{fs.writeFileSync(termFile,'SIGTERM observed\\n');});",
      "setInterval(()=>{},1000);"
    ].join('');

    const controller = new AbortController();
    const fullControl = {
      fullControl: true,
      grantMode: 'full_control',
      missionBound: true,
      missionDigest: 'd'.repeat(64),
      type: 'run_command',
      target: process.execPath,
      input: JSON.stringify(['-e', script, pidFile, termFile])
    };

    const pending = executeAction(fullControl, {
      stateDir,
      env: { ...process.env },
      signal: controller.signal,
      timeoutMs: 5000
    });

    assert.equal(await waitFor(() => fs.existsSync(pidFile)), true, 'child did not publish pid');
    childPid = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.equal(isAlive(childPid), true, 'child must be alive before STOP');

    const stopStarted = Date.now();
    controller.abort();
    const result = await pending;
    const stopElapsedMs = Date.now() - stopStarted;

    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'pack087_action_stopped');
    assert.equal(fs.existsSync(termFile), true, 'child must observe SIGTERM before escalation');
    assert(stopElapsedMs >= 400, `STOP returned before escalation/exit confirmation: ${stopElapsedMs}ms`);
    assert.equal(await waitFor(() => !isAlive(childPid), 1500), true, 'STOP returned while direct child was still alive');

    console.log('PASS: PACK087 STOP waits for real direct-child exit and escalates a stubborn SIGTERM target.');
  } finally {
    if (isAlive(childPid)) {
      try { process.kill(childPid, 'SIGKILL'); } catch (_) {}
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
