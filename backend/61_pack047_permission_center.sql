begin;

create table if not exists public.zuvyr_permission_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  action_class text not null check (action_class in (
    'project.read','project.write','dependency.install','runtime.execute',
    'preview.view','preview.open','network.egress','deploy.execute'
  )),
  grant_mode text not null check (grant_mode in ('allow_once','session','scoped')),
  scope_type text not null check (scope_type in ('project','project_session')),
  resource_namespace text not null check (resource_namespace in ('workspace_project','code_project')),
  resource_id text not null check (length(resource_id) between 1 and 200),
  session_id text null check (session_id is null or length(session_id) between 1 and 200),
  consequence_id text not null check (length(consequence_id) between 1 and 120),
  confirmation_fingerprint text not null check (confirmation_fingerprint ~ '^[0-9a-f]{64}$'),
  constraints jsonb not null default '{}'::jsonb check (jsonb_typeof(constraints) = 'object'),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  consumed_at timestamptz,
  last_used_at timestamptz,
  use_count integer not null default 0 check (use_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > issued_at),
  check ((scope_type = 'project' and session_id is null) or (scope_type = 'project_session' and session_id is not null)),
  check (grant_mode <> 'allow_once' or consumed_at is null or consumed_at >= issued_at)
);

create table if not exists public.zuvyr_permission_consumptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  grant_id uuid not null references public.zuvyr_permission_grants(id) on delete restrict,
  action_class text not null,
  request_id text not null check (length(request_id) between 1 and 200),
  resource_namespace text not null,
  resource_id text not null,
  session_id text,
  created_at timestamptz not null default now(),
  unique(owner_id, action_class, request_id)
);

create table if not exists public.zuvyr_permission_audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  grant_id uuid references public.zuvyr_permission_grants(id) on delete set null,
  action_class text not null check (length(action_class) between 1 and 120),
  event_type text not null check (event_type in ('grant_created','grant_revoked','allow','deny','replay_allow')),
  reason text not null check (length(reason) between 1 and 160),
  request_id text null check (request_id is null or length(request_id) between 1 and 200),
  resource_namespace text null,
  resource_id text null,
  session_id text null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists zuvyr_permission_grants_owner_active_idx
  on public.zuvyr_permission_grants(owner_id, action_class, expires_at desc)
  where revoked_at is null;
create index if not exists zuvyr_permission_grants_resource_idx
  on public.zuvyr_permission_grants(owner_id, resource_namespace, resource_id, session_id, action_class);
create index if not exists zuvyr_permission_consumptions_grant_idx
  on public.zuvyr_permission_consumptions(grant_id, created_at desc);
create index if not exists zuvyr_permission_audit_owner_created_idx
  on public.zuvyr_permission_audit_events(owner_id, created_at desc);
create index if not exists zuvyr_permission_audit_grant_idx
  on public.zuvyr_permission_audit_events(grant_id, created_at desc)
  where grant_id is not null;

alter table public.zuvyr_permission_grants enable row level security;
alter table public.zuvyr_permission_consumptions enable row level security;
alter table public.zuvyr_permission_audit_events enable row level security;

revoke all on table public.zuvyr_permission_grants from public, anon, authenticated;
revoke all on table public.zuvyr_permission_consumptions from public, anon, authenticated;
revoke all on table public.zuvyr_permission_audit_events from public, anon, authenticated;
grant select, insert, update on table public.zuvyr_permission_grants to service_role;
grant select, insert on table public.zuvyr_permission_consumptions to service_role;
grant select, insert on table public.zuvyr_permission_audit_events to service_role;

create or replace function public.zuvyr_permission_resource_owned(
  p_owner_id uuid,
  p_resource_namespace text,
  p_resource_id text
) returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
      where p.id = p_resource_id::uuid and p.owner_id = p_owner_id and p.archived_at is null
    );
  elsif p_resource_namespace = 'code_project' then
    return exists (
      select 1 from public.code_projects p
      where p.id = p_resource_id::uuid and p.owner_id = p_owner_id and p.status = 'active'
    );
  end if;
  return false;
