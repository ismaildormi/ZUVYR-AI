'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ROOT_DIR,
  PLUGINS_DIR,
  normalizePluginName,
  parseNpmAllowlist,
  npmPluginExecutionPolicy,
  expectedNpmPluginVersion,
  safeLocalEntryPath,
  verifyNpmPluginProvenance,
  discoverPlugins
} = require('../lib/pluginLoader');

assert.equal(npmPluginExecutionPolicy({}).enabled, false);
assert.deepEqual(npmPluginExecutionPolicy({}).allowlist, []);

const policy = npmPluginExecutionPolicy({
  ZUVYR_CLI_ALLOW_EXECUTABLE_NPM_PLUGINS: 'true',
  ZUVYR_CLI_NPM_PLUGIN_ALLOWLIST: [
    'rox-cli-plugin-safe',
    'not-a-plugin@1.0.0',
    'rox-cli-plugin-safe@1.2.3',
    'rox-cli-plugin-safe@1.2.3',
    'rox-cli-plugin-next@2.0.0-beta.1'
  ].join(',')
});
assert.equal(policy.enabled, true);
assert.deepEqual(policy.allowlist, [
  'rox-cli-plugin-next@2.0.0-beta.1',
  'rox-cli-plugin-safe@1.2.3'
]);
assert.equal(expectedNpmPluginVersion(policy, 'rox-cli-plugin-safe'), '1.2.3');
assert.equal(expectedNpmPluginVersion(policy, 'rox-cli-plugin-missing'), null);
assert.deepEqual(parseNpmAllowlist('rox-cli-plugin-a@1.0.0,rox-cli-plugin-a'), ['rox-cli-plugin-a@1.0.0']);

assert.equal(normalizePluginName('safe-command'), 'safe-command');
assert.equal(normalizePluginName('../escape'), null);
assert.equal(normalizePluginName(''), null);

const firstParty = path.join(PLUGINS_DIR, 'example-hello');
assert.equal(safeLocalEntryPath(firstParty, '../../outside.js'), null);
assert.equal(safeLocalEntryPath(firstParty, '/tmp/outside.js'), null);
assert.equal(
  safeLocalEntryPath(firstParty, 'index.js'),
  path.resolve(firstParty, 'index.js')
);

assert.throws(
  () => verifyNpmPluginProvenance('rox-cli-plugin-missing', '1.0.0', { rootDir: ROOT_DIR }),
  /npm_plugin_not_direct_dependency/,
  'non-dependency executable plugins must never reach require()'
);

const loaderSource = fs.readFileSync(path.join(ROOT_DIR, 'cli', 'lib', 'pluginLoader.js'), 'utf8');
for (const marker of [
  'package-lock.json',
  "lock?.packages?.[`node_modules/${depName}`]",
  'lockEntry.version !== expectedVersion',
  'lockEntry.integrity',
  'fs.realpathSync(nodeModulesDeclared)',
  'fs.realpathSync(pluginDeclared)',
  'installed.name !== depName',
  'installed.version !== expectedVersion',
  "require.resolve(depName, { paths: [rootDir] })",
  'require(provenance.entryPath)'
]) {
  assert(loaderSource.includes(marker), `missing executable-plugin provenance marker: ${marker}`);
}
assert(!loaderSource.includes('mod = require(depName)'), 'unverified package-name require must not return');

const warnings = [];
const discovered = discoverPlugins(message => warnings.push(message), { env: {} });
assert.ok(discovered.hello, 'repository-reviewed local example plugin should remain available');
assert.equal(discovered.hello.source, 'local:example-hello');

console.log('PASS: executable npm plugins require explicit package@exact-version consent.');
console.log('PASS: lockfile integrity, installed manifest, realpath and resolved entry are verified before require().');
console.log('PASS: repository-reviewed local plugins remain available without reopening npm execution.');
