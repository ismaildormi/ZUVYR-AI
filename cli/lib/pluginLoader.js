// ZUVYR — cli/lib/pluginLoader.js
//
// First-party CLI plugins under cli/plugins/ are repository-reviewed code.
// Executable npm plugins are a separate legacy developer extension surface:
// they are disabled by default and require BOTH an explicit enable flag and
// an exact package allowlist. Product Plugins/MCP/Skills remain declarative
// and are not executed through this loader.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');
const PLUGINS_DIR = path.join(ROOT_DIR, 'cli', 'plugins');
const PLUGIN_NPM_PREFIX = 'rox-cli-plugin-';
const PLUGIN_NAME_RE = /^[a-z0-9][a-z0-9:_-]{0,63}$/i;

function envTrue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function normalizePluginName(value) {
  const name = String(value || '').trim();
  return PLUGIN_NAME_RE.test(name) ? name : null;
}

function parseNpmAllowlist(value) {
  const names = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  const unique = [];
  for (const name of names) {
    if (!name.startsWith(PLUGIN_NPM_PREFIX)) continue;
    if (!/^rox-cli-plugin-[a-z0-9][a-z0-9._-]{0,100}$/i.test(name)) continue;
    if (!unique.includes(name)) unique.push(name);
  }
  return Object.freeze(unique.sort());
}

function npmPluginExecutionPolicy(env = process.env) {
  return Object.freeze({
    enabled: envTrue(env.ZUVYR_CLI_ALLOW_EXECUTABLE_NPM_PLUGINS),
    allowlist: parseNpmAllowlist(env.ZUVYR_CLI_NPM_PLUGIN_ALLOWLIST)
  });
}

function safeLocalEntryPath(dir, value) {
  const relative = String(value || 'index.js').trim();
  if (!relative || path.isAbsolute(relative) || relative.includes('\0')) return null;
  const candidate = path.resolve(dir, relative);
  const rel = path.relative(path.resolve(dir), candidate);
  if (!rel || rel === '.') return null;
  if (rel.startsWith('..' + path.sep) || rel === '..' || path.isAbsolute(rel)) return null;
  return candidate;
}

/** A valid plugin export is a function, or an object with a function `.handler`. */
function isValidPlugin(mod) {
  return typeof mod === 'function' || (mod && typeof mod.handler === 'function');
}

function toEntry(mod, meta) {
  return {
    handler: typeof mod === 'function' ? mod : mod.handler,
    helpText: typeof mod.helpText === 'function' ? mod.helpText : undefined,
    summary: meta.description || mod.description || `(plugin: ${meta.source})`,
    source: meta.source,
    version: meta.version || mod.version || '0.0.0',
  };
}

function loadLocalPlugins(warn) {
  const found = {};
  if (!fs.existsSync(PLUGINS_DIR)) return found;

  let dirNames;
  try {
    dirNames = fs.readdirSync(PLUGINS_DIR);
  } catch (err) {
    warn(`Could not read cli/plugins/: ${err.message}`);
    return found;
  }

  for (const dirName of dirNames) {
    const dir = path.join(PLUGINS_DIR, dirName);
    let stat;
    try { stat = fs.statSync(dir); }
    catch (err) {
      warn(`Could not stat cli/plugins/${dirName}/ — skipping: ${err.message}`);
      continue;
    }
    if (!stat.isDirectory()) continue;

    const manifestPath = path.join(dir, 'plugin.json');
    if (!fs.existsSync(manifestPath)) {
      warn(`cli/plugins/${dirName}/ has no plugin.json — skipping (not a plugin folder).`);
      continue;
    }

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      warn(`cli/plugins/${dirName}/plugin.json is invalid JSON — skipping: ${err.message}`);
      continue;
    }

    const name = normalizePluginName(manifest.name || dirName);
    if (!name) {
      warn(`cli/plugins/${dirName}/ has an invalid command name — skipping.`);
      continue;
    }

    const entryPath = safeLocalEntryPath(dir, manifest.main || 'index.js');
    if (!entryPath) {
      warn(`Plugin "${name}" has an unsafe main path — skipping.`);
      continue;
    }

    let entryStat;
    try { entryStat = fs.statSync(entryPath); }
    catch (err) {
      warn(`Plugin "${name}" entry is unavailable — skipping: ${err.message}`);
      continue;
    }
    if (!entryStat.isFile()) {
      warn(`Plugin "${name}" entry is not a regular file — skipping.`);
      continue;
    }

    let mod;
    try {
      mod = require(entryPath);
    } catch (err) {
      warn(`Plugin "${name}" (cli/plugins/${dirName}) failed to load — skipping: ${err.message}`);
      continue;
    }

    if (!isValidPlugin(mod)) {
      warn(`Plugin "${name}" (cli/plugins/${dirName}) does not export a function or {handler} — skipping.`);
      continue;
    }

    found[name] = toEntry(mod, {
      description: manifest.description,
      version: manifest.version,
      source: `local:${dirName}`,
    });
  }
  return found;
}

function loadNpmPlugins(warn, env = process.env) {
  const found = {};
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  } catch {
    return found;
  }

  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const pluginDeps = Object.keys(deps).filter((d) => d.startsWith(PLUGIN_NPM_PREFIX));
  if (!pluginDeps.length) return found;

  const policy = npmPluginExecutionPolicy(env);
  if (!policy.enabled) {
    warn('Executable npm CLI plugins are disabled by default. Set ZUVYR_CLI_ALLOW_EXECUTABLE_NPM_PLUGINS=true and an exact ZUVYR_CLI_NPM_PLUGIN_ALLOWLIST only for explicitly trusted local CLI extensions.');
    return found;
  }

  for (const depName of pluginDeps) {
    if (!policy.allowlist.includes(depName)) {
      warn(`npm plugin "${depName}" is not in ZUVYR_CLI_NPM_PLUGIN_ALLOWLIST — skipping.`);
      continue;
    }

    let mod;
    try {
      mod = require(depName);
    } catch (err) {
      warn(`npm plugin "${depName}" is allowlisted but failed to load — run npm install? (${err.message})`);
      continue;
    }

    if (!isValidPlugin(mod)) {
      warn(`npm plugin "${depName}" does not export a function or {handler} — skipping.`);
      continue;
    }

    const name = normalizePluginName(mod.commandName || depName.slice(PLUGIN_NPM_PREFIX.length));
    if (!name) {
      warn(`npm plugin "${depName}" exposes an invalid command name — skipping.`);
      continue;
    }
    found[name] = toEntry(mod, { source: `npm:${depName}` });
  }
  return found;
}

/**
 * Discovers first-party local CLI plugins plus explicitly trusted legacy npm
 * executable plugins. Product Plugins/MCP/Skills never execute through here.
 */
function discoverPlugins(warn = () => {}, { env = process.env } = {}) {
  return { ...loadNpmPlugins(warn, env), ...loadLocalPlugins(warn) };
}

module.exports = {
  discoverPlugins,
  PLUGINS_DIR,
  PLUGIN_NPM_PREFIX,
  normalizePluginName,
  parseNpmAllowlist,
  npmPluginExecutionPolicy,
  safeLocalEntryPath
};
