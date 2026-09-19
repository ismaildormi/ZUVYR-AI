-- ZUVYR V1 PACK075 — durable Code Projects + Editor state.
-- Additive migration. Code execution/preview runtime remains disabled until Packs076-078.
-- Browser roles receive no direct mutation rights; the authenticated API derives owner_id.

alter table public.code_projects
  add column if not exists current_branch text not null default 'main',
  add column if not exists revision bigint not null default 0;

alter table public.code_project_versions
  add column if not exists branch_name text not null default 'main',
  add column if not exists reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.code_projects'::regclass
      and conname='code_projects_revision_nonnegative'
  ) then
    alter table public.code_projects
      add constraint code_projects_revision_nonnegative
      check (revision >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.code_projects'::regclass
      and conname='code_projects_current_branch_valid'
  ) then
    alter table public.code_projects
      add constraint code_projects_current_branch_valid
      check (
        char_length(current_branch) between 1 and 80
        and current_branch ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.code_project_versions'::regclass
      and conname='code_project_versions_branch_valid'
  ) then
    alter table public.code_project_versions
      add constraint code_project_versions_branch_valid
      check (
        char_length(branch_name) between 1 and 80
        and branch_name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
      );
  end if;
end $$;

create table if not exists public.code_project_branches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.code_projects(id) on delete cascade,
  name text not null check (
    char_length(name) between 1 and 80
    and name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
  ),
  head_version_id uuid references public.code_project_versions(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,name)
);

