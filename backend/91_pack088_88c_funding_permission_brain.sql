-- ZUVYR PACK088 / Phase 88C
-- Funding + permission + Brain Kernel binding.
-- Reuses canonical usage ledger, Permission Center, PACK087 mission grants,
-- durable task kernel and Brain Kernel. No parallel billing/execution system.

begin;

alter table public.workspace_schedule_runs
  add column if not exists permission_receipt jsonb,
  add column if not exists pricing_snapshot jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedule_runs_permission_receipt_object'
      and conrelid='public.workspace_schedule_runs'::regclass
  ) then
    alter table public.workspace_schedule_runs
      add constraint workspace_schedule_runs_permission_receipt_object
      check (
        permission_receipt is null
        or jsonb_typeof(permission_receipt)='object'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedule_runs_pricing_snapshot_object'
      and conrelid='public.workspace_schedule_runs'::regclass
  ) then
    alter table public.workspace_schedule_runs
      add constraint workspace_schedule_runs_pricing_snapshot_object
      check (
        pricing_snapshot is null
        or jsonb_typeof(pricing_snapshot)='object'
      );
  end if;
end
$$;

create or replace function public.claim_workspace_schedule_run_execution_pack088(
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
  v_run public.workspace_schedule_runs%rowtype;
  v_schedule public.workspace_schedules%rowtype;
  v_workflow public.workspace_workflows%rowtype;
  v_steps jsonb;
  v_required_caps text[];
  v_claim_token uuid;
  v_block_code text;
begin
  select *
  into v_run
  from public.workspace_schedule_runs
  where id=p_run_id
  for update;

  if v_run.id is null then
    raise exception 'pack088_schedule_run_not_found';
  end if;

  if p_queue_job_id is null
     or p_queue_job_id <> v_run.queue_job_id then
    raise exception 'pack088_schedule_run_queue_job_mismatch';
  end if;

  select *
  into v_schedule
  from public.workspace_schedules
  where id=v_run.schedule_id;

  select *
  into v_workflow
  from public.workspace_workflows
  where id=v_run.workflow_id;

  if v_schedule.id is null or v_workflow.id is null then
    raise exception 'pack088_schedule_run_definition_missing';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'stepKey',s.step_key,
          'position',s.position,
          'capability',s.capability,
          'dependsOn',s.depends_on,
          'inputTemplate',s.input_template,
          'executionEnabled',s.execution_enabled
        )
        order by s.position,s.id
      ),
      '[]'::jsonb
    ),
    coalesce(
      array_agg(distinct s.capability order by s.capability),
      '{}'::text[]
    )
  into v_steps,v_required_caps
  from public.workspace_workflow_steps s
  where s.workflow_id=v_workflow.id;

  if v_run.task_run_id is not null
     or v_run.state='running' then
    return jsonb_build_object(
      'status','replay',
      'runId',v_run.id,
      'ownerId',v_run.owner_id,
      'taskRunId',v_run.task_run_id,
      'usageRecordId',v_run.usage_record_id,
      'permissionReceipt',v_run.permission_receipt,
      'pricingSnapshot',v_run.pricing_snapshot
    );
  end if;

  if v_run.state not in ('queued','claimed') then
    raise exception 'pack088_schedule_run_not_execution_claimable';
  end if;

  if v_run.owner_id <> v_schedule.owner_id
     or v_run.owner_id <> v_workflow.owner_id
     or v_run.workflow_id <> v_schedule.workflow_id then
    v_block_code='pack088_execution_owner_mismatch';
  elsif v_run.workflow_revision <> v_workflow.revision
     or v_schedule.workflow_revision <> v_workflow.revision then
    v_block_code='pack088_execution_workflow_revision_stale';
  elsif v_run.schedule_revision <> v_schedule.definition_revision
     or v_schedule.authorization_schedule_revision <> v_schedule.definition_revision then
    v_block_code='pack088_execution_schedule_revision_stale';
  elsif v_schedule.authorization_digest is null
     or v_schedule.authorization_granted_at is null then
    v_block_code='pack088_execution_authorization_missing';
  elsif v_schedule.authorization_revoked_at is not null then
    v_block_code='pack088_execution_authorization_revoked';
  elsif v_schedule.authorization_expires_at is not null
     and v_schedule.authorization_expires_at <= p_now then
    v_block_code='pack088_execution_authorization_expired';
  elsif not (v_required_caps <@ v_schedule.authorization_capabilities) then
    v_block_code='pack088_execution_capability_not_authorized';
  elsif 'ip'=any(v_required_caps)
     and v_schedule.authorized_device_id is null then
    v_block_code='pack088_execution_device_authorization_missing';
  end if;

  if v_block_code is not null then
    update public.workspace_schedule_runs
    set state='blocked_permission',
        error_code=v_block_code,
        completed_at=p_now,
        updated_at=p_now
    where id=v_run.id;

    update public.workspace_schedules
    set last_failure_at=p_now,
        last_error_code=v_block_code,
        updated_at=p_now
    where id=v_schedule.id;

    return jsonb_build_object(
      'status','blocked_permission',
      'runId',v_run.id,
      'errorCode',v_block_code
    );
  end if;

  if v_run.state='claimed' and v_run.claim_token is not null then
    v_claim_token=v_run.claim_token;
  else
    v_claim_token=gen_random_uuid();

    update public.workspace_schedule_runs
    set state='claimed',
        claim_token=v_claim_token,
        claimed_at=p_now,
        attempt_count=attempt_count+1,
        error_code=null,
        updated_at=p_now
    where id=v_run.id;
  end if;

  return jsonb_build_object(
    'status','claimed',
    'runId',v_run.id,
    'ownerId',v_run.owner_id,
    'scheduleId',v_schedule.id,
    'workflowId',v_workflow.id,
    'workflowRevision',v_workflow.revision,
    'scheduleRevision',v_schedule.definition_revision,
    'occurrenceKey',v_run.occurrence_key,
    'scheduledFor',v_run.scheduled_for,
    'claimToken',v_claim_token,
    'workflowName',v_workflow.name,
    'requestTemplate',v_workflow.request_template,
    'runInput',v_schedule.run_input,
    'steps',v_steps,
    'maxCreditsPerRun',v_schedule.max_credits_per_run,
    'allowTopup',v_schedule.allow_topup,
    'authorizationCapabilities',to_jsonb(v_schedule.authorization_capabilities),
    'authorizationExternalWrites',v_schedule.authorization_external_writes,
    'authorizedDeviceId',v_schedule.authorized_device_id,
    'authorizationExpiresAt',v_schedule.authorization_expires_at,
    'permissionReceipt',v_run.permission_receipt,
    'pricingSnapshot',v_run.pricing_snapshot
  );
