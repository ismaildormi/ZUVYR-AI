-- ZUVYR PACK088 / Phase 88B FIX1
-- Disambiguate occurrence uniqueness conflict target inside PL/pgSQL claim RPC.

begin;

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
    on conflict on constraint workspace_schedule_runs_occurrence_unique do nothing
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

commit;
