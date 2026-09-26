-- ZUVYR V1 quality hardening — historical backup schema isolation.
-- This is not a product PACK and does not mutate or delete archive data.
-- It codifies the production invariant that historical `zuvyr_*_backup`
-- schemas are administrator-only evidence and are not a Data API surface.
--
-- Clean installations with no historical backup schemas are a safe no-op.
-- PostgreSQL per-schema default privileges cannot subtract privileges granted
-- by global/built-in defaults (notably PUBLIC EXECUTE on functions). Therefore
-- this targeted hardening intentionally does NOT use ALTER DEFAULT PRIVILEGES.
-- The durable authority boundary is schema isolation: PUBLIC/API roles receive
-- neither USAGE nor CREATE on backup schemas. Existing objects are also revoked
-- explicitly as defense in depth. Any future privilege expansion must therefore
-- explicitly modify the schema ACL and is treated as a security-relevant change.

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
    -- Schema USAGE/CREATE is the primary authority boundary.
    execute format(
      'revoke all privileges on schema %I from public, anon, authenticated, service_role',
      backup_schema
    );

    -- Existing archive objects are explicitly private as defense in depth.
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
  end loop;
end
$$;