create table if not exists public.code_project_editor_state (
  project_id uuid primary key references public.code_projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  open_files jsonb not null default '[]'::jsonb
    check (jsonb_typeof(open_files)='array' and jsonb_array_length(open_files) <= 20),
  active_file text,
  divider_basis_points integer not null default 6000
    check (divider_basis_points between 2500 and 8000),
  preview_visible boolean not null default true,
  mobile_pane text not null default 'code'
    check (mobile_pane in ('code','preview')),
  logs_visible boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.code_project_ai_edits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.code_projects(id) on delete cascade,
  request_id text not null check (char_length(request_id) between 1 and 200),
  instruction_sha256 text not null check (instruction_sha256 ~ '^[0-9a-f]{64}
create index if not exists code_project_versions_project_branch_created_idx
  on public.code_project_versions(project_id,branch_name,created_at desc);
create index if not exists code_project_ai_edits_project_created_idx
  on public.code_project_ai_edits(owner_id,project_id,created_at desc);

alter table public.code_project_branches enable row level security;
alter table public.code_project_editor_state enable row level security;
alter table public.code_project_ai_edits enable row level security;

revoke all on public.code_projects from public, anon, authenticated;
revoke all on public.code_project_files from public, anon, authenticated;
revoke all on public.code_project_versions from public, anon, authenticated;
revoke all on public.code_project_branches from public, anon, authenticated;
revoke all on public.code_project_editor_state from public, anon, authenticated;
revoke all on public.code_project_ai_edits from public, anon, authenticated;

grant select, insert, update, delete on public.code_projects to service_role;
grant select, insert, update, delete on public.code_project_files to service_role;
grant select, insert, update, delete on public.code_project_versions to service_role;
grant select, insert, update, delete on public.code_project_branches to service_role;
grant select, insert, update, delete on public.code_project_editor_state to service_role;
grant select, insert, update, delete on public.code_project_ai_edits to service_role;

create or replace function public.validate_zuvyr_code_files_pack075(
  p_files jsonb,
  p_entry_file text default null
) returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when jsonb_typeof(p_files) is distinct from 'array'
      then 'pack075_files_invalid'
    when jsonb_array_length(p_files) < 1
      or jsonb_array_length(p_files) > 64
      then 'pack075_file_count_invalid'
    when exists (
      select 1
      from jsonb_array_elements(p_files) e
      where jsonb_typeof(e) <> 'object'
         or jsonb_typeof(e->'path') <> 'string'
         or jsonb_typeof(e->'content') <> 'string'
         or jsonb_typeof(e->'sha256') <> 'string'
         or char_length(e->>'path') not between 1 and 240
         or octet_length(e->>'content') > 524288
         or (e->>'sha256') !~ '^[0-9a-f]{64}$'
    ) then 'pack075_file_contract_invalid'
    when exists (
      select 1
      from (
        select lower(e->>'path') path_key, count(*) n
        from jsonb_array_elements(p_files) e
        group by lower(e->>'path')
      ) d
      where d.n > 1
    ) then 'pack075_duplicate_file_path'
    when (
      select coalesce(sum(octet_length(e->>'content')),0)
      from jsonb_array_elements(p_files) e
    ) > 4194304
      then 'pack075_project_too_large'
    when p_entry_file is not null and not exists (
      select 1
      from jsonb_array_elements(p_files) e
      where lower(e->>'path') = lower(p_entry_file)
    ) then 'pack075_entry_file_missing'
    else null
  end;
$function$;

create or replace function public.create_zuvyr_code_project_pack075(
  p_owner_id uuid,
  p_name text,
  p_entry_file text,
  p_files jsonb,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_project_id uuid;
  v_version_id uuid;
  v_snapshot jsonb;
  v_validation text;
  v_name text := btrim(coalesce(p_name,''));
begin
  if char_length(v_name) not between 1 and 120 then
    raise exception 'pack075_project_name_invalid';
  end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object' then
    raise exception 'pack075_metadata_invalid';
  end if;

  v_validation := public.validate_zuvyr_code_files_pack075(p_files,p_entry_file);
  if v_validation is not null then
    raise exception '%', v_validation;
  end if;

  insert into public.code_projects(
    owner_id,name,entry_file,status,metadata,current_branch,revision,updated_at
  ) values (
    p_owner_id,v_name,p_entry_file,'active',coalesce(p_metadata,'{}'::jsonb),'main',1,now()
  ) returning id into v_project_id;

  insert into public.code_project_files(project_id,path,content,content_sha256,language)
  select v_project_id,f.path,f.content,f.sha256,nullif(f.language,'')
  from jsonb_to_recordset(p_files)
    as f(path text,content text,sha256 text,language text);

  select jsonb_build_object(
    'name',v_name,
    'entryFile',p_entry_file,
    'files',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'path',f.path,
          'content',f.content,
          'sha256',f.sha256,
          'language',nullif(f.language,'')
        ) order by f.path
      ),
      '[]'::jsonb
    )
  ) into v_snapshot
  from jsonb_to_recordset(p_files)
    as f(path text,content text,sha256 text,language text);

  insert into public.code_project_versions(
    project_id,created_by,snapshot,branch_name,reason
  ) values (
    v_project_id,p_owner_id,v_snapshot,'main','project_create'
  ) returning id into v_version_id;

  insert into public.code_project_branches(
    project_id,name,head_version_id,created_by
  ) values (
    v_project_id,'main',v_version_id,p_owner_id
  );

  insert into public.code_project_editor_state(
    project_id,owner_id,open_files,active_file
  ) values (
    v_project_id,p_owner_id,
    case when p_entry_file is null then '[]'::jsonb else jsonb_build_array(p_entry_file) end,
    p_entry_file
  );

  return jsonb_build_object(
    'success',true,
    'project_id',v_project_id,
    'version_id',v_version_id,
    'branch','main',
    'revision',1
  );
end;
$$;

