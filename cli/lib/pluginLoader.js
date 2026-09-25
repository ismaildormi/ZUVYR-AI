// ZUVYR — cli/lib/pluginLoader.js
//
// First-party CLI plugins under cli/plugins/ are repository-reviewed code.
// Executable npm plugins are a separate legacy developer extension surface:
// they are disabled by default and require explicit enablement plus an exact
// package@version allowlist whose installed package must match package-lock
// integrity and resolve inside this repository's node_modules tree.
// Product Plugins/MCP/Skills remain declarative and are not executed here.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');
const PLUGINS_DIR = path.join(ROOT_DIR, 'cli', 'plugins');
const PLUGIN_NPM_PREFIX = 'rox-cli-plugin-';
const PLUGIN_NAME_RE = /^[a-z0-9][a-z0-9:_-]{0,63}$/i;
const NPM_PLUGIN_ALLOW_RE = /^(rox-cli-plugin-[a-z0-9][a-z0-9._-]{0,100})@([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/i;
const SRI_RE = /^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/;

function envTrue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function isWithin(base, target) {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative)
  );
}

function normalizePluginName(value) {
  const name = String(value || '').trim();
  return PLUGIN_NAME_RE.test(name) ? name : null;
}

function parseNpmAllowlist(value) {
  const entries = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  const unique = [];
  for (const entry of entries) {
    const match = NPM_PLUGIN_ALLOW_RE.exec(entry);
    if (!match) continue;
    const normalized = `${match[1]}@${match[2]}`;
    if (!unique.includes(normalized)) unique.push(normalized);
  }
  return Object.freeze(unique.sort());
}

function npmPluginExecutionPolicy(env = process.env) {
  return Object.freeze({
    enabled: envTrue(env.ZUVYR_CLI_ALLOW_EXECUTABLE_NPM_PLUGINS),
    allowlist: parseNpmAllowlist(env.ZUVYR_CLI_NPM_PLUGIN_ALLOWLIST)
  });
}

function expectedNpmPluginVersion(policy, depName) {
  const prefix = `${depName}@`;
  const entry = policy.allowlist.find(item => item.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
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

function verifyNpmPluginProvenance(depName, expectedVersion, { rootDir = ROOT_DIR } = {}) {
  if (!depName.startsWith(PLUGIN_NPM_PREFIX) || !expectedVersion) {
    throw new Error('npm_plugin_provenance_invalid_request');
  }

  const packageJsonPath = path.join(rootDir, 'package.json');
  const lockPath = path.join(rootDir, 'package-lock.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (!Object.prototype.hasOwnProperty.call(deps, depName)) {
    throw new Error('npm_plugin_not_direct_dependency');
  }

  const lockEntry = lock?.packages?.[`node_modules/${depName}`];
  if (!lockEntry || lockEntry.version !== expectedVersion || !SRI_RE.test(String(lockEntry.integrity || ''))) {
    throw new Error('npm_plugin_lock_provenance_mismatch');
  }

  const nodeModulesDeclared = path.join(rootDir, 'node_modules');
  const pluginDeclared = path.join(nodeModulesDeclared, depName);
  const nodeModulesRoot = fs.realpathSync(nodeModulesDeclared);
  const pluginRoot = fs.realpathSync(pluginDeclared);
  if (!isWithin(nodeModulesRoot, pluginRoot) || pluginRoot === nodeModulesRoot) {
    throw new Error('npm_plugin_realpath_outside_node_modules');
  }

  const installedManifestPath = path.join(pluginRoot, 'package.json');
  const manifestStat = fs.lstatSync(installedManifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
    throw new Error('npm_plugin_manifest_invalid');
  }
  const installed = JSON.parse(fs.readFileSync(installedManifestPath, 'utf8'));
  if (installed.name !== depName || installed.version !== expectedVersion) {
    throw new Error('npm_plugin_installed_version_mismatch');
  }

  const entryPath = fs.realpathSync(require.resolve(depName, { paths: [rootDir] }));
  if (!isWithin(pluginRoot, entryPath) || entryPath === pluginRoot) {
    throw new Error('npm_plugin_entry_outside_package');
  }
  const entryStat = fs.lstatSync(entryPath);
  if (!entryStat.isFile()) throw new Error('npm_plugin_entry_invalid');

  return Object.freeze({
    name: depName,
    version: expectedVersion,
    integrity: lockEntry.integrity,
    packageRoot: pluginRoot,
    entryPath
  });
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

  const realPluginsRoot = fs.realpathSync(PLUGINS_DIR);
  for (const dirName of dirNames) {
    const dir = path.join(PLUGINS_DIR, dirName);
    let stat;
    try { stat = fs.lstatSync(dir); }
    catch (err) {
      warn(`Could not stat cli/plugins/${dirName}/ — skipping: ${err.message}`);
      continue;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;

    const realDir = fs.realpathSync(dir);
    if (!isWithin(realPluginsRoot, realDir) || realDir === realPluginsRoot) {
      warn(`cli/plugins/${dirName}/ resolves outside the reviewed plugin root — skipping.`);
      continue;
    }

    const manifestPath = path.join(realDir, 'plugin.json');
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

    const entryPath = safeLocalEntryPath(realDir, manifest.main || 'index.js');
    if (!entryPath) {
      warn(`Plugin "${name}" has an unsafe main path — skipping.`);
      continue;
    }

    let entryStat;
    let realEntry;
    try {
      entryStat = fs.lstatSync(entryPath);
      realEntry = fs.realpathSync(entryPath);
    } catch (err) {
      warn(`Plugin "${name}" entry is unavailable — skipping: ${err.message}`);
      continue;
    }
    if (!entryStat.isFile() || entryStat.isSymbolicLink() || !isWithin(realDir, realEntry)) {
      warn(`Plugin "${name}" entry is not a reviewed regular file — skipping.`);
      continue;
    }

    let mod;
    try {
      mod = require(realEntry);
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
    warn('Executable npm CLI plugins are disabled by default. To enable a reviewed legacy extension, set ZUVYR_CLI_ALLOW_EXECUTABLE_NPM_PLUGINS=true and allowlist exact package@version entries in ZUVYR_CLI_NPM_PLUGIN_ALLOWLIST.');
    return found;
  }

  for (const depName of pluginDeps) {
    const expectedVersion = expectedNpmPluginVersion(policy, depName);
    if (!expectedVersion) {
      warn(`npm plugin "${depName}" lacks an exact package@version entry in ZUVYR_CLI_NPM_PLUGIN_ALLOWLIST — skipping.`);
      continue;
    }

    let provenance;
    try {
      provenance = verifyNpmPluginProvenance(depName, expectedVersion);
    } catch (err) {
      warn(`npm plugin "${depName}" failed locked provenance verification — skipping: ${err.message}`);
      continue;
    }

    let mod;
    try {
      mod = require(provenance.entryPath);
    } catch (err) {
      warn(`npm plugin "${depName}" passed provenance checks but failed to load (${err.message})`);
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
    found[name] = toEntry(mod, {
      source: `npm:${depName}`,
      version: provenance.version
    });
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
  ROOT_DIR,
  PLUGINS_DIR,
  PLUGIN_NPM_PREFIX,
  normalizePluginName,
  parseNpmAllowlist,
  npmPluginExecutionPolicy,
  expectedNpmPluginVersion,
  safeLocalEntryPath,
  verifyNpmPluginProvenance
};
