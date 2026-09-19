-- ZUVYR V1 PACK076 — Secure Code Sandbox authority.
-- Additive only. Live provider execution remains fail-closed until M15,
-- provider credentials and verified sandbox pricing are all present.

create table if not exists public.code_sandbox_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.code_projects(id) on delete cascade,
  request_id text not null check (char_length(request_id) between 1 and 200),
  provider text not null default 'vercel_sandbox'
    check (provider in ('vercel_sandbox')),
  provider_session_id text,
  status text not null default 'reserved'
    check (status in (
      'reserved',
      'provisioning',
      'running',
      'stopping',
      'stopped',
      'failed',
      'expired'
    )),
  runtime text not null default 'node24'
    check (runtime in ('node24')),
  resource_limits jsonb not null default '{}'::jsonb
    check (jsonb_typeof(resource_limits) = 'object'),
  network_policy jsonb not null default '{}'::jsonb
    check (jsonb_typeof(network_policy) = 'object'),
  preview_token_hash text not null
    check (preview_token_hash ~ '^[0-9a-f]{64}$'),
  preview_port integer
    check (preview_port is null or preview_port between 1 and 65535),
  preview_expires_at timestamptz,
  expires_at timestamptz not null,
  idle_expires_at timestamptz not null,
  last_activity_at timestamptz not null default now(),
  usage_metrics jsonb not null default '{}'::jsonb
    check (jsonb_typeof(usage_metrics) = 'object'),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stopped_at timestamptz,
  unique(owner_id, request_id)
);

create unique index if not exists code_sandbox_sessions_one_active_project_idx
  on public.code_sandbox_sessions(project_id)
  where status in ('reserved','provisioning','running','stopping');

create index if not exists code_sandbox_sessions_owner_updated_idx
  on public.code_sandbox_sessions(owner_id, updated_at desc);

create index if not exists code_sandbox_sessions_expiry_idx
  on public.code_sandbox_sessions(status, expires_at, idle_expires_at)
  where status in ('reserved','provisioning','running','stopping');

alter table public.code_runtime_jobs
  add column if not exists sandbox_session_id uuid
    references public.code_sandbox_sessions(id) on delete set null;

create index if not exists code_runtime_jobs_sandbox_session_idx
  on public.code_runtime_jobs(sandbox_session_id)
  where sandbox_session_id is not null;

alter table public.code_sandbox_sessions enable row level security;

revoke all on public.code_sandbox_sessions
  from public, anon, authenticated;
grant select, insert, update, delete on public.code_sandbox_sessions
  to service_role;

