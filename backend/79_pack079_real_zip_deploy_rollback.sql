-- ZUVYR V1 PACK079 — Real ZIP + Deploy + Rollback authority.
-- Additive to PACK075-078. Live deployment remains fail-closed until M16,
-- provider credentials and exact deployment pricing are verified.

create table if not exists public.code_release_validations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.code_projects(id) on delete cascade,
  project_version_id uuid not null references public.code_project_versions(id) on delete cascade,
  sandbox_session_id uuid not null references public.code_sandbox_sessions(id) on delete restrict,
  project_revision bigint not null check (project_revision >= 0),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  files_digest text not null check (files_digest ~ '^[0-9a-f]{64}$'),
  build_job_id uuid not null references public.code_runtime_jobs(id) on delete restrict,
  test_job_id uuid not null references public.code_runtime_jobs(id) on delete restrict,
  preview_state text not null check (preview_state = 'ready'),
  preview_transport_status text not null check (preview_transport_status = 'verified'),
  validated_at timestamptz not null default now(),
  unique(owner_id, project_version_id, snapshot_sha256)
);

create index if not exists code_release_validations_project_idx
  on public.code_release_validations(owner_id, project_id, validated_at desc);

create table if not exists public.code_release_artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.code_projects(id) on delete cascade,
  project_version_id uuid not null references public.code_project_versions(id) on delete restrict,
  validation_id uuid not null references public.code_release_validations(id) on delete restrict,
  format text not null default 'zip' check (format = 'zip'),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  archive_sha256 text not null check (archive_sha256 ~ '^[0-9a-f]{64}$'),
  file_count integer not null check (file_count >= 1 and file_count <= 1024),
  asset_count integer not null default 0 check (asset_count >= 0 and asset_count <= 1024),
  archive_bytes bigint not null check (archive_bytes > 0 and archive_bytes <= 1073741824),
  manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(manifest) = 'object'),
  verified_reopen boolean not null default false,
  created_at timestamptz not null default now(),
  unique(owner_id, project_version_id, archive_sha256)
);

create index if not exists code_release_artifacts_project_idx
  on public.code_release_artifacts(owner_id, project_id, created_at desc);

create table if not exists public.code_deployment_targets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.code_projects(id) on delete cascade,
  provider text not null default 'vercel' check (provider = 'vercel'),
  provider_project_id text not null check (char_length(provider_project_id) between 3 and 240),
  display_name text not null check (char_length(display_name) between 1 and 120),
  allowed_targets text[] not null default array['preview','production']::text[]
    check (
      cardinality(allowed_targets) between 1 and 2
      and allowed_targets <@ array['preview','production']::text[]
    ),
  status text not null default 'active' check (status in ('active','disabled')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, project_id, provider, provider_project_id)
);

create index if not exists code_deployment_targets_project_idx
  on public.code_deployment_targets(owner_id, project_id, status, created_at);

alter table public.code_deployment_targets enable row level security;
revoke all on public.code_deployment_targets from public, anon, authenticated;
grant select, insert, update, delete on public.code_deployment_targets to service_role;

alter table public.code_deploy_requests
  add column if not exists request_id text,
  add column if not exists project_version_id uuid references public.code_project_versions(id) on delete restrict,
  add column if not exists validation_id uuid references public.code_release_validations(id) on delete restrict,
  add column if not exists release_artifact_id uuid references public.code_release_artifacts(id) on delete restrict,
  add column if not exists deployment_target_id uuid references public.code_deployment_targets(id) on delete restrict,
  add column if not exists provider text,
  add column if not exists provider_project_id text,
  add column if not exists provider_deployment_id text,
  add column if not exists deployment_url text,
  add column if not exists previous_production_deployment_id text,
  add column if not exists artifact_sha256 text,
  add column if not exists approval_receipt jsonb not null default '{}'::jsonb,
  add column if not exists provider_receipt jsonb not null default '{}'::jsonb,
  add column if not exists error_code text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.code_deploy_requests
  drop constraint if exists code_deploy_requests_status_check;

alter table public.code_deploy_requests
  add constraint code_deploy_requests_pack079_status_check check (
    status in (
      'blocked','confirmed','uploading','deploying','ready',
      'promoting','production','failed','cancelled','rolled_back'
    )
  );

