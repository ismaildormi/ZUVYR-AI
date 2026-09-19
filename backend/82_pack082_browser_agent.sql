-- ZUVYR V1 PACK082 — Browser Agent authority and Permission Center extension.

-- Clean rebuild after rejecting a corrupted duplicate draft. Additive / compatibility-preserving.

-- PACK081 runtime/provider gates remain authoritative; raw typed values are not persisted.



alter table public.zuvyr_permission_grants
  drop constraint if exists zuvyr_permission_grants_action_class_check;
alter table public.zuvyr_permission_grants
  add constraint zuvyr_permission_grants_action_class_check
  check (action_class in (
    'project.read','project.write',
    'dependency.install','runtime.execute',
    'preview.view','preview.open','network.egress',
    'deploy.execute','deploy.rollback',
    'browser.interact','browser.input','browser.submit','browser.upload'
  ));

alter table public.zuvyr_permission_grants
  drop constraint if exists zuvyr_permission_grants_resource_namespace_check;
alter table public.zuvyr_permission_grants
  add constraint zuvyr_permission_grants_resource_namespace_check
  check (resource_namespace in (
    'workspace_project','code_project','browser_session'
  ));



create table if not exists public.browser_agent_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  browser_session_id uuid not null references public.browser_sessions(id) on delete cascade,
  conversation_id uuid references public.shared_conversations(id) on delete set null,
  task_run_id uuid references public.zuvyr_task_runs(id) on delete set null,
  request_id text not null check (char_length(request_id) between 1 and 200),
  status text not null default 'planned' check (status in (
    'planned','running','approval_required','stopping',
    'succeeded','failed','cancelled','stopped'
  )),
  goal_redacted text not null check (char_length(goal_redacted) between 1 and 4000),
  goal_sha256 text not null check (goal_sha256 ~ '^[0-9a-f]{64}$'),
  plan_version text not null check (char_length(plan_version) between 1 and 200),
  intent_fingerprint text not null check (intent_fingerprint ~ '^[0-9a-f]{64}$'),
  allowed_hosts jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(allowed_hosts)='array'
      and jsonb_array_length(allowed_hosts) between 1 and 32
    ),
  max_steps integer not null default 20 check (max_steps between 1 and 40),
  completed_steps integer not null default 0 check (completed_steps between 0 and 40),
  current_url text,
  current_host text,
  stop_requested boolean not null default false,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(owner_id, request_id)
);

create table if not exists public.browser_agent_actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  run_id uuid not null references public.browser_agent_runs(id) on delete cascade,
  browser_session_id uuid not null references public.browser_sessions(id) on delete cascade,
  sequence_no integer not null check (sequence_no between 1 and 40),
  request_id text not null check (char_length(request_id) between 1 and 200),
  action_type text not null check (action_type in (
    'observe','navigate','click','type','scroll','wait','submit','upload','verify'
  )),
  action_fingerprint text not null check (action_fingerprint ~ '^[0-9a-f]{64}$'),
  target jsonb not null default '{}'::jsonb check (jsonb_typeof(target)='object'),
  input_sha256 text check (
    input_sha256 is null or input_sha256 ~ '^[0-9a-f]{64}$'
  ),
  input_length integer check (
    input_length is null or input_length between 0 and 4000
  ),
  risk text not null check (risk in ('low','medium','high','critical')),
  permission_action text check (
    permission_action is null or permission_action in (
      'browser.interact','browser.input','browser.submit','browser.upload'
    )
  ),
  status text not null default 'planned' check (status in (
    'planned','approval_required','approved','executing',
    'succeeded','failed','uncertain','cancelled'
  )),
  permission_grant_id uuid
    references public.zuvyr_permission_grants(id) on delete set null,
  before_artifact_id uuid
    references public.browser_session_artifacts(id) on delete set null,
  after_artifact_id uuid
    references public.browser_session_artifacts(id) on delete set null,
  outcome jsonb not null default '{}'::jsonb
    check (jsonb_typeof(outcome)='object'),
  failure_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id, sequence_no),
  unique(owner_id, request_id)
);

create table if not exists public.browser_agent_reasoning_turns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  run_id uuid not null references public.browser_agent_runs(id) on delete cascade,
  request_id text not null check (char_length(request_id) between 1 and 200),
  observation_sha256 text not null
    check (observation_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'processing'
    check (status in ('processing','succeeded','failed')),
  decision_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(decision_summary)='object'),
  action_id uuid references public.browser_agent_actions(id) on delete set null,
  model text,
  pricing_version text
    check (pricing_version is null or char_length(pricing_version) between 1 and 200),
  cost_entry_id text
    check (cost_entry_id is null or char_length(cost_entry_id) between 1 and 200),
  provider_cost_micro_usd bigint
    check (provider_cost_micro_usd is null or provider_cost_micro_usd >= 0),
  credits_charged integer
    check (credits_charged is null or credits_charged >= 0),
  failure_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(owner_id, request_id)
);

create index if not exists browser_agent_runs_owner_updated_idx
  on public.browser_agent_runs(owner_id, updated_at desc);
