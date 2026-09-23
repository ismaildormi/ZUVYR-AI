-- ZUVYR global cleanliness hardening — 2026-09-23
--
-- Goals:
--   1. Make existing server-only RLS intent explicit for every ZUVYR-scoped
--      public table that currently has RLS enabled and zero policies.
--   2. Add covering indexes for every currently-unindexed ZUVYR-scoped public
--      foreign key so parent updates/deletes and joins do not accumulate avoidable
--      performance debt.
--   3. Install a service-role-only runtime hygiene audit so the 30-minute
--      maintenance loop can detect future schema/security drift automatically.
--
-- Safety:
--   * nova8_* is intentionally excluded; NOVA8 is a separate product sharing DB.
--   * No tables, data, columns, constraints, functions or existing indexes are dropped.
--   * The deny policy preserves the current deny-by-default client behavior.
--   * service_role remains unaffected because it bypasses RLS.
--   * Index creation is safe as a normal migration because the live audit showed
--     max estimated rows=53 and max relation size=216 kB for affected ZUVYR tables.

-- Explicitly document server-only RLS intent without freezing future intentional
-- client access. A future PERMISSIVE allow policy can be added normally.
do $zuvyr_rls$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r'
      and n.nspname = 'public'
      and c.relrowsecurity
      and c.relname not like 'nova8\_%' escape '\'
      and not exists (
        select 1
        from pg_policy p
        where p.polrelid = c.oid
      )
    order by c.relname
  loop
    execute format(
      'create policy %I on %I.%I as permissive for all to anon, authenticated using (false) with check (false)',
      'zuvyr_server_only_deny_clients',
      r.schema_name,
      r.table_name
    );
  end loop;
end
$zuvyr_rls$;

-- Add a deterministic covering index for each foreign key whose referencing
-- columns are not already covered by the leading columns of a valid ready index.
do $zuvyr_fk_indexes$
declare
  r record;
  v_index_name text;
begin
  for r in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      con.conname,
      string_agg(format('%I', a.attname), ', ' order by u.ordinality) as column_list
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral unnest(con.conkey) with ordinality as u(attnum, ordinality)
    join pg_attribute a
      on a.attrelid = con.conrelid
     and a.attnum = u.attnum
    where con.contype = 'f'
      and n.nspname = 'public'
      and c.relname not like 'nova8\_%' escape '\'
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = con.conrelid
          and i.indisvalid
          and i.indisready
          and (i.indkey::smallint[])[0:cardinality(con.conkey)-1] @> con.conkey
          and con.conkey @> (i.indkey::smallint[])[0:cardinality(con.conkey)-1]
      )
    group by n.nspname, c.relname, con.conname
    order by c.relname, con.conname
  loop
    v_index_name := 'zuvyr_fk_' || substr(md5(r.schema_name || '.' || r.table_name || ':' || r.conname), 1, 20) || '_idx';
    execute format(
      'create index if not exists %I on %I.%I (%s)',
      v_index_name,
      r.schema_name,
      r.table_name,
      r.column_list
    );
  end loop;
end
$zuvyr_fk_indexes$;

-- Durable invariant monitor. The function is SECURITY INVOKER and is executable
-- only by service_role. It reports actionable ZUVYR drift without exposing schema
-- inventory to browser/client roles.
create or replace function public.zuvyr_runtime_hygiene_audit()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $zuvyr_hygiene$
  with rls_no_policy as (
    select c.oid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r'
      and n.nspname = 'public'
      and c.relrowsecurity
      and c.relname not like 'nova8\_%' escape '\'
      and not exists (
        select 1
        from pg_policy p
        where p.polrelid = c.oid
      )
  ),
  unindexed_fk as (
    select con.oid
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'f'
      and n.nspname = 'public'
      and c.relname not like 'nova8\_%' escape '\'
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = con.conrelid
          and i.indisvalid
          and i.indisready
          and (i.indkey::smallint[])[0:cardinality(con.conkey)-1] @> con.conkey
          and con.conkey @> (i.indkey::smallint[])[0:cardinality(con.conkey)-1]
      )
  ),
  exposed_security_definer as (
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname not like 'nova8\_%' escape '\'
      and (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ),
  counts as (
    select
      (select count(*)::integer from rls_no_policy) as rls_no_policy_count,
      (select count(*)::integer from unindexed_fk) as unindexed_fk_count,
      (select count(*)::integer from exposed_security_definer) as exposed_security_definer_count
  )
  select jsonb_build_object(
    'version', 'zuvyr-runtime-hygiene.v1',
    'ok',
      rls_no_policy_count = 0
      and unindexed_fk_count = 0
      and exposed_security_definer_count = 0,
    'rls_no_policy_count', rls_no_policy_count,
    'unindexed_fk_count', unindexed_fk_count,
    'exposed_security_definer_count', exposed_security_definer_count
  )
  from counts;
$zuvyr_hygiene$;

revoke all on function public.zuvyr_runtime_hygiene_audit()
  from public, anon, authenticated;
grant execute on function public.zuvyr_runtime_hygiene_audit()
  to service_role;
