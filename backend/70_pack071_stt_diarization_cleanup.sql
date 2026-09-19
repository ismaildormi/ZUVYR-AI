-- ZUVYR Pack071 — Speech-to-Text / Diarization / Cleanup
-- Additive. Provider-paid execution remains environment-gated.

begin;

alter table public.audio_jobs
  add column if not exists canonical_content_id uuid
    references public.zuvyr_content_objects(id) on delete set null,
  add column if not exists canonical_asset_id uuid
    references public.zuvyr_assets(id) on delete set null,
  add column if not exists detected_language text,
  add column if not exists result_text text,
  add column if not exists provider_result jsonb not null default '{}'::jsonb,
  add column if not exists cancel_requested boolean not null default false;

alter table public.audio_artifacts
  add column if not exists canonical_asset_id uuid
    references public.zuvyr_assets(id) on delete set null;

alter table public.audio_artifacts
  alter column url drop not null;

create table if not exists public.audio_transcript_segments (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.audio_jobs(id) on delete cascade,
  segment_index integer not null check (segment_index >= 0),
  start_seconds numeric not null check (start_seconds >= 0),
  end_seconds numeric not null check (end_seconds >= start_seconds),
  speaker integer check (speaker is null or speaker >= 0),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  text text not null check (length(btrim(text)) between 1 and 20000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  unique (job_id, segment_index)
);

create index if not exists audio_jobs_owner_status_created_idx
  on public.audio_jobs(owner_id,status,created_at desc);
create index if not exists audio_jobs_content_idx
  on public.audio_jobs(canonical_content_id)
  where canonical_content_id is not null;
create index if not exists audio_jobs_asset_idx
  on public.audio_jobs(canonical_asset_id)
  where canonical_asset_id is not null;
create index if not exists audio_artifacts_asset_idx
  on public.audio_artifacts(canonical_asset_id)
  where canonical_asset_id is not null;

create unique index if not exists audio_artifacts_job_asset_type_unique
  on public.audio_artifacts(job_id,canonical_asset_id,asset_type)
  where canonical_asset_id is not null;
create index if not exists audio_segments_owner_job_idx
  on public.audio_transcript_segments(owner_id,job_id,segment_index);

alter table public.audio_transcript_segments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='audio_transcript_segments'
      and policyname='audio_transcript_segments_owner_select'
  ) then
    create policy audio_transcript_segments_owner_select
      on public.audio_transcript_segments
      for select to authenticated
      using (owner_id=auth.uid());
  end if;
end
$$;

revoke all on public.audio_transcript_segments from anon, authenticated;
grant select on public.audio_transcript_segments to authenticated;

create or replace function public.begin_zuvyr_audio_job(
  p_owner_id uuid,
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_job public.audio_jobs%rowtype;
begin
  select * into v_job
  from public.audio_jobs
  where id=p_job_id and owner_id=p_owner_id
  for update;

  if v_job.id is null then raise exception 'pack071_audio_job_not_found'; end if;

  if v_job.status in ('done','failed','cancelled') then
    return jsonb_build_object('claimed',false,'status',v_job.status,'stage',v_job.stage,'cancelRequested',v_job.cancel_requested);
  end if;

  if v_job.cancel_requested then
    update public.audio_jobs
    set status='cancelled',stage='cancelled',progress_percent=0,
        completed_at=coalesce(completed_at,now()),updated_at=now()
    where id=v_job.id;
    return jsonb_build_object('claimed',false,'status','cancelled','stage','cancelled','cancelRequested',true);
  end if;

  update public.audio_jobs
  set status='processing',stage='validating',
      progress_percent=greatest(progress_percent,5),updated_at=now()
  where id=v_job.id;

  return jsonb_build_object('claimed',true,'status','processing','stage','validating','cancelRequested',false);
end
$$;

create or replace function public.claim_zuvyr_audio_execution(
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
  v_job public.audio_jobs%rowtype;
  v_stage text:=lower(btrim(coalesce(p_stage,'')));
begin
  if v_stage not in ('provider','processing') then
    raise exception 'pack071_audio_execution_stage_invalid';
  end if;

  select * into v_job
  from public.audio_jobs
  where id=p_job_id and owner_id=p_owner_id
  for update;

  if v_job.id is null then raise exception 'pack071_audio_job_not_found'; end if;

  if v_job.status in ('done','failed','cancelled') or v_job.cancel_requested then
    return jsonb_build_object('claimed',false,'status',v_job.status,'stage',v_job.stage,'cancelRequested',v_job.cancel_requested);
  end if;

  update public.audio_jobs
  set status='processing',stage=v_stage,
      progress_percent=greatest(progress_percent,case when v_stage='provider' then 20 else 30 end),
      updated_at=now()
  where id=v_job.id;

  return jsonb_build_object('claimed',true,'status','processing','stage',v_stage,'cancelRequested',false);
end
$$;

create or replace function public.request_zuvyr_audio_job_cancel(
  p_owner_id uuid,
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_job public.audio_jobs%rowtype;
begin
  select * into v_job
  from public.audio_jobs
  where id=p_job_id and owner_id=p_owner_id
  for update;

  if v_job.id is null then raise exception 'pack071_audio_job_not_found'; end if;

  if v_job.status in ('done','failed','cancelled') then
    return jsonb_build_object(
      'accepted',false,'terminal',true,'status',v_job.status,'stage',v_job.stage,
      'refundRequired',v_job.status='cancelled'
    );
  end if;

  if v_job.stage in ('provider','processing','rendering','settling') then
    return jsonb_build_object(
      'accepted',false,'terminal',false,'status',v_job.status,'stage',v_job.stage,
      'code','audio_cancel_too_late','refundRequired',false
    );
  end if;

  update public.audio_jobs
  set cancel_requested=true,status='cancelled',stage='cancelled',
      progress_percent=0,completed_at=now(),updated_at=now()
  where id=v_job.id;

  return jsonb_build_object(
    'accepted',true,'terminal',true,'status','cancelled','stage','cancelled',
    'refundRequired',true
  );
end
$$;

revoke all on function public.begin_zuvyr_audio_job(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.claim_zuvyr_audio_execution(uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.request_zuvyr_audio_job_cancel(uuid,uuid)
  from public,anon,authenticated;

grant execute on function public.begin_zuvyr_audio_job(uuid,uuid) to service_role;
grant execute on function public.claim_zuvyr_audio_execution(uuid,uuid,text) to service_role;
grant execute on function public.request_zuvyr_audio_job_cancel(uuid,uuid) to service_role;

commit;
