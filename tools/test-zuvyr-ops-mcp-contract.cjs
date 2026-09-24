'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'zuvyr-ops-mcp', 'index.ts'),
  'utf8'
);

for (const marker of [
  "auth.getUser(token)",
  ".from('profiles')",
  ".select('is_admin')",
  "profile?.is_admin !== true",
  ".from('admin_logs')",
  "RATE_LIMIT_PER_MINUTE = 60",
  ".well-known/oauth-protected-resource",
  "WWW-Authenticate",
  "zuvyr.current_state",
  "zuvyr.remaining_work",
  "zuvyr.health",
  "zuvyr.pack089_status",
  "zuvyr.visual_qa_manifest",
]) {
  assert(source.includes(marker), `Missing required MCP safety marker: ${marker}`);
}

for (const forbidden of [
  'credential_secret_id,',
  "name: 'zuvyr.delete",
  "name: 'zuvyr.deploy",
  "name: 'zuvyr.pay",
  "name: 'zuvyr.refund",
  "name: 'zuvyr.secret",
  "name: 'zuvyr.iam",
]) {
  assert(!source.includes(forbidden), `Forbidden MCP exposure found: ${forbidden}`);
}

const toolDefinitions = [...source.matchAll(/name:\s*'([^']+)'/g)]
  .map(match => match[1])
  .filter(name => name.startsWith('zuvyr.'));
assert.deepStrictEqual(
  [...new Set(toolDefinitions)].sort(),
  [
    'zuvyr.current_state',
    'zuvyr.health',
    'zuvyr.pack089_status',
    'zuvyr.remaining_work',
    'zuvyr.visual_qa_manifest',
  ],
  'MCP tool surface must stay read-only and explicitly bounded'
);

assert(source.includes('secret_fields_returned: false'));
assert(source.includes('mutations: 0'));
assert(source.includes("req.method !== 'POST'"));

console.log('PASS ZUVYR Ops MCP safety contract');
