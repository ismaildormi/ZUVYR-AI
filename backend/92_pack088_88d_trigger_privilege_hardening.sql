-- ZUVYR PACK088 / 88D security hardening
-- Trigger helpers are internal database plumbing only. They must never be directly
-- executable through the exposed PostgREST roles, even though they are SECURITY DEFINER.
-- Additive, idempotent, and safe for already-created triggers.

begin;

revoke execute on function public.pack088_notify_run_transition()
  from public, anon, authenticated;
revoke execute on function public.pack088_late_bind_cancel_guard()
  from public, anon, authenticated;

grant execute on function public.pack088_notify_run_transition()
  to service_role;
grant execute on function public.pack088_late_bind_cancel_guard()
  to service_role;

commit;
