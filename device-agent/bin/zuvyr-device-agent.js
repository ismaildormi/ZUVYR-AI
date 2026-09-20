#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const config = require('../config.v1.json');
const { defaultStateDir, ensureIdentity, publicIdentity, ensureAuthToken } = require('../src/security');
const { installUser, uninstallUser } = require('../src/lifecycle');
const { startSecureAgent } = require('../src/server');

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
    const running = await startSecureAgent({ stateDir: dir, port: Number(option('--port') || config.bind.port) });
    print({ status: 'ready', ...running.runtime, deviceId: running.identity.deviceId, fingerprint: running.identity.fingerprint });
    const cleanup = () => {
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
  if (command === 'self-test') {
    const child = spawn(process.execPath, [path.resolve(__dirname, '..', 'test', 'pack085-device-agent.test.js')], { stdio: 'inherit' });
    child.once('exit', code => process.exit(code || 0));
    return;
  }

  process.stdout.write(
    'ZUVYR Device Agent — PACK085\\n' +
    'Commands: init | install | uninstall [--purge-identity] | start | serve | status | stop | self-test\\n' +
    'All PACK085 computer-control actions remain disabled; pairing is owned by PACK086.\\n'
  );
}
main().catch(error => {
  process.stderr.write(String(error && (error.code || error.stack || error.message) || error) + '\n');
  process.exit(1);
});
