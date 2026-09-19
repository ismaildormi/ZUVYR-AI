-- ZUVYR V1 PACK094 — Learning Pipeline + V1 User Learning Flywheel + Data Rights + Failure Bank
-- Canonical privacy rules:
--   1) Privacy-safe NON-CONTENT outcome telemetry may improve product/routing/evals.
--   2) Global-model training content is opt-in OFF by default.
--   3) public.zuvyr_user_preferences.training_consent is the single current-consent authority.
--   4) Memory permission and training permission remain independent.
--   5) Training candidates require ownership + rights + consent + provenance + privacy processing + dedupe.
--   6) Prompts, responses, intent, plan, final_result, task input/output and raw provider errors are never copied
--      into the non-content learning event store.

create table if not exists public.zuvyr_learning_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source_kind text not null
    check (source_kind in ('usage_record','task_run','task_step','chat_feedback','repair')),
  source_id text not null check (char_length(source_id) between 1 and 200),
  event_type text not null
    check (event_type in ('usage_outcome','task_outcome','tool_outcome','feedback','repair_outcome')),
  capability text check (capability is null or char_length(capability) between 1 and 120),
  provider text check (provider is null or char_length(provider) between 1 and 120),
  model_tool text check (model_tool is null or char_length(model_tool) between 1 and 200),
  outcome text not null
    check (outcome in ('success','failure','cancelled','refunded','positive','negative','repaired','rolled_back','unknown')),
  task_success boolean,
  tool_success boolean,
  latency_ms bigint check (latency_ms is null or latency_ms >= 0),
  retry_count integer not null default 0 check (retry_count between 0 and 10000),
  failure_category text
    check (failure_category is null or char_length(failure_category) between 1 and 120),
  provider_result text
    check (provider_result is null or char_length(provider_result) between 1 and 120),
  actual_cost_microusd numeric(24,6)
    check (actual_cost_microusd is null or actual_cost_microusd >= 0),
  cost_known boolean not null default false,
  cost_per_successful_task_microusd numeric(24,6)
    check (cost_per_successful_task_microusd is null or cost_per_successful_task_microusd >= 0),
  repair_outcome text
    check (repair_outcome is null or repair_outcome in ('repaired','rolled_back','unrepaired','not_applicable')),
  domain text check (domain is null or char_length(domain) between 1 and 120),
  difficulty smallint check (difficulty is null or difficulty between 1 and 5),
  learning_value_score integer not null default 0
    check (learning_value_score between 0 and 10000),
  contains_user_content boolean not null default false
    check (contains_user_content = false),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,source_kind,source_id,event_type)
);

create table if not exists public.zuvyr_failure_bank (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{32}$'),
  capability text,
  failure_category text not null check (char_length(failure_category) between 1 and 120),
  provider text,
  model_tool text,
  domain text,
  occurrences bigint not null default 1 check (occurrences >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  latest_event_id uuid references public.zuvyr_learning_events(id) on delete set null,
  latest_repair_outcome text
    check (latest_repair_outcome is null or latest_repair_outcome in ('repaired','rolled_back','unrepaired','not_applicable')),
  status text not null default 'open'
    check (status in ('open','resolved','suppressed')),
  updated_at timestamptz not null default now(),
  unique(owner_id,fingerprint)
);

create table if not exists public.zuvyr_training_consent_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  consent_version bigint not null check (consent_version >= 1),
  global_training_opt_in boolean not null,
  previous_opt_in boolean,
  policy_version text not null default 'pack094-v1'
    check (char_length(policy_version) between 1 and 80),
  source text not null default 'preference'
    check (source in ('preference','learning_api','migration_snapshot','enterprise_policy')),
  created_at timestamptz not null default now(),
  unique(owner_id,consent_version)
);

create table if not exists public.zuvyr_training_rights (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  content_id uuid not null references public.zuvyr_content_objects(id) on delete cascade,
  version_id uuid not null references public.zuvyr_content_versions(id) on delete cascade,
  rights_basis text not null
    check (rights_basis in ('owner_created','licensed_for_training','public_domain','documented_permission')),
  license_reference text
    check (license_reference is null or char_length(license_reference) between 3 and 500),
  evidence_reference text
    check (evidence_reference is null or char_length(evidence_reference) between 3 and 500),
  allow_global_training boolean not null default false,
  privacy_status text not null default 'pending'
    check (privacy_status in ('pending','processed','rejected')),
  provenance_status text not null default 'pending'
    check (provenance_status in ('pending','verified','rejected')),
  dedupe_sha256 text check (dedupe_sha256 is null or dedupe_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text
    check (revocation_reason is null or char_length(revocation_reason) between 1 and 500),
  unique(owner_id,version_id),
  check (
    rights_basis='owner_created'
    or char_length(btrim(coalesce(license_reference,evidence_reference,''))) >= 3
  )
);

create table if not exists public.zuvyr_training_candidates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  content_id uuid not null references public.zuvyr_content_objects(id) on delete cascade,
  version_id uuid not null references public.zuvyr_content_versions(id) on delete cascade,
  rights_id uuid not null references public.zuvyr_training_rights(id) on delete restrict,
  source_event_id uuid references public.zuvyr_learning_events(id) on delete set null,
  consent_event_id bigint not null references public.zuvyr_training_consent_events(id) on delete restrict,
  consent_version bigint not null check (consent_version >= 1),
  dedupe_sha256 text not null check (dedupe_sha256 ~ '^[0-9a-f]{64}$'),
  payload_kind text not null default 'redacted_text'
    check (payload_kind in ('redacted_text','reference_only')),
  domain text check (domain is null or char_length(domain) between 1 and 120),
  difficulty smallint check (difficulty is null or difficulty between 1 and 5),
  quality_score integer check (quality_score is null or quality_score between 0 and 10000),
  learning_value_score integer not null default 0
    check (learning_value_score between 0 and 10000),
  status text not null default 'candidate'
    check (status in ('candidate','excluded')),
  exclusion_reason text
    check (exclusion_reason is null or char_length(exclusion_reason) between 1 and 200),
  excluded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,version_id,dedupe_sha256)
);

create table if not exists public.zuvyr_training_candidate_payloads (
  candidate_id uuid primary key references public.zuvyr_training_candidates(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  redacted_text text not null check (char_length(redacted_text) between 1 and 200000),
  redacted_sha256 text not null check (redacted_sha256 ~ '^[0-9a-f]{64}$'),
  redaction_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(redaction_summary)='object'),
  created_at timestamptz not null default now()
);

