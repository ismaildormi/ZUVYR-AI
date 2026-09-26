'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { executeAction } = require('../src/actionExecutor');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function waitFor(predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(25);
  }
  return predicate();
}
function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (_) { return false; }
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zuvyr-pack087-tree-'));
  const stateDir = path.join(root, 'state');
  const parentPidFile = path.join(root, 'parent.pid');
  const descendantPidFile = path.join(root, 'descendant.pid');
  const sideEffectFile = path.join(root, 'orphan-side-effect.txt');
  fs.mkdirSync(stateDir, { recursive: true });

  let parentPid = null;
  let descendantPid = null;
  try {
    const descendant = [
      "const fs=require('node:fs');",
      "fs.writeFileSync(process.argv[1],String(process.pid));",
      "process.on('SIGTERM',()=>{});",
      "setTimeout(()=>fs.writeFileSync(process.argv[2],'ORPHANED\\n'),1500);",
      "setInterval(()=>{},1000);"
    ].join('');
    const parent = [
      "const fs=require('node:fs');",
      "const cp=require('node:child_process');",
      "fs.writeFileSync(process.argv[1],String(process.pid));",
      "cp.spawn(process.execPath,['-e',process.argv[4],process.argv[2],process.argv[3]],{stdio:'ignore'});",
      "process.on('SIGTERM',()=>{});",
      "setInterval(()=>{},1000);"
    ].join('');

    const controller = new AbortController();
    const pending = executeAction({
      fullControl: true,
      grantMode: 'full_control',
      missionBound: true,
      missionDigest: 'e'.repeat(64),
      type: 'run_command',
      target: process.execPath,
      input: JSON.stringify(['-e', parent, parentPidFile, descendantPidFile, sideEffectFile, descendant])
    }, {
      stateDir,
      env: { ...process.env },
      signal: controller.signal,
      timeoutMs: 6000
    });

    assert.equal(await waitFor(() => fs.existsSync(parentPidFile) && fs.existsSync(descendantPidFile)), true, 'process tree did not publish pids');
    parentPid = Number(fs.readFileSync(parentPidFile, 'utf8'));
    descendantPid = Number(fs.readFileSync(descendantPidFile, 'utf8'));
    assert.equal(isAlive(parentPid), true, 'parent must be alive before STOP');
    assert.equal(isAlive(descendantPid), true, 'descendant must be alive before STOP');

    controller.abort();
    const result = await pending;
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'pack087_action_stopped');
    assert.equal(await waitFor(() => !isAlive(parentPid), 2500), true, 'parent survived STOP');
    assert.equal(await waitFor(() => !isAlive(descendantPid), 2500), true, 'descendant survived STOP');

    await sleep(1700);
    assert.equal(fs.existsSync(sideEffectFile), false, 'descendant produced an orphan side effect after STOP');
    console.log(`PASS: PACK087 STOP terminates the owned process tree on ${process.platform}.`);
  } finally {
    for (const pid of [descendantPid, parentPid]) {
      if (isAlive(pid)) {
        try { process.kill(pid, 'SIGKILL'); } catch (_) {}
      }
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
