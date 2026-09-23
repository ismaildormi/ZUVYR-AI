-- ZUVYR continuous-improvement hardening — 2026-09-23
-- Scope: preserve RLS semantics while preventing per-row auth.* re-evaluation,
-- and remove two proven-identical duplicate indexes.
-- Intentionally excludes nova8_* tables that share this Supabase project.

begin;

-- Owner-scoped SELECT/UPDATE policies: cache auth.uid() once per statement.
alter policy select_own_profile
  on public.profiles
  using ((select auth.uid()) = id);

alter policy update_own_profile
  on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

alter policy select_own_jobs
  on public.generation_jobs
  using ((select auth.uid()) = user_id);

alter policy select_own_chat_feedback
  on public.chat_response_feedback
  using ((select auth.uid()) = user_id);

alter policy audio_transcript_segments_owner_select
  on public.audio_transcript_segments
  using (owner_id = (select auth.uid()));

alter policy zuvyr_content_objects_owner_select
  on public.zuvyr_content_objects
  using (owner_id = (select auth.uid()));

alter policy zuvyr_content_versions_owner_select
  on public.zuvyr_content_versions
  using (owner_id = (select auth.uid()));

alter policy zuvyr_assets_owner_select
  on public.zuvyr_assets
  using (owner_id = (select auth.uid()));

alter policy zuvyr_asset_lineage_owner_select
  on public.zuvyr_asset_lineage
  using (owner_id = (select auth.uid()));

alter policy zuvyr_asset_egress_owner_select
  on public.zuvyr_asset_egress_events
  using (owner_id = (select auth.uid()));

-- Service-role-only policies: preserve the same deny-by-default contract while
-- caching auth.role() once per statement.
alter policy service_role_only
  on public.conversation_messages
  using ((select auth.role()) = 'service_role'::text)
  with check ((select auth.role()) = 'service_role'::text);

alter policy service_role_only
  on public.conversation_assets
  using ((select auth.role()) = 'service_role'::text)
  with check ((select auth.role()) = 'service_role'::text);

alter policy service_role_only
  on public.disk_monitor_settings
  using ((select auth.role()) = 'service_role'::text);

alter policy service_role_only
  on public.disk_usage_snapshots
  using ((select auth.role()) = 'service_role'::text);

alter policy service_role_only
  on public.disk_maintenance_log
  using ((select auth.role()) = 'service_role'::text);

alter policy service_role_only
  on public.disk_pending_confirmations
  using ((select auth.role()) = 'service_role'::text);

-- Supabase advisor confirmed these pairs are byte-for-byte equivalent indexes.
-- Keep the historically more-used canonical indexes and remove only duplicates.
drop index if exists public.zuvyr_library_owner_kind_updated_idx;
drop index if exists public.zuvyr_task_steps_run_state_idx;

commit;
