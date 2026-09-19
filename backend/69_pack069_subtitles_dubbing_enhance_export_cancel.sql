-- ZUVYR Pack069 — subtitles / dubbing / enhance / export + stable cancellation.
-- Additive / constraint-widening only. Paid provider execution remains gated
-- by application environment variables and is not enabled by this migration.

begin;

alter table public.generation_jobs
  drop constraint if exists generation_jobs_video_operation_allowed;

alter table public.generation_jobs
  add constraint generation_jobs_video_operation_allowed check (
    feature <> 'video'
    or video_operation in (
      'text_to_video',
      'image_to_video',
      'reference_to_video',
      'edit',
      'extend',
      'object_remove',
      'background_remove',
      'relight',
      'recamera',
      'lip_sync',
      'subtitles',
      'dub',
      'enhance',
      'export'
    )
  );

create or replace function public.begin_zuvyr_video_job(
  p_owner_id uuid,
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_job public.generation_jobs%rowtype;
begin
  select * into v_job
  from public.generation_jobs
  where id=p_job_id
    and user_id=p_owner_id
    and feature='video'
  for update;

  if v_job.id is null then
    raise exception 'pack069_video_job_not_found';
  end if;

  if v_job.status in ('done','failed','cancelled') then
    return jsonb_build_object(
      'claimed',false,
      'status',v_job.status,
      'stage',v_job.job_stage,
      'cancelRequested',v_job.cancel_requested
    );
  end if;

  if v_job.cancel_requested then
    update public.generation_jobs
    set status='cancelled',
        job_stage='cancelled',
        completed_at=coalesce(completed_at,now()),
        error_message=coalesce(error_message,'cancelled_by_user')
    where id=v_job.id;

    return jsonb_build_object(
      'claimed',false,
      'status','cancelled',
      'stage','cancelled',
      'cancelRequested',true
    );
  end if;

  if v_job.status='queued' then
    update public.generation_jobs
    set status='processing',
        job_stage='validating',
        progress_percent=greatest(progress_percent,5),
        started_at=coalesce(started_at,now())
    where id=v_job.id
    returning * into v_job;
  end if;

  return jsonb_build_object(
    'claimed',true,
    'status',v_job.status,
    'stage',v_job.job_stage,
    'cancelRequested',v_job.cancel_requested
  );
end
$$;

create or replace function public.claim_zuvyr_video_execution(
  p_owner_id uuid,
  p_job_id uuid,
  p_stage text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_job public.generation_jobs%rowtype;
  v_stage text:=lower(btrim(coalesce(p_stage,'')));
begin
  if v_stage not in ('provider','processing') then
    raise exception 'pack069_video_execution_stage_invalid';
  end if;

  select * into v_job
  from public.generation_jobs
  where id=p_job_id
    and user_id=p_owner_id
    and feature='video'
  for update;

  if v_job.id is null then
    raise exception 'pack069_video_job_not_found';
  end if;

  if v_job.status in ('done','failed','cancelled') or v_job.cancel_requested then
    return jsonb_build_object(
      'claimed',false,
      'status',v_job.status,
      'stage',v_job.job_stage,
      'cancelRequested',v_job.cancel_requested
    );
  end if;

  if v_job.job_stage in ('preview','export') then
    return jsonb_build_object(
      'claimed',true,
      'status',v_job.status,
      'stage',v_job.job_stage,
      'commitStarted',true,
      'cancelRequested',false
    );
  end if;

  update public.generation_jobs
  set status='processing',
      job_stage=v_stage,
      progress_percent=greatest(
        progress_percent,
        case when v_stage='provider' then 15 else 35 end
      ),
      started_at=coalesce(started_at,now())
  where id=v_job.id
  returning * into v_job;

  return jsonb_build_object(
    'claimed',true,
    'status',v_job.status,
    'stage',v_job.job_stage,
    'commitStarted',false,
    'cancelRequested',false
  );
end
$$;

create or replace function public.request_zuvyr_video_job_cancel(
  p_owner_id uuid,
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_job public.generation_jobs%rowtype;
begin
  select * into v_job
  from public.generation_jobs
  where id=p_job_id
    and user_id=p_owner_id
    and feature='video'
  for update;

  if v_job.id is null then
    raise exception 'pack069_video_job_not_found';
  end if;

  if v_job.status in ('done','failed','cancelled') then
    return jsonb_build_object(
      'accepted',false,
      'terminal',true,
      'status',v_job.status,
      'stage',v_job.job_stage,
      'refundRequired',v_job.status='cancelled'
    );
  end if;

  if v_job.job_stage in ('provider','processing','preview','export') then
    return jsonb_build_object(
      'accepted',false,
      'terminal',false,
      'status',v_job.status,
      'stage',v_job.job_stage,
      'code','video_cancel_too_late',
      'refundRequired',false
    );
  end if;

  update public.generation_jobs
  set cancel_requested=true,
      status='cancelled',
      job_stage='cancelled',
      progress_percent=0,
      completed_at=now(),
      error_message='cancelled_by_user'
  where id=v_job.id
  returning * into v_job;

  return jsonb_build_object(
    'accepted',true,
    'terminal',true,
    'status',v_job.status,
    'stage',v_job.job_stage,
    'refundRequired',true
  );
end
$$;

revoke all on function public.begin_zuvyr_video_job(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.claim_zuvyr_video_execution(uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.request_zuvyr_video_job_cancel(uuid,uuid)
  from public,anon,authenticated;

grant execute on function public.begin_zuvyr_video_job(uuid,uuid)
  to service_role;
grant execute on function public.claim_zuvyr_video_execution(uuid,uuid,text)
  to service_role;
grant execute on function public.request_zuvyr_video_job_cancel(uuid,uuid)
  to service_role;

comment on column public.generation_jobs.cancel_requested is
  'Pack069 cancellation intent. Cancellation is accepted only before provider/local execution claim; provider/processing and commit stages are too late to avoid duplicate financial outcomes.';

commit;