create or replace function public.reserve_zuvyr_code_sandbox_session_pack076(
  p_owner_id uuid,
  p_project_id uuid,
  p_request_id text,
  p_preview_token_hash text,
  p_expires_at timestamptz,
  p_idle_expires_at timestamptz,
  p_resource_limits jsonb,
  p_network_policy jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack076_reserve$
declare
  v_existing public.code_sandbox_sessions%rowtype;
  v_project public.code_projects%rowtype;
  v_session public.code_sandbox_sessions%rowtype;
  v_now timestamptz := now();
begin
  if char_length(coalesce(p_request_id,'')) not between 1 and 200 then
    raise exception 'pack076_request_id_invalid';
  end if;

  if coalesce(p_preview_token_hash,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'pack076_preview_token_hash_invalid';
  end if;

  if jsonb_typeof(p_resource_limits) <> 'object' then
    raise exception 'pack076_resource_limits_invalid';
  end if;

  if jsonb_typeof(p_network_policy) <> 'object' then
    raise exception 'pack076_network_policy_invalid';
  end if;

  if coalesce(p_network_policy->>'mode','') <> 'deny-all' then
    raise exception 'pack076_network_policy_not_deny_all';
  end if;

  if p_expires_at <= v_now
     or p_expires_at > v_now + interval '1 hour' then
    raise exception 'pack076_expiry_invalid';
  end if;

  if p_idle_expires_at <= v_now
     or p_idle_expires_at > p_expires_at then
    raise exception 'pack076_idle_expiry_invalid';
  end if;

  select *
    into v_project
  from public.code_projects
  where id = p_project_id
    and owner_id = p_owner_id
    and status = 'active';

  if v_project.id is null then
    raise exception 'pack076_project_not_found';
  end if;

  select *
    into v_existing
  from public.code_sandbox_sessions
  where owner_id = p_owner_id
    and request_id = p_request_id;

  if v_existing.id is not null then
    if v_existing.project_id <> p_project_id
       or v_existing.preview_token_hash <> p_preview_token_hash then
      raise exception 'pack076_idempotency_scope_mismatch';
    end if;

    return jsonb_build_object(
      'replayed', true,
      'session_id', v_existing.id,
      'status', v_existing.status,
      'project_id', v_existing.project_id,
      'expires_at', v_existing.expires_at,
      'idle_expires_at', v_existing.idle_expires_at
    );
  end if;

  if exists (
    select 1
    from public.code_sandbox_sessions
    where project_id = p_project_id
      and status in ('reserved','provisioning','running','stopping')
  ) then
    raise exception 'pack076_active_session_exists';
  end if;

  insert into public.code_sandbox_sessions(
    owner_id,
    project_id,
    request_id,
    provider,
    status,
    runtime,
    resource_limits,
    network_policy,
    preview_token_hash,
    expires_at,
    idle_expires_at,
    last_activity_at
  ) values (
    p_owner_id,
    p_project_id,
    p_request_id,
    'vercel_sandbox',
    'reserved',
    'node24',
    p_resource_limits,
    p_network_policy,
    p_preview_token_hash,
    p_expires_at,
    p_idle_expires_at,
    v_now
  )
  returning * into v_session;

  return jsonb_build_object(
    'replayed', false,
    'session_id', v_session.id,
    'status', v_session.status,
    'project_id', v_session.project_id,
    'expires_at', v_session.expires_at,
    'idle_expires_at', v_session.idle_expires_at
  );
exception
  when unique_violation then
    raise exception 'pack076_active_session_exists';
end;
$pack076_reserve$;

create or replace function public.transition_zuvyr_code_sandbox_session_pack076(
  p_owner_id uuid,
  p_session_id uuid,
  p_next_status text,
  p_provider_session_id text default null,
  p_preview_port integer default null,
  p_usage_metrics jsonb default null,
  p_failure_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack076_transition$
declare
  v_session public.code_sandbox_sessions%rowtype;
  v_now timestamptz := now();
  v_next text := lower(trim(coalesce(p_next_status,'')));
  v_allowed boolean := false;
begin
  select *
    into v_session
  from public.code_sandbox_sessions
  where id = p_session_id
    and owner_id = p_owner_id
  for update;

  if v_session.id is null then
    raise exception 'pack076_session_not_found';
  end if;

  if v_next not in (
    'reserved','provisioning','running','stopping',
    'stopped','failed','expired'
  ) then
    raise exception 'pack076_session_status_invalid';
  end if;

  if v_session.status = v_next then
    return jsonb_build_object(
      'session_id', v_session.id,
      'status', v_session.status,
      'replayed', true
    );
  end if;

  if v_session.status in ('stopped','failed','expired') then
    raise exception 'pack076_terminal_session';
  end if;

  v_allowed :=
    (v_session.status = 'reserved' and v_next in ('provisioning','stopped','failed','expired'))
    or
    (v_session.status = 'provisioning' and v_next in ('running','stopping','stopped','failed','expired'))
    or
    (v_session.status = 'running' and v_next in ('stopping','stopped','failed','expired'))
    or
    (v_session.status = 'stopping' and v_next in ('stopped','failed','expired'));

  if not v_allowed then
    raise exception 'pack076_invalid_transition';
  end if;

  if v_next = 'running' then
    if char_length(coalesce(p_provider_session_id,'')) < 4 then
      raise exception 'pack076_provider_session_required';
    end if;
    if v_session.expires_at <= v_now then
      raise exception 'pack076_session_expired';
    end if;
  end if;

  if p_preview_port is not null
     and (p_preview_port < 1 or p_preview_port > 65535) then
    raise exception 'pack076_preview_port_invalid';
  end if;

  if p_usage_metrics is not null
     and jsonb_typeof(p_usage_metrics) <> 'object' then
    raise exception 'pack076_usage_metrics_invalid';
  end if;

  update public.code_sandbox_sessions
  set
    status = v_next,
    provider_session_id = coalesce(
      nullif(p_provider_session_id,''),
      provider_session_id
    ),
    preview_port = coalesce(p_preview_port, preview_port),
    usage_metrics = case
      when p_usage_metrics is null then usage_metrics
      else p_usage_metrics
    end,
    failure_code = case
      when v_next = 'failed' then left(coalesce(p_failure_code,'pack076_provider_failed'),200)
      else failure_code
    end,
    last_activity_at = case
      when v_next = 'running' then v_now
      else last_activity_at
    end,
    updated_at = v_now,
    stopped_at = case
      when v_next in ('stopped','failed','expired') then v_now
      else stopped_at
    end
  where id = p_session_id
  returning * into v_session;

  return jsonb_build_object(
    'session_id', v_session.id,
    'status', v_session.status,
    'replayed', false,
    'provider_session_set', v_session.provider_session_id is not null,
    'preview_port', v_session.preview_port,
    'stopped_at', v_session.stopped_at
  );
end;
$pack076_transition$;

create or replace function public.touch_zuvyr_code_sandbox_session_pack076(
  p_owner_id uuid,
  p_session_id uuid,
  p_idle_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack076_touch$
declare
  v_session public.code_sandbox_sessions%rowtype;
  v_now timestamptz := now();
begin
  select *
    into v_session
  from public.code_sandbox_sessions
  where id = p_session_id
    and owner_id = p_owner_id
  for update;

  if v_session.id is null then
    raise exception 'pack076_session_not_found';
  end if;

  if v_session.status <> 'running' then
    raise exception 'pack076_session_not_running';
  end if;

  if v_session.expires_at <= v_now then
    raise exception 'pack076_session_expired';
  end if;

  if p_idle_expires_at <= v_now
     or p_idle_expires_at > v_session.expires_at then
    raise exception 'pack076_idle_expiry_invalid';
  end if;

  update public.code_sandbox_sessions
  set
    last_activity_at = v_now,
    idle_expires_at = p_idle_expires_at,
    updated_at = v_now
  where id = p_session_id
  returning * into v_session;

  return jsonb_build_object(
    'session_id', v_session.id,
    'status', v_session.status,
    'last_activity_at', v_session.last_activity_at,
    'idle_expires_at', v_session.idle_expires_at
  );
end;
$pack076_touch$;

revoke all on function public.reserve_zuvyr_code_sandbox_session_pack076(
  uuid,uuid,text,text,timestamptz,timestamptz,jsonb,jsonb
) from public, anon, authenticated;

revoke all on function public.transition_zuvyr_code_sandbox_session_pack076(
  uuid,uuid,text,text,integer,jsonb,text
) from public, anon, authenticated;

revoke all on function public.touch_zuvyr_code_sandbox_session_pack076(
  uuid,uuid,timestamptz
) from public, anon, authenticated;

grant execute on function public.reserve_zuvyr_code_sandbox_session_pack076(
  uuid,uuid,text,text,timestamptz,timestamptz,jsonb,jsonb
) to service_role;

grant execute on function public.transition_zuvyr_code_sandbox_session_pack076(
  uuid,uuid,text,text,integer,jsonb,text
) to service_role;

grant execute on function public.touch_zuvyr_code_sandbox_session_pack076(
  uuid,uuid,timestamptz
) to service_role;

comment on table public.code_sandbox_sessions is
  'PACK076 server-authoritative ephemeral sandbox sessions. Stores token hashes and provider session IDs only; raw preview/provider URLs and ZUVYR secrets are intentionally absent.';
