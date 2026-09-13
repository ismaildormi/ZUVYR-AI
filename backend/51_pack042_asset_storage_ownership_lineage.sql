-- ZUVYR Pack042 — Asset Storage / Ownership / Lineage
-- Canonical asset registry layered on Pack041 content/version identity.
-- Existing conversation-files bucket stays private. Signed URLs are issued by
-- service-role backend code only; no direct authenticated storage policy is added.

begin;

create table if not exists public.zuvyr_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  canonical_content_id uuid not null
    references public.zuvyr_content_objects(id) on delete cascade,
  canonical_version_id uuid not null
    references public.zuvyr_content_versions(id) on delete restrict,
  storage_bucket text not null,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  sha256 text not null,
  retention_class text not null default 'standard',
  retain_until timestamptz,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint zuvyr_assets_bucket_valid
    check (storage_bucket = 'conversation-files'),
  constraint zuvyr_assets_path_valid
    check (
      length(storage_path) between 1 and 1200
      and storage_path !~ '(^/|\\\\|\\.\\.)'
    ),
  constraint zuvyr_assets_mime_valid
    check (length(btrim(mime_type)) between 1 and 255),
  constraint zuvyr_assets_size_valid
    check (file_size_bytes between 0 and 629145600),
  constraint zuvyr_assets_sha256_valid
    check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint zuvyr_assets_retention_allowed
    check (retention_class in ('standard','temporary','pinned','legal_hold')),
  constraint zuvyr_assets_status_allowed
    check (status in ('active','deleted')),
  constraint zuvyr_assets_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint zuvyr_assets_storage_unique
    unique (storage_bucket, storage_path),
  constraint zuvyr_assets_owner_dedupe_unique
    unique (owner_id, sha256, file_size_bytes, mime_type)
);

create table if not exists public.zuvyr_asset_lineage (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  derived_asset_id uuid not null
    references public.zuvyr_assets(id) on delete cascade,
  source_asset_id uuid not null
    references public.zuvyr_assets(id) on delete restrict,
  source_content_version_id uuid not null
    references public.zuvyr_content_versions(id) on delete restrict,
  relation_type text not null,
  task_run_id uuid references public.zuvyr_task_runs(id) on delete set null,
  step_id bigint references public.zuvyr_task_steps(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint zuvyr_asset_lineage_relation_allowed
    check (relation_type in (
      'derived_from','edited_from','transcoded_from',
      'extracted_from','rendered_from','versioned_from'
    )),
  constraint zuvyr_asset_lineage_not_self
    check (derived_asset_id <> source_asset_id),
  constraint zuvyr_asset_lineage_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint zuvyr_asset_lineage_unique
    unique (
      owner_id,
      derived_asset_id,
      source_asset_id,
      source_content_version_id,
      relation_type
    )
);

create table if not exists public.zuvyr_asset_egress_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  asset_id uuid not null references public.zuvyr_assets(id) on delete cascade,
  request_id text not null,
  bytes bigint not null,
  purpose text not null,
  pricing_state text not null default 'unpriced',
  charged_credits integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint zuvyr_asset_egress_request_valid
    check (length(btrim(request_id)) between 1 and 200),
  constraint zuvyr_asset_egress_bytes_valid
    check (bytes >= 0),
  constraint zuvyr_asset_egress_purpose_valid
    check (length(btrim(purpose)) between 1 and 80),
  constraint zuvyr_asset_egress_pricing_state_allowed
    check (pricing_state in ('unpriced','measured','priced')),
  constraint zuvyr_asset_egress_no_fake_charge
    check (
      (pricing_state='unpriced' and charged_credits=0)
      or (pricing_state in ('measured','priced') and charged_credits>=0)
    ),
  constraint zuvyr_asset_egress_metadata_object
    check (jsonb_typeof(metadata)='object'),
  constraint zuvyr_asset_egress_request_unique
    unique (owner_id, request_id)
);

