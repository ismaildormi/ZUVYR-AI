begin;

create or replace function public.claim_ip_action_pack087(
  p_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_claim$
declare
  v_action public.ip_actions%rowtype;
  v_confirmation public.ip_confirmations%rowtype;
  v_grant public.ip_permission_grants%rowtype;
  v_attempt uuid := gen_random_uuid();
  v_full_control boolean := false;
begin
  select * into v_action
  from public.ip_actions
  where session_id=p_session_id and status='ready'
  order by created_at,id
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('success',true,'action',null);
  end if;

  if v_action.permission_grant_id is not null then
    select * into v_grant
    from public.ip_permission_grants g
    where g.id=v_action.permission_grant_id
      and g.owner_id=v_action.owner_id
      and g.session_id=v_action.session_id
      and g.explicit_consent=true
      and g.revoked_at is null
      and g.issued_at <= now()
      and g.expires_at > now()
      and v_action.required_scope = any(g.scopes)
    limit 1;
  else
    select * into v_grant
    from public.ip_permission_grants g
    where g.owner_id=v_action.owner_id
      and g.session_id=v_action.session_id
      and g.explicit_consent=true
      and g.revoked_at is null
      and g.issued_at <= now()
      and g.expires_at > now()
      and g.grant_mode='scoped'
      and v_action.required_scope = any(g.scopes)
    order by g.issued_at desc
    limit 1;
  end if;

  if v_grant.id is null then
    update public.ip_actions
      set status='cancelled',error_code='pack087_permission_expired',completed_at=now(),updated_at=now()
      where id=v_action.id;
    return jsonb_build_object('success',false,'error','pack087_permission_expired');
  end if;

  v_full_control := (
    v_grant.grant_mode='full_control'
    and v_grant.mission_digest is not null
    and v_action.permission_grant_id=v_grant.id
    and v_action.mission_digest=v_grant.mission_digest
  );

  if v_grant.grant_mode='full_control' and not v_full_control then
    update public.ip_actions
      set status='cancelled',error_code='pack087_mission_binding_invalid',completed_at=now(),updated_at=now()
      where id=v_action.id;
    return jsonb_build_object('success',false,'error','pack087_mission_binding_invalid');
  end if;

  if v_action.requires_confirmation then
    select * into v_confirmation
    from public.ip_confirmations
    where action_id=v_action.id
    for update;

    if not found
       or v_confirmation.state <> 'approved'
       or v_confirmation.expires_at <= now()
       or v_confirmation.action_digest <> v_action.action_digest then
      update public.ip_actions
        set status='cancelled',error_code='pack087_confirmation_invalid',completed_at=now(),updated_at=now()
        where id=v_action.id;
      return jsonb_build_object('success',false,'error','pack087_confirmation_invalid');
    end if;

    update public.ip_confirmations
      set state='consumed',consumed_at=now()
      where id=v_confirmation.id;
  end if;

  update public.ip_actions
    set status='running',
        attempt_id=v_attempt,
        claimed_at=now(),
        started_at=now(),
        updated_at=now()
    where id=v_action.id;

  insert into public.ip_audit_events(owner_id,session_id,action_id,event_type,details)
  values (
    v_action.owner_id,v_action.session_id,v_action.id,'action_started',
    jsonb_build_object(
      'attemptId',v_attempt,
      'actionType',v_action.action_type,
      'permissionGrantId',v_grant.id,
      'grantMode',v_grant.grant_mode,
      'missionDigest',v_action.mission_digest,
      'fullControl',v_full_control
    )
  );

  return jsonb_build_object(
    'success',true,
    'action',jsonb_build_object(
      'id',v_action.id,
      'attemptId',v_attempt,
      'type',v_action.action_type,
      'scope',v_action.required_scope,
      'risk',v_action.risk,
      'target',v_action.target,
      'input',v_action.input_text,
      'reversible',(v_action.action_type='write_file'),
      'permissionGrantId',v_grant.id,
      'grantMode',v_grant.grant_mode,
      'missionDigest',v_action.mission_digest,
      'missionBound',v_full_control,
      'fullControl',v_full_control
    )
  );
end;
$pack087_claim$;

revoke all on function public.claim_ip_action_pack087(uuid)
  from public,anon,authenticated;
grant execute on function public.claim_ip_action_pack087(uuid)
  to service_role;

comment on function public.claim_ip_action_pack087(uuid) is
  'PACK087 claim authority. Exact-grant mission binding is required for Full Computer Control actions; legacy scoped actions remain compatible.';

commit;
