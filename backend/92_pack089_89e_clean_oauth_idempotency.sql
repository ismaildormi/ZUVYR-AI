-- ZUVYR V1 PACK089 / 89E — clean OAuth idempotency hardening
-- Atomic provider-row creation + expected OAuth replay as structured denial.

begin;

create or replace function public.create_or_reuse_workspace_integration_pack089(
  p_owner_id uuid,
  p_integration_key text,
  p_scopes text[],
  p_explicit_consent boolean
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_89e_create_or_reuse$
declare
  v_key text := lower(trim(coalesce(p_integration_key,'')));
  v_scopes text[];
  v_existing_scopes text[];
  v_connection public.workspace_integration_connections%rowtype;
  v_created boolean := false;
begin
  if p_owner_id is null then
    return jsonb_build_object('success',false,'error','workspace_owner_required');
  end if;
  if v_key <> 'google_drive' then
    return jsonb_build_object('success',false,'error','invalid_workspace_integration_key');
  end if;

  select coalesce(array_agg(distinct lower(trim(u.scope)) order by lower(trim(u.scope))), array[]::text[])
  into v_scopes
  from unnest(coalesce(p_scopes,array[]::text[])) as u(scope)
  where nullif(trim(u.scope),'') is not null;

  if cardinality(v_scopes) < 1 or cardinality(v_scopes) > 12 or '*'=any(v_scopes) then
    return jsonb_build_object('success',false,'error','invalid_workspace_integration_scopes');
  end if;
  if exists (
    select 1 from unnest(v_scopes) as allowed(scope)
    where allowed.scope not in ('drive.file.read','drive.file.write','drive.export')
  ) then
    return jsonb_build_object('success',false,'error','invalid_workspace_integration_scope');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text || ':' || v_key, 0));

  select * into v_connection
  from public.workspace_integration_connections c
  where c.owner_id=p_owner_id
    and c.integration_key=v_key
    and c.status <> 'revoked'
    and c.revoked_at is null
  order by c.updated_at desc
  limit 1
  for update;

  if found then
    select coalesce(array_agg(distinct lower(trim(u.scope)) order by lower(trim(u.scope))), array[]::text[])
    into v_existing_scopes
    from unnest(coalesce(v_connection.scopes,array[]::text[])) as u(scope)
    where nullif(trim(u.scope),'') is not null;

    if v_existing_scopes is distinct from v_scopes then
      return jsonb_build_object(
        'success',false,
        'error','workspace_google_drive_scope_change_requires_disconnect',
        'connection_id',v_connection.id
      );
    end if;

    if coalesce(p_explicit_consent,false) and v_connection.explicit_consent is distinct from true then
      update public.workspace_integration_connections
      set explicit_consent=true, updated_at=now()
      where id=v_connection.id
      returning * into v_connection;
    end if;
  else
    insert into public.workspace_integration_connections(
      owner_id,integration_key,scopes,explicit_consent,status,connected,read_enabled,write_enabled
    ) values (
      p_owner_id,v_key,v_scopes,coalesce(p_explicit_consent,false),'draft',false,false,false
    ) returning * into v_connection;
    v_created := true;
  end if;

  return jsonb_build_object(
    'success',true,
    'created',v_created,
    'connection',jsonb_build_object(
      'id',v_connection.id,
      'integration_key',v_connection.integration_key,
      'scopes',to_jsonb(v_connection.scopes),
      'explicit_consent',v_connection.explicit_consent,
      'status',v_connection.status,
      'connected',v_connection.connected,
      'read_enabled',v_connection.read_enabled,
      'write_enabled',v_connection.write_enabled,
      'created_at',v_connection.created_at,
      'updated_at',v_connection.updated_at
    )
  );
end;
$pack089_89e_create_or_reuse$;

create or replace function public.consume_workspace_oauth_session_owner_pack089(
  p_owner_id uuid,
  p_state_hash text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_89e_oauth_consume$
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
    return jsonb_build_object('success',false,'error','pack089_oauth_session_invalid');
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
    'success',true,
    'session_id',v_session.id,
    'owner_id',v_session.owner_id,
    'connection_id',v_session.connection_id,
    'provider',v_session.provider,
    'redirect_uri',v_session.redirect_uri,
    'requested_scopes',to_jsonb(v_session.requested_scopes),
    'pkce_verifier',v_verifier
  );
end;
$pack089_89e_oauth_consume$;

revoke all on function public.create_or_reuse_workspace_integration_pack089(uuid,text,text[],boolean) from public,anon,authenticated;
grant execute on function public.create_or_reuse_workspace_integration_pack089(uuid,text,text[],boolean) to service_role;
revoke all on function public.consume_workspace_oauth_session_owner_pack089(uuid,text) from public,anon,authenticated;
grant execute on function public.consume_workspace_oauth_session_owner_pack089(uuid,text) to service_role;

comment on function public.create_or_reuse_workspace_integration_pack089(uuid,text,text[],boolean) is
  'PACK089/89E atomic owner/provider connection creation. Advisory-lock serialized; exact-scope retries reuse the existing live row.';
comment on function public.consume_workspace_oauth_session_owner_pack089(uuid,text) is
  'PACK089/89E one-time owner-bound OAuth consume. Expected stale/replayed state returns structured denial; PKCE corruption remains a hard error.';

commit;