create index if not exists zuvyr_assets_owner_created_idx
  on public.zuvyr_assets(owner_id, created_at desc);
create index if not exists zuvyr_assets_content_version_idx
  on public.zuvyr_assets(canonical_content_id, canonical_version_id);
create index if not exists zuvyr_assets_retention_idx
  on public.zuvyr_assets(retention_class, retain_until)
  where status='active';
create index if not exists zuvyr_asset_lineage_derived_idx
  on public.zuvyr_asset_lineage(derived_asset_id, created_at desc);
create index if not exists zuvyr_asset_lineage_source_idx
  on public.zuvyr_asset_lineage(source_asset_id, created_at desc);
create index if not exists zuvyr_asset_egress_owner_created_idx
  on public.zuvyr_asset_egress_events(owner_id, created_at desc);

alter table public.zuvyr_assets enable row level security;
alter table public.zuvyr_asset_lineage enable row level security;
alter table public.zuvyr_asset_egress_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='zuvyr_assets'
      and policyname='zuvyr_assets_owner_select'
  ) then
    create policy zuvyr_assets_owner_select
      on public.zuvyr_assets
      for select to authenticated
      using (owner_id=auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='zuvyr_asset_lineage'
      and policyname='zuvyr_asset_lineage_owner_select'
  ) then
    create policy zuvyr_asset_lineage_owner_select
      on public.zuvyr_asset_lineage
      for select to authenticated
      using (owner_id=auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='zuvyr_asset_egress_events'
      and policyname='zuvyr_asset_egress_owner_select'
  ) then
    create policy zuvyr_asset_egress_owner_select
      on public.zuvyr_asset_egress_events
      for select to authenticated
      using (owner_id=auth.uid());
  end if;
end
$$;

revoke all on public.zuvyr_assets from anon, authenticated;
revoke all on public.zuvyr_asset_lineage from anon, authenticated;
revoke all on public.zuvyr_asset_egress_events from anon, authenticated;
grant select on public.zuvyr_assets to authenticated;
grant select on public.zuvyr_asset_lineage to authenticated;
grant select on public.zuvyr_asset_egress_events to authenticated;

