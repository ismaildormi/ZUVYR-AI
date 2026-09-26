'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  ROOT_DIR,
  PLUGINS_DIR,
  discoverPlugins,
  verifyNpmPluginProvenance
} = require('../lib/pluginLoader');

const fixtureNames = [
  '__qh_file_not_dir',
  '__qh_no_manifest',
  '__qh_bad_json',
  '__qh_invalid_name',
  '__qh_unsafe_main',
  '__qh_missing_entry',
  '__qh_invalid_export',
  '__qh_throwing_entry',
  '__qh_valid_object',
  '__qh_lstat_failure',
  '__qh_realpath_escape'
];
const packagePath = path.join(ROOT_DIR, 'package.json');
const originalPackageText = fs.readFileSync(packagePath, 'utf8');

function cleanFixtures() {
  for (const name of fixtureNames) {
    fs.rmSync(path.join(PLUGINS_DIR, name), { recursive: true, force: true });
  }
}

function makePlugin(name, manifest, source = null) {
  const dir = path.join(PLUGINS_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  if (manifest !== null) {
    fs.writeFileSync(
      path.join(dir, 'plugin.json'),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2),
      'utf8'
    );
  }
  if (source !== null) fs.writeFileSync(path.join(dir, 'index.js'), source, 'utf8');
  return dir;
}

function writeNpmProvenanceFixture(root, {
  packageName = 'rox-cli-plugin-provenance-fixture',
  declaredVersion = '1.2.3',
  lockVersion = '1.2.3',
  installedVersion = '1.2.3'
} = {}) {
  const pluginDir = path.join(root, 'node_modules', packageName);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'qh-provenance-root',
    version: '1.0.0',
    private: true,
    dependencies: { [packageName]: declaredVersion }
  }, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({
    name: 'qh-provenance-root',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {
      '': { name: 'qh-provenance-root', version: '1.0.0', dependencies: { [packageName]: declaredVersion } },
      [`node_modules/${packageName}`]: {
        version: lockVersion,
        integrity: 'sha512-QUJDRA=='
      }
    }
  }, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(pluginDir, 'package.json'), JSON.stringify({
    name: packageName,
    version: installedVersion,
    main: 'index.js'
  }, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(pluginDir, 'index.js'), 'module.exports = () => ({ ok: true });\n', 'utf8');
  return { packageName, pluginDir };
}

