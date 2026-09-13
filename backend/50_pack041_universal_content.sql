-- ZUVYR Pack041 — Universal Content Object
-- Canonical registry only. Existing storage/job tables remain source systems.
-- Pack042 owns storage unification, dedupe/retention/egress and deeper lineage.

begin;

create table if not exists public.zuvyr_content_objects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.workspace_projects(id) on delete set null,
  kind text not null,
  title text,
  status text not null default 'active',
  source_kind text not null,
  source_system text not null,
  source_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zuvyr_content_kind_allowed
    check (kind in ('text','image','video','audio','document','code','3d','web','research')),
  constraint zuvyr_content_status_allowed
    check (status in ('active','archived')),
  constraint zuvyr_content_title_valid
    check (title is null or length(btrim(title)) between 1 and 500),
  constraint zuvyr_content_source_kind_valid
    check (length(btrim(source_kind)) between 1 and 80),
  constraint zuvyr_content_source_system_valid
    check (length(btrim(source_system)) between 1 and 80),
  constraint zuvyr_content_source_id_valid
    check (length(btrim(source_id)) between 1 and 500),
  constraint zuvyr_content_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint zuvyr_content_source_unique
    unique (owner_id, source_system, source_id)
);

create table if not exists public.zuvyr_content_versions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.zuvyr_content_objects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  version_number integer not null,
  source_version_key text not null,
  mime_type text,
  uri text,
  text_content text,
  sha256 text,
  payload jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint zuvyr_content_version_number_valid
    check (version_number >= 1),
  constraint zuvyr_content_source_version_key_valid
    check (length(btrim(source_version_key)) between 1 and 500),
  constraint zuvyr_content_version_mime_valid
    check (mime_type is null or length(btrim(mime_type)) between 1 and 255),
  constraint zuvyr_content_version_uri_valid
    check (uri is null or length(btrim(uri)) between 1 and 4000),
  constraint zuvyr_content_version_sha256_valid
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  constraint zuvyr_content_version_payload_object
    check (jsonb_typeof(payload) = 'object'),
  constraint zuvyr_content_version_provenance_object
    check (jsonb_typeof(provenance) = 'object'),
  constraint zuvyr_content_version_number_unique
    unique (content_id, version_number),
  constraint zuvyr_content_source_version_unique
    unique (content_id, source_version_key)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_content_current_version_fkey'
      and conrelid = 'public.zuvyr_content_objects'::regclass
  ) then
    alter table public.zuvyr_content_objects
      add constraint zuvyr_content_current_version_fkey
      foreign key (current_version_id)
      references public.zuvyr_content_versions(id)
      on delete set null;
  end if;
end
$$;

create index if not exists zuvyr_content_owner_updated_idx
  on public.zuvyr_content_objects (owner_id, updated_at desc);
create index if not exists zuvyr_content_owner_kind_updated_idx
  on public.zuvyr_content_objects (owner_id, kind, updated_at desc);
create index if not exists zuvyr_content_project_updated_idx
  on public.zuvyr_content_objects (project_id, updated_at desc)
  where project_id is not null;
create index if not exists zuvyr_content_versions_content_created_idx
  on public.zuvyr_content_versions (content_id, created_at desc);

alter table public.zuvyr_content_objects enable row level security;
alter table public.zuvyr_content_versions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='zuvyr_content_objects'
      and policyname='zuvyr_content_objects_owner_select'
  ) then
    create policy zuvyr_content_objects_owner_select
      on public.zuvyr_content_objects
      for select
      to authenticated
      using (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='zuvyr_content_versions'
      and policyname='zuvyr_content_versions_owner_select'
  ) then
    create policy zuvyr_content_versions_owner_select
      on public.zuvyr_content_versions
      for select
      to authenticated
      using (owner_id = auth.uid());
  end if;
end
$$;

revoke all on public.zuvyr_content_objects from anon, authenticated;
revoke all on public.zuvyr_content_versions from anon, authenticated;
grant select on public.zuvyr_content_objects to authenticated;
grant select on public.zuvyr_content_versions to authenticated;