end;
$$;

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
begin
  if p_explicit_consent is distinct from true then
    return jsonb_build_object('success',false,'error','permission_explicit_consent_required');
  end if;
  if v_action not in ('project.read','project.write','dependency.install','runtime.execute','preview.view','preview.open','network.egress','deploy.execute') then
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

  if v_action in ('project.read','project.write') then
    if v_mode = 'allow_once' then
      return jsonb_build_object('success',false,'error','permission_mode_action_mismatch');
    end if;
  else
    if v_ns <> 'code_project' or v_scope <> 'project_session' or v_session is null then
      return jsonb_build_object('success',false,'error','permission_scope_action_mismatch');
    end if;
  end if;

  if v_scope = 'project' and v_session is not null then
    return jsonb_build_object('success',false,'error','permission_session_not_allowed');
  end if;
  if v_scope = 'project_session' and v_session is null then
    return jsonb_build_object('success',false,'error','permission_session_required');
  end if;

  if v_action = 'deploy.execute' and v_mode <> 'allow_once' then
    return jsonb_build_object('success',false,'error','permission_deploy_allow_once_required');
  end if;
  if v_action in ('dependency.install','runtime.execute','preview.open','network.egress') and v_mode not in ('allow_once','session') then
    return jsonb_build_object('success',false,'error','permission_mode_action_mismatch');
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
    if jsonb_typeof(p_constraints->'allowedHosts') <> 'array' or jsonb_array_length(p_constraints->'allowedHosts') < 1 then
      return jsonb_build_object('success',false,'error','permission_network_hosts_required');
    end if;
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

