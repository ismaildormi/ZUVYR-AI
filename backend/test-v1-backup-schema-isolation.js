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

for (const marker of [
  'revoke all privileges on schema %I from public, anon, authenticated, service_role',
  'revoke all privileges on all tables in schema %I from public, anon, authenticated, service_role',
  'revoke all privileges on all sequences in schema %I from public, anon, authenticated, service_role',
  'revoke all privileges on all functions in schema %I from public, anon, authenticated, service_role',
  'alter default privileges for role postgres in schema %I revoke all privileges on tables from public, anon, authenticated, service_role',
  'alter default privileges for role postgres in schema %I revoke all privileges on sequences from public, anon, authenticated, service_role',
  'alter default privileges for role postgres in schema %I revoke all privileges on functions from public, anon, authenticated, service_role',
]) {
  assert(
    executableSql.toLowerCase().includes(marker.toLowerCase()),
    `missing backup isolation contract: ${marker}`
  );
}

for (const forbidden of [
  /\bdrop\s+(table|schema|view|function|sequence)\b/i,
  /\bdelete\s+from\b/i,
  /\btruncate\b/i,
  /\balter\s+table\b/i,
  /\bgrant\b/i,
]) {
  assert(!forbidden.test(executableSql), `destructive or privilege-expanding SQL is forbidden: ${forbidden}`);
}

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

console.log('PASS: V1 backup schemas are isolated by a generic, non-destructive, fail-closed privilege contract.');
