create table if not exists public.zuvyr_universal_actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  source_content_id uuid references public.zuvyr_content_objects(id) on delete set null,
  source_version_id uuid references public.zuvyr_content_versions(id) on delete set null,
  destination text,
  workspace_project_id uuid references public.workspace_projects(id) on delete set null,
  code_project_id uuid references public.code_projects(id) on delete set null,
  request_id text,
  status text not null default 'completed',
  input jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  undo_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  undone_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint zuvyr_universal_actions_action_allowed check (
    action in ('ask','edit','verify','translate','search','save','send_to','restore','compare')
  ),
  constraint zuvyr_universal_actions_status_allowed check (
    status in ('completed','undone','failed')
  ),
  constraint zuvyr_universal_actions_destination_valid check (
    destination is null or length(btrim(destination)) between 1 and 80
  ),
  constraint zuvyr_universal_actions_request_valid check (
    request_id is null or length(btrim(request_id)) between 1 and 200
  ),
  constraint zuvyr_universal_actions_input_object check (jsonb_typeof(input)='object'),
  constraint zuvyr_universal_actions_result_object check (jsonb_typeof(result)='object'),
  constraint zuvyr_universal_actions_undo_object check (jsonb_typeof(undo_payload)='object')
);

create unique index if not exists zuvyr_universal_actions_owner_request_uidx
  on public.zuvyr_universal_actions(owner_id, request_id)
  where request_id is not null;
create index if not exists zuvyr_universal_actions_owner_created_idx
  on public.zuvyr_universal_actions(owner_id, created_at desc);
create index if not exists zuvyr_universal_actions_source_idx
  on public.zuvyr_universal_actions(owner_id, source_content_id, created_at desc);
create index if not exists zuvyr_universal_actions_code_project_idx
  on public.zuvyr_universal_actions(owner_id, code_project_id, created_at desc)
  where code_project_id is not null;

create table if not exists public.zuvyr_code_asset_bindings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  action_id uuid not null unique references public.zuvyr_universal_actions(id) on delete cascade,
  code_project_id uuid not null references public.code_projects(id) on delete cascade,
  source_content_id uuid not null references public.zuvyr_content_objects(id) on delete restrict,
  source_version_id uuid not null references public.zuvyr_content_versions(id) on delete restrict,
  asset_ids uuid[] not null default '{}'::uuid[],
  code_file_id uuid not null,
  path text not null,
  inserted_content_sha256 text not null,
  code_project_version_id uuid references public.code_project_versions(id) on delete set null,
  undo_code_project_version_id uuid references public.code_project_versions(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  constraint zuvyr_code_asset_bindings_status_allowed check (status in ('active','undone')),
  constraint zuvyr_code_asset_bindings_path_valid check (length(path) between 1 and 240),
  constraint zuvyr_code_asset_bindings_sha_valid check (inserted_content_sha256 ~ '^[0-9a-f]{64}$')
);

create unique index if not exists zuvyr_code_asset_bindings_active_uidx
  on public.zuvyr_code_asset_bindings(owner_id, code_project_id, source_version_id, path)
  where status='active';
create index if not exists zuvyr_code_asset_bindings_project_idx
  on public.zuvyr_code_asset_bindings(owner_id, code_project_id, created_at desc);

alter table public.zuvyr_universal_actions enable row level security;
alter table public.zuvyr_code_asset_bindings enable row level security;

revoke all on public.zuvyr_universal_actions from public, anon, authenticated;
revoke all on public.zuvyr_code_asset_bindings from public, anon, authenticated;
grant select, insert, update, delete on public.zuvyr_universal_actions to service_role;
grant select, insert, update, delete on public.zuvyr_code_asset_bindings to service_role;

