-- ZUVYR Pack067 — Image/Reference-to-Video durable lineage foundation.
-- Additive data shape plus an explicit operation constraint extension.
-- Paid execution remains gated in application code and pricing registry.

begin;

alter table public.generation_jobs
  add column if not exists video_reference_asset_ids jsonb
    not null default '[]'::jsonb;

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
      'subtitles',
      'enhance',
      'export'
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'generation_jobs_video_reference_assets_array'
      and conrelid = 'public.generation_jobs'::regclass
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_video_reference_assets_array check (
        jsonb_typeof(video_reference_asset_ids) = 'array'
        and jsonb_array_length(video_reference_asset_ids) <= 4
      );
  end if;
end
$$;

comment on column public.generation_jobs.video_reference_asset_ids is
  'Pack067 ordered legacy conversation asset IDs for owner-scoped reference-to-video image inputs. Canonical asset/content/version lineage is resolved and persisted by the worker.';

commit;