create or replace function public.register_zuvyr_asset(
  p_owner_id uuid,
  p_canonical_content_id uuid,
  p_canonical_version_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sha256 text,
  p_retention_class text,
  p_retain_until timestamptz,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_existing public.zuvyr_assets%rowtype;
  v_created public.zuvyr_assets%rowtype;
  v_path text:=btrim(coalesce(p_storage_path,''));
  v_hash text:=lower(btrim(coalesce(p_sha256,'')));
  v_mime text:=lower(btrim(coalesce(p_mime_type,'')));
  v_retention text:=lower(btrim(coalesce(p_retention_class,'standard')));
begin
  if p_storage_bucket <> 'conversation-files' then
    raise exception 'pack042_bucket_invalid';
  end if;

  if v_path !~ ('^' || p_owner_id::text || '/')
     or v_path ~ '(^/|\\\\|\\.\\.)' then
    raise exception 'pack042_storage_path_owner_mismatch';
  end if;

  if p_file_size_bytes < 0 or p_file_size_bytes > 629145600 then
    raise exception 'pack042_file_size_invalid';
  end if;

  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'pack042_sha256_invalid';
  end if;

  if length(v_mime) not between 1 and 255 then
    raise exception 'pack042_mime_invalid';
  end if;

  if v_retention not in ('standard','temporary','pinned','legal_hold') then
    raise exception 'pack042_retention_invalid';
  end if;

  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object' then
    raise exception 'pack042_metadata_invalid';
  end if;

  if not exists (
    select 1
    from public.zuvyr_content_objects c
    join public.zuvyr_content_versions v
      on v.content_id=c.id
     and v.id=p_canonical_version_id
     and v.owner_id=p_owner_id
    where c.id=p_canonical_content_id
      and c.owner_id=p_owner_id
  ) then
    raise exception 'pack042_content_version_owner_mismatch';
  end if;

  select *
  into v_existing
  from public.zuvyr_assets
  where owner_id=p_owner_id
    and sha256=v_hash
    and file_size_bytes=p_file_size_bytes
    and mime_type=v_mime
  limit 1;

  if v_existing.id is not null then
    if v_existing.canonical_content_id <> p_canonical_content_id
       or v_existing.canonical_version_id <> p_canonical_version_id then
      raise exception 'pack042_dedupe_content_binding_conflict';
    end if;

    return jsonb_build_object(
      'assetId',v_existing.id,
      'contentId',v_existing.canonical_content_id,
      'versionId',v_existing.canonical_version_id,
      'storageBucket',v_existing.storage_bucket,
      'storagePath',v_existing.storage_path,
      'fileSizeBytes',v_existing.file_size_bytes,
      'replayed',true
    );
  end if;

  insert into public.zuvyr_assets(
    owner_id,canonical_content_id,canonical_version_id,
    storage_bucket,storage_path,mime_type,file_size_bytes,sha256,
    retention_class,retain_until,metadata
  ) values (
    p_owner_id,p_canonical_content_id,p_canonical_version_id,
    p_storage_bucket,v_path,v_mime,p_file_size_bytes,v_hash,
    v_retention,p_retain_until,coalesce(p_metadata,'{}'::jsonb)
  )
  returning * into v_created;

  return jsonb_build_object(
    'assetId',v_created.id,
    'contentId',v_created.canonical_content_id,
    'versionId',v_created.canonical_version_id,
    'storageBucket',v_created.storage_bucket,
    'storagePath',v_created.storage_path,
    'fileSizeBytes',v_created.file_size_bytes,
    'replayed',false
  );
end
$$;

create or replace function public.resolve_zuvyr_asset_for_owner(
  p_owner_id uuid,
  p_asset_id uuid
)
returns jsonb
language sql
security definer
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'assetId',a.id,
    'contentId',a.canonical_content_id,
    'versionId',a.canonical_version_id,
    'storageBucket',a.storage_bucket,
    'storagePath',a.storage_path,
    'mimeType',a.mime_type,
    'fileSizeBytes',a.file_size_bytes,
    'sha256',a.sha256,
    'retentionClass',a.retention_class,
    'retainUntil',a.retain_until,
    'status',a.status
  )
  from public.zuvyr_assets a
  where a.id=p_asset_id
    and a.owner_id=p_owner_id
    and a.status='active'
  limit 1
$$;

