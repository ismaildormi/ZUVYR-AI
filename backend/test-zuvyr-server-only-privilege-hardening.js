'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, '93_zuvyr_server_only_privilege_hardening.sql'),
  'utf8'
);
const executable = sql
  .replace(/--.*$/gm, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

assert(executable.includes('begin;') && executable.includes('commit;'), 'migration must be transaction-scoped');
assert(
  executable.includes('revoke all privileges on table public.conversation_asset_chunks from anon, authenticated;'),
  'client table privileges must be revoked'
);
assert(
  executable.includes('revoke all privileges on sequence public.conversation_asset_chunks_id_seq from anon, authenticated;'),
  'client sequence privileges must be revoked'
);
assert(
  executable.includes('revoke execute on function public.search_conversation_asset_chunks( uuid, uuid[], text, integer ) from public, anon, authenticated;'),
  'client/PUBLIC RPC execute must be revoked'
);
assert(
  executable.includes('grant execute on function public.search_conversation_asset_chunks( uuid, uuid[], text, integer ) to service_role;'),
  'service_role RPC execution must be preserved'
);
assert(
  executable.includes('grant select, insert, update, delete on table public.conversation_asset_chunks to service_role;'),
  'service_role table access must be preserved'
);
assert(
  !/\b(?:alter|drop|create|grant|revoke)\b[^;]*\bnova8_/i.test(executable),
  'ZUVYR hardening must not mutate NOVA8 objects'
);
assert(
  !executable.includes('create policy'),
  'do not silence the advisor by adding a fake deny policy; keep the server-only model explicit through grants + RLS'
);

console.log('PASS ZUVYR server-only privilege hardening');
