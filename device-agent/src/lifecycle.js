'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const config = require('../config.v1.json');
const { ensurePrivateDir, ensureIdentity, ensureAuthToken, agentError } = require('./security');

const KNOWN_RUNTIME_FILES = Object.freeze([
  'install.json',
  'runtime.json',
  'zuvyr-device-agent.cmd',
  'zuvyr-device-agent'
]);

function isPathInside(base, target) {
  const root = path.resolve(String(base || ''));
  const candidate = path.resolve(String(target || ''));
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative)
  );
}

function assertLeastPrivilege({
  platform = process.platform,
  effectiveUid = typeof process.geteuid === 'function' ? process.geteuid() : null,
  allowElevated = false
} = {}) {
  if (platform !== 'win32' && effectiveUid === 0 && allowElevated !== true) {
    throw agentError('device_agent_elevation_forbidden');
  }
  return true;
}

function safeStateDir(value, {
  platform = process.platform,
  home = os.homedir(),
  allowOutsideHome = false
} = {}) {
  const resolved = path.resolve(String(value || ''));
  const root = path.parse(resolved).root;
  if (!resolved || resolved === root) throw agentError('device_agent_state_dir_unsafe');
  if (allowOutsideHome !== true && !isPathInside(home, resolved)) {
    throw agentError('device_agent_state_dir_outside_user_home');
  }
  return resolved;
}

function runtimeProcessAlive(target) {
  const runtimePath = path.join(target, 'runtime.json');
  if (!fs.existsSync(runtimePath)) return false;
  let runtime;
  try { runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8')); }
  catch (_) { throw agentError('device_agent_runtime_state_invalid'); }
  const pid = Number(runtime && runtime.pid);
  if (!Number.isInteger(pid) || pid <= 0) {
    fs.rmSync(runtimePath, { force: true });
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && error.code === 'EPERM') return true;
    fs.rmSync(runtimePath, { force: true });
    return false;
  }
}

function quoteSh(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function installUser({
  stateDir,
  sourceDir,
  platform = process.platform,
  nodePath = process.execPath,
  home = os.homedir(),
  effectiveUid = typeof process.geteuid === 'function' ? process.geteuid() : null,
  allowElevated = false,
  allowOutsideHome = false
} = {}) {
  assertLeastPrivilege({ platform, effectiveUid, allowElevated });
  const target = safeStateDir(stateDir, { platform, home, allowOutsideHome });
  const source = path.resolve(String(sourceDir || ''));
  if (!fs.existsSync(path.join(source, 'config.v1.json'))) throw agentError('device_agent_install_source_invalid');

  ensurePrivateDir(target);
  ensureIdentity(target);
  ensureAuthToken(target);

  const appDir = path.join(target, 'app');
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.cpSync(source, appDir, {
    recursive: true,
    force: true,
    filter: src => !src.includes(path.sep + 'node_modules' + path.sep)
  });

  let launcher;
  let launcherContent;
  if (platform === 'win32') {
    launcher = path.join(target, 'zuvyr-device-agent.cmd');
    launcherContent = '@echo off\r\n"' + nodePath + '" "%~dp0app\\bin\\zuvyr-device-agent.js" serve --state-dir "%~dp0"\r\n';
  } else {
    launcher = path.join(target, 'zuvyr-device-agent');
    launcherContent = '#!/bin/sh\nexec ' + quoteSh(nodePath) + ' "$(dirname "$0")/app/bin/zuvyr-device-agent.js" serve --state-dir "$(dirname "$0")"\n';
  }
  fs.writeFileSync(launcher, launcherContent, { encoding: 'utf8', mode: 0o700 });
  try { fs.chmodSync(launcher, 0o700); } catch (_) {}

  const manifest = {
    version: config.version,
    protocolVersion: config.protocolVersion,
    installedAt: new Date().toISOString(),
    scope: 'user',
    requiresAdmin: false,
    autoStartEnabled: false,
    platform,
    appDir,
    launcher
  };
  fs.writeFileSync(path.join(target, 'install.json'), JSON.stringify(manifest, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  return Object.freeze(manifest);
}

function uninstallUser({
  stateDir,
  purgeIdentity = false,
  platform = process.platform,
  home = os.homedir(),
  effectiveUid = typeof process.geteuid === 'function' ? process.geteuid() : null,
  allowElevated = false,
  allowOutsideHome = false
} = {}) {
  assertLeastPrivilege({ platform, effectiveUid, allowElevated });
  const target = safeStateDir(stateDir, { platform, home, allowOutsideHome });
  if (runtimeProcessAlive(target)) throw agentError('device_agent_running_stop_first');
  fs.rmSync(path.join(target, 'app'), { recursive: true, force: true });
  for (const name of KNOWN_RUNTIME_FILES) fs.rmSync(path.join(target, name), { force: true });
  fs.rmSync(path.join(target, 'auth.token'), { force: true });
  if (purgeIdentity === true) {
    fs.rmSync(path.join(target, 'identity.json'), { force: true });
  }
  return Object.freeze({
    uninstalled: true,
    identityPreserved: purgeIdentity !== true,
    localTokenRemoved: true,
    stateDir: target
  });
}

module.exports = { KNOWN_RUNTIME_FILES, isPathInside, assertLeastPrivilege, runtimeProcessAlive, installUser, uninstallUser, safeStateDir };
