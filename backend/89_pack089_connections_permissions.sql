-- ZUVYR V1 PACK089 / 89A — Connections, Vault, Skills, Permission Center
-- Additive on top of PACK047/PACK082/PACK095. No client-readable secrets.

begin;

alter table public.workspace_plugin_connections
  add column if not exists plugin_kind text not null default 'plugin',
  add column if not exists display_name text,
  add column if not exists manifest jsonb not null default '{}'::jsonb,
  add column if not exists endpoint_url text,
  add column if not exists credential_secret_id uuid,
  add column if not exists status text not null default 'draft',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists revoked_at timestamptz,
  add column if not exists last_error_code text;

alter table public.workspace_plugin_connections
  drop constraint if exists workspace_plugin_connections_plugin_kind_check;
alter table public.workspace_plugin_connections
  add constraint workspace_plugin_connections_plugin_kind_check
  check (plugin_kind in ('plugin','mcp'));

alter table public.workspace_plugin_connections
  drop constraint if exists workspace_plugin_connections_status_check;
alter table public.workspace_plugin_connections
  add constraint workspace_plugin_connections_status_check
  check (status in ('draft','pending','active','revoked','error'));

alter table public.workspace_plugin_connections
  drop constraint if exists workspace_plugin_connections_manifest_check;
alter table public.workspace_plugin_connections
  add constraint workspace_plugin_connections_manifest_check
  check (jsonb_typeof(manifest)='object');

alter table public.workspace_plugin_connections
  drop constraint if exists workspace_plugin_connections_revoked_state_check;
alter table public.workspace_plugin_connections
  add constraint workspace_plugin_connections_revoked_state_check
  check (status <> 'revoked' or (installed=false and runtime_enabled=false and revoked_at is not null));

alter table public.workspace_integration_connections
  add column if not exists credential_secret_id uuid,
  add column if not exists status text not null default 'draft',
  add column if not exists provider_subject text,
  add column if not exists account_label text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists refresh_token_present boolean not null default false,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists revoked_at timestamptz,
  add column if not exists last_error_code text;

alter table public.workspace_integration_connections
  drop constraint if exists workspace_integration_connections_status_check;
alter table public.workspace_integration_connections
  add constraint workspace_integration_connections_status_check
  check (status in ('draft','pending','active','revoked','error'));

alter table public.workspace_integration_connections
  drop constraint if exists workspace_integration_connections_revoked_state_check;
alter table public.workspace_integration_connections
  add constraint workspace_integration_connections_revoked_state_check
  check (
    status <> 'revoked'
    or (
      connected=false
      and read_enabled=false
      and write_enabled=false
      and revoked_at is not null
    )
  );

create table if not exists public.workspace_oauth_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null references public.workspace_integration_connections(id) on delete cascade,
  provider text not null check (provider in ('google_drive')),
  state_hash text not null unique check (state_hash ~ '^[0-9a-f]{64}$'),
  pkce_verifier_secret_id uuid not null,
  redirect_uri text not null check (char_length(redirect_uri) between 8 and 2048),
  requested_scopes text[] not null check (
    cardinality(requested_scopes) between 1 and 12
    and not ('*' = any(requested_scopes))
  ),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at)
);

create table if not exists public.workspace_skills (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  instructions text not null check (char_length(instructions) between 1 and 12000),
  tool_keys text[] not null default '{}'::text[] check (
    cardinality(tool_keys) between 0 and 32
    and not ('*' = any(tool_keys))
  ),
  status text not null default 'active' check (status in ('active','disabled')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='active' and enabled=true) or (status='disabled' and enabled=false))
);

create index if not exists workspace_plugin_connections_owner_status_idx
  on public.workspace_plugin_connections(owner_id,status,updated_at desc);
create index if not exists workspace_integration_connections_owner_status_idx
  on public.workspace_integration_connections(owner_id,status,updated_at desc);
create index if not exists workspace_oauth_sessions_connection_created_idx
  on public.workspace_oauth_sessions(connection_id,created_at desc);
create index if not exists workspace_oauth_sessions_expiry_idx
  on public.workspace_oauth_sessions(expires_at)
  where consumed_at is null;
create index if not exists workspace_skills_owner_updated_idx
  on public.workspace_skills(owner_id,updated_at desc);
create unique index if not exists workspace_skills_owner_name_uq
  on public.workspace_skills(owner_id,lower(name));