create or replace function public.create_zuvyr_universal_action(
  p_owner_id uuid,
  p_action text,
  p_source_content_id uuid,
  p_source_version_id uuid,
  p_destination text default null,
  p_workspace_project_id uuid default null,
  p_code_project_id uuid default null,
  p_request_id text default null,
  p_input jsonb default '{}'::jsonb,
  p_result jsonb default '{}'::jsonb,
  p_undo_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := lower(btrim(coalesce(p_action,'')));
  v_destination text := nullif(lower(btrim(coalesce(p_destination,''))), '');
  v_request text := nullif(btrim(coalesce(p_request_id,'')), '');
  v_existing public.zuvyr_universal_actions%rowtype;
  v_action_id uuid;
begin
  if v_action not in ('ask','edit','verify','translate','search','save','send_to','restore','compare') then
    raise exception 'pack049_action_invalid';
  end if;
  if v_request is not null and length(v_request) > 200 then
    raise exception 'pack049_request_id_invalid';
  end if;
  if jsonb_typeof(coalesce(p_input,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_result,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_undo_payload,'{}'::jsonb)) <> 'object' then
    raise exception 'pack049_action_json_invalid';
  end if;
  if not exists (
    select 1 from public.zuvyr_content_objects c
    where c.id=p_source_content_id and c.owner_id=p_owner_id and c.deleted_at is null
  ) then
    raise exception 'pack049_source_content_not_found';
  end if;
  if not exists (
    select 1 from public.zuvyr_content_versions v
    where v.id=p_source_version_id and v.content_id=p_source_content_id and v.owner_id=p_owner_id
  ) then
    raise exception 'pack049_source_version_not_found';
  end if;
  if p_workspace_project_id is not null and not exists (
    select 1 from public.workspace_projects p
    where p.id=p_workspace_project_id and p.owner_id=p_owner_id and p.archived_at is null
  ) then
    raise exception 'pack049_workspace_project_owner_mismatch';
  end if;
  if p_code_project_id is not null and not exists (
    select 1 from public.code_projects p
    where p.id=p_code_project_id and p.owner_id=p_owner_id and p.status='active'
  ) then
    raise exception 'pack049_code_project_owner_mismatch';
  end if;

  if v_request is not null then
    select * into v_existing
    from public.zuvyr_universal_actions
    where owner_id=p_owner_id and request_id=v_request;
    if found then
      if v_existing.action=v_action
         and v_existing.source_content_id=p_source_content_id
         and v_existing.source_version_id=p_source_version_id
         and coalesce(v_existing.destination,'')=coalesce(v_destination,'')
         and v_existing.workspace_project_id is not distinct from p_workspace_project_id
         and v_existing.code_project_id is not distinct from p_code_project_id then
        return jsonb_build_object(
          'success',true,'replayed',true,'action_id',v_existing.id,
          'status',v_existing.status,'result',v_existing.result
        );
      end if;
      raise exception 'pack049_request_scope_mismatch';
    end if;
  end if;

  insert into public.zuvyr_universal_actions(
    owner_id, action, source_content_id, source_version_id, destination,
    workspace_project_id, code_project_id, request_id, status,
    input, result, undo_payload, completed_at
  ) values (
    p_owner_id, v_action, p_source_content_id, p_source_version_id, v_destination,
    p_workspace_project_id, p_code_project_id, v_request, 'completed',
    coalesce(p_input,'{}'::jsonb), coalesce(p_result,'{}'::jsonb),
    coalesce(p_undo_payload,'{}'::jsonb), now()
  ) returning id into v_action_id;

  return jsonb_build_object(
    'success',true,'replayed',false,'action_id',v_action_id,
    'status','completed','result',coalesce(p_result,'{}'::jsonb)
  );
end;
$$;

create or replace function public.execute_zuvyr_code_asset_handoff(
  p_owner_id uuid,
  p_content_id uuid,
  p_code_project_id uuid,
  p_path text default null,
  p_session_id text default null,
  p_request_id text default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request text := btrim(coalesce(p_request_id,''));
  v_session text := nullif(btrim(coalesce(p_session_id,'')), '');
  v_content public.zuvyr_content_objects%rowtype;
  v_version public.zuvyr_content_versions%rowtype;
  v_existing public.zuvyr_universal_actions%rowtype;
  v_permission jsonb;
  v_path text;
  v_asset_ids uuid[] := '{}'::uuid[];
  v_reference jsonb;
  v_reference_text text;
  v_sha text;
  v_file_id uuid;
  v_code_version_id uuid;
  v_code_canonical_id uuid;
  v_action_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if v_request='' or length(v_request)>200 then
    raise exception 'pack049_request_id_invalid';
  end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object' then
    raise exception 'pack049_action_json_invalid';
  end if;

  select * into v_existing
  from public.zuvyr_universal_actions
  where owner_id=p_owner_id and request_id=v_request;
  if found then
    if v_existing.action='send_to'
       and v_existing.destination='code'
       and v_existing.source_content_id=p_content_id
       and v_existing.code_project_id=p_code_project_id then
      return jsonb_build_object(
        'success',true,'replayed',true,'action_id',v_existing.id,
        'status',v_existing.status,'result',v_existing.result
      );
    end if;
    raise exception 'pack049_request_scope_mismatch';
  end if;

  select * into v_content
  from public.zuvyr_content_objects
  where id=p_content_id and owner_id=p_owner_id and deleted_at is null;
  if v_content.id is null or v_content.current_version_id is null then
    raise exception 'pack049_source_content_not_found';
  end if;

  select * into v_version
  from public.zuvyr_content_versions
  where id=v_content.current_version_id
    and content_id=v_content.id
    and owner_id=p_owner_id;
  if v_version.id is null then
    raise exception 'pack049_source_version_not_found';
  end if;

  if not exists (
    select 1 from public.code_projects p
    where p.id=p_code_project_id and p.owner_id=p_owner_id and p.status='active'
  ) then
    raise exception 'pack049_code_project_owner_mismatch';
  end if;

  v_permission := public.consume_zuvyr_permission_grant(
    p_owner_id,
    'project.write',
    'code_project',
    p_code_project_id::text,
    v_session,
    v_request
  );
  if coalesce((v_permission->>'allowed')::boolean,false) is not true then
    raise exception 'pack049_permission_denied:%', coalesce(v_permission->>'error','permission_required');
  end if;

  v_path := coalesce(
    nullif(btrim(coalesce(p_path,'')),''),
    '.zuvyr/assets/' || v_content.id::text || '/' || v_version.id::text || '.json'
  );
  if length(v_path) not between 1 and 240
     or v_path like '/%'
     or v_path like E'%\\%'
     or v_path ~ '(^|/)\.\.(/|$)' then
    raise exception 'pack049_code_asset_path_invalid';
  end if;
  if exists (
    select 1 from public.code_project_files f
    where f.project_id=p_code_project_id and f.path=v_path
  ) then
    raise exception 'pack049_code_asset_path_conflict';
  end if;

  select coalesce(array_agg(a.id order by a.created_at, a.id), '{}'::uuid[])
  into v_asset_ids
  from public.zuvyr_assets a
  where a.owner_id=p_owner_id
    and a.canonical_content_id=v_content.id
    and a.status='active'
    and a.deleted_at is null;

  v_reference := jsonb_build_object(
    'schema_version','pack049.code-asset-reference.v1',
    'canonical_content_id',v_content.id,
    'canonical_version_id',v_version.id,
    'asset_ids',to_jsonb(v_asset_ids),
    'kind',v_content.kind,
    'title',v_content.title,
    'source',jsonb_build_object(
      'kind',v_content.source_kind,
      'system',v_content.source_system,
      'id',v_content.source_id
    ),
    'provenance',v_version.provenance,
    'reuse_mode','canonical_reference',
    'upload_required',false
  );
  v_reference_text := jsonb_pretty(v_reference);
  v_sha := encode(digest(convert_to(v_reference_text,'UTF8'),'sha256'),'hex');

  insert into public.code_project_files(project_id,path,content,content_sha256,language)
  values (p_code_project_id,v_path,v_reference_text,v_sha,'json')
  returning id into v_file_id;

  insert into public.code_project_versions(project_id,created_by,snapshot)
  values (
    p_code_project_id,
    p_owner_id,
    jsonb_build_object(
      'schema_version','pack049.code-handoff-version.v1',
      'reason','send_to_code',
      'action_id',v_action_id,
      'source_content_id',v_content.id,
      'source_version_id',v_version.id,
      'affected_file_ids',jsonb_build_array(v_file_id),
      'affected_paths',jsonb_build_array(v_path),
      'file',jsonb_build_object(
        'id',v_file_id,'path',v_path,'content_sha256',v_sha,'language','json'
      )
    )
  ) returning id, canonical_content_id into v_code_version_id, v_code_canonical_id;

  v_result := jsonb_build_object(
    'schema_version','pack049.universal-handoff.v1',
    'destination','code',
    'canonical_content_id',v_content.id,
    'canonical_version_id',v_version.id,
    'asset_ids',to_jsonb(v_asset_ids),
    'code_project_id',p_code_project_id,
    'code_project_version_id',v_code_version_id,
    'code_project_canonical_content_id',v_code_canonical_id,
    'affected_file_ids',jsonb_build_array(v_file_id),
    'affected_paths',jsonb_build_array(v_path),
    'reference_file',jsonb_build_object('id',v_file_id,'path',v_path,'sha256',v_sha),
    'provenance',jsonb_build_object(
      'source_kind',v_content.source_kind,
      'source_system',v_content.source_system,
      'source_id',v_content.source_id,
      'source_version_provenance',v_version.provenance
    ),
    'upload_required',false,
    'reuse_mode','canonical_reference'
  );

  insert into public.zuvyr_universal_actions(
    id,owner_id,action,source_content_id,source_version_id,destination,
    code_project_id,request_id,status,input,result,undo_payload,completed_at
  ) values (
    v_action_id,p_owner_id,'send_to',v_content.id,v_version.id,'code',
    p_code_project_id,v_request,'completed',
    jsonb_build_object('metadata',coalesce(p_metadata,'{}'::jsonb),'sessionScoped',v_session is not null),
    v_result,
    jsonb_build_object(
      'kind','delete_code_asset_reference',
      'codeFileId',v_file_id,
      'path',v_path,
      'insertedSha256',v_sha,
      'codeProjectId',p_code_project_id
    ),
    now()
  );

  insert into public.zuvyr_code_asset_bindings(
    owner_id,action_id,code_project_id,source_content_id,source_version_id,
    asset_ids,code_file_id,path,inserted_content_sha256,code_project_version_id,status
  ) values (
    p_owner_id,v_action_id,p_code_project_id,v_content.id,v_version.id,
    v_asset_ids,v_file_id,v_path,v_sha,v_code_version_id,'active'
  );

  return jsonb_build_object(
    'success',true,'replayed',false,'action_id',v_action_id,
    'status','completed','result',v_result
  );
end;
$$;

create or replace function public.restore_zuvyr_content_version_action(
  p_owner_id uuid,
  p_content_id uuid,
  p_restore_version_id uuid,
  p_request_id text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request text := btrim(coalesce(p_request_id,''));
  v_content public.zuvyr_content_objects%rowtype;
  v_target public.zuvyr_content_versions%rowtype;
  v_existing public.zuvyr_universal_actions%rowtype;
  v_action_id uuid := gen_random_uuid();
  v_new jsonb;
  v_result jsonb;
begin
  if v_request='' or length(v_request)>200 then raise exception 'pack049_request_id_invalid'; end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object' then raise exception 'pack049_action_json_invalid'; end if;

  select * into v_existing from public.zuvyr_universal_actions
  where owner_id=p_owner_id and request_id=v_request;
  if found then
    if v_existing.action='restore' and v_existing.source_content_id=p_content_id then
      return jsonb_build_object('success',true,'replayed',true,'action_id',v_existing.id,'status',v_existing.status,'result',v_existing.result);
    end if;
    raise exception 'pack049_request_scope_mismatch';
  end if;

  select * into v_content from public.zuvyr_content_objects
  where id=p_content_id and owner_id=p_owner_id and deleted_at is null for update;
  if v_content.id is null or v_content.current_version_id is null then raise exception 'pack049_source_content_not_found'; end if;
  if v_content.current_version_id=p_restore_version_id then raise exception 'pack049_version_already_current'; end if;

  select * into v_target from public.zuvyr_content_versions
  where id=p_restore_version_id and content_id=p_content_id and owner_id=p_owner_id;
  if v_target.id is null then raise exception 'pack049_source_version_not_found'; end if;

  v_new := public.upsert_zuvyr_content_version(
    p_owner_id,
    v_content.project_id,
    v_content.kind,
    v_content.title,
    v_content.source_kind,
    v_content.source_system,
    v_content.source_id,
    'pack049:restore:' || v_action_id::text,
    v_content.metadata || jsonb_build_object('pack049LastActionId',v_action_id),
    jsonb_build_object(
      'mimeType',v_target.mime_type,
      'uri',v_target.uri,
      'text',v_target.text_content,
      'sha256',v_target.sha256,
      'payload',v_target.payload,
      'provenance',v_target.provenance || jsonb_build_object(
        'pack049Action','restore',
        'restoredFromVersionId',v_target.id,
        'previousVersionId',v_content.current_version_id
      )
    )
  );

  v_result := jsonb_build_object(
    'canonical_content_id',p_content_id,
    'previous_version_id',v_content.current_version_id,
    'restored_from_version_id',v_target.id,
    'new_version_id',(v_new->>'versionId')::uuid,
    'new_version_number',(v_new->>'versionNumber')::int
  );

  insert into public.zuvyr_universal_actions(
    id,owner_id,action,source_content_id,source_version_id,request_id,status,
    input,result,undo_payload,completed_at
  ) values (
    v_action_id,p_owner_id,'restore',p_content_id,v_target.id,v_request,'completed',
    jsonb_build_object('metadata',coalesce(p_metadata,'{}'::jsonb)),
    v_result,
    jsonb_build_object('previousVersionId',v_content.current_version_id),
    now()
  );

  return jsonb_build_object('success',true,'replayed',false,'action_id',v_action_id,'status','completed','result',v_result);
end;
$$;

create or replace function public.undo_zuvyr_universal_action(
  p_owner_id uuid,
  p_action_id uuid,
  p_session_id text default null,
  p_request_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action public.zuvyr_universal_actions%rowtype;
  v_binding public.zuvyr_code_asset_bindings%rowtype;
  v_file public.code_project_files%rowtype;
  v_permission jsonb;
  v_undo_request text := btrim(coalesce(p_request_id,''));
  v_undo_version_id uuid;
  v_undo_canonical_id uuid;
  v_prev_version public.zuvyr_content_versions%rowtype;
  v_content public.zuvyr_content_objects%rowtype;
  v_new jsonb;
begin
  select * into v_action from public.zuvyr_universal_actions
  where id=p_action_id and owner_id=p_owner_id for update;
  if v_action.id is null then raise exception 'pack049_action_not_found'; end if;
  if v_action.status='undone' then
    return jsonb_build_object('success',true,'replayed',true,'action_id',v_action.id,'status','undone','result',v_action.result);
  end if;
  if v_action.status<>'completed' then raise exception 'pack049_action_not_undoable'; end if;

  if v_action.action='send_to' and v_action.destination='code' then
    if v_undo_request='' or length(v_undo_request)>200 then raise exception 'pack049_request_id_invalid'; end if;

    v_permission := public.consume_zuvyr_permission_grant(
      p_owner_id,'project.write','code_project',v_action.code_project_id::text,
      nullif(btrim(coalesce(p_session_id,'')),''),v_undo_request
    );
    if coalesce((v_permission->>'allowed')::boolean,false) is not true then
      raise exception 'pack049_permission_denied:%', coalesce(v_permission->>'error','permission_required');
    end if;

    select * into v_binding from public.zuvyr_code_asset_bindings
    where action_id=v_action.id and owner_id=p_owner_id and status='active' for update;
    if v_binding.id is null then raise exception 'pack049_code_asset_binding_not_found'; end if;

    select * into v_file from public.code_project_files
    where id=v_binding.code_file_id
      and project_id=v_binding.code_project_id
      and path=v_binding.path;
    if v_file.id is null then raise exception 'pack049_code_asset_reference_missing'; end if;
    if v_file.content_sha256<>v_binding.inserted_content_sha256 then
      raise exception 'pack049_code_asset_reference_changed';
    end if;

    delete from public.code_project_files where id=v_file.id;

    insert into public.code_project_versions(project_id,created_by,snapshot)
    values (
      v_binding.code_project_id,
      p_owner_id,
      jsonb_build_object(
        'schema_version','pack049.code-handoff-version.v1',
        'reason','undo_send_to_code',
        'action_id',v_action.id,
        'source_content_id',v_binding.source_content_id,
        'source_version_id',v_binding.source_version_id,
        'affected_file_ids',jsonb_build_array(v_binding.code_file_id),
        'affected_paths',jsonb_build_array(v_binding.path),
        'removed',true
      )
    ) returning id, canonical_content_id into v_undo_version_id, v_undo_canonical_id;

    update public.zuvyr_code_asset_bindings
    set status='undone', undone_at=now(), undo_code_project_version_id=v_undo_version_id
    where id=v_binding.id;

    update public.zuvyr_universal_actions
    set status='undone', undone_at=now(), updated_at=now(),
        result=result || jsonb_build_object(
          'undo_code_project_version_id',v_undo_version_id,
          'undo_code_project_canonical_content_id',v_undo_canonical_id,
          'undo_affected_file_ids',jsonb_build_array(v_binding.code_file_id)
        )
    where id=v_action.id
    returning * into v_action;

    return jsonb_build_object('success',true,'replayed',false,'action_id',v_action.id,'status','undone','result',v_action.result);
  end if;

  if v_action.action='restore' then
    select * into v_content from public.zuvyr_content_objects
    where id=v_action.source_content_id and owner_id=p_owner_id and deleted_at is null for update;
    if v_content.id is null then raise exception 'pack049_source_content_not_found'; end if;

    select * into v_prev_version from public.zuvyr_content_versions
    where id=(v_action.undo_payload->>'previousVersionId')::uuid
      and content_id=v_content.id and owner_id=p_owner_id;
    if v_prev_version.id is null then raise exception 'pack049_undo_version_not_found'; end if;

    v_new := public.upsert_zuvyr_content_version(
      p_owner_id,
      v_content.project_id,
      v_content.kind,
      v_content.title,
      v_content.source_kind,
      v_content.source_system,
      v_content.source_id,
      'pack049:undo:' || v_action.id::text,
      v_content.metadata || jsonb_build_object('pack049LastUndoActionId',v_action.id),
      jsonb_build_object(
        'mimeType',v_prev_version.mime_type,
        'uri',v_prev_version.uri,
        'text',v_prev_version.text_content,
        'sha256',v_prev_version.sha256,
        'payload',v_prev_version.payload,
        'provenance',v_prev_version.provenance || jsonb_build_object(
          'pack049Action','undo_restore',
          'undoOfActionId',v_action.id,
          'restoredVersionId',v_prev_version.id
        )
      )
    );

    update public.zuvyr_universal_actions
    set status='undone', undone_at=now(), updated_at=now(),
        result=result || jsonb_build_object(
          'undo_version_id',(v_new->>'versionId')::uuid,
          'undo_version_number',(v_new->>'versionNumber')::int
        )
    where id=v_action.id
    returning * into v_action;

    return jsonb_build_object('success',true,'replayed',false,'action_id',v_action.id,'status','undone','result',v_action.result);
  end if;

  update public.zuvyr_universal_actions
  set status='undone', undone_at=now(), updated_at=now()
  where id=v_action.id
  returning * into v_action;

  return jsonb_build_object('success',true,'replayed',false,'action_id',v_action.id,'status','undone','result',v_action.result);
end;
$$;

revoke all on function public.create_zuvyr_universal_action(uuid,text,uuid,uuid,text,uuid,uuid,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.execute_zuvyr_code_asset_handoff(uuid,uuid,uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.restore_zuvyr_content_version_action(uuid,uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.undo_zuvyr_universal_action(uuid,uuid,text,text) from public, anon, authenticated;

grant execute on function public.create_zuvyr_universal_action(uuid,text,uuid,uuid,text,uuid,uuid,text,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.execute_zuvyr_code_asset_handoff(uuid,uuid,uuid,text,text,text,jsonb) to service_role;
grant execute on function public.restore_zuvyr_content_version_action(uuid,uuid,uuid,text,jsonb) to service_role;
grant execute on function public.undo_zuvyr_universal_action(uuid,uuid,text,text) to service_role;
