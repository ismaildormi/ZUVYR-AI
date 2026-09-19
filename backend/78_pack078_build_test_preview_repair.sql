-- ZUVYR V1 PACK078 — Build / Test / Browser Preview / Repair.
-- Additive authority. Live preview/provider execution remains fail-closed
-- behind PACK076/077 sandbox, credential, pricing and route-protection gates.

alter table public.code_sandbox_runtime_state
  add column if not exists preview_state text not null default 'unavailable',
  add column if not exists preview_candidate_port integer,
  add column if not exists preview_transport_status text not null default 'blocked',
  add column if not exists last_diagnostic jsonb not null default '{}'::jsonb,
  add column if not exists last_build_job_id uuid references public.code_runtime_jobs(id) on delete set null,
  add column if not exists last_test_job_id uuid references public.code_runtime_jobs(id) on delete set null,
  add column if not exists preview_updated_at timestamptz;

alter table public.code_sandbox_runtime_state
  drop constraint if exists code_sandbox_runtime_state_pack078_preview_state_check,
  add constraint code_sandbox_runtime_state_pack078_preview_state_check
    check (preview_state in (
      'unavailable','starting','building','ready','updating',
      'build_failed','runtime_error'
    )),
  drop constraint if exists code_sandbox_runtime_state_pack078_candidate_port_check,
  add constraint code_sandbox_runtime_state_pack078_candidate_port_check
    check (
      preview_candidate_port is null
      or preview_candidate_port between 1024 and 65535
    ),
  drop constraint if exists code_sandbox_runtime_state_pack078_transport_check,
  add constraint code_sandbox_runtime_state_pack078_transport_check
    check (preview_transport_status in (
      'blocked','candidate','verified','expired','error'
    )),
  drop constraint if exists code_sandbox_runtime_state_pack078_diagnostic_check,
  add constraint code_sandbox_runtime_state_pack078_diagnostic_check
    check (jsonb_typeof(last_diagnostic) = 'object');

create table if not exists public.code_repair_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.code_projects(id) on delete cascade,
  sandbox_session_id uuid not null references public.code_sandbox_sessions(id) on delete cascade,
  source_job_id uuid not null references public.code_runtime_jobs(id) on delete restrict,
  request_id text not null check (char_length(request_id) between 1 and 200),
  base_revision bigint not null check (base_revision >= 0),
  status text not null default 'analyzing'
    check (status in (
      'analyzing','repairing','retesting',
      'succeeded','failed','exhausted','cancelled'
    )),
  max_attempts integer not null default 2 check (max_attempts between 1 and 2),
  attempts_used integer not null default 0 check (attempts_used between 0 and 2),
  last_failure_fingerprint text check (
    last_failure_fingerprint is null
    or last_failure_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  final_revision bigint,
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(owner_id,request_id)
);

