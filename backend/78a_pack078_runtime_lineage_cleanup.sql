-- ZUVYR V1 PACK078A — runtime lineage correction.
-- Corrects PACK078 after production verification found that the legacy
-- PACK077 reserve RPC remained callable and the new p_source_job_id
-- argument was not persisted to code_runtime_jobs.

alter table public.code_runtime_jobs
  add column if not exists source_job_id uuid
    references public.code_runtime_jobs(id) on delete set null;

create index if not exists code_runtime_jobs_source_job_idx
  on public.code_runtime_jobs(owner_id, project_id, source_job_id)
  where source_job_id is not null;

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
as $pack078a_reserve$
declare
  v_existing public.code_runtime_jobs%rowtype;
  v_source public.code_runtime_jobs%rowtype;
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

  if p_source_job_id is not null then
    select *
      into v_source
    from public.code_runtime_jobs
    where id = p_source_job_id
      and owner_id = p_owner_id
      and project_id = p_project_id
      and sandbox_session_id = p_sandbox_session_id;

    if v_source.id is null then
      raise exception 'pack078_runtime_source_job_not_found';
    end if;
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
       or v_existing.command_spec <> p_command_spec
       or v_existing.source_job_id is distinct from p_source_job_id then
      raise exception 'pack077_idempotency_scope_mismatch';
    end if;

    return jsonb_build_object(
      'replayed', true,
      'job_id', v_existing.id,
      'status', v_existing.status,
      'stage', v_existing.stage,
      'source_job_id', v_existing.source_job_id
    );
  end if;

  insert into public.code_runtime_jobs(
    owner_id,
    project_id,
    sandbox_session_id,
    source_job_id,
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
    p_source_job_id,
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
    'stage', v_job.stage,
    'source_job_id', v_job.source_job_id
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
         and v_existing.command_spec = p_command_spec
         and v_existing.source_job_id is not distinct from p_source_job_id then
        return jsonb_build_object(
          'replayed', true,
          'job_id', v_existing.id,
          'status', v_existing.status,
          'stage', v_existing.stage,
          'source_job_id', v_existing.source_job_id
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
$pack078a_reserve$;

-- Remove the legacy reserve path so callers cannot bypass source lineage.
drop function if exists public.reserve_zuvyr_code_runtime_job_pack077(
  uuid,uuid,uuid,text,text,jsonb,integer,text,text
);

revoke all on function public.reserve_zuvyr_code_runtime_job_pack077(
  uuid,uuid,uuid,uuid,text,text,jsonb,integer,text,text
) from public, anon, authenticated;

grant execute on function public.reserve_zuvyr_code_runtime_job_pack077(
  uuid,uuid,uuid,uuid,text,text,jsonb,integer,text,text
) to service_role;

comment on column public.code_runtime_jobs.source_job_id is
  'PACK078A lineage pointer for repair/retest runtime jobs. NULL for independent user-initiated jobs.';