create index if not exists browser_agent_runs_session_idx
  on public.browser_agent_runs(browser_session_id, updated_at desc);
create unique index if not exists browser_agent_runs_one_active_session_idx
  on public.browser_agent_runs(browser_session_id)
  where status in ('planned','running','approval_required','stopping');

create index if not exists browser_agent_actions_run_sequence_idx
  on public.browser_agent_actions(run_id, sequence_no);
create index if not exists browser_agent_actions_owner_created_idx
  on public.browser_agent_actions(owner_id, created_at desc);
create index if not exists browser_agent_reasoning_run_created_idx
  on public.browser_agent_reasoning_turns(run_id, created_at desc);

alter table public.browser_agent_runs enable row level security;
alter table public.browser_agent_actions enable row level security;
alter table public.browser_agent_reasoning_turns enable row level security;

revoke all on public.browser_agent_runs from public, anon, authenticated;
revoke all on public.browser_agent_actions from public, anon, authenticated;
revoke all on public.browser_agent_reasoning_turns from public, anon, authenticated;

grant select, insert, update on public.browser_agent_runs to service_role;
grant select, insert, update on public.browser_agent_actions to service_role;
grant select, insert, update on public.browser_agent_reasoning_turns to service_role;



create or replace function public.zuvyr_permission_resource_owned(
  p_owner_id uuid,
  p_resource_namespace text,
  p_resource_id text
) returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $pack082_owned$
begin
  if p_owner_id is null or nullif(trim(p_resource_id),'') is null then
    return false;
  end if;
  if p_resource_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;
  if p_resource_namespace = 'workspace_project' then
    return exists (
      select 1 from public.workspace_projects p
      where p.id = p_resource_id::uuid
        and p.owner_id = p_owner_id
        and p.archived_at is null
    );
  elsif p_resource_namespace = 'code_project' then
    return exists (
      select 1 from public.code_projects p
      where p.id = p_resource_id::uuid
        and p.owner_id = p_owner_id
        and p.status = 'active'
    );
  elsif p_resource_namespace = 'browser_session' then
    return exists (
      select 1 from public.browser_sessions s
      where s.id = p_resource_id::uuid
        and s.owner_id = p_owner_id
        and s.status in ('running','detached')
    );
  end if;
  return false;
end;
$pack082_owned$;



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
as $pack082_permission_grant$
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
  if v_action not in (
    'project.read','project.write',
    'dependency.install','runtime.execute',
    'preview.view','preview.open','network.egress',
    'deploy.execute','deploy.rollback',
    'browser.interact','browser.input','browser.submit','browser.upload'
  ) then
    return jsonb_build_object('success',false,'error','invalid_permission_action');
  end if;
  if v_mode not in ('allow_once','session','scoped') then
    return jsonb_build_object('success',false,'error','invalid_permission_grant_mode');
  end if;
  if v_scope not in ('project','project_session') then
    return jsonb_build_object('success',false,'error','invalid_permission_scope');
  end if;
  if v_ns not in ('workspace_project','code_project','browser_session') then
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
  elsif v_action like 'browser.%' then
    if v_ns <> 'browser_session'
       or v_scope <> 'project_session'
       or v_session is null
       or v_session <> v_resource then
      return jsonb_build_object('success',false,'error','permission_scope_action_mismatch');
    end if;
    if v_action in ('browser.submit','browser.upload') and v_mode <> 'allow_once' then
      return jsonb_build_object('success',false,'error','permission_browser_allow_once_required');
    end if;
    if v_action in ('browser.interact','browser.input')
       and v_mode not in ('allow_once','session') then
      return jsonb_build_object('success',false,'error','permission_mode_action_mismatch');
    end if;
  else
    if v_ns <> 'code_project' or v_scope <> 'project_session' or v_session is null then
      return jsonb_build_object('success',false,'error','permission_scope_action_mismatch');
    end if;
    if v_action in ('deploy.execute','deploy.rollback') and v_mode <> 'allow_once' then
      return jsonb_build_object('success',false,'error','permission_deploy_allow_once_required');
    end if;
    if v_action in (
      'dependency.install','runtime.execute',
      'preview.view','preview.open','network.egress'
    ) and v_mode not in ('allow_once','session') then
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
    when 'browser.interact' then 1800
    when 'browser.input' then 1800
    when 'browser.submit' then 600
    when 'browser.upload' then 600
  end;

  v_expected_consequence := 'permission.' || v_action || '.v1';
  if v_consequence <> v_expected_consequence then
    return jsonb_build_object('success',false,'error','permission_consequence_mismatch');
  end if;
  if v_fp !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('success',false,'error','invalid_permission_confirmation_fingerprint');
  end if;
  if p_expires_at is null
     or p_expires_at <= now()
     or p_expires_at > now() + make_interval(secs => v_max_seconds) then
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
      select lower(trim(value))
      from jsonb_array_elements_text(p_constraints->'allowedHosts') h(value)
    loop
      if v_host = '' or v_host = '*' or length(v_host) > 253
         or position('.' in v_host) = 0
         or v_host !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$' then
        return jsonb_build_object('success',false,'error','invalid_permission_network_host');
      end if;
      if v_host in (
           'localhost','0.0.0.0','127.0.0.1',
           'host.docker.internal','metadata.google.internal'
         )
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

  if v_action like 'browser.%' then
    if p_constraints ? 'host' then
      v_host := lower(trim(coalesce(p_constraints->>'host','')));
      if v_host = ''
         or v_host = '*'
         or length(v_host) > 253
         or position('.' in v_host) = 0
         or v_host !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*

  insert into public.zuvyr_permission_grants(
    owner_id, action_class, grant_mode, scope_type,
    resource_namespace, resource_id, session_id,
    consequence_id, confirmation_fingerprint,
    constraints, expires_at
  ) values (
    p_owner_id, v_action, v_mode, v_scope,
    v_ns, v_resource, v_session,
    v_consequence, v_fp,
    coalesce(p_constraints,'{}'::jsonb), p_expires_at
  )
  returning id into v_id;

  insert into public.zuvyr_permission_audit_events(
    owner_id, grant_id, action_class, event_type, reason,
    resource_namespace, resource_id, session_id, metadata
  ) values (
    p_owner_id, v_id, v_action, 'grant_created', 'explicit_confirmation',
    v_ns, v_resource, v_session,
    jsonb_build_object(
      'grantMode',v_mode,
      'scopeType',v_scope,
      'consequenceId',v_consequence
    )
  );

  return jsonb_build_object(
    'success',true,
    'grant_id',v_id,
    'expires_at',p_expires_at,
    'action_class',v_action
  );
