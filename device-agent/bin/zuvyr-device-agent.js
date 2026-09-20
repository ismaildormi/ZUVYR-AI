#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const config = require('../config.v1.json');
const { defaultStateDir, ensureIdentity, publicIdentity, ensureAuthToken } = require('../src/security');
const { installUser, uninstallUser, assertLeastPrivilege } = require('../src/lifecycle');
const { startSecureAgent } = require('../src/server');
const { runOneCycle, runWorker } = require('../src/actionWorker');
const {
  signPairingChallenge,
  saveSession,
  buildSignedSessionRequest,
  clearSession
} = require('../src/pairingSession');

function option(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function has(name) { return process.argv.includes(name); }
function stateDir() { return path.resolve(option('--state-dir') || defaultStateDir()); }
function print(value) { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }

async function stopAgent(dir) {
  const runtime = JSON.parse(fs.readFileSync(path.join(dir, 'runtime.json'), 'utf8'));
  const token = ensureAuthToken(dir);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: runtime.port,
      path: '/v1/shutdown',
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, Host: '127.0.0.1:' + runtime.port },
      timeout: 3000
    }, res => {
      res.resume();
      res.once('end', () => resolve(res.statusCode));
    });
    req.once('timeout', () => req.destroy(new Error('device_agent_stop_timeout')));
    req.once('error', reject);
    req.end();
  });
}

