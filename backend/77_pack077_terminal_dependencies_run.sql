-- ZUVYR V1 PACK077 — Terminal / Dependencies / Run.
-- Additive runtime authority. Live paid execution remains fail-closed until
-- PACK077 runtime gate, M15 and verified sandbox pricing are all satisfied.

alter table public.code_runtime_jobs
  add column if not exists request_id text,
  add column if not exists provider_command_id text,
  add column if not exists command_spec jsonb not null default '{}'::jsonb,
  add column if not exists stage text not null default 'reserved',
  add column if not exists cancel_requested boolean not null default false,
  add column if not exists started_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists exit_code integer,
  add column if not exists runtime_ms bigint,
  add column if not exists reserved_credits integer,
  add column if not exists final_credits integer,
  add column if not exists pricing_version text,
  add column if not exists cost_entry_id text;

alter table public.code_runtime_jobs
  drop constraint if exists code_runtime_jobs_pack077_request_id_check,
  add constraint code_runtime_jobs_pack077_request_id_check
    check (request_id is null or char_length(request_id) between 1 and 200),
  drop constraint if exists code_runtime_jobs_pack077_command_spec_check,
  add constraint code_runtime_jobs_pack077_command_spec_check
    check (jsonb_typeof(command_spec) = 'object'),
  drop constraint if exists code_runtime_jobs_pack077_stage_check,
  add constraint code_runtime_jobs_pack077_stage_check
    check (stage in (
      'reserved','syncing','permission','network',
      'executing','preview','cancel_requested','terminal'
    )),
  drop constraint if exists code_runtime_jobs_pack077_runtime_ms_check,
  add constraint code_runtime_jobs_pack077_runtime_ms_check
    check (runtime_ms is null or runtime_ms >= 0),
  drop constraint if exists code_runtime_jobs_pack077_reserved_credits_check,
  add constraint code_runtime_jobs_pack077_reserved_credits_check
    check (reserved_credits is null or reserved_credits >= 1),
  drop constraint if exists code_runtime_jobs_pack077_final_credits_check,
  add constraint code_runtime_jobs_pack077_final_credits_check
    check (final_credits is null or final_credits >= 0);

create unique index if not exists code_runtime_jobs_owner_request_unique_idx
  on public.code_runtime_jobs(owner_id, request_id)
  where request_id is not null;

create unique index if not exists code_runtime_jobs_provider_command_unique_idx
  on public.code_runtime_jobs(provider_command_id)
  where provider_command_id is not null;

create index if not exists code_runtime_jobs_session_created_idx
  on public.code_runtime_jobs(sandbox_session_id, created_at desc)
  where sandbox_session_id is not null;