create table if not exists public.zuvyr_training_exclusions (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  candidate_id uuid references public.zuvyr_training_candidates(id) on delete cascade,
  content_id uuid references public.zuvyr_content_objects(id) on delete cascade,
  version_id uuid references public.zuvyr_content_versions(id) on delete cascade,
  rights_id uuid references public.zuvyr_training_rights(id) on delete cascade,
  reason text not null
    check (reason in (
      'global_training_consent_revoked',
      'training_rights_disabled',
      'training_rights_revoked',
      'privacy_rejected',
      'provenance_rejected',
      'data_delete_requested',
      'user_excluded'
    )),
  source text not null
    check (source in ('consent','rights','privacy','data_rights','user')),
  created_at timestamptz not null default now(),
  check (
    candidate_id is not null
    or content_id is not null
    or version_id is not null
    or rights_id is not null
  )
);

create index if not exists zuvyr_learning_events_owner_created_idx
  on public.zuvyr_learning_events(owner_id,created_at desc);
create index if not exists zuvyr_learning_events_eval_idx
  on public.zuvyr_learning_events(event_type,outcome,capability,created_at desc);
create index if not exists zuvyr_failure_bank_owner_status_idx
  on public.zuvyr_failure_bank(owner_id,status,last_seen_at desc);
create index if not exists zuvyr_training_consent_owner_created_idx
  on public.zuvyr_training_consent_events(owner_id,created_at desc);
create index if not exists zuvyr_training_rights_owner_active_idx
  on public.zuvyr_training_rights(owner_id,allow_global_training,revoked_at);
create index if not exists zuvyr_training_candidates_owner_status_idx
  on public.zuvyr_training_candidates(owner_id,status,created_at desc);
create index if not exists zuvyr_training_candidates_dedupe_idx
  on public.zuvyr_training_candidates(dedupe_sha256);
create index if not exists zuvyr_training_exclusions_owner_created_idx
  on public.zuvyr_training_exclusions(owner_id,created_at desc);

alter table public.zuvyr_learning_events enable row level security;
alter table public.zuvyr_failure_bank enable row level security;
alter table public.zuvyr_training_consent_events enable row level security;
alter table public.zuvyr_training_rights enable row level security;
alter table public.zuvyr_training_candidates enable row level security;
alter table public.zuvyr_training_candidate_payloads enable row level security;
alter table public.zuvyr_training_exclusions enable row level security;

revoke all on public.zuvyr_learning_events from public,anon,authenticated;
revoke all on public.zuvyr_failure_bank from public,anon,authenticated;
revoke all on public.zuvyr_training_consent_events from public,anon,authenticated;
revoke all on public.zuvyr_training_rights from public,anon,authenticated;
revoke all on public.zuvyr_training_candidates from public,anon,authenticated;
revoke all on public.zuvyr_training_candidate_payloads from public,anon,authenticated;
revoke all on public.zuvyr_training_exclusions from public,anon,authenticated;

grant select,insert,update,delete on public.zuvyr_learning_events to service_role;
grant select,insert,update,delete on public.zuvyr_failure_bank to service_role;
grant select,insert,update,delete on public.zuvyr_training_consent_events to service_role;
grant select,insert,update,delete on public.zuvyr_training_rights to service_role;
grant select,insert,update,delete on public.zuvyr_training_candidates to service_role;
grant select,insert,update,delete on public.zuvyr_training_candidate_payloads to service_role;
grant select,insert,update,delete on public.zuvyr_training_exclusions to service_role;

create or replace function public.pack094_learning_value_score(
  p_event_type text,
  p_outcome text,
  p_retry_count integer,
  p_cost_known boolean,
  p_feedback_rating integer default null
) returns integer
language sql
immutable
set search_path=public,pg_temp
as $pack094_score$
  select least(
    10000,
    greatest(
      0,
      100
      + case when p_event_type='task_outcome' then 500 else 0 end
      + case when p_event_type='tool_outcome' then 300 else 0 end
      + case when p_event_type='feedback' then 800 else 0 end
      + case when p_outcome='failure' then 900 else 0 end
      + case when p_outcome='success' then 350 else 0 end
      + case when coalesce(p_retry_count,0)>0
          then least(1500,coalesce(p_retry_count,0)*150) else 0 end
      + case when p_cost_known then 150 else 0 end
      + case when p_feedback_rating=-1 then 700
             when p_feedback_rating=1 then 300
             else 0 end
    )
  )::integer;
$pack094_score$;

create or replace function public.pack094_safe_failure_category(
  p_value text,
  p_fallback text
) returns text
language sql
immutable
set search_path=public,pg_temp
as $pack094_failure_category$
  select case
    when lower(btrim(coalesce(p_value,''))) ~ '^[a-z0-9][a-z0-9_.:-]{0,119}$'
      then lower(btrim(p_value))
    else left(lower(regexp_replace(coalesce(p_fallback,'unknown_failure'),'[^a-z0-9_.:-]+','_','g')),120)
  end;
$pack094_failure_category$;

create or replace function public.pack094_insert_exclusion_for_candidate(
  p_owner_id uuid,
  p_candidate_id uuid,
  p_reason text,
  p_source text
) returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_candidate_exclusion$
declare
  v_candidate public.zuvyr_training_candidates%rowtype;
begin
  select * into v_candidate
  from public.zuvyr_training_candidates
  where id=p_candidate_id and owner_id=p_owner_id
  for update;

  if v_candidate.id is null then
    return;
  end if;

  update public.zuvyr_training_candidates
  set
    status='excluded',
    exclusion_reason=left(p_reason,200),
    excluded_at=coalesce(excluded_at,now()),
    updated_at=now()
  where id=v_candidate.id and status='candidate';

  if not exists (
    select 1
    from public.zuvyr_training_exclusions e
    where e.owner_id=p_owner_id
      and e.candidate_id=v_candidate.id
      and e.reason=p_reason
  ) then
    insert into public.zuvyr_training_exclusions(
      owner_id,candidate_id,content_id,version_id,rights_id,reason,source
    ) values (
      p_owner_id,v_candidate.id,v_candidate.content_id,v_candidate.version_id,
      v_candidate.rights_id,p_reason,p_source
    );
  end if;
end;
$pack094_candidate_exclusion$;

create or replace function public.capture_zuvyr_training_consent_history_pack094()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_consent_history$
declare
  v_previous boolean;
  v_version bigint;
  v_candidate record;
