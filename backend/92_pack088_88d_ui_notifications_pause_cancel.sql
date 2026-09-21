-- ZUVYR PACK088 / Phase 88D
-- User controls, exactly-once in-app notifications, and cancellation race hardening.
-- Additive only. Browser clients never receive direct scheduler-table mutation rights.

begin;

alter table public.workspace_schedules
  add column if not exists control_revision integer not null default 0;

alter table public.workspace_schedule_runs
  add column if not exists cancel_requested_at timestamptz;

alter table public.zuvyr_notifications
  add column if not exists event_key text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedules_control_revision_valid'
      and conrelid='public.workspace_schedules'::regclass
  ) then
    alter table public.workspace_schedules
      add constraint workspace_schedules_control_revision_valid
      check (control_revision >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='zuvyr_notifications_event_key_valid'
      and conrelid='public.zuvyr_notifications'::regclass
  ) then
    alter table public.zuvyr_notifications
      add constraint zuvyr_notifications_event_key_valid
      check (event_key is null or char_length(event_key) between 8 and 240);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='zuvyr_notifications_metadata_object'
      and conrelid='public.zuvyr_notifications'::regclass
  ) then
    alter table public.zuvyr_notifications
      add constraint zuvyr_notifications_metadata_object
      check (jsonb_typeof(metadata)='object');
  end if;
end
$$;

create unique index if not exists zuvyr_notifications_owner_event_pack088_idx
  on public.zuvyr_notifications(owner_id,event_key)
  where event_key is not null;

create index if not exists workspace_schedule_runs_cancel_pack088_idx
  on public.workspace_schedule_runs(schedule_id,cancel_requested_at)
  where cancel_requested_at is not null
    and state in ('claimed','running');

