-- ZUVYR V1 PACK089 / 89C — Google Drive OAuth ownership + exact connection permissions
-- Additive on top of 89A/89B. No token plaintext in public tables.

begin;

create unique index if not exists workspace_integration_one_live_provider_uq
  on public.workspace_integration_connections(owner_id,integration_key)
  where status <> 'revoked' and revoked_at is null;

create or replace function public.consume_workspace_oauth_session_owner_pack089(
  p_owner_id uuid,
  p_state_hash text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_89c_oauth_consume$
declare
  v_session public.workspace_oauth_sessions%rowtype;
  v_verifier text;
begin
  select s.* into v_session
  from public.workspace_oauth_sessions s
  join public.workspace_integration_connections c
    on c.id=s.connection_id
   and c.owner_id=s.owner_id
  where s.owner_id=p_owner_id
    and s.state_hash=lower(trim(coalesce(p_state_hash,'')))
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
$pack089_89c_oauth_consume$;

create or replace function public.consume_workspace_connection_permission_pack089(
  p_owner_id uuid,
  p_action_class text,
  p_connection_id uuid,
  p_session_id text,
  p_request_id text,
  p_tool_key text,
  p_required_scope text,
  p_operation_fingerprint text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_89c_connection_consume$
declare
  v_action text := lower(trim(coalesce(p_action_class,'')));
  v_session text := nullif(trim(coalesce(p_session_id,'')),'');
  v_request text := trim(coalesce(p_request_id,''));
  v_tool text := lower(trim(coalesce(p_tool_key,'')));
  v_scope text := lower(trim(coalesce(p_required_scope,'')));
  v_fp text := lower(trim(coalesce(p_operation_fingerprint,'')));
  v_connection public.workspace_integration_connections%rowtype;
  v_existing public.zuvyr_permission_consumptions%rowtype;
  v_grant public.zuvyr_permission_grants%rowtype;
  v_consumption_id uuid;
begin
  if v_action not in ('connection.read','connection.write') then
    return jsonb_build_object('success',false,'allowed',false,'error','invalid_connection_permission_action');
  end if;
  if v_session is null or length(v_session)>200 then
    return jsonb_build_object('success',false,'allowed',false,'error','permission_session_required');
  end if;
  if v_request='' or length(v_request)>200 then
    return jsonb_build_object('success',false,'allowed',false,'error','invalid_permission_request_id');
  end if;
  if v_tool='' or v_tool='*' or length(v_tool)>200 then
    return jsonb_build_object('success',false,'allowed',false,'error','permission_tool_key_required');
  end if;
  if v_scope not in ('drive.file.read','drive.file.write','drive.export') then
    return jsonb_build_object('success',false,'allowed',false,'error','invalid_workspace_integration_scope');
  end if;
  if v_action='connection.write' and v_scope <> 'drive.file.write' then
    return jsonb_build_object('success',false,'allowed',false,'error','permission_scope_action_mismatch');
  end if;
  if v_action='connection.read' and v_scope not in ('drive.file.read','drive.export') then
    return jsonb_build_object('success',false,'allowed',false,'error','permission_scope_action_mismatch');
  end if;
  if v_action='connection.write' and v_fp !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('success',false,'allowed',false,'error','permission_operation_fingerprint_required');
  end if;

  select * into v_connection
  from public.workspace_integration_connections c
  where c.id=p_connection_id
    and c.owner_id=p_owner_id
    and c.integration_key='google_drive'
    and c.status='active'
    and c.connected=true
    and c.revoked_at is null
  for update;

  if not found then
    return jsonb_build_object('success',true,'allowed',false,'error','permission_resource_not_owned');
  end if;
  if not (v_scope=any(v_connection.scopes)) then
    return jsonb_build_object('success',true,'allowed',false,'error','connection_scope_not_granted');
  end if;
  if v_action='connection.read' and v_connection.read_enabled is distinct from true then
    return jsonb_build_object('success',true,'allowed',false,'error','connection_read_disabled');
  end if;
  if v_action='connection.write' and v_connection.write_enabled is distinct from true then
    return jsonb_build_object('success',true,'allowed',false,'error','connection_write_disabled');
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
        when v_existing.resource_namespace='integration_connection'
         and v_existing.resource_id=p_connection_id::text
         and coalesce(v_existing.session_id,'')=coalesce(v_session,'')
        then 'idempotent_request_replay'
        else 'request_scope_replay_mismatch'
      end,
      v_request,'integration_connection',p_connection_id::text,v_session,
      jsonb_build_object(
        'toolKey',v_tool,
        'requiredScope',v_scope,
        'operationFingerprint',nullif(v_fp,'')
      )
    );
    return jsonb_build_object(
      'success',true,'allowed',false,
      'error',case
        when v_existing.resource_namespace='integration_connection'
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
    and g.resource_namespace='integration_connection'
    and g.resource_id=p_connection_id::text
    and g.revoked_at is null
    and g.expires_at > now()
    and (g.grant_mode <> 'allow_once' or g.consumed_at is null)
    and (
      (g.scope_type='resource_session' and g.session_id=v_session)
      or
      (v_action='connection.read' and g.scope_type='resource' and g.session_id is null)
    )
    and lower(coalesce(g.constraints->>'toolKey',''))=v_tool
    and (
      v_action='connection.read'
      or lower(coalesce(g.constraints->>'operationFingerprint',''))=v_fp
    )
  order by
    case when g.grant_mode='allow_once' then 0 when g.grant_mode='session' then 1 else 2 end,
    g.expires_at asc
  limit 1
  for update;

  if not found then
    insert into public.zuvyr_permission_audit_events(
      owner_id,action_class,event_type,reason,request_id,
      resource_namespace,resource_id,session_id,metadata
    ) values (
      p_owner_id,v_action,'deny','permission_required',v_request,
      'integration_connection',p_connection_id::text,v_session,
      jsonb_build_object(
        'toolKey',v_tool,
        'requiredScope',v_scope,
        'operationFingerprint',nullif(v_fp,'')
      )
    );
    return jsonb_build_object('success',true,'allowed',false,'error','permission_required');
  end if;

  insert into public.zuvyr_permission_consumptions(
    owner_id,grant_id,action_class,request_id,
    resource_namespace,resource_id,session_id
  ) values (
    p_owner_id,v_grant.id,v_action,v_request,
    'integration_connection',p_connection_id::text,v_session
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
    'integration_connection',p_connection_id::text,v_session,
    jsonb_build_object(
      'grantMode',v_grant.grant_mode,
      'scopeType',v_grant.scope_type,
      'toolKey',v_tool,
      'requiredScope',v_scope,
      'operationFingerprint',nullif(v_fp,'')
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
$pack089_89c_connection_consume$;

revoke all on function public.consume_workspace_oauth_session_owner_pack089(uuid,text)
  from public,anon,authenticated;
revoke all on function public.consume_workspace_connection_permission_pack089(uuid,text,uuid,text,text,text,text,text)
  from public,anon,authenticated;

grant execute on function public.consume_workspace_oauth_session_owner_pack089(uuid,text)
  to service_role;
grant execute on function public.consume_workspace_connection_permission_pack089(uuid,text,uuid,text,text,text,text,text)
  to service_role;

comment on function public.consume_workspace_oauth_session_owner_pack089(uuid,text) is
  'PACK089/89C owner-bound one-time OAuth callback consume. PKCE plaintext is returned only to service_role and removed from Vault immediately.';
comment on function public.consume_workspace_connection_permission_pack089(uuid,text,uuid,text,text,text,text,text) is
  'PACK089/89C exact Google Drive connection permission consume. Verifies owner, active connection, provider scope, tool key and write fingerprint before network execution.';

commit;