try {
  cleanFixtures();
  fs.writeFileSync(path.join(PLUGINS_DIR, '__qh_file_not_dir'), 'not a directory\n', 'utf8');
  makePlugin('__qh_no_manifest', null);
  makePlugin('__qh_bad_json', '{bad-json');
  makePlugin('__qh_invalid_name', { name: '../escape', main: 'index.js' }, 'module.exports = () => {};\n');
  makePlugin('__qh_unsafe_main', { name: 'qh-unsafe-main', main: '../outside.js' });
  makePlugin('__qh_missing_entry', { name: 'qh-missing-entry', main: 'index.js' });
  makePlugin('__qh_invalid_export', { name: 'qh-invalid-export', main: 'index.js' }, 'module.exports = {};\n');
  makePlugin('__qh_throwing_entry', { name: 'qh-throwing-entry', main: 'index.js' }, "throw new Error('fixture-load-failure');\n");
  makePlugin(
    '__qh_valid_object',
    { name: 'qh-valid-object', main: 'index.js', description: 'fixture', version: '1.2.3' },
    "module.exports = { handler: async () => ({ ok: true }), helpText: () => 'help' };\n"
  );

  const localWarnings = [];
  const local = discoverPlugins(message => localWarnings.push(String(message)), { env: {} });
  assert.ok(local.hello, 'existing reviewed example plugin must remain discoverable');
  assert.ok(local['qh-valid-object'], 'valid reviewed object plugin should load');
  assert.equal(local['qh-valid-object'].source, 'local:__qh_valid_object');
  assert.equal(local['qh-valid-object'].version, '1.2.3');
  assert.equal(typeof local['qh-valid-object'].handler, 'function');
  assert.equal(typeof local['qh-valid-object'].helpText, 'function');
  assert(localWarnings.some(value => value.includes('has no plugin.json')));
  assert(localWarnings.some(value => value.includes('invalid JSON')));
  assert(localWarnings.some(value => value.includes('invalid command name')));
  assert(localWarnings.some(value => value.includes('unsafe main path')));
  assert(localWarnings.some(value => value.includes('entry is unavailable')));
  assert(localWarnings.some(value => value.includes('does not export a function or {handler}')));
  assert(localWarnings.some(value => value.includes('failed to load')));

  // Cover fail-closed filesystem branches added by the V1 plugin hardening.
  // These are deterministic fault injections against the reviewed local plugin root;
  // no executable plugin is allowed to load through a filesystem error or path escape.
  const originalReaddirSync = fs.readdirSync;
  try {
    fs.readdirSync = function qhReaddirSync(target, ...args) {
      if (path.resolve(String(target)) === path.resolve(PLUGINS_DIR)) {
        throw new Error('qh-readdir-failure');
      }
      return originalReaddirSync(target, ...args);
    };
    const warnings = [];
    const discovered = discoverPlugins(message => warnings.push(String(message)), { env: {} });
    assert.equal(discovered['qh-valid-object'], undefined);
    assert(warnings.some(value => value.includes('Could not read cli/plugins/')));
  } finally {
    fs.readdirSync = originalReaddirSync;
  }

  const lstatFailureDir = makePlugin(
    '__qh_lstat_failure',
    { name: 'qh-lstat-failure', main: 'index.js' },
    'module.exports = () => ({ unsafe: true });\n'
  );
  const originalLstatSync = fs.lstatSync;
  try {
    fs.lstatSync = function qhLstatSync(target, ...args) {
      if (path.resolve(String(target)) === path.resolve(lstatFailureDir)) {
        throw new Error('qh-lstat-failure');
      }
      return originalLstatSync(target, ...args);
    };
    const warnings = [];
    const discovered = discoverPlugins(message => warnings.push(String(message)), { env: {} });
    assert.equal(discovered['qh-lstat-failure'], undefined);
    assert(warnings.some(value => value.includes('Could not stat cli/plugins/__qh_lstat_failure/')));
  } finally {
    fs.lstatSync = originalLstatSync;
  }

  const realpathEscapeDir = makePlugin(
    '__qh_realpath_escape',
    { name: 'qh-realpath-escape', main: 'index.js' },
    'module.exports = () => ({ unsafe: true });\n'
  );
  const outsideReviewedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zuvyr-local-plugin-outside-'));
  const originalRealpathSync = fs.realpathSync;
  try {
    fs.realpathSync = function qhRealpathSync(target, ...args) {
      if (path.resolve(String(target)) === path.resolve(realpathEscapeDir)) {
        return outsideReviewedRoot;
      }
      return originalRealpathSync(target, ...args);
    };
    const warnings = [];
    const discovered = discoverPlugins(message => warnings.push(String(message)), { env: {} });
    assert.equal(discovered['qh-realpath-escape'], undefined);
    assert(warnings.some(value => value.includes('resolves outside the reviewed plugin root')));
  } finally {
    fs.realpathSync = originalRealpathSync;
    fs.rmSync(outsideReviewedRoot, { recursive: true, force: true });
  }

  const pkg = JSON.parse(originalPackageText);
  pkg.dependencies = {
    ...(pkg.dependencies || {}),
    'rox-cli-plugin-qh-fixture': '1.2.3'
  };
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  const disabledWarnings = [];
  const disabled = discoverPlugins(message => disabledWarnings.push(String(message)), { env: {} });
  assert.equal(disabled['qh-fixture'], undefined);
  assert(disabledWarnings.some(value => value.includes('disabled by default')));

  const noAllowlistWarnings = [];
  discoverPlugins(message => noAllowlistWarnings.push(String(message)), {
    env: { ZUVYR_CLI_ALLOW_EXECUTABLE_NPM_PLUGINS: 'true' }
  });
  assert(noAllowlistWarnings.some(value => value.includes('lacks an exact package@version')));

  const provenanceWarnings = [];
  discoverPlugins(message => provenanceWarnings.push(String(message)), {
    env: {
      ZUVYR_CLI_ALLOW_EXECUTABLE_NPM_PLUGINS: 'true',
      ZUVYR_CLI_NPM_PLUGIN_ALLOWLIST: 'rox-cli-plugin-qh-fixture@1.2.3'
    }
  });
  assert(provenanceWarnings.some(value => value.includes('failed locked provenance verification')));

  const provenanceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zuvyr-npm-provenance-'));
  try {
    const fixture = writeNpmProvenanceFixture(provenanceRoot);
    const verified = verifyNpmPluginProvenance(fixture.packageName, '1.2.3', { rootDir: provenanceRoot });
    assert.equal(verified.name, fixture.packageName);
    assert.equal(verified.version, '1.2.3');
    assert.equal(verified.integrity, 'sha512-QUJDRA==');
    assert.equal(verified.packageRoot, fs.realpathSync(fixture.pluginDir));
    assert.equal(verified.entryPath, fs.realpathSync(path.join(fixture.pluginDir, 'index.js')));

    writeNpmProvenanceFixture(provenanceRoot, { lockVersion: '9.9.9' });
    assert.throws(
      () => verifyNpmPluginProvenance(fixture.packageName, '1.2.3', { rootDir: provenanceRoot }),
      /npm_plugin_lock_provenance_mismatch/
    );

    writeNpmProvenanceFixture(provenanceRoot, { installedVersion: '9.9.9' });
    assert.throws(
      () => verifyNpmPluginProvenance(fixture.packageName, '1.2.3', { rootDir: provenanceRoot }),
      /npm_plugin_installed_version_mismatch/
    );

    if (process.platform !== 'win32') {
      fs.rmSync(fixture.pluginDir, { recursive: true, force: true });
      const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zuvyr-npm-outside-'));
      try {
        fs.writeFileSync(path.join(outsideRoot, 'package.json'), JSON.stringify({
          name: fixture.packageName,
          version: '1.2.3',
          main: 'index.js'
        }), 'utf8');
        fs.writeFileSync(path.join(outsideRoot, 'index.js'), 'module.exports = () => {};\n', 'utf8');
        fs.symlinkSync(outsideRoot, fixture.pluginDir, 'dir');
        assert.throws(
          () => verifyNpmPluginProvenance(fixture.packageName, '1.2.3', { rootDir: provenanceRoot }),
          /npm_plugin_realpath_outside_node_modules/
        );
      } finally {
        fs.rmSync(outsideRoot, { recursive: true, force: true });
      }
    }
  } finally {
    fs.rmSync(provenanceRoot, { recursive: true, force: true });
  }

  console.log('PASS: local plugin discovery rejects malformed/unreviewed entries and accepts reviewed handlers.');
  console.log('PASS: local plugin filesystem failures and realpath escapes fail closed.');
  console.log('PASS: executable npm discovery stays disabled, exact-allowlisted and provenance-gated.');
  console.log('PASS: exact npm provenance validates lock integrity, installed identity, entry realpath and node_modules containment.');
} finally {
  fs.writeFileSync(packagePath, originalPackageText, 'utf8');
  cleanFixtures();
}