end
$$;

create or replace function public.record_workspace_schedule_run_permission_pack088(
  p_run_id uuid,
  p_claim_token uuid,
  p_permission_receipt jsonb,
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
  if p_permission_receipt is null
     or jsonb_typeof(p_permission_receipt) <> 'object' then
    raise exception 'pack088_permission_receipt_invalid';
  end if;

  update public.workspace_schedule_runs
  set permission_receipt=p_permission_receipt,
      updated_at=p_now
  where id=p_run_id
    and state='claimed'
    and claim_token=p_claim_token
  returning * into v_row;

  if v_row.id is null then
    raise exception 'pack088_schedule_run_claim_mismatch';
  end if;

  return jsonb_build_object(
    'runId',v_row.id,
    'state',v_row.state,
    'permissionReceipt',v_row.permission_receipt
  );
end
$$;

create or replace function public.block_workspace_schedule_run_execution_pack088(
  p_run_id uuid,
  p_claim_token uuid,
  p_block_state text,
  p_error_code text,
  p_pricing_snapshot jsonb default null,
  p_permission_receipt jsonb default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_row public.workspace_schedule_runs%rowtype;
  v_error text;
begin
  if p_block_state not in ('blocked_funding','blocked_permission','failed') then
    raise exception 'pack088_block_state_invalid';
  end if;

  v_error=left(trim(coalesce(p_error_code,'')),200);
  if v_error='' then
    raise exception 'pack088_block_error_code_required';
  end if;

  if p_pricing_snapshot is not null
     and jsonb_typeof(p_pricing_snapshot) <> 'object' then
    raise exception 'pack088_pricing_snapshot_invalid';
  end if;

  if p_permission_receipt is not null
     and jsonb_typeof(p_permission_receipt) <> 'object' then
    raise exception 'pack088_permission_receipt_invalid';
  end if;

  update public.workspace_schedule_runs
  set state=p_block_state,
      funding_state=case
        when p_block_state='blocked_funding' then 'blocked'
        else funding_state
      end,
      error_code=v_error,
      pricing_snapshot=coalesce(p_pricing_snapshot,pricing_snapshot),
      permission_receipt=coalesce(p_permission_receipt,permission_receipt),
      completed_at=p_now,
      updated_at=p_now
  where id=p_run_id
    and state='claimed'
    and claim_token=p_claim_token
  returning * into v_row;

  if v_row.id is null then
    raise exception 'pack088_schedule_run_claim_mismatch';
  end if;

  update public.workspace_schedules
  set last_failure_at=p_now,
      last_error_code=v_error,
      updated_at=p_now
  where id=v_row.schedule_id;

  return jsonb_build_object(
    'runId',v_row.id,
    'state',v_row.state,
    'fundingState',v_row.funding_state,
    'errorCode',v_row.error_code
  );
end
$$;

create or replace function public.bind_workspace_schedule_run_task_pack088(
  p_run_id uuid,
  p_claim_token uuid,
  p_task_run_id uuid,
  p_pricing_snapshot jsonb,
  p_permission_receipt jsonb,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_run public.workspace_schedule_runs%rowtype;
  v_task public.zuvyr_task_runs%rowtype;
  v_usage public.zuvyr_usage_records%rowtype;
begin
  if p_pricing_snapshot is null
     or jsonb_typeof(p_pricing_snapshot) <> 'object' then
    raise exception 'pack088_pricing_snapshot_invalid';
  end if;

  if p_permission_receipt is null
     or jsonb_typeof(p_permission_receipt) <> 'object' then
    raise exception 'pack088_permission_receipt_invalid';
  end if;

  select *
  into v_run
  from public.workspace_schedule_runs
  where id=p_run_id
  for update;

  if v_run.id is null then
    raise exception 'pack088_schedule_run_not_found';
  end if;

  if v_run.task_run_id is not null then
    if v_run.task_run_id <> p_task_run_id then
      raise exception 'pack088_schedule_run_task_binding_conflict';
    end if;
    return jsonb_build_object(
      'runId',v_run.id,
      'state',v_run.state,
      'taskRunId',v_run.task_run_id,
      'usageRecordId',v_run.usage_record_id,
      'replayed',true
    );
  end if;

  if v_run.state <> 'claimed'
     or v_run.claim_token <> p_claim_token then
    raise exception 'pack088_schedule_run_claim_mismatch';
  end if;

  select *
  into v_task
  from public.zuvyr_task_runs
  where id=p_task_run_id
    and user_id=v_run.owner_id;

  if v_task.id is null then
    raise exception 'pack088_brain_task_not_owned';
  end if;

  if v_task.usage_record_id is null then
    raise exception 'pack088_brain_usage_not_bound';
  end if;

  select *
  into v_usage
  from public.zuvyr_usage_records
  where id=v_task.usage_record_id
    and user_id=v_run.owner_id;

  if v_usage.id is null then
    raise exception 'pack088_usage_record_not_owned';
  end if;

  if v_usage.state <> 'reserved' then
    raise exception 'pack088_usage_not_reserved';
  end if;

  update public.workspace_schedule_runs
  set state='running',
      task_run_id=v_task.id,
      usage_record_id=v_usage.id,
      funding_state='reserved',
      pricing_snapshot=p_pricing_snapshot,
      permission_receipt=p_permission_receipt,
      error_code=null,
      updated_at=p_now
  where id=v_run.id
  returning * into v_run;

  return jsonb_build_object(
    'runId',v_run.id,
    'state',v_run.state,
    'taskRunId',v_run.task_run_id,
    'usageRecordId',v_run.usage_record_id,
    'fundingState',v_run.funding_state,
    'replayed',false
  );
end
$$;

create or replace function public.finalize_workspace_schedule_run_from_task_pack088(
  p_task_run_id uuid,
  p_task_state text,
  p_funding_state text,
  p_error_code text default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_run public.workspace_schedule_runs%rowtype;
  v_state text;
  v_error text;
begin
  if p_task_state not in ('succeeded','failed','cancelled') then
    raise exception 'pack088_task_terminal_state_invalid';
  end if;

  if p_funding_state not in ('settled','refunded') then
    raise exception 'pack088_task_funding_state_invalid';
  end if;

  select *
  into v_run
  from public.workspace_schedule_runs
  where task_run_id=p_task_run_id
  for update;

  if v_run.id is null then
    return jsonb_build_object(
      'linked',false,
      'taskRunId',p_task_run_id
    );
  end if;

  v_state=p_task_state;
  v_error=case
    when p_task_state='succeeded' then null
    else left(trim(coalesce(p_error_code,p_task_state)),200)
  end;

  update public.workspace_schedule_runs
  set state=v_state,
      funding_state=p_funding_state,
      error_code=v_error,
      completed_at=coalesce(completed_at,p_now),
      updated_at=p_now
  where id=v_run.id
  returning * into v_run;

  update public.workspace_schedules
  set last_success_at=case when v_state='succeeded' then p_now else last_success_at end,
      last_failure_at=case when v_state in ('failed','cancelled') then p_now else last_failure_at end,
      last_error_code=v_error,
      updated_at=p_now
  where id=v_run.schedule_id;

  return jsonb_build_object(
    'linked',true,
    'runId',v_run.id,
    'state',v_run.state,
    'fundingState',v_run.funding_state,
    'taskRunId',v_run.task_run_id
  );
end
$$;

revoke all on function public.claim_workspace_schedule_run_execution_pack088(uuid,text,timestamptz)
  from public,anon,authenticated;
revoke all on function public.record_workspace_schedule_run_permission_pack088(uuid,uuid,jsonb,timestamptz)
  from public,anon,authenticated;
revoke all on function public.block_workspace_schedule_run_execution_pack088(uuid,uuid,text,text,jsonb,jsonb,timestamptz)
  from public,anon,authenticated;
revoke all on function public.bind_workspace_schedule_run_task_pack088(uuid,uuid,uuid,jsonb,jsonb,timestamptz)
  from public,anon,authenticated;
revoke all on function public.finalize_workspace_schedule_run_from_task_pack088(uuid,text,text,text,timestamptz)
  from public,anon,authenticated;

grant execute on function public.claim_workspace_schedule_run_execution_pack088(uuid,text,timestamptz)
  to service_role;
grant execute on function public.record_workspace_schedule_run_permission_pack088(uuid,uuid,jsonb,timestamptz)
  to service_role;
grant execute on function public.block_workspace_schedule_run_execution_pack088(uuid,uuid,text,text,jsonb,jsonb,timestamptz)
  to service_role;
grant execute on function public.bind_workspace_schedule_run_task_pack088(uuid,uuid,uuid,jsonb,jsonb,timestamptz)
  to service_role;
grant execute on function public.finalize_workspace_schedule_run_from_task_pack088(uuid,text,text,text,timestamptz)
  to service_role;

commit;
