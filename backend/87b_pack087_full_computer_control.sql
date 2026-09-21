begin;

alter table public.ip_permission_grants
  add column if not exists grant_mode text not null default 'scoped',
  add column if not exists mission text,
  add column if not exists mission_digest text;

alter table public.ip_actions
  add column if not exists permission_grant_id uuid references public.ip_permission_grants(id) on delete set null,
  add column if not exists mission_digest text;

do $pack087_full_control_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='ip_permission_grants_pack087_mode'
      and conrelid='public.ip_permission_grants'::regclass
  ) then
    alter table public.ip_permission_grants
      add constraint ip_permission_grants_pack087_mode
      check (grant_mode in ('scoped','full_control'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='ip_permission_grants_pack087_mission'
      and conrelid='public.ip_permission_grants'::regclass
  ) then
    alter table public.ip_permission_grants
      add constraint ip_permission_grants_pack087_mission
      check (
        (grant_mode='scoped' and mission is null and mission_digest is null)
        or
        (
          grant_mode='full_control'
          and mission is not null
          and char_length(btrim(mission)) between 1 and 4000
          and mission_digest ~ '^[0-9a-f]{64}$'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='ip_actions_pack087_mission_digest'
      and conrelid='public.ip_actions'::regclass
  ) then
    alter table public.ip_actions
      add constraint ip_actions_pack087_mission_digest
      check (mission_digest is null or mission_digest ~ '^[0-9a-f]{64}$');
  end if;
end
$pack087_full_control_constraints$;

create index if not exists ip_permission_grants_pack087_owner_mode_idx
  on public.ip_permission_grants(owner_id,grant_mode,expires_at desc)
  where revoked_at is null;

create index if not exists ip_actions_pack087_grant_idx
  on public.ip_actions(permission_grant_id,created_at desc)
  where permission_grant_id is not null;

create or replace function public.grant_ip_full_control_pack087(
  p_owner_id uuid,
  p_session_id uuid,
  p_mission text,
  p_mission_digest text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_full_control$
declare
  v_session public.ip_sessions%rowtype;
  v_grant_id uuid;
  v_scopes text[] := array[
    'screen.view',
    'pointer.control',
    'keyboard.type',
    'application.open',
    'clipboard.read',
    'clipboard.write',
    'file.read',
    'file.write',
    'shell.execute'
  ]::text[];
  v_mission text := btrim(coalesce(p_mission,''));
  v_digest text := lower(btrim(coalesce(p_mission_digest,'')));
begin
  select * into v_session
  from public.ip_sessions
  where id=p_session_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'pack087_session_not_found'; end if;
  if v_session.revoked_at is not null or v_session.state in ('stopped','failed') then
    raise exception 'pack087_session_unavailable';
  end if;
  if v_session.token_expires_at is null or v_session.token_expires_at <= now() then
    raise exception 'pack087_session_unavailable';
  end if;

  if not exists (
    select 1 from public.ip_devices d
    where d.id=v_session.device_id
      and d.owner_id=p_owner_id
      and d.status='paired'
      and d.revoked_at is null
  ) then
    raise exception 'pack087_device_not_paired';
  end if;

  if char_length(v_mission) < 1 or char_length(v_mission) > 4000 then
    raise exception 'pack087_mission_invalid';
  end if;
  if v_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'pack087_mission_digest_invalid';
  end if;
  if p_expires_at is null
     or p_expires_at <= now()
     or p_expires_at > now() + interval '15 minutes' then
    raise exception 'pack087_permission_expiry_invalid';
  end if;

  update public.ip_permission_grants
    set revoked_at=coalesce(revoked_at,now())
    where owner_id=p_owner_id
      and session_id=p_session_id
      and revoked_at is null;

  insert into public.ip_permission_grants(
    owner_id,session_id,scopes,explicit_consent,issued_at,expires_at,
    grant_mode,mission,mission_digest
  ) values (
    p_owner_id,p_session_id,v_scopes,true,now(),p_expires_at,
    'full_control',v_mission,v_digest
  ) returning id into v_grant_id;

  update public.ip_sessions
    set execution_enabled=true,
        execution_context_type='device_agent',
        execution_context_id=v_session.device_id::text,
        started_at=coalesce(started_at,now()),
        state=case when state='blocked' then 'ready' else state end,
        updated_at=now()
    where id=p_session_id;

  insert into public.ip_audit_events(owner_id,session_id,event_type,details)
  values (
    p_owner_id,p_session_id,'full_control_granted',
    jsonb_build_object(
      'grantId',v_grant_id,
      'mode','full_control',
      'missionDigest',v_digest,
      'scopes',to_jsonb(v_scopes),
      'expiresAt',p_expires_at
    )
  );

  return jsonb_build_object(
    'success',true,
    'grant_id',v_grant_id,
    'session_id',p_session_id,
    'device_id',v_session.device_id,
    'mode','full_control',
    'mission_digest',v_digest,
    'scopes',to_jsonb(v_scopes),
    'expires_at',p_expires_at,
    'execution_enabled',true
  );
end;
$pack087_full_control$;

create or replace function public.prepare_ip_action_pack087(
  p_owner_id uuid,
  p_session_id uuid,
  p_action_type text,
  p_required_scope text,
  p_risk text,
  p_action_digest text,
  p_target text,
  p_input_text text,
  p_requires_confirmation boolean,
  p_confirmation_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_prepare$
declare
  v_session public.ip_sessions%rowtype;
  v_action_id uuid;
  v_confirmation_id uuid;
  v_grant_id uuid;
  v_mission_digest text;
  v_status text;
begin
  select * into v_session
  from public.ip_sessions
  where id=p_session_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'pack087_session_not_found'; end if;
  if v_session.revoked_at is not null or v_session.state in ('stopped','failed') then
    raise exception 'pack087_session_unavailable';
  end if;

  if not exists (
    select 1 from public.ip_devices d
    where d.id=v_session.device_id
      and d.owner_id=p_owner_id
      and d.status='paired'
      and d.revoked_at is null
  ) then
    raise exception 'pack087_device_not_paired';
  end if;

  select g.id,g.mission_digest
    into v_grant_id,v_mission_digest
  from public.ip_permission_grants g
  where g.owner_id=p_owner_id
    and g.session_id=p_session_id
    and g.explicit_consent=true
    and g.revoked_at is null
    and g.issued_at <= now()
    and g.expires_at > now()
    and p_required_scope = any(g.scopes)
  order by g.issued_at desc
  limit 1;

  if v_grant_id is null then
    raise exception 'pack087_permission_scope_missing';
  end if;

  if p_action_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'pack087_action_digest_invalid';
  end if;

  v_status := case when p_requires_confirmation then 'pending_confirmation' else 'ready' end;

  insert into public.ip_actions(
    owner_id,session_id,action_type,required_scope,risk,status,
    action_digest,target,input_text,requires_confirmation,updated_at,
    permission_grant_id,mission_digest
  ) values (
    p_owner_id,p_session_id,p_action_type,p_required_scope,p_risk,v_status,
    p_action_digest,nullif(p_target,''),p_input_text,coalesce(p_requires_confirmation,false),now(),
    v_grant_id,v_mission_digest
  ) returning id into v_action_id;

  if p_requires_confirmation then
    if p_confirmation_expires_at is null
       or p_confirmation_expires_at <= now()
       or p_confirmation_expires_at > now() + interval '10 minutes' then
      raise exception 'pack087_confirmation_expiry_invalid';
    end if;

    insert into public.ip_confirmations(
      owner_id,session_id,action_id,action_digest,state,expires_at
    ) values (
      p_owner_id,p_session_id,v_action_id,p_action_digest,'pending',p_confirmation_expires_at
    ) returning id into v_confirmation_id;
  end if;

  insert into public.ip_audit_events(owner_id,session_id,action_id,event_type,details)
  values (
    p_owner_id,p_session_id,v_action_id,'action_prepared',
    jsonb_build_object(
      'actionType',p_action_type,
      'requiredScope',p_required_scope,
      'risk',p_risk,
      'requiresConfirmation',coalesce(p_requires_confirmation,false),
      'permissionGrantId',v_grant_id,
      'missionDigest',v_mission_digest
    )
  );

  return jsonb_build_object(
    'success',true,
    'action_id',v_action_id,
    'status',v_status,
    'confirmation_id',v_confirmation_id,
    'permission_grant_id',v_grant_id,
    'mission_digest',v_mission_digest,
    'device_action_executed',false
  );
end;
$pack087_prepare$;

revoke all on function public.grant_ip_full_control_pack087(uuid,uuid,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.grant_ip_full_control_pack087(uuid,uuid,text,text,timestamptz)
  to service_role;

comment on function public.grant_ip_full_control_pack087(uuid,uuid,text,text,timestamptz) is
  'PACK087 mission-bound Full Computer Control preset. Expands one explicit consent into the nine device scopes for at most 15 minutes; STOP/revoke remains independently available.';

comment on column public.ip_permission_grants.mission is
  'User-authorized mission text for mission-bound Full Computer Control grants.';
comment on column public.ip_permission_grants.mission_digest is
  'SHA-256 digest binding the Full Computer Control grant and its actions to the authorized mission.';
comment on column public.ip_actions.permission_grant_id is
  'Permission grant that authorized this device action.';
comment on column public.ip_actions.mission_digest is
  'Mission digest inherited from the active Full Computer Control grant, when present.';

commit;
