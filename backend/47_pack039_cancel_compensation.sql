-- ZUVYR Pack039 — Cancel / Compensation / Rollback
-- Additive cancellation/compensation hardening for Pack037/038 durable tasks.

begin;

alter table public.zuvyr_task_runs
  add column if not exists cancel_reason text,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_receipt jsonb,
  add column if not exists compensation_receipt jsonb,
  add column if not exists compensation_version integer not null default 0;

alter table public.zuvyr_task_steps
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_receipt jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_runs_cancel_reason_valid'
      and conrelid = 'public.zuvyr_task_runs'::regclass
  ) then
    alter table public.zuvyr_task_runs
      add constraint zuvyr_task_runs_cancel_reason_valid
      check (
        cancel_reason is null
        or length(btrim(cancel_reason)) between 1 and 500
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_runs_cancellation_receipt_object'
      and conrelid = 'public.zuvyr_task_runs'::regclass
  ) then
    alter table public.zuvyr_task_runs
      add constraint zuvyr_task_runs_cancellation_receipt_object
      check (
        cancellation_receipt is null
        or jsonb_typeof(cancellation_receipt) = 'object'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_runs_compensation_receipt_object'
      and conrelid = 'public.zuvyr_task_runs'::regclass
  ) then
    alter table public.zuvyr_task_runs
      add constraint zuvyr_task_runs_compensation_receipt_object
      check (
        compensation_receipt is null
        or jsonb_typeof(compensation_receipt) = 'object'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_runs_compensation_version_valid'
      and conrelid = 'public.zuvyr_task_runs'::regclass
  ) then
    alter table public.zuvyr_task_runs
      add constraint zuvyr_task_runs_compensation_version_valid
      check (compensation_version >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_steps_cancellation_receipt_object'
      and conrelid = 'public.zuvyr_task_steps'::regclass
  ) then
    alter table public.zuvyr_task_steps
      add constraint zuvyr_task_steps_cancellation_receipt_object
      check (
        cancellation_receipt is null
        or jsonb_typeof(cancellation_receipt) = 'object'
      );
  end if;
end
$$;

