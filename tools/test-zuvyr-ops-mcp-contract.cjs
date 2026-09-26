'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'zuvyr-ops-mcp', 'index.ts'),
  'utf8'
);
const decision = fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'zuvyr', 'OPS_MCP_CORS_AUTHORITY_DECISION_2026-09-25.md'),
  'utf8'
);

for (const marker of [
  "'Access-Control-Allow-Origin': '*'",
  "'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version'",
  "'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'",
  "if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });",
  "if (req.method === 'GET' && url.pathname.endsWith('/.well-known/oauth-protected-resource'))",
  "const header = req.headers.get('authorization') || ''",
  "header.toLowerCase().startsWith('bearer ')",
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
  "'Access-Control-Allow-Credentials'",
  '"Access-Control-Allow-Credentials"',
  "'Set-Cookie'",
  '"Set-Cookie"',
  "req.headers.get('cookie')",
  'req.headers.get("cookie")',
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
assert(
  !/cookie/i.test(
    source
      .replace(/github\.com/gi, '')
      .replace(/credential_secret_id/gi, '')
  ),
  'Owner Ops MCP must not grow ambient cookie authority while wildcard CORS is permitted'
);

for (const marker of [
  'N/A_WITH_EVIDENCE',
  'CORS is not an authority boundary',
  'accepts cookies or any ambient browser credential as authentication',
  'Access-Control-Allow-Credentials: true',
  'mutation/deploy/payment/secret/IAM tool',
  'Bearer tokens stop being revalidated with Supabase Auth',
  'is_admin',
]) {
  assert(decision.includes(marker), `Missing documented CORS authority invariant: ${marker}`);
}

console.log('PASS ZUVYR Ops MCP safety contract');
console.log('PASS wildcard CORS is transport-only: no credentialed CORS, no ambient cookie auth, Bearer+admin remains the authority boundary');
console.log('PASS CORS authority decision is CI-bound and documents the conditions that invalidate wildcard transport compatibility');
