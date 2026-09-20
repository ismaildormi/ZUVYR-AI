begin;

alter table public.ip_devices
  add column if not exists agent_device_id uuid,
  add column if not exists public_key_pem text,
  add column if not exists key_algorithm text not null default 'Ed25519',
  add column if not exists paired_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists pairing_version bigint not null default 0;

alter table public.ip_sessions
  add column if not exists token_hash text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_client_counter bigint not null default 0,
  add column if not exists permission_scopes text[] not null default array['heartbeat']::text[],
  add column if not exists updated_at timestamptz not null default now();

do $pack086_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='ip_devices_pack086_agent_device_required_when_paired'
      and conrelid='public.ip_devices'::regclass
  ) then
    alter table public.ip_devices
      add constraint ip_devices_pack086_agent_device_required_when_paired
      check (
        status not in ('pending_pairing','paired')
        or (
          agent_device_id is not null
          and public_key_fingerprint ~ '^[0-9a-f]{64}$'
          and public_key_pem is not null
          and length(public_key_pem) between 80 and 4096
          and key_algorithm='Ed25519'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='ip_sessions_pack086_token_hash_format'
      and conrelid='public.ip_sessions'::regclass
  ) then
    alter table public.ip_sessions
      add constraint ip_sessions_pack086_token_hash_format
      check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='ip_sessions_pack086_counter_nonnegative'
      and conrelid='public.ip_sessions'::regclass
  ) then
    alter table public.ip_sessions
      add constraint ip_sessions_pack086_counter_nonnegative
      check (last_client_counter >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='ip_sessions_pack086_scopes_bounded'
      and conrelid='public.ip_sessions'::regclass
  ) then
    alter table public.ip_sessions
      add constraint ip_sessions_pack086_scopes_bounded
      check (
        cardinality(permission_scopes) between 1 and 3
        and permission_scopes <@ array['heartbeat','session_status','session_rotate']::text[]
      );
  end if;
end
$pack086_constraints$;

create unique index if not exists ip_devices_owner_agent_device_pack086_uidx
  on public.ip_devices(owner_id,agent_device_id)
  where agent_device_id is not null;

create unique index if not exists ip_devices_owner_fingerprint_pack086_uidx
  on public.ip_devices(owner_id,public_key_fingerprint)
  where public_key_fingerprint is not null;

create unique index if not exists ip_sessions_token_hash_pack086_uidx
  on public.ip_sessions(token_hash)
  where token_hash is not null;

create index if not exists ip_sessions_device_active_pack086_idx
  on public.ip_sessions(device_id,token_expires_at desc)
  where revoked_at is null;