create or replace function public.save_zuvyr_code_project_pack075(
  p_owner_id uuid,
  p_project_id uuid,
  p_expected_revision bigint,
  p_name text,
  p_entry_file text,
  p_files jsonb,
  p_branch_name text default null,
  p_reason text default 'manual_save'
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_project public.code_projects%rowtype;
  v_branch text;
  v_name text := btrim(coalesce(p_name,''));
  v_reason text := left(coalesce(nullif(btrim(p_reason),''),'manual_save'),200);
  v_version_id uuid;
  v_snapshot jsonb;
  v_next_revision bigint;
  v_validation text;
begin
  select * into v_project
  from public.code_projects
  where id=p_project_id and owner_id=p_owner_id and status='active'
  for update;

  if v_project.id is null then
    raise exception 'pack075_project_not_found';
  end if;
  if p_expected_revision is not null and v_project.revision <> p_expected_revision then
    raise exception 'pack075_revision_conflict';
  end if;

  v_branch := coalesce(nullif(btrim(coalesce(p_branch_name,'')),''),v_project.current_branch);
  if v_branch <> v_project.current_branch then
    raise exception 'pack075_branch_not_active';
  end if;
  if not exists (
    select 1 from public.code_project_branches
    where project_id=p_project_id and name=v_branch
  ) then
    raise exception 'pack075_branch_not_found';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'pack075_project_name_invalid';
  end if;

  v_validation := public.validate_zuvyr_code_files_pack075(p_files,p_entry_file);
  if v_validation is not null then
    raise exception '%', v_validation;
  end if;

  delete from public.code_project_files where project_id=p_project_id;
  insert into public.code_project_files(project_id,path,content,content_sha256,language)
  select p_project_id,f.path,f.content,f.sha256,nullif(f.language,'')
  from jsonb_to_recordset(p_files)
    as f(path text,content text,sha256 text,language text);

  select jsonb_build_object(
    'name',v_name,
    'entryFile',p_entry_file,
    'files',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'path',f.path,
          'content',f.content,
          'sha256',f.sha256,
          'language',nullif(f.language,'')
        ) order by f.path
      ),
      '[]'::jsonb
    )
  ) into v_snapshot
  from jsonb_to_recordset(p_files)
    as f(path text,content text,sha256 text,language text);

  insert into public.code_project_versions(
    project_id,created_by,snapshot,branch_name,reason
  ) values (
    p_project_id,p_owner_id,v_snapshot,v_branch,v_reason
  ) returning id into v_version_id;

  update public.code_project_branches
  set head_version_id=v_version_id,updated_at=now()
  where project_id=p_project_id and name=v_branch;

  v_next_revision := v_project.revision + 1;
  update public.code_projects
  set name=v_name,
      entry_file=p_entry_file,
      revision=v_next_revision,
      updated_at=now()
  where id=p_project_id;

  return jsonb_build_object(
    'success',true,
    'project_id',p_project_id,
    'version_id',v_version_id,
    'branch',v_branch,
    'revision',v_next_revision
  );
end;
$$;

