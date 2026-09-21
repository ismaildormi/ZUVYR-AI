-- ZUVYR PACK088 / Phase 88A FIX1
-- Harden the durable occurrence ledger against runtime deletion/truncation.
-- PostgreSQL owner/postgres retains administrative recovery authority.

begin;

revoke all on table public.workspace_schedule_runs from service_role;
grant select, insert, update on table public.workspace_schedule_runs to service_role;

commit;
