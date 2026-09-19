-- ZUVYR Pack068 follow-up — cover the source-audio FK introduced by
-- pack068_video_edit_vfx_foundation. Idempotent and data-preserving.

begin;

create index if not exists generation_jobs_source_audio_asset_idx
  on public.generation_jobs(source_audio_asset_id)
  where source_audio_asset_id is not null;

commit;
