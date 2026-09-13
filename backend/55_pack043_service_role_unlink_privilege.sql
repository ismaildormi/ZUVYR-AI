-- ZUVYR Pack043 — backend unlink privilege fix
-- Root cause from production evidence:
-- service_role had INSERT/SELECT/UPDATE on workspace_project_items,
-- but not DELETE. PACK043 unlink uses the server-side service-role client,
-- so DELETE failed while browser mutation must remain blocked.

begin;

-- Keep browser/client mutation explicitly blocked.
revoke delete on table public.workspace_project_items
  from anon, authenticated;

-- Allow only the trusted backend service-role path to unlink project items.
grant delete on table public.workspace_project_items
  to service_role;

-- Fail the migration if the intended privilege boundary is not true.
do $$
begin
  if not has_table_privilege(
    'service_role',
    'public.workspace_project_items',
    'DELETE'
  ) then
    raise exception 'pack043_service_role_delete_grant_missing';
  end if;

  if has_table_privilege(
    'anon',
    'public.workspace_project_items',
    'DELETE'
  ) then
    raise exception 'pack043_anon_delete_must_remain_blocked';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.workspace_project_items',
    'DELETE'
  ) then
    raise exception 'pack043_authenticated_delete_must_remain_blocked';
  end if;
end
$$;

commit;
