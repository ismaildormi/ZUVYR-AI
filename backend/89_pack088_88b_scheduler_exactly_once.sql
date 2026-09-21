-- ZUVYR PACK088 / Phase 88B
-- Scheduler + exactly-once dispatch only.
-- No workflow execution, provider calls, or billing mutations are enabled here.

begin;

alter table public.workspace_schedule_runs
  add column if not exists queue_job_id text,
  add column if not exists dispatch_attempt_count integer not null default 0,
  add column if not exists last_dispatch_at timestamptz,
  add column if not exists dispatch_error_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedule_runs_queue_job_id_valid'
      and conrelid='public.workspace_schedule_runs'::regclass
  ) then
    alter table public.workspace_schedule_runs
      add constraint workspace_schedule_runs_queue_job_id_valid
      check (
        queue_job_id is null
        or queue_job_id ~ '^pack088-[0-9a-f-]{36}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedule_runs_dispatch_attempt_count_valid'
      and conrelid='public.workspace_schedule_runs'::regclass
  ) then
    alter table public.workspace_schedule_runs
      add constraint workspace_schedule_runs_dispatch_attempt_count_valid
      check (dispatch_attempt_count between 0 and 1000);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedule_runs_dispatch_error_valid'
      and conrelid='public.workspace_schedule_runs'::regclass
  ) then
    alter table public.workspace_schedule_runs
      add constraint workspace_schedule_runs_dispatch_error_valid
      check (
        dispatch_error_code is null
        or char_length(dispatch_error_code) between 1 and 200
      );
  end if;
end
$$;

create index if not exists workspace_schedule_runs_pending_pack088_idx
  on public.workspace_schedule_runs(scheduled_for, id)
  where state='pending';

create index if not exists workspace_schedule_runs_dispatch_pack088_idx
  on public.workspace_schedule_runs(last_dispatch_at, id)
  where state in ('pending','queued');

