-- ZUVYR Pack043 — RLS performance hardening
-- Avoid per-row auth.uid() re-evaluation for Pack043 owner policies and cover
-- project-scoped audit lookups.

begin;

drop policy if exists workspace_projects_owner_select on public.workspace_projects;
create policy workspace_projects_owner_select
  on public.workspace_projects
  for select to authenticated
  using (owner_id=(select auth.uid()));

drop policy if exists workspace_items_owner_select on public.workspace_items;
create policy workspace_items_owner_select
  on public.workspace_items
  for select to authenticated
  using (owner_id=(select auth.uid()));

drop policy if exists workspace_project_items_owner_select on public.workspace_project_items;
create policy workspace_project_items_owner_select
  on public.workspace_project_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.workspace_projects p
      where p.id=workspace_project_items.project_id
        and p.owner_id=(select auth.uid())
    )
    and exists (
      select 1
      from public.workspace_items i
      where i.id=workspace_project_items.item_id
        and i.owner_id=(select auth.uid())
    )
  );

create index if not exists workspace_audit_events_project_created_idx
  on public.workspace_audit_events(project_id, created_at desc)
  where project_id is not null;

commit;