begin
  if tg_op='UPDATE' and new.training_consent is not distinct from old.training_consent then
    return new;
  end if;

  v_previous := case when tg_op='UPDATE' then old.training_consent else null end;

  select coalesce(max(consent_version),0)+1
    into v_version
  from public.zuvyr_training_consent_events
  where owner_id=new.owner_id;

  insert into public.zuvyr_training_consent_events(
    owner_id,consent_version,global_training_opt_in,previous_opt_in,
    policy_version,source,created_at
  ) values (
    new.owner_id,v_version,new.training_consent,v_previous,
    'pack094-v1',
    case when pg_trigger_depth()>1 then 'learning_api' else 'preference' end,
    now()
  );

  if not new.training_consent then
    for v_candidate in
      select id
      from public.zuvyr_training_candidates
      where owner_id=new.owner_id and status='candidate'
    loop
      perform public.pack094_insert_exclusion_for_candidate(
        new.owner_id,
        v_candidate.id,
        'global_training_consent_revoked',
        'consent'
      );
    end loop;
  end if;

  return new;
end;
$pack094_consent_history$;

drop trigger if exists trg_pack094_training_consent_history on public.zuvyr_user_preferences;
create trigger trg_pack094_training_consent_history
after insert or update of training_consent
on public.zuvyr_user_preferences
for each row execute function public.capture_zuvyr_training_consent_history_pack094();

insert into public.zuvyr_training_consent_events(
  owner_id,consent_version,global_training_opt_in,previous_opt_in,
  policy_version,source,created_at
)
select
  p.owner_id,1,p.training_consent,null,'pack094-v1','migration_snapshot',now()
from public.zuvyr_user_preferences p
where not exists (
  select 1
  from public.zuvyr_training_consent_events e
  where e.owner_id=p.owner_id
);

