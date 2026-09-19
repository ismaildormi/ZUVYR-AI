-- ZUVYR V1 PACK094 FIX1 — enforce append-only consent history privileges.
-- The primary PACK094 migration already intends this table to be immutable.
-- Supabase default grants may grant broader service_role privileges on new tables,
-- so explicitly revoke them before restoring append/read-only access.

revoke all on public.zuvyr_training_consent_events from service_role;
grant select, insert on public.zuvyr_training_consent_events to service_role;

revoke all on public.zuvyr_training_consent_events from public, anon, authenticated;