async function main() {
  const command = process.argv[2] || 'help';
  const dir = stateDir();
  if (['install','uninstall','start','serve','init','pair-proof','session-import','session-proof','session-clear','cycle','work'].includes(command)) {
    assertLeastPrivilege();
  }

  if (command === 'init') {
    print({ status: 'success', stateDir: dir, identity: publicIdentity(ensureIdentity(dir)), executionEnabled: false });
    return;
  }
  if (command === 'install') {
    const manifest = installUser({ stateDir: dir, sourceDir: path.resolve(__dirname, '..') });
    print({ status: 'success', install: manifest, executionEnabled: false });
    return;
  }
  if (command === 'uninstall') {
    print({ status: 'success', ...uninstallUser({ stateDir: dir, purgeIdentity: has('--purge-identity') }) });
    return;
  }
  if (command === 'serve') {
    const controller = new AbortController();
    const running = await startSecureAgent({
      stateDir: dir,
      port: Number(option('--port') || config.bind.port),
      onShutdown: () => controller.abort()
    });
    const workerPromise = runWorker(dir, {
      signal: controller.signal,
      onCycle: (error, result) => {
        if (error) {
          process.stderr.write(JSON.stringify({
            component: 'pack087-worker',
            status: 'error',
            code: error.code || error.message || 'pack087_worker_cycle_failed'
          }) + '\n');
        } else if (result && result.kind !== 'idle') {
          process.stdout.write(JSON.stringify({
            component: 'pack087-worker',
            status: 'cycle',
            kind: result.kind,
            id: result.id || null
          }) + '\n');
        }
      }
    }).catch(error => {
      process.stderr.write(JSON.stringify({
        component: 'pack087-worker',
        status: 'fatal',
        code: error.code || error.message || 'pack087_worker_failed'
      }) + '\n');
      controller.abort();
      try { running.server.close(); } catch (_) {}
    });
    void workerPromise;
    print({
      status: 'ready',
      ...running.runtime,
      deviceId: running.identity.deviceId,
      fingerprint: running.identity.fingerprint,
      actionWorker: 'running',
      executionEngineBuilt: true
    });
    const cleanup = () => {
      controller.abort();
      try { fs.rmSync(path.join(dir, 'runtime.json'), { force: true }); } catch (_) {}
    };
    process.once('SIGINT', () => running.server.close(() => { cleanup(); process.exit(0); }));
    process.once('SIGTERM', () => running.server.close(() => { cleanup(); process.exit(0); }));
    running.server.once('close', cleanup);
    return;
  }
  if (command === 'start') {
    ensureIdentity(dir);
    ensureAuthToken(dir);
    const child = spawn(process.execPath, [__filename, 'serve', '--state-dir', dir], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
    print({ status: 'starting', pid: child.pid, requiresAdmin: false, executionEnabled: false });
    return;
  }
  if (command === 'status') {
    const identity = publicIdentity(ensureIdentity(dir));
    let runtime = null;
    try { runtime = JSON.parse(fs.readFileSync(path.join(dir, 'runtime.json'), 'utf8')); } catch (_) {}
    let processAlive = false;
    if (runtime && Number.isInteger(runtime.pid)) {
      try { process.kill(runtime.pid, 0); processAlive = true; } catch (_) {}
    }
    print({ status: 'success', installed: fs.existsSync(path.join(dir, 'install.json')), processAlive, runtime, identity, executionEnabled: false });
    return;
  }
  if (command === 'stop') {
    const code = await stopAgent(dir);
    print({ status: code === 202 ? 'accepted' : 'error', httpStatus: code, executionEnabled: false });
    return;
  }
  if (command === 'pair-proof') {
    const challengeFile = process.argv[3];
    if (!challengeFile) throw new Error('usage: pair-proof <challenge.json>');
    const challenge = JSON.parse(fs.readFileSync(path.resolve(challengeFile), 'utf8'));
    print({ status: 'success', proof: signPairingChallenge(dir, challenge), executionEnabled: false });
    return;
  }
  if (command === 'session-import') {
    const sessionFile = process.argv[3];
    const backendOrigin = option('--backend-origin');
    if (!sessionFile || !backendOrigin) throw new Error('usage: session-import <session.json> --backend-origin https://api.example');
    const session = JSON.parse(fs.readFileSync(path.resolve(sessionFile), 'utf8'));
    print({ status: 'success', session: saveSession(dir, { ...session, backendOrigin }), executionEnabled: false });
    return;
  }
  if (command === 'session-proof') {
    const method = process.argv[3] || 'POST';
    const route = process.argv[4] || '/api/device-agent/heartbeat';
    const bodyFile = process.argv[5];
    const body = bodyFile ? JSON.parse(fs.readFileSync(path.resolve(bodyFile), 'utf8')) : {};
    const proof = buildSignedSessionRequest(dir, { method, path: route, body });
    print({
      status: 'success',
      proof: {
        ...proof,
        headers: { ...proof.headers, Authorization: '[stored-private]' }
      },
      executionEnabled: false
    });
    return;
  }
  if (command === 'session-clear') {
    print({ status: 'success', session: clearSession(dir), executionEnabled: false });
    return;
  }

  if (command === 'cycle') {
    const result = await runOneCycle(dir);
    print({ status: 'success', cycle: result });
    return;
  }
  if (command === 'work') {
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    print({ status: 'running', component: 'pack087-worker', stateDir: dir });
    await runWorker(dir, {
      signal: controller.signal,
      onCycle: (error, result) => {
        if (error) {
          process.stderr.write(JSON.stringify({
            status: 'error',
            code: error.code || error.message || 'pack087_worker_cycle_failed'
          }) + '\n');
        } else if (result && result.kind !== 'idle') {
          process.stdout.write(JSON.stringify({
            status: 'cycle',
            kind: result.kind,
            id: result.id || null
          }) + '\n');
        }
      }
    });
    return;
  }

  if (command === 'self-test') {
    const tests = [
      path.resolve(__dirname, '..', 'test', 'pack085-device-agent.test.js'),
      path.resolve(__dirname, '..', 'test', 'pack086-pairing.test.js'),
      path.resolve(__dirname, '..', 'test', 'pack087-actions.test.js')
    ];
    const runNext = index => {
      if (index >= tests.length) {
        process.exit(0);
        return;
      }
      const child = spawn(process.execPath, [tests[index]], { stdio: 'inherit' });
      child.once('exit', code => {
        if (code) process.exit(code);
        else runNext(index + 1);
      });
      child.once('error', () => process.exit(1));
    };
    runNext(0);
    return;
  }

  process.stdout.write(
    'ZUVYR Device Agent — PACK087\\n' +
    'Commands: init | install | uninstall [--purge-identity] | start | serve | status | stop | pair-proof | session-import | session-proof | session-clear | cycle | work | self-test\\n' +
    'PACK087 action execution is permission-gated, signed-session authenticated, runtime-capability detected, STOP-aware and undoable for file writes.\\n'
  );
}
main().catch(error => {
  process.stderr.write(String(error && (error.code || error.stack || error.message) || error) + '\n');
  process.exit(1);
});