create or replace function public.set_zuvyr_learning_consent_pack094(
  p_owner_id uuid,
  p_global_training_opt_in boolean,
  p_policy_version text default 'pack094-v1',
  p_source text default 'user'
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_set_consent$
declare
  v_current boolean;
  v_event public.zuvyr_training_consent_events%rowtype;
begin
  if p_source not in ('user','enterprise_policy') then
    raise exception 'pack094_consent_source_invalid';
  end if;

  insert into public.zuvyr_user_preferences(
    owner_id,training_consent,updated_at
  ) values (
    p_owner_id,coalesce(p_global_training_opt_in,false),now()
  )
  on conflict(owner_id) do update set
    training_consent=excluded.training_consent,
    updated_at=now();

  select training_consent into v_current
  from public.zuvyr_user_preferences
  where owner_id=p_owner_id;

  select * into v_event
  from public.zuvyr_training_consent_events
  where owner_id=p_owner_id
  order by consent_version desc
  limit 1;

  return jsonb_build_object(
    'owner_id',p_owner_id,
    'global_training_opt_in',coalesce(v_current,false),
    'policy_version',coalesce(v_event.policy_version,p_policy_version,'pack094-v1'),
    'consent_version',coalesce(v_event.consent_version,1),
    'source',coalesce(v_event.source,'learning_api'),
    'updated_at',coalesce(v_event.created_at,now())
  );
end;
$pack094_set_consent$;

create or replace function public.upsert_zuvyr_training_rights_pack094(
  p_owner_id uuid,
  p_content_id uuid,
  p_version_id uuid,
  p_rights_basis text,
  p_license_reference text default null,
  p_evidence_reference text default null,
  p_allow_global_training boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_rights$
declare
  v_row public.zuvyr_training_rights%rowtype;
  v_candidate record;
begin
  if p_rights_basis not in ('owner_created','licensed_for_training','public_domain','documented_permission') then
    raise exception 'pack094_rights_basis_invalid';
  end if;

  if not exists (
    select 1 from public.zuvyr_content_objects o
    where o.id=p_content_id
      and o.owner_id=p_owner_id
      and o.status='active'
      and o.deleted_at is null
  ) then
    raise exception 'pack094_content_not_owned';
  end if;

  if not exists (
    select 1 from public.zuvyr_content_versions v
    where v.id=p_version_id
      and v.content_id=p_content_id
      and v.owner_id=p_owner_id
  ) then
    raise exception 'pack094_content_version_not_owned';
  end if;

  if p_rights_basis<>'owner_created'
     and char_length(btrim(coalesce(p_license_reference,p_evidence_reference,'')))<3 then
    raise exception 'pack094_rights_evidence_required';
  end if;

  insert into public.zuvyr_training_rights(
    owner_id,content_id,version_id,rights_basis,license_reference,evidence_reference,
    allow_global_training,privacy_status,provenance_status,dedupe_sha256,
    created_at,updated_at,revoked_at,revocation_reason
  ) values (
    p_owner_id,p_content_id,p_version_id,p_rights_basis,
    nullif(btrim(coalesce(p_license_reference,'')),''),
    nullif(btrim(coalesce(p_evidence_reference,'')),''),
    coalesce(p_allow_global_training,false),
    'pending','pending',null,now(),now(),null,null
  )
  on conflict(owner_id,version_id) do update set
    content_id=excluded.content_id,
    rights_basis=excluded.rights_basis,
    license_reference=excluded.license_reference,
    evidence_reference=excluded.evidence_reference,
    allow_global_training=excluded.allow_global_training,
    privacy_status='pending',
    provenance_status='pending',
    dedupe_sha256=null,
    updated_at=now(),
    revoked_at=null,
    revocation_reason=null
  returning * into v_row;

  if not v_row.allow_global_training then
    for v_candidate in
      select id from public.zuvyr_training_candidates
      where owner_id=p_owner_id and rights_id=v_row.id and status='candidate'
    loop
      perform public.pack094_insert_exclusion_for_candidate(
        p_owner_id,v_candidate.id,'training_rights_disabled','rights'
      );
    end loop;
  end if;

  return jsonb_build_object(
    'id',v_row.id,
    'content_id',v_row.content_id,
    'version_id',v_row.version_id,
    'rights_basis',v_row.rights_basis,
    'allow_global_training',v_row.allow_global_training,
    'privacy_status',v_row.privacy_status,
    'provenance_status',v_row.provenance_status,
    'revoked_at',v_row.revoked_at
  );
end;
$pack094_rights$;

create or replace function public.revoke_zuvyr_training_rights_pack094(
  p_owner_id uuid,
  p_rights_id uuid,
  p_reason text default 'user_revoked'
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_revoke$
declare
  v_row public.zuvyr_training_rights%rowtype;
  v_candidate record;
begin
  update public.zuvyr_training_rights
  set
    allow_global_training=false,
    revoked_at=coalesce(revoked_at,now()),
    revocation_reason=left(coalesce(nullif(btrim(p_reason),''),'user_revoked'),500),
    updated_at=now()
  where id=p_rights_id and owner_id=p_owner_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'pack094_rights_not_found';
  end if;

  for v_candidate in
    select id from public.zuvyr_training_candidates
    where owner_id=p_owner_id and rights_id=p_rights_id and status='candidate'
  loop
    perform public.pack094_insert_exclusion_for_candidate(
      p_owner_id,v_candidate.id,'training_rights_revoked','rights'
    );
  end loop;

  return jsonb_build_object(
    'id',v_row.id,
    'allow_global_training',false,
    'revoked_at',v_row.revoked_at
  );
end;
$pack094_revoke$;

create or replace function public.mark_zuvyr_training_rights_privacy_pack094(
  p_owner_id uuid,
  p_rights_id uuid,
  p_privacy_status text,
  p_provenance_status text,
  p_dedupe_sha256 text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_privacy$
declare
  v_row public.zuvyr_training_rights%rowtype;
  v_reason text;
  v_candidate record;
begin
  if p_privacy_status not in ('processed','rejected') then
    raise exception 'pack094_privacy_status_invalid';
  end if;
  if p_provenance_status not in ('verified','rejected') then
    raise exception 'pack094_provenance_status_invalid';
  end if;
  if p_privacy_status='processed'
     and coalesce(p_dedupe_sha256,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'pack094_dedupe_hash_invalid';
  end if;

  update public.zuvyr_training_rights
  set
    privacy_status=p_privacy_status,
    provenance_status=p_provenance_status,
    dedupe_sha256=case when p_privacy_status='processed' then p_dedupe_sha256 else null end,
    updated_at=now()
  where id=p_rights_id
    and owner_id=p_owner_id
    and revoked_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'pack094_rights_not_found';
  end if;

  if p_privacy_status='rejected' or p_provenance_status='rejected' then
    v_reason := case
      when p_privacy_status='rejected' then 'privacy_rejected'
      else 'provenance_rejected'
    end;

    for v_candidate in
      select id from public.zuvyr_training_candidates
      where owner_id=p_owner_id and rights_id=p_rights_id and status='candidate'
    loop
      perform public.pack094_insert_exclusion_for_candidate(
        p_owner_id,v_candidate.id,v_reason,
        case when v_reason='privacy_rejected' then 'privacy' else 'privacy' end
      );
    end loop;
  end if;

  return jsonb_build_object(
    'id',v_row.id,
    'privacy_status',v_row.privacy_status,
    'provenance_status',v_row.provenance_status,
    'dedupe_sha256',v_row.dedupe_sha256
  );
end;
$pack094_privacy$;

create or replace function public.admit_zuvyr_training_candidate_pack094(
  p_owner_id uuid,
  p_rights_id uuid,
  p_source_event_id uuid,
  p_domain text,
  p_difficulty integer,
  p_quality_score integer,
  p_learning_value_score integer,
  p_payload_kind text default 'redacted_text'
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_candidate$
declare
  v_rights public.zuvyr_training_rights%rowtype;
  v_opt_in boolean := false;
  v_consent public.zuvyr_training_consent_events%rowtype;
  v_row public.zuvyr_training_candidates%rowtype;
begin
  select training_consent into v_opt_in
  from public.zuvyr_user_preferences
  where owner_id=p_owner_id;

  if coalesce(v_opt_in,false)=false then
    raise exception 'pack094_global_training_opt_in_required';
  end if;

  select * into v_consent
  from public.zuvyr_training_consent_events
  where owner_id=p_owner_id
    and global_training_opt_in=true
  order by consent_version desc
  limit 1;

  if v_consent.id is null then
    raise exception 'pack094_training_consent_evidence_required';
  end if;

  select * into v_rights
  from public.zuvyr_training_rights
  where id=p_rights_id and owner_id=p_owner_id;

  if v_rights.id is null then
    raise exception 'pack094_rights_not_found';
  end if;
  if v_rights.revoked_at is not null or not v_rights.allow_global_training then
    raise exception 'pack094_training_rights_inactive';
  end if;
  if v_rights.privacy_status<>'processed' then
    raise exception 'pack094_privacy_processing_required';
  end if;
  if v_rights.provenance_status<>'verified' then
    raise exception 'pack094_provenance_verification_required';
  end if;
  if coalesce(v_rights.dedupe_sha256,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'pack094_dedupe_hash_required';
  end if;
  if p_payload_kind not in ('redacted_text','reference_only') then
    raise exception 'pack094_payload_kind_invalid';
  end if;
  if p_difficulty is not null and (p_difficulty<1 or p_difficulty>5) then
    raise exception 'pack094_candidate_difficulty_invalid';
  end if;
  if p_quality_score is not null and (p_quality_score<0 or p_quality_score>10000) then
    raise exception 'pack094_candidate_quality_invalid';
  end if;
  if p_learning_value_score<0 or p_learning_value_score>10000 then
    raise exception 'pack094_candidate_learning_value_invalid';
  end if;

  if p_source_event_id is not null and not exists (
    select 1 from public.zuvyr_learning_events e
    where e.id=p_source_event_id and e.owner_id=p_owner_id
  ) then
    raise exception 'pack094_learning_event_not_owned';
  end if;

  if exists (
    select 1
    from public.zuvyr_training_exclusions e
    where e.owner_id=p_owner_id
      and (
        e.content_id=v_rights.content_id
        or e.version_id=v_rights.version_id
        or e.rights_id=v_rights.id
      )
  ) then
    raise exception 'pack094_training_source_excluded';
  end if;

  insert into public.zuvyr_training_candidates(
    owner_id,content_id,version_id,rights_id,source_event_id,
    consent_event_id,consent_version,dedupe_sha256,payload_kind,
    domain,difficulty,quality_score,learning_value_score,status,
    created_at,updated_at
  ) values (
    p_owner_id,v_rights.content_id,v_rights.version_id,v_rights.id,p_source_event_id,
    v_consent.id,v_consent.consent_version,v_rights.dedupe_sha256,p_payload_kind,
    nullif(left(btrim(coalesce(p_domain,'')),120),''),
    p_difficulty,p_quality_score,p_learning_value_score,'candidate',
    now(),now()
  )
  on conflict(owner_id,version_id,dedupe_sha256) do nothing;

  select * into v_row
  from public.zuvyr_training_candidates
  where owner_id=p_owner_id
    and version_id=v_rights.version_id
    and dedupe_sha256=v_rights.dedupe_sha256
  limit 1;

  if v_row.id is null then
    raise exception 'pack094_candidate_admission_failed';
  end if;
  if v_row.status<>'candidate' then
    raise exception 'pack094_candidate_excluded';
  end if;

  return jsonb_build_object(
    'id',v_row.id,
    'content_id',v_row.content_id,
    'version_id',v_row.version_id,
    'rights_id',v_row.rights_id,
    'source_event_id',v_row.source_event_id,
    'consent_event_id',v_row.consent_event_id,
    'consent_version',v_row.consent_version,
    'dedupe_sha256',v_row.dedupe_sha256,
    'payload_kind',v_row.payload_kind,
    'status',v_row.status,
    'learning_value_score',v_row.learning_value_score
  );
end;
$pack094_candidate$;

create or replace function public.admit_zuvyr_redacted_text_candidate_pack094(
  p_owner_id uuid,
  p_rights_id uuid,
  p_source_event_id uuid,
  p_domain text,
  p_difficulty integer,
  p_quality_score integer,
  p_learning_value_score integer,
  p_redacted_text text,
  p_redacted_sha256 text,
  p_redaction_summary jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_text_candidate$
declare
  v_candidate jsonb;
  v_candidate_id uuid;
begin
  if char_length(coalesce(p_redacted_text,'')) not between 1 and 200000 then
    raise exception 'pack094_redacted_text_invalid';
  end if;
  if coalesce(p_redacted_sha256,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'pack094_redacted_hash_invalid';
  end if;
  if jsonb_typeof(coalesce(p_redaction_summary,'{}'::jsonb))<>'object' then
    raise exception 'pack094_redaction_summary_invalid';
  end if;

  v_candidate := public.admit_zuvyr_training_candidate_pack094(
    p_owner_id,p_rights_id,p_source_event_id,p_domain,
    p_difficulty,p_quality_score,p_learning_value_score,'redacted_text'
  );

  v_candidate_id := (v_candidate->>'id')::uuid;

  if (v_candidate->>'dedupe_sha256')<>p_redacted_sha256 then
    raise exception 'pack094_redacted_hash_mismatch';
  end if;

  insert into public.zuvyr_training_candidate_payloads(
    candidate_id,owner_id,redacted_text,redacted_sha256,redaction_summary,created_at
  ) values (
    v_candidate_id,p_owner_id,p_redacted_text,p_redacted_sha256,
    coalesce(p_redaction_summary,'{}'::jsonb),now()
  )
  on conflict(candidate_id) do update set
    redacted_text=excluded.redacted_text,
    redacted_sha256=excluded.redacted_sha256,
    redaction_summary=excluded.redaction_summary;

  return v_candidate || jsonb_build_object(
    'payload_kind','redacted_text',
    'payload_sha256',p_redacted_sha256
  );
end;
$pack094_text_candidate$;

create or replace function public.exclude_zuvyr_training_candidate_pack094(
  p_owner_id uuid,
  p_candidate_id uuid,
  p_reason text default 'user_excluded'
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_exclude_candidate$
declare
  v_candidate public.zuvyr_training_candidates%rowtype;
begin
  select * into v_candidate
  from public.zuvyr_training_candidates
  where id=p_candidate_id and owner_id=p_owner_id;

  if v_candidate.id is null then
    raise exception 'pack094_candidate_not_found';
  end if;

  perform public.pack094_insert_exclusion_for_candidate(
    p_owner_id,p_candidate_id,'user_excluded','user'
  );

  select * into v_candidate
  from public.zuvyr_training_candidates
  where id=p_candidate_id and owner_id=p_owner_id;

  return jsonb_build_object(
    'id',v_candidate.id,
    'status',v_candidate.status,
    'exclusion_reason',v_candidate.exclusion_reason,
    'excluded_at',v_candidate.excluded_at
  );
end;
$pack094_exclude_candidate$;

create or replace function public.capture_zuvyr_data_rights_training_exclusion_pack094()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_data_rights$
declare
  v_candidate record;
begin
  if new.request_type<>'delete' or not new.explicit_confirmation then
    return new;
  end if;

  for v_candidate in
    select id
    from public.zuvyr_training_candidates
    where owner_id=new.owner_id and status='candidate'
  loop
    perform public.pack094_insert_exclusion_for_candidate(
      new.owner_id,v_candidate.id,'data_delete_requested','data_rights'
    );
  end loop;

  return new;
end;
$pack094_data_rights$;

drop trigger if exists trg_pack094_data_rights_training_exclusion
  on public.zuvyr_data_rights_requests;
create trigger trg_pack094_data_rights_training_exclusion
after insert or update of request_type,explicit_confirmation,state,executed
on public.zuvyr_data_rights_requests
for each row execute function public.capture_zuvyr_data_rights_training_exclusion_pack094();

create or replace function public.record_zuvyr_repair_learning_pack094(
  p_owner_id uuid,
  p_source_id text,
  p_capability text,
  p_repair_outcome text,
  p_provider text default null,
  p_model_tool text default null,
  p_latency_ms bigint default null,
  p_actual_cost_microusd numeric default null,
  p_cost_known boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_repair$
declare
  v_event public.zuvyr_learning_events%rowtype;
  v_outcome text;
begin
  if char_length(btrim(coalesce(p_source_id,''))) not between 1 and 200 then
    raise exception 'pack094_repair_source_invalid';
  end if;
  if p_repair_outcome not in ('repaired','rolled_back','unrepaired') then
    raise exception 'pack094_repair_outcome_invalid';
  end if;
  if p_latency_ms is not null and p_latency_ms<0 then
    raise exception 'pack094_repair_latency_invalid';
  end if;
  if p_actual_cost_microusd is not null and p_actual_cost_microusd<0 then
    raise exception 'pack094_repair_cost_invalid';
  end if;

  v_outcome := case
    when p_repair_outcome='repaired' then 'repaired'
    when p_repair_outcome='rolled_back' then 'rolled_back'
    else 'failure'
  end;

  insert into public.zuvyr_learning_events(
    owner_id,source_kind,source_id,event_type,capability,provider,model_tool,
    outcome,latency_ms,retry_count,failure_category,actual_cost_microusd,
    cost_known,repair_outcome,learning_value_score,contains_user_content,
    metadata,created_at,updated_at
  ) values (
    p_owner_id,'repair',btrim(p_source_id),'repair_outcome',
    nullif(left(btrim(coalesce(p_capability,'')),120),''),
    nullif(left(btrim(coalesce(p_provider,'')),120),''),
    nullif(left(btrim(coalesce(p_model_tool,'')),200),''),
    v_outcome,p_latency_ms,0,
    case when p_repair_outcome='unrepaired' then 'repair_unrepaired' else null end,
    p_actual_cost_microusd,coalesce(p_cost_known,false),
    p_repair_outcome,
    public.pack094_learning_value_score('repair_outcome',v_outcome,0,coalesce(p_cost_known,false),null),
    false,'{}'::jsonb,now(),now()
  )
  on conflict(owner_id,source_kind,source_id,event_type) do update set
    capability=excluded.capability,
    provider=excluded.provider,
    model_tool=excluded.model_tool,
    outcome=excluded.outcome,
    latency_ms=excluded.latency_ms,
    failure_category=excluded.failure_category,
    actual_cost_microusd=excluded.actual_cost_microusd,
    cost_known=excluded.cost_known,
    repair_outcome=excluded.repair_outcome,
    learning_value_score=excluded.learning_value_score,
    updated_at=now()
  returning * into v_event;

  return jsonb_build_object(
    'id',v_event.id,
    'outcome',v_event.outcome,
    'repair_outcome',v_event.repair_outcome,
    'learning_value_score',v_event.learning_value_score
  );
end;
$pack094_repair$;

create or replace function public.capture_zuvyr_usage_learning_pack094()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_usage_trigger$
declare
  v_outcome text;
  v_actual numeric;
  v_score integer;
begin
  if new.state not in ('settled','refunded','failed') then
    return new;
  end if;

  v_outcome := case
    when new.state='settled' then 'success'
    when new.state='refunded' then 'refunded'
    else 'failure'
  end;

  v_actual := case
    when coalesce(new.cost_known,false) and new.actual_provider_cost_microusd is not null
      then new.actual_provider_cost_microusd
    else null
  end;

  v_score := public.pack094_learning_value_score(
    'usage_outcome',v_outcome,0,coalesce(new.cost_known,false),null
  );

  insert into public.zuvyr_learning_events(
    owner_id,source_kind,source_id,event_type,capability,provider,model_tool,
    outcome,retry_count,failure_category,provider_result,actual_cost_microusd,
    cost_known,learning_value_score,contains_user_content,metadata,created_at,updated_at
  ) values (
    new.user_id,'usage_record',new.id::text,'usage_outcome',
    nullif(left(btrim(coalesce(new.capability,'')),120),''),
    nullif(left(btrim(coalesce(new.provider,'')),120),''),
    nullif(left(btrim(coalesce(new.model_tool,'')),200),''),
    v_outcome,0,
    case when new.state='failed'
      then public.pack094_safe_failure_category(new.accounting_state,'usage_failed')
      else null end,
    nullif(left(btrim(coalesce(new.accounting_state,'')),120),''),
    v_actual,coalesce(new.cost_known,false),v_score,false,
    jsonb_build_object(
      'usage_kind',left(coalesce(new.usage_kind,''),80),
      'ledger_source',left(coalesce(new.ledger_source,''),80),
      'funding_source',left(coalesce(new.funding_source,''),80),
      'credits',coalesce(new.actual_credits,new.reserved_credits),
      'refunded_credits',new.refunded_credits
    ),
    coalesce(new.settled_at,new.updated_at,new.created_at,now()),now()
  )
  on conflict(owner_id,source_kind,source_id,event_type) do update set
    outcome=excluded.outcome,
    failure_category=excluded.failure_category,
    provider_result=excluded.provider_result,
    actual_cost_microusd=excluded.actual_cost_microusd,
    cost_known=excluded.cost_known,
    learning_value_score=excluded.learning_value_score,
    metadata=excluded.metadata,
    updated_at=now();

  return new;
end;
$pack094_usage_trigger$;

create or replace function public.capture_zuvyr_task_run_learning_pack094()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_task_trigger$
declare
  v_cost numeric;
  v_cost_known boolean := false;
  v_latency bigint;
  v_outcome text;
  v_retry_count integer := 0;
  v_step_count integer := 0;
  v_failed_steps integer := 0;
begin
  if new.state not in ('succeeded','failed','cancelled') then
    return new;
  end if;

  if new.usage_record_id is not null then
    select
      case when cost_known then actual_provider_cost_microusd else null end,
      cost_known
    into v_cost,v_cost_known
    from public.zuvyr_usage_records
    where id=new.usage_record_id;
  end if;

  select
    count(*)::integer,
    count(*) filter(where state='failed')::integer,
    coalesce(sum(greatest(coalesce(attempts,0)-1,0)+greatest(coalesce(resume_count,0),0)),0)::integer
  into v_step_count,v_failed_steps,v_retry_count
  from public.zuvyr_task_steps
  where task_run_id=new.id;

  v_retry_count := greatest(0,v_retry_count+coalesce(new.resume_count,0));
  v_latency := case
    when new.started_at is not null and new.completed_at is not null
      then greatest(0,floor(extract(epoch from(new.completed_at-new.started_at))*1000)::bigint)
    else null
  end;
  v_outcome := case
    when new.state='succeeded' then 'success'
    when new.state='cancelled' then 'cancelled'
    else 'failure'
  end;

  insert into public.zuvyr_learning_events(
    owner_id,source_kind,source_id,event_type,capability,outcome,task_success,
    latency_ms,retry_count,failure_category,actual_cost_microusd,cost_known,
    cost_per_successful_task_microusd,learning_value_score,contains_user_content,
    metadata,created_at,updated_at
  ) values (
    new.user_id,'task_run',new.id::text,'task_outcome','brain_task',
    v_outcome,(new.state='succeeded'),v_latency,v_retry_count,
    case when new.state='failed'
      then public.pack094_safe_failure_category(new.error_code,'task_failed')
      when new.state='cancelled' then 'task_cancelled'
      else null end,
    v_cost,coalesce(v_cost_known,false),
    case when new.state='succeeded' and coalesce(v_cost_known,false)
      then coalesce(v_cost,0) else null end,
    public.pack094_learning_value_score(
      'task_outcome',v_outcome,v_retry_count,coalesce(v_cost_known,false),null
    ),
    false,
    jsonb_build_object(
      'plan_version',left(coalesce(new.plan_version,''),120),
      'cancel_requested',new.cancel_requested,
      'compensation_version',new.compensation_version,
      'step_count',v_step_count,
      'failed_step_count',v_failed_steps
    ),
    coalesce(new.completed_at,new.updated_at,new.created_at,now()),now()
  )
  on conflict(owner_id,source_kind,source_id,event_type) do update set
    outcome=excluded.outcome,
    task_success=excluded.task_success,
    latency_ms=excluded.latency_ms,
    retry_count=excluded.retry_count,
    failure_category=excluded.failure_category,
    actual_cost_microusd=excluded.actual_cost_microusd,
    cost_known=excluded.cost_known,
    cost_per_successful_task_microusd=excluded.cost_per_successful_task_microusd,
    learning_value_score=excluded.learning_value_score,
    metadata=excluded.metadata,
    updated_at=now();

  return new;
end;
$pack094_task_trigger$;

create or replace function public.capture_zuvyr_task_step_learning_pack094()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_step_trigger$
declare
  v_owner uuid;
  v_cost numeric;
  v_cost_known boolean := false;
  v_latency bigint;
  v_outcome text;
  v_retry_count integer;
begin
  if new.state not in ('succeeded','failed','cancelled') then
    return new;
  end if;

  select user_id into v_owner
  from public.zuvyr_task_runs
  where id=new.task_run_id;
  if v_owner is null then
    return new;
  end if;

  if new.usage_record_id is not null then
    select
      case when cost_known then actual_provider_cost_microusd else null end,
      cost_known
    into v_cost,v_cost_known
    from public.zuvyr_usage_records
    where id=new.usage_record_id;
  end if;

  v_retry_count :=
    greatest(coalesce(new.attempts,0)-1,0)+greatest(coalesce(new.resume_count,0),0);
  v_latency := case
    when new.started_at is not null and new.completed_at is not null
      then greatest(0,floor(extract(epoch from(new.completed_at-new.started_at))*1000)::bigint)
    else null
  end;
  v_outcome := case
    when new.state='succeeded' then 'success'
    when new.state='cancelled' then 'cancelled'
    else 'failure'
  end;

  insert into public.zuvyr_learning_events(
    owner_id,source_kind,source_id,event_type,capability,provider,model_tool,
    outcome,tool_success,latency_ms,retry_count,failure_category,
    actual_cost_microusd,cost_known,learning_value_score,contains_user_content,
    metadata,created_at,updated_at
  ) values (
    v_owner,'task_step',new.id::text,'tool_outcome',
    nullif(left(btrim(coalesce(new.capability,'')),120),''),
    nullif(left(btrim(coalesce(new.provider,'')),120),''),
    nullif(left(btrim(coalesce(new.model_tool,'')),200),''),
    v_outcome,(new.state='succeeded'),v_latency,v_retry_count,
    case when new.state='failed'
      then public.pack094_safe_failure_category(new.error_code,'tool_failed')
      when new.state='cancelled' then 'tool_cancelled'
      else null end,
    v_cost,coalesce(v_cost_known,false),
    public.pack094_learning_value_score(
      'tool_outcome',v_outcome,v_retry_count,coalesce(v_cost_known,false),null
    ),
    false,
    jsonb_build_object(
      'step_key',left(coalesce(new.step_key,''),120),
      'sequence_number',new.sequence_number
    ),
    coalesce(new.completed_at,new.updated_at,now()),now()
  )
  on conflict(owner_id,source_kind,source_id,event_type) do update set
    capability=excluded.capability,
    provider=excluded.provider,
    model_tool=excluded.model_tool,
    outcome=excluded.outcome,
    tool_success=excluded.tool_success,
    latency_ms=excluded.latency_ms,
    retry_count=excluded.retry_count,
    failure_category=excluded.failure_category,
    actual_cost_microusd=excluded.actual_cost_microusd,
    cost_known=excluded.cost_known,
    learning_value_score=excluded.learning_value_score,
    metadata=excluded.metadata,
    updated_at=now();

  return new;
end;
$pack094_step_trigger$;

create or replace function public.capture_zuvyr_feedback_learning_pack094()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_feedback_trigger$
declare
  v_outcome text;
begin
  v_outcome := case when new.rating>0 then 'positive' else 'negative' end;

  insert into public.zuvyr_learning_events(
    owner_id,source_kind,source_id,event_type,capability,model_tool,outcome,
    learning_value_score,contains_user_content,metadata,created_at,updated_at
  ) values (
    new.user_id,'chat_feedback',new.id::text,'feedback',
    nullif(left(btrim(coalesce(new.feature,'chat')),120),''),
    nullif(left(btrim(coalesce(new.model,'')),200),''),
    v_outcome,
    public.pack094_learning_value_score('feedback',v_outcome,0,false,new.rating),
    false,
    jsonb_build_object('rating',new.rating),
    coalesce(new.updated_at,new.created_at,now()),now()
  )
  on conflict(owner_id,source_kind,source_id,event_type) do update set
    capability=excluded.capability,
    model_tool=excluded.model_tool,
    outcome=excluded.outcome,
    learning_value_score=excluded.learning_value_score,
    metadata=excluded.metadata,
    updated_at=now();

  return new;
end;
$pack094_feedback_trigger$;

create or replace function public.capture_zuvyr_failure_bank_pack094()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $pack094_failure_trigger$
declare
  v_fingerprint text;
begin
  if new.outcome<>'failure'
     or nullif(btrim(coalesce(new.failure_category,'')),'') is null then
    return new;
  end if;

  v_fingerprint := md5(concat_ws('|',
    coalesce(new.capability,'unknown'),
    coalesce(new.failure_category,'unknown'),
    coalesce(new.provider,'unknown'),
    coalesce(new.model_tool,'unknown'),
    coalesce(new.domain,'unknown')
  ));

  insert into public.zuvyr_failure_bank(
    owner_id,fingerprint,capability,failure_category,provider,model_tool,domain,
    occurrences,first_seen_at,last_seen_at,latest_event_id,latest_repair_outcome,status,updated_at
  ) values (
    new.owner_id,v_fingerprint,new.capability,new.failure_category,
    new.provider,new.model_tool,new.domain,
    1,new.created_at,new.created_at,new.id,new.repair_outcome,'open',now()
  )
  on conflict(owner_id,fingerprint) do update set
    occurrences=case
      when public.zuvyr_failure_bank.latest_event_id=excluded.latest_event_id
        then public.zuvyr_failure_bank.occurrences
      else public.zuvyr_failure_bank.occurrences+1
    end,
    last_seen_at=greatest(public.zuvyr_failure_bank.last_seen_at,excluded.last_seen_at),
    latest_event_id=excluded.latest_event_id,
    latest_repair_outcome=excluded.latest_repair_outcome,
    status=case
      when public.zuvyr_failure_bank.status='suppressed' then 'suppressed'
      else 'open'
    end,
    updated_at=now();

  return new;
end;
$pack094_failure_trigger$;

drop trigger if exists trg_pack094_usage_learning on public.zuvyr_usage_records;
create trigger trg_pack094_usage_learning
after insert or update of
  state,actual_provider_cost_microusd,cost_known,actual_credits,refunded_credits,accounting_state
on public.zuvyr_usage_records
for each row execute function public.capture_zuvyr_usage_learning_pack094();

drop trigger if exists trg_pack094_task_run_learning on public.zuvyr_task_runs;
create trigger trg_pack094_task_run_learning
after insert or update of state,error_code,completed_at,resume_count,usage_record_id
on public.zuvyr_task_runs
for each row execute function public.capture_zuvyr_task_run_learning_pack094();

drop trigger if exists trg_pack094_task_step_learning on public.zuvyr_task_steps;
create trigger trg_pack094_task_step_learning
after insert or update of state,error_code,completed_at,attempts,resume_count,usage_record_id
on public.zuvyr_task_steps
for each row execute function public.capture_zuvyr_task_step_learning_pack094();

drop trigger if exists trg_pack094_feedback_learning on public.chat_response_feedback;
create trigger trg_pack094_feedback_learning
after insert or update of rating,model,updated_at
on public.chat_response_feedback
for each row execute function public.capture_zuvyr_feedback_learning_pack094();

drop trigger if exists trg_pack094_failure_bank on public.zuvyr_learning_events;
create trigger trg_pack094_failure_bank
after insert or update of outcome,failure_category,repair_outcome
on public.zuvyr_learning_events
for each row execute function public.capture_zuvyr_failure_bank_pack094();

revoke all on function public.pack094_learning_value_score(text,text,integer,boolean,integer)
  from public,anon,authenticated;
revoke all on function public.pack094_safe_failure_category(text,text)
  from public,anon,authenticated;
revoke all on function public.pack094_insert_exclusion_for_candidate(uuid,uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.capture_zuvyr_training_consent_history_pack094()
  from public,anon,authenticated;
revoke all on function public.set_zuvyr_learning_consent_pack094(uuid,boolean,text,text)
  from public,anon,authenticated;
revoke all on function public.upsert_zuvyr_training_rights_pack094(uuid,uuid,uuid,text,text,text,boolean)
  from public,anon,authenticated;
revoke all on function public.revoke_zuvyr_training_rights_pack094(uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.mark_zuvyr_training_rights_privacy_pack094(uuid,uuid,text,text,text)
  from public,anon,authenticated;
revoke all on function public.admit_zuvyr_training_candidate_pack094(uuid,uuid,uuid,text,integer,integer,integer,text)
  from public,anon,authenticated;
revoke all on function public.admit_zuvyr_redacted_text_candidate_pack094(uuid,uuid,uuid,text,integer,integer,integer,text,text,jsonb)
  from public,anon,authenticated;
revoke all on function public.exclude_zuvyr_training_candidate_pack094(uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.capture_zuvyr_data_rights_training_exclusion_pack094()
  from public,anon,authenticated;
revoke all on function public.record_zuvyr_repair_learning_pack094(uuid,text,text,text,text,text,bigint,numeric,boolean)
  from public,anon,authenticated;
revoke all on function public.capture_zuvyr_usage_learning_pack094()
  from public,anon,authenticated;
revoke all on function public.capture_zuvyr_task_run_learning_pack094()
  from public,anon,authenticated;
revoke all on function public.capture_zuvyr_task_step_learning_pack094()
  from public,anon,authenticated;
revoke all on function public.capture_zuvyr_feedback_learning_pack094()
  from public,anon,authenticated;
revoke all on function public.capture_zuvyr_failure_bank_pack094()
  from public,anon,authenticated;

grant execute on function public.pack094_learning_value_score(text,text,integer,boolean,integer)
  to service_role;
grant execute on function public.pack094_safe_failure_category(text,text)
  to service_role;
grant execute on function public.set_zuvyr_learning_consent_pack094(uuid,boolean,text,text)
  to service_role;
grant execute on function public.upsert_zuvyr_training_rights_pack094(uuid,uuid,uuid,text,text,text,boolean)
  to service_role;
grant execute on function public.revoke_zuvyr_training_rights_pack094(uuid,uuid,text)
  to service_role;
grant execute on function public.mark_zuvyr_training_rights_privacy_pack094(uuid,uuid,text,text,text)
  to service_role;
grant execute on function public.admit_zuvyr_training_candidate_pack094(uuid,uuid,uuid,text,integer,integer,integer,text)
  to service_role;
grant execute on function public.admit_zuvyr_redacted_text_candidate_pack094(uuid,uuid,uuid,text,integer,integer,integer,text,text,jsonb)
  to service_role;
grant execute on function public.exclude_zuvyr_training_candidate_pack094(uuid,uuid,text)
  to service_role;
grant execute on function public.record_zuvyr_repair_learning_pack094(uuid,text,text,text,text,text,bigint,numeric,boolean)
  to service_role;

comment on table public.zuvyr_learning_events is
  'PACK094 privacy-safe NON-CONTENT learning telemetry. Prompt/response/intent/plan/final_result/task input/output/raw error text are forbidden.';
comment on table public.zuvyr_training_consent_events is
  'PACK094 immutable training-consent history. Current authority is zuvyr_user_preferences.training_consent; Memory permission remains independent.';
comment on table public.zuvyr_failure_bank is
  'PACK094 deduplicated sanitized failure categories for eval/routing learning; no raw user content or raw error messages.';
comment on table public.zuvyr_training_rights is
  'PACK094 owner-scoped training-rights/provenance/privacy authority for canonical content versions.';
comment on table public.zuvyr_training_candidates is
  'PACK094 rights/consent/privacy-approved candidate references. Dataset/checkpoint admission is owned by PACK095.';
comment on table public.zuvyr_training_candidate_payloads is
  'PACK094 service-role-only redacted training text. Original canonical content is not duplicated here.';
comment on table public.zuvyr_training_exclusions is
  'PACK094 durable revocation/exclusion audit for training candidates and sources.';
