-- ZUVYR Pack043 — Trigger function privilege hardening
-- Trigger functions are internal implementation details and must not be exposed
-- as callable RPCs to anonymous or authenticated users.

begin;

revoke all on function public.pack041_audio_artifact_content() from public, anon, authenticated;
revoke all on function public.pack041_code_version_content() from public, anon, authenticated;
revoke all on function public.pack041_conversation_asset_content() from public, anon, authenticated;
revoke all on function public.pack041_generation_job_content() from public, anon, authenticated;
revoke all on function public.pack041_task_step_content() from public, anon, authenticated;
revoke all on function public.pack041_workspace_item_content() from public, anon, authenticated;

revoke all on function public.pack043_project_audit() from public, anon, authenticated;
revoke all on function public.pack043_project_item_audit() from public, anon, authenticated;
revoke all on function public.pack043_project_item_guard() from public, anon, authenticated;
revoke all on function public.pack043_project_item_unlink_cleanup() from public, anon, authenticated;

commit;