do $pack079_deploy_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.code_deploy_requests'::regclass
      and conname='code_deploy_requests_pack079_target_check'
  ) then
    alter table public.code_deploy_requests
      add constraint code_deploy_requests_pack079_target_check
      check (target is null or target in ('preview','production'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.code_deploy_requests'::regclass
      and conname='code_deploy_requests_pack079_request_check'
  ) then
    alter table public.code_deploy_requests
      add constraint code_deploy_requests_pack079_request_check
      check (request_id is null or char_length(request_id) between 1 and 200);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.code_deploy_requests'::regclass
      and conname='code_deploy_requests_pack079_artifact_sha_check'
  ) then
    alter table public.code_deploy_requests
      add constraint code_deploy_requests_pack079_artifact_sha_check
      check (artifact_sha256 is null or artifact_sha256 ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.code_deploy_requests'::regclass
      and conname='code_deploy_requests_pack079_approval_object'
  ) then
    alter table public.code_deploy_requests
      add constraint code_deploy_requests_pack079_approval_object
      check (jsonb_typeof(approval_receipt)='object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.code_deploy_requests'::regclass
      and conname='code_deploy_requests_pack079_provider_object'
  ) then
    alter table public.code_deploy_requests
      add constraint code_deploy_requests_pack079_provider_object
      check (jsonb_typeof(provider_receipt)='object');
  end if;
end
$pack079_deploy_constraints$;

create unique index if not exists code_deploy_requests_owner_request_uidx
  on public.code_deploy_requests(owner_id, request_id)
  where request_id is not null;

create index if not exists code_deploy_requests_release_idx
  on public.code_deploy_requests(owner_id, project_id, project_version_id, created_at desc);

create table if not exists public.code_deployment_rollbacks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.code_projects(id) on delete cascade,
  deploy_request_id uuid not null references public.code_deploy_requests(id) on delete restrict,
  request_id text not null check (char_length(request_id) between 1 and 200),
  rollback_to_provider_deployment_id text not null check (char_length(rollback_to_provider_deployment_id) between 4 and 240),
  status text not null default 'confirmed'
    check (status in ('confirmed','rolling_back','succeeded','failed')),
  approval_receipt jsonb not null default '{}'::jsonb check (jsonb_typeof(approval_receipt)='object'),
  provider_receipt jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_receipt)='object'),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(owner_id, request_id)
);

create index if not exists code_deployment_rollbacks_project_idx
  on public.code_deployment_rollbacks(owner_id, project_id, created_at desc);

alter table public.code_release_validations enable row level security;
alter table public.code_release_artifacts enable row level security;
alter table public.code_deployment_rollbacks enable row level security;

revoke all on public.code_release_validations from public, anon, authenticated;
revoke all on public.code_release_artifacts from public, anon, authenticated;
revoke all on public.code_deploy_requests from public, anon, authenticated;
revoke all on public.code_deployment_rollbacks from public, anon, authenticated;

grant select, insert, update, delete on public.code_release_validations to service_role;
grant select, insert, update, delete on public.code_release_artifacts to service_role;
grant select, insert, update, delete on public.code_deploy_requests to service_role;
grant select, insert, update, delete on public.code_deployment_rollbacks to service_role;

