-- ZUVYR Pack045 — Memory / Personal Intelligence
-- Structured account/project memory, versioned edit/undo, hard forget,
-- reviewable retrieval, project linking, and independent training consent.
begin;

create table if not exists public.zuvyr_memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.workspace_projects(id) on delete cascade,
  scope text not null default 'account',
  category text not null,
  content text not null,
  source_system text,
  source_id text,
  metadata jsonb not null default '{}'::jsonb,
  current_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zuvyr_memories_scope_allowed
    check (scope in ('account','project')),
  constraint zuvyr_memories_scope_project
    check (
      (scope='account' and project_id is null)
      or
      (scope='project' and project_id is not null)
    ),
  constraint zuvyr_memories_category_allowed
    check (category in (
      'preference','profile','goal','decision','constraint',
      'fact','relationship','workflow','project_context'
    )),
  constraint zuvyr_memories_content_valid
    check (length(btrim(content)) between 1 and 12000),
  constraint zuvyr_memories_source_system_valid
    check (
      source_system is null
      or length(btrim(source_system)) between 1 and 80
    ),
  constraint zuvyr_memories_source_id_valid
    check (
      source_id is null
      or length(btrim(source_id)) between 1 and 500
    ),
  constraint zuvyr_memories_metadata_object
    check (jsonb_typeof(metadata)='object'),
  constraint zuvyr_memories_current_version_valid
    check (current_version >= 1)
);

create table if not exists public.zuvyr_memory_versions (
  id bigint generated always as identity primary key,
  memory_id uuid not null references public.zuvyr_memories(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  version_number integer not null,
  project_id uuid references public.workspace_projects(id) on delete cascade,
  scope text not null,
  category text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint zuvyr_memory_versions_unique unique(memory_id,version_number),
  constraint zuvyr_memory_versions_scope_allowed
    check (scope in ('account','project')),
  constraint zuvyr_memory_versions_category_allowed
    check (category in (
      'preference','profile','goal','decision','constraint',
      'fact','relationship','workflow','project_context'
    )),
  constraint zuvyr_memory_versions_metadata_object
    check (jsonb_typeof(metadata)='object')
);

create table if not exists public.zuvyr_memory_audit_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  memory_id uuid not null,
  project_id uuid,
  scope text not null,
  category text not null,
  event_type text not null,
  version_number integer,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint zuvyr_memory_audit_event_allowed
    check (event_type in ('created','updated','undo','forgotten')),
  constraint zuvyr_memory_audit_details_object
    check (jsonb_typeof(details)='object')
);

create index if not exists zuvyr_memories_owner_updated_idx
  on public.zuvyr_memories(owner_id, updated_at desc);
create index if not exists zuvyr_memories_owner_category_updated_idx
  on public.zuvyr_memories(owner_id, category, updated_at desc);
create index if not exists zuvyr_memories_owner_project_updated_idx
  on public.zuvyr_memories(owner_id, project_id, updated_at desc)
  where project_id is not null;
create index if not exists zuvyr_memories_search_idx
  on public.zuvyr_memories using gin (
    to_tsvector(
      'simple'::regconfig,
      coalesce(content,'') || ' ' ||
      coalesce(category,'') || ' ' ||
      coalesce(source_system,'')
    )
  );
create index if not exists zuvyr_memory_versions_memory_version_idx
  on public.zuvyr_memory_versions(memory_id, version_number desc);
create index if not exists zuvyr_memory_audit_owner_created_idx
  on public.zuvyr_memory_audit_events(owner_id, created_at desc);

alter table public.zuvyr_memories enable row level security;
alter table public.zuvyr_memory_versions enable row level security;
alter table public.zuvyr_memory_audit_events enable row level security;

drop policy if exists zuvyr_memories_owner_select on public.zuvyr_memories;
create policy zuvyr_memories_owner_select
  on public.zuvyr_memories for select to authenticated
  using (owner_id=(select auth.uid()));

drop policy if exists zuvyr_memory_versions_owner_select on public.zuvyr_memory_versions;
create policy zuvyr_memory_versions_owner_select
  on public.zuvyr_memory_versions for select to authenticated
  using (owner_id=(select auth.uid()));

