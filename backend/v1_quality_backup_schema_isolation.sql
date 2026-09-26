-- ZUVYR V1 quality hardening — historical backup schema isolation.
-- This is not a product PACK and does not mutate or delete archive data.
-- It codifies the existing production invariant that historical `zuvyr_*_backup`
-- schemas are administrator-only evidence and are not a Data API surface.
--
-- Clean installations with no historical backup schemas are a safe no-op.

do $$
declare
  backup_schema text;
begin
  for backup_schema in
    select n.nspname
    from pg_namespace n
    where n.nspname like 'zuvyr\_%\_backup' escape '\'
    order by n.nspname
  loop
    -- Current schema/object privileges: fail closed for all API-facing roles.
    execute format(
      'revoke all privileges on schema %I from public, anon, authenticated, service_role',
      backup_schema
    );
    execute format(
      'revoke all privileges on all tables in schema %I from public, anon, authenticated, service_role',
      backup_schema
    );
    execute format(
      'revoke all privileges on all sequences in schema %I from public, anon, authenticated, service_role',
      backup_schema
    );
    execute format(
      'revoke all privileges on all functions in schema %I from public, anon, authenticated, service_role',
      backup_schema
    );

    -- Future objects added to an existing backup schema stay private as well.
    execute format(
      'alter default privileges for role postgres in schema %I revoke all privileges on tables from public, anon, authenticated, service_role',
      backup_schema
    );
    execute format(
      'alter default privileges for role postgres in schema %I revoke all privileges on sequences from public, anon, authenticated, service_role',
      backup_schema
    );
    execute format(
      'alter default privileges for role postgres in schema %I revoke all privileges on functions from public, anon, authenticated, service_role',
      backup_schema
    );
  end loop;
end
$$;