create or replace function public.reserve_zuvyr_code_release_validation_pack079(
  p_owner_id uuid,
  p_project_id uuid,
  p_project_version_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $pack079_validate$
declare
  v_project public.code_projects%rowtype;
  v_version public.code_project_versions%rowtype;
  v_branch public.code_project_branches%rowtype;
  v_runtime public.code_sandbox_runtime_state%rowtype;
  v_build public.code_runtime_jobs%rowtype;
  v_test public.code_runtime_jobs%rowtype;
  v_snapshot_sha text;
  v_existing public.code_release_validations%rowtype;
  v_id uuid;
begin
  select * into v_project
  from public.code_projects
  where id=p_project_id and owner_id=p_owner_id and status='active'
  for update;

  if v_project.id is null then
    raise exception 'pack079_project_not_found';
  end if;

  select * into v_version
  from public.code_project_versions
  where id=p_project_version_id and project_id=p_project_id;

  if v_version.id is null then
    raise exception 'pack079_project_version_not_found';
  end if;

  if jsonb_typeof(v_version.snapshot) <> 'object'
     or jsonb_typeof(v_version.snapshot->'files') <> 'array'
     or jsonb_array_length(v_version.snapshot->'files') < 1 then
    raise exception 'pack079_project_version_not_release_snapshot';
  end if;

  select * into v_branch
  from public.code_project_branches
  where project_id=p_project_id and name=v_project.current_branch;

  if v_branch.id is null or v_branch.head_version_id is distinct from v_version.id then
    raise exception 'pack079_version_not_current_branch_head';
  end if;

  select * into v_runtime
  from public.code_sandbox_runtime_state
  where owner_id=p_owner_id and project_id=p_project_id
  order by updated_at desc
  limit 1;

  if v_runtime.sandbox_session_id is null then
    raise exception 'pack079_validation_runtime_missing';
  end if;

  if v_runtime.synced_revision is distinct from v_project.revision
     or v_runtime.files_digest is null then
    raise exception 'pack079_validation_revision_stale';
  end if;

  if v_runtime.preview_state <> 'ready'
     or v_runtime.preview_transport_status <> 'verified' then
    raise exception 'pack079_preview_not_verified';
  end if;

  if v_runtime.last_build_job_id is null or v_runtime.last_test_job_id is null then
    raise exception 'pack079_build_test_proof_missing';
  end if;

  select * into v_build
  from public.code_runtime_jobs
  where id=v_runtime.last_build_job_id
    and owner_id=p_owner_id
    and project_id=p_project_id
    and sandbox_session_id=v_runtime.sandbox_session_id
    and operation='build';

  select * into v_test
  from public.code_runtime_jobs
  where id=v_runtime.last_test_job_id
    and owner_id=p_owner_id
    and project_id=p_project_id
    and sandbox_session_id=v_runtime.sandbox_session_id
    and operation='test';

  if v_build.id is null or v_build.status <> 'succeeded'
     or v_build.exit_code is distinct from 0 then
    raise exception 'pack079_build_not_verified';
  end if;

  if v_test.id is null or v_test.status <> 'succeeded'
     or v_test.exit_code is distinct from 0 then
    raise exception 'pack079_test_not_verified';
  end if;

  v_snapshot_sha :=
    encode(digest(convert_to(v_version.snapshot::text,'UTF8'),'sha256'),'hex');

  select * into v_existing
  from public.code_release_validations
  where owner_id=p_owner_id
    and project_version_id=p_project_version_id
    and snapshot_sha256=v_snapshot_sha;

  if v_existing.id is not null then
    return jsonb_build_object(
      'success',true,
      'replayed',true,
      'validation_id',v_existing.id,
      'snapshot_sha256',v_existing.snapshot_sha256,
      'files_digest',v_existing.files_digest,
      'validated_at',v_existing.validated_at
    );
  end if;

  insert into public.code_release_validations(
    owner_id,project_id,project_version_id,sandbox_session_id,
    project_revision,snapshot_sha256,files_digest,
    build_job_id,test_job_id,preview_state,preview_transport_status
  ) values (
    p_owner_id,p_project_id,p_project_version_id,v_runtime.sandbox_session_id,
    v_project.revision,v_snapshot_sha,v_runtime.files_digest,
    v_build.id,v_test.id,v_runtime.preview_state,v_runtime.preview_transport_status
  ) returning id into v_id;

  return jsonb_build_object(
    'success',true,
    'replayed',false,
    'validation_id',v_id,
    'snapshot_sha256',v_snapshot_sha,
    'files_digest',v_runtime.files_digest,
    'validated_at',now()
  );
end;
$pack079_validate$;

create or replace function public.record_zuvyr_code_release_artifact_pack079(
  p_owner_id uuid,
  p_project_id uuid,
  p_project_version_id uuid,
  p_validation_id uuid,
  p_snapshot_sha256 text,
  p_manifest_sha256 text,
  p_archive_sha256 text,
  p_file_count integer,
  p_asset_count integer,
  p_archive_bytes bigint,
  p_manifest jsonb,
  p_verified_reopen boolean
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack079_artifact$
declare
  v_validation public.code_release_validations%rowtype;
  v_existing public.code_release_artifacts%rowtype;
  v_id uuid;
begin
  select * into v_validation
  from public.code_release_validations
  where id=p_validation_id
    and owner_id=p_owner_id
    and project_id=p_project_id
    and project_version_id=p_project_version_id;

  if v_validation.id is null then
    raise exception 'pack079_validation_not_found';
  end if;

  if p_snapshot_sha256 <> v_validation.snapshot_sha256 then
    raise exception 'pack079_snapshot_hash_mismatch';
  end if;

  if p_snapshot_sha256 !~ '^[0-9a-f]{64}$'
     or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
     or p_archive_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'pack079_artifact_hash_invalid';
  end if;

  if p_verified_reopen is not true then
    raise exception 'pack079_zip_reopen_not_verified';
  end if;

  if jsonb_typeof(p_manifest) <> 'object' then
    raise exception 'pack079_manifest_invalid';
  end if;

  select * into v_existing
  from public.code_release_artifacts
  where owner_id=p_owner_id
    and project_version_id=p_project_version_id
    and archive_sha256=p_archive_sha256;

  if v_existing.id is not null then
    return jsonb_build_object(
      'success',true,'replayed',true,
      'artifact_id',v_existing.id,
      'archive_sha256',v_existing.archive_sha256
    );
  end if;

  insert into public.code_release_artifacts(
    owner_id,project_id,project_version_id,validation_id,
    snapshot_sha256,manifest_sha256,archive_sha256,
    file_count,asset_count,archive_bytes,manifest,verified_reopen
  ) values (
    p_owner_id,p_project_id,p_project_version_id,p_validation_id,
    p_snapshot_sha256,p_manifest_sha256,p_archive_sha256,
    p_file_count,p_asset_count,p_archive_bytes,p_manifest,true
  ) returning id into v_id;

  return jsonb_build_object(
    'success',true,'replayed',false,
    'artifact_id',v_id,'archive_sha256',p_archive_sha256
  );
end;
$pack079_artifact$;

create or replace function public.reserve_zuvyr_code_deploy_request_pack079(
  p_owner_id uuid,
  p_project_id uuid,
  p_project_version_id uuid,
  p_validation_id uuid,
  p_release_artifact_id uuid,
  p_request_id text,
  p_target text,
  p_deployment_target_id uuid,
  p_approval_receipt jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack079_deploy_reserve$
declare
  v_request text := btrim(coalesce(p_request_id,''));
  v_target text := lower(btrim(coalesce(p_target,'')));
  v_artifact public.code_release_artifacts%rowtype;
  v_deployment_target public.code_deployment_targets%rowtype;
  v_existing public.code_deploy_requests%rowtype;
  v_id uuid;
begin
  if char_length(v_request) not between 1 and 200 then
    raise exception 'pack079_deploy_request_id_invalid';
  end if;

  if v_target not in ('preview','production') then
    raise exception 'pack079_deploy_target_invalid';
  end if;

  if jsonb_typeof(coalesce(p_approval_receipt,'{}'::jsonb)) <> 'object'
     or coalesce((p_approval_receipt->>'allowed')::boolean,false) is not true then
    raise exception 'pack079_deploy_approval_required';
  end if;

  if not exists (
    select 1 from public.code_projects
    where id=p_project_id and owner_id=p_owner_id and status='active'
  ) then
    raise exception 'pack079_project_not_found';
  end if;

  select * into v_deployment_target
  from public.code_deployment_targets
  where id=p_deployment_target_id
    and owner_id=p_owner_id
    and project_id=p_project_id
    and status='active';

  if v_deployment_target.id is null then
    raise exception 'pack079_deployment_target_not_found';
  end if;

  if v_deployment_target.provider <> 'vercel' then
    raise exception 'pack079_deployment_provider_invalid';
  end if;

  if not (v_target = any(v_deployment_target.allowed_targets)) then
    raise exception 'pack079_deployment_target_environment_denied';
  end if;

  select * into v_artifact
  from public.code_release_artifacts
  where id=p_release_artifact_id
    and owner_id=p_owner_id
    and project_id=p_project_id
    and project_version_id=p_project_version_id
    and validation_id=p_validation_id
    and verified_reopen=true;

  if v_artifact.id is null then
    raise exception 'pack079_release_artifact_not_found';
  end if;

  select * into v_existing
  from public.code_deploy_requests
  where owner_id=p_owner_id and request_id=v_request;

  if v_existing.id is not null then
    if v_existing.project_id<>p_project_id
       or v_existing.project_version_id is distinct from p_project_version_id
       or v_existing.release_artifact_id is distinct from p_release_artifact_id
       or coalesce(v_existing.target,'')<>v_target
       or v_existing.deployment_target_id is distinct from p_deployment_target_id then
      raise exception 'pack079_deploy_idempotency_scope_mismatch';
    end if;

    return jsonb_build_object(
      'success',true,'replayed',true,
      'deploy_request_id',v_existing.id,
      'status',v_existing.status
    );
  end if;

  insert into public.code_deploy_requests(
    owner_id,project_id,status,target,confirmed_at,
    request_id,project_version_id,validation_id,release_artifact_id,
    deployment_target_id,provider,provider_project_id,
    artifact_sha256,approval_receipt,updated_at
  ) values (
    p_owner_id,p_project_id,'confirmed',v_target,now(),
    v_request,p_project_version_id,p_validation_id,p_release_artifact_id,
    v_deployment_target.id,v_deployment_target.provider,
    v_deployment_target.provider_project_id,
    v_artifact.archive_sha256,p_approval_receipt,now()
  ) returning id into v_id;

  return jsonb_build_object(
    'success',true,'replayed',false,
    'deploy_request_id',v_id,'status','confirmed'
  );
end;
$pack079_deploy_reserve$;

create or replace function public.transition_zuvyr_code_deploy_request_pack079(
  p_owner_id uuid,
  p_deploy_request_id uuid,
  p_next_status text,
  p_provider_deployment_id text default null,
  p_deployment_url text default null,
  p_previous_production_deployment_id text default null,
  p_provider_receipt jsonb default null,
  p_error_code text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack079_deploy_transition$
declare
  v_row public.code_deploy_requests%rowtype;
  v_next text := lower(btrim(coalesce(p_next_status,'')));
  v_allowed boolean := false;
begin
  select * into v_row
  from public.code_deploy_requests
  where id=p_deploy_request_id and owner_id=p_owner_id
  for update;

  if v_row.id is null then
    raise exception 'pack079_deploy_request_not_found';
  end if;

  if v_row.status=v_next then
    return jsonb_build_object(
      'success',true,'replayed',true,
      'deploy_request_id',v_row.id,'status',v_row.status
    );
  end if;

  if v_row.status in ('failed','cancelled','rolled_back') then
    raise exception 'pack079_deploy_terminal';
  end if;

  v_allowed :=
    (v_row.status='confirmed' and v_next in ('uploading','deploying','failed','cancelled'))
    or
    (v_row.status='uploading' and v_next in ('deploying','failed','cancelled'))
    or
    (v_row.status='deploying' and v_next in ('ready','failed','cancelled'))
    or
    (v_row.status='ready' and v_next in ('promoting','production','failed'))
    or
    (v_row.status='promoting' and v_next in ('production','failed'))
    or
    (v_row.status='production' and v_next='rolled_back');

  if not v_allowed then
    raise exception 'pack079_deploy_transition_invalid';
  end if;

  if v_next in ('ready','promoting','production')
     and char_length(coalesce(p_provider_deployment_id,v_row.provider_deployment_id,'')) < 4 then
    raise exception 'pack079_provider_deployment_required';
  end if;

  if p_provider_receipt is not null
     and jsonb_typeof(p_provider_receipt) <> 'object' then
    raise exception 'pack079_provider_receipt_invalid';
  end if;

  update public.code_deploy_requests
  set
    status=v_next,
    provider_deployment_id=coalesce(nullif(p_provider_deployment_id,''),provider_deployment_id),
    deployment_url=coalesce(nullif(p_deployment_url,''),deployment_url),
    previous_production_deployment_id=coalesce(
      nullif(p_previous_production_deployment_id,''),
      previous_production_deployment_id
    ),
    provider_receipt=case
      when p_provider_receipt is null then provider_receipt
      else p_provider_receipt
    end,
    error_code=case
      when v_next='failed' then left(coalesce(p_error_code,'pack079_deploy_failed'),200)
      else error_code
    end,
    updated_at=now(),
    completed_at=case
      when v_next in ('production','failed','cancelled','rolled_back') then now()
      else completed_at
    end
  where id=v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'success',true,'replayed',false,
    'deploy_request_id',v_row.id,
    'status',v_row.status,
    'provider_deployment_id',v_row.provider_deployment_id,
    'deployment_url',v_row.deployment_url
  );
end;
$pack079_deploy_transition$;

create or replace function public.reserve_zuvyr_code_deployment_rollback_pack079(
  p_owner_id uuid,
  p_project_id uuid,
  p_deploy_request_id uuid,
  p_request_id text,
  p_rollback_to_provider_deployment_id text,
  p_approval_receipt jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack079_rollback_reserve$
declare
  v_request text := btrim(coalesce(p_request_id,''));
  v_deploy public.code_deploy_requests%rowtype;
  v_existing public.code_deployment_rollbacks%rowtype;
  v_id uuid;
begin
  if char_length(v_request) not between 1 and 200 then
    raise exception 'pack079_rollback_request_id_invalid';
  end if;

  if char_length(btrim(coalesce(p_rollback_to_provider_deployment_id,''))) not between 4 and 240 then
    raise exception 'pack079_rollback_target_invalid';
  end if;

  if jsonb_typeof(coalesce(p_approval_receipt,'{}'::jsonb)) <> 'object'
     or coalesce((p_approval_receipt->>'allowed')::boolean,false) is not true then
    raise exception 'pack079_rollback_approval_required';
  end if;

  select * into v_deploy
  from public.code_deploy_requests
  where id=p_deploy_request_id
    and owner_id=p_owner_id
    and project_id=p_project_id;

  if v_deploy.id is null then
    raise exception 'pack079_deploy_request_not_found';
  end if;

  if v_deploy.status <> 'production' then
    raise exception 'pack079_deploy_not_in_production';
  end if;

  select * into v_existing
  from public.code_deployment_rollbacks
  where owner_id=p_owner_id and request_id=v_request;

  if v_existing.id is not null then
    if v_existing.deploy_request_id<>p_deploy_request_id
       or v_existing.rollback_to_provider_deployment_id<>btrim(p_rollback_to_provider_deployment_id) then
      raise exception 'pack079_rollback_idempotency_scope_mismatch';
    end if;
    return jsonb_build_object(
      'success',true,'replayed',true,
      'rollback_id',v_existing.id,'status',v_existing.status
    );
  end if;

  insert into public.code_deployment_rollbacks(
    owner_id,project_id,deploy_request_id,request_id,
    rollback_to_provider_deployment_id,status,approval_receipt
  ) values (
    p_owner_id,p_project_id,p_deploy_request_id,v_request,
    btrim(p_rollback_to_provider_deployment_id),'confirmed',p_approval_receipt
  ) returning id into v_id;

  return jsonb_build_object(
    'success',true,'replayed',false,
    'rollback_id',v_id,'status','confirmed'
  );
end;
$pack079_rollback_reserve$;

create or replace function public.transition_zuvyr_code_deployment_rollback_pack079(
  p_owner_id uuid,
  p_rollback_id uuid,
  p_next_status text,
  p_provider_receipt jsonb default null,
  p_error_code text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack079_rollback_transition$
declare
  v_row public.code_deployment_rollbacks%rowtype;
  v_next text := lower(btrim(coalesce(p_next_status,'')));
begin
  select * into v_row
  from public.code_deployment_rollbacks
  where id=p_rollback_id and owner_id=p_owner_id
  for update;

  if v_row.id is null then
    raise exception 'pack079_rollback_not_found';
  end if;

  if v_row.status=v_next then
    return jsonb_build_object(
      'success',true,'replayed',true,
      'rollback_id',v_row.id,'status',v_row.status
    );
  end if;

  if v_row.status in ('succeeded','failed') then
    raise exception 'pack079_rollback_terminal';
  end if;

  if not (
    (v_row.status='confirmed' and v_next in ('rolling_back','failed'))
    or
    (v_row.status='rolling_back' and v_next in ('succeeded','failed'))
  ) then
    raise exception 'pack079_rollback_transition_invalid';
  end if;

  if p_provider_receipt is not null
     and jsonb_typeof(p_provider_receipt) <> 'object' then
    raise exception 'pack079_provider_receipt_invalid';
  end if;

  update public.code_deployment_rollbacks
  set
    status=v_next,
    provider_receipt=case
      when p_provider_receipt is null then provider_receipt
      else p_provider_receipt
    end,
    error_code=case
      when v_next='failed' then left(coalesce(p_error_code,'pack079_rollback_failed'),200)
      else error_code
    end,
    completed_at=case when v_next in ('succeeded','failed') then now() else completed_at end
  where id=v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'success',true,'replayed',false,
    'rollback_id',v_row.id,'status',v_row.status
  );
end;
$pack079_rollback_transition$;

revoke all on function public.reserve_zuvyr_code_release_validation_pack079(uuid,uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.record_zuvyr_code_release_artifact_pack079(
  uuid,uuid,uuid,uuid,text,text,text,integer,integer,bigint,jsonb,boolean
) from public,anon,authenticated;
revoke all on function public.reserve_zuvyr_code_deploy_request_pack079(
  uuid,uuid,uuid,uuid,uuid,text,text,uuid,jsonb
) from public,anon,authenticated;
revoke all on function public.transition_zuvyr_code_deploy_request_pack079(
  uuid,uuid,text,text,text,text,jsonb,text
) from public,anon,authenticated;
revoke all on function public.reserve_zuvyr_code_deployment_rollback_pack079(
  uuid,uuid,uuid,text,text,jsonb
) from public,anon,authenticated;
revoke all on function public.transition_zuvyr_code_deployment_rollback_pack079(
  uuid,uuid,text,jsonb,text
) from public,anon,authenticated;

grant execute on function public.reserve_zuvyr_code_release_validation_pack079(uuid,uuid,uuid)
  to service_role;
grant execute on function public.record_zuvyr_code_release_artifact_pack079(
  uuid,uuid,uuid,uuid,text,text,text,integer,integer,bigint,jsonb,boolean
) to service_role;
grant execute on function public.reserve_zuvyr_code_deploy_request_pack079(
  uuid,uuid,uuid,uuid,uuid,text,text,uuid,jsonb
) to service_role;
grant execute on function public.transition_zuvyr_code_deploy_request_pack079(
  uuid,uuid,text,text,text,text,jsonb,text
) to service_role;
grant execute on function public.reserve_zuvyr_code_deployment_rollback_pack079(
  uuid,uuid,uuid,text,text,jsonb
) to service_role;
grant execute on function public.transition_zuvyr_code_deployment_rollback_pack079(
  uuid,uuid,text,jsonb,text
) to service_role;

comment on table public.code_release_validations is
  'PACK079 immutable proof that an exact saved Code Project version matched a verified build/test/preview runtime state.';
comment on table public.code_release_artifacts is
  'PACK079 deterministic ZIP receipts. ZIP bytes are rebuilt from immutable version+asset lineage and must reopen/hash-verify before receipt.';
comment on table public.code_deployment_rollbacks is
  'PACK079 explicit allow-once rollback receipts linked to a production deployment receipt.';

-- PACK079 extends the canonical PACK047 Permission Center with deploy.rollback.
-- Semantics remain owner/resource/session scoped, explicit-confirmation,
-- allow-once only and max TTL 600 seconds.
alter table public.zuvyr_permission_grants
  drop constraint if exists zuvyr_permission_grants_action_class_check;

alter table public.zuvyr_permission_grants
  add constraint zuvyr_permission_grants_action_class_check
  check (action_class in (
    'project.read','project.write','dependency.install','runtime.execute',
    'preview.view','preview.open','network.egress','deploy.execute','deploy.rollback'
  ));

create or replace function public.create_zuvyr_permission_grant(
  p_owner_id uuid,
  p_action_class text,
  p_grant_mode text,
  p_scope_type text,
  p_resource_namespace text,
  p_resource_id text,
  p_session_id text,
  p_consequence_id text,
  p_confirmation_fingerprint text,
  p_expires_at timestamptz,
  p_explicit_consent boolean,
  p_constraints jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := lower(trim(coalesce(p_action_class,'')));
  v_mode text := lower(trim(coalesce(p_grant_mode,'')));
  v_scope text := lower(trim(coalesce(p_scope_type,'')));
  v_ns text := lower(trim(coalesce(p_resource_namespace,'')));
  v_resource text := trim(coalesce(p_resource_id,''));
  v_session text := nullif(trim(coalesce(p_session_id,'')),'');
  v_consequence text := trim(coalesce(p_consequence_id,''));
  v_fp text := lower(trim(coalesce(p_confirmation_fingerprint,'')));
  v_max_seconds integer;
  v_expected_consequence text;
  v_id uuid;
  v_host text;
begin
  if p_explicit_consent is distinct from true then
    return jsonb_build_object('success',false,'error','permission_explicit_consent_required');
  end if;
  if v_action not in ('project.read','project.write','dependency.install','runtime.execute','preview.view','preview.open','network.egress','deploy.execute','deploy.rollback') then
    return jsonb_build_object('success',false,'error','invalid_permission_action');
  end if;
  if v_mode not in ('allow_once','session','scoped') then
    return jsonb_build_object('success',false,'error','invalid_permission_grant_mode');
  end if;
  if v_scope not in ('project','project_session') then
    return jsonb_build_object('success',false,'error','invalid_permission_scope');
  end if;
  if v_ns not in ('workspace_project','code_project') then
    return jsonb_build_object('success',false,'error','invalid_permission_resource_namespace');
  end if;
  if not public.zuvyr_permission_resource_owned(p_owner_id,v_ns,v_resource) then
    return jsonb_build_object('success',false,'error','permission_resource_not_owned');
  end if;

  if v_mode = 'allow_once' and v_scope <> 'project_session' then
    return jsonb_build_object('success',false,'error','permission_mode_scope_mismatch');
  end if;
  if v_mode = 'session' and v_scope <> 'project_session' then
    return jsonb_build_object('success',false,'error','permission_mode_scope_mismatch');
  end if;
  if v_mode = 'scoped' and v_scope <> 'project' then
    return jsonb_build_object('success',false,'error','permission_mode_scope_mismatch');
  end if;

  if v_scope = 'project' and v_session is not null then
    return jsonb_build_object('success',false,'error','permission_session_not_allowed');
  end if;
  if v_scope = 'project_session' and v_session is null then
    return jsonb_build_object('success',false,'error','permission_session_required');
  end if;

  if v_action in ('project.read','project.write') then
    if v_mode not in ('session','scoped') then
      return jsonb_build_object('success',false,'error','permission_mode_action_mismatch');
    end if;
  else
    if v_ns <> 'code_project' or v_scope <> 'project_session' or v_session is null then
      return jsonb_build_object('success',false,'error','permission_scope_action_mismatch');
    end if;
    if v_action in ('deploy.execute','deploy.rollback') and v_mode <> 'allow_once' then
      return jsonb_build_object('success',false,'error','permission_deploy_allow_once_required');
    end if;
    if v_action in ('dependency.install','runtime.execute','preview.view','preview.open','network.egress') and v_mode not in ('allow_once','session') then
      return jsonb_build_object('success',false,'error','permission_mode_action_mismatch');
    end if;
  end if;

  v_max_seconds := case v_action
    when 'project.read' then 86400
    when 'project.write' then 14400
    when 'dependency.install' then 1800
    when 'runtime.execute' then 3600
    when 'preview.view' then 14400
    when 'preview.open' then 3600
    when 'network.egress' then 900
    when 'deploy.execute' then 600
    when 'deploy.rollback' then 600
  end;
  v_expected_consequence := 'permission.' || v_action || '.v1';
  if v_consequence <> v_expected_consequence then
    return jsonb_build_object('success',false,'error','permission_consequence_mismatch');
  end if;
  if v_fp !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('success',false,'error','invalid_permission_confirmation_fingerprint');
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + make_interval(secs => v_max_seconds) then
    return jsonb_build_object('success',false,'error','permission_expiry_invalid');
  end if;
  if coalesce(jsonb_typeof(p_constraints),'') <> 'object' then
    return jsonb_build_object('success',false,'error','invalid_permission_constraints');
  end if;

  if v_action = 'network.egress' then
    if jsonb_typeof(p_constraints->'allowedHosts') <> 'array'
       or jsonb_array_length(p_constraints->'allowedHosts') < 1
       or jsonb_array_length(p_constraints->'allowedHosts') > 32 then
      return jsonb_build_object('success',false,'error','permission_network_hosts_required');
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_constraints->'allowedHosts') e(value)
      where jsonb_typeof(e.value) <> 'string'
    ) then
      return jsonb_build_object('success',false,'error','invalid_permission_network_host');
    end if;
    for v_host in
      select lower(trim(value)) from jsonb_array_elements_text(p_constraints->'allowedHosts') h(value)
    loop
      if v_host = '' or v_host = '*' or length(v_host) > 253
         or position('.' in v_host) = 0
         or v_host !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$' then
        return jsonb_build_object('success',false,'error','invalid_permission_network_host');
      end if;
      if v_host in ('localhost','0.0.0.0','127.0.0.1','host.docker.internal','metadata.google.internal')
         or v_host like '%.local'
         or v_host like '%.internal'
         or v_host ~ '^10\.'
         or v_host ~ '^192\.168\.'
         or v_host ~ '^172\.(1[6-9]|2[0-9]|3[01])\.'
         or v_host ~ '^169\.254\.' then
        return jsonb_build_object('success',false,'error','blocked_permission_network_host');
      end if;
    end loop;
  end if;

  insert into public.zuvyr_permission_grants(
    owner_id, action_class, grant_mode, scope_type, resource_namespace, resource_id,
    session_id, consequence_id, confirmation_fingerprint, constraints, expires_at
  ) values (
    p_owner_id, v_action, v_mode, v_scope, v_ns, v_resource,
    v_session, v_consequence, v_fp, coalesce(p_constraints,'{}'::jsonb), p_expires_at
  ) returning id into v_id;

  insert into public.zuvyr_permission_audit_events(
    owner_id, grant_id, action_class, event_type, reason,
    resource_namespace, resource_id, session_id,
    metadata
  ) values (
    p_owner_id, v_id, v_action, 'grant_created', 'explicit_confirmation',
    v_ns, v_resource, v_session,
    jsonb_build_object('grantMode',v_mode,'scopeType',v_scope,'consequenceId',v_consequence)
  );

  return jsonb_build_object('success',true,'grant_id',v_id,'expires_at',p_expires_at,'action_class',v_action);
end;
$$;

revoke all on function public.create_zuvyr_permission_grant(
  uuid,text,text,text,text,text,text,text,text,timestamptz,boolean,jsonb
) from public, anon, authenticated;

grant execute on function public.create_zuvyr_permission_grant(
  uuid,text,text,text,text,text,text,text,text,timestamptz,boolean,jsonb
) to service_role;

