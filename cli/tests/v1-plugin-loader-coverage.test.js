'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ROOT_DIR,
  PLUGINS_DIR,
  discoverPlugins
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
  '__qh_valid_object'
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

  console.log('PASS: local plugin discovery rejects malformed/unreviewed entries and accepts reviewed handlers.');
  console.log('PASS: executable npm discovery stays disabled, exact-allowlisted and provenance-gated.');
} finally {
  fs.writeFileSync(packagePath, originalPackageText, 'utf8');
  cleanFixtures();
}