create or replace function public.create_zuvyr_code_branch_pack075(
  p_owner_id uuid,
  p_project_id uuid,
  p_name text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_project public.code_projects%rowtype;
  v_name text := btrim(coalesce(p_name,''));
  v_head uuid;
begin
  select * into v_project
  from public.code_projects
  where id=p_project_id and owner_id=p_owner_id and status='active'
  for update;

  if v_project.id is null then
    raise exception 'pack075_project_not_found';
  end if;
  if char_length(v_name) not between 1 and 80
     or v_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$' then
    raise exception 'pack075_branch_name_invalid';
  end if;

  select head_version_id into v_head
  from public.code_project_branches
  where project_id=p_project_id and name=v_project.current_branch;

  if v_head is null then
    raise exception 'pack075_branch_head_missing';
  end if;

  insert into public.code_project_branches(
    project_id,name,head_version_id,created_by
  ) values (
    p_project_id,v_name,v_head,p_owner_id
  );

  return jsonb_build_object(
    'success',true,
    'project_id',p_project_id,
    'branch',v_name,
    'head_version_id',v_head
  );
exception
  when unique_violation then
    raise exception 'pack075_branch_exists';
end;
$$;

create or replace function public.switch_zuvyr_code_branch_pack075(
  p_owner_id uuid,
  p_project_id uuid,
  p_name text,
  p_expected_revision bigint default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_project public.code_projects%rowtype;
  v_branch public.code_project_branches%rowtype;
  v_version public.code_project_versions%rowtype;
  v_files jsonb;
  v_name text;
  v_entry_file text;
  v_next_revision bigint;
  v_validation text;
begin
  select * into v_project
  from public.code_projects
  where id=p_project_id and owner_id=p_owner_id and status='active'
  for update;

  if v_project.id is null then
    raise exception 'pack075_project_not_found';
  end if;
  if p_expected_revision is not null and v_project.revision <> p_expected_revision then
    raise exception 'pack075_revision_conflict';
  end if;

  select * into v_branch
  from public.code_project_branches
  where project_id=p_project_id and name=btrim(coalesce(p_name,''));

  if v_branch.id is null or v_branch.head_version_id is null then
    raise exception 'pack075_branch_not_found';
  end if;

  select * into v_version
  from public.code_project_versions
  where id=v_branch.head_version_id and project_id=p_project_id;

  if v_version.id is null then
    raise exception 'pack075_branch_head_missing';
  end if;

  v_files := v_version.snapshot->'files';
  v_name := coalesce(v_version.snapshot->>'name',v_project.name);
  v_entry_file := nullif(v_version.snapshot->>'entryFile','');
  v_validation := public.validate_zuvyr_code_files_pack075(v_files,v_entry_file);
  if v_validation is not null then
    raise exception '%', v_validation;
  end if;

  delete from public.code_project_files where project_id=p_project_id;
  insert into public.code_project_files(project_id,path,content,content_sha256,language)
  select p_project_id,f.path,f.content,f.sha256,nullif(f.language,'')
  from jsonb_to_recordset(v_files)
    as f(path text,content text,sha256 text,language text);

  v_next_revision := v_project.revision + 1;
  update public.code_projects
  set name=v_name,
      entry_file=v_entry_file,
      current_branch=v_branch.name,
      revision=v_next_revision,
      updated_at=now()
  where id=p_project_id;

  return jsonb_build_object(
    'success',true,
    'project_id',p_project_id,
    'branch',v_branch.name,
    'head_version_id',v_branch.head_version_id,
    'revision',v_next_revision
  );
end;
$$;

revoke all on function public.validate_zuvyr_code_files_pack075(jsonb,text)
  from public,anon,authenticated;
revoke all on function public.create_zuvyr_code_project_pack075(uuid,text,text,jsonb,jsonb)
  from public,anon,authenticated;
revoke all on function public.save_zuvyr_code_project_pack075(uuid,uuid,bigint,text,text,jsonb,text,text)
  from public,anon,authenticated;
revoke all on function public.create_zuvyr_code_branch_pack075(uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.switch_zuvyr_code_branch_pack075(uuid,uuid,text,bigint)
  from public,anon,authenticated;

grant execute on function public.validate_zuvyr_code_files_pack075(jsonb,text)
  to service_role;
grant execute on function public.create_zuvyr_code_project_pack075(uuid,text,text,jsonb,jsonb)
  to service_role;
grant execute on function public.save_zuvyr_code_project_pack075(uuid,uuid,bigint,text,text,jsonb,text,text)
  to service_role;
grant execute on function public.create_zuvyr_code_branch_pack075(uuid,uuid,text)
  to service_role;
grant execute on function public.switch_zuvyr_code_branch_pack075(uuid,uuid,text,bigint)
  to service_role;

comment on table public.code_project_branches is
  'PACK075 durable branch pointers for Code Studio. A branch head references an immutable code_project_versions snapshot.';
comment on table public.code_project_editor_state is
  'PACK075 owner-scoped Code Studio UI state. No runtime/preview execution data is stored here.';
),
  target_paths jsonb not null default '[]'::jsonb
    check (jsonb_typeof(target_paths)='array' and jsonb_array_length(target_paths) between 1 and 8),
  status text not null default 'processing'
    check (status in ('processing','succeeded','failed')),
  model text,
  credits_charged integer,
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result)='object'),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(owner_id,request_id)
);

create index if not exists code_project_branches_project_updated_idx
  on public.code_project_branches(project_id,updated_at desc);
create index if not exists code_project_versions_project_branch_created_idx
  on public.code_project_versions(project_id,branch_name,created_at desc);

alter table public.code_project_branches enable row level security;
alter table public.code_project_editor_state enable row level security;

revoke all on public.code_projects from public, anon, authenticated;
revoke all on public.code_project_files from public, anon, authenticated;
revoke all on public.code_project_versions from public, anon, authenticated;
revoke all on public.code_project_branches from public, anon, authenticated;
revoke all on public.code_project_editor_state from public, anon, authenticated;

