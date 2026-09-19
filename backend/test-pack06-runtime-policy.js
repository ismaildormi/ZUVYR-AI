'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assertRuntimeRequestAllowed, runtimeStatus } = require('./lib/codeRuntimePolicy');
const { config } = require('./lib/codeStudioRegistry');

for (const operation of ['terminal', 'run', 'dependencies', 'build', 'test', 'deploy']) {
  const expectedStatus =
    config.capabilities[operation]?.status ||
    'code_runtime_disabled';
  assert.throws(
    () => assertRuntimeRequestAllowed({ operation, confirmed: true, sandboxReady: true }),
    error =>
      error.operation === operation &&
      error.code === expectedStatus
  );
}
assert.deepEqual(runtimeStatus().allowedOperations, []);
assert.equal(runtimeStatus().executorConfigured, false);
const policy = fs.readFileSync(path.join(__dirname, 'lib/codeRuntimePolicy.js'), 'utf8');
assert(!policy.includes("require('node:child_process')"));
assert(!policy.includes('spawn('));
assert(!policy.includes('exec('));
console.log('PASS: Code runtime policy remains fail-closed while registry status evolves through Pack078');
