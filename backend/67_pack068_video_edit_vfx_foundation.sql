-- ZUVYR Pack068 — Video Edit / Extend / VFX durable source foundation.
-- Additive trusted media-duration evidence and explicit video-operation names.
-- Paid execution remains independently environment-gated in application code.

begin;

alter table public.conversation_assets
  add column if not exists duration_seconds numeric;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversation_assets_duration_positive'
      and conrelid = 'public.conversation_assets'::regclass
  ) then
    alter table public.conversation_assets
      add constraint conversation_assets_duration_positive check (
        duration_seconds is null or duration_seconds > 0
      );
  end if;
end
$$;

update public.conversation_assets
set duration_seconds =
  (metadata->'video_options'->>'actualDurationSeconds')::numeric
where asset_type = 'video'
  and duration_seconds is null
  and lower(coalesce(metadata->>'generation_status','')) = 'done'
  and coalesce(metadata->'video_options'->>'actualDurationSeconds','')
      ~ '^[0-9]+(?:\\.[0-9]{1,3})?
    references public.conversation_assets(id) on delete set null;

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
      'enhance',
      'export'
    )
  );

comment on column public.conversation_assets.duration_seconds is
  'Server-trusted media duration. Generated videos use measured MP4 metadata; supported uploads may be measured during ingestion. Client-supplied duration is never authoritative for billing.';

comment on column public.generation_jobs.source_audio_asset_id is
  'Owner-scoped source audio attachment used by Pack068 media transforms such as lip sync.';

commit;

  and (metadata->'video_options'->>'actualDurationSeconds')::numeric > 0;

alter table public.generation_jobs
  add column if not exists source_audio_asset_id uuid
    references public.conversation_assets(id) on delete set null;

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
      'enhance',
      'export'
    )
  );

comment on column public.conversation_assets.duration_seconds is
  'Server-trusted media duration. Generated videos use measured MP4 metadata; supported uploads may be measured during ingestion. Client-supplied duration is never authoritative for billing.';

comment on column public.generation_jobs.source_audio_asset_id is
  'Owner-scoped source audio attachment used by Pack068 media transforms such as lip sync.';

commit;
