-- ZUVYR V1 PACK089 / 89E — expired OAuth PKCE secret cleanup
-- Additive hardening: preserve OAuth session audit rows while deleting only
-- expired + unconsumed PKCE verifier secrets from Vault.

begin;

create or replace function public.cleanup_expired_workspace_oauth_pkce_owner_pack089(
  p_owner_id uuid
) returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_expired_pkce_cleanup$
declare
  v_secret_ids uuid[] := array[]::uuid[];
  v_deleted integer := 0;
begin
  if p_owner_id is null then
    raise exception 'pack089_oauth_cleanup_owner_required';
  end if;

  -- Serialize cleanup per owner so concurrent OAuth starts cannot race cleanup.
  perform pg_advisory_xact_lock(
    hashtextextended('pack089:oauth-pkce-cleanup:' || p_owner_id::text, 0)
  );

  select coalesce(array_agg(s.pkce_verifier_secret_id), array[]::uuid[])
  into v_secret_ids
  from public.workspace_oauth_sessions s
  where s.owner_id=p_owner_id
    and s.provider='google_drive'
    and s.consumed_at is null
    and s.expires_at <= now();

  if cardinality(v_secret_ids)=0 then
    return 0;
  end if;

  delete from vault.secrets
  where id=any(v_secret_ids);
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    insert into public.workspace_audit_events(
      owner_id,event_type,details,external_write_executed
    ) values (
      p_owner_id,
      'integration_oauth_expired_pkce_cleaned',
      jsonb_build_object(
        'integration','google_drive',
        'deletedSecretCount',v_deleted,
        'secretValuesExposed',false
      ),
      false
    );
  end if;

  return v_deleted;
end;
$pack089_expired_pkce_cleanup$;

revoke all on function public.cleanup_expired_workspace_oauth_pkce_owner_pack089(uuid)
  from public,anon,authenticated;
grant execute on function public.cleanup_expired_workspace_oauth_pkce_owner_pack089(uuid)
  to service_role;

comment on function public.cleanup_expired_workspace_oauth_pkce_owner_pack089(uuid) is
  'PACK089/89E owner-scoped idempotent cleanup of expired unconsumed Google OAuth PKCE Vault secrets. Session audit rows are preserved and secret values are never returned.';

create or replace function public.cleanup_expired_workspace_oauth_pkce_pack089()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_expired_pkce_global_cleanup$
declare
  v_owner uuid;
  v_deleted integer := 0;
  v_total_deleted integer := 0;
  v_owners_cleaned integer := 0;
begin
  for v_owner in
    select distinct s.owner_id
    from public.workspace_oauth_sessions s
    join vault.secrets v on v.id=s.pkce_verifier_secret_id
    where s.provider='google_drive'
      and s.consumed_at is null
      and s.expires_at <= now()
  loop
    v_deleted := public.cleanup_expired_workspace_oauth_pkce_owner_pack089(v_owner);
    if v_deleted > 0 then
      v_total_deleted := v_total_deleted + v_deleted;
      v_owners_cleaned := v_owners_cleaned + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success',true,
    'ownersCleaned',v_owners_cleaned,
    'secretsDeleted',v_total_deleted,
    'secretValuesExposed',false
  );
end;
$pack089_expired_pkce_global_cleanup$;

revoke all on function public.cleanup_expired_workspace_oauth_pkce_pack089()
  from public,anon,authenticated;
grant execute on function public.cleanup_expired_workspace_oauth_pkce_pack089()
  to service_role;

comment on function public.cleanup_expired_workspace_oauth_pkce_pack089() is
  'PACK089/89E service-role maintenance cleanup for all expired unconsumed Google OAuth PKCE Vault secrets. Returns counts only.';

create or replace function public.workspace_oauth_expired_pkce_before_insert_pack089()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_expired_pkce_trigger$
begin
  if new.provider='google_drive' then
    perform public.cleanup_expired_workspace_oauth_pkce_owner_pack089(new.owner_id);
  end if;
  return new;
end;
$pack089_expired_pkce_trigger$;

revoke all on function public.workspace_oauth_expired_pkce_before_insert_pack089()
  from public,anon,authenticated;

drop trigger if exists workspace_oauth_expired_pkce_before_insert_pack089
  on public.workspace_oauth_sessions;
create trigger workspace_oauth_expired_pkce_before_insert_pack089
before insert on public.workspace_oauth_sessions
for each row execute function public.workspace_oauth_expired_pkce_before_insert_pack089();

-- One-time production cleanup for historical expired sessions. Future cleanup
-- is performed both before OAuth inserts and by the existing maintenance run.
select public.cleanup_expired_workspace_oauth_pkce_pack089();

commit;