grant select, insert, update, delete on public.code_projects to service_role;
grant select, insert, update, delete on public.code_project_files to service_role;
grant select, insert, update, delete on public.code_project_versions to service_role;
grant select, insert, update, delete on public.code_project_branches to service_role;
grant select, insert, update, delete on public.code_project_editor_state to service_role;

create or replace function public.validate_zuvyr_code_files_pack075(
  p_files jsonb,
  p_entry_file text default null
) returns void
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_count integer;
  v_total_bytes bigint;
begin
  if jsonb_typeof(p_files) <> 'array' then
    raise exception 'pack075_files_invalid';
  end if;

  v_count := jsonb_array_length(p_files);
  if v_count < 1 or v_count > 64 then
    raise exception 'pack075_file_count_invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_files) e
    where jsonb_typeof(e) <> 'object'
       or jsonb_typeof(e->'path') <> 'string'
       or jsonb_typeof(e->'content') <> 'string'
       or jsonb_typeof(e->'sha256') <> 'string'
       or char_length(e->>'path') not between 1 and 240
       or octet_length(e->>'content') > 524288
       or (e->>'sha256') !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'pack075_file_contract_invalid';
  end if;

  if exists (
    select 1
    from (
      select lower(e->>'path') path_key,count(*) n
      from jsonb_array_elements(p_files) e
      group by lower(e->>'path')
    ) d
    where d.n > 1
  ) then
    raise exception 'pack075_duplicate_file_path';
  end if;

  select coalesce(sum(octet_length(e->>'content')),0)
    into v_total_bytes
  from jsonb_array_elements(p_files) e;

  if v_total_bytes > 4194304 then
    raise exception 'pack075_project_too_large';
  end if;

  if p_entry_file is not null and not exists (
    select 1 from jsonb_array_elements(p_files) e
    where lower(e->>'path')=lower(p_entry_file)
  ) then
    raise exception 'pack075_entry_file_missing';
  end if;
end;
$$;

create or replace function public.create_zuvyr_code_project_pack075(
  p_owner_id uuid,
  p_name text,
  p_entry_file text,
  p_files jsonb,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_project_id uuid;
  v_version_id uuid;
  v_snapshot jsonb;
  v_name text := btrim(coalesce(p_name,''));
begin
  if char_length(v_name) not between 1 and 120 then
    raise exception 'pack075_project_name_invalid';
  end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object' then
    raise exception 'pack075_metadata_invalid';
  end if;

  v_validation := public.validate_zuvyr_code_files_pack075(p_files,p_entry_file);
  if v_validation is not null then
    raise exception '%', v_validation;
  end if;

  insert into public.code_projects(
    owner_id,name,entry_file,status,metadata,current_branch,revision,updated_at
  ) values (
    p_owner_id,v_name,p_entry_file,'active',coalesce(p_metadata,'{}'::jsonb),'main',1,now()
  ) returning id into v_project_id;

  insert into public.code_project_files(project_id,path,content,content_sha256,language)
  select v_project_id,f.path,f.content,f.sha256,nullif(f.language,'')
  from jsonb_to_recordset(p_files)
    as f(path text,content text,sha256 text,language text);

  select jsonb_build_object(
    'name',v_name,
    'entryFile',p_entry_file,
    'files',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'path',f.path,
          'content',f.content,
          'sha256',f.sha256,
          'language',nullif(f.language,'')
        ) order by f.path
      ),
      '[]'::jsonb
    )
  ) into v_snapshot
  from jsonb_to_recordset(p_files)
    as f(path text,content text,sha256 text,language text);

  insert into public.code_project_versions(
    project_id,created_by,snapshot,branch_name,reason
  ) values (
    v_project_id,p_owner_id,v_snapshot,'main','project_create'
  ) returning id into v_version_id;

  insert into public.code_project_branches(
    project_id,name,head_version_id,created_by
  ) values (
    v_project_id,'main',v_version_id,p_owner_id
  );

  insert into public.code_project_editor_state(
    project_id,owner_id,open_files,active_file
  ) values (
    v_project_id,p_owner_id,
    case when p_entry_file is null then '[]'::jsonb else jsonb_build_array(p_entry_file) end,
    p_entry_file
  );

  return jsonb_build_object(
    'success',true,
    'project_id',v_project_id,
    'version_id',v_version_id,
    'branch','main',
    'revision',1
  );
