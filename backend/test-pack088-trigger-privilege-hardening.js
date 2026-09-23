'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const original = fs.readFileSync(
  path.join(root, '92_pack088_88d_ui_notifications_pause_cancel.sql'),
  'utf8'
);
const hardening = fs.readFileSync(
  path.join(root, '92_pack088_88d_trigger_privilege_hardening.sql'),
  'utf8'
);

for (const fn of [
  'pack088_notify_run_transition',
  'pack088_late_bind_cancel_guard'
]) {
  assert(
    original.includes(`create or replace function public.${fn}()`),
    `PACK088 trigger helper is missing: ${fn}`
  );
  assert(
    /security\s+definer/i.test(original),
    'PACK088 trigger helpers must retain the intended SECURITY DEFINER execution model'
  );
  assert(
    hardening.includes(`revoke execute on function public.${fn}()`),
    `Missing browser-role EXECUTE revoke for ${fn}`
  );
  assert(
    hardening.includes(`grant execute on function public.${fn}()`),
    `Missing service-role EXECUTE grant for ${fn}`
  );
}

assert(
  /from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i.test(hardening),
  'Hardening must revoke EXECUTE from PUBLIC, anon and authenticated'
);
assert(
  /to\s+service_role\s*;/i.test(hardening),
  'Hardening must retain explicit service-role execution authority'
);
assert(
  !/grant\s+execute[\s\S]{0,160}\bto\s+(?:public|anon|authenticated)\b/i.test(hardening),
  'Hardening must never restore direct browser execution authority'
);

console.log('PASS PACK088 trigger privilege hardening');
