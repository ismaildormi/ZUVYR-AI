-- ZUVYR V1 PACK095 — ZUVYR Model Lab + Compute Connector
-- Admin-only control plane. No live training/inference provider execution is enabled here.
-- PACK094 remains the rights/consent/privacy admission authority.
-- Compute credentials are stored in Supabase Vault; public tables store UUID references only.

create table if not exists public.zuvyr_model_lab_datasets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  purpose text,
  status text not null default 'active'
    check (status in ('active','archived')),
  current_version_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zuvyr_model_lab_dataset_versions (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.zuvyr_model_lab_datasets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  version_number bigint not null check (version_number >= 1),
  status text not null default 'draft'
    check (status in ('draft','frozen','invalidated')),
  dataset_sha256 text
    check (dataset_sha256 is null or dataset_sha256 ~ '^[0-9a-f]{64}$'),
  item_count integer not null default 0 check (item_count >= 0),
  license_count integer not null default 0 check (license_count >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  frozen_at timestamptz,
  unique(dataset_id, version_number)
);

do $pack095_dataset_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.zuvyr_model_lab_datasets'::regclass
      and conname='zuvyr_model_lab_datasets_current_version_fk'
  ) then
    alter table public.zuvyr_model_lab_datasets
      add constraint zuvyr_model_lab_datasets_current_version_fk
      foreign key (current_version_id)
      references public.zuvyr_model_lab_dataset_versions(id)
      on delete set null;
  end if;
end
$pack095_dataset_fk$;

create table if not exists public.zuvyr_model_lab_dataset_items (
  id uuid primary key default gen_random_uuid(),
  dataset_version_id uuid not null references public.zuvyr_model_lab_dataset_versions(id) on delete cascade,
  dataset_owner_id uuid not null references public.profiles(id) on delete cascade,
  candidate_id uuid not null references public.zuvyr_training_candidates(id) on delete restrict,
  source_owner_id uuid not null references public.profiles(id) on delete restrict,
  content_id uuid not null,
  content_version_id uuid not null,
  rights_id uuid not null references public.zuvyr_training_rights(id) on delete restrict,
  consent_version bigint not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  dedupe_sha256 text not null check (dedupe_sha256 ~ '^[0-9a-f]{64}$'),
  domain text,
  difficulty smallint,
  quality_score integer,
  learning_value_score integer not null default 0,
  created_at timestamptz not null default now(),
  unique(dataset_version_id, candidate_id)
);

create table if not exists public.zuvyr_model_lab_dataset_licenses (
  id uuid primary key default gen_random_uuid(),
  dataset_version_id uuid not null references public.zuvyr_model_lab_dataset_versions(id) on delete cascade,
  dataset_owner_id uuid not null references public.profiles(id) on delete cascade,
  rights_id uuid not null references public.zuvyr_training_rights(id) on delete restrict,
  source_owner_id uuid not null references public.profiles(id) on delete restrict,
  rights_basis text not null,
  license_reference text,
  evidence_reference text,
  rights_snapshot_sha256 text not null check (rights_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique(dataset_version_id, rights_id)
);

create table if not exists public.zuvyr_model_lab_skills (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  capability text,
  status text not null default 'active'
    check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, name)
);

create table if not exists public.zuvyr_model_lab_curricula (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  status text not null default 'active'
    check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, name)
);

create table if not exists public.zuvyr_model_lab_curriculum_skills (
  curriculum_id uuid not null references public.zuvyr_model_lab_curricula(id) on delete cascade,
  skill_id uuid not null references public.zuvyr_model_lab_skills(id) on delete restrict,
  dataset_version_id uuid not null references public.zuvyr_model_lab_dataset_versions(id) on delete restrict,
  weight_bps integer not null default 10000 check (weight_bps between 1 and 10000),
  sequence_no integer not null default 1 check (sequence_no >= 1),
  created_at timestamptz not null default now(),
  primary key(curriculum_id, skill_id, dataset_version_id)
);