create or replace function public.pack088_occurrence_key(
  p_schedule_id uuid,
  p_scheduled_for timestamptz
)
returns text
language sql
immutable
set search_path=public,pg_temp
as $$
  select encode(
    digest(
      p_schedule_id::text || '|' ||
      ((extract(epoch from p_scheduled_for) * 1000000)::bigint)::text,
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function public.pack088_next_schedule_occurrence(
  p_schedule_type text,
  p_interval_minutes integer,
  p_recurrence_spec jsonb,
  p_timezone text,
  p_after timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path=public,pg_temp
as $$
declare
  v_frequency text;
  v_local_time_text text;
  v_local_time time;
  v_local_date date;
  v_candidate_date date;
  v_candidate timestamptz;
  v_day integer;
  v_offset integer;
begin
  if p_after is null then
    raise exception 'pack088_after_timestamp_required';
  end if;

  if not exists (
    select 1 from pg_timezone_names where name=p_timezone
  ) then
    raise exception 'pack088_timezone_invalid';
  end if;

  if p_schedule_type='once' then
    return null;
  end if;

  if p_schedule_type <> 'recurring' then
    raise exception 'pack088_schedule_type_invalid';
  end if;

  if p_interval_minutes is not null then
    if p_interval_minutes < 60 or p_interval_minutes > 525600 then
      raise exception 'pack088_interval_invalid';
    end if;
    return p_after + make_interval(mins => p_interval_minutes);
  end if;

  if p_recurrence_spec is null
     or jsonb_typeof(p_recurrence_spec) <> 'object' then
    raise exception 'pack088_recurrence_spec_invalid';
  end if;

  v_frequency=lower(trim(coalesce(p_recurrence_spec->>'frequency','')));
  v_local_time_text=coalesce(
    p_recurrence_spec->>'localTime',
    p_recurrence_spec->>'local_time'
  );

  if v_frequency not in ('daily','weekly') then
    raise exception 'pack088_recurrence_frequency_unsupported';
  end if;

  if v_local_time_text is null
     or v_local_time_text !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$' then
    raise exception 'pack088_recurrence_local_time_invalid';
  end if;

  v_local_time=v_local_time_text::time;
  v_local_date=(p_after at time zone p_timezone)::date;

  if v_frequency='daily' then
    v_candidate_date=v_local_date+1;
    v_candidate=(v_candidate_date::timestamp + v_local_time) at time zone p_timezone;
    return v_candidate;
  end if;

  if jsonb_typeof(p_recurrence_spec->'weekdays') <> 'array'
     or jsonb_array_length(p_recurrence_spec->'weekdays') < 1 then
    raise exception 'pack088_weekly_weekdays_required';
  end if;

  for v_offset in 1..7 loop
    v_candidate_date=v_local_date+v_offset;
    v_day=extract(isodow from v_candidate_date)::integer;

    if exists (
      select 1
      from jsonb_array_elements_text(p_recurrence_spec->'weekdays') as weekday(value)
      where weekday.value ~ '^[1-7]$'
        and weekday.value::integer=v_day
    ) then
      v_candidate=(v_candidate_date::timestamp + v_local_time) at time zone p_timezone;
      return v_candidate;
    end if;
  end loop;

  raise exception 'pack088_weekly_weekdays_invalid';
end
$$;

create or replace function public.pack088_first_future_occurrence(
  p_schedule_type text,
  p_interval_minutes integer,
  p_recurrence_spec jsonb,
  p_timezone text,
  p_after timestamptz,
  p_now timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path=public,pg_temp
as $$
declare
  v_next timestamptz;
  v_guard integer := 0;
begin
  v_next=public.pack088_next_schedule_occurrence(
    p_schedule_type,
    p_interval_minutes,
    p_recurrence_spec,
    p_timezone,
    p_after
  );

  while v_next is not null and v_next <= p_now loop
    v_guard=v_guard+1;
    if v_guard > 10000 then
      raise exception 'pack088_recurrence_advance_guard_exceeded';
    end if;

    v_next=public.pack088_next_schedule_occurrence(
      p_schedule_type,
      p_interval_minutes,
      p_recurrence_spec,
      p_timezone,
      v_next
    );
  end loop;

  return v_next;
end
$$;

create or replace function public.claim_due_workspace_schedules_pack088(
  p_limit integer default 25,
  p_now timestamptz default now()
)
returns table(
  run_id uuid,
  owner_id uuid,
  schedule_id uuid,
  workflow_id uuid,
  workflow_revision integer,
  schedule_revision integer,
  occurrence_key text,
  scheduled_for timestamptz,
  run_state text,
  created boolean
)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_schedule record;
  v_due timestamptz;
  v_first_next timestamptz;
  v_next timestamptz;
  v_key text;
  v_run_id uuid;
  v_run_state text;
  v_created boolean;
  v_limit integer;
begin
  v_limit=least(greatest(coalesce(p_limit,25),1),100);

  for v_schedule in
    select s.*
    from public.workspace_schedules s
    where s.execution_enabled=true
      and s.state in ('ready','active','running')
      and s.next_run_at is not null
      and s.next_run_at <= p_now
    order by s.next_run_at asc,s.id asc
    for update skip locked
    limit v_limit
  loop
    v_due=v_schedule.next_run_at;
    v_key=public.pack088_occurrence_key(v_schedule.id,v_due);

    v_first_next=public.pack088_next_schedule_occurrence(
      v_schedule.schedule_type,
      v_schedule.interval_minutes,
      v_schedule.recurrence_spec,
      v_schedule.timezone,
      v_due
    );

    v_next=public.pack088_first_future_occurrence(
      v_schedule.schedule_type,
      v_schedule.interval_minutes,
      v_schedule.recurrence_spec,
      v_schedule.timezone,
      v_due,
      p_now
    );

    v_run_state=case
      when v_schedule.schedule_type='recurring'
       and v_schedule.misfire_policy='skip'
       and v_first_next is not null
       and v_first_next <= p_now
      then 'skipped'
      else 'pending'
    end;

    v_created=false;
    v_run_id=null;

    insert into public.workspace_schedule_runs(
      owner_id,
      schedule_id,
      workflow_id,
      workflow_revision,
      schedule_revision,
      occurrence_key,
      scheduled_for,
      state,
      funding_state,
      completed_at
    )
    values(
      v_schedule.owner_id,
      v_schedule.id,
      v_schedule.workflow_id,
      v_schedule.workflow_revision,
      v_schedule.definition_revision,
      v_key,
      v_due,
      v_run_state,
      'not_checked',
      case when v_run_state='skipped' then p_now else null end
    )
    on conflict(schedule_id,occurrence_key) do nothing
    returning id into v_run_id;

    if v_run_id is not null then
      v_created=true;
    else
      select r.id,r.state
      into v_run_id,v_run_state
      from public.workspace_schedule_runs r
      where r.schedule_id=v_schedule.id
        and r.occurrence_key=v_key;
    end if;

    update public.workspace_schedules s
    set last_run_at=v_due,
        next_run_at=v_next,
        state=case
          when v_schedule.schedule_type='once' then 'completed'
          else 'active'
        end,
        execution_enabled=case
          when v_schedule.schedule_type='once' then false
          else true
        end,
        updated_at=p_now
    where s.id=v_schedule.id;

    run_id=v_run_id;
    owner_id=v_schedule.owner_id;
    schedule_id=v_schedule.id;
    workflow_id=v_schedule.workflow_id;
    workflow_revision=v_schedule.workflow_revision;
    schedule_revision=v_schedule.definition_revision;
    occurrence_key=v_key;
    scheduled_for=v_due;
    run_state=v_run_state;
    created=v_created;
    return next;
  end loop;

  return;
end
$$;

create or replace function public.list_pending_workspace_schedule_runs_pack088(
  p_limit integer default 100
)
returns table(
  run_id uuid,
  owner_id uuid,
  schedule_id uuid,
  workflow_id uuid,
  workflow_revision integer,
  schedule_revision integer,
  occurrence_key text,
  scheduled_for timestamptz,
  dispatch_attempt_count integer
)
language sql
security definer
set search_path=public,pg_temp
as $$
  select
    r.id,
    r.owner_id,
    r.schedule_id,
    r.workflow_id,
    r.workflow_revision,
    r.schedule_revision,
    r.occurrence_key,
    r.scheduled_for,
    r.dispatch_attempt_count
  from public.workspace_schedule_runs r
  where r.state='pending'
    and r.task_run_id is null
    and r.dispatch_attempt_count < 1000
  order by r.scheduled_for asc,r.id asc
  limit least(greatest(coalesce(p_limit,100),1),500);
$$;

create or replace function public.mark_workspace_schedule_run_queued_pack088(
  p_run_id uuid,
  p_queue_job_id text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_row public.workspace_schedule_runs%rowtype;
begin
  if p_queue_job_id is null
     or p_queue_job_id !~ '^pack088-[0-9a-f-]{36}$' then
    raise exception 'pack088_queue_job_id_invalid';
  end if;

  update public.workspace_schedule_runs
  set state='queued',
      queue_job_id=p_queue_job_id,
      queued_at=coalesce(queued_at,p_now),
      last_dispatch_at=p_now,
      dispatch_attempt_count=dispatch_attempt_count+1,
      dispatch_error_code=null,
      error_code=null,
      updated_at=p_now
  where id=p_run_id
    and state in ('pending','queued')
    and task_run_id is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'pack088_schedule_run_not_dispatchable';
  end if;

  return jsonb_build_object(
    'runId',v_row.id,
    'state',v_row.state,
    'queueJobId',v_row.queue_job_id,
    'dispatchAttemptCount',v_row.dispatch_attempt_count,
    'queuedAt',v_row.queued_at
  );
end
$$;

create or replace function public.mark_workspace_schedule_run_dispatch_error_pack088(
  p_run_id uuid,
  p_error_code text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_code text;
  v_row public.workspace_schedule_runs%rowtype;
begin
  v_code=left(trim(coalesce(p_error_code,'')),200);
  if v_code='' then
    v_code='pack088_dispatch_failed';
  end if;

  update public.workspace_schedule_runs
  set state='pending',
      last_dispatch_at=p_now,
      dispatch_attempt_count=dispatch_attempt_count+1,
      dispatch_error_code=v_code,
      error_code=v_code,
      updated_at=p_now
  where id=p_run_id
    and state in ('pending','queued')
    and task_run_id is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'pack088_schedule_run_not_recoverable';
  end if;

  return jsonb_build_object(
    'runId',v_row.id,
    'state',v_row.state,
    'dispatchAttemptCount',v_row.dispatch_attempt_count,
    'errorCode',v_row.dispatch_error_code
  );
end
$$;

revoke all on function public.pack088_occurrence_key(uuid,timestamptz)
  from public,anon,authenticated;
revoke all on function public.pack088_next_schedule_occurrence(text,integer,jsonb,text,timestamptz)
  from public,anon,authenticated;
revoke all on function public.pack088_first_future_occurrence(text,integer,jsonb,text,timestamptz,timestamptz)
  from public,anon,authenticated;
revoke all on function public.claim_due_workspace_schedules_pack088(integer,timestamptz)
  from public,anon,authenticated;
revoke all on function public.list_pending_workspace_schedule_runs_pack088(integer)
  from public,anon,authenticated;
revoke all on function public.mark_workspace_schedule_run_queued_pack088(uuid,text,timestamptz)
  from public,anon,authenticated;
revoke all on function public.mark_workspace_schedule_run_dispatch_error_pack088(uuid,text,timestamptz)
  from public,anon,authenticated;

grant execute on function public.claim_due_workspace_schedules_pack088(integer,timestamptz)
  to service_role;
grant execute on function public.list_pending_workspace_schedule_runs_pack088(integer)
  to service_role;
grant execute on function public.mark_workspace_schedule_run_queued_pack088(uuid,text,timestamptz)
  to service_role;
grant execute on function public.mark_workspace_schedule_run_dispatch_error_pack088(uuid,text,timestamptz)
  to service_role;

commit;
