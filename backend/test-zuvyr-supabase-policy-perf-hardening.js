'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '93_zuvyr_supabase_policy_perf_hardening.sql'), 'utf8');
const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
const executable = sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

const policyTargets = [
  ['select_own_profile', 'public.profiles'],
  ['update_own_profile', 'public.profiles'],
  ['select_own_jobs', 'public.generation_jobs'],
  ['select_own_chat_feedback', 'public.chat_response_feedback'],
  ['audio_transcript_segments_owner_select', 'public.audio_transcript_segments'],
  ['zuvyr_content_objects_owner_select', 'public.zuvyr_content_objects'],
  ['zuvyr_content_versions_owner_select', 'public.zuvyr_content_versions'],
  ['zuvyr_assets_owner_select', 'public.zuvyr_assets'],
  ['zuvyr_asset_lineage_owner_select', 'public.zuvyr_asset_lineage'],
  ['zuvyr_asset_egress_owner_select', 'public.zuvyr_asset_egress_events'],
  ['service_role_only', 'public.conversation_messages'],
  ['service_role_only', 'public.conversation_assets'],
  ['service_role_only', 'public.disk_monitor_settings'],
  ['service_role_only', 'public.disk_usage_snapshots'],
  ['service_role_only', 'public.disk_maintenance_log'],
  ['service_role_only', 'public.disk_pending_confirmations']
];

for (const [policy, table] of policyTargets) {
  assert(
    executable.includes(`alter policy ${policy} on ${table}`),
    `missing ALTER POLICY ${policy} on ${table}`
  );
}

assert(executable.includes('(select auth.uid())'), 'auth.uid() must use initplan-safe SELECT form');
assert(executable.includes('(select auth.role())'), 'auth.role() must use initplan-safe SELECT form');
assert(
  !/\b(?:alter|drop|create|grant|revoke)\b[^;]*\bnova8_/i.test(executable),
  'ZUVYR migration must not mutate NOVA8 tables'
);

for (const duplicate of [
  'public.zuvyr_library_owner_kind_updated_idx',
  'public.zuvyr_task_steps_run_state_idx'
]) {
  assert(executable.includes(`drop index if exists ${duplicate}`), `duplicate index not removed: ${duplicate}`);
}
for (const keeper of [
  'zuvyr_content_owner_kind_updated_idx',
  'idx_zuvyr_task_steps_claim_ready'
]) {
  assert(!executable.includes(`drop index if exists public.${keeper}`), `canonical keeper index must remain: ${keeper}`);
}

assert(normalized.startsWith('-- zuvyr continuous-improvement hardening'), 'migration must document continuous-improvement scope');
assert(executable.includes('begin;') && executable.includes('commit;'), 'migration must be transaction-scoped');

console.log('PASS ZUVYR Supabase policy performance hardening');