drop policy if exists zuvyr_memory_audit_owner_select on public.zuvyr_memory_audit_events;
create policy zuvyr_memory_audit_owner_select
  on public.zuvyr_memory_audit_events for select to authenticated
  using (owner_id=(select auth.uid()));

revoke all on public.zuvyr_memories from anon, authenticated;
revoke all on public.zuvyr_memory_versions from anon, authenticated;
revoke all on public.zuvyr_memory_audit_events from anon, authenticated;
grant select on public.zuvyr_memories to authenticated;
grant select on public.zuvyr_memory_versions to authenticated;
grant select on public.zuvyr_memory_audit_events to authenticated;

create or replace function public.pack045_memory_scope_guard()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_owner uuid;
  v_archived timestamptz;
begin
  if new.scope='account' then
    if new.project_id is not null then
      raise exception 'memory_account_scope_project_forbidden';
    end if;
    return new;
  end if;

  if new.project_id is null then
    raise exception 'memory_project_scope_requires_project';
  end if;

  select owner_id, archived_at
    into v_owner, v_archived
  from public.workspace_projects
  where id=new.project_id;

  if v_owner is null or v_owner <> new.owner_id then
    raise exception 'memory_project_owner_mismatch';
  end if;

  if v_archived is not null then
    raise exception 'memory_project_archived';
  end if;

  return new;
end;
$$;

drop trigger if exists pack045_memory_scope_guard_trg on public.zuvyr_memories;
create trigger pack045_memory_scope_guard_trg
before insert or update of owner_id,project_id,scope
on public.zuvyr_memories
for each row execute function public.pack045_memory_scope_guard();

