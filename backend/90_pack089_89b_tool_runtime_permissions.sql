-- ZUVYR V1 PACK089 / 89B — exact tool permission consumption + plugin activation
-- Preserves the legacy Permission Center consume RPC for all prior PACKs.

begin;

create or replace function public.consume_workspace_tool_permission_pack089(
  p_owner_id uuid,
  p_action_class text,
  p_connection_id uuid,
  p_session_id text,
  p_request_id text,
  p_tool_key text,
  p_operation_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_tool_consume$
declare
  v_action text := lower(trim(coalesce(p_action_class,'')));
  v_session text := nullif(trim(coalesce(p_session_id,'')),'');
  v_request text := trim(coalesce(p_request_id,''));
  v_tool text := lower(trim(coalesce(p_tool_key,'')));
  v_fp text := lower(trim(coalesce(p_operation_fingerprint,'')));
  v_existing public.zuvyr_permission_consumptions%rowtype;
  v_grant public.zuvyr_permission_grants%rowtype;
  v_consumption_id uuid;
begin
  if v_action not in ('plugin.install','plugin.invoke','mcp.invoke') then
    return jsonb_build_object('success',false,'allowed',false,'error','invalid_workspace_tool_permission_action');
  end if;
  if v_request='' or length(v_request)>200 then
    return jsonb_build_object('success',false,'allowed',false,'error','invalid_permission_request_id');
  end if;
  if v_session is null or length(v_session)>200 then
    return jsonb_build_object('success',false,'allowed',false,'error','permission_session_required');
  end if;
  if v_fp !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('success',false,'allowed',false,'error','permission_operation_fingerprint_required');
  end if;
  if v_action in ('plugin.invoke','mcp.invoke') then
    if v_tool='' or v_tool='*' or length(v_tool)>200 then
      return jsonb_build_object('success',false,'allowed',false,'error','permission_tool_key_required');
    end if;
  else
    v_tool := '';
  end if;

  if not exists (
    select 1 from public.workspace_plugin_connections c
    where c.id=p_connection_id
      and c.owner_id=p_owner_id
      and c.status <> 'revoked'
  ) then
    return jsonb_build_object('success',true,'allowed',false,'error','permission_resource_not_owned');
  end if;

  select * into v_existing
  from public.zuvyr_permission_consumptions
  where owner_id=p_owner_id
    and action_class=v_action
    and request_id=v_request;

  if found then
    insert into public.zuvyr_permission_audit_events(
      owner_id,grant_id,action_class,event_type,reason,request_id,
      resource_namespace,resource_id,session_id,metadata
    ) values (
      p_owner_id,v_existing.grant_id,v_action,'deny',
      case
        when v_existing.resource_namespace='plugin_connection'
         and v_existing.resource_id=p_connection_id::text
         and coalesce(v_existing.session_id,'')=coalesce(v_session,'')
        then 'idempotent_request_replay'
        else 'request_scope_replay_mismatch'
      end,
      v_request,'plugin_connection',p_connection_id::text,v_session,
      jsonb_build_object('toolKey',nullif(v_tool,''),'operationFingerprint',v_fp)
    );
    return jsonb_build_object(
      'success',true,'allowed',false,
      'error',case
        when v_existing.resource_namespace='plugin_connection'
         and v_existing.resource_id=p_connection_id::text
         and coalesce(v_existing.session_id,'')=coalesce(v_session,'')
        then 'permission_request_replayed'
        else 'permission_request_scope_mismatch'
      end,
      'replayed',true
    );
  end if;

  select * into v_grant
  from public.zuvyr_permission_grants g
  where g.owner_id=p_owner_id
    and g.action_class=v_action
    and g.resource_namespace='plugin_connection'
    and g.resource_id=p_connection_id::text
    and g.revoked_at is null
    and g.expires_at > now()
    and (g.grant_mode <> 'allow_once' or g.consumed_at is null)
    and g.scope_type='resource_session'
    and g.session_id=v_session
    and lower(coalesce(g.constraints->>'operationFingerprint',''))=v_fp
    and (
      v_action='plugin.install'
      or lower(coalesce(g.constraints->>'toolKey',''))=v_tool
    )
  order by
    case when g.grant_mode='allow_once' then 0 else 1 end,
    g.expires_at asc
  limit 1
  for update;

  if not found then
    insert into public.zuvyr_permission_audit_events(
      owner_id,action_class,event_type,reason,request_id,
      resource_namespace,resource_id,session_id,metadata
    ) values (
      p_owner_id,v_action,'deny','permission_required',v_request,
      'plugin_connection',p_connection_id::text,v_session,
      jsonb_build_object('toolKey',nullif(v_tool,''),'operationFingerprint',v_fp)
    );
    return jsonb_build_object('success',true,'allowed',false,'error','permission_required');
  end if;

  insert into public.zuvyr_permission_consumptions(
    owner_id,grant_id,action_class,request_id,
    resource_namespace,resource_id,session_id
  ) values (
    p_owner_id,v_grant.id,v_action,v_request,
    'plugin_connection',p_connection_id::text,v_session
  )
  on conflict (owner_id,action_class,request_id) do nothing
  returning id into v_consumption_id;

  if v_consumption_id is null then
    return jsonb_build_object('success',true,'allowed',false,'error','permission_request_replayed','replayed',true);
  end if;

  update public.zuvyr_permission_grants
  set consumed_at=case when grant_mode='allow_once' then now() else consumed_at end,
      last_used_at=now(),
      use_count=use_count+1,
      updated_at=now()
  where id=v_grant.id;

  insert into public.zuvyr_permission_audit_events(
    owner_id,grant_id,action_class,event_type,reason,request_id,
    resource_namespace,resource_id,session_id,metadata
  ) values (
    p_owner_id,v_grant.id,v_action,'allow','active_grant',v_request,
    'plugin_connection',p_connection_id::text,v_session,
    jsonb_build_object(
      'grantMode',v_grant.grant_mode,
      'scopeType',v_grant.scope_type,
      'toolKey',nullif(v_tool,''),
      'operationFingerprint',v_fp
    )
  );

  return jsonb_build_object(
    'success',true,
    'allowed',true,
    'grant_id',v_grant.id,
    'replayed',false,
    'grant_mode',v_grant.grant_mode,
    'constraints',v_grant.constraints
  );
end;
$pack089_tool_consume$;

create or replace function public.install_workspace_plugin_pack089(
  p_owner_id uuid,
  p_connection_id uuid,
  p_session_id text,
  p_request_id text,
  p_operation_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_plugin_install$
declare
  v_connection public.workspace_plugin_connections%rowtype;
  v_permission jsonb;
begin
  select * into v_connection
  from public.workspace_plugin_connections
  where id=p_connection_id and owner_id=p_owner_id
  for update;

  if not found then
    raise exception 'pack089_plugin_connection_not_found';
  end if;
  if v_connection.status='revoked' then
    raise exception 'pack089_plugin_connection_revoked';
  end if;

  v_permission := public.consume_workspace_tool_permission_pack089(
    p_owner_id,
    'plugin.install',
    p_connection_id,
    p_session_id,
    p_request_id,
    null,
    p_operation_fingerprint
  );

  if coalesce((v_permission->>'allowed')::boolean,false) is distinct from true then
    raise exception '%',coalesce(v_permission->>'error','permission_required');
  end if;

  update public.workspace_plugin_connections
  set installed=true,
      runtime_enabled=true,
      status='active',
      revoked_at=null,
      last_error_code=null,
      updated_at=now()
  where id=p_connection_id;

  insert into public.workspace_audit_events(
    owner_id,event_type,details,external_write_executed
  ) values (
    p_owner_id,
    'plugin_installed',
    jsonb_build_object(
      'connectionId',p_connection_id,
      'pluginKey',v_connection.plugin_key,
      'pluginKind',v_connection.plugin_kind,
      'requestId',p_request_id
    ),
    false
  );

  return jsonb_build_object(
    'connection_id',p_connection_id,
    'status','active',
    'installed',true,
    'runtime_enabled',true,
    'permission_grant_id',v_permission->>'grant_id'
  );
end;
$pack089_plugin_install$;

revoke all on function public.consume_workspace_tool_permission_pack089(uuid,text,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.install_workspace_plugin_pack089(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.consume_workspace_tool_permission_pack089(uuid,text,uuid,text,text,text,text) to service_role;
grant execute on function public.install_workspace_plugin_pack089(uuid,uuid,text,text,text) to service_role;

comment on function public.consume_workspace_tool_permission_pack089(uuid,text,uuid,text,text,text,text) is
  'PACK089/89B exact resource-session permission consume for plugin/MCP operations. Matches operation fingerprint and tool key before execution.';

commit;