alter table public.workspace_oauth_sessions enable row level security;
alter table public.workspace_skills enable row level security;

revoke all on public.workspace_oauth_sessions from public,anon,authenticated;
revoke all on public.workspace_skills from public,anon,authenticated;
grant select,insert,update,delete on public.workspace_oauth_sessions to service_role;
grant select,insert,update,delete on public.workspace_skills to service_role;

-- PACK089 extends the existing Permission Center rather than creating a parallel grant system.
alter table public.zuvyr_permission_grants
  drop constraint if exists zuvyr_permission_grants_action_class_check;
alter table public.zuvyr_permission_grants
  add constraint zuvyr_permission_grants_action_class_check
  check (action_class in (
    'project.read','project.write',
    'dependency.install','runtime.execute',
    'preview.view','preview.open','network.egress',
    'deploy.execute','deploy.rollback',
    'browser.interact','browser.input','browser.submit','browser.upload',
    'connection.read','connection.write',
    'plugin.install','plugin.invoke','mcp.invoke'
  ));

alter table public.zuvyr_permission_grants
  drop constraint if exists zuvyr_permission_grants_scope_type_check;
alter table public.zuvyr_permission_grants
  add constraint zuvyr_permission_grants_scope_type_check
  check (scope_type in ('project','project_session','resource','resource_session'));

alter table public.zuvyr_permission_grants
  drop constraint if exists zuvyr_permission_grants_resource_namespace_check;
alter table public.zuvyr_permission_grants
  add constraint zuvyr_permission_grants_resource_namespace_check
  check (resource_namespace in (
    'workspace_project','code_project','browser_session',
    'integration_connection','plugin_connection'
  ));

alter table public.zuvyr_permission_grants
  drop constraint if exists zuvyr_permission_grants_check1;
alter table public.zuvyr_permission_grants
  add constraint zuvyr_permission_grants_check1
  check (
    (scope_type in ('project','resource') and session_id is null)
    or
    (scope_type in ('project_session','resource_session') and session_id is not null)
  );

create or replace function public.zuvyr_permission_resource_owned(
  p_owner_id uuid,
  p_resource_namespace text,
  p_resource_id text
) returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $pack089_owned$
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
      where p.id=p_resource_id::uuid
        and p.owner_id=p_owner_id
        and p.archived_at is null
    );
  elsif p_resource_namespace = 'code_project' then
    return exists (
      select 1 from public.code_projects p
      where p.id=p_resource_id::uuid
        and p.owner_id=p_owner_id
        and p.status='active'
    );
  elsif p_resource_namespace = 'browser_session' then
    return exists (
      select 1 from public.browser_sessions s
      where s.id=p_resource_id::uuid
        and s.owner_id=p_owner_id
        and s.status in ('running','detached')
    );
  elsif p_resource_namespace = 'integration_connection' then
    return exists (
      select 1 from public.workspace_integration_connections c
      where c.id=p_resource_id::uuid
        and c.owner_id=p_owner_id
        and c.status <> 'revoked'
    );
  elsif p_resource_namespace = 'plugin_connection' then
    return exists (
      select 1 from public.workspace_plugin_connections c
      where c.id=p_resource_id::uuid
        and c.owner_id=p_owner_id
        and c.status <> 'revoked'
    );
  end if;
  return false;
end;
$pack089_owned$;

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
as $pack089_permission_grant$
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
  v_tool_key text;
  v_operation_fp text;
