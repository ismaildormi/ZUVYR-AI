'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config.v1.json');
const { ensurePrivateDir, ensureIdentity, ensureAuthToken, agentError } = require('./security');

const KNOWN_RUNTIME_FILES = Object.freeze([
  'install.json',
  'runtime.json',
  'zuvyr-device-agent.cmd',
  'zuvyr-device-agent'
]);

function safeStateDir(value) {
  const resolved = path.resolve(String(value || ''));
  const root = path.parse(resolved).root;
  if (!resolved || resolved === root) throw agentError('device_agent_state_dir_unsafe');
  return resolved;
}

function quoteSh(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function installUser({ stateDir, sourceDir, platform = process.platform, nodePath = process.execPath } = {}) {
  const target = safeStateDir(stateDir);
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

function uninstallUser({ stateDir, purgeIdentity = false } = {}) {
  const target = safeStateDir(stateDir);
  fs.rmSync(path.join(target, 'app'), { recursive: true, force: true });
  for (const name of KNOWN_RUNTIME_FILES) fs.rmSync(path.join(target, name), { force: true });
  if (purgeIdentity === true) {
    fs.rmSync(path.join(target, 'identity.json'), { force: true });
    fs.rmSync(path.join(target, 'auth.token'), { force: true });
  }
  return Object.freeze({
    uninstalled: true,
    identityPreserved: purgeIdentity !== true,
    stateDir: target
  });
}

module.exports = { KNOWN_RUNTIME_FILES, installUser, uninstallUser, safeStateDir };
