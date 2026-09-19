-- ZUVYR V1 PACK083 — 3D Generation authority.
-- Additive migration over generation_jobs/canonical assets.
-- Paid execution remains fail-closed until M18 + billing/provider gates.

alter table public.generation_jobs
  add column if not exists model3d_operation text,
  add column if not exists model3d_input_views jsonb not null default '{}'::jsonb,
  add column if not exists model3d_options jsonb not null default '{}'::jsonb,
  add column if not exists model3d_submission_started_at timestamptz,
  add column if not exists model3d_provider_request_id text,
  add column if not exists model3d_provider_result jsonb,
  add column if not exists model3d_output_manifest jsonb not null default '[]'::jsonb,
  add column if not exists model3d_execution_claimed_at timestamptz;

do $pack083_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.generation_jobs'::regclass
      and conname='generation_jobs_model3d_operation_allowed'
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_model3d_operation_allowed
      check (
        model3d_operation is null or
        model3d_operation in ('text_to_3d','image_to_3d','multiview_to_3d')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.generation_jobs'::regclass
      and conname='generation_jobs_model3d_views_object'
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_model3d_views_object
      check (
        jsonb_typeof(model3d_input_views)='object'
        and jsonb_object_length(model3d_input_views) <= 8
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.generation_jobs'::regclass
      and conname='generation_jobs_model3d_options_object'
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_model3d_options_object
      check (jsonb_typeof(model3d_options)='object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.generation_jobs'::regclass
      and conname='generation_jobs_model3d_provider_result_object'
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_model3d_provider_result_object
      check (
        model3d_provider_result is null or
        jsonb_typeof(model3d_provider_result)='object'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.generation_jobs'::regclass
      and conname='generation_jobs_model3d_manifest_array'
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_model3d_manifest_array
      check (
        jsonb_typeof(model3d_output_manifest)='array'
        and jsonb_array_length(model3d_output_manifest) <= 12
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.generation_jobs'::regclass
      and conname='generation_jobs_model3d_feature_contract'
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_model3d_feature_contract
      check (
        feature <> '3d' or (
          model3d_operation is not null and
          jsonb_typeof(model3d_options)='object' and
          jsonb_typeof(model3d_input_views)='object'
        )
      );
  end if;
end
$pack083_constraints$;

-- Conversation messages may now point at a canonical generated 3D asset.
alter table public.conversation_assets
  drop constraint if exists conversation_assets_asset_type_check;

alter table public.conversation_assets
  add constraint conversation_assets_asset_type_check
  check (
    asset_type = any (
      array[
        'image'::text,
        'video'::text,
        'audio'::text,
        'file'::text,
        'code'::text,
        'reference'::text,
        'model3d'::text
      ]
    )
  );

create index if not exists generation_jobs_model3d_owner_created_idx
  on public.generation_jobs(user_id,created_at desc)
  where feature='3d';

create unique index if not exists generation_jobs_model3d_provider_request_unique
  on public.generation_jobs(model3d_provider_request_id)
  where model3d_provider_request_id is not null;

create or replace function public.claim_zuvyr_model3d_execution_pack083(
  p_job_id uuid,
  p_owner_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack083_claim$
declare
  v_job public.generation_jobs%rowtype;
  v_now timestamptz := now();
begin
  select * into v_job
  from public.generation_jobs
  where id=p_job_id
    and user_id=p_owner_id
    and feature='3d'
  for update;

  if v_job.id is null then
    raise exception 'pack083_model3d_job_not_found';
  end if;

  if v_job.status in ('done','failed','cancelled') then
    return jsonb_build_object(
      'accepted',false,
      'terminal',true,
      'status',v_job.status,
      'claimed',v_job.model3d_execution_claimed_at is not null,
      'providerRequestId',v_job.model3d_provider_request_id
    );
  end if;

  if v_job.cancel_requested is true
     and v_job.model3d_execution_claimed_at is null then
    update public.generation_jobs
    set
      status='cancelled',
      job_stage='cancelled',
      completed_at=v_now,
      error_message='cancelled_before_provider_execution'
    where id=v_job.id
    returning * into v_job;

    return jsonb_build_object(
      'accepted',false,
      'terminal',true,
      'status','cancelled',
      'refundRequired',true,
      'claimed',false
    );
  end if;

  if v_job.model3d_execution_claimed_at is not null then
    return jsonb_build_object(
      'accepted',false,
      'terminal',false,
      'status',v_job.status,
      'claimed',true,
      'submissionStarted',v_job.model3d_submission_started_at is not null,
      'providerRequestId',v_job.model3d_provider_request_id,
      'providerResultStored',v_job.model3d_provider_result is not null
    );
  end if;

  update public.generation_jobs
  set
    model3d_execution_claimed_at=v_now,
    status='processing',
    job_stage='validating',
    started_at=coalesce(started_at,v_now),
    progress_percent=greatest(coalesce(progress_percent,0),5)
  where id=v_job.id
  returning * into v_job;

  return jsonb_build_object(
    'accepted',true,
    'terminal',false,
    'status',v_job.status,
    'claimed',true,
    'submissionStarted',false,
    'providerRequestId',null,
    'providerResultStored',false
  );
end;
$pack083_claim$;

create or replace function public.mark_zuvyr_model3d_submission_started_pack083(
  p_job_id uuid,
  p_owner_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack083_submission_started$
declare
  v_job public.generation_jobs%rowtype;
  v_now timestamptz := now();
begin
  select * into v_job
  from public.generation_jobs
  where id=p_job_id and user_id=p_owner_id and feature='3d'
  for update;

  if v_job.id is null then
    raise exception 'pack083_model3d_job_not_found';
  end if;
  if v_job.model3d_execution_claimed_at is null then
    raise exception 'pack083_model3d_execution_not_claimed';
  end if;
  if v_job.status in ('done','failed','cancelled') then
    raise exception 'pack083_model3d_job_terminal';
  end if;
  if v_job.model3d_provider_request_id is not null then
    return jsonb_build_object(
      'replayed',true,
      'providerRequestId',v_job.model3d_provider_request_id
    );
  end if;
  if v_job.model3d_submission_started_at is not null then
    raise exception 'pack083_model3d_submission_outcome_uncertain';
  end if;

  update public.generation_jobs
  set
    model3d_submission_started_at=v_now,
    job_stage='provider',
    progress_percent=greatest(coalesce(progress_percent,0),15)
  where id=v_job.id;

  return jsonb_build_object('replayed',false,'submissionStartedAt',v_now);
end;
$pack083_submission_started$;

create or replace function public.record_zuvyr_model3d_provider_request_pack083(
  p_job_id uuid,
  p_owner_id uuid,
  p_provider_request_id text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack083_record_provider$
declare
  v_job public.generation_jobs%rowtype;
  v_request text := btrim(coalesce(p_provider_request_id,''));
begin
  if char_length(v_request) not between 6 and 200 then
    raise exception 'pack083_model3d_provider_request_invalid';
  end if;

  select * into v_job
  from public.generation_jobs
  where id=p_job_id and user_id=p_owner_id and feature='3d'
  for update;

  if v_job.id is null then
    raise exception 'pack083_model3d_job_not_found';
  end if;
  if v_job.model3d_submission_started_at is null then
    raise exception 'pack083_model3d_submission_not_started';
  end if;
  if v_job.model3d_provider_request_id is not null then
    if v_job.model3d_provider_request_id <> v_request then
      raise exception 'pack083_model3d_provider_request_conflict';
    end if;
    return jsonb_build_object('replayed',true,'providerRequestId',v_request);
  end if;

  update public.generation_jobs
  set
    model3d_provider_request_id=v_request,
    job_stage='provider',
    progress_percent=greatest(coalesce(progress_percent,0),20)
  where id=v_job.id;

  return jsonb_build_object('replayed',false,'providerRequestId',v_request);
end;
$pack083_record_provider$;

create or replace function public.record_zuvyr_model3d_provider_result_pack083(
  p_job_id uuid,
  p_owner_id uuid,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack083_record_result$
declare
  v_job public.generation_jobs%rowtype;
begin
  if jsonb_typeof(p_result) <> 'object' then
    raise exception 'pack083_model3d_provider_result_invalid';
  end if;

  select * into v_job
  from public.generation_jobs
  where id=p_job_id and user_id=p_owner_id and feature='3d'
  for update;

  if v_job.id is null then
    raise exception 'pack083_model3d_job_not_found';
  end if;
  if v_job.model3d_provider_request_id is null then
    raise exception 'pack083_model3d_provider_request_missing';
  end if;
  if v_job.model3d_provider_result is not null then
    return jsonb_build_object('replayed',true);
  end if;
  if v_job.status in ('done','failed','cancelled') then
    raise exception 'pack083_model3d_job_terminal';
  end if;

  update public.generation_jobs
  set
    model3d_provider_result=p_result,
    job_stage='processing',
    progress_percent=greatest(coalesce(progress_percent,0),60)
  where id=v_job.id;

  return jsonb_build_object('replayed',false);
end;
$pack083_record_result$;

create or replace function public.request_zuvyr_model3d_job_cancel_pack083(
  p_job_id uuid,
  p_owner_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack083_cancel$
declare
  v_job public.generation_jobs%rowtype;
  v_now timestamptz := now();
begin
  select * into v_job
  from public.generation_jobs
  where id=p_job_id and user_id=p_owner_id and feature='3d'
  for update;

  if v_job.id is null then
    raise exception 'pack083_model3d_job_not_found';
  end if;

  if v_job.status='cancelled' then
    return jsonb_build_object(
      'accepted',true,'status','cancelled','refundRequired',true,'replayed',true
    );
  end if;

  if v_job.status in ('done','failed') then
    return jsonb_build_object(
      'accepted',false,'status',v_job.status,'terminal',true
    );
  end if;

  if v_job.model3d_execution_claimed_at is not null then
    update public.generation_jobs
    set cancel_requested=true
    where id=v_job.id;
    return jsonb_build_object(
      'accepted',false,
      'status',v_job.status,
      'tooLate',true,
      'providerRequestId',v_job.model3d_provider_request_id
    );
  end if;

  update public.generation_jobs
  set
    cancel_requested=true,
    status='cancelled',
    job_stage='cancelled',
    completed_at=v_now,
    error_message='cancelled_before_provider_execution'
  where id=v_job.id;

  return jsonb_build_object(
    'accepted',true,
    'status','cancelled',
    'refundRequired',true,
    'replayed',false
  );
end;
$pack083_cancel$;

revoke all on function public.claim_zuvyr_model3d_execution_pack083(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.mark_zuvyr_model3d_submission_started_pack083(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.record_zuvyr_model3d_provider_request_pack083(uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.record_zuvyr_model3d_provider_result_pack083(uuid,uuid,jsonb)
  from public,anon,authenticated;
revoke all on function public.request_zuvyr_model3d_job_cancel_pack083(uuid,uuid)
  from public,anon,authenticated;

grant execute on function public.claim_zuvyr_model3d_execution_pack083(uuid,uuid)
  to service_role;
grant execute on function public.mark_zuvyr_model3d_submission_started_pack083(uuid,uuid)
  to service_role;
grant execute on function public.record_zuvyr_model3d_provider_request_pack083(uuid,uuid,text)
  to service_role;
grant execute on function public.record_zuvyr_model3d_provider_result_pack083(uuid,uuid,jsonb)
  to service_role;
grant execute on function public.request_zuvyr_model3d_job_cancel_pack083(uuid,uuid)
  to service_role;

comment on column public.generation_jobs.model3d_submission_started_at is
  'PACK083 uncertainty guard: once set without a provider request id, workers must never blindly resubmit a paid provider request.';
comment on column public.generation_jobs.model3d_provider_result is
  'PACK083 normalized provider result persisted before canonical artifact storage so worker retries never require a second generation.';
