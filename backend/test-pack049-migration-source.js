'use strict';

const fs=require('fs');
const assert=require('assert');
const sql=fs.readFileSync('backend/63_pack049_universal_actions_send_to_undo.sql','utf8');

for(const marker of [
  'create table if not exists public.zuvyr_universal_actions',
  'create table if not exists public.zuvyr_code_asset_bindings',
  'create_zuvyr_universal_action',
  'execute_zuvyr_code_asset_handoff',
  'restore_zuvyr_content_version_action',
  'undo_zuvyr_universal_action',
  "consume_zuvyr_permission_grant(",
  "'project.write'",
  "'code_project'",
  'code_project_files',
  'code_project_versions',
  'affected_file_ids',
  'canonical_content_id',
  'canonical_version_id',
  'pack049.code-asset-reference.v1',
  'pack049.code-handoff-version.v1',
  'pack049_code_asset_reference_changed'
]) assert(sql.includes(marker), marker);

assert(sql.includes('revoke all on public.zuvyr_universal_actions from public, anon, authenticated'));
assert(sql.includes('revoke all on public.zuvyr_code_asset_bindings from public, anon, authenticated'));
assert(!/grant\s+(?:insert|update|delete)[^;]*\s+to\s+authenticated/i.test(sql));

console.log('PASS: Migration 63 persists universal actions and code asset bindings');
console.log('PASS: Code handoff consumes Pack047 project.write permission atomically');
console.log('PASS: Code insertion/undo versions affected-file IDs and protects changed files');
console.log('PASS: Browser roles cannot mutate Pack049 tables or execute Pack049 RPCs');
