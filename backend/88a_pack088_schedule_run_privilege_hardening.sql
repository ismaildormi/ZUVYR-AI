-- ZUVYR PACK088 / Phase 88A privilege hardening.
-- Keep the durable occurrence ledger append/update oriented.
begin;

revoke all on table public.workspace_schedule_runs from service_role;
grant select, insert, update on table public.workspace_schedule_runs to service_role;

commit;
