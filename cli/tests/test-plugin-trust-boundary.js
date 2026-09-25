'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {
  PLUGINS_DIR,
  normalizePluginName,
  parseNpmAllowlist,
  npmPluginExecutionPolicy,
  safeLocalEntryPath,
  discoverPlugins
} = require('../lib/pluginLoader');

assert.equal(npmPluginExecutionPolicy({}).enabled, false);
assert.deepEqual(npmPluginExecutionPolicy({}).allowlist, []);

const policy = npmPluginExecutionPolicy({
  ZUVYR_CLI_ALLOW_EXECUTABLE_NPM_PLUGINS: 'true',
  ZUVYR_CLI_NPM_PLUGIN_ALLOWLIST: 'rox-cli-plugin-safe, not-a-plugin, rox-cli-plugin-safe'
});
assert.equal(policy.enabled, true);
assert.deepEqual(policy.allowlist, ['rox-cli-plugin-safe']);

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

const warnings = [];
const discovered = discoverPlugins(message => warnings.push(message), { env: {} });
assert.ok(discovered.hello, 'repository-reviewed local example plugin should remain available');
assert.equal(discovered.hello.source, 'local:example-hello');

console.log('CLI plugin trust-boundary tests passed.');
