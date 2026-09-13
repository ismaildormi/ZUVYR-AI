-- ZUVYR Pack043 — Projects CRUD
-- Persisted owner-scoped Projects with resource links.
-- Additive hardening over Pack09/Pack041/Pack042.
-- Browser mutation remains blocked; backend service-role writes are owner-filtered.
-- LIVE BILLING is not touched.

begin;

alter table public.workspace_items
  add column if not exists resource_type text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname='workspace_items_resource_type_allowed'
      and conrelid='public.workspace_items'::regclass
  ) then
    alter table public.workspace_items
      add constraint workspace_items_resource_type_allowed
      check (
        resource_type is null
        or resource_type in (
          'conversation','content','task','deployment','generic'
        )
      );
  end if;
end
$$;

create unique index if not exists workspace_items_owner_resource_unique
  on public.workspace_items(owner_id, resource_type, source_id)
  where resource_type is not null and source_id is not null;

create index if not exists workspace_project_items_item_idx
  on public.workspace_project_items(item_id, project_id);

alter table public.workspace_projects enable row level security;
alter table public.workspace_items enable row level security;
alter table public.workspace_project_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='workspace_projects'
      and policyname='workspace_projects_owner_select'
  ) then
    create policy workspace_projects_owner_select
      on public.workspace_projects
      for select to authenticated
      using (owner_id=auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='workspace_items'
      and policyname='workspace_items_owner_select'
  ) then
    create policy workspace_items_owner_select
      on public.workspace_items
      for select to authenticated
      using (owner_id=auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='workspace_project_items'
      and policyname='workspace_project_items_owner_select'
  ) then
    create policy workspace_project_items_owner_select
      on public.workspace_project_items
      for select to authenticated
      using (
        exists (
          select 1
          from public.workspace_projects p
          where p.id=workspace_project_items.project_id
            and p.owner_id=auth.uid()
        )
        and exists (
          select 1
          from public.workspace_items i
          where i.id=workspace_project_items.item_id
            and i.owner_id=auth.uid()
        )
      );
  end if;
end
$$;

revoke all on public.workspace_projects from anon, authenticated;
revoke all on public.workspace_items from anon, authenticated;
revoke all on public.workspace_project_items from anon, authenticated;

grant select on public.workspace_projects to authenticated;
grant select on public.workspace_items to authenticated;
grant select on public.workspace_project_items to authenticated;

-- Cross-table invariant: a project can only contain an item owned by the
-- same owner. Canonical content gets its Pack041 project_id synchronized.
-- This remains effective even if a future server bug omits an owner filter.
create or replace function public.pack043_project_item_guard()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_project_owner uuid;
  v_item_owner uuid;
  v_content_id uuid;
  v_content_project uuid;
  v_count integer;
begin
  select owner_id
  into v_project_owner
  from public.workspace_projects
  where id=new.project_id;

  select owner_id, canonical_content_id
  into v_item_owner, v_content_id
  from public.workspace_items
  where id=new.item_id;

  if v_project_owner is null or v_item_owner is null then
    raise exception 'pack043_project_item_not_found';
  end if;

  if v_project_owner <> v_item_owner then
    raise exception 'pack043_project_item_owner_mismatch';
  end if;

  if tg_op='INSERT'
     and not exists (
       select 1
       from public.workspace_project_items
       where project_id=new.project_id
         and item_id=new.item_id
     ) then
    select count(*)
    into v_count
    from public.workspace_project_items
    where project_id=new.project_id;

    if v_count >= 200 then
      raise exception 'pack043_project_item_limit';
    end if;
  end if;

  if v_content_id is not null then
    select project_id
    into v_content_project
    from public.zuvyr_content_objects
    where id=v_content_id
      and owner_id=v_project_owner
    for update;

    if not found then
      raise exception 'pack043_content_owner_mismatch';
    end if;

    if v_content_project is not null
       and v_content_project <> new.project_id then
      raise exception 'pack043_content_already_linked';
    end if;

    update public.zuvyr_content_objects
    set project_id=new.project_id,
        updated_at=now()
    where id=v_content_id
      and owner_id=v_project_owner;
  end if;

  return new;
