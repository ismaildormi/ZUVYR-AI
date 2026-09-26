'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, 'v1_quality_backup_schema_isolation.sql'),
  'utf8'
);

const executableSql = sql
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');

assert.match(
  executableSql,
  /n\.nspname\s+like\s+'zuvyr\\_%\\_backup'\s+escape\s+'\\'/i,
  'archive hardening must target only zuvyr_*_backup schemas'
);

const requiredStatements = [
  'revoke all privileges on schema %I from public, anon, authenticated, service_role',
  'revoke all privileges on all tables in schema %I from public, anon, authenticated, service_role',
  'revoke all privileges on all sequences in schema %I from public, anon, authenticated, service_role',
  'revoke all privileges on all functions in schema %I from public, anon, authenticated, service_role',
];

for (const marker of requiredStatements) {
  assert(
    executableSql.toLowerCase().includes(marker.toLowerCase()),
    `missing backup isolation contract: ${marker}`
  );
}

const dynamicStatements = [...executableSql.matchAll(/execute\s+format\(\s*'([^']+)'/gi)]
  .map(match => match[1].trim().toLowerCase());

assert.equal(dynamicStatements.length, requiredStatements.length, 'only the four reviewed ACL statements are allowed');
assert(dynamicStatements.every(statement => statement.startsWith('revoke all privileges')), 'dynamic SQL must remain revoke-only');
assert(!/alter\s+default\s+privileges/i.test(executableSql), 'targeted isolation must not rely on ineffective per-schema default-privilege revokes');

for (const historicalName of [
  'zuvyr_chat_flow_07_backup',
  'zuvyr_database_12_backup',
  'zuvyr_usage_install_20260908_backup',
]) {
  assert(
    !executableSql.includes(historicalName),
    `hardening must remain generic instead of binding to one historical schema: ${historicalName}`
  );
}

console.log('PASS: V1 backup schemas use a generic, non-destructive schema-ACL isolation contract.');
console.log('PASS: targeted hardening does not rely on ineffective per-schema default-privilege revokes.');
