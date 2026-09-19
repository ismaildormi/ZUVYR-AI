-- ZUVYR Pack071 follow-up: cover audio_jobs foreign-key lookup paths.
-- Additive indexes only.

begin;

alter table public.audio_artifacts
  add column if not exists canonical_content_id uuid
    references public.zuvyr_content_objects(id) on delete set null;

create index if not exists audio_jobs_conversation_idx
  on public.audio_jobs(conversation_id)
  where conversation_id is not null;

create index if not exists audio_jobs_source_audio_asset_idx
  on public.audio_jobs(source_audio_asset_id)
  where source_audio_asset_id is not null;

create index if not exists audio_artifacts_content_idx
  on public.audio_artifacts(canonical_content_id)
  where canonical_content_id is not null;

commit;