create or replace function public.link_zuvyr_asset_lineage(
  p_owner_id uuid,
  p_derived_asset_id uuid,
  p_source_asset_id uuid,
  p_source_content_version_id uuid,
  p_relation_type text,
  p_task_run_id uuid,
  p_step_id bigint,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_source public.zuvyr_assets%rowtype;
  v_derived public.zuvyr_assets%rowtype;
  v_row public.zuvyr_asset_lineage%rowtype;
  v_relation text:=lower(btrim(coalesce(p_relation_type,'')));
begin
  select * into v_source
  from public.zuvyr_assets
  where id=p_source_asset_id and owner_id=p_owner_id and status='active';

  select * into v_derived
  from public.zuvyr_assets
  where id=p_derived_asset_id and owner_id=p_owner_id and status='active';

  if v_source.id is null or v_derived.id is null then
    raise exception 'pack042_asset_owner_mismatch';
  end if;

  if v_source.id=v_derived.id then
    raise exception 'pack042_lineage_self_reference';
  end if;

  if v_source.canonical_version_id <> p_source_content_version_id then
    raise exception 'pack042_source_version_mismatch';
  end if;

  if v_relation not in (
    'derived_from','edited_from','transcoded_from',
    'extracted_from','rendered_from','versioned_from'
  ) then
    raise exception 'pack042_lineage_relation_invalid';
  end if;

  insert into public.zuvyr_asset_lineage(
    owner_id,derived_asset_id,source_asset_id,
    source_content_version_id,relation_type,task_run_id,step_id,metadata
  ) values (
    p_owner_id,p_derived_asset_id,p_source_asset_id,
    p_source_content_version_id,v_relation,p_task_run_id,p_step_id,
    coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (
    owner_id,derived_asset_id,source_asset_id,
    source_content_version_id,relation_type
  ) do update set metadata=public.zuvyr_asset_lineage.metadata || excluded.metadata
  returning * into v_row;

  return jsonb_build_object(
    'lineageId',v_row.id,
    'derivedAssetId',v_row.derived_asset_id,
    'sourceAssetId',v_row.source_asset_id,
    'sourceContentVersionId',v_row.source_content_version_id,
    'relationType',v_row.relation_type
  );
end
$$;

create or replace function public.record_zuvyr_asset_egress(
  p_owner_id uuid,
  p_asset_id uuid,
  p_request_id text,
  p_bytes bigint,
  p_purpose text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_asset public.zuvyr_assets%rowtype;
  v_row public.zuvyr_asset_egress_events%rowtype;
begin
  select * into v_asset
  from public.zuvyr_assets
  where id=p_asset_id and owner_id=p_owner_id and status='active';

  if v_asset.id is null then
    raise exception 'pack042_asset_owner_mismatch';
  end if;

  if p_bytes < 0 then
    raise exception 'pack042_egress_bytes_invalid';
  end if;

  if length(btrim(coalesce(p_request_id,''))) not between 1 and 200
     or length(btrim(coalesce(p_purpose,''))) not between 1 and 80 then
    raise exception 'pack042_egress_identity_invalid';
  end if;

  insert into public.zuvyr_asset_egress_events(
    owner_id,asset_id,request_id,bytes,purpose,
    pricing_state,charged_credits,metadata
  ) values (
    p_owner_id,p_asset_id,btrim(p_request_id),p_bytes,btrim(p_purpose),
    'unpriced',0,coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (owner_id,request_id) do nothing;

  select * into v_row
  from public.zuvyr_asset_egress_events
  where owner_id=p_owner_id and request_id=btrim(p_request_id);

  if v_row.asset_id <> p_asset_id
     or v_row.bytes <> p_bytes
     or v_row.purpose <> btrim(p_purpose) then
    raise exception 'pack042_egress_replay_conflict';
  end if;

  return jsonb_build_object(
    'egressEventId',v_row.id,
    'assetId',v_row.asset_id,
    'bytes',v_row.bytes,
    'pricingState',v_row.pricing_state,
    'chargedCredits',v_row.charged_credits
  );
end
$$;

revoke all on function public.register_zuvyr_asset(uuid,uuid,uuid,text,text,text,bigint,text,text,timestamptz,jsonb)
  from public,anon,authenticated;
revoke all on function public.resolve_zuvyr_asset_for_owner(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.link_zuvyr_asset_lineage(uuid,uuid,uuid,uuid,text,uuid,bigint,jsonb)
  from public,anon,authenticated;
revoke all on function public.record_zuvyr_asset_egress(uuid,uuid,text,bigint,text,jsonb)
  from public,anon,authenticated;

grant execute on function public.register_zuvyr_asset(uuid,uuid,uuid,text,text,text,bigint,text,text,timestamptz,jsonb)
  to service_role;
grant execute on function public.resolve_zuvyr_asset_for_owner(uuid,uuid)
  to service_role;
grant execute on function public.link_zuvyr_asset_lineage(uuid,uuid,uuid,uuid,text,uuid,bigint,jsonb)
  to service_role;
grant execute on function public.record_zuvyr_asset_egress(uuid,uuid,text,bigint,text,jsonb)
  to service_role;

commit;