end;
$pack082_permission_grant$;



create or replace function public.reserve_zuvyr_browser_agent_run_pack082(
  p_owner_id uuid,
  p_browser_session_id uuid,
  p_conversation_id uuid,
  p_task_run_id uuid,
  p_request_id text,
  p_goal_redacted text,
  p_goal_sha256 text,
  p_plan_version text,
  p_intent_fingerprint text,
  p_allowed_hosts jsonb,
  p_max_steps integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack082_reserve_run$
declare
  v_session public.browser_sessions%rowtype;
  v_existing public.browser_agent_runs%rowtype;
  v_run public.browser_agent_runs%rowtype;
begin
  select * into v_session
  from public.browser_sessions
  where id=p_browser_session_id
    and owner_id=p_owner_id
    and status in ('running','detached');

  if v_session.id is null then
    raise exception 'pack082_browser_session_not_available';
  end if;

  if p_conversation_id is not null then
    if not exists (
      select 1
      from public.shared_conversations c
      where c.id=p_conversation_id
        and c.owner_id=p_owner_id
    ) then
      raise exception 'pack082_conversation_owner_mismatch';
    end if;
    if v_session.conversation_id is not null
       and v_session.conversation_id <> p_conversation_id then
      raise exception 'pack082_conversation_session_mismatch';
    end if;
  end if;

  if p_task_run_id is not null then
    if not exists (
      select 1
      from public.zuvyr_task_runs t
      where t.id=p_task_run_id
        and t.user_id=p_owner_id
    ) then
      raise exception 'pack082_task_owner_mismatch';
    end if;
    if v_session.task_run_id is not null
       and v_session.task_run_id <> p_task_run_id then
      raise exception 'pack082_task_session_mismatch';
    end if;
  end if;
  if char_length(coalesce(p_request_id,'')) not between 1 and 200 then
    raise exception 'pack082_request_id_invalid';
  end if;
  if char_length(coalesce(p_goal_redacted,'')) not between 1 and 4000
     or coalesce(p_goal_sha256,'') !~ '^[0-9a-f]{64}$'
     or char_length(coalesce(p_plan_version,'')) not between 1 and 200
     or coalesce(p_intent_fingerprint,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'pack082_run_contract_invalid';
  end if;
  if jsonb_typeof(p_allowed_hosts) <> 'array'
     or jsonb_array_length(p_allowed_hosts) < 1
     or jsonb_array_length(p_allowed_hosts) > 32
     or exists (
       select 1
       from jsonb_array_elements(p_allowed_hosts) e(value)
       where jsonb_typeof(e.value) <> 'string'
          or nullif(lower(trim(e.value #>> '{}')),'') is null
     ) then
    raise exception 'pack082_allowed_hosts_invalid';
  end if;

  if coalesce(jsonb_typeof(v_session.network_policy->'allowedHosts'),'') <> 'array'
     or exists (
       select 1
       from jsonb_array_elements_text(p_allowed_hosts) h(host)
       where not exists (
         select 1
         from jsonb_array_elements_text(v_session.network_policy->'allowedHosts') s(host)
         where lower(trim(s.host)) = lower(trim(h.host))
       )
     ) then
    raise exception 'pack082_allowed_hosts_outside_session_scope';
  end if;
  if p_max_steps not between 1 and 40 then
    raise exception 'pack082_max_steps_invalid';
  end if;
select * into v_existing
  from public.browser_agent_runs
  where owner_id=p_owner_id and request_id=p_request_id;

  if v_existing.id is not null then
    if v_existing.browser_session_id <> p_browser_session_id
       or v_existing.goal_sha256 <> p_goal_sha256
       or v_existing.plan_version <> p_plan_version
       or v_existing.intent_fingerprint <> p_intent_fingerprint then
      raise exception 'pack082_idempotency_scope_mismatch';
    end if;
    return jsonb_build_object(
      'replayed',true,
      'run_id',v_existing.id,
      'status',v_existing.status
    );
  end if;

  if exists (
    select 1 from public.browser_agent_runs
    where browser_session_id=p_browser_session_id
      and status in ('planned','running','approval_required','stopping')
  ) then
    raise exception 'pack082_active_agent_run_exists';
  end if;

  insert into public.browser_agent_runs(
    owner_id,browser_session_id,conversation_id,task_run_id,
    request_id,goal_redacted,goal_sha256,plan_version,
    intent_fingerprint,allowed_hosts,max_steps
  ) values (
    p_owner_id,p_browser_session_id,p_conversation_id,p_task_run_id,
    p_request_id,p_goal_redacted,p_goal_sha256,p_plan_version,
    p_intent_fingerprint,p_allowed_hosts,p_max_steps
  )
  returning * into v_run;

  return jsonb_build_object(
    'replayed',false,
    'run_id',v_run.id,
    'status',v_run.status
  );
end;
$pack082_reserve_run$;



create or replace function public.transition_zuvyr_browser_agent_run_pack082(
  p_owner_id uuid,
  p_run_id uuid,
  p_next_status text,
  p_current_url text default null,
  p_current_host text default null,
  p_failure_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack082_transition_run$
declare
  v_run public.browser_agent_runs%rowtype;
  v_next text := lower(trim(coalesce(p_next_status,'')));
  v_allowed boolean := false;
begin
  select * into v_run
  from public.browser_agent_runs
  where id=p_run_id and owner_id=p_owner_id
  for update;

  if v_run.id is null then raise exception 'pack082_run_not_found'; end if;
  if v_next not in (
    'planned','running','approval_required','stopping',
    'succeeded','failed','cancelled','stopped'
  ) then raise exception 'pack082_run_status_invalid'; end if;

  if v_run.status=v_next then
    return jsonb_build_object('run_id',v_run.id,'status',v_run.status,'replayed',true);
  end if;
  if v_run.status in ('succeeded','failed','cancelled','stopped') then
    raise exception 'pack082_terminal_run';
  end if;

  v_allowed :=
    (v_run.status='planned' and v_next in ('running','cancelled','failed'))
    or
    (v_run.status='running' and v_next in (
      'approval_required','stopping','succeeded','failed','cancelled'
    ))
    or
    (v_run.status='approval_required' and v_next in (
      'running','stopping','failed','cancelled'
    ))
    or
    (v_run.status='stopping' and v_next in ('stopped','failed'));

  if not v_allowed then raise exception 'pack082_invalid_run_transition'; end if;

  update public.browser_agent_runs
  set status=v_next,
      current_url=coalesce(p_current_url,current_url),
      current_host=coalesce(p_current_host,current_host),
      failure_code=case when v_next='failed'
        then left(coalesce(p_failure_code,'pack082_agent_failed'),200)
        else failure_code end,
      stop_requested=case when v_next in ('stopping','cancelled','stopped') then true else stop_requested end,
      updated_at=now(),
      finished_at=case when v_next in ('succeeded','failed','cancelled','stopped') then now() else finished_at end
  where id=p_run_id
  returning * into v_run;

  return jsonb_build_object(
    'run_id',v_run.id,'status',v_run.status,'replayed',false,
    'stop_requested',v_run.stop_requested
  );
end;
$pack082_transition_run$;



create or replace function public.reserve_zuvyr_browser_agent_action_pack082(
  p_owner_id uuid,
  p_run_id uuid,
  p_request_id text,
  p_action_type text,
  p_action_fingerprint text,
  p_target jsonb,
  p_input_sha256 text,
  p_input_length integer,
  p_risk text,
  p_permission_action text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack082_reserve_action$
declare
  v_run public.browser_agent_runs%rowtype;
  v_existing public.browser_agent_actions%rowtype;
  v_action public.browser_agent_actions%rowtype;
  v_sequence integer;
begin
  select * into v_run
  from public.browser_agent_runs
  where id=p_run_id and owner_id=p_owner_id
  for update;

  if v_run.id is null then raise exception 'pack082_run_not_found'; end if;
  if v_run.status not in ('running','approval_required') or v_run.stop_requested then
    raise exception 'pack082_run_not_executable';
  end if;

  select * into v_existing
  from public.browser_agent_actions
  where owner_id=p_owner_id and request_id=p_request_id;
  if v_existing.id is not null then
    if v_existing.run_id <> p_run_id
       or v_existing.action_fingerprint <> p_action_fingerprint then
      raise exception 'pack082_action_idempotency_scope_mismatch';
    end if;
    return jsonb_build_object(
      'replayed',true,'action_id',v_existing.id,
      'sequence_no',v_existing.sequence_no,'status',v_existing.status
    );
  end if;

  select coalesce(max(sequence_no),0) + 1
    into v_sequence
  from public.browser_agent_actions
  where run_id=p_run_id;

  if v_sequence > v_run.max_steps then
    raise exception 'pack082_step_budget_exhausted';
  end if;

  insert into public.browser_agent_actions(
    owner_id,run_id,browser_session_id,sequence_no,request_id,
    action_type,action_fingerprint,target,input_sha256,input_length,
    risk,permission_action,status
  ) values (
    p_owner_id,p_run_id,v_run.browser_session_id,v_sequence,p_request_id,
    p_action_type,p_action_fingerprint,coalesce(p_target,'{}'::jsonb),
    p_input_sha256,p_input_length,p_risk,p_permission_action,
    case when p_permission_action is null then 'planned' else 'approval_required' end
  )
  returning * into v_action;

  if v_action.status='approval_required' and v_run.status<>'approval_required' then
    update public.browser_agent_runs
    set status='approval_required',updated_at=now()
    where id=p_run_id;
  end if;

  return jsonb_build_object(
    'replayed',false,'action_id',v_action.id,
    'sequence_no',v_action.sequence_no,'status',v_action.status
  );
end;
$pack082_reserve_action$;



create or replace function public.transition_zuvyr_browser_agent_action_pack082(
  p_owner_id uuid,
  p_action_id uuid,
  p_expected_status text,
  p_next_status text,
  p_permission_grant_id uuid default null,
  p_before_artifact_id uuid default null,
  p_after_artifact_id uuid default null,
  p_outcome jsonb default '{}'::jsonb,
  p_failure_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack082_transition_action$
declare
  v_action public.browser_agent_actions%rowtype;
  v_run public.browser_agent_runs%rowtype;
  v_expected text := lower(trim(coalesce(p_expected_status,'')));
  v_next text := lower(trim(coalesce(p_next_status,'')));
  v_allowed boolean := false;
begin
  select * into v_action
  from public.browser_agent_actions
  where id=p_action_id and owner_id=p_owner_id
  for update;

  if v_action.id is null then raise exception 'pack082_action_not_found'; end if;
  if v_action.status <> v_expected then raise exception 'pack082_action_state_conflict'; end if;

  select * into v_run
  from public.browser_agent_runs
  where id=v_action.run_id and owner_id=p_owner_id
  for update;

  if v_run.stop_requested then
    raise exception 'pack082_run_stop_requested';
  end if;

  v_allowed :=
    (v_action.status='planned' and v_next in ('executing','cancelled','failed'))
    or
    (v_action.status='approval_required' and v_next in ('approved','cancelled','failed'))
    or
    (v_action.status='approved' and v_next in ('executing','cancelled','failed'))
    or
    (v_action.status='executing' and v_next in ('succeeded','failed','uncertain'));

  if not v_allowed then raise exception 'pack082_invalid_action_transition'; end if;
  if v_next='approved' and v_action.permission_action is not null and p_permission_grant_id is null then
    raise exception 'pack082_permission_grant_required';
  end if;
  if coalesce(jsonb_typeof(p_outcome),'') <> 'object' then
    raise exception 'pack082_action_outcome_invalid';
  end if;

  update public.browser_agent_actions
  set status=v_next,
      permission_grant_id=coalesce(p_permission_grant_id,permission_grant_id),
      before_artifact_id=coalesce(p_before_artifact_id,before_artifact_id),
      after_artifact_id=coalesce(p_after_artifact_id,after_artifact_id),
      outcome=coalesce(p_outcome,'{}'::jsonb),
      failure_code=case when v_next in ('failed','uncertain')
        then left(coalesce(p_failure_code,'pack082_action_failed'),200)
        else failure_code end,
      started_at=case when v_next='executing' then coalesce(started_at,now()) else started_at end,
      finished_at=case when v_next in ('succeeded','failed','uncertain','cancelled') then now() else finished_at end,
      updated_at=now()
  where id=p_action_id
  returning * into v_action;

  if v_next='succeeded' then
    update public.browser_agent_runs
    set completed_steps=greatest(completed_steps,v_action.sequence_no),
        status='running',
        updated_at=now()
    where id=v_action.run_id;
  elsif v_next='uncertain' then
    update public.browser_agent_runs
    set status='approval_required',updated_at=now()
    where id=v_action.run_id;
  end if;

  return jsonb_build_object(
    'action_id',v_action.id,'status',v_action.status,
    'sequence_no',v_action.sequence_no
  );
end;
$pack082_transition_action$;



create or replace function public.request_stop_zuvyr_browser_agent_run_pack082(
  p_owner_id uuid,
  p_run_id uuid,
  p_reason text default 'user_requested'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack082_stop_run$
declare
  v_run public.browser_agent_runs%rowtype;
  v_reason text := left(coalesce(nullif(trim(p_reason),''),'user_requested'),200);
begin
  select * into v_run
  from public.browser_agent_runs
  where id=p_run_id and owner_id=p_owner_id
  for update;

  if v_run.id is null then
    raise exception 'pack082_run_not_found';
  end if;

  if v_run.status in ('succeeded','failed','cancelled','stopped') then
    return jsonb_build_object(
      'run_id',v_run.id,
      'status',v_run.status,
      'stop_requested',v_run.stop_requested,
      'replayed',true
    );
  end if;

  update public.browser_agent_runs
  set stop_requested=true,
      status=case
        when status='planned' then 'cancelled'
        when status in ('running','approval_required') then 'stopping'
        else status
      end,
      failure_code=case
        when status='planned' then coalesce(failure_code,'pack082_stop_' || v_reason)
        else failure_code
      end,
      updated_at=now(),
      finished_at=case when status='planned' then now() else finished_at end
  where id=p_run_id
  returning * into v_run;

  update public.browser_agent_actions
  set status='cancelled',
      failure_code=coalesce(failure_code,'pack082_run_stop_requested'),
      finished_at=now(),
      updated_at=now()
  where run_id=p_run_id
    and owner_id=p_owner_id
    and status in ('planned','approval_required','approved');

  return jsonb_build_object(
    'run_id',v_run.id,
    'status',v_run.status,
    'stop_requested',v_run.stop_requested,
    'replayed',false
  );
end;
$pack082_stop_run$;



alter table public.zuvyr_task_steps
  drop constraint if exists zuvyr_task_steps_state_allowed;
alter table public.zuvyr_task_steps
  add constraint zuvyr_task_steps_state_allowed
  check (state in (
    'pending','running','deferred','succeeded','failed','cancelled'
  ));



create or replace function public.defer_zuvyr_task_step_pack082(
  p_step_id bigint,
  p_worker_owner text,
  p_lease_token uuid,
  p_checkpoint jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack082_defer_task_step$
declare
  v_step public.zuvyr_task_steps%rowtype;
begin
  if p_checkpoint is null or jsonb_typeof(p_checkpoint) <> 'object' then
    raise exception 'pack082_defer_checkpoint_invalid';
  end if;

  select *
    into v_step
  from public.zuvyr_task_steps
  where id=p_step_id
    and state='running'
    and lease_owner=btrim(p_worker_owner)
    and lease_token=p_lease_token
    and lease_expires_at > now()
  for update;

  if v_step.id is null then
    raise exception 'pack082_defer_lease_not_current';
  end if;

  update public.zuvyr_task_steps
  set state='deferred',
      attempts=greatest(attempts - 1, 0),
      checkpoint=p_checkpoint,
      checkpoint_version=checkpoint_version + 1,
      last_checkpoint_at=now(),
      lease_owner=null,
      lease_token=null,
      lease_expires_at=null,
      last_heartbeat_at=now(),
      error_code=null,
      updated_at=now()
  where id=v_step.id
  returning * into v_step;

  update public.zuvyr_task_runs
  set checkpoint=jsonb_build_object(
        'stepKey',v_step.step_key,
        'stepCheckpointVersion',v_step.checkpoint_version,
        'phase','deferred'
      ),
      checkpoint_version=checkpoint_version + 1,
      last_checkpoint_at=now(),
      updated_at=now()
  where id=v_step.task_run_id;

  return jsonb_build_object(
    'taskRunId',v_step.task_run_id,
    'stepId',v_step.id,
    'stepKey',v_step.step_key,
    'state',v_step.state,
    'attempts',v_step.attempts,
    'checkpoint',v_step.checkpoint,
    'checkpointVersion',v_step.checkpoint_version
  );
end;
$pack082_defer_task_step$;



create or replace function public.resume_zuvyr_task_step_pack082(
  p_task_run_id uuid,
  p_user_id uuid,
  p_step_id bigint,
  p_resume_receipt jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack082_resume_task_step$
declare
  v_run public.zuvyr_task_runs%rowtype;
  v_step public.zuvyr_task_steps%rowtype;
  v_checkpoint jsonb;
begin
  if p_resume_receipt is null
     or jsonb_typeof(p_resume_receipt) <> 'object' then
    raise exception 'pack082_resume_receipt_invalid';
  end if;

  select *
    into v_run
  from public.zuvyr_task_runs
  where id=p_task_run_id
    and user_id=p_user_id
  for update;

  if v_run.id is null then
    raise exception 'pack082_task_not_found';
  end if;

  if v_run.cancel_requested
     or v_run.state in ('succeeded','failed','cancelled') then
    raise exception 'pack082_task_not_resumable';
  end if;

  select *
    into v_step
  from public.zuvyr_task_steps
  where id=p_step_id
    and task_run_id=v_run.id
  for update;

  if v_step.id is null then
    raise exception 'pack082_step_not_found';
  end if;

  if v_step.state='pending' then
    return jsonb_build_object(
      'taskRunId',v_run.id,
      'stepId',v_step.id,
      'stepKey',v_step.step_key,
      'state',v_step.state,
      'replayed',true,
      'resumeCount',v_step.resume_count
    );
  end if;

  if v_step.state <> 'deferred' then
    raise exception 'pack082_step_not_deferred';
  end if;

  v_checkpoint :=
    coalesce(v_step.checkpoint,'{}'::jsonb)
    || jsonb_build_object(
         'phase','resumed',
         'resumeReceipt',p_resume_receipt
       );

  update public.zuvyr_task_steps
  set state='pending',
      checkpoint=v_checkpoint,
      checkpoint_version=checkpoint_version + 1,
      last_checkpoint_at=now(),
      resume_count=resume_count + 1,
      error_code=null,
      lease_owner=null,
      lease_token=null,
      lease_expires_at=null,
      updated_at=now()
  where id=v_step.id
  returning * into v_step;

  update public.zuvyr_task_runs
  set state='running',
      resume_count=resume_count + 1,
      checkpoint=jsonb_build_object(
        'stepKey',v_step.step_key,
        'stepCheckpointVersion',v_step.checkpoint_version,
        'phase','resumed'
      ),
      checkpoint_version=checkpoint_version + 1,
      last_checkpoint_at=now(),
      updated_at=now()
  where id=v_run.id;

  return jsonb_build_object(
    'taskRunId',v_run.id,
    'stepId',v_step.id,
    'stepKey',v_step.step_key,
    'state',v_step.state,
    'replayed',false,
    'resumeCount',v_step.resume_count,
    'checkpoint',v_step.checkpoint
  );
end;
$pack082_resume_task_step$;



create or replace function public.request_cancel_zuvyr_task(
  p_task_run_id uuid,
  p_user_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack082_request_cancel_task$
declare
  v_run public.zuvyr_task_runs%rowtype;
  v_reason text;
  v_running_count integer := 0;
  v_receipt jsonb;
begin
  v_reason := btrim(coalesce(p_reason,'user_requested'));

  if length(v_reason) < 1 or length(v_reason) > 500 then
    raise exception 'pack039_cancel_reason_invalid';
  end if;

  select *
    into v_run
  from public.zuvyr_task_runs
  where id=p_task_run_id
    and user_id=p_user_id
  for update;

  if v_run.id is null then
    raise exception 'pack039_task_not_found';
  end if;

  if v_run.state in ('succeeded','failed','cancelled') then
    return jsonb_build_object(
      'taskRunId',v_run.id,
      'accepted',false,
      'replayed',v_run.cancel_requested,
      'state',v_run.state,
      'cancelRequested',v_run.cancel_requested
    );
  end if;

  update public.zuvyr_task_runs
  set cancel_requested=true,
      cancel_reason=coalesce(cancel_reason,v_reason),
      cancel_requested_at=coalesce(cancel_requested_at,now()),
      updated_at=now()
  where id=v_run.id
  returning * into v_run;

  select count(*)
    into v_running_count
  from public.zuvyr_task_steps s
  where s.task_run_id=v_run.id
    and s.state='running';

  if v_running_count=0 then
    v_receipt := jsonb_build_object(
      'version','pack-039.cancel-receipt.v1',
      'reason',v_run.cancel_reason,
      'phase','cancelled_before_active_step',
      'lateResultIgnored',false
    );

    update public.zuvyr_task_steps
    set state='cancelled',
        cancelled_at=now(),
        cancellation_receipt=v_receipt,
        lease_owner=null,
        lease_token=null,
        lease_expires_at=null,
        completed_at=coalesce(completed_at,now()),
        updated_at=now()
    where task_run_id=v_run.id
      and state in ('pending','running','deferred');

    update public.zuvyr_task_runs
    set state='cancelled',
        cancellation_receipt=v_receipt,
        cancelled_at=now(),
        completed_at=coalesce(completed_at,now()),
        final_result=jsonb_build_object(
          'cancelled',true,
          'cancellationReceipt',v_receipt
        ),
        updated_at=now()
    where id=v_run.id
    returning * into v_run;
  end if;

  return jsonb_build_object(
    'taskRunId',v_run.id,
    'accepted',true,
    'state',v_run.state,
    'cancelRequested',true,
    'reason',v_run.cancel_reason,
    'activeSteps',v_running_count
  );
end;
$pack082_request_cancel_task$;



create or replace function public.cancel_zuvyr_task_step(
  p_step_id bigint,
  p_worker_owner text,
  p_lease_token uuid,
  p_receipt jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $pack082_cancel_task_step$
declare
  v_step public.zuvyr_task_steps%rowtype;
  v_run public.zuvyr_task_runs%rowtype;
begin
  if p_receipt is null or jsonb_typeof(p_receipt) <> 'object' then
    raise exception 'pack039_cancellation_receipt_invalid';
  end if;

  select s.*
    into v_step
  from public.zuvyr_task_steps s
  where s.id=p_step_id
    and s.state='running'
    and s.lease_owner=btrim(p_worker_owner)
    and s.lease_token=p_lease_token
    and s.lease_expires_at > now()
  for update;

  if v_step.id is null then
    raise exception 'pack039_cancel_lease_not_current';
  end if;

  select *
    into v_run
  from public.zuvyr_task_runs
  where id=v_step.task_run_id
  for update;

  if v_run.id is null then
    raise exception 'pack039_task_not_found';
  end if;

  if not v_run.cancel_requested then
    raise exception 'pack039_cancel_not_requested';
  end if;

  update public.zuvyr_task_steps
  set state='cancelled',
      cancelled_at=now(),
      cancellation_receipt=p_receipt,
      lease_owner=null,
      lease_token=null,
      lease_expires_at=null,
      last_heartbeat_at=now(),
      completed_at=coalesce(completed_at,now()),
      updated_at=now()
  where task_run_id=v_run.id
    and state in ('pending','running','deferred');

  update public.zuvyr_task_runs
  set state='cancelled',
      cancellation_receipt=p_receipt,
      cancelled_at=now(),
      completed_at=coalesce(completed_at,now()),
      final_result=jsonb_build_object(
        'cancelled',true,
        'cancellationReceipt',p_receipt
      ),
      updated_at=now()
  where id=v_run.id
  returning * into v_run;

  return jsonb_build_object(
    'taskRunId',v_run.id,
    'stepId',v_step.id,
    'stepKey',v_step.step_key,
    'state',v_run.state,
    'cancelRequested',v_run.cancel_requested,
    'cancellationReceipt',v_run.cancellation_receipt
  );
end;
$pack082_cancel_task_step$;



revoke all on function public.zuvyr_permission_resource_owned(uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.create_zuvyr_permission_grant(
  uuid,text,text,text,text,text,text,text,text,timestamptz,boolean,jsonb
) from public,anon,authenticated;

revoke all on function public.reserve_zuvyr_browser_agent_run_pack082(
  uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,integer
) from public,anon,authenticated;
revoke all on function public.transition_zuvyr_browser_agent_run_pack082(
  uuid,uuid,text,text,text,text
) from public,anon,authenticated;
revoke all on function public.reserve_zuvyr_browser_agent_action_pack082(
  uuid,uuid,text,text,text,jsonb,text,integer,text,text
) from public,anon,authenticated;
revoke all on function public.transition_zuvyr_browser_agent_action_pack082(
  uuid,uuid,text,text,uuid,uuid,uuid,jsonb,text
) from public,anon,authenticated;
revoke all on function public.request_stop_zuvyr_browser_agent_run_pack082(
  uuid,uuid,text
) from public,anon,authenticated;

revoke all on function public.defer_zuvyr_task_step_pack082(
  bigint,text,uuid,jsonb
) from public,anon,authenticated;
revoke all on function public.resume_zuvyr_task_step_pack082(
  uuid,uuid,bigint,jsonb
) from public,anon,authenticated;
revoke all on function public.request_cancel_zuvyr_task(uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.cancel_zuvyr_task_step(bigint,text,uuid,jsonb)
  from public,anon,authenticated;

grant execute on function public.zuvyr_permission_resource_owned(uuid,text,text)
  to service_role;
grant execute on function public.create_zuvyr_permission_grant(
  uuid,text,text,text,text,text,text,text,text,timestamptz,boolean,jsonb
) to service_role;

grant execute on function public.reserve_zuvyr_browser_agent_run_pack082(
  uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,integer
) to service_role;
grant execute on function public.transition_zuvyr_browser_agent_run_pack082(
  uuid,uuid,text,text,text,text
) to service_role;
grant execute on function public.reserve_zuvyr_browser_agent_action_pack082(
  uuid,uuid,text,text,text,jsonb,text,integer,text,text
) to service_role;
grant execute on function public.transition_zuvyr_browser_agent_action_pack082(
  uuid,uuid,text,text,uuid,uuid,uuid,jsonb,text
) to service_role;
grant execute on function public.request_stop_zuvyr_browser_agent_run_pack082(
  uuid,uuid,text
) to service_role;

grant execute on function public.defer_zuvyr_task_step_pack082(
  bigint,text,uuid,jsonb
) to service_role;
grant execute on function public.resume_zuvyr_task_step_pack082(
  uuid,uuid,bigint,jsonb
) to service_role;
grant execute on function public.request_cancel_zuvyr_task(uuid,uuid,text)
  to service_role;
grant execute on function public.cancel_zuvyr_task_step(bigint,text,uuid,jsonb)
  to service_role;



comment on table public.browser_agent_runs is
  'PACK082 owner-scoped Browser Agent runs linked to the canonical PACK081 browser session and optional durable task identity.';
comment on table public.browser_agent_actions is
  'PACK082 idempotent browser actions. Raw typed values are never persisted; only digest/length, scoped targets, permission lineage and consequence receipts are stored.';
comment on table public.browser_agent_reasoning_turns is
  'PACK082 idempotent AI reasoning receipts. Stores observation/action fingerprints and measured billing only; raw typed text and secrets are intentionally absent.';

