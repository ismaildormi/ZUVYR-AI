'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, 'v1_quality_pack087_undo_authority.sql'),
  'utf8'
);

for (const marker of [
  'create or replace function public.claim_ip_undo_pack087',
  'v_action.permission_grant_id',
  'g.id=v_action.permission_grant_id',
  'g.owner_id=v_action.owner_id',
  'g.session_id=v_action.session_id',
  'g.explicit_consent=true',
  "v_grant.grant_mode='full_control'",
  'v_action.permission_grant_id=v_grant.id',
  'v_action.mission_digest=v_grant.mission_digest',
  'v_action.required_scope = any(v_grant.scopes)',
  "error_code='pack087_undo_authority_mismatch'",
  "'permissionGrantId',case when v_full_control then v_grant.id else null end",
  "'grantMode',case when v_full_control then 'full_control' else 'scoped' end",
  "'missionDigest',case when v_full_control then v_action.mission_digest else null end",
  "'missionBound',v_full_control",
  "'fullControl',v_full_control",
  'revoke all on function public.claim_ip_undo_pack087(uuid)',
  'to service_role'
]) {
  assert(sql.includes(marker), `missing server-authoritative undo marker: ${marker}`);
}

// Undo is recovery of an already-authorized historical action. It must bind to
// that exact grant, but must not silently become impossible only because the
// original time-bounded grant later expired or was revoked.
assert(!sql.includes('and g.revoked_at is null'), 'historical undo must not require an active grant');
assert(!sql.includes('and g.expires_at > now()'), 'historical undo must not require an unexpired grant');

console.log('PASS: PACK087 undo claim derives Full Control authority from the exact historical action/grant/mission/scope.');
console.log('PASS: recovery remains historical while mismatched Full Control authority fails closed.');