create table if not exists public.zuvyr_compute_connectors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  ownership_kind text not null
    check (ownership_kind in ('user','organization')),
  ownership_subject text not null check (char_length(ownership_subject) between 1 and 240),
  ownership_evidence_reference text,
  ownership_challenge_hash text
    check (ownership_challenge_hash is null or ownership_challenge_hash ~ '^[0-9a-f]{64}$'),
  ownership_challenge_expires_at timestamptz,
  ownership_verified_at timestamptz,
  connector_kind text not null
    check (connector_kind in ('openai_compatible_https','custom_https','zuvyr_compute_relay')),
  endpoint_url text,
  health_path text not null default '/health'
    check (char_length(health_path) between 1 and 240),
  credential_secret_id uuid,
  credential_updated_at timestamptz,
  capability_claims jsonb not null default '{}'::jsonb
    check (jsonb_typeof(capability_claims)='object'),
  attested_capabilities jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attested_capabilities)='object'),
  customer_compute_cost_model jsonb not null default '{}'::jsonb
    check (jsonb_typeof(customer_compute_cost_model)='object'),
  zuvyr_control_plane_cost_model jsonb not null default '{}'::jsonb
    check (jsonb_typeof(zuvyr_control_plane_cost_model)='object'),
  cost_known boolean not null default false,
  health_status text not null default 'unknown'
    check (health_status in ('unknown','healthy','unhealthy','unreachable','blocked')),
  qualification_status text not null default 'registered'
    check (qualification_status in ('registered','ownership_verified','qualified','disabled','failed')),
  last_health_at timestamptz,
  last_health_latency_ms integer check (last_health_latency_ms is null or last_health_latency_ms >= 0),
  last_error_code text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zuvyr_compute_connector_attestations (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references public.zuvyr_compute_connectors(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  health_status text not null
    check (health_status in ('healthy','unhealthy','unreachable','blocked')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  http_status integer check (http_status is null or http_status between 100 and 599),
  capabilities jsonb not null default '{}'::jsonb
    check (jsonb_typeof(capabilities)='object'),
  measurement jsonb not null default '{}'::jsonb
    check (jsonb_typeof(measurement)='object'),
  customer_compute_cost_microusd numeric,
  zuvyr_control_plane_cost_microusd numeric not null default 0,
  cost_known boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.zuvyr_model_lab_training_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  dataset_version_id uuid not null references public.zuvyr_model_lab_dataset_versions(id) on delete restrict,
  curriculum_id uuid references public.zuvyr_model_lab_curricula(id) on delete set null,
  compute_connector_id uuid not null references public.zuvyr_compute_connectors(id) on delete restrict,
  base_model_ref text not null check (char_length(base_model_ref) between 1 and 400),
  base_model_license_reference text not null check (char_length(base_model_license_reference) between 1 and 600),
  training_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(training_config)='object'),
  status text not null default 'planned'
    check (status in ('planned','queued','running','succeeded','failed','cancelled')),
  customer_compute_cost_microusd numeric,
  zuvyr_control_plane_cost_microusd numeric not null default 0,
  cost_known boolean not null default false,
  output_checkpoint_id uuid,
  failure_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.zuvyr_model_lab_benchmarks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  version text not null check (char_length(version) between 1 and 80),
  dataset_version_id uuid references public.zuvyr_model_lab_dataset_versions(id) on delete restrict,
  definition jsonb not null default '{}'::jsonb
    check (jsonb_typeof(definition)='object'),
  status text not null default 'active'
    check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  unique(owner_id, name, version)
);

create table if not exists public.zuvyr_model_lab_checkpoints (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  training_run_id uuid not null references public.zuvyr_model_lab_training_runs(id) on delete restrict,
  parent_checkpoint_id uuid references public.zuvyr_model_lab_checkpoints(id) on delete set null,
  name text not null check (char_length(name) between 1 and 180),
  base_model_ref text not null check (char_length(base_model_ref) between 1 and 400),
  artifact_reference text not null check (char_length(artifact_reference) between 1 and 1200),
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  license_reference text not null check (char_length(license_reference) between 1 and 600),
  status text not null default 'candidate'
    check (status in ('candidate','qualified','rejected','rolled_back')),
  current_stage text not null default 'LAB'
    check (current_stage in ('LAB','EVAL','SHADOW','CANARY','SECONDARY','PRIMARY')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $pack095_checkpoint_fk$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.zuvyr_model_lab_training_runs'::regclass
      and conname='zuvyr_model_lab_training_runs_output_checkpoint_fk'
  ) then
    alter table public.zuvyr_model_lab_training_runs
      add constraint zuvyr_model_lab_training_runs_output_checkpoint_fk
      foreign key (output_checkpoint_id)
      references public.zuvyr_model_lab_checkpoints(id)
      on delete set null;
  end if;
end
$pack095_checkpoint_fk$;

create table if not exists public.zuvyr_model_lab_evaluations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  checkpoint_id uuid not null references public.zuvyr_model_lab_checkpoints(id) on delete cascade,
  baseline_checkpoint_id uuid references public.zuvyr_model_lab_checkpoints(id) on delete set null,
  benchmark_id uuid not null references public.zuvyr_model_lab_benchmarks(id) on delete restrict,
  independent boolean not null default true,
  metrics jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metrics)='object'),
  task_success_bps integer check (task_success_bps is null or task_success_bps between 0 and 10000),
  total_cost_per_successful_task_microusd numeric,
  regression_status text not null default 'unknown'
    check (regression_status in ('unknown','pass','fail')),
  status text not null default 'planned'
    check (status in ('planned','running','passed','failed','cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.zuvyr_model_lab_stage_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  checkpoint_id uuid not null references public.zuvyr_model_lab_checkpoints(id) on delete cascade,
  from_stage text,
  to_stage text not null
    check (to_stage in ('LAB','EVAL','SHADOW','CANARY','SECONDARY','PRIMARY')),
  event_status text not null
    check (event_status in ('entered','planned','failed','rolled_back')),
  evaluation_id uuid references public.zuvyr_model_lab_evaluations(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence)='object'),
  created_at timestamptz not null default now()
);

