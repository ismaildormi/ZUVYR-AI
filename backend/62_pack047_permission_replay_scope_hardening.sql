begin;

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
    if v_action = 'deploy.execute' and v_mode <> 'allow_once' then
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
        p_owner_id, v_existing.grant_id, v_action, 'deny', 'idempotent_request_replay', v_request,
        v_ns, v_resource, v_session
      );
      return jsonb_build_object('success',true,'allowed',false,'grant_id',v_existing.grant_id,'replayed',true,'error','permission_request_replayed');
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
      insert into public.zuvyr_permission_audit_events(
        owner_id, grant_id, action_class, event_type, reason, request_id,
        resource_namespace, resource_id, session_id
      ) values (
        p_owner_id, v_existing.grant_id, v_action, 'deny', 'idempotent_request_replay', v_request,
        v_ns, v_resource, v_session
      );
      return jsonb_build_object('success',true,'allowed',false,'grant_id',v_existing.grant_id,'replayed',true,'error','permission_request_replayed');
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
      insert into public.zuvyr_permission_audit_events(
        owner_id, grant_id, action_class, event_type, reason, request_id,
        resource_namespace, resource_id, session_id
      ) values (
        p_owner_id, v_existing.grant_id, v_action, 'deny', 'idempotent_request_replay', v_request,
        v_ns, v_resource, v_session
      );
      return jsonb_build_object('success',true,'allowed',false,'grant_id',v_existing.grant_id,'replayed',true,'error','permission_request_replayed');
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

  return jsonb_build_object(
    'success',true,'allowed',true,'grant_id',v_grant.id,'replayed',false,
    'grant_mode',v_grant.grant_mode,'constraints',v_grant.constraints
  );
end;
$$;

revoke all on function public.create_zuvyr_permission_grant(uuid,text,text,text,text,text,text,text,text,timestamptz,boolean,jsonb) from public, anon, authenticated;
revoke all on function public.consume_zuvyr_permission_grant(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_zuvyr_permission_grant(uuid,text,text,text,text,text,text,text,text,timestamptz,boolean,jsonb) to service_role;
grant execute on function public.consume_zuvyr_permission_grant(uuid,text,text,text,text,text) to service_role;

commit;
