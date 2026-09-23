'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, 'zuvyr_global_supabase_cleanliness_hardening_20260923.sql'),
  'utf8'
);
const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
const executable = sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

assert(normalized.startsWith('-- zuvyr global cleanliness hardening'), 'must document global cleanliness scope');
assert(executable.includes("c.relrowsecurity"), 'must target RLS-enabled tables');
assert(executable.includes('not exists ( select 1 from pg_policy'), 'must only add policy when none exists');
assert(executable.includes("'zuvyr_server_only_deny_clients'"), 'must use canonical explicit deny policy');
assert(executable.includes('as permissive for all to anon, authenticated using (false) with check (false)'), 'deny policy contract changed');

assert(executable.includes("con.contype = 'f'"), 'must target foreign keys');
assert(executable.includes('i.indisvalid'), 'must recognize only valid covering indexes');
assert(executable.includes('i.indisready'), 'must recognize only ready covering indexes');
assert(executable.includes('create index if not exists'), 'must create idempotent FK indexes');
assert(executable.includes("'zuvyr_fk_'"), 'must use deterministic ZUVYR FK index namespace');

const nova8Exclusions = executable.match(/c\.relname not like 'nova8\\_%' escape '\\'/g) || [];
assert.equal(nova8Exclusions.length, 2, 'both RLS and FK passes must exclude NOVA8');
assert(!/\b(?:alter|drop|delete|truncate|update|insert)\b[^;]*\bnova8_/i.test(executable), 'must not mutate NOVA8');
assert(!/\bdrop\s+(?:table|index|schema|function|policy)\b/i.test(executable), 'hardening must not drop runtime objects');
assert(!/\bdelete\s+from\b/i.test(executable), 'hardening must not delete data');
assert(!/\btruncate\b/i.test(executable), 'hardening must not truncate data');

console.log('PASS ZUVYR global Supabase cleanliness hardening');