create or replace function public.create_zuvyr_memory(
  p_owner_id uuid,
  p_scope text,
  p_category text,
  p_content text,
  p_project_id uuid default null,
  p_source_system text default null,
  p_source_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.zuvyr_memories(
    owner_id, project_id, scope, category, content,
    source_system, source_id, metadata, current_version,
    created_at, updated_at
  )
  values(
    p_owner_id, p_project_id, btrim(p_scope), btrim(p_category), btrim(p_content),
    nullif(btrim(p_source_system),''),
    nullif(btrim(p_source_id),''),
    coalesce(p_metadata,'{}'::jsonb),
    1, now(), now()
  )
  returning id into v_id;

  insert into public.zuvyr_memory_versions(
    memory_id, owner_id, version_number, project_id,
    scope, category, content, metadata
  )
  select id, owner_id, 1, project_id, scope, category, content, metadata
  from public.zuvyr_memories
  where id=v_id and owner_id=p_owner_id;

  insert into public.zuvyr_memory_audit_events(
    owner_id,memory_id,project_id,scope,category,event_type,version_number,details
  )
  select owner_id,id,project_id,scope,category,'created',1,
         jsonb_build_object('sourceSystem',source_system,'sourceId',source_id)
  from public.zuvyr_memories
  where id=v_id and owner_id=p_owner_id;

  return v_id;
end;
$$;

create or replace function public.update_zuvyr_memory(
  p_owner_id uuid,
  p_memory_id uuid,
  p_patch jsonb
)
returns integer
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_old public.zuvyr_memories%rowtype;
  v_content text;
  v_category text;
  v_scope text;
  v_project_id uuid;
  v_metadata jsonb;
  v_version integer;
  v_key text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'memory_patch_invalid';
  end if;

  for v_key in select jsonb_object_keys(p_patch)
  loop
    if v_key not in ('content','category','scope','projectId','metadata') then
      raise exception 'memory_patch_field_invalid';
    end if;
  end loop;

  select * into v_old
  from public.zuvyr_memories
  where id=p_memory_id and owner_id=p_owner_id
  for update;

  if not found then
    raise exception 'memory_not_found';
  end if;

  v_content :=
    case when p_patch ? 'content'
      then nullif(btrim(p_patch->>'content'),'')
      else v_old.content end;
  v_category :=
    case when p_patch ? 'category'
      then nullif(btrim(p_patch->>'category'),'')
      else v_old.category end;
  v_scope :=
    case when p_patch ? 'scope'
      then nullif(btrim(p_patch->>'scope'),'')
      else v_old.scope end;
  v_project_id :=
    case
      when p_patch ? 'projectId' and p_patch->'projectId'='null'::jsonb then null
      when p_patch ? 'projectId' then (p_patch->>'projectId')::uuid
      else v_old.project_id
    end;
  v_metadata :=
    case when p_patch ? 'metadata'
      then coalesce(p_patch->'metadata','{}'::jsonb)
      else v_old.metadata end;

  v_version := v_old.current_version + 1;

  update public.zuvyr_memories
  set content=v_content,
      category=v_category,
      scope=v_scope,
      project_id=v_project_id,
      metadata=v_metadata,
      current_version=v_version,
      updated_at=now()
  where id=p_memory_id and owner_id=p_owner_id;

  insert into public.zuvyr_memory_versions(
    memory_id,owner_id,version_number,project_id,scope,category,content,metadata
  )
  select id,owner_id,current_version,project_id,scope,category,content,metadata
  from public.zuvyr_memories
  where id=p_memory_id and owner_id=p_owner_id;

  insert into public.zuvyr_memory_audit_events(
    owner_id,memory_id,project_id,scope,category,event_type,version_number,details
  )
  select owner_id,id,project_id,scope,category,'updated',current_version,
         jsonb_build_object('fields',(
           select coalesce(jsonb_agg(k),'[]'::jsonb)
           from jsonb_object_keys(p_patch) k
         ))
  from public.zuvyr_memories
  where id=p_memory_id and owner_id=p_owner_id;

  return v_version;
end;
$$;

create or replace function public.undo_zuvyr_memory(
  p_owner_id uuid,
  p_memory_id uuid
)
returns integer
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_old public.zuvyr_memories%rowtype;
  v_prev public.zuvyr_memory_versions%rowtype;
  v_version integer;
begin
  select * into v_old
  from public.zuvyr_memories
  where id=p_memory_id and owner_id=p_owner_id
  for update;

  if not found then
    raise exception 'memory_not_found';
  end if;

  if v_old.current_version <= 1 then
    raise exception 'memory_undo_unavailable';
  end if;

  select * into v_prev
  from public.zuvyr_memory_versions
  where memory_id=p_memory_id
    and owner_id=p_owner_id
    and version_number=v_old.current_version-1
  limit 1;

  if not found then
    raise exception 'memory_undo_unavailable';
  end if;

  v_version := v_old.current_version + 1;

  update public.zuvyr_memories
  set project_id=v_prev.project_id,
      scope=v_prev.scope,
      category=v_prev.category,
      content=v_prev.content,
      metadata=v_prev.metadata,
      current_version=v_version,
      updated_at=now()
  where id=p_memory_id and owner_id=p_owner_id;

  insert into public.zuvyr_memory_versions(
    memory_id,owner_id,version_number,project_id,scope,category,content,metadata
  )
  values(
    p_memory_id,p_owner_id,v_version,
    v_prev.project_id,v_prev.scope,v_prev.category,v_prev.content,v_prev.metadata
  );

  insert into public.zuvyr_memory_audit_events(
    owner_id,memory_id,project_id,scope,category,event_type,version_number,details
  )
  values(
    p_owner_id,p_memory_id,v_prev.project_id,v_prev.scope,v_prev.category,
    'undo',v_version,jsonb_build_object('restoredFromVersion',v_prev.version_number)
  );

  return v_version;
end;
$$;

create or replace function public.forget_zuvyr_memory(
  p_owner_id uuid,
  p_memory_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_old public.zuvyr_memories%rowtype;
begin
  select * into v_old
  from public.zuvyr_memories
  where id=p_memory_id and owner_id=p_owner_id
  for update;

  if not found then
    raise exception 'memory_not_found';
  end if;

  insert into public.zuvyr_memory_audit_events(
    owner_id,memory_id,project_id,scope,category,event_type,version_number,details
  )
  values(
    p_owner_id,p_memory_id,v_old.project_id,v_old.scope,v_old.category,
    'forgotten',v_old.current_version,'{}'::jsonb
  );

  delete from public.zuvyr_memories
  where id=p_memory_id and owner_id=p_owner_id;

  return true;
end;
$$;

create or replace function public.search_zuvyr_memories(
  p_owner_id uuid,
  p_query text default null,
  p_category text default null,
  p_scope text default null,
  p_project_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof public.zuvyr_memories
language sql
stable
security invoker
set search_path=public,pg_temp
as $$
  select m.*
  from public.zuvyr_memories m
  where m.owner_id=p_owner_id
    and (p_category is null or m.category=p_category)
    and (p_scope is null or m.scope=p_scope)
    and (p_project_id is null or m.project_id=p_project_id)
    and (
      p_query is null
      or btrim(p_query)=''
      or to_tsvector(
           'simple'::regconfig,
           coalesce(m.content,'') || ' ' ||
           coalesce(m.category,'') || ' ' ||
           coalesce(m.source_system,'')
         ) @@ websearch_to_tsquery('simple'::regconfig,p_query)
    )
  order by m.updated_at desc,m.id desc
  limit greatest(1,least(coalesce(p_limit,50),100))
  offset greatest(0,coalesce(p_offset,0));
$$;

create or replace function public.retrieve_zuvyr_memory_context(
  p_owner_id uuid,
  p_project_id uuid default null,
  p_query text default null,
  p_limit integer default 20
)
returns setof public.zuvyr_memories
language plpgsql
stable
security invoker
set search_path=public,pg_temp
as $$
declare
  v_enabled boolean := false;
begin
  select memory_enabled into v_enabled
  from public.zuvyr_user_preferences
  where owner_id=p_owner_id;

  if coalesce(v_enabled,false)=false then
    return;
  end if;

  return query
  select m.*
  from public.zuvyr_memories m
  where m.owner_id=p_owner_id
    and (
      m.scope='account'
      or (
        p_project_id is not null
        and m.scope='project'
        and m.project_id=p_project_id
      )
    )
    and (
      p_query is null
      or btrim(p_query)=''
      or to_tsvector(
           'simple'::regconfig,
           coalesce(m.content,'') || ' ' ||
           coalesce(m.category,'')
         ) @@ websearch_to_tsquery('simple'::regconfig,p_query)
    )
  order by
    case when m.project_id=p_project_id then 0 else 1 end,
    m.updated_at desc
  limit greatest(1,least(coalesce(p_limit,20),50));
end;
$$;

revoke all on function public.pack045_memory_scope_guard() from public,anon,authenticated;
revoke all on function public.create_zuvyr_memory(uuid,text,text,text,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.update_zuvyr_memory(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.undo_zuvyr_memory(uuid,uuid) from public,anon,authenticated;
revoke all on function public.forget_zuvyr_memory(uuid,uuid) from public,anon,authenticated;
revoke all on function public.search_zuvyr_memories(uuid,text,text,text,uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.retrieve_zuvyr_memory_context(uuid,uuid,text,integer) from public,anon,authenticated;

grant execute on function public.create_zuvyr_memory(uuid,text,text,text,uuid,text,text,jsonb) to service_role;
grant execute on function public.update_zuvyr_memory(uuid,uuid,jsonb) to service_role;
grant execute on function public.undo_zuvyr_memory(uuid,uuid) to service_role;
grant execute on function public.forget_zuvyr_memory(uuid,uuid) to service_role;
grant execute on function public.search_zuvyr_memories(uuid,text,text,text,uuid,integer,integer) to service_role;
grant execute on function public.retrieve_zuvyr_memory_context(uuid,uuid,text,integer) to service_role;

alter table public.workspace_items
  drop constraint if exists workspace_items_resource_type_allowed;
alter table public.workspace_items
  add constraint workspace_items_resource_type_allowed
  check (
    resource_type is null
    or resource_type in (
      'conversation','content','task','deployment','memory','generic'
    )
  );

commit;