create or replace function public.emit_workspace_automation_notification_pack088(
  p_owner_id uuid,
  p_event_key text,
  p_title text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb,
  p_now timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
  v_key text := left(trim(coalesce(p_event_key,'')),240);
  v_title text := left(trim(coalesce(p_title,'')),120);
  v_message text := left(trim(coalesce(p_message,'')),1000);
  v_metadata jsonb := coalesce(p_metadata,'{}'::jsonb);
begin
  if p_owner_id is null then
    raise exception 'pack088_notification_owner_required';
  end if;
  if char_length(v_key) < 8 then
    raise exception 'pack088_notification_event_key_invalid';
  end if;
  if char_length(v_title) < 1 or char_length(v_message) < 1 then
    raise exception 'pack088_notification_text_invalid';
  end if;
  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'pack088_notification_metadata_invalid';
  end if;

  insert into public.zuvyr_notifications(
    owner_id,notification_type,title,message,event_key,metadata,created_at
  )
  values(
    p_owner_id,'scheduled_task',v_title,v_message,v_key,v_metadata,p_now
  )
  on conflict (owner_id,event_key) where event_key is not null do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.zuvyr_notifications
    where owner_id=p_owner_id and event_key=v_key;
  end if;

  return v_id;
end
$$;

create or replace function public.pack088_notify_run_transition()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_policy jsonb;
  v_title text;
  v_message text;
  v_event_key text;
  v_notification_id uuid;
begin
  if tg_op='UPDATE' and new.state is not distinct from old.state then
    return new;
  end if;

  select notification_policy
  into v_policy
  from public.workspace_schedules
  where id=new.schedule_id;

  if lower(coalesce(v_policy->>'in_app','true')) <> 'true' then
    return new;
  end if;

  if new.state='running' then
    v_title='Scheduled task started';
    v_message='Your scheduled task started running.';
  elsif new.state='succeeded' then
    v_title='Scheduled task completed';
    v_message='Your scheduled task completed successfully.';
  elsif new.state='failed' then
    v_title='Scheduled task failed';
    v_message='Your scheduled task failed. Open its run history for details.';
  elsif new.state='blocked_funding' then
    v_title='Scheduled task needs credits';
    v_message='The scheduled task was blocked before execution by its current funding or credit cap.';
  elsif new.state='blocked_permission' then
    v_title='Scheduled task needs permission';
    v_message='The scheduled task was blocked before execution because its authorization is no longer valid.';
  elsif new.state='cancelled' then
    v_title='Scheduled run cancelled';
    v_message='The scheduled run was cancelled.';
  else
    return new;
  end if;

  v_event_key='pack088:run:'||new.id::text||':'||new.state;
  v_notification_id=public.emit_workspace_automation_notification_pack088(
    new.owner_id,
    v_event_key,
    v_title,
    v_message,
    jsonb_build_object(
      'runId',new.id,
      'scheduleId',new.schedule_id,
      'state',new.state,
      'errorCode',new.error_code,
      'scheduledFor',new.scheduled_for
    ),
    coalesce(new.completed_at,new.updated_at,now())
  );

  if new.state in (
    'succeeded','failed','cancelled','blocked_funding','blocked_permission'
  ) and new.notification_id is distinct from v_notification_id then
    update public.workspace_schedule_runs
    set notification_id=v_notification_id
    where id=new.id
      and notification_id is distinct from v_notification_id;
  end if;

  return new;
end
$$;

drop trigger if exists trg_pack088_schedule_run_notification
  on public.workspace_schedule_runs;
create trigger trg_pack088_schedule_run_notification
after insert or update of state on public.workspace_schedule_runs
for each row execute function public.pack088_notify_run_transition();

create or replace function public.pack088_late_bind_cancel_guard()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_schedule_state text;
begin
  if new.task_run_id is null or old.task_run_id is not null then
    return new;
  end if;

  select state into v_schedule_state
  from public.workspace_schedules
  where id=new.schedule_id;

  if old.cancel_requested_at is not null or v_schedule_state='cancelled' then
    perform public.request_cancel_zuvyr_task(
      new.task_run_id,
      new.owner_id,
      'automation_schedule_cancelled'
    );
    new.cancel_requested_at=coalesce(old.cancel_requested_at,now());
  end if;

  return new;
end
$$;

drop trigger if exists trg_pack088_late_bind_cancel_guard
  on public.workspace_schedule_runs;
create trigger trg_pack088_late_bind_cancel_guard
before update of task_run_id on public.workspace_schedule_runs
for each row execute function public.pack088_late_bind_cancel_guard();

create or replace function public.check_workspace_schedule_run_control_pack088(
  p_run_id uuid,
  p_claim_token uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_run public.workspace_schedule_runs%rowtype;
  v_schedule_state text;
begin
  select * into v_run
  from public.workspace_schedule_runs
  where id=p_run_id
  for update;

  if v_run.id is null then
    raise exception 'pack088_schedule_run_not_found';
  end if;

  if v_run.claim_token is distinct from p_claim_token then
    raise exception 'pack088_schedule_run_claim_mismatch';
  end if;

  select state into v_schedule_state
  from public.workspace_schedules
  where id=v_run.schedule_id;

  if v_run.cancel_requested_at is not null or v_schedule_state='cancelled' then
    if v_run.task_run_id is null and v_run.state='claimed' then
      update public.workspace_schedule_runs
      set state='cancelled',
          error_code='pack088_schedule_cancelled',
          cancel_requested_at=coalesce(cancel_requested_at,p_now),
          completed_at=coalesce(completed_at,p_now),
          updated_at=p_now
      where id=v_run.id
      returning * into v_run;
    end if;

    return jsonb_build_object(
      'open',false,
      'runId',v_run.id,
      'state',v_run.state,
      'cancelRequested',true
    );
  end if;

  return jsonb_build_object(
    'open',true,
    'runId',v_run.id,
    'state',v_run.state,
    'cancelRequested',false
  );
end
$$;

create or replace function public.create_workspace_automation_pack088(
  p_owner_id uuid,
  p_title text,
  p_goal text,
  p_schedule_type text,
  p_run_at_local timestamp without time zone,
  p_interval_minutes integer,
  p_recurrence_spec jsonb,
  p_timezone text,
  p_max_credits_per_run integer,
  p_allow_topup boolean default false,
  p_notification_policy jsonb default '{"in_app":true}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_title text := left(trim(coalesce(p_title,'')),120);
  v_goal text := left(trim(coalesce(p_goal,'')),4000);
  v_workflow_id uuid;
  v_schedule_id uuid;
  v_run_at timestamptz;
begin
  if not exists(select 1 from public.profiles where id=p_owner_id) then
    raise exception 'pack088_owner_not_found';
  end if;
  if char_length(v_title)<1 or char_length(v_goal)<1 then
    raise exception 'pack088_automation_text_invalid';
  end if;
  if p_schedule_type not in ('once','recurring') then
    raise exception 'pack088_schedule_type_invalid';
  end if;
  if p_run_at_local is null then
    raise exception 'pack088_run_at_required';
  end if;
  if not exists(select 1 from pg_timezone_names where name=p_timezone) then
    raise exception 'pack088_timezone_invalid';
  end if;
  v_run_at=p_run_at_local at time zone p_timezone;
  if p_max_credits_per_run is null or p_max_credits_per_run<0
     or p_max_credits_per_run>10000000 then
    raise exception 'pack088_credit_cap_invalid';
  end if;
  if p_schedule_type='once' and p_interval_minutes is not null then
    raise exception 'pack088_once_interval_forbidden';
  end if;
  if p_schedule_type='recurring'
     and p_interval_minutes is null
     and coalesce(p_recurrence_spec,'{}'::jsonb)='{}'::jsonb then
    raise exception 'pack088_recurrence_spec_required';
  end if;
  if jsonb_typeof(coalesce(p_notification_policy,'{}'::jsonb))<>'object' then
    raise exception 'pack088_notification_policy_invalid';
  end if;

  insert into public.workspace_workflows(
    owner_id,name,description,execution_enabled,external_writes_enabled,request_template
  )
  values(
    p_owner_id,v_title,'Created from Scheduled Tasks',false,false,
    jsonb_build_object('goal',v_goal,'surface','chat')
  )
  returning id into v_workflow_id;

  insert into public.workspace_workflow_steps(
    workflow_id,step_key,position,capability,depends_on,execution_enabled,input_template
  )
  values(
    v_workflow_id,'main',0,'chat','{}'::text[],false,'{}'::jsonb
  );

  insert into public.workspace_schedules(
    owner_id,workflow_id,title,schedule_type,run_at,interval_minutes,timezone,
    state,execution_enabled,recurrence_spec,run_input,misfire_policy,
    max_credits_per_run,allow_topup,notification_policy
  )
  values(
    p_owner_id,v_workflow_id,v_title,p_schedule_type,v_run_at,p_interval_minutes,p_timezone,
    'draft',false,coalesce(p_recurrence_spec,'{}'::jsonb),
    jsonb_build_object('goal',v_goal,'surface','chat'),'run_once',
    p_max_credits_per_run,coalesce(p_allow_topup,false),
    coalesce(p_notification_policy,'{"in_app":true}'::jsonb)
  )
  returning id into v_schedule_id;

  return jsonb_build_object(
    'workflowId',v_workflow_id,
    'scheduleId',v_schedule_id,
    'state','draft',
    'chargedCredits',0
  );
end
$$;

create or replace function public.control_workspace_schedule_pack088(
  p_owner_id uuid,
  p_schedule_id uuid,
  p_action text,
  p_request_token uuid default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_schedule public.workspace_schedules%rowtype;
  v_workflow public.workspace_workflows%rowtype;
  v_capabilities text[];
  v_next timestamptz;
  v_digest text;
  v_control_revision integer;
  v_run_id uuid;
  v_occurrence_key text;
  v_task_ids uuid[];
  v_notification_id uuid;
begin
  select * into v_schedule
  from public.workspace_schedules
  where id=p_schedule_id and owner_id=p_owner_id
  for update;

  if v_schedule.id is null then
    raise exception 'pack088_schedule_not_found';
  end if;

  select * into v_workflow
  from public.workspace_workflows
  where id=v_schedule.workflow_id and owner_id=p_owner_id;

  if v_workflow.id is null then
    raise exception 'pack088_workflow_not_found';
  end if;

  select array_agg(distinct capability order by capability)
  into v_capabilities
  from public.workspace_workflow_steps
  where workflow_id=v_workflow.id;

  if coalesce(cardinality(v_capabilities),0)<1 then
    raise exception 'pack088_workflow_steps_required';
  end if;

  if p_action='activate' then
    if v_schedule.state='cancelled' then
      raise exception 'pack088_cancelled_schedule_terminal';
    end if;

    if v_schedule.schedule_type='once' then
      v_next=greatest(v_schedule.run_at,p_now);
    elsif v_schedule.last_run_at is null and v_schedule.run_at>p_now then
      v_next=v_schedule.run_at;
    else
      v_next=public.pack088_first_future_occurrence(
        v_schedule.schedule_type,
        v_schedule.interval_minutes,
        v_schedule.recurrence_spec,
        v_schedule.timezone,
        coalesce(v_schedule.last_run_at,v_schedule.run_at),
        p_now
      );
    end if;

    if v_next is null then
      raise exception 'pack088_next_run_required';
    end if;

    v_control_revision=v_schedule.control_revision+1;
    v_digest=encode(
      extensions.digest(
        concat_ws('|',
          p_owner_id::text,v_schedule.id::text,v_workflow.id::text,
          v_workflow.revision::text,v_schedule.definition_revision::text,
          array_to_string(v_capabilities,','),
          v_schedule.max_credits_per_run::text,
          v_schedule.allow_topup::text
        ),
        'sha256'
      ),
      'hex'
    );

    update public.workspace_workflows
    set execution_enabled=true,updated_at=p_now
    where id=v_workflow.id;

    update public.workspace_workflow_steps
    set execution_enabled=true
    where workflow_id=v_workflow.id;

    update public.workspace_schedules
    set state='active',
        execution_enabled=true,
        next_run_at=v_next,
        workflow_revision=v_workflow.revision,
        authorization_schedule_revision=definition_revision,
        authorization_digest=v_digest,
        authorization_capabilities=v_capabilities,
        authorization_external_writes=false,
        authorization_granted_at=p_now,
        authorization_expires_at=null,
        authorization_revoked_at=null,
        last_error_code=null,
        control_revision=v_control_revision,
        updated_at=p_now
    where id=v_schedule.id
    returning * into v_schedule;

    v_notification_id=public.emit_workspace_automation_notification_pack088(
      p_owner_id,
      'pack088:schedule:'||v_schedule.id::text||':activated:'||v_control_revision::text,
      'Scheduled task activated',
      'Your scheduled task is active. No credits were charged at schedule creation.',
      jsonb_build_object('scheduleId',v_schedule.id,'state',v_schedule.state,'nextRunAt',v_schedule.next_run_at),
      p_now
    );

  elsif p_action='pause' then
    if v_schedule.state not in ('ready','active','running') then
      raise exception 'pack088_schedule_not_pausable';
    end if;

    v_control_revision=v_schedule.control_revision+1;
    update public.workspace_schedules
    set state='paused',
        execution_enabled=false,
        control_revision=v_control_revision,
        updated_at=p_now
    where id=v_schedule.id
    returning * into v_schedule;

    v_notification_id=public.emit_workspace_automation_notification_pack088(
      p_owner_id,
      'pack088:schedule:'||v_schedule.id::text||':paused:'||v_control_revision::text,
      'Scheduled task paused',
      'Future runs are paused. Existing run history is preserved.',
      jsonb_build_object('scheduleId',v_schedule.id,'state',v_schedule.state),
      p_now
    );

  elsif p_action='resume' then
    if v_schedule.state<>'paused' then
      raise exception 'pack088_schedule_not_paused';
    end if;
    if v_schedule.authorization_digest is null
       or v_schedule.authorization_revoked_at is not null
       or v_schedule.workflow_revision is distinct from v_workflow.revision
       or v_schedule.authorization_schedule_revision is distinct from v_schedule.definition_revision then
      raise exception 'pack088_reactivation_required';
    end if;

    if v_schedule.schedule_type='once' then
      v_next=greatest(v_schedule.run_at,p_now);
    elsif v_schedule.last_run_at is null and v_schedule.run_at>p_now then
      v_next=v_schedule.run_at;
    else
      v_next=public.pack088_first_future_occurrence(
        v_schedule.schedule_type,
        v_schedule.interval_minutes,
        v_schedule.recurrence_spec,
        v_schedule.timezone,
        coalesce(v_schedule.last_run_at,v_schedule.run_at),
        p_now
      );
    end if;

    if v_next is null then
      raise exception 'pack088_next_run_required';
    end if;

    v_control_revision=v_schedule.control_revision+1;
    update public.workspace_schedules
    set state='active',
        execution_enabled=true,
        next_run_at=v_next,
        last_error_code=null,
        control_revision=v_control_revision,
        updated_at=p_now
    where id=v_schedule.id
    returning * into v_schedule;

    v_notification_id=public.emit_workspace_automation_notification_pack088(
      p_owner_id,
      'pack088:schedule:'||v_schedule.id::text||':resumed:'||v_control_revision::text,
      'Scheduled task resumed',
      'Future runs are active again and the next run was recomputed.',
      jsonb_build_object('scheduleId',v_schedule.id,'state',v_schedule.state,'nextRunAt',v_schedule.next_run_at),
      p_now
    );

  elsif p_action='cancel' then
    if v_schedule.state='cancelled' then
      return jsonb_build_object(
        'scheduleId',v_schedule.id,
        'state','cancelled',
        'replayed',true,
        'taskRunIds','[]'::jsonb
      );
    end if;

    v_control_revision=v_schedule.control_revision+1;

    update public.workspace_schedules
    set state='cancelled',
        execution_enabled=false,
        next_run_at=null,
        authorization_revoked_at=coalesce(authorization_revoked_at,p_now),
        last_error_code='pack088_schedule_cancelled',
        control_revision=v_control_revision,
        updated_at=p_now
    where id=v_schedule.id
    returning * into v_schedule;

    update public.workspace_schedule_runs
    set cancel_requested_at=coalesce(cancel_requested_at,p_now),
        error_code=coalesce(error_code,'pack088_schedule_cancelled'),
        updated_at=p_now
    where schedule_id=v_schedule.id
      and state in ('pending','claimed','queued','running');

    update public.workspace_schedule_runs
    set state='cancelled',
        completed_at=coalesce(completed_at,p_now),
        updated_at=p_now
    where schedule_id=v_schedule.id
      and state in ('pending','queued')
      and task_run_id is null;

    select array_agg(task_run_id order by task_run_id)
    into v_task_ids
    from public.workspace_schedule_runs
    where schedule_id=v_schedule.id
      and task_run_id is not null
      and state in ('claimed','running');

    v_notification_id=public.emit_workspace_automation_notification_pack088(
      p_owner_id,
      'pack088:schedule:'||v_schedule.id::text||':cancelled:'||v_control_revision::text,
      'Scheduled task cancelled',
      'Future runs are cancelled. Previous run history is preserved.',
      jsonb_build_object('scheduleId',v_schedule.id,'state',v_schedule.state),
      p_now
    );

  elsif p_action='run_now' then
    if p_request_token is null then
      raise exception 'pack088_run_now_request_token_required';
    end if;
    if v_schedule.execution_enabled is not true
       or v_schedule.state not in ('ready','active','running') then
      raise exception 'pack088_schedule_not_active';
    end if;
    if v_schedule.authorization_revoked_at is not null
       or v_schedule.authorization_digest is null
       or v_schedule.workflow_revision is distinct from v_workflow.revision
       or v_schedule.authorization_schedule_revision is distinct from v_schedule.definition_revision then
      raise exception 'pack088_reactivation_required';
    end if;

    v_occurrence_key=encode(
      extensions.digest(
        v_schedule.id::text||'|manual|'||p_request_token::text,
        'sha256'
      ),
      'hex'
    );

    insert into public.workspace_schedule_runs(
      owner_id,schedule_id,workflow_id,workflow_revision,schedule_revision,
      occurrence_key,scheduled_for,state,funding_state
    )
    values(
      p_owner_id,v_schedule.id,v_workflow.id,v_workflow.revision,
      v_schedule.definition_revision,v_occurrence_key,p_now,'pending','not_checked'
    )
    on conflict on constraint workspace_schedule_runs_occurrence_unique do nothing
    returning id into v_run_id;

    if v_run_id is null then
      select id into v_run_id
      from public.workspace_schedule_runs
      where schedule_id=v_schedule.id and occurrence_key=v_occurrence_key;
    end if;

  else
    raise exception 'pack088_schedule_action_invalid';
  end if;

  return jsonb_build_object(
    'scheduleId',v_schedule.id,
    'state',v_schedule.state,
    'nextRunAt',v_schedule.next_run_at,
    'controlRevision',v_schedule.control_revision,
    'runId',v_run_id,
    'notificationId',v_notification_id,
    'taskRunIds',to_jsonb(coalesce(v_task_ids,'{}'::uuid[])),
    'replayed',false
  );
end
$$;

revoke all on function public.emit_workspace_automation_notification_pack088(uuid,text,text,text,jsonb,timestamptz)
  from public,anon,authenticated;
revoke all on function public.check_workspace_schedule_run_control_pack088(uuid,uuid,timestamptz)
  from public,anon,authenticated;
revoke all on function public.create_workspace_automation_pack088(uuid,text,text,text,timestamp without time zone,integer,jsonb,text,integer,boolean,jsonb)
  from public,anon,authenticated;
revoke all on function public.control_workspace_schedule_pack088(uuid,uuid,text,uuid,timestamptz)
  from public,anon,authenticated;

grant execute on function public.emit_workspace_automation_notification_pack088(uuid,text,text,text,jsonb,timestamptz)
  to service_role;
grant execute on function public.check_workspace_schedule_run_control_pack088(uuid,uuid,timestamptz)
  to service_role;
grant execute on function public.create_workspace_automation_pack088(uuid,text,text,text,timestamp without time zone,integer,jsonb,text,integer,boolean,jsonb)
  to service_role;
grant execute on function public.control_workspace_schedule_pack088(uuid,uuid,text,uuid,timestamptz)
  to service_role;

commit;