end;
$$;

create or replace function public.save_zuvyr_code_project_pack075(
  p_owner_id uuid,
  p_project_id uuid,
  p_expected_revision bigint,
  p_name text,
  p_entry_file text,
  p_files jsonb,
  p_branch_name text default null,
  p_reason text default 'manual_save'
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_project public.code_projects%rowtype;
  v_branch text;
  v_name text := btrim(coalesce(p_name,''));
  v_reason text := left(coalesce(nullif(btrim(p_reason),''),'manual_save'),200);
  v_version_id uuid;
  v_snapshot jsonb;
  v_next_revision bigint;
begin
  select * into v_project
  from public.code_projects
  where id=p_project_id and owner_id=p_owner_id and status='active'
  for update;

  if v_project.id is null then
    raise exception 'pack075_project_not_found';
  end if;
  if p_expected_revision is not null and v_project.revision <> p_expected_revision then
    raise exception 'pack075_revision_conflict';
  end if;

  v_branch := coalesce(nullif(btrim(coalesce(p_branch_name,'')),''),v_project.current_branch);
  if v_branch <> v_project.current_branch then
    raise exception 'pack075_branch_not_active';
  end if;
  if not exists (
    select 1 from public.code_project_branches
    where project_id=p_project_id and name=v_branch
  ) then
    raise exception 'pack075_branch_not_found';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'pack075_project_name_invalid';
  end if;

  v_validation := public.validate_zuvyr_code_files_pack075(p_files,p_entry_file);
  if v_validation is not null then
    raise exception '%', v_validation;
  end if;

  delete from public.code_project_files where project_id=p_project_id;
  insert into public.code_project_files(project_id,path,content,content_sha256,language)
  select p_project_id,f.path,f.content,f.sha256,nullif(f.language,'')
  from jsonb_to_recordset(p_files)
    as f(path text,content text,sha256 text,language text);

  select jsonb_build_object(
    'name',v_name,
    'entryFile',p_entry_file,
    'files',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'path',f.path,
          'content',f.content,
          'sha256',f.sha256,
          'language',nullif(f.language,'')
        ) order by f.path
      ),
      '[]'::jsonb
    )
  ) into v_snapshot
  from jsonb_to_recordset(p_files)
    as f(path text,content text,sha256 text,language text);

  insert into public.code_project_versions(
    project_id,created_by,snapshot,branch_name,reason
  ) values (
    p_project_id,p_owner_id,v_snapshot,v_branch,v_reason
  ) returning id into v_version_id;

  update public.code_project_branches
  set head_version_id=v_version_id,updated_at=now()
  where project_id=p_project_id and name=v_branch;

  v_next_revision := v_project.revision + 1;
  update public.code_projects
  set name=v_name,
      entry_file=p_entry_file,
      revision=v_next_revision,
      updated_at=now()
  where id=p_project_id;

  return jsonb_build_object(
    'success',true,
    'project_id',p_project_id,
    'version_id',v_version_id,
    'branch',v_branch,
    'revision',v_next_revision
  );
end;
$$;