create or replace function public.upsert_zuvyr_content_version(
  p_owner_id uuid,
  p_project_id uuid,
  p_kind text,
  p_title text,
  p_source_kind text,
  p_source_system text,
  p_source_id text,
  p_source_version_key text,
  p_metadata jsonb,
  p_version jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_content public.zuvyr_content_objects%rowtype;
  v_version public.zuvyr_content_versions%rowtype;
  v_version_number integer;
  v_replayed boolean := false;
  v_kind text := lower(btrim(coalesce(p_kind,'')));
  v_title text := nullif(btrim(coalesce(p_title,'')), '');
  v_source_kind text := btrim(coalesce(p_source_kind,''));
  v_source_system text := btrim(coalesce(p_source_system,''));
  v_source_id text := btrim(coalesce(p_source_id,''));
  v_source_version_key text := btrim(coalesce(p_source_version_key,''));
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_payload jsonb;
  v_provenance jsonb;
  v_sha256 text;
begin
  if v_kind not in ('text','image','video','audio','document','code','3d','web','research') then
    raise exception 'pack041_content_kind_invalid';
  end if;

  if length(v_source_kind) not between 1 and 80
     or length(v_source_system) not between 1 and 80
     or length(v_source_id) not between 1 and 500
     or length(v_source_version_key) not between 1 and 500 then
    raise exception 'pack041_content_source_invalid';
  end if;

  if jsonb_typeof(v_metadata) <> 'object'
     or p_version is null
     or jsonb_typeof(p_version) <> 'object' then
    raise exception 'pack041_content_json_invalid';
  end if;

  v_payload := coalesce(p_version->'payload', '{}'::jsonb);
  v_provenance := coalesce(p_version->'provenance', '{}'::jsonb);
  if jsonb_typeof(v_payload) <> 'object'
     or jsonb_typeof(v_provenance) <> 'object' then
    raise exception 'pack041_content_version_json_invalid';
  end if;

  v_sha256 := nullif(lower(btrim(coalesce(p_version->>'sha256',''))), '');
  if v_sha256 is not null and v_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'pack041_content_sha256_invalid';
  end if;

  if p_project_id is not null and not exists (
    select 1 from public.workspace_projects
    where id=p_project_id and owner_id=p_owner_id
  ) then
    raise exception 'pack041_project_owner_mismatch';
  end if;

  insert into public.zuvyr_content_objects (
    owner_id, project_id, kind, title, source_kind,
    source_system, source_id, metadata
  )
  values (
    p_owner_id, p_project_id, v_kind, v_title, v_source_kind,
    v_source_system, v_source_id, v_metadata
  )
  on conflict (owner_id, source_system, source_id) do nothing;

  select *
  into v_content
  from public.zuvyr_content_objects
  where owner_id=p_owner_id
    and source_system=v_source_system
    and source_id=v_source_id
  for update;

  if v_content.id is null then
    raise exception 'pack041_content_create_failed';
  end if;

  if v_content.kind <> v_kind
     or v_content.project_id is distinct from p_project_id then
    raise exception 'pack041_content_identity_conflict';
  end if;

  select *
  into v_version
  from public.zuvyr_content_versions
  where content_id=v_content.id
    and source_version_key=v_source_version_key;

  if v_version.id is not null then
    v_replayed := true;
  else
    select coalesce(max(version_number),0)+1
    into v_version_number
    from public.zuvyr_content_versions
    where content_id=v_content.id;

    insert into public.zuvyr_content_versions (
      content_id, owner_id, version_number, source_version_key,
      mime_type, uri, text_content, sha256, payload, provenance
    )
    values (
      v_content.id,
      p_owner_id,
      v_version_number,
      v_source_version_key,
      nullif(btrim(coalesce(p_version->>'mimeType','')), ''),
      nullif(btrim(coalesce(p_version->>'uri','')), ''),
      p_version->>'text',
      v_sha256,
      v_payload,
      v_provenance
    )
    returning * into v_version;

    update public.zuvyr_content_objects
    set current_version_id=v_version.id,
        title=coalesce(v_title,title),
        metadata=metadata || v_metadata,
        updated_at=now()
    where id=v_content.id
    returning * into v_content;
  end if;

  return jsonb_build_object(
    'contentId', v_content.id,
    'versionId', v_version.id,
    'versionNumber', v_version.version_number,
    'kind', v_content.kind,
    'replayed', v_replayed
  );
end
$$;

create or replace function public.resolve_zuvyr_content_by_source(
  p_owner_id uuid,
  p_source_system text,
  p_source_id text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'contentId', c.id,
    'versionId', c.current_version_id,
    'kind', c.kind,
    'projectId', c.project_id,
    'sourceSystem', c.source_system,
    'sourceId', c.source_id
  )
  from public.zuvyr_content_objects c
  where c.owner_id=p_owner_id
    and c.source_system=btrim(p_source_system)
    and c.source_id=btrim(p_source_id)
  limit 1
$$;

revoke all on function public.upsert_zuvyr_content_version(uuid,uuid,text,text,text,text,text,text,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.resolve_zuvyr_content_by_source(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.upsert_zuvyr_content_version(uuid,uuid,text,text,text,text,text,text,jsonb,jsonb)
  to service_role;
grant execute on function public.resolve_zuvyr_content_by_source(uuid,text,text)
  to service_role;

alter table public.zuvyr_task_steps
  add column if not exists canonical_content_id uuid
    references public.zuvyr_content_objects(id) on delete set null;
alter table public.generation_jobs
  add column if not exists canonical_content_id uuid
    references public.zuvyr_content_objects(id) on delete set null;
alter table public.conversation_assets
  add column if not exists canonical_content_id uuid
    references public.zuvyr_content_objects(id) on delete set null;
alter table public.audio_artifacts
  add column if not exists canonical_content_id uuid
    references public.zuvyr_content_objects(id) on delete set null;
alter table public.code_project_versions
  add column if not exists canonical_content_id uuid
    references public.zuvyr_content_objects(id) on delete set null;
alter table public.workspace_items
  add column if not exists canonical_content_id uuid
    references public.zuvyr_content_objects(id) on delete set null;

create index if not exists zuvyr_task_steps_content_idx
  on public.zuvyr_task_steps(canonical_content_id)
  where canonical_content_id is not null;
create index if not exists generation_jobs_content_idx
  on public.generation_jobs(canonical_content_id)
  where canonical_content_id is not null;
create index if not exists conversation_assets_content_idx
  on public.conversation_assets(canonical_content_id)
  where canonical_content_id is not null;
create index if not exists audio_artifacts_content_idx
  on public.audio_artifacts(canonical_content_id)
  where canonical_content_id is not null;
create index if not exists code_project_versions_content_idx
  on public.code_project_versions(canonical_content_id)
  where canonical_content_id is not null;
create index if not exists workspace_items_content_idx
  on public.workspace_items(canonical_content_id)
  where canonical_content_id is not null;

create or replace function public.pack041_task_step_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_kind text;
  v_result jsonb;
  v_uri text;
  v_text text;
begin
  if new.state <> 'succeeded'
     or new.output is null
     or new.canonical_content_id is not null then
    return new;
  end if;

  v_kind := case
    when new.capability='chat.respond' then 'text'
    when new.capability in ('research.run','project.collect') then 'research'
    when new.capability='image.generate' then 'image'
    when new.capability='video.generate' then 'video'
    when new.capability='audio.generate' then 'audio'
    when new.capability like 'code.%' then 'code'
    when new.capability like 'web.%' then 'web'
    when new.capability like '3d.%' then '3d'
    else null
  end;

  if v_kind is null then return new; end if;

  select user_id into v_owner
  from public.zuvyr_task_runs
  where id=new.task_run_id;

  if v_owner is null then return new; end if;

  v_uri := coalesce(
    new.output->>'url',
    new.output->>'resultUrl',
    new.output->>'result_url',
    new.output->>'exportUrl',
    new.output->>'export_url'
  );
  v_text := new.output->>'text';

  v_result := public.upsert_zuvyr_content_version(
    v_owner,
    null,
    v_kind,
    new.capability,
    'task_step',
    'durable_task_step',
    new.task_run_id::text || ':' || new.step_key,
    'final',
    jsonb_build_object(
      'capability', new.capability,
      'taskRunId', new.task_run_id,
      'stepKey', new.step_key
    ),
    jsonb_build_object(
      'mimeType', null,
      'uri', v_uri,
      'text', v_text,
      'payload', new.output,
      'provenance', jsonb_build_object(
        'taskRunId', new.task_run_id,
        'stepKey', new.step_key,
        'capability', new.capability,
        'provider', new.provider,
        'modelTool', new.model_tool,
        'usageRecordId', new.usage_record_id
      )
    )
  );

  new.canonical_content_id := (v_result->>'contentId')::uuid;
  return new;
end
$$;

drop trigger if exists pack041_task_step_content_trg on public.zuvyr_task_steps;
create trigger pack041_task_step_content_trg
before insert or update of state, output on public.zuvyr_task_steps
for each row execute function public.pack041_task_step_content();

create or replace function public.pack041_generation_job_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_uri text;
  v_result jsonb;
begin
  if new.canonical_content_id is not null then return new; end if;
  if lower(coalesce(new.status,'')) not in ('succeeded','completed','done') then return new; end if;

  v_kind := case lower(coalesce(new.feature,''))
    when 'image' then 'image'
    when 'video' then 'video'
    else null
  end;
  if v_kind is null then return new; end if;

  v_uri := coalesce(new.export_url,new.result_url);
  if v_uri is null then return new; end if;

  v_result := public.upsert_zuvyr_content_version(
    new.user_id,
    null,
    v_kind,
    coalesce(new.prompt,new.feature),
    'generated',
    'generation_job',
    new.id::text,
    'final',
    jsonb_build_object(
      'feature', new.feature,
      'conversationId', new.conversation_id
    ),
    jsonb_build_object(
      'uri', v_uri,
      'payload', jsonb_build_object(
        'feature', new.feature,
        'imageOperation', new.image_operation,
        'videoOperation', new.video_operation,
        'previewUrl', new.preview_url,
        'exportUrl', new.export_url
      ),
      'provenance', jsonb_build_object(
        'generationJobId', new.id,
        'requestMessageId', new.request_message_id,
        'responseMessageId', new.response_message_id,
        'referenceAssetIds', new.reference_asset_ids,
        'sourceAssetId', new.source_asset_id,
        'sourceImageAssetId', new.source_image_asset_id,
        'sourceVideoAssetId', new.source_video_asset_id
      )
    )
  );

  new.canonical_content_id := (v_result->>'contentId')::uuid;
  return new;
end
$$;

drop trigger if exists pack041_generation_job_content_trg on public.generation_jobs;
create trigger pack041_generation_job_content_trg
before insert or update of status, result_url, export_url on public.generation_jobs
for each row execute function public.pack041_generation_job_content();

create or replace function public.pack041_conversation_asset_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_result jsonb;
begin
  if new.canonical_content_id is not null then return new; end if;

  v_kind := case lower(coalesce(new.asset_type,''))
    when 'image' then 'image'
    when 'video' then 'video'
    when 'audio' then 'audio'
    when 'code' then 'code'
    when 'file' then 'document'
    when 'document' then 'document'
    else null
  end;
  if v_kind is null then return new; end if;

  v_result := public.upsert_zuvyr_content_version(
    new.owner_id,
    null,
    v_kind,
    new.original_name,
    'uploaded',
    'conversation_asset',
    new.id::text,
    'initial',
    jsonb_build_object(
      'conversationId', new.conversation_id,
      'messageId', new.message_id
    ),
    jsonb_build_object(
      'mimeType', new.mime_type,
      'uri', new.url,
      'sha256', new.sha256,
      'payload', jsonb_build_object(
        'storageBucket', new.storage_bucket,
        'storagePath', new.storage_path,
        'fileSizeBytes', new.file_size_bytes,
        'scanStatus', new.scan_status,
        'extractionStatus', new.extraction_status
      ),
      'provenance', jsonb_build_object(
        'conversationId', new.conversation_id,
        'messageId', new.message_id,
        'assetId', new.id
      )
    )
  );

  new.canonical_content_id := (v_result->>'contentId')::uuid;
  return new;
end
$$;

drop trigger if exists pack041_conversation_asset_content_trg on public.conversation_assets;
create trigger pack041_conversation_asset_content_trg
before insert on public.conversation_assets
for each row execute function public.pack041_conversation_asset_content();

create or replace function public.pack041_audio_artifact_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if new.canonical_content_id is not null then return new; end if;

  v_result := public.upsert_zuvyr_content_version(
    new.owner_id,
    null,
    'audio',
    new.asset_type,
    'generated',
    'audio_artifact',
    new.id::text,
    'final',
    coalesce(new.metadata,'{}'::jsonb),
    jsonb_build_object(
      'mimeType', new.mime_type,
      'uri', new.url,
      'payload', jsonb_build_object(
        'jobId', new.job_id,
        'assetType', new.asset_type,
        'durationSeconds', new.duration_seconds
      ),
      'provenance', jsonb_build_object(
        'audioArtifactId', new.id,
        'audioJobId', new.job_id
      )
    )
  );

  new.canonical_content_id := (v_result->>'contentId')::uuid;
  return new;
end
$$;

drop trigger if exists pack041_audio_artifact_content_trg on public.audio_artifacts;
create trigger pack041_audio_artifact_content_trg
before insert on public.audio_artifacts
for each row execute function public.pack041_audio_artifact_content();

create or replace function public.pack041_code_version_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_name text;
  v_result jsonb;
begin
  if new.canonical_content_id is not null then return new; end if;

  select owner_id,name
  into v_owner,v_name
  from public.code_projects
  where id=new.project_id;

  if v_owner is null then return new; end if;

  v_result := public.upsert_zuvyr_content_version(
    v_owner,
    null,
    'code',
    v_name,
    'code_project',
    'code_project',
    new.project_id::text,
    new.id::text,
    jsonb_build_object('codeProjectId',new.project_id),
    jsonb_build_object(
      'payload', new.snapshot,
      'provenance', jsonb_build_object(
        'codeProjectId', new.project_id,
        'codeProjectVersionId', new.id,
        'createdBy', new.created_by
      )
    )
  );

  new.canonical_content_id := (v_result->>'contentId')::uuid;
  return new;
end
$$;

drop trigger if exists pack041_code_version_content_trg on public.code_project_versions;
create trigger pack041_code_version_content_trg
before insert on public.code_project_versions
for each row execute function public.pack041_code_version_content();

create or replace function public.pack041_workspace_item_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_result jsonb;
begin
  if new.canonical_content_id is not null then return new; end if;

  v_kind := lower(coalesce(new.kind,''));
  if v_kind not in ('text','image','video','audio','document','code','3d','web','research') then
    return new;
  end if;

  v_result := public.upsert_zuvyr_content_version(
    new.owner_id,
    null,
    v_kind,
    new.name,
    'workspace',
    'workspace_item',
    new.id::text,
    'initial',
    coalesce(new.metadata,'{}'::jsonb),
    jsonb_build_object(
      'text', new.description,
      'payload', jsonb_build_object(
        'workspaceItemId',new.id,
        'sourceId',new.source_id,
        'metadata',new.metadata
      ),
      'provenance', jsonb_build_object(
        'workspaceItemId',new.id,
        'sourceId',new.source_id
      )
    )
  );

  new.canonical_content_id := (v_result->>'contentId')::uuid;
  return new;
end
$$;

drop trigger if exists pack041_workspace_item_content_trg on public.workspace_items;
create trigger pack041_workspace_item_content_trg
before insert on public.workspace_items
for each row execute function public.pack041_workspace_item_content();

commit;
