-- ZUVYR V1 PACK081 — Cloud Browser Runtime authority.
-- Engineering foundation only. Live Browserbase execution stays fail-closed
-- until M17, provider credentials and effective account pricing are verified.

create table if not exists public.browser_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.shared_conversations(id) on delete set null,
  task_run_id uuid references public.zuvyr_task_runs(id) on delete set null,
  project_id uuid references public.workspace_projects(id) on delete set null,
  request_id text not null check (char_length(request_id) between 8 and 200),
  billing_request_id text not null check (char_length(billing_request_id) between 8 and 220),
  provider text not null default 'browserbase'
    check (provider = 'browserbase'),
  provider_session_id text,
  status text not null default 'reserved'
    check (status in (
      'reserved','provisioning','running','detached',
      'closing','closed','failed','expired'
    )),
  region text,
  current_host text,
  network_policy jsonb not null default '{}'::jsonb
    check (jsonb_typeof(network_policy) = 'object'),
  secret_policy jsonb not null default '{}'::jsonb
    check (jsonb_typeof(secret_policy) = 'object'),
  started_at timestamptz,
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,
  idle_expires_at timestamptz not null,
  ended_at timestamptz,
  usage_seconds integer not null default 0 check (usage_seconds >= 0),
  proxy_bytes bigint not null default 0 check (proxy_bytes >= 0),
  pricing_version text not null check (char_length(pricing_version) between 1 and 160),
  browser_hour_price_micro_usd bigint not null check (browser_hour_price_micro_usd > 0),
  reserved_credits integer not null check (reserved_credits >= 1),
  billing_state text not null default 'not_reserved'
    check (billing_state in ('not_reserved','reserved','settling','settled','refund_pending','refunded')),
  final_credits integer check (final_credits is null or final_credits >= 0),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, request_id),
  unique(billing_request_id)
);

create unique index if not exists browser_sessions_provider_session_unique_idx
  on public.browser_sessions(provider, provider_session_id)
  where provider_session_id is not null;

create unique index if not exists browser_sessions_one_active_owner_idx
  on public.browser_sessions(owner_id)
  where status in ('reserved','provisioning','running','detached','closing');

create index if not exists browser_sessions_owner_updated_idx
  on public.browser_sessions(owner_id, updated_at desc);
create index if not exists browser_sessions_conversation_idx
  on public.browser_sessions(conversation_id)
  where conversation_id is not null;
create index if not exists browser_sessions_task_idx
  on public.browser_sessions(task_run_id)
  where task_run_id is not null;
create index if not exists browser_sessions_project_idx
  on public.browser_sessions(project_id)
  where project_id is not null;

create index if not exists browser_sessions_expiry_idx
  on public.browser_sessions(status, expires_at, idle_expires_at)
  where status in ('reserved','provisioning','running','detached','closing');

create table if not exists public.browser_session_artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.browser_sessions(id) on delete cascade,
  artifact_kind text not null
    check (artifact_kind in ('screenshot','dom','download','upload')),
  canonical_content_id uuid not null references public.zuvyr_content_objects(id) on delete restrict,
  canonical_version_id uuid not null references public.zuvyr_content_versions(id) on delete restrict,
  asset_id uuid references public.zuvyr_assets(id) on delete set null,
  provider_artifact_id text,
  file_name text,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes between 0 and 104857600),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists browser_session_artifacts_owner_session_idx
  on public.browser_session_artifacts(owner_id, session_id, created_at desc);

alter table public.browser_sessions enable row level security;
alter table public.browser_session_artifacts enable row level security;

revoke all on public.browser_sessions from public, anon, authenticated;
revoke all on public.browser_session_artifacts from public, anon, authenticated;
grant select, insert, update, delete on public.browser_sessions to service_role;
grant select, insert, update, delete on public.browser_session_artifacts to service_role;