create or replace function public.revoke_zuvyr_permission_grant(
  p_owner_id uuid,
  p_grant_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.zuvyr_permission_grants%rowtype;
begin
  select * into v from public.zuvyr_permission_grants
  where id = p_grant_id and owner_id = p_owner_id
  for update;
  if not found then
    return jsonb_build_object('success',false,'error','permission_grant_not_found');
  end if;
  if v.revoked_at is null then
    update public.zuvyr_permission_grants
      set revoked_at = now(), updated_at = now()
      where id = v.id;
    insert into public.zuvyr_permission_audit_events(
      owner_id, grant_id, action_class, event_type, reason,
      resource_namespace, resource_id, session_id
    ) values (
      p_owner_id, v.id, v.action_class, 'grant_revoked', 'user_revoked',
      v.resource_namespace, v.resource_id, v.session_id
    );
  end if;
  return jsonb_build_object('success',true,'grant_id',v.id,'revoked',true);
end;
$$;

create or replace function public.consume_zuvyr_permission_grant(
  p_owner_id uuid,
  p_action_class text,
  p_resource_namespace text,
  p_resource_id text,
  p_session_id text,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := lower(trim(coalesce(p_action_class,'')));
  v_ns text := lower(trim(coalesce(p_resource_namespace,'')));
  v_resource text := trim(coalesce(p_resource_id,''));
  v_session text := nullif(trim(coalesce(p_session_id,'')),'');
  v_request text := trim(coalesce(p_request_id,''));
  v_existing public.zuvyr_permission_consumptions%rowtype;
  v_grant public.zuvyr_permission_grants%rowtype;
  v_consumption_id uuid;
begin
  if v_request = '' or length(v_request) > 200 then
    return jsonb_build_object('success',false,'allowed',false,'error','invalid_permission_request_id');
  end if;

  select * into v_existing
  from public.zuvyr_permission_consumptions
  where owner_id = p_owner_id and action_class = v_action and request_id = v_request;
  if found then
    if v_existing.resource_namespace = v_ns
       and v_existing.resource_id = v_resource
       and coalesce(v_existing.session_id,'') = coalesce(v_session,'') then
      insert into public.zuvyr_permission_audit_events(
        owner_id, grant_id, action_class, event_type, reason, request_id,
        resource_namespace, resource_id, session_id
      ) values (
        p_owner_id, v_existing.grant_id, v_action, 'replay_allow', 'idempotent_request_replay', v_request,
        v_ns, v_resource, v_session
      );
      return jsonb_build_object('success',true,'allowed',true,'grant_id',v_existing.grant_id,'replayed',true);
    end if;
    insert into public.zuvyr_permission_audit_events(
      owner_id, action_class, event_type, reason, request_id,
      resource_namespace, resource_id, session_id
    ) values (
      p_owner_id, v_action, 'deny', 'request_scope_replay_mismatch', v_request,
      v_ns, v_resource, v_session
    );
    return jsonb_build_object('success',true,'allowed',false,'error','permission_request_scope_mismatch');
  end if;

  select * into v_grant
  from public.zuvyr_permission_grants g
  where g.owner_id = p_owner_id
    and g.action_class = v_action
    and g.resource_namespace = v_ns
    and g.resource_id = v_resource
    and g.revoked_at is null
    and g.expires_at > now()
    and (g.grant_mode <> 'allow_once' or g.consumed_at is null)
    and (
      (g.scope_type = 'project' and g.session_id is null)
      or
      (g.scope_type = 'project_session' and g.session_id = v_session)
    )
  order by
    case when g.scope_type = 'project_session' then 0 else 1 end,
    case when g.grant_mode = 'allow_once' then 0 when g.grant_mode = 'session' then 1 else 2 end,
    g.expires_at asc
  limit 1
  for update;

  if not found then
    select * into v_existing
    from public.zuvyr_permission_consumptions
    where owner_id = p_owner_id and action_class = v_action and request_id = v_request;
    if found and v_existing.resource_namespace = v_ns
       and v_existing.resource_id = v_resource
       and coalesce(v_existing.session_id,'') = coalesce(v_session,'') then
      return jsonb_build_object('success',true,'allowed',true,'grant_id',v_existing.grant_id,'replayed',true);
    end if;
    insert into public.zuvyr_permission_audit_events(
      owner_id, action_class, event_type, reason, request_id,
      resource_namespace, resource_id, session_id
    ) values (
      p_owner_id, v_action, 'deny', 'permission_required', v_request,
      v_ns, v_resource, v_session
    );
    return jsonb_build_object('success',true,'allowed',false,'error','permission_required');
  end if;

  insert into public.zuvyr_permission_consumptions(
    owner_id, grant_id, action_class, request_id, resource_namespace, resource_id, session_id
  ) values (
    p_owner_id, v_grant.id, v_action, v_request, v_ns, v_resource, v_session
  )
  on conflict (owner_id, action_class, request_id) do nothing
  returning id into v_consumption_id;

  if v_consumption_id is null then
    select * into v_existing
    from public.zuvyr_permission_consumptions
    where owner_id = p_owner_id and action_class = v_action and request_id = v_request;
    if found and v_existing.resource_namespace = v_ns
       and v_existing.resource_id = v_resource
       and coalesce(v_existing.session_id,'') = coalesce(v_session,'') then
      return jsonb_build_object('success',true,'allowed',true,'grant_id',v_existing.grant_id,'replayed',true);
    end if;
    return jsonb_build_object('success',true,'allowed',false,'error','permission_request_scope_mismatch');
  end if;

  update public.zuvyr_permission_grants
    set consumed_at = case when grant_mode = 'allow_once' then now() else consumed_at end,
        last_used_at = now(),
        use_count = use_count + 1,
        updated_at = now()
    where id = v_grant.id;

  insert into public.zuvyr_permission_audit_events(
    owner_id, grant_id, action_class, event_type, reason, request_id,
    resource_namespace, resource_id, session_id,
    metadata
  ) values (
    p_owner_id, v_grant.id, v_action, 'allow', 'active_grant', v_request,
    v_ns, v_resource, v_session,
    jsonb_build_object('grantMode',v_grant.grant_mode,'scopeType',v_grant.scope_type)
  );

  return jsonb_build_object('success',true,'allowed',true,'grant_id',v_grant.id,'replayed',false,'grant_mode',v_grant.grant_mode);
end;
$$;

revoke all on function public.zuvyr_permission_resource_owned(uuid,text,text) from public, anon, authenticated;
revoke all on function public.create_zuvyr_permission_grant(uuid,text,text,text,text,text,text,text,text,timestamptz,boolean,jsonb) from public, anon, authenticated;
revoke all on function public.revoke_zuvyr_permission_grant(uuid,uuid) from public, anon, authenticated;
revoke all on function public.consume_zuvyr_permission_grant(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.zuvyr_permission_resource_owned(uuid,text,text) to service_role;
grant execute on function public.create_zuvyr_permission_grant(uuid,text,text,text,text,text,text,text,text,timestamptz,boolean,jsonb) to service_role;
grant execute on function public.revoke_zuvyr_permission_grant(uuid,uuid) to service_role;
grant execute on function public.consume_zuvyr_permission_grant(uuid,text,text,text,text,text) to service_role;

commit;