end
$$;

drop trigger if exists pack043_project_item_guard_trg
  on public.workspace_project_items;

create trigger pack043_project_item_guard_trg
before insert or update of project_id,item_id
on public.workspace_project_items
for each row execute function public.pack043_project_item_guard();

create or replace function public.pack043_project_item_unlink_cleanup()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_owner uuid;
  v_content_id uuid;
begin
  select owner_id, canonical_content_id
  into v_owner, v_content_id
  from public.workspace_items
  where id=old.item_id;

  if v_owner is not null and v_content_id is not null then
    update public.zuvyr_content_objects
    set project_id=null,
        updated_at=now()
    where id=v_content_id
      and owner_id=v_owner
      and project_id=old.project_id;
  end if;

  return old;
end
$$;

drop trigger if exists pack043_project_item_unlink_cleanup_trg
  on public.workspace_project_items;

create trigger pack043_project_item_unlink_cleanup_trg
after delete on public.workspace_project_items
for each row execute function public.pack043_project_item_unlink_cleanup();

-- Audit project lifecycle without creating noise for updated_at-only touches.
create or replace function public.pack043_project_audit()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_event text;
begin
  if tg_op='INSERT' then
    v_event := 'project_created';
  else
    if old.name is not distinct from new.name
       and old.description is not distinct from new.description
       and old.shared_context_enabled is not distinct from new.shared_context_enabled
       and old.archived_at is not distinct from new.archived_at then
      return new;
    end if;

    if old.archived_at is null and new.archived_at is not null then
      v_event := 'project_archived';
    elsif old.archived_at is not null and new.archived_at is null then
      v_event := 'project_restored';
    else
      v_event := 'project_updated';
    end if;
  end if;

  insert into public.workspace_audit_events(
    owner_id, project_id, event_type, details, external_write_executed
  )
  values (
    new.owner_id,
    new.id,
    v_event,
    jsonb_build_object(
      'name', new.name,
      'sharedContextEnabled', new.shared_context_enabled,
      'archived', new.archived_at is not null
    ),
    false
  );

  return new;
end
$$;

drop trigger if exists pack043_project_audit_trg
  on public.workspace_projects;

create trigger pack043_project_audit_trg
after insert or update of name,description,shared_context_enabled,archived_at
on public.workspace_projects
for each row execute function public.pack043_project_audit();

create or replace function public.pack043_project_item_audit()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_item_id uuid;
  v_project_id uuid;
  v_owner uuid;
  v_resource_type text;
  v_source_id uuid;
begin
  if tg_op='DELETE' then
    v_item_id := old.item_id;
    v_project_id := old.project_id;
  else
    v_item_id := new.item_id;
    v_project_id := new.project_id;
  end if;

  select owner_id, resource_type, source_id
  into v_owner, v_resource_type, v_source_id
  from public.workspace_items
  where id=v_item_id;

  if v_owner is null then
    return coalesce(new,old);
  end if;

  insert into public.workspace_audit_events(
    owner_id, project_id, event_type, details, external_write_executed
  )
  values (
    v_owner,
    v_project_id,
    case when tg_op='DELETE'
      then 'project_item_unlinked'
      else 'project_item_linked'
    end,
    jsonb_build_object(
      'itemId', v_item_id,
      'resourceType', v_resource_type,
      'sourceId', v_source_id
    ),
    false
  );

  return coalesce(new,old);
end
$$;

drop trigger if exists pack043_project_item_audit_trg
  on public.workspace_project_items;

create trigger pack043_project_item_audit_trg
after insert or delete on public.workspace_project_items
for each row execute function public.pack043_project_item_audit();

commit;