create or replace function public.request_cancel_zuvyr_task(
  p_task_run_id uuid,
  p_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.zuvyr_task_runs%rowtype;
  v_reason text;
  v_running_count integer := 0;
  v_receipt jsonb;
begin
  v_reason := btrim(coalesce(p_reason, 'user_requested'));

  if length(v_reason) < 1 or length(v_reason) > 500 then
    raise exception 'pack039_cancel_reason_invalid';
  end if;

  select *
  into v_run
  from public.zuvyr_task_runs
  where id = p_task_run_id
    and user_id = p_user_id
  for update;

  if v_run.id is null then
    raise exception 'pack039_task_not_found';
  end if;

  if v_run.state in ('succeeded', 'failed', 'cancelled') then
    return jsonb_build_object(
      'taskRunId', v_run.id,
      'accepted', false,
      'replayed', v_run.cancel_requested,
      'state', v_run.state,
      'cancelRequested', v_run.cancel_requested
    );
  end if;

  update public.zuvyr_task_runs
  set cancel_requested = true,
      cancel_reason = coalesce(cancel_reason, v_reason),
      cancel_requested_at = coalesce(cancel_requested_at, now()),
      updated_at = now()
  where id = v_run.id
  returning * into v_run;

  select count(*)
  into v_running_count
  from public.zuvyr_task_steps s
  where s.task_run_id = v_run.id
    and s.state = 'running';

  if v_running_count = 0 then
    v_receipt := jsonb_build_object(
      'version', 'pack-039.cancel-receipt.v1',
      'reason', v_run.cancel_reason,
      'phase', 'cancelled_before_active_step',
      'lateResultIgnored', false
    );

    update public.zuvyr_task_steps
    set state = 'cancelled',
        cancelled_at = now(),
        cancellation_receipt = v_receipt,
        lease_owner = null,
        lease_token = null,
        lease_expires_at = null,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where task_run_id = v_run.id
      and state in ('pending', 'running');

    update public.zuvyr_task_runs
    set state = 'cancelled',
        cancellation_receipt = v_receipt,
        cancelled_at = now(),
        completed_at = coalesce(completed_at, now()),
        final_result = jsonb_build_object(
          'cancelled', true,
          'cancellationReceipt', v_receipt
        ),
        updated_at = now()
    where id = v_run.id
    returning * into v_run;
  end if;

  return jsonb_build_object(
    'taskRunId', v_run.id,
    'accepted', true,
    'state', v_run.state,
    'cancelRequested', true,
    'reason', v_run.cancel_reason,
    'activeSteps', v_running_count
  );
end
$$;

create or replace function public.get_zuvyr_task_cancel_state(
  p_task_run_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.zuvyr_task_runs%rowtype;
begin
  select *
  into v_run
  from public.zuvyr_task_runs
  where id = p_task_run_id
    and user_id = p_user_id;

  if v_run.id is null then
    raise exception 'pack039_task_not_found';
  end if;

  return jsonb_build_object(
    'taskRunId', v_run.id,
    'state', v_run.state,
    'cancelRequested', v_run.cancel_requested,
    'reason', v_run.cancel_reason,
    'cancelRequestedAt', v_run.cancel_requested_at,
    'cancelledAt', v_run.cancelled_at,
    'cancellationReceipt', v_run.cancellation_receipt,
    'compensationReceipt', v_run.compensation_receipt
  );
end
$$;

create or replace function public.cancel_zuvyr_task_step(
  p_step_id bigint,
  p_worker_owner text,
  p_lease_token uuid,
  p_receipt jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_step public.zuvyr_task_steps%rowtype;
  v_run public.zuvyr_task_runs%rowtype;
begin
  if p_receipt is null or jsonb_typeof(p_receipt) <> 'object' then
    raise exception 'pack039_cancellation_receipt_invalid';
  end if;

  select s.*
  into v_step
  from public.zuvyr_task_steps s
  where s.id = p_step_id
    and s.state = 'running'
    and s.lease_owner = btrim(p_worker_owner)
    and s.lease_token = p_lease_token
    and s.lease_expires_at > now()
  for update;

  if v_step.id is null then
    raise exception 'pack039_cancel_lease_not_current';
  end if;

  select *
  into v_run
  from public.zuvyr_task_runs
  where id = v_step.task_run_id
  for update;

  if v_run.id is null then
    raise exception 'pack039_task_not_found';
  end if;

  if not v_run.cancel_requested then
    raise exception 'pack039_cancel_not_requested';
  end if;

  update public.zuvyr_task_steps
  set state = 'cancelled',
      cancelled_at = now(),
      cancellation_receipt = p_receipt,
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      last_heartbeat_at = now(),
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where task_run_id = v_run.id
    and state in ('pending', 'running');

  update public.zuvyr_task_runs
  set state = 'cancelled',
      cancellation_receipt = p_receipt,
      cancelled_at = now(),
      completed_at = coalesce(completed_at, now()),
      final_result = jsonb_build_object(
        'cancelled', true,
        'cancellationReceipt', p_receipt
      ),
      updated_at = now()
  where id = v_run.id
  returning * into v_run;

  return jsonb_build_object(
    'taskRunId', v_run.id,
    'stepId', v_step.id,
    'stepKey', v_step.step_key,
    'state', v_run.state,
    'cancelRequested', v_run.cancel_requested,
    'cancellationReceipt', v_run.cancellation_receipt
  );
end
$$;

create or replace function public.record_zuvyr_task_compensation(
  p_task_run_id uuid,
  p_user_id uuid,
  p_receipt jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.zuvyr_task_runs%rowtype;
begin
  if p_receipt is null or jsonb_typeof(p_receipt) <> 'object' then
    raise exception 'pack039_compensation_receipt_invalid';
  end if;

  select *
  into v_run
  from public.zuvyr_task_runs
  where id = p_task_run_id
    and user_id = p_user_id
  for update;

  if v_run.id is null then
    raise exception 'pack039_task_not_found';
  end if;

  if v_run.state <> 'cancelled' then
    raise exception 'pack039_compensation_requires_cancelled_task';
  end if;

  if v_run.compensation_receipt is not null then
    if v_run.compensation_receipt = p_receipt then
      return jsonb_build_object(
        'taskRunId', v_run.id,
        'replayed', true,
        'compensationVersion', v_run.compensation_version,
        'receipt', v_run.compensation_receipt
      );
    end if;

    raise exception 'pack039_compensation_receipt_conflict';
  end if;

  update public.zuvyr_task_runs
  set compensation_receipt = p_receipt,
      compensation_version = compensation_version + 1,
      updated_at = now()
  where id = v_run.id
  returning * into v_run;

  return jsonb_build_object(
    'taskRunId', v_run.id,
    'replayed', false,
    'compensationVersion', v_run.compensation_version,
    'receipt', v_run.compensation_receipt
  );
end
$$;

revoke all on function public.request_cancel_zuvyr_task(uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.get_zuvyr_task_cancel_state(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.cancel_zuvyr_task_step(bigint,text,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.record_zuvyr_task_compensation(uuid,uuid,jsonb)
  from public, anon, authenticated;

grant execute on function public.request_cancel_zuvyr_task(uuid,uuid,text)
  to service_role;
grant execute on function public.get_zuvyr_task_cancel_state(uuid,uuid)
  to service_role;
grant execute on function public.cancel_zuvyr_task_step(bigint,text,uuid,jsonb)
  to service_role;
grant execute on function public.record_zuvyr_task_compensation(uuid,uuid,jsonb)
  to service_role;

commit;
