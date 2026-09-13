-- ZUVYR Pack038 — Step Executor / Retry / Timeout / Resume
-- Lease-token-guarded step terminal transitions for the Pack037 durable kernel.

begin;

create or replace function public.complete_zuvyr_task_step(
  p_step_id bigint,
  p_worker_owner text,
  p_lease_token uuid,
  p_output jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_step public.zuvyr_task_steps%rowtype;
  v_all_succeeded boolean := false;
begin
  update public.zuvyr_task_steps
  set state = 'succeeded',
      output = p_output,
      error_code = null,
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      last_heartbeat_at = now(),
      completed_at = now(),
      updated_at = now()
  where id = p_step_id
    and state = 'running'
    and lease_owner = btrim(p_worker_owner)
    and lease_token = p_lease_token
    and lease_expires_at > now()
  returning * into v_step;

  if v_step.id is null then
    raise exception 'pack038_step_completion_lease_not_current';
  end if;

  select not exists (
    select 1
    from public.zuvyr_task_steps s
    where s.task_run_id = v_step.task_run_id
      and s.state <> 'succeeded'
  )
  into v_all_succeeded;

  if v_all_succeeded then
    update public.zuvyr_task_runs
    set state = 'succeeded',
        final_result = jsonb_build_object(
          'lastStepKey', v_step.step_key,
          'lastOutput', p_output
        ),
        error_code = null,
        completed_at = now(),
        updated_at = now()
    where id = v_step.task_run_id
      and state not in ('failed', 'cancelled');
  else
    update public.zuvyr_task_runs
    set state = 'running',
        updated_at = now()
    where id = v_step.task_run_id
      and state not in ('failed', 'cancelled', 'succeeded');
  end if;

  return jsonb_build_object(
    'taskRunId', v_step.task_run_id,
    'stepId', v_step.id,
    'stepKey', v_step.step_key,
    'state', 'succeeded',
    'taskSucceeded', v_all_succeeded,
    'output', p_output
  );
end
$$;

create or replace function public.fail_zuvyr_task_step(
  p_step_id bigint,
  p_worker_owner text,
  p_lease_token uuid,
  p_error_code text,
  p_retryable boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_step public.zuvyr_task_steps%rowtype;
  v_retry boolean := false;
  v_error text;
begin
  v_error := btrim(coalesce(p_error_code, 'pack038_step_failed'));

  if length(v_error) < 1 or length(v_error) > 200 then
    raise exception 'pack038_step_error_code_invalid';
  end if;

  select *
  into v_step
  from public.zuvyr_task_steps
  where id = p_step_id
    and state = 'running'
    and lease_owner = btrim(p_worker_owner)
    and lease_token = p_lease_token
    and lease_expires_at > now()
  for update;

  if v_step.id is null then
    raise exception 'pack038_step_failure_lease_not_current';
  end if;

  v_retry := coalesce(p_retryable, false)
    and v_step.attempts < v_step.max_attempts;

  if v_retry then
    update public.zuvyr_task_steps
    set state = 'pending',
        error_code = v_error,
        lease_owner = null,
        lease_token = null,
        lease_expires_at = null,
        last_heartbeat_at = now(),
        updated_at = now()
    where id = v_step.id
    returning * into v_step;

    update public.zuvyr_task_runs
    set state = 'running',
        error_code = null,
        updated_at = now()
    where id = v_step.task_run_id
      and state not in ('failed', 'cancelled', 'succeeded');
  else
    update public.zuvyr_task_steps
    set state = 'failed',
        error_code = v_error,
        lease_owner = null,
        lease_token = null,
        lease_expires_at = null,
        last_heartbeat_at = now(),
        completed_at = now(),
        updated_at = now()
    where id = v_step.id
    returning * into v_step;

    update public.zuvyr_task_runs
    set state = 'failed',
        error_code = v_error,
        completed_at = now(),
        updated_at = now()
    where id = v_step.task_run_id
      and state not in ('cancelled', 'succeeded');
  end if;

  return jsonb_build_object(
    'taskRunId', v_step.task_run_id,
    'stepId', v_step.id,
    'stepKey', v_step.step_key,
    'state', v_step.state,
    'attempts', v_step.attempts,
    'maxAttempts', v_step.max_attempts,
    'willRetry', v_retry,
    'errorCode', v_error
  );
end
$$;

revoke all on function public.complete_zuvyr_task_step(bigint,text,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.fail_zuvyr_task_step(bigint,text,uuid,text,boolean)
  from public, anon, authenticated;

grant execute on function public.complete_zuvyr_task_step(bigint,text,uuid,jsonb)
  to service_role;
grant execute on function public.fail_zuvyr_task_step(bigint,text,uuid,text,boolean)
  to service_role;

commit;