begin
  if p_explicit_consent is distinct from true then
    return jsonb_build_object('success',false,'error','permission_explicit_consent_required');
  end if;

  if v_action not in (
    'project.read','project.write',
    'dependency.install','runtime.execute',
    'preview.view','preview.open','network.egress',
    'deploy.execute','deploy.rollback',
    'browser.interact','browser.input','browser.submit','browser.upload',
    'connection.read','connection.write',
    'plugin.install','plugin.invoke','mcp.invoke'
  ) then
    return jsonb_build_object('success',false,'error','invalid_permission_action');
  end if;

  if v_mode not in ('allow_once','session','scoped') then
    return jsonb_build_object('success',false,'error','invalid_permission_grant_mode');
  end if;
  if v_scope not in ('project','project_session','resource','resource_session') then
    return jsonb_build_object('success',false,'error','invalid_permission_scope');
  end if;
  if v_ns not in (
    'workspace_project','code_project','browser_session',
    'integration_connection','plugin_connection'
  ) then
    return jsonb_build_object('success',false,'error','invalid_permission_resource_namespace');
  end if;
  if not public.zuvyr_permission_resource_owned(p_owner_id,v_ns,v_resource) then
    return jsonb_build_object('success',false,'error','permission_resource_not_owned');
  end if;

  if v_mode='allow_once' and v_scope not in ('project_session','resource_session') then
    return jsonb_build_object('success',false,'error','permission_mode_scope_mismatch');
  end if;
  if v_mode='session' and v_scope not in ('project_session','resource_session') then
    return jsonb_build_object('success',false,'error','permission_mode_scope_mismatch');
  end if;
  if v_mode='scoped' and v_scope not in ('project','resource') then
    return jsonb_build_object('success',false,'error','permission_mode_scope_mismatch');
  end if;
  if v_scope in ('project','resource') and v_session is not null then
    return jsonb_build_object('success',false,'error','permission_session_not_allowed');
  end if;
  if v_scope in ('project_session','resource_session') and v_session is null then
    return jsonb_build_object('success',false,'error','permission_session_required');
  end if;

  if v_action in ('project.read','project.write') then
    if v_ns not in ('workspace_project','code_project')
       or v_scope not in ('project','project_session')
       or v_mode not in ('session','scoped') then
      return jsonb_build_object('success',false,'error','permission_scope_action_mismatch');
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
  elsif v_action in (
    'dependency.install','runtime.execute',
    'preview.view','preview.open','network.egress',
    'deploy.execute','deploy.rollback'
  ) then
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
  elsif v_action='connection.read' then
    if v_ns <> 'integration_connection'
       or v_scope not in ('resource','resource_session')
       or v_mode not in ('session','scoped') then
      return jsonb_build_object('success',false,'error','permission_scope_action_mismatch');
    end if;
  elsif v_action='connection.write' then
    if v_ns <> 'integration_connection'
       or v_scope <> 'resource_session'
       or v_mode not in ('allow_once','session') then
      return jsonb_build_object('success',false,'error','permission_scope_action_mismatch');
    end if;
  elsif v_action='plugin.install' then
    if v_ns <> 'plugin_connection'
       or v_scope <> 'resource_session'
       or v_mode <> 'allow_once' then
      return jsonb_build_object('success',false,'error','permission_scope_action_mismatch');
    end if;
  elsif v_action in ('plugin.invoke','mcp.invoke') then
    if v_ns <> 'plugin_connection'
       or v_scope <> 'resource_session'
       or v_mode not in ('allow_once','session') then
      return jsonb_build_object('success',false,'error','permission_scope_action_mismatch');
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
    when 'connection.read' then 86400
    when 'connection.write' then 900
    when 'plugin.install' then 600
    when 'plugin.invoke' then 1800
    when 'mcp.invoke' then 1800
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
     or p_expires_at > now() + make_interval(secs=>v_max_seconds) then
    return jsonb_build_object('success',false,'error','permission_expiry_invalid');
  end if;
  if coalesce(jsonb_typeof(p_constraints),'') <> 'object' then
    return jsonb_build_object('success',false,'error','invalid_permission_constraints');
  end if;

  if v_action='network.egress' then
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
      if v_host='' or v_host='*' or length(v_host)>253
         or position('.' in v_host)=0
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
    if not (p_constraints ? 'host') then
      return jsonb_build_object('success',false,'error','permission_browser_host_required');
    end if;
    v_host := lower(trim(coalesce(p_constraints->>'host','')));
    if v_host=''
       or v_host='*'
       or length(v_host)>253
       or position('.' in v_host)=0
       or v_host !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'
       or v_host in (
         'localhost','0.0.0.0','127.0.0.1',
         'host.docker.internal','metadata.google.internal'
       )
       or v_host like '%.localhost'
       or v_host like '%.local'
       or v_host like '%.internal'
       or v_host ~ '^10\.'
       or v_host ~ '^192\.168\.'
       or v_host ~ '^172\.(1[6-9]|2[0-9]|3[01])\.'
       or v_host ~ '^169\.254\.' then
      return jsonb_build_object('success',false,'error','permission_browser_host_invalid');
    end if;
    if not (p_constraints ? 'actionFingerprint')
       or coalesce(p_constraints->>'actionFingerprint','') !~ '^[0-9a-f]{64}$' then
      return jsonb_build_object('success',false,'error','permission_browser_action_fingerprint_required');
    end if;
  end if;

  if v_action in ('connection.write','plugin.install','plugin.invoke','mcp.invoke') then
    v_operation_fp := lower(trim(coalesce(p_constraints->>'operationFingerprint','')));
    if v_operation_fp !~ '^[0-9a-f]{64}$' then
      return jsonb_build_object('success',false,'error','permission_operation_fingerprint_required');
    end if;
  end if;

  if v_action in ('plugin.invoke','mcp.invoke') then
    v_tool_key := trim(coalesce(p_constraints->>'toolKey',''));
    if v_tool_key='' or length(v_tool_key)>200 or v_tool_key='*' then
      return jsonb_build_object('success',false,'error','permission_tool_key_required');
    end if;
  end if;

  insert into public.zuvyr_permission_grants(
    owner_id,action_class,grant_mode,scope_type,
    resource_namespace,resource_id,session_id,
    consequence_id,confirmation_fingerprint,
    constraints,expires_at
  ) values (
    p_owner_id,v_action,v_mode,v_scope,
    v_ns,v_resource,v_session,
    v_consequence,v_fp,
    coalesce(p_constraints,'{}'::jsonb),p_expires_at
  )
  returning id into v_id;

  insert into public.zuvyr_permission_audit_events(
    owner_id,grant_id,action_class,event_type,reason,
    resource_namespace,resource_id,session_id,metadata
  ) values (
    p_owner_id,v_id,v_action,'grant_created','explicit_confirmation',
    v_ns,v_resource,v_session,
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
$pack089_permission_grant$;

create or replace function public.create_workspace_oauth_session_pack089(
  p_owner_id uuid,
  p_connection_id uuid,
  p_state_hash text,
  p_pkce_verifier text,
  p_redirect_uri text,
  p_requested_scopes text[],
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_oauth_create$
declare
  v_connection public.workspace_integration_connections%rowtype;
  v_session_id uuid := gen_random_uuid();
  v_secret_id uuid;
begin
  select * into v_connection
  from public.workspace_integration_connections
  where id=p_connection_id and owner_id=p_owner_id
  for update;

  if not found or v_connection.integration_key <> 'google_drive' then
    raise exception 'pack089_integration_connection_not_found';
  end if;
  if v_connection.status='revoked' then
    raise exception 'pack089_integration_connection_revoked';
  end if;
  if p_state_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'pack089_oauth_state_hash_invalid';
  end if;
  if char_length(coalesce(p_pkce_verifier,'')) not between 43 and 128 then
    raise exception 'pack089_pkce_verifier_invalid';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now()+interval '15 minutes' then
    raise exception 'pack089_oauth_expiry_invalid';
  end if;
  if cardinality(p_requested_scopes) < 1 or cardinality(p_requested_scopes) > 12 or '*'=any(p_requested_scopes) then
    raise exception 'pack089_oauth_scopes_invalid';
  end if;

  select vault.create_secret(
    p_pkce_verifier,
    'zuvyr_pack089_pkce_' || replace(v_session_id::text,'-',''),
    'ZUVYR PACK089 OAuth PKCE verifier',
    null
  ) into v_secret_id;

  insert into public.workspace_oauth_sessions(
    id,owner_id,connection_id,provider,state_hash,
    pkce_verifier_secret_id,redirect_uri,requested_scopes,expires_at
  ) values (
    v_session_id,p_owner_id,p_connection_id,'google_drive',lower(p_state_hash),
    v_secret_id,p_redirect_uri,p_requested_scopes,p_expires_at
  );

  update public.workspace_integration_connections
  set status='pending',last_error_code=null,updated_at=now()
  where id=p_connection_id;

  insert into public.workspace_audit_events(owner_id,event_type,details,external_write_executed)
  values (
    p_owner_id,
    'integration_oauth_started',
    jsonb_build_object('connectionId',p_connection_id,'integration','google_drive'),
    false
  );

  return jsonb_build_object(
    'session_id',v_session_id,
    'connection_id',p_connection_id,
    'expires_at',p_expires_at
  );
end;
$pack089_oauth_create$;

create or replace function public.consume_workspace_oauth_session_pack089(
  p_state_hash text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_oauth_consume$
declare
  v_session public.workspace_oauth_sessions%rowtype;
  v_verifier text;
begin
  select s.* into v_session
  from public.workspace_oauth_sessions s
  join public.workspace_integration_connections c
    on c.id=s.connection_id
   and c.owner_id=s.owner_id
  where s.state_hash=lower(trim(coalesce(p_state_hash,'')))
    and s.consumed_at is null
    and s.expires_at > now()
    and c.status <> 'revoked'
    and c.revoked_at is null
  for update of s;

  if not found then
    raise exception 'pack089_oauth_session_invalid';
  end if;

  select decrypted_secret into v_verifier
  from vault.decrypted_secrets
  where id=v_session.pkce_verifier_secret_id;

  if v_verifier is null then
    raise exception 'pack089_pkce_verifier_missing';
  end if;

  update public.workspace_oauth_sessions
  set consumed_at=now()
  where id=v_session.id;

  delete from vault.secrets where id=v_session.pkce_verifier_secret_id;

  return jsonb_build_object(
    'session_id',v_session.id,
    'owner_id',v_session.owner_id,
    'connection_id',v_session.connection_id,
    'provider',v_session.provider,
    'redirect_uri',v_session.redirect_uri,
    'requested_scopes',to_jsonb(v_session.requested_scopes),
    'pkce_verifier',v_verifier
  );
end;
$pack089_oauth_consume$;

create or replace function public.set_workspace_integration_secret_pack089(
  p_owner_id uuid,
  p_connection_id uuid,
  p_secret text,
  p_token_expires_at timestamptz,
  p_provider_subject text,
  p_account_label text,
  p_scopes text[]
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_integration_secret$
declare
  v_connection public.workspace_integration_connections%rowtype;
  v_secret_id uuid;
  v_secret_name text;
  v_read boolean;
  v_write boolean;
begin
  if char_length(coalesce(p_secret,'')) not between 2 and 32000 then
    raise exception 'pack089_integration_secret_invalid';
  end if;

  select * into v_connection
  from public.workspace_integration_connections
  where id=p_connection_id and owner_id=p_owner_id
  for update;

  if not found or v_connection.status='revoked' then
    raise exception 'pack089_integration_connection_not_found';
  end if;
  if cardinality(p_scopes) < 1 or cardinality(p_scopes) > 12 or '*'=any(p_scopes) then
    raise exception 'pack089_integration_scopes_invalid';
  end if;

  v_secret_name := 'zuvyr_pack089_integration_' || replace(p_connection_id::text,'-','');
  if v_connection.credential_secret_id is null then
    select vault.create_secret(
      p_secret,v_secret_name,'ZUVYR PACK089 integration credential',null
    ) into v_secret_id;
  else
    v_secret_id := v_connection.credential_secret_id;
    perform vault.update_secret(
      v_secret_id,p_secret,v_secret_name,'ZUVYR PACK089 integration credential',null
    );
  end if;

  v_read := ('drive.file.read'=any(p_scopes) or 'drive.export'=any(p_scopes));
  v_write := ('drive.file.write'=any(p_scopes));

  update public.workspace_integration_connections
  set credential_secret_id=v_secret_id,
      scopes=p_scopes,
      status='active',
      connected=true,
      read_enabled=v_read,
      write_enabled=v_write,
      provider_subject=nullif(trim(coalesce(p_provider_subject,'')),''),
      account_label=nullif(trim(coalesce(p_account_label,'')),''),
      token_expires_at=p_token_expires_at,
      refresh_token_present=(p_secret like '%"refresh_token"%'),
      revoked_at=null,
      last_error_code=null,
      updated_at=now()
  where id=p_connection_id;

  insert into public.workspace_audit_events(owner_id,event_type,details,external_write_executed)
  values (
    p_owner_id,
    'integration_connected',
    jsonb_build_object(
      'connectionId',p_connection_id,
      'integration',v_connection.integration_key,
      'scopes',to_jsonb(p_scopes)
    ),
    false
  );

  return jsonb_build_object(
    'connection_id',p_connection_id,
    'credential_configured',true,
    'status','active',
    'read_enabled',v_read,
    'write_enabled',v_write
  );
end;
$pack089_integration_secret$;

create or replace function public.get_workspace_integration_secret_pack089(
  p_owner_id uuid,
  p_connection_id uuid
) returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_integration_secret_get$
declare
  v_secret_id uuid;
  v_secret text;
begin
  select credential_secret_id into v_secret_id
  from public.workspace_integration_connections
  where id=p_connection_id
    and owner_id=p_owner_id
    and status='active'
    and connected=true
    and revoked_at is null;

  if v_secret_id is null then
    return null;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where id=v_secret_id;

  return v_secret;
end;
$pack089_integration_secret_get$;

create or replace function public.set_workspace_plugin_secret_pack089(
  p_owner_id uuid,
  p_connection_id uuid,
  p_secret text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_plugin_secret$
declare
  v_connection public.workspace_plugin_connections%rowtype;
  v_secret_id uuid;
  v_secret_name text;
begin
  if char_length(coalesce(p_secret,'')) not between 1 and 32000 then
    raise exception 'pack089_plugin_secret_invalid';
  end if;

  select * into v_connection
  from public.workspace_plugin_connections
  where id=p_connection_id and owner_id=p_owner_id
  for update;

  if not found or v_connection.status='revoked' then
    raise exception 'pack089_plugin_connection_not_found';
  end if;

  v_secret_name := 'zuvyr_pack089_plugin_' || replace(p_connection_id::text,'-','');
  if v_connection.credential_secret_id is null then
    select vault.create_secret(
      p_secret,v_secret_name,'ZUVYR PACK089 plugin/MCP credential',null
    ) into v_secret_id;
  else
    v_secret_id := v_connection.credential_secret_id;
    perform vault.update_secret(
      v_secret_id,p_secret,v_secret_name,'ZUVYR PACK089 plugin/MCP credential',null
    );
  end if;

  update public.workspace_plugin_connections
  set credential_secret_id=v_secret_id,updated_at=now(),last_error_code=null
  where id=p_connection_id;

  return jsonb_build_object(
    'connection_id',p_connection_id,
    'credential_configured',true
  );
end;
$pack089_plugin_secret$;

create or replace function public.get_workspace_plugin_secret_pack089(
  p_owner_id uuid,
  p_connection_id uuid
) returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_plugin_secret_get$
declare
  v_secret_id uuid;
  v_secret text;
begin
  select credential_secret_id into v_secret_id
  from public.workspace_plugin_connections
  where id=p_connection_id
    and owner_id=p_owner_id
    and status='active'
    and installed=true
    and runtime_enabled=true
    and revoked_at is null;

  if v_secret_id is null then
    return null;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where id=v_secret_id;

  return v_secret;
end;
$pack089_plugin_secret_get$;

create or replace function public.revoke_workspace_integration_connection_pack089(
  p_owner_id uuid,
  p_connection_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_integration_revoke$
declare
  v_connection public.workspace_integration_connections%rowtype;
  v_grants integer;
begin
  select * into v_connection
  from public.workspace_integration_connections
  where id=p_connection_id and owner_id=p_owner_id
  for update;

  if not found then
    raise exception 'pack089_integration_connection_not_found';
  end if;

  update public.workspace_integration_connections
  set status='revoked',
      connected=false,
      read_enabled=false,
      write_enabled=false,
      credential_secret_id=null,
      refresh_token_present=false,
      token_expires_at=null,
      revoked_at=coalesce(revoked_at,now()),
      updated_at=now()
  where id=p_connection_id;

  update public.zuvyr_permission_grants
  set revoked_at=coalesce(revoked_at,now()),updated_at=now()
  where owner_id=p_owner_id
    and resource_namespace='integration_connection'
    and resource_id=p_connection_id::text
    and revoked_at is null;
  get diagnostics v_grants = row_count;

  delete from vault.secrets
  where id in (
    select s.pkce_verifier_secret_id
    from public.workspace_oauth_sessions s
    where s.connection_id=p_connection_id
      and s.owner_id=p_owner_id
      and s.consumed_at is null
  );

  update public.workspace_oauth_sessions
  set consumed_at=coalesce(consumed_at,now())
  where connection_id=p_connection_id
    and owner_id=p_owner_id
    and consumed_at is null;

  if v_connection.credential_secret_id is not null then
    delete from vault.secrets where id=v_connection.credential_secret_id;
  end if;

  insert into public.workspace_audit_events(owner_id,event_type,details,external_write_executed)
  values (
    p_owner_id,
    'integration_revoked',
    jsonb_build_object('connectionId',p_connection_id,'revokedPermissionGrants',v_grants),
    false
  );

  return jsonb_build_object(
    'connection_id',p_connection_id,
    'status','revoked',
    'revoked_permission_grants',v_grants,
    'credential_deleted',v_connection.credential_secret_id is not null
  );
end;
$pack089_integration_revoke$;

create or replace function public.revoke_workspace_plugin_connection_pack089(
  p_owner_id uuid,
  p_connection_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_plugin_revoke$
declare
  v_connection public.workspace_plugin_connections%rowtype;
  v_grants integer;
begin
  select * into v_connection
  from public.workspace_plugin_connections
  where id=p_connection_id and owner_id=p_owner_id
  for update;

  if not found then
    raise exception 'pack089_plugin_connection_not_found';
  end if;

  update public.workspace_plugin_connections
  set status='revoked',
      installed=false,
      runtime_enabled=false,
      credential_secret_id=null,
      revoked_at=coalesce(revoked_at,now()),
      updated_at=now()
  where id=p_connection_id;

  update public.zuvyr_permission_grants
  set revoked_at=coalesce(revoked_at,now()),updated_at=now()
  where owner_id=p_owner_id
    and resource_namespace='plugin_connection'
    and resource_id=p_connection_id::text
    and revoked_at is null;
  get diagnostics v_grants = row_count;

  if v_connection.credential_secret_id is not null then
    delete from vault.secrets where id=v_connection.credential_secret_id;
  end if;

  insert into public.workspace_audit_events(owner_id,event_type,details,external_write_executed)
  values (
    p_owner_id,
    'plugin_revoked',
    jsonb_build_object('connectionId',p_connection_id,'revokedPermissionGrants',v_grants),
    false
  );

  return jsonb_build_object(
    'connection_id',p_connection_id,
    'status','revoked',
    'revoked_permission_grants',v_grants,
    'credential_deleted',v_connection.credential_secret_id is not null
  );
end;
$pack089_plugin_revoke$;

revoke all on function public.create_workspace_oauth_session_pack089(uuid,uuid,text,text,text,text[],timestamptz) from public,anon,authenticated;
revoke all on function public.consume_workspace_oauth_session_pack089(text) from public,anon,authenticated;
revoke all on function public.set_workspace_integration_secret_pack089(uuid,uuid,text,timestamptz,text,text,text[]) from public,anon,authenticated;
revoke all on function public.get_workspace_integration_secret_pack089(uuid,uuid) from public,anon,authenticated;
revoke all on function public.set_workspace_plugin_secret_pack089(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.get_workspace_plugin_secret_pack089(uuid,uuid) from public,anon,authenticated;
revoke all on function public.revoke_workspace_integration_connection_pack089(uuid,uuid) from public,anon,authenticated;
revoke all on function public.revoke_workspace_plugin_connection_pack089(uuid,uuid) from public,anon,authenticated;

grant execute on function public.create_workspace_oauth_session_pack089(uuid,uuid,text,text,text,text[],timestamptz) to service_role;
grant execute on function public.consume_workspace_oauth_session_pack089(text) to service_role;
grant execute on function public.set_workspace_integration_secret_pack089(uuid,uuid,text,timestamptz,text,text,text[]) to service_role;
grant execute on function public.get_workspace_integration_secret_pack089(uuid,uuid) to service_role;
grant execute on function public.set_workspace_plugin_secret_pack089(uuid,uuid,text) to service_role;
grant execute on function public.get_workspace_plugin_secret_pack089(uuid,uuid) to service_role;
grant execute on function public.revoke_workspace_integration_connection_pack089(uuid,uuid) to service_role;
grant execute on function public.revoke_workspace_plugin_connection_pack089(uuid,uuid) to service_role;

comment on table public.workspace_oauth_sessions is
  'PACK089 durable OAuth state. Raw state is never stored; PKCE verifier is stored only in Supabase Vault.';
comment on table public.workspace_skills is
  'PACK089 owner-scoped declarative Skills. Instructions/tool references only; no executable third-party code.';
comment on column public.workspace_integration_connections.credential_secret_id is
  'Supabase Vault secret UUID only. Plaintext OAuth credentials must never be stored here.';
comment on column public.workspace_plugin_connections.credential_secret_id is
  'Supabase Vault secret UUID only. Plaintext plugin/MCP credentials must never be stored here.';

commit;