create table if not exists public.zuvyr_model_lab_synthetic_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  target_dataset_id uuid not null references public.zuvyr_model_lab_datasets(id) on delete cascade,
  skill_id uuid references public.zuvyr_model_lab_skills(id) on delete set null,
  teacher_source text,
  generation_policy jsonb not null default '{}'::jsonb
    check (jsonb_typeof(generation_policy)='object'),
  rights_basis text not null default 'owner_created',
  status text not null default 'planned'
    check (status in ('planned','blocked','running','completed','failed','cancelled')),
  output_item_count integer not null default 0 check (output_item_count >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists zuvyr_model_lab_dataset_versions_owner_idx
  on public.zuvyr_model_lab_dataset_versions(owner_id, created_at desc);
create index if not exists zuvyr_model_lab_dataset_items_candidate_idx
  on public.zuvyr_model_lab_dataset_items(candidate_id);
create index if not exists zuvyr_compute_connectors_owner_status_idx
  on public.zuvyr_compute_connectors(owner_id, qualification_status, updated_at desc);
create index if not exists zuvyr_compute_connector_attestations_connector_idx
  on public.zuvyr_compute_connector_attestations(connector_id, created_at desc);
create index if not exists zuvyr_model_lab_training_runs_owner_idx
  on public.zuvyr_model_lab_training_runs(owner_id, status, created_at desc);
create index if not exists zuvyr_model_lab_checkpoints_owner_stage_idx
  on public.zuvyr_model_lab_checkpoints(owner_id, current_stage, created_at desc);
create index if not exists zuvyr_model_lab_evaluations_checkpoint_idx
  on public.zuvyr_model_lab_evaluations(checkpoint_id, created_at desc);

alter table public.zuvyr_model_lab_datasets enable row level security;
alter table public.zuvyr_model_lab_dataset_versions enable row level security;
alter table public.zuvyr_model_lab_dataset_items enable row level security;
alter table public.zuvyr_model_lab_dataset_licenses enable row level security;
alter table public.zuvyr_model_lab_skills enable row level security;
alter table public.zuvyr_model_lab_curricula enable row level security;
alter table public.zuvyr_model_lab_curriculum_skills enable row level security;
alter table public.zuvyr_compute_connectors enable row level security;
alter table public.zuvyr_compute_connector_attestations enable row level security;
alter table public.zuvyr_model_lab_training_runs enable row level security;
alter table public.zuvyr_model_lab_benchmarks enable row level security;
alter table public.zuvyr_model_lab_checkpoints enable row level security;
alter table public.zuvyr_model_lab_evaluations enable row level security;
alter table public.zuvyr_model_lab_stage_events enable row level security;
alter table public.zuvyr_model_lab_synthetic_jobs enable row level security;

revoke all on public.zuvyr_model_lab_datasets from public,anon,authenticated;
revoke all on public.zuvyr_model_lab_dataset_versions from public,anon,authenticated;
revoke all on public.zuvyr_model_lab_dataset_items from public,anon,authenticated;
revoke all on public.zuvyr_model_lab_dataset_licenses from public,anon,authenticated;
revoke all on public.zuvyr_model_lab_skills from public,anon,authenticated;
revoke all on public.zuvyr_model_lab_curricula from public,anon,authenticated;
revoke all on public.zuvyr_model_lab_curriculum_skills from public,anon,authenticated;
revoke all on public.zuvyr_compute_connectors from public,anon,authenticated;
revoke all on public.zuvyr_compute_connector_attestations from public,anon,authenticated;
revoke all on public.zuvyr_model_lab_training_runs from public,anon,authenticated;
revoke all on public.zuvyr_model_lab_benchmarks from public,anon,authenticated;
revoke all on public.zuvyr_model_lab_checkpoints from public,anon,authenticated;
revoke all on public.zuvyr_model_lab_evaluations from public,anon,authenticated;
revoke all on public.zuvyr_model_lab_stage_events from public,anon,authenticated;
revoke all on public.zuvyr_model_lab_synthetic_jobs from public,anon,authenticated;

grant select,insert,update,delete on public.zuvyr_model_lab_datasets to service_role;
grant select,insert,update,delete on public.zuvyr_model_lab_dataset_versions to service_role;
grant select,insert,update,delete on public.zuvyr_model_lab_dataset_items to service_role;
grant select,insert,update,delete on public.zuvyr_model_lab_dataset_licenses to service_role;
grant select,insert,update,delete on public.zuvyr_model_lab_skills to service_role;
grant select,insert,update,delete on public.zuvyr_model_lab_curricula to service_role;
grant select,insert,update,delete on public.zuvyr_model_lab_curriculum_skills to service_role;
grant select,insert,update,delete on public.zuvyr_compute_connectors to service_role;
grant select,insert,update,delete on public.zuvyr_compute_connector_attestations to service_role;
grant select,insert,update,delete on public.zuvyr_model_lab_training_runs to service_role;
grant select,insert,update,delete on public.zuvyr_model_lab_benchmarks to service_role;
grant select,insert,update,delete on public.zuvyr_model_lab_checkpoints to service_role;
grant select,insert,update,delete on public.zuvyr_model_lab_evaluations to service_role;
grant select,insert,update,delete on public.zuvyr_model_lab_stage_events to service_role;
grant select,insert,update,delete on public.zuvyr_model_lab_synthetic_jobs to service_role;

create or replace function public.pack095_require_admin(
  p_admin_id uuid
) returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $pack095_require_admin$
begin
  if not exists (
    select 1
    from public.profiles
    where id=p_admin_id and is_admin=true
  ) then
    raise exception 'pack095_admin_required';
  end if;
end;
$pack095_require_admin$;

create or replace function public.create_zuvyr_model_lab_dataset_pack095(
  p_admin_id uuid,
  p_name text,
  p_purpose text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack095_create_dataset$
declare
  v_dataset_id uuid;
  v_version_id uuid;
  v_name text := btrim(coalesce(p_name,''));
begin
  perform public.pack095_require_admin(p_admin_id);
  if char_length(v_name) not between 1 and 160 then
    raise exception 'pack095_dataset_name_invalid';
  end if;

  insert into public.zuvyr_model_lab_datasets(
    owner_id,name,purpose,created_by
  ) values (
    p_admin_id,v_name,nullif(btrim(coalesce(p_purpose,'')),''),p_admin_id
  ) returning id into v_dataset_id;

  insert into public.zuvyr_model_lab_dataset_versions(
    dataset_id,owner_id,version_number,status,created_by
  ) values (
    v_dataset_id,p_admin_id,1,'draft',p_admin_id
  ) returning id into v_version_id;

  update public.zuvyr_model_lab_datasets
  set current_version_id=v_version_id,updated_at=now()
  where id=v_dataset_id;

  return jsonb_build_object(
    'dataset_id',v_dataset_id,
    'version_id',v_version_id,
    'version_number',1,
    'status','draft'
  );
end;
$pack095_create_dataset$;

create or replace function public.add_zuvyr_model_lab_candidate_pack095(
  p_admin_id uuid,
  p_dataset_version_id uuid,
  p_candidate_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack095_add_candidate$
declare
  v_version public.zuvyr_model_lab_dataset_versions%rowtype;
  v_candidate public.zuvyr_training_candidates%rowtype;
  v_rights public.zuvyr_training_rights%rowtype;
  v_payload public.zuvyr_training_candidate_payloads%rowtype;
  v_training_consent boolean;
  v_license_hash text;
begin
  perform public.pack095_require_admin(p_admin_id);

  select * into v_version
  from public.zuvyr_model_lab_dataset_versions
  where id=p_dataset_version_id
    and owner_id=p_admin_id
  for update;

  if v_version.id is null then
    raise exception 'pack095_dataset_version_not_found';
  end if;
  if v_version.status <> 'draft' then
    raise exception 'pack095_dataset_version_not_draft';
  end if;

  select * into v_candidate
  from public.zuvyr_training_candidates
  where id=p_candidate_id;

  if v_candidate.id is null then
    raise exception 'pack095_candidate_not_found';
  end if;
  if v_candidate.status <> 'candidate' or v_candidate.excluded_at is not null then
    raise exception 'pack095_candidate_not_eligible';
  end if;

  select training_consent into v_training_consent
  from public.zuvyr_user_preferences
  where owner_id=v_candidate.owner_id;

  if coalesce(v_training_consent,false) is not true then
    raise exception 'pack095_candidate_consent_inactive';
  end if;

  select * into v_rights
  from public.zuvyr_training_rights
  where id=v_candidate.rights_id
    and owner_id=v_candidate.owner_id;

  if v_rights.id is null
     or v_rights.allow_global_training is not true
     or v_rights.revoked_at is not null
     or v_rights.privacy_status <> 'processed'
     or v_rights.provenance_status <> 'verified' then
    raise exception 'pack095_candidate_rights_inactive';
  end if;

  select * into v_payload
  from public.zuvyr_training_candidate_payloads
  where candidate_id=v_candidate.id
    and owner_id=v_candidate.owner_id;

  if v_payload.candidate_id is null then
    raise exception 'pack095_candidate_payload_missing';
  end if;

  insert into public.zuvyr_model_lab_dataset_items(
    dataset_version_id,
    dataset_owner_id,
    candidate_id,
    source_owner_id,
    content_id,
    content_version_id,
    rights_id,
    consent_version,
    payload_sha256,
    dedupe_sha256,
    domain,
    difficulty,
    quality_score,
    learning_value_score
  ) values (
    v_version.id,
    p_admin_id,
    v_candidate.id,
    v_candidate.owner_id,
    v_candidate.content_id,
    v_candidate.version_id,
    v_candidate.rights_id,
    v_candidate.consent_version,
    v_payload.redacted_sha256,
    v_candidate.dedupe_sha256,
    v_candidate.domain,
    v_candidate.difficulty,
    v_candidate.quality_score,
    v_candidate.learning_value_score
  )
  on conflict(dataset_version_id,candidate_id) do nothing;

  v_license_hash := encode(
    digest(
      concat_ws(
        '|',
        v_rights.id::text,
        v_rights.rights_basis,
        coalesce(v_rights.license_reference,''),
        coalesce(v_rights.evidence_reference,''),
        v_rights.allow_global_training::text,
        v_rights.privacy_status,
        v_rights.provenance_status
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.zuvyr_model_lab_dataset_licenses(
    dataset_version_id,
    dataset_owner_id,
    rights_id,
    source_owner_id,
    rights_basis,
    license_reference,
    evidence_reference,
    rights_snapshot_sha256
  ) values (
    v_version.id,
    p_admin_id,
    v_rights.id,
    v_rights.owner_id,
    v_rights.rights_basis,
    v_rights.license_reference,
    v_rights.evidence_reference,
    v_license_hash
  )
  on conflict(dataset_version_id,rights_id) do nothing;

  update public.zuvyr_model_lab_dataset_versions
  set
    item_count=(select count(*) from public.zuvyr_model_lab_dataset_items where dataset_version_id=v_version.id),
    license_count=(select count(*) from public.zuvyr_model_lab_dataset_licenses where dataset_version_id=v_version.id)
  where id=v_version.id;

  return jsonb_build_object(
    'dataset_version_id',v_version.id,
    'candidate_id',v_candidate.id,
    'source_owner_id',v_candidate.owner_id,
    'payload_sha256',v_payload.redacted_sha256
  );
end;
$pack095_add_candidate$;

create or replace function public.freeze_zuvyr_model_lab_dataset_pack095(
  p_admin_id uuid,
  p_dataset_version_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack095_freeze_dataset$
declare
  v_version public.zuvyr_model_lab_dataset_versions%rowtype;
  v_dataset_hash text;
  v_item_count integer;
  v_license_count integer;
begin
  perform public.pack095_require_admin(p_admin_id);

  select * into v_version
  from public.zuvyr_model_lab_dataset_versions
  where id=p_dataset_version_id
    and owner_id=p_admin_id
  for update;

  if v_version.id is null then
    raise exception 'pack095_dataset_version_not_found';
  end if;
  if v_version.status <> 'draft' then
    raise exception 'pack095_dataset_version_not_draft';
  end if;

  select count(*)::int into v_item_count
  from public.zuvyr_model_lab_dataset_items
  where dataset_version_id=v_version.id;

  if v_item_count < 1 then
    raise exception 'pack095_dataset_empty';
  end if;

  if exists (
    select 1
    from public.zuvyr_model_lab_dataset_items i
    join public.zuvyr_training_candidates c on c.id=i.candidate_id
    join public.zuvyr_training_rights r on r.id=i.rights_id
    left join public.zuvyr_user_preferences p on p.owner_id=i.source_owner_id
    left join public.zuvyr_training_candidate_payloads pl on pl.candidate_id=i.candidate_id
    where i.dataset_version_id=v_version.id
      and (
        c.status <> 'candidate'
        or c.excluded_at is not null
        or c.owner_id <> i.source_owner_id
        or c.rights_id <> i.rights_id
        or c.consent_version <> i.consent_version
        or coalesce(p.training_consent,false) is not true
        or r.owner_id <> i.source_owner_id
        or r.allow_global_training is not true
        or r.revoked_at is not null
        or r.privacy_status <> 'processed'
        or r.provenance_status <> 'verified'
        or pl.redacted_sha256 is distinct from i.payload_sha256
      )
  ) then
    raise exception 'pack095_dataset_contains_ineligible_candidate';
  end if;

  select count(*)::int into v_license_count
  from public.zuvyr_model_lab_dataset_licenses
  where dataset_version_id=v_version.id;

  select encode(
    digest(
      string_agg(
        concat_ws(
          '|',
          candidate_id::text,
          source_owner_id::text,
          content_version_id::text,
          rights_id::text,
          consent_version::text,
          payload_sha256,
          dedupe_sha256
        ),
        E'\n'
        order by candidate_id
      ),
      'sha256'
    ),
    'hex'
  )
  into v_dataset_hash
  from public.zuvyr_model_lab_dataset_items
  where dataset_version_id=v_version.id;

  update public.zuvyr_model_lab_dataset_versions
  set
    status='frozen',
    dataset_sha256=v_dataset_hash,
    item_count=v_item_count,
    license_count=v_license_count,
    frozen_at=now()
  where id=v_version.id;

  update public.zuvyr_model_lab_datasets
  set current_version_id=v_version.id,updated_at=now()
  where id=v_version.dataset_id;

  return jsonb_build_object(
    'dataset_version_id',v_version.id,
    'dataset_sha256',v_dataset_hash,
    'item_count',v_item_count,
    'license_count',v_license_count,
    'status','frozen'
  );
end;
$pack095_freeze_dataset$;

create or replace function public.clone_zuvyr_model_lab_dataset_version_pack095(
  p_admin_id uuid,
  p_dataset_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack095_clone_dataset$
declare
  v_current public.zuvyr_model_lab_dataset_versions%rowtype;
  v_new_id uuid;
  v_next bigint;
begin
  perform public.pack095_require_admin(p_admin_id);

  select v.* into v_current
  from public.zuvyr_model_lab_datasets d
  join public.zuvyr_model_lab_dataset_versions v on v.id=d.current_version_id
  where d.id=p_dataset_id
    and d.owner_id=p_admin_id
    and d.status='active'
  for update of d;

  if v_current.id is null then
    raise exception 'pack095_dataset_not_found';
  end if;
  if v_current.status <> 'frozen' then
    raise exception 'pack095_current_dataset_version_not_frozen';
  end if;

  select coalesce(max(version_number),0)+1 into v_next
  from public.zuvyr_model_lab_dataset_versions
  where dataset_id=p_dataset_id;

  insert into public.zuvyr_model_lab_dataset_versions(
    dataset_id,owner_id,version_number,status,created_by
  ) values (
    p_dataset_id,p_admin_id,v_next,'draft',p_admin_id
  ) returning id into v_new_id;

  insert into public.zuvyr_model_lab_dataset_items(
    dataset_version_id,dataset_owner_id,candidate_id,source_owner_id,
    content_id,content_version_id,rights_id,consent_version,payload_sha256,
    dedupe_sha256,domain,difficulty,quality_score,learning_value_score
  )
  select
    v_new_id,p_admin_id,candidate_id,source_owner_id,
    content_id,content_version_id,rights_id,consent_version,payload_sha256,
    dedupe_sha256,domain,difficulty,quality_score,learning_value_score
  from public.zuvyr_model_lab_dataset_items
  where dataset_version_id=v_current.id;

  insert into public.zuvyr_model_lab_dataset_licenses(
    dataset_version_id,dataset_owner_id,rights_id,source_owner_id,
    rights_basis,license_reference,evidence_reference,rights_snapshot_sha256
  )
  select
    v_new_id,p_admin_id,rights_id,source_owner_id,
    rights_basis,license_reference,evidence_reference,rights_snapshot_sha256
  from public.zuvyr_model_lab_dataset_licenses
  where dataset_version_id=v_current.id;

  update public.zuvyr_model_lab_dataset_versions
  set
    item_count=(select count(*) from public.zuvyr_model_lab_dataset_items where dataset_version_id=v_new_id),
    license_count=(select count(*) from public.zuvyr_model_lab_dataset_licenses where dataset_version_id=v_new_id)
  where id=v_new_id;

  update public.zuvyr_model_lab_datasets
  set current_version_id=v_new_id,updated_at=now()
  where id=p_dataset_id;

  return jsonb_build_object(
    'dataset_id',p_dataset_id,
    'version_id',v_new_id,
    'version_number',v_next,
    'status','draft',
    'source_version_id',v_current.id
  );
end;
$pack095_clone_dataset$;

create or replace function public.set_zuvyr_compute_connector_secret_pack095(
  p_admin_id uuid,
  p_connector_id uuid,
  p_secret text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack095_set_connector_secret$
declare
  v_connector public.zuvyr_compute_connectors%rowtype;
  v_secret_id uuid;
  v_secret_name text;
begin
  perform public.pack095_require_admin(p_admin_id);

  if char_length(coalesce(p_secret,'')) not between 1 and 16000 then
    raise exception 'pack095_connector_secret_invalid';
  end if;

  select * into v_connector
  from public.zuvyr_compute_connectors
  where id=p_connector_id
    and owner_id=p_admin_id
  for update;

  if v_connector.id is null then
    raise exception 'pack095_compute_connector_not_found';
  end if;

  v_secret_name := 'zuvyr_compute_connector_' || replace(v_connector.id::text,'-','');

  if v_connector.credential_secret_id is null then
    select vault.create_secret(
      p_secret,
      v_secret_name,
      'ZUVYR PACK095 Compute Connector credential',
      null
    ) into v_secret_id;
  else
    v_secret_id := v_connector.credential_secret_id;
    perform vault.update_secret(
      v_secret_id,
      p_secret,
      v_secret_name,
      'ZUVYR PACK095 Compute Connector credential',
      null
    );
  end if;

  update public.zuvyr_compute_connectors
  set credential_secret_id=v_secret_id,
      credential_updated_at=now(),
      updated_at=now()
  where id=v_connector.id;

  return jsonb_build_object(
    'connector_id',v_connector.id,
    'credential_configured',true
  );
end;
$pack095_set_connector_secret$;

create or replace function public.get_zuvyr_compute_connector_secret_pack095(
  p_admin_id uuid,
  p_connector_id uuid
) returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $pack095_get_connector_secret$
declare
  v_secret_id uuid;
  v_secret text;
begin
  perform public.pack095_require_admin(p_admin_id);

  select credential_secret_id into v_secret_id
  from public.zuvyr_compute_connectors
  where id=p_connector_id
    and owner_id=p_admin_id;

  if v_secret_id is null then
    return null;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where id=v_secret_id;

  return v_secret;
end;
$pack095_get_connector_secret$;

create or replace function public.clear_zuvyr_compute_connector_secret_pack095(
  p_admin_id uuid,
  p_connector_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack095_clear_connector_secret$
declare
  v_secret_id uuid;
begin
  perform public.pack095_require_admin(p_admin_id);

  select credential_secret_id into v_secret_id
  from public.zuvyr_compute_connectors
  where id=p_connector_id
    and owner_id=p_admin_id
  for update;

  if not found then
    raise exception 'pack095_compute_connector_not_found';
  end if;

  if v_secret_id is not null then
    delete from vault.secrets where id=v_secret_id;
  end if;

  update public.zuvyr_compute_connectors
  set credential_secret_id=null,
      credential_updated_at=now(),
      qualification_status='registered',
      updated_at=now()
  where id=p_connector_id;

  return jsonb_build_object(
    'connector_id',p_connector_id,
    'credential_configured',false
  );
end;
$pack095_clear_connector_secret$;

create or replace function public.create_zuvyr_model_lab_training_run_pack095(
  p_admin_id uuid,
  p_dataset_version_id uuid,
  p_curriculum_id uuid,
  p_compute_connector_id uuid,
  p_base_model_ref text,
  p_base_model_license_reference text,
  p_training_config jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack095_create_training_run$
declare
  v_version public.zuvyr_model_lab_dataset_versions%rowtype;
  v_connector public.zuvyr_compute_connectors%rowtype;
  v_run_id uuid;
begin
  perform public.pack095_require_admin(p_admin_id);

  select * into v_version
  from public.zuvyr_model_lab_dataset_versions
  where id=p_dataset_version_id
    and owner_id=p_admin_id;

  if v_version.id is null or v_version.status <> 'frozen' then
    raise exception 'pack095_frozen_dataset_required';
  end if;

  if exists (
    select 1
    from public.zuvyr_model_lab_dataset_items i
    join public.zuvyr_training_candidates c on c.id=i.candidate_id
    join public.zuvyr_training_rights r on r.id=i.rights_id
    left join public.zuvyr_user_preferences p on p.owner_id=i.source_owner_id
    where i.dataset_version_id=v_version.id
      and (
        c.status <> 'candidate'
        or c.excluded_at is not null
        or coalesce(p.training_consent,false) is not true
        or r.allow_global_training is not true
        or r.revoked_at is not null
        or r.privacy_status <> 'processed'
        or r.provenance_status <> 'verified'
      )
  ) then
    raise exception 'pack095_dataset_eligibility_changed';
  end if;

  select * into v_connector
  from public.zuvyr_compute_connectors
  where id=p_compute_connector_id
    and owner_id=p_admin_id;

  if v_connector.id is null
     or v_connector.qualification_status <> 'qualified'
     or v_connector.health_status <> 'healthy'
     or v_connector.ownership_verified_at is null then
    raise exception 'pack095_qualified_compute_connector_required';
  end if;

  if p_curriculum_id is not null and not exists (
    select 1
    from public.zuvyr_model_lab_curricula
    where id=p_curriculum_id and owner_id=p_admin_id and status='active'
  ) then
    raise exception 'pack095_curriculum_not_found';
  end if;

  if char_length(btrim(coalesce(p_base_model_ref,''))) not between 1 and 400 then
    raise exception 'pack095_base_model_ref_invalid';
  end if;
  if char_length(btrim(coalesce(p_base_model_license_reference,''))) not between 1 and 600 then
    raise exception 'pack095_base_model_license_required';
  end if;
  if jsonb_typeof(coalesce(p_training_config,'{}'::jsonb)) <> 'object' then
    raise exception 'pack095_training_config_invalid';
  end if;

  insert into public.zuvyr_model_lab_training_runs(
    owner_id,dataset_version_id,curriculum_id,compute_connector_id,
    base_model_ref,base_model_license_reference,training_config,status
  ) values (
    p_admin_id,v_version.id,p_curriculum_id,v_connector.id,
    btrim(p_base_model_ref),btrim(p_base_model_license_reference),
    coalesce(p_training_config,'{}'::jsonb),'planned'
  ) returning id into v_run_id;

  return jsonb_build_object(
    'training_run_id',v_run_id,
    'status','planned',
    'live_execution_enabled',false
  );
end;
$pack095_create_training_run$;

create or replace function public.record_zuvyr_model_lab_checkpoint_pack095(
  p_admin_id uuid,
  p_training_run_id uuid,
  p_name text,
  p_artifact_reference text,
  p_artifact_sha256 text,
  p_license_reference text,
  p_customer_compute_cost_microusd numeric,
  p_zuvyr_control_plane_cost_microusd numeric,
  p_cost_known boolean
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack095_record_checkpoint$
declare
  v_run public.zuvyr_model_lab_training_runs%rowtype;
  v_checkpoint_id uuid;
begin
  perform public.pack095_require_admin(p_admin_id);

  select * into v_run
  from public.zuvyr_model_lab_training_runs
  where id=p_training_run_id
    and owner_id=p_admin_id
  for update;

  if v_run.id is null then
    raise exception 'pack095_training_run_not_found';
  end if;
  if v_run.status not in ('running','succeeded') then
    raise exception 'pack095_training_run_result_not_recordable';
  end if;
  if coalesce(p_artifact_sha256,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'pack095_checkpoint_sha256_invalid';
  end if;

  insert into public.zuvyr_model_lab_checkpoints(
    owner_id,training_run_id,name,base_model_ref,artifact_reference,
    artifact_sha256,license_reference,status,current_stage
  ) values (
    p_admin_id,v_run.id,btrim(p_name),v_run.base_model_ref,
    btrim(p_artifact_reference),p_artifact_sha256,btrim(p_license_reference),
    'candidate','LAB'
  ) returning id into v_checkpoint_id;

  update public.zuvyr_model_lab_training_runs
  set
    status='succeeded',
    customer_compute_cost_microusd=p_customer_compute_cost_microusd,
    zuvyr_control_plane_cost_microusd=coalesce(p_zuvyr_control_plane_cost_microusd,0),
    cost_known=coalesce(p_cost_known,false),
    output_checkpoint_id=v_checkpoint_id,
    completed_at=coalesce(completed_at,now())
  where id=v_run.id;

  insert into public.zuvyr_model_lab_stage_events(
    owner_id,checkpoint_id,from_stage,to_stage,event_status,evidence
  ) values (
    p_admin_id,v_checkpoint_id,null,'LAB','entered',
    jsonb_build_object(
      'training_run_id',v_run.id,
      'dataset_version_id',v_run.dataset_version_id,
      'compute_connector_id',v_run.compute_connector_id
    )
  );

  return jsonb_build_object(
    'checkpoint_id',v_checkpoint_id,
    'stage','LAB',
    'status','candidate'
  );
end;
$pack095_record_checkpoint$;

create or replace function public.promote_zuvyr_model_lab_checkpoint_pack095(
  p_admin_id uuid,
  p_checkpoint_id uuid,
  p_target_stage text,
  p_evaluation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack095_promote_checkpoint$
declare
  v_checkpoint public.zuvyr_model_lab_checkpoints%rowtype;
  v_target text := upper(btrim(coalesce(p_target_stage,'')));
  v_eval public.zuvyr_model_lab_evaluations%rowtype;
begin
  perform public.pack095_require_admin(p_admin_id);

  select * into v_checkpoint
  from public.zuvyr_model_lab_checkpoints
  where id=p_checkpoint_id
    and owner_id=p_admin_id
  for update;

  if v_checkpoint.id is null then
    raise exception 'pack095_checkpoint_not_found';
  end if;

  if v_target='EVAL' and v_checkpoint.current_stage='LAB' then
    update public.zuvyr_model_lab_checkpoints
    set current_stage='EVAL',updated_at=now()
    where id=v_checkpoint.id;

    insert into public.zuvyr_model_lab_stage_events(
      owner_id,checkpoint_id,from_stage,to_stage,event_status,evaluation_id,evidence
    ) values (
      p_admin_id,v_checkpoint.id,'LAB','EVAL','entered',null,'{}'::jsonb
    );

    return jsonb_build_object(
      'checkpoint_id',v_checkpoint.id,
      'stage','EVAL',
      'production_routing_enabled',false
    );
  end if;

  if v_target in ('SHADOW','CANARY','SECONDARY','PRIMARY') then
    if p_evaluation_id is null then
      raise exception 'pack095_independent_eval_required';
    end if;

    select * into v_eval
    from public.zuvyr_model_lab_evaluations
    where id=p_evaluation_id
      and owner_id=p_admin_id
      and checkpoint_id=v_checkpoint.id;

    if v_eval.id is null
       or v_eval.independent is not true
       or v_eval.status <> 'passed'
       or v_eval.regression_status <> 'pass' then
      raise exception 'pack095_independent_eval_not_passed';
    end if;

    insert into public.zuvyr_model_lab_stage_events(
      owner_id,checkpoint_id,from_stage,to_stage,event_status,evaluation_id,evidence
    ) values (
      p_admin_id,v_checkpoint.id,v_checkpoint.current_stage,v_target,'planned',v_eval.id,
      jsonb_build_object(
        'runtime_owner','PACK096',
        'note','PACK095 records rollout lineage; PACK096 owns live Router stage activation.'
      )
    );

    return jsonb_build_object(
      'checkpoint_id',v_checkpoint.id,
      'stage',v_checkpoint.current_stage,
      'planned_stage',v_target,
      'production_routing_enabled',false,
      'runtime_owner','PACK096'
    );
  end if;

  raise exception 'pack095_stage_transition_invalid';
end;
$pack095_promote_checkpoint$;

revoke all on function public.pack095_require_admin(uuid) from public,anon,authenticated;
revoke all on function public.create_zuvyr_model_lab_dataset_pack095(uuid,text,text) from public,anon,authenticated;
revoke all on function public.add_zuvyr_model_lab_candidate_pack095(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.freeze_zuvyr_model_lab_dataset_pack095(uuid,uuid) from public,anon,authenticated;
revoke all on function public.clone_zuvyr_model_lab_dataset_version_pack095(uuid,uuid) from public,anon,authenticated;
revoke all on function public.set_zuvyr_compute_connector_secret_pack095(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.get_zuvyr_compute_connector_secret_pack095(uuid,uuid) from public,anon,authenticated;
revoke all on function public.clear_zuvyr_compute_connector_secret_pack095(uuid,uuid) from public,anon,authenticated;
revoke all on function public.create_zuvyr_model_lab_training_run_pack095(uuid,uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.record_zuvyr_model_lab_checkpoint_pack095(uuid,uuid,text,text,text,text,numeric,numeric,boolean) from public,anon,authenticated;
revoke all on function public.promote_zuvyr_model_lab_checkpoint_pack095(uuid,uuid,text,uuid) from public,anon,authenticated;

grant execute on function public.pack095_require_admin(uuid) to service_role;
grant execute on function public.create_zuvyr_model_lab_dataset_pack095(uuid,text,text) to service_role;
grant execute on function public.add_zuvyr_model_lab_candidate_pack095(uuid,uuid,uuid) to service_role;
grant execute on function public.freeze_zuvyr_model_lab_dataset_pack095(uuid,uuid) to service_role;
grant execute on function public.clone_zuvyr_model_lab_dataset_version_pack095(uuid,uuid) to service_role;
grant execute on function public.set_zuvyr_compute_connector_secret_pack095(uuid,uuid,text) to service_role;
grant execute on function public.get_zuvyr_compute_connector_secret_pack095(uuid,uuid) to service_role;
grant execute on function public.clear_zuvyr_compute_connector_secret_pack095(uuid,uuid) to service_role;
grant execute on function public.create_zuvyr_model_lab_training_run_pack095(uuid,uuid,uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.record_zuvyr_model_lab_checkpoint_pack095(uuid,uuid,text,text,text,text,numeric,numeric,boolean) to service_role;
grant execute on function public.promote_zuvyr_model_lab_checkpoint_pack095(uuid,uuid,text,uuid) to service_role;

comment on table public.zuvyr_model_lab_dataset_items is
  'PACK095 immutable dataset candidate lineage. Rows reference PACK094 rights/consent/privacy-approved candidates; freeze and training-run creation revalidate current eligibility.';
comment on table public.zuvyr_compute_connectors is
  'PACK095 user/org compute registry. credential_secret_id references Supabase Vault; plaintext credentials never belong in this table or browser responses.';
comment on table public.zuvyr_model_lab_stage_events is
  'PACK095 rollout lineage. LAB/EVAL may be entered in Model Lab; SHADOW/CANARY/SECONDARY/PRIMARY are planned evidence only until PACK096 owns live Router activation.';