create table if not exists public.code_sandbox_runtime_state (
  sandbox_session_id uuid primary key
    references public.code_sandbox_sessions(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.code_projects(id) on delete cascade,
  synced_revision bigint,
  files_digest text check (
    files_digest is null or files_digest ~ '^[0-9a-f]{64}$'
  ),
  dependency_digest text check (
    dependency_digest is null or dependency_digest ~ '^[0-9a-f]{64}$'
  ),
  package_manager text check (
    package_manager is null or package_manager in ('npm')
  ),
  runtime_script text,
  provider_command_id text,
  process_status text not null default 'idle'
    check (process_status in (
      'idle','starting','running','stopping','stopped','failed'
    )),
  preview_port integer check (
    preview_port is null or preview_port between 1 and 65535
  ),
  started_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists code_sandbox_runtime_state_provider_command_unique_idx
  on public.code_sandbox_runtime_state(provider_command_id)
  where provider_command_id is not null;

create index if not exists code_sandbox_runtime_state_owner_project_idx
  on public.code_sandbox_runtime_state(owner_id, project_id, updated_at desc);

create table if not exists public.code_runtime_log_chunks (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.code_runtime_jobs(id) on delete cascade,
  sequence_no bigint not null check (sequence_no >= 0),
  stream text not null check (stream in ('stdout','stderr','error')),
  message text not null check (
    octet_length(message) between 1 and 16384
  ),
  created_at timestamptz not null default now(),
  unique(job_id, sequence_no)
);

create index if not exists code_runtime_log_chunks_job_sequence_idx
  on public.code_runtime_log_chunks(job_id, sequence_no);

alter table public.code_sandbox_runtime_state enable row level security;
alter table public.code_runtime_log_chunks enable row level security;

revoke all on public.code_sandbox_runtime_state
  from public, anon, authenticated;
revoke all on public.code_runtime_log_chunks
  from public, anon, authenticated;

grant select, insert, update, delete on public.code_sandbox_runtime_state
  to service_role;
grant select, insert, update, delete on public.code_runtime_log_chunks
  to service_role;
grant usage, select on sequence public.code_runtime_log_chunks_id_seq
  to service_role;

create or replace function public.reserve_zuvyr_code_runtime_job_pack077(
  p_owner_id uuid,
  p_project_id uuid,
  p_sandbox_session_id uuid,
  p_request_id text,
  p_operation text,
  p_command_spec jsonb,
  p_reserved_credits integer,
  p_pricing_version text,
  p_cost_entry_id text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack077_reserve$
declare
  v_existing public.code_runtime_jobs%rowtype;
  v_project public.code_projects%rowtype;
  v_session public.code_sandbox_sessions%rowtype;
  v_job public.code_runtime_jobs%rowtype;
  v_now timestamptz := now();
  v_operation text := lower(trim(coalesce(p_operation,'')));
begin
  if char_length(coalesce(p_request_id,'')) not between 1 and 200 then
    raise exception 'pack077_request_id_invalid';
  end if;

  if v_operation not in ('terminal','dependencies','run') then
    raise exception 'pack077_operation_invalid';
  end if;

  if jsonb_typeof(p_command_spec) <> 'object' then
    raise exception 'pack077_command_spec_invalid';
  end if;

  if coalesce(p_reserved_credits,0) < 1 then
    raise exception 'pack077_reserved_credits_invalid';
  end if;

  if char_length(coalesce(p_pricing_version,'')) not between 1 and 200 then
    raise exception 'pack077_pricing_version_invalid';
  end if;

  if char_length(coalesce(p_cost_entry_id,'')) not between 1 and 200 then
    raise exception 'pack077_cost_entry_invalid';
  end if;

  select *
    into v_project
  from public.code_projects
  where id = p_project_id
    and owner_id = p_owner_id
    and status = 'active';

  if v_project.id is null then
    raise exception 'pack077_project_not_found';
  end if;

  select *
    into v_session
  from public.code_sandbox_sessions
  where id = p_sandbox_session_id
    and owner_id = p_owner_id
    and project_id = p_project_id
  for update;

  if v_session.id is null then
    raise exception 'pack077_sandbox_not_found';
  end if;

  if v_session.status <> 'running'
     or v_session.expires_at <= v_now
     or v_session.idle_expires_at <= v_now
     or v_session.provider_session_id is null then
    raise exception 'pack077_sandbox_not_runnable';
  end if;

  select *
    into v_existing
  from public.code_runtime_jobs
  where owner_id = p_owner_id
    and request_id = p_request_id;

  if v_existing.id is not null then
    if v_existing.project_id <> p_project_id
       or v_existing.sandbox_session_id <> p_sandbox_session_id
       or v_existing.operation <> v_operation
       or v_existing.command_spec <> p_command_spec then
      raise exception 'pack077_idempotency_scope_mismatch';
    end if;

    return jsonb_build_object(
      'replayed', true,
      'job_id', v_existing.id,
      'status', v_existing.status,
      'stage', v_existing.stage
    );
  end if;

  insert into public.code_runtime_jobs(
    owner_id,
    project_id,
    sandbox_session_id,
    request_id,
    operation,
    status,
    confirmed_at,
    limits,
    result,
    command_spec,
    stage,
    cancel_requested,
    reserved_credits,
    pricing_version,
    cost_entry_id,
    updated_at
  ) values (
    p_owner_id,
    p_project_id,
    p_sandbox_session_id,
    p_request_id,
    v_operation,
    'queued',
    v_now,
    v_session.resource_limits,
    '{}'::jsonb,
    p_command_spec,
    'reserved',
    false,
    p_reserved_credits,
    p_pricing_version,
    p_cost_entry_id,
    v_now
  )
  returning * into v_job;

  return jsonb_build_object(
    'replayed', false,
    'job_id', v_job.id,
    'status', v_job.status,
    'stage', v_job.stage
  );
exception
  when unique_violation then
    select *
      into v_existing
    from public.code_runtime_jobs
    where owner_id = p_owner_id
      and request_id = p_request_id;

    if v_existing.id is not null
       and v_existing.project_id = p_project_id
       and v_existing.sandbox_session_id = p_sandbox_session_id
       and v_existing.operation = v_operation
       and v_existing.command_spec = p_command_spec then
      return jsonb_build_object(
        'replayed', true,
        'job_id', v_existing.id,
        'status', v_existing.status,
        'stage', v_existing.stage
      );
    end if;

    raise exception 'pack077_idempotency_scope_mismatch';
end;
$pack077_reserve$;

create or replace function public.claim_zuvyr_code_runtime_job_pack077(
  p_owner_id uuid,
  p_job_id uuid,
  p_provider_command_id text,
  p_stage text default 'executing'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack077_claim$
declare
  v_job public.code_runtime_jobs%rowtype;
  v_stage text := lower(trim(coalesce(p_stage,'')));
  v_now timestamptz := now();
begin
  select *
    into v_job
  from public.code_runtime_jobs
  where id = p_job_id
    and owner_id = p_owner_id
  for update;

  if v_job.id is null then
    raise exception 'pack077_job_not_found';
  end if;

  if char_length(coalesce(p_provider_command_id,'')) < 6 then
    raise exception 'pack077_provider_command_invalid';
  end if;

  if v_stage not in ('syncing','permission','network','executing','preview') then
    raise exception 'pack077_stage_invalid';
  end if;

  if v_job.status = 'running'
     and v_job.provider_command_id = p_provider_command_id then
    return jsonb_build_object(
      'replayed', true,
      'job_id', v_job.id,
      'status', v_job.status,
      'stage', v_job.stage
    );
  end if;

  if v_job.status <> 'queued' or v_job.cancel_requested = true then
    raise exception 'pack077_job_not_claimable';
  end if;

  update public.code_runtime_jobs
  set
    status = 'running',
    stage = v_stage,
    provider_command_id = p_provider_command_id,
    started_at = coalesce(started_at, v_now),
    updated_at = v_now
  where id = p_job_id
  returning * into v_job;

  return jsonb_build_object(
    'replayed', false,
    'job_id', v_job.id,
    'status', v_job.status,
    'stage', v_job.stage
  );
end;
$pack077_claim$;

create or replace function public.append_zuvyr_code_runtime_log_pack077(
  p_owner_id uuid,
  p_job_id uuid,
  p_sequence_no bigint,
  p_stream text,
  p_message text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack077_log$
declare
  v_job public.code_runtime_jobs%rowtype;
  v_stream text := lower(trim(coalesce(p_stream,'')));
begin
  select *
    into v_job
  from public.code_runtime_jobs
  where id = p_job_id
    and owner_id = p_owner_id;

  if v_job.id is null then
    raise exception 'pack077_job_not_found';
  end if;

  if p_sequence_no < 0 or p_sequence_no >= 256 then
    raise exception 'pack077_log_sequence_invalid';
  end if;

  if v_stream not in ('stdout','stderr','error') then
    raise exception 'pack077_log_stream_invalid';
  end if;

  if octet_length(coalesce(p_message,'')) not between 1 and 16384 then
    raise exception 'pack077_log_message_invalid';
  end if;

  insert into public.code_runtime_log_chunks(
    owner_id,
    job_id,
    sequence_no,
    stream,
    message
  ) values (
    p_owner_id,
    p_job_id,
    p_sequence_no,
    v_stream,
    p_message
  )
  on conflict(job_id, sequence_no) do nothing;

  return jsonb_build_object(
    'job_id', p_job_id,
    'sequence_no', p_sequence_no
  );
end;
$pack077_log$;

create or replace function public.request_zuvyr_code_runtime_cancel_pack077(
  p_owner_id uuid,
  p_job_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack077_cancel$
declare
  v_job public.code_runtime_jobs%rowtype;
  v_now timestamptz := now();
begin
  select *
    into v_job
  from public.code_runtime_jobs
  where id = p_job_id
    and owner_id = p_owner_id
  for update;

  if v_job.id is null then
    raise exception 'pack077_job_not_found';
  end if;

  if v_job.status in ('succeeded','failed','cancelled') then
    return jsonb_build_object(
      'replayed', true,
      'job_id', v_job.id,
      'status', v_job.status,
      'provider_command_id', v_job.provider_command_id,
      'sandbox_session_id', v_job.sandbox_session_id
    );
  end if;

  update public.code_runtime_jobs
  set
    cancel_requested = true,
    stage = 'cancel_requested',
    updated_at = v_now
  where id = p_job_id
  returning * into v_job;

  return jsonb_build_object(
    'replayed', false,
    'job_id', v_job.id,
    'status', v_job.status,
    'provider_command_id', v_job.provider_command_id,
    'sandbox_session_id', v_job.sandbox_session_id
  );
end;
$pack077_cancel$;

create or replace function public.finalize_zuvyr_code_runtime_job_pack077(
  p_owner_id uuid,
  p_job_id uuid,
  p_status text,
  p_exit_code integer,
  p_runtime_ms bigint,
  p_final_credits integer,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack077_finalize$
declare
  v_job public.code_runtime_jobs%rowtype;
  v_status text := lower(trim(coalesce(p_status,'')));
  v_now timestamptz := now();
begin
  select *
    into v_job
  from public.code_runtime_jobs
  where id = p_job_id
    and owner_id = p_owner_id
  for update;

  if v_job.id is null then
    raise exception 'pack077_job_not_found';
  end if;

  if v_status not in ('succeeded','failed','cancelled') then
    raise exception 'pack077_final_status_invalid';
  end if;

  if p_runtime_ms < 0 then
    raise exception 'pack077_runtime_ms_invalid';
  end if;

  if p_final_credits < 0 then
    raise exception 'pack077_final_credits_invalid';
  end if;

  if jsonb_typeof(p_result) <> 'object' then
    raise exception 'pack077_result_invalid';
  end if;

  if v_job.status in ('succeeded','failed','cancelled') then
    if v_job.status <> v_status then
      raise exception 'pack077_terminal_job';
    end if;
    return jsonb_build_object(
      'replayed', true,
      'job_id', v_job.id,
      'status', v_job.status,
      'final_credits', v_job.final_credits
    );
  end if;

  update public.code_runtime_jobs
  set
    status = v_status,
    stage = 'terminal',
    exit_code = p_exit_code,
    runtime_ms = p_runtime_ms,
    final_credits = p_final_credits,
    result = p_result,
    completed_at = v_now,
    updated_at = v_now
  where id = p_job_id
  returning * into v_job;

  return jsonb_build_object(
    'replayed', false,
    'job_id', v_job.id,
    'status', v_job.status,
    'final_credits', v_job.final_credits
  );
end;
$pack077_finalize$;

revoke all on function public.reserve_zuvyr_code_runtime_job_pack077(
  uuid,uuid,uuid,text,text,jsonb,integer,text,text
) from public, anon, authenticated;
revoke all on function public.claim_zuvyr_code_runtime_job_pack077(
  uuid,uuid,text,text
) from public, anon, authenticated;
revoke all on function public.append_zuvyr_code_runtime_log_pack077(
  uuid,uuid,bigint,text,text
) from public, anon, authenticated;
revoke all on function public.request_zuvyr_code_runtime_cancel_pack077(
  uuid,uuid
) from public, anon, authenticated;
revoke all on function public.finalize_zuvyr_code_runtime_job_pack077(
  uuid,uuid,text,integer,bigint,integer,jsonb
) from public, anon, authenticated;

grant execute on function public.reserve_zuvyr_code_runtime_job_pack077(
  uuid,uuid,uuid,text,text,jsonb,integer,text,text
) to service_role;
grant execute on function public.claim_zuvyr_code_runtime_job_pack077(
  uuid,uuid,text,text
) to service_role;
grant execute on function public.append_zuvyr_code_runtime_log_pack077(
  uuid,uuid,bigint,text,text
) to service_role;
grant execute on function public.request_zuvyr_code_runtime_cancel_pack077(
  uuid,uuid
) to service_role;
grant execute on function public.finalize_zuvyr_code_runtime_job_pack077(
  uuid,uuid,text,integer,bigint,integer,jsonb
) to service_role;

comment on table public.code_sandbox_runtime_state is
  'PACK077 per-session runtime/process state. No provider URLs or secrets are stored.';
comment on table public.code_runtime_log_chunks is
  'PACK077 bounded owner-scoped stdout/stderr/error chunks for runtime reconnect and diagnostics.';
