-- PACK064 Image Utility Pipeline operation constraint foundation.
-- Phase01 only: this migration is NOT auto-applied.
-- Apply only after Phase02 runtime/persistence tests pass.

begin;

alter table public.generation_jobs
  drop constraint if exists generation_jobs_image_operation_allowed;

alter table public.generation_jobs
  add constraint generation_jobs_image_operation_allowed
  check (
    feature <> 'image'
    or image_operation = any (
      array[
        'generate',
        'reference_generate',
        'edit',
        'variations',
        'remove_background',
        'upscale',
        'inpaint',
        'expand',
        'relight',
        'crop',
        'resize',
        'canvas',
        'layers',
        'text',
        'batch'
      ]::text[]
    )
  );

commit;