create table if not exists public.ip_pairing_challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.ip_devices(id) on delete cascade,
  challenge_hash text not null check (challenge_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'pending'
    check (state in ('pending','consumed','expired','revoked')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists ip_pairing_challenges_owner_state_pack086_idx
  on public.ip_pairing_challenges(owner_id,state,expires_at);

create index if not exists ip_pairing_challenges_device_created_pack086_idx
  on public.ip_pairing_challenges(device_id,created_at desc);

alter table public.ip_pairing_challenges enable row level security;

revoke all on table public.ip_pairing_challenges from public,anon,authenticated;
revoke all on table public.ip_devices from public,anon,authenticated;
revoke all on table public.ip_sessions from public,anon,authenticated;

grant select,insert,update on table public.ip_pairing_challenges to service_role;
grant select,insert,update on table public.ip_devices to service_role;
grant select,insert,update on table public.ip_sessions to service_role;

create or replace function public.start_ip_pairing_pack086(
  p_owner_id uuid,
  p_agent_device_id uuid,
  p_display_name text,
  p_public_key_fingerprint text,
  p_public_key_pem text,
  p_challenge_hash text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack086_start$
declare
  v_device public.ip_devices%rowtype;
  v_challenge_id uuid;
  v_name text := left(btrim(coalesce(p_display_name,'')),100);
  v_fp text := lower(btrim(coalesce(p_public_key_fingerprint,'')));
  v_pem text := btrim(coalesce(p_public_key_pem,''));
  v_hash text := lower(btrim(coalesce(p_challenge_hash,'')));
begin
  if p_owner_id is null or p_agent_device_id is null then
    raise exception 'pack086_identity_required';
  end if;
  if length(v_name) < 1 then
    raise exception 'pack086_display_name_invalid';
  end if;
  if v_fp !~ '^[0-9a-f]{64}$' then
    raise exception 'pack086_fingerprint_invalid';
  end if;
  if length(v_pem) < 80 or length(v_pem) > 4096 then
    raise exception 'pack086_public_key_invalid';
  end if;
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'pack086_challenge_hash_invalid';
  end if;
  if p_expires_at is null
     or p_expires_at <= now()
     or p_expires_at > now() + interval '10 minutes' then
    raise exception 'pack086_challenge_expiry_invalid';
  end if;

  select * into v_device
  from public.ip_devices
  where owner_id=p_owner_id and agent_device_id=p_agent_device_id
  for update;

  if found then
    if v_device.status='revoked' or v_device.revoked_at is not null then
      raise exception 'pack086_device_revoked';
    end if;
    if v_device.public_key_fingerprint is not null
       and v_device.public_key_fingerprint <> v_fp then
      raise exception 'pack086_device_key_mismatch';
    end if;
    update public.ip_devices
      set display_name=v_name,
          status='pending_pairing',
          public_key_fingerprint=v_fp,
          public_key_pem=v_pem,
          key_algorithm='Ed25519',
          updated_at=now()
      where id=v_device.id
      returning * into v_device;
  else
    insert into public.ip_devices(
      owner_id,display_name,status,public_key_fingerprint,
      agent_device_id,public_key_pem,key_algorithm
    ) values (
      p_owner_id,v_name,'pending_pairing',v_fp,
      p_agent_device_id,v_pem,'Ed25519'
    )
    returning * into v_device;
  end if;

  update public.ip_pairing_challenges
    set state='expired'
    where owner_id=p_owner_id
      and device_id=v_device.id
      and state='pending';

  insert into public.ip_pairing_challenges(
    owner_id,device_id,challenge_hash,expires_at
  ) values (
    p_owner_id,v_device.id,v_hash,p_expires_at
  ) returning id into v_challenge_id;

  insert into public.ip_audit_events(owner_id,event_type,details)
  values (
    p_owner_id,'pairing_started',
    jsonb_build_object(
      'deviceId',v_device.id,
      'agentDeviceId',p_agent_device_id,
      'fingerprint',v_fp
    )
  );

  return jsonb_build_object(
    'success',true,
    'device_id',v_device.id,
    'challenge_id',v_challenge_id,
    'expires_at',p_expires_at
  );
end;
$pack086_start$;

create or replace function public.complete_ip_pairing_pack086(
  p_owner_id uuid,
  p_challenge_id uuid,
  p_token_hash text,
  p_token_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack086_complete$
declare
  v_challenge public.ip_pairing_challenges%rowtype;
  v_device public.ip_devices%rowtype;
  v_session_id uuid;
  v_hash text := lower(btrim(coalesce(p_token_hash,'')));
begin
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'pack086_token_hash_invalid';
  end if;
  if p_token_expires_at is null
     or p_token_expires_at <= now()
     or p_token_expires_at > now() + interval '15 minutes' then
    raise exception 'pack086_token_expiry_invalid';
  end if;

  select * into v_challenge
  from public.ip_pairing_challenges
  where id=p_challenge_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'pack086_challenge_not_found'; end if;
  if v_challenge.state <> 'pending' then raise exception 'pack086_challenge_not_pending'; end if;
  if v_challenge.expires_at <= now() then
    update public.ip_pairing_challenges set state='expired' where id=v_challenge.id;
    raise exception 'pack086_challenge_expired';
  end if;

  select * into v_device
  from public.ip_devices
  where id=v_challenge.device_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'pack086_device_not_found'; end if;
  if v_device.status='revoked' or v_device.revoked_at is not null then
    raise exception 'pack086_device_revoked';
  end if;
  if v_device.status <> 'pending_pairing' then
    raise exception 'pack086_device_not_pending';
  end if;

  update public.ip_pairing_challenges
    set state='consumed',consumed_at=now()
    where id=v_challenge.id;

  update public.ip_sessions
    set revoked_at=coalesce(revoked_at,now()),
        stopped_at=coalesce(stopped_at,now()),
        state='stopped',
        token_hash=null,
        token_expires_at=now(),
        updated_at=now()
    where device_id=v_device.id
      and revoked_at is null;

  update public.ip_devices
    set status='paired',
        paired_at=coalesce(paired_at,now()),
        pairing_version=pairing_version+1,
        updated_at=now()
    where id=v_device.id;

  insert into public.ip_sessions(
    owner_id,device_id,state,execution_enabled,
    token_hash,token_expires_at,last_client_counter,
    permission_scopes,started_at,updated_at
  ) values (
    p_owner_id,v_device.id,'ready',false,
    v_hash,p_token_expires_at,0,
    array['heartbeat','session_status','session_rotate']::text[],now(),now()
  ) returning id into v_session_id;

  insert into public.ip_audit_events(owner_id,session_id,event_type,details)
  values (
    p_owner_id,v_session_id,'pairing_completed',
    jsonb_build_object(
      'deviceId',v_device.id,
      'scopes',jsonb_build_array('heartbeat','session_status','session_rotate')
    )
  );

  return jsonb_build_object(
    'success',true,
    'device_id',v_device.id,
    'session_id',v_session_id,
    'token_expires_at',p_token_expires_at,
    'scopes',jsonb_build_array('heartbeat','session_status','session_rotate'),
    'execution_enabled',false
  );
end;
$pack086_complete$;

create or replace function public.rotate_ip_session_token_pack086(
  p_owner_id uuid,
  p_session_id uuid,
  p_expected_token_hash text,
  p_token_hash text,
  p_token_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack086_rotate$
declare
  v_session public.ip_sessions%rowtype;
  v_device public.ip_devices%rowtype;
  v_hash text := lower(btrim(coalesce(p_token_hash,'')));
begin
  if v_hash !~ '^[0-9a-f]{64}
     or p_token_expires_at <= now()
     or p_token_expires_at > now() + interval '15 minutes' then
    raise exception 'pack086_token_expiry_invalid';
  end if;

  select * into v_session
  from public.ip_sessions
  where id=p_session_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'pack086_session_not_found'; end if;
  if v_session.revoked_at is not null or v_session.state in ('stopped','failed') then
    raise exception 'pack086_session_revoked';
  end if;
  if v_session.token_hash is null
     or v_session.token_hash <> lower(btrim(p_expected_token_hash))
     or v_session.token_expires_at is null
     or v_session.token_expires_at <= now() then
    raise exception 'pack086_token_invalid';
  end if;

  select * into v_device
  from public.ip_devices
  where id=v_session.device_id and owner_id=p_owner_id
  for update;

  if not found
     or v_device.status <> 'paired'
     or v_device.revoked_at is not null then
    raise exception 'pack086_device_not_paired';
  end if;

  update public.ip_sessions
    set token_hash=v_hash,
        token_expires_at=p_token_expires_at,
        last_client_counter=0,
        updated_at=now()
    where id=v_session.id;

  insert into public.ip_audit_events(owner_id,session_id,event_type,details)
  values (
    p_owner_id,v_session.id,'session_token_rotated',
    jsonb_build_object(
      'deviceId',v_session.device_id,
      'scopes',to_jsonb(v_session.permission_scopes)
    )
  );

  return jsonb_build_object(
    'success',true,
    'device_id',v_session.device_id,
    'session_id',v_session.id,
    'token_expires_at',p_token_expires_at,
    'scopes',to_jsonb(v_session.permission_scopes),
    'execution_enabled',false
  );
end;
$pack086_rotate$;

 then
    raise exception 'pack086_token_hash_invalid';
  end if;
  if lower(btrim(coalesce(p_expected_token_hash,''))) !~ '^[0-9a-f]{64}
     or p_token_expires_at <= now()
     or p_token_expires_at > now() + interval '15 minutes' then
    raise exception 'pack086_token_expiry_invalid';
  end if;

  select * into v_session
  from public.ip_sessions
  where id=p_session_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'pack086_session_not_found'; end if;
  if v_session.revoked_at is not null or v_session.state in ('stopped','failed') then
    raise exception 'pack086_session_revoked';
  end if;

  select * into v_device
  from public.ip_devices
  where id=v_session.device_id and owner_id=p_owner_id
  for update;

  if not found
     or v_device.status <> 'paired'
     or v_device.revoked_at is not null then
    raise exception 'pack086_device_not_paired';
  end if;

  update public.ip_sessions
    set token_hash=v_hash,
        token_expires_at=p_token_expires_at,
        last_client_counter=0,
        updated_at=now()
    where id=v_session.id;

  insert into public.ip_audit_events(owner_id,session_id,event_type,details)
  values (
    p_owner_id,v_session.id,'session_token_rotated',
    jsonb_build_object(
      'deviceId',v_session.device_id,
      'scopes',to_jsonb(v_session.permission_scopes)
    )
  );

  return jsonb_build_object(
    'success',true,
    'device_id',v_session.device_id,
    'session_id',v_session.id,
    'token_expires_at',p_token_expires_at,
    'scopes',to_jsonb(v_session.permission_scopes),
    'execution_enabled',false
  );
end;
$pack086_rotate$;

 then
    raise exception 'pack086_expected_token_hash_invalid';
  end if;
  if p_token_expires_at is null
     or p_token_expires_at <= now()
     or p_token_expires_at > now() + interval '15 minutes' then
    raise exception 'pack086_token_expiry_invalid';
  end if;

  select * into v_session
  from public.ip_sessions
  where id=p_session_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'pack086_session_not_found'; end if;
  if v_session.revoked_at is not null or v_session.state in ('stopped','failed') then
    raise exception 'pack086_session_revoked';
  end if;

  select * into v_device
  from public.ip_devices
  where id=v_session.device_id and owner_id=p_owner_id
  for update;

  if not found
     or v_device.status <> 'paired'
     or v_device.revoked_at is not null then
    raise exception 'pack086_device_not_paired';
  end if;

  update public.ip_sessions
    set token_hash=v_hash,
        token_expires_at=p_token_expires_at,
        last_client_counter=0,
        updated_at=now()
    where id=v_session.id;

  insert into public.ip_audit_events(owner_id,session_id,event_type,details)
  values (
    p_owner_id,v_session.id,'session_token_rotated',
    jsonb_build_object(
      'deviceId',v_session.device_id,
      'scopes',to_jsonb(v_session.permission_scopes)
    )
  );

  return jsonb_build_object(
    'success',true,
    'device_id',v_session.device_id,
    'session_id',v_session.id,
    'token_expires_at',p_token_expires_at,
    'scopes',to_jsonb(v_session.permission_scopes),
    'execution_enabled',false
  );
end;
$pack086_rotate$;

create or replace function public.advance_ip_session_counter_pack086(
  p_session_id uuid,
  p_token_hash text,
  p_counter bigint
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack086_advance$
declare
  v_session public.ip_sessions%rowtype;
  v_device public.ip_devices%rowtype;
  v_hash text := lower(btrim(coalesce(p_token_hash,'')));
begin
  if v_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('success',false,'error','pack086_token_hash_invalid');
  end if;
  if p_counter is null or p_counter <= 0 then
    return jsonb_build_object('success',false,'error','pack086_counter_invalid');
  end if;

  select * into v_session
  from public.ip_sessions
  where id=p_session_id
  for update;

  if not found then
    return jsonb_build_object('success',false,'error','pack086_session_not_found');
  end if;
  if v_session.token_hash is null or v_session.token_hash <> v_hash then
    return jsonb_build_object('success',false,'error','pack086_token_invalid');
  end if;
  if v_session.revoked_at is not null or v_session.state in ('stopped','failed') then
    return jsonb_build_object('success',false,'error','pack086_session_revoked');
  end if;
  if v_session.token_expires_at is null or v_session.token_expires_at <= now() then
    return jsonb_build_object('success',false,'error','pack086_token_expired');
  end if;
  if p_counter <= v_session.last_client_counter then
    return jsonb_build_object('success',false,'error','pack086_counter_replay');
  end if;

  select * into v_device
  from public.ip_devices
  where id=v_session.device_id and owner_id=v_session.owner_id
  for update;

  if not found
     or v_device.status <> 'paired'
     or v_device.revoked_at is not null then
    return jsonb_build_object('success',false,'error','pack086_device_not_paired');
  end if;

  update public.ip_sessions
    set last_client_counter=p_counter,
        last_seen_at=now(),
        updated_at=now()
    where id=v_session.id;

  update public.ip_devices
    set last_seen_at=now(),updated_at=now()
    where id=v_device.id;

  return jsonb_build_object(
    'success',true,
    'owner_id',v_session.owner_id,
    'device_id',v_device.id,
    'session_id',v_session.id,
    'counter',p_counter,
    'token_expires_at',v_session.token_expires_at,
    'scopes',to_jsonb(v_session.permission_scopes),
    'execution_enabled',false,
    'heartbeat_at',now()
  );
end;
$pack086_advance$;

create or replace function public.revoke_ip_device_pack086(
  p_owner_id uuid,
  p_device_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack086_revoke$
declare
  v_device public.ip_devices%rowtype;
  v_sessions integer := 0;
begin
  select * into v_device
  from public.ip_devices
  where id=p_device_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'pack086_device_not_found'; end if;

  update public.ip_devices
    set status='revoked',
        revoked_at=coalesce(revoked_at,now()),
        pairing_version=pairing_version+1,
        updated_at=now()
    where id=v_device.id;

  update public.ip_pairing_challenges
    set state='revoked'
    where device_id=v_device.id and state='pending';

  update public.ip_sessions
    set revoked_at=coalesce(revoked_at,now()),
        stopped_at=coalesce(stopped_at,now()),
        state='stopped',
        token_hash=null,
        token_expires_at=now(),
        updated_at=now()
    where device_id=v_device.id
      and revoked_at is null;
  get diagnostics v_sessions = row_count;

  insert into public.ip_audit_events(owner_id,event_type,details)
  values (
    p_owner_id,'device_revoked',
    jsonb_build_object(
      'deviceId',v_device.id,
      'sessionsRevoked',v_sessions
    )
  );

  return jsonb_build_object(
    'success',true,
    'device_id',v_device.id,
    'sessions_revoked',v_sessions,
    'execution_enabled',false
  );
end;
$pack086_revoke$;

revoke all on function public.start_ip_pairing_pack086(uuid,uuid,text,text,text,text,timestamptz)
  from public,anon,authenticated;
revoke all on function public.complete_ip_pairing_pack086(uuid,uuid,text,timestamptz)
  from public,anon,authenticated;
revoke all on function public.rotate_ip_session_token_pack086(uuid,uuid,text,text,timestamptz)
  from public,anon,authenticated;
revoke all on function public.advance_ip_session_counter_pack086(uuid,text,bigint)
  from public,anon,authenticated;
revoke all on function public.revoke_ip_device_pack086(uuid,uuid)
  from public,anon,authenticated;

grant execute on function public.start_ip_pairing_pack086(uuid,uuid,text,text,text,text,timestamptz)
  to service_role;
grant execute on function public.complete_ip_pairing_pack086(uuid,uuid,text,timestamptz)
  to service_role;
grant execute on function public.rotate_ip_session_token_pack086(uuid,uuid,text,text,timestamptz)
  to service_role;
grant execute on function public.advance_ip_session_counter_pack086(uuid,text,bigint)
  to service_role;
grant execute on function public.revoke_ip_device_pack086(uuid,uuid)
  to service_role;

comment on table public.ip_pairing_challenges is
  'PACK086 single-use pairing challenges. Raw challenges and session tokens are never stored; only SHA-256 hashes are persisted.';
comment on function public.advance_ip_session_counter_pack086(uuid,text,bigint) is
  'PACK086 service-role-only monotonic replay guard and heartbeat transition. Cryptographic request signatures are verified in backend code before this RPC.';

commit;