create table if not exists public.code_repair_attempts (
  id uuid primary key default gen_random_uuid(),
  repair_run_id uuid not null references public.code_repair_runs(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  attempt_no integer not null check (attempt_no between 1 and 2),
  failure_fingerprint text not null check (failure_fingerprint ~ '^[0-9a-f]{64}$'),
  diagnosis jsonb not null default '{}'::jsonb check (jsonb_typeof(diagnosis)='object'),
  source_job_id uuid references public.code_runtime_jobs(id) on delete set null,
  ai_edit_request_id text,
  repaired_version_id uuid references public.code_project_versions(id) on delete set null,
  retest_job_id uuid references public.code_runtime_jobs(id) on delete set null,
  status text not null default 'claimed'
    check (status in ('claimed','applied','retesting','succeeded','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(repair_run_id,attempt_no)
);

create index if not exists code_repair_runs_owner_project_idx
  on public.code_repair_runs(owner_id,project_id,created_at desc);
create index if not exists code_repair_attempts_run_idx
  on public.code_repair_attempts(repair_run_id,attempt_no);

alter table public.code_repair_runs enable row level security;
alter table public.code_repair_attempts enable row level security;

revoke all on public.code_repair_runs from public,anon,authenticated;
revoke all on public.code_repair_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.code_repair_runs to service_role;
grant select,insert,update,delete on public.code_repair_attempts to service_role;

create or replace function public.reserve_zuvyr_code_runtime_job_pack077(
  p_owner_id uuid,
  p_project_id uuid,
  p_sandbox_session_id uuid,
  p_source_job_id uuid,
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

  if v_operation not in ('terminal','dependencies','run','build','test') then
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

    if v_existing.id is not null then
      if v_existing.project_id = p_project_id
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
    end if;

    if exists (
      select 1
      from public.code_runtime_jobs
      where sandbox_session_id = p_sandbox_session_id
        and status in ('queued','running')
    ) then
      raise exception 'pack077_active_job_exists';
    end if;

    raise;
end;
$pack077_reserve$;


create or replace function public.reserve_zuvyr_code_repair_run_pack078(
  p_owner_id uuid,
  p_project_id uuid,
  p_sandbox_session_id uuid,
  p_source_job_id uuid,
  p_request_id text,
  p_base_revision bigint,
  p_failure_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack078_repair_reserve$
declare
  v_project public.code_projects%rowtype;
  v_session public.code_sandbox_sessions%rowtype;
  v_source public.code_runtime_jobs%rowtype;
  v_existing public.code_repair_runs%rowtype;
  v_run public.code_repair_runs%rowtype;
begin
  if char_length(coalesce(p_request_id,'')) not between 1 and 200 then
    raise exception 'pack078_repair_request_id_invalid';
  end if;
  if coalesce(p_failure_fingerprint,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'pack078_repair_fingerprint_invalid';
  end if;

  select * into v_project
  from public.code_projects
  where id=p_project_id and owner_id=p_owner_id and status='active'
  for update;
  if v_project.id is null then
    raise exception 'pack078_project_not_found';
  end if;
  if v_project.revision <> p_base_revision then
    raise exception 'pack078_revision_conflict';
  end if;

  select * into v_session
  from public.code_sandbox_sessions
  where id=p_sandbox_session_id
    and owner_id=p_owner_id
    and project_id=p_project_id;
  if v_session.id is null then
    raise exception 'pack078_sandbox_not_found';
  end if;

  select * into v_source
  from public.code_runtime_jobs
  where id=p_source_job_id
    and owner_id=p_owner_id
    and project_id=p_project_id
    and sandbox_session_id=p_sandbox_session_id;

  if v_source.id is null then
    raise exception 'pack078_repair_source_job_not_found';
  end if;
  if v_source.status <> 'failed'
     or v_source.operation not in ('build','test','run') then
    raise exception 'pack078_repair_source_job_invalid';
  end if;

  select * into v_existing
  from public.code_repair_runs
  where owner_id=p_owner_id and request_id=p_request_id;

  if v_existing.id is not null then
    if v_existing.project_id<>p_project_id
       or v_existing.sandbox_session_id<>p_sandbox_session_id
       or v_existing.source_job_id<>p_source_job_id
       or v_existing.base_revision<>p_base_revision then
      raise exception 'pack078_repair_idempotency_scope_mismatch';
    end if;
    return jsonb_build_object(
      'replayed',true,
      'repair_run_id',v_existing.id,
      'status',v_existing.status,
      'attempts_used',v_existing.attempts_used,
      'max_attempts',v_existing.max_attempts
    );
  end if;

  insert into public.code_repair_runs(
    owner_id,project_id,sandbox_session_id,source_job_id,request_id,
    base_revision,status,max_attempts,attempts_used,last_failure_fingerprint
  ) values (
    p_owner_id,p_project_id,p_sandbox_session_id,p_source_job_id,p_request_id,
    p_base_revision,'analyzing',2,0,p_failure_fingerprint
  )
  returning * into v_run;

  return jsonb_build_object(
    'replayed',false,
    'repair_run_id',v_run.id,
    'status',v_run.status,
    'attempts_used',v_run.attempts_used,
    'max_attempts',v_run.max_attempts
  );
exception
  when unique_violation then
    raise exception 'pack078_repair_active_conflict';
end;
$pack078_repair_reserve$;

create or replace function public.claim_zuvyr_code_repair_attempt_pack078(
  p_owner_id uuid,
  p_repair_run_id uuid,
  p_failure_fingerprint text,
  p_diagnosis jsonb,
  p_source_job_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack078_repair_claim$
declare
  v_run public.code_repair_runs%rowtype;
  v_attempt integer;
  v_row public.code_repair_attempts%rowtype;
begin
  if coalesce(p_failure_fingerprint,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'pack078_repair_fingerprint_invalid';
  end if;
  if jsonb_typeof(p_diagnosis) <> 'object' then
    raise exception 'pack078_repair_diagnosis_invalid';
  end if;

  select * into v_run
  from public.code_repair_runs
  where id=p_repair_run_id and owner_id=p_owner_id
  for update;

  if v_run.id is null then
    raise exception 'pack078_repair_run_not_found';
  end if;
  if v_run.status in ('succeeded','failed','exhausted','cancelled') then
    raise exception 'pack078_repair_terminal';
  end if;
  if v_run.attempts_used >= v_run.max_attempts then
    update public.code_repair_runs
    set status='exhausted',updated_at=now(),completed_at=now()
    where id=v_run.id;
    raise exception 'pack078_repair_exhausted';
  end if;
  if v_run.attempts_used > 0
     and v_run.last_failure_fingerprint=p_failure_fingerprint then
    update public.code_repair_runs
    set status='exhausted',updated_at=now(),completed_at=now(),
        result=result || jsonb_build_object('reason','repeated_failure_fingerprint')
    where id=v_run.id;
    raise exception 'pack078_repair_repeated_failure';
  end if;

  v_attempt:=v_run.attempts_used+1;
  insert into public.code_repair_attempts(
    repair_run_id,owner_id,attempt_no,failure_fingerprint,
    diagnosis,source_job_id,status
  ) values (
    v_run.id,p_owner_id,v_attempt,p_failure_fingerprint,
    p_diagnosis,p_source_job_id,'claimed'
  )
  returning * into v_row;

  update public.code_repair_runs
  set attempts_used=v_attempt,
      last_failure_fingerprint=p_failure_fingerprint,
      status='repairing',
      updated_at=now()
  where id=v_run.id;

  return jsonb_build_object(
    'attempt_id',v_row.id,
    'attempt_no',v_attempt,
    'max_attempts',v_run.max_attempts
  );
end;
$pack078_repair_claim$;

create or replace function public.complete_zuvyr_code_repair_attempt_pack078(
  p_owner_id uuid,
  p_attempt_id uuid,
  p_status text,
  p_ai_edit_request_id text default null,
  p_repaired_version_id uuid default null,
  p_retest_job_id uuid default null,
  p_final_revision bigint default null,
  p_result jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack078_repair_complete$
declare
  v_attempt public.code_repair_attempts%rowtype;
  v_run public.code_repair_runs%rowtype;
  v_status text:=lower(trim(coalesce(p_status,'')));
  v_run_status text;
begin
  if v_status not in ('applied','retesting','succeeded','failed') then
    raise exception 'pack078_repair_attempt_status_invalid';
  end if;
  if jsonb_typeof(coalesce(p_result,'{}'::jsonb)) <> 'object' then
    raise exception 'pack078_repair_result_invalid';
  end if;

  select * into v_attempt
  from public.code_repair_attempts
  where id=p_attempt_id and owner_id=p_owner_id
  for update;
  if v_attempt.id is null then
    raise exception 'pack078_repair_attempt_not_found';
  end if;

  select * into v_run
  from public.code_repair_runs
  where id=v_attempt.repair_run_id and owner_id=p_owner_id
  for update;
  if v_run.id is null then
    raise exception 'pack078_repair_run_not_found';
  end if;

  update public.code_repair_attempts
  set status=v_status,
      ai_edit_request_id=coalesce(p_ai_edit_request_id,ai_edit_request_id),
      repaired_version_id=coalesce(p_repaired_version_id,repaired_version_id),
      retest_job_id=coalesce(p_retest_job_id,retest_job_id),
      completed_at=case when v_status in ('succeeded','failed') then now() else completed_at end
  where id=v_attempt.id;

  v_run_status:=case
    when v_status='applied' then 'retesting'
    when v_status='retesting' then 'retesting'
    when v_status='succeeded' then 'succeeded'
    when v_status='failed' and v_run.attempts_used>=v_run.max_attempts then 'exhausted'
    else 'analyzing'
  end;

  update public.code_repair_runs
  set status=v_run_status,
      final_revision=case when v_status='succeeded' then p_final_revision else final_revision end,
      result=result || coalesce(p_result,'{}'::jsonb),
      updated_at=now(),
      completed_at=case when v_run_status in ('succeeded','exhausted') then now() else completed_at end
  where id=v_run.id;

  return jsonb_build_object(
    'repair_run_id',v_run.id,
    'attempt_id',v_attempt.id,
    'status',v_run_status,
    'attempts_used',v_run.attempts_used,
    'max_attempts',v_run.max_attempts
  );
end;
$pack078_repair_complete$;

revoke all on function public.reserve_zuvyr_code_repair_run_pack078(uuid,uuid,uuid,uuid,text,bigint,text)
  from public,anon,authenticated;
revoke all on function public.claim_zuvyr_code_repair_attempt_pack078(uuid,uuid,text,jsonb,uuid)
  from public,anon,authenticated;
revoke all on function public.complete_zuvyr_code_repair_attempt_pack078(uuid,uuid,text,text,uuid,uuid,bigint,jsonb)
  from public,anon,authenticated;

grant execute on function public.reserve_zuvyr_code_repair_run_pack078(uuid,uuid,uuid,uuid,text,bigint,text)
  to service_role;
grant execute on function public.claim_zuvyr_code_repair_attempt_pack078(uuid,uuid,text,jsonb,uuid)
  to service_role;
grant execute on function public.complete_zuvyr_code_repair_attempt_pack078(uuid,uuid,text,text,uuid,uuid,bigint,jsonb)
  to service_role;

comment on table public.code_repair_runs is
  'PACK078 bounded Code Studio critic-repair-retest runs. Hard maximum two attempts.';
comment on table public.code_repair_attempts is
  'PACK078 durable repair attempts linked to project versions and runtime jobs.';
