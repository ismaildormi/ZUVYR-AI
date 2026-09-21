-- ZUVYR V1 PACK089 / 89A hardening
-- Applied after the canonical 89A foundation migration.
-- Invalidate pending OAuth/PKCE state when a connection is revoked and
-- prevent a revoked connection from consuming an OAuth callback state.

begin;

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

revoke all on function public.consume_workspace_oauth_session_pack089(text)
  from public,anon,authenticated;
revoke all on function public.revoke_workspace_integration_connection_pack089(uuid,uuid)
  from public,anon,authenticated;

grant execute on function public.consume_workspace_oauth_session_pack089(text)
  to service_role;
grant execute on function public.revoke_workspace_integration_connection_pack089(uuid,uuid)
  to service_role;

commit;
