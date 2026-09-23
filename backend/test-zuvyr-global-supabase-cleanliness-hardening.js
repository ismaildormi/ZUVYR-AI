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
assert(executable.includes('c.relrowsecurity'), 'must target RLS-enabled tables');
assert(executable.includes('not exists ( select 1 from pg_policy'), 'must only add policy when none exists');
assert(executable.includes("'zuvyr_server_only_deny_clients'"), 'must use canonical explicit deny policy');
assert(executable.includes('as permissive for all to anon, authenticated using (false) with check (false)'), 'deny policy contract changed');

assert(executable.includes("con.contype = 'f'"), 'must target foreign keys');
assert(executable.includes('i.indisvalid'), 'must recognize only valid covering indexes');
assert(executable.includes('i.indisready'), 'must recognize only ready covering indexes');
assert(executable.includes('create index if not exists'), 'must create idempotent FK indexes');
assert(executable.includes("'zuvyr_fk_'"), 'must use deterministic ZUVYR FK index namespace');

assert(executable.includes('create or replace function public.zuvyr_runtime_hygiene_audit()'), 'runtime hygiene RPC missing');
assert(executable.includes('security invoker'), 'hygiene RPC must never be SECURITY DEFINER');
assert(executable.includes("'zuvyr-runtime-hygiene.v1'"), 'hygiene receipt version missing');
for (const metric of [
  'rls_no_policy_count',
  'unindexed_fk_count',
  'exposed_security_definer_count'
]) {
  assert(executable.includes(`'${metric}'`), `hygiene metric missing: ${metric}`);
}
assert(executable.includes("has_function_privilege('anon', p.oid, 'execute')"), 'must audit anon SECURITY DEFINER exposure');
assert(executable.includes("has_function_privilege('authenticated', p.oid, 'execute')"), 'must audit authenticated SECURITY DEFINER exposure');
assert(executable.includes('revoke all on function public.zuvyr_runtime_hygiene_audit() from public, anon, authenticated'), 'client RPC execution must be revoked');
assert(executable.includes('grant execute on function public.zuvyr_runtime_hygiene_audit() to service_role'), 'service_role hygiene execution must be preserved');

const tableNova8Exclusions = executable.match(/c\.relname not like 'nova8\\_%' escape '\\'/g) || [];
assert(tableNova8Exclusions.length >= 4, 'RLS/index install and audit passes must exclude NOVA8 tables');
assert(executable.includes("p.proname not like 'nova8\\_%' escape '\\'"), 'SECURITY DEFINER audit must exclude NOVA8 functions');
assert(!/\b(?:alter|drop|delete|truncate|update|insert)\b[^;]*\bnova8_/i.test(executable), 'must not mutate NOVA8');
assert(!/\bdrop\s+(?:table|index|schema|function|policy)\b/i.test(executable), 'hardening must not drop runtime objects');
assert(!/\bdelete\s+from\b/i.test(executable), 'hardening must not delete data');
assert(!/\btruncate\b/i.test(executable), 'hardening must not truncate data');

console.log('PASS ZUVYR global Supabase cleanliness hardening');