create or replace function public.create_zuvyr_code_branch_pack075(
  p_owner_id uuid,
  p_project_id uuid,
  p_name text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_project public.code_projects%rowtype;
  v_name text := btrim(coalesce(p_name,''));
  v_head uuid;
begin
  select * into v_project
  from public.code_projects
  where id=p_project_id and owner_id=p_owner_id and status='active'
  for update;

  if v_project.id is null then
    raise exception 'pack075_project_not_found';
  end if;
  if char_length(v_name) not between 1 and 80
     or v_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$' then
    raise exception 'pack075_branch_name_invalid';
  end if;

  select head_version_id into v_head
  from public.code_project_branches
  where project_id=p_project_id and name=v_project.current_branch;

  if v_head is null then
    raise exception 'pack075_branch_head_missing';
  end if;

  insert into public.code_project_branches(
    project_id,name,head_version_id,created_by
  ) values (
    p_project_id,v_name,v_head,p_owner_id
  );

  return jsonb_build_object(
    'success',true,
    'project_id',p_project_id,
    'branch',v_name,
    'head_version_id',v_head
  );
exception
  when unique_violation then
    raise exception 'pack075_branch_exists';
end;
$$;

create or replace function public.switch_zuvyr_code_branch_pack075(
  p_owner_id uuid,
  p_project_id uuid,
  p_name text,
  p_expected_revision bigint default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_project public.code_projects%rowtype;
  v_branch public.code_project_branches%rowtype;
  v_version public.code_project_versions%rowtype;
  v_files jsonb;
  v_name text;
  v_entry_file text;
  v_next_revision bigint;
begin
  select * into v_project
  from public.code_projects
  where id=p_project_id and owner_id=p_owner_id and status='active'
  for update;

  if v_project.id is null then
    raise exception 'pack075_project_not_found';
  end if;
  if p_expected_revision is not null and v_project.revision <> p_expected_revision then
    raise exception 'pack075_revision_conflict';
  end if;

  select * into v_branch
  from public.code_project_branches
  where project_id=p_project_id and name=btrim(coalesce(p_name,''));

  if v_branch.id is null or v_branch.head_version_id is null then
    raise exception 'pack075_branch_not_found';
  end if;

  select * into v_version
  from public.code_project_versions
  where id=v_branch.head_version_id and project_id=p_project_id;

  if v_version.id is null then
    raise exception 'pack075_branch_head_missing';
  end if;

  v_files := v_version.snapshot->'files';
  v_name := coalesce(v_version.snapshot->>'name',v_project.name);
  v_entry_file := nullif(v_version.snapshot->>'entryFile','');
  v_validation := public.validate_zuvyr_code_files_pack075(v_files,v_entry_file);
  if v_validation is not null then
    raise exception '%', v_validation;
  end if;

  delete from public.code_project_files where project_id=p_project_id;
  insert into public.code_project_files(project_id,path,content,content_sha256,language)
  select p_project_id,f.path,f.content,f.sha256,nullif(f.language,'')
  from jsonb_to_recordset(v_files)
    as f(path text,content text,sha256 text,language text);

  v_next_revision := v_project.revision + 1;
  update public.code_projects
  set name=v_name,
      entry_file=v_entry_file,
      current_branch=v_branch.name,
      revision=v_next_revision,
      updated_at=now()
  where id=p_project_id;

  return jsonb_build_object(
    'success',true,
    'project_id',p_project_id,
    'branch',v_branch.name,
    'head_version_id',v_branch.head_version_id,
    'revision',v_next_revision
  );
end;
$$;

revoke all on function public.validate_zuvyr_code_files_pack075(jsonb,text)
  from public,anon,authenticated;
revoke all on function public.create_zuvyr_code_project_pack075(uuid,text,text,jsonb,jsonb)
  from public,anon,authenticated;
revoke all on function public.save_zuvyr_code_project_pack075(uuid,uuid,bigint,text,text,jsonb,text,text)
  from public,anon,authenticated;
revoke all on function public.create_zuvyr_code_branch_pack075(uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.switch_zuvyr_code_branch_pack075(uuid,uuid,text,bigint)
  from public,anon,authenticated;

grant execute on function public.validate_zuvyr_code_files_pack075(jsonb,text)
  to service_role;
grant execute on function public.create_zuvyr_code_project_pack075(uuid,text,text,jsonb,jsonb)
  to service_role;
grant execute on function public.save_zuvyr_code_project_pack075(uuid,uuid,bigint,text,text,jsonb,text,text)
  to service_role;
grant execute on function public.create_zuvyr_code_branch_pack075(uuid,uuid,text)
  to service_role;
grant execute on function public.switch_zuvyr_code_branch_pack075(uuid,uuid,text,bigint)
  to service_role;

comment on table public.code_project_branches is
  'PACK075 durable branch pointers for Code Studio. A branch head references an immutable code_project_versions snapshot.';
comment on table public.code_project_editor_state is
  'PACK075 owner-scoped Code Studio UI state. No runtime/preview execution data is stored here.';

comment on table public.code_project_ai_edits is
  'PACK075 idempotent AI-edit receipts. Retries reuse the receipt and never intentionally repeat a provider call.';