create or replace function public.reserve_zuvyr_browser_session_pack081(
  p_owner_id uuid,
  p_conversation_id uuid,
  p_task_run_id uuid,
  p_project_id uuid,
  p_request_id text,
  p_billing_request_id text,
  p_expires_at timestamptz,
  p_idle_expires_at timestamptz,
  p_network_policy jsonb,
  p_secret_policy jsonb,
  p_pricing_version text,
  p_browser_hour_price_micro_usd bigint,
  p_reserved_credits integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack081_reserve$
declare
  v_existing public.browser_sessions%rowtype;
  v_row public.browser_sessions%rowtype;
  v_now timestamptz := now();
begin
  if char_length(coalesce(p_request_id,'')) not between 8 and 200 then
    raise exception 'pack081_request_id_invalid';
  end if;
  if char_length(coalesce(p_billing_request_id,'')) not between 8 and 220 then
    raise exception 'pack081_billing_request_id_invalid';
  end if;
  if char_length(trim(coalesce(p_pricing_version,''))) not between 1 and 160
     or p_browser_hour_price_micro_usd <= 0
     or p_reserved_credits < 1 then
    raise exception 'pack081_pricing_invalid';
  end if;

  if p_conversation_id is not null and not exists (
    select 1
    from public.shared_conversations
    where id = p_conversation_id
      and owner_id = p_owner_id
  ) then
    raise exception 'pack081_conversation_owner_mismatch';
  end if;

  if p_task_run_id is not null and not exists (
    select 1
    from public.zuvyr_task_runs
    where id = p_task_run_id
      and user_id = p_owner_id
  ) then
    raise exception 'pack081_task_owner_mismatch';
  end if;

  if p_project_id is not null and not exists (
    select 1
    from public.workspace_projects
    where id = p_project_id
      and owner_id = p_owner_id
  ) then
    raise exception 'pack081_project_owner_mismatch';
  end if;

  if jsonb_typeof(p_network_policy) <> 'object'
     or coalesce(p_network_policy->>'mode','') <> 'public-web-only' then
    raise exception 'pack081_network_policy_invalid';
  end if;

  if jsonb_typeof(p_secret_policy) <> 'object'
     or coalesce((p_secret_policy->>'injectBackendEnvironment')::boolean,false) then
    raise exception 'pack081_secret_policy_invalid';
  end if;

  if p_expires_at <= v_now
     or p_expires_at > v_now + interval '15 minutes' then
    raise exception 'pack081_expiry_invalid';
  end if;

  if p_idle_expires_at <= v_now
     or p_idle_expires_at > p_expires_at then
    raise exception 'pack081_idle_expiry_invalid';
  end if;

  select * into v_existing
  from public.browser_sessions
  where owner_id = p_owner_id
    and request_id = p_request_id;

  if v_existing.id is not null then
    if v_existing.conversation_id is distinct from p_conversation_id
       or v_existing.task_run_id is distinct from p_task_run_id
       or v_existing.project_id is distinct from p_project_id
       or v_existing.billing_request_id <> p_billing_request_id
       or v_existing.pricing_version <> trim(p_pricing_version)
       or v_existing.browser_hour_price_micro_usd <> p_browser_hour_price_micro_usd
       or v_existing.reserved_credits <> p_reserved_credits then
      raise exception 'pack081_idempotency_scope_mismatch';
    end if;
    return jsonb_build_object(
      'replayed', true,
      'session_id', v_existing.id,
      'status', v_existing.status
    );
  end if;

  if exists (
    select 1 from public.browser_sessions
    where owner_id = p_owner_id
      and status in ('reserved','provisioning','running','detached','closing')
  ) then
    raise exception 'pack081_active_session_exists';
  end if;

  insert into public.browser_sessions(
    owner_id, conversation_id, task_run_id, project_id,
    request_id, billing_request_id, provider, status,
    network_policy, secret_policy, expires_at, idle_expires_at,
    pricing_version, browser_hour_price_micro_usd, reserved_credits
  ) values (
    p_owner_id, p_conversation_id, p_task_run_id, p_project_id,
    p_request_id, p_billing_request_id, 'browserbase', 'reserved',
    p_network_policy, p_secret_policy, p_expires_at, p_idle_expires_at,
    trim(p_pricing_version), p_browser_hour_price_micro_usd, p_reserved_credits
  )
  returning * into v_row;

  return jsonb_build_object(
    'replayed', false,
    'session_id', v_row.id,
    'status', v_row.status
  );
exception
  when unique_violation then
    raise exception 'pack081_active_session_exists';
end;
$pack081_reserve$;

create or replace function public.transition_zuvyr_browser_session_pack081(
  p_owner_id uuid,
  p_session_id uuid,
  p_next_status text,
  p_provider_session_id text default null,
  p_region text default null,
  p_current_host text default null,
  p_usage_seconds integer default null,
  p_proxy_bytes bigint default null,
  p_failure_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack081_transition$
declare
  v_row public.browser_sessions%rowtype;
  v_next text := lower(trim(coalesce(p_next_status,'')));
  v_now timestamptz := now();
  v_allowed boolean := false;
begin
  select * into v_row
  from public.browser_sessions
  where id = p_session_id
    and owner_id = p_owner_id
  for update;

  if v_row.id is null then
    raise exception 'pack081_session_not_found';
  end if;

  if v_next not in (
    'reserved','provisioning','running','detached',
    'closing','closed','failed','expired'
  ) then
    raise exception 'pack081_status_invalid';
  end if;

  if v_row.status = v_next then
    return jsonb_build_object('session_id',v_row.id,'status',v_row.status,'replayed',true);
  end if;

  if v_row.status in ('closed','failed','expired') then
    raise exception 'pack081_terminal_session';
  end if;

  v_allowed :=
    (v_row.status = 'reserved' and v_next in ('provisioning','closed','failed','expired'))
    or (v_row.status = 'provisioning' and v_next in ('running','closing','closed','failed','expired'))
    or (v_row.status = 'running' and v_next in ('detached','closing','closed','failed','expired'))
    or (v_row.status = 'detached' and v_next in ('running','closing','closed','failed','expired'))
    or (v_row.status = 'closing' and v_next in ('closed','failed','expired'));

  if not v_allowed then
    raise exception 'pack081_invalid_transition';
  end if;

  if v_next in ('running','detached') and
     char_length(coalesce(nullif(p_provider_session_id,''),v_row.provider_session_id,'')) < 3 then
    raise exception 'pack081_provider_session_required';
  end if;

  if p_usage_seconds is not null and p_usage_seconds < v_row.usage_seconds then
    raise exception 'pack081_usage_regression';
  end if;
  if p_proxy_bytes is not null and p_proxy_bytes < v_row.proxy_bytes then
    raise exception 'pack081_proxy_bytes_regression';
  end if;

  update public.browser_sessions
  set
    status = v_next,
    provider_session_id = coalesce(nullif(p_provider_session_id,''), provider_session_id),
    region = coalesce(nullif(p_region,''), region),
    current_host = case
      when p_current_host is null then current_host
      else nullif(lower(trim(p_current_host)),'')
    end,
    usage_seconds = greatest(usage_seconds, coalesce(p_usage_seconds, usage_seconds)),
    proxy_bytes = greatest(proxy_bytes, coalesce(p_proxy_bytes, proxy_bytes)),
    started_at = case
      when v_next = 'running' then coalesce(started_at,v_now)
      else started_at
    end,
    last_activity_at = case
      when v_next in ('running','detached') then v_now
      else last_activity_at
    end,
    failure_code = case
      when v_next = 'failed' then left(coalesce(p_failure_code,'pack081_provider_failed'),200)
      else failure_code
    end,
    ended_at = case
      when v_next in ('closed','failed','expired') then v_now
      else ended_at
    end,
    updated_at = v_now
  where id = p_session_id
  returning * into v_row;

  return jsonb_build_object(
    'session_id',v_row.id,
    'status',v_row.status,
    'usage_seconds',v_row.usage_seconds,
    'proxy_bytes',v_row.proxy_bytes,
    'billing_state',v_row.billing_state,
    'replayed',false
  );
end;
$pack081_transition$;

create or replace function public.touch_zuvyr_browser_session_pack081(
  p_owner_id uuid,
  p_session_id uuid,
  p_idle_expires_at timestamptz,
  p_current_host text default null,
  p_usage_seconds integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack081_touch$
declare
  v_row public.browser_sessions%rowtype;
  v_now timestamptz := now();
begin
  select * into v_row
  from public.browser_sessions
  where id = p_session_id
    and owner_id = p_owner_id
  for update;

  if v_row.id is null then
    raise exception 'pack081_session_not_found';
  end if;

  if v_row.status not in ('running','detached') then
    raise exception 'pack081_session_not_active';
  end if;

  if p_idle_expires_at <= v_now or p_idle_expires_at > v_row.expires_at then
    raise exception 'pack081_idle_expiry_invalid';
  end if;

  if p_usage_seconds is not null and p_usage_seconds < v_row.usage_seconds then
    raise exception 'pack081_usage_regression';
  end if;

  update public.browser_sessions
  set
    last_activity_at = v_now,
    idle_expires_at = p_idle_expires_at,
    current_host = case
      when p_current_host is null then current_host
      else nullif(lower(trim(p_current_host)),'')
    end,
    usage_seconds = greatest(usage_seconds, coalesce(p_usage_seconds, usage_seconds)),
    updated_at = v_now
  where id = p_session_id
  returning * into v_row;

  return jsonb_build_object(
    'session_id',v_row.id,
    'status',v_row.status,
    'idle_expires_at',v_row.idle_expires_at,
    'usage_seconds',v_row.usage_seconds
  );
end;
$pack081_touch$;


create or replace function public.set_zuvyr_browser_billing_state_pack081(
  p_owner_id uuid,
  p_session_id uuid,
  p_expected_state text,
  p_next_state text,
  p_final_credits integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack081_billing$
declare
  v_row public.browser_sessions%rowtype;
  v_expected text := lower(trim(coalesce(p_expected_state,'')));
  v_next text := lower(trim(coalesce(p_next_state,'')));
begin
  if v_expected not in ('not_reserved','reserved','settling','settled','refund_pending','refunded')
     or v_next not in ('not_reserved','reserved','settling','settled','refund_pending','refunded') then
    raise exception 'pack081_billing_state_invalid';
  end if;
  if p_final_credits is not null and p_final_credits < 0 then
    raise exception 'pack081_final_credits_invalid';
  end if;

  select * into v_row
  from public.browser_sessions
  where id=p_session_id and owner_id=p_owner_id
  for update;

  if v_row.id is null then
    raise exception 'pack081_session_not_found';
  end if;

  if v_row.billing_state <> v_expected then
    return jsonb_build_object(
      'success',false,
      'error','pack081_billing_state_conflict',
      'current_state',v_row.billing_state
    );
  end if;

  update public.browser_sessions
  set billing_state=v_next,
      final_credits=coalesce(p_final_credits,final_credits),
      updated_at=now()
  where id=p_session_id
  returning * into v_row;

  return jsonb_build_object(
    'success',true,
    'session_id',v_row.id,
    'billing_state',v_row.billing_state,
    'final_credits',v_row.final_credits
  );
end;
$pack081_billing$;

revoke all on function public.reserve_zuvyr_browser_session_pack081(
  uuid,uuid,uuid,uuid,text,text,timestamptz,timestamptz,jsonb,jsonb,text,bigint,integer
) from public, anon, authenticated;
revoke all on function public.transition_zuvyr_browser_session_pack081(
  uuid,uuid,text,text,text,text,integer,bigint,text
) from public, anon, authenticated;
revoke all on function public.set_zuvyr_browser_billing_state_pack081(
  uuid,uuid,text,text,integer
) from public, anon, authenticated;
revoke all on function public.touch_zuvyr_browser_session_pack081(
  uuid,uuid,timestamptz,text,integer
) from public, anon, authenticated;

grant execute on function public.reserve_zuvyr_browser_session_pack081(
  uuid,uuid,uuid,uuid,text,text,timestamptz,timestamptz,jsonb,jsonb,text,bigint,integer
) to service_role;
grant execute on function public.transition_zuvyr_browser_session_pack081(
  uuid,uuid,text,text,text,text,integer,bigint,text
) to service_role;
grant execute on function public.set_zuvyr_browser_billing_state_pack081(
  uuid,uuid,text,text,integer
) to service_role;
grant execute on function public.touch_zuvyr_browser_session_pack081(
  uuid,uuid,timestamptz,text,integer
) to service_role;

comment on table public.browser_sessions is
  'PACK081 owner-scoped cloud-browser session authority. Provider API keys, CDP/connect URLs, cookies, passwords and raw secrets are intentionally never persisted.';

comment on table public.browser_session_artifacts is
  'PACK081 lineage from browser screenshots/DOM/downloads/uploads to canonical ZUVYR content and private assets.';
