-- ZUVYR V1 PACK078 SECURITY FIX1
-- Removes an unused SECURITY DEFINER overload introduced by the initial
-- PACK078 migration. The canonical PACK077 reserve RPC remains untouched.
-- The removed overload is not used by runtime/repair repositories.

drop function if exists public.reserve_zuvyr_code_runtime_job_pack077(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb,
  integer,
  text,
  text
);

comment on function public.reserve_zuvyr_code_runtime_job_pack077(
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb,
  integer,
  text,
  text
) is
  'PACK077 canonical service-role-only runtime reservation RPC; PACK078 source lineage is stored in repair authority tables.';
