-- ZUVYR V1 quality hardening — PACK087 undo authority binding.
-- Recovery may outlive an active grant, but it must never gain authority from
-- mutable device-local backup metadata alone. The server derives the undo
-- authority from the exact historical action + permission grant that produced
-- the backup. Scoped actions remain scoped. Full-control recovery is accepted
-- only when the original action was mission-bound to that exact grant/digest.

create or replace function public.claim_ip_undo_pack087(
  p_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_undo_claim$
declare
  v_undo public.ip_undo_receipts%rowtype;
  v_action public.ip_actions%rowtype;
  v_grant public.ip_permission_grants%rowtype;
  v_attempt uuid := gen_random_uuid();
  v_full_control boolean := false;
begin
  select * into v_undo
  from public.ip_undo_receipts
  where session_id=p_session_id
    and status='ready'
    and requested_at is not null
  order by requested_at,id
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('success',true,'undo',null);
  end if;

  select * into v_action
  from public.ip_actions
  where id=v_undo.action_id
    and session_id=p_session_id
    and owner_id=v_undo.owner_id
  limit 1;

  if not found then
    update public.ip_undo_receipts
      set status='failed',
          error_code='pack087_undo_action_not_found',
          updated_at=now()
      where id=v_undo.id;
    return jsonb_build_object('success',false,'error','pack087_undo_action_not_found');
  end if;

  if v_action.permission_grant_id is not null then
    select * into v_grant
    from public.ip_permission_grants g
    where g.id=v_action.permission_grant_id
      and g.owner_id=v_action.owner_id
      and g.session_id=v_action.session_id
      and g.explicit_consent=true
    limit 1;
  end if;

  v_full_control := (
    v_grant.id is not null
    and v_grant.grant_mode='full_control'
    and v_grant.mission_digest is not null
    and v_action.permission_grant_id=v_grant.id
    and v_action.mission_digest is not null
    and v_action.mission_digest=v_grant.mission_digest
    and v_action.required_scope = any(v_grant.scopes)
  );

  -- A historical action that names a full-control grant but no longer matches
  -- its immutable mission binding is corruption, not a scoped fallback.
  if v_grant.id is not null
     and v_grant.grant_mode='full_control'
     and not v_full_control then
    update public.ip_undo_receipts
      set status='failed',
          error_code='pack087_undo_authority_mismatch',
          updated_at=now()
      where id=v_undo.id;
    return jsonb_build_object('success',false,'error','pack087_undo_authority_mismatch');
  end if;

  update public.ip_undo_receipts
    set status='running',
        attempt_id=v_attempt,
        claimed_at=now(),
        updated_at=now()
    where id=v_undo.id;

  return jsonb_build_object(
    'success',true,
    'undo',jsonb_build_object(
      'id',v_undo.id,
      'attemptId',v_attempt,
      'actionId',v_undo.action_id,
      'backupRef',v_undo.backup_ref,
      'target',v_undo.target,
      'permissionGrantId',case when v_full_control then v_grant.id else null end,
      'grantMode',case when v_full_control then 'full_control' else 'scoped' end,
      'missionDigest',case when v_full_control then v_action.mission_digest else null end,
      'missionBound',v_full_control,
      'fullControl',v_full_control
    )
  );
end;
$pack087_undo_claim$;

revoke all on function public.claim_ip_undo_pack087(uuid)
  from public,anon,authenticated;
grant execute on function public.claim_ip_undo_pack087(uuid)
  to service_role;

comment on function public.claim_ip_undo_pack087(uuid) is
  'PACK087 V1 hardening: undo authority is derived from the exact historical action/grant; local backup metadata cannot widen recovery scope.';
