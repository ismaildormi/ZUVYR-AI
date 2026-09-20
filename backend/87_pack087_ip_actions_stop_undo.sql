begin;

alter table public.ip_sessions
  add column if not exists execution_context_type text,
  add column if not exists execution_context_id text;

alter table public.ip_sessions
  drop constraint if exists ip_session_execution_context;

do $pack087_session_context_constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='ip_session_execution_context_pack087'
      and conrelid='public.ip_sessions'::regclass
  ) then
    alter table public.ip_sessions
      add constraint ip_session_execution_context_pack087
      check (
        not execution_enabled
        or (
          started_at is not null
          and execution_context_type in ('device_agent','sandbox')
          and execution_context_id is not null
          and char_length(execution_context_id) between 1 and 200
        )
      );
  end if;
end
$pack087_session_context_constraint$;

alter table public.ip_actions
  add column if not exists target text,
  add column if not exists input_text text,
  add column if not exists requires_confirmation boolean not null default false,
  add column if not exists result jsonb not null default '{}'::jsonb,
  add column if not exists error_code text,
  add column if not exists claimed_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists attempt_id uuid,
  add column if not exists backup_ref text,
  add column if not exists backup_sha256 text,
  add column if not exists secret_redacted boolean not null default false;

alter table public.ip_stop_signals
  add column if not exists delivered_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.ip_undo_receipts
  alter column backup_artifact_id drop not null,
  add column if not exists backup_ref text,
  add column if not exists target text,
  add column if not exists requested_at timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists result jsonb not null default '{}'::jsonb,
  add column if not exists error_code text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists attempt_id uuid,
  add column if not exists secret_redacted boolean not null default false;

do $pack087_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='ip_actions_pack087_payload_bounds'
      and conrelid='public.ip_actions'::regclass
  ) then
    alter table public.ip_actions
      add constraint ip_actions_pack087_payload_bounds
      check (
        (target is null or char_length(target) <= 1000)
        and (input_text is null or char_length(input_text) <= 20000)
        and (error_code is null or char_length(error_code) <= 160)
        and (backup_ref is null or char_length(backup_ref) <= 300)
        and (backup_sha256 is null or backup_sha256 ~ '^[0-9a-f]{64}$')
        and jsonb_typeof(result)='object'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='ip_undo_receipts_pack087_backup_source'
      and conrelid='public.ip_undo_receipts'::regclass
  ) then
    alter table public.ip_undo_receipts
      add constraint ip_undo_receipts_pack087_backup_source
      check (
        (backup_artifact_id is not null)::int
        + (backup_ref is not null and char_length(backup_ref) between 1 and 300)::int
        = 1
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='ip_undo_receipts_pack087_result_bounds'
      and conrelid='public.ip_undo_receipts'::regclass
  ) then
    alter table public.ip_undo_receipts
      add constraint ip_undo_receipts_pack087_result_bounds
      check (
        (target is null or char_length(target) <= 1000)
        and (error_code is null or char_length(error_code) <= 160)
        and jsonb_typeof(result)='object'
      );
  end if;
end
$pack087_constraints$;

create index if not exists ip_actions_pack087_ready_idx
  on public.ip_actions(session_id,status,created_at)
  where status='ready';

create index if not exists ip_stop_signals_pack087_pending_idx
  on public.ip_stop_signals(session_id,status,created_at)
  where status='accepted';

create index if not exists ip_undo_receipts_pack087_ready_idx
  on public.ip_undo_receipts(session_id,status,requested_at,created_at)
  where status='ready';

revoke all on table public.ip_actions from public,anon,authenticated;
revoke all on table public.ip_confirmations from public,anon,authenticated;
revoke all on table public.ip_permission_grants from public,anon,authenticated;
revoke all on table public.ip_stop_signals from public,anon,authenticated;
revoke all on table public.ip_undo_receipts from public,anon,authenticated;
revoke all on table public.ip_audit_events from public,anon,authenticated;

grant select,insert,update on table public.ip_actions to service_role;
grant select,insert,update on table public.ip_confirmations to service_role;
grant select on table public.ip_permission_grants to service_role;
grant select,insert,update on table public.ip_stop_signals to service_role;
grant select,insert,update on table public.ip_undo_receipts to service_role;
grant select,insert on table public.ip_audit_events to service_role;

create or replace function public.grant_ip_permissions_pack087(
  p_owner_id uuid,
  p_session_id uuid,
  p_scopes text[],
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_grant$
declare
  v_session public.ip_sessions%rowtype;
  v_grant_id uuid;
  v_scope text;
  v_max_seconds integer;
begin
  select * into v_session
  from public.ip_sessions
  where id=p_session_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'pack087_session_not_found'; end if;
  if v_session.revoked_at is not null or v_session.state in ('stopped','failed') then
    raise exception 'pack087_session_unavailable';
  end if;
  if not exists (
    select 1 from public.ip_devices d
    where d.id=v_session.device_id
      and d.owner_id=p_owner_id
      and d.status='paired'
      and d.revoked_at is null
  ) then
    raise exception 'pack087_device_not_paired';
  end if;

  if p_scopes is null
     or cardinality(p_scopes) < 1
     or cardinality(p_scopes) > 9
     or '*' = any(p_scopes)
     or exists (
       select 1 from unnest(p_scopes) s
       where s not in (
         'screen.view','pointer.control','keyboard.type','application.open',
         'clipboard.read','clipboard.write','file.read','file.write','shell.execute'
       )
     )
     or (select count(*) from unnest(p_scopes) s)
        <> (select count(distinct s) from unnest(p_scopes) s)
  then
    raise exception 'pack087_permission_scopes_invalid';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'pack087_permission_expiry_invalid';
  end if;

  foreach v_scope in array p_scopes loop
    v_max_seconds := case v_scope
      when 'screen.view' then 900
      when 'pointer.control' then 900
      when 'keyboard.type' then 600
      when 'application.open' then 900
      when 'clipboard.read' then 300
      when 'clipboard.write' then 300
      when 'file.read' then 300
      when 'file.write' then 180
      when 'shell.execute' then 120
      else 0
    end;
    if p_expires_at > now() + make_interval(secs=>v_max_seconds) then
      raise exception 'pack087_permission_expiry_too_long';
    end if;
  end loop;

  update public.ip_permission_grants
    set revoked_at=coalesce(revoked_at,now())
    where owner_id=p_owner_id
      and session_id=p_session_id
      and revoked_at is null;

  insert into public.ip_permission_grants(
    owner_id,session_id,scopes,explicit_consent,issued_at,expires_at
  ) values (
    p_owner_id,p_session_id,p_scopes,true,now(),p_expires_at
  ) returning id into v_grant_id;

  update public.ip_sessions
    set execution_enabled=true,
        execution_context_type='device_agent',
        execution_context_id=v_session.device_id::text,
        started_at=coalesce(started_at,now()),
        state=case when state='blocked' then 'ready' else state end,
        updated_at=now()
    where id=p_session_id;

  insert into public.ip_audit_events(owner_id,session_id,event_type,details)
  values (
    p_owner_id,p_session_id,'permission_granted',
    jsonb_build_object('grantId',v_grant_id,'scopes',to_jsonb(p_scopes),'expiresAt',p_expires_at)
  );

  return jsonb_build_object(
    'success',true,
    'grant_id',v_grant_id,
    'session_id',p_session_id,
    'scopes',to_jsonb(p_scopes),
    'expires_at',p_expires_at,
    'execution_enabled',true
  );
end;
$pack087_grant$;

create or replace function public.revoke_ip_permissions_pack087(
  p_owner_id uuid,
  p_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_revoke_permissions$
declare
  v_count integer := 0;
begin
  if not exists (
    select 1 from public.ip_sessions
    where id=p_session_id and owner_id=p_owner_id
  ) then
    raise exception 'pack087_session_not_found';
  end if;

  update public.ip_permission_grants
    set revoked_at=coalesce(revoked_at,now())
    where owner_id=p_owner_id
      and session_id=p_session_id
      and revoked_at is null;
  get diagnostics v_count = row_count;

  update public.ip_sessions
    set execution_enabled=false,
        execution_context_type=null,
        execution_context_id=null,
        updated_at=now()
    where id=p_session_id and owner_id=p_owner_id;

  update public.ip_actions
    set status='cancelled',
        error_code=coalesce(error_code,'pack087_permission_revoked'),
        completed_at=coalesce(completed_at,now()),
        updated_at=now()
    where owner_id=p_owner_id
      and session_id=p_session_id
      and status in ('ready','pending_confirmation');

  insert into public.ip_audit_events(owner_id,session_id,event_type,details)
  values (
    p_owner_id,p_session_id,'permission_revoked',
    jsonb_build_object('grantsRevoked',v_count)
  );

  return jsonb_build_object(
    'success',true,
    'session_id',p_session_id,
    'grants_revoked',v_count,
    'execution_enabled',false
  );
end;
$pack087_revoke_permissions$;

create or replace function public.prepare_ip_action_pack087(
  p_owner_id uuid,
  p_session_id uuid,
  p_action_type text,
  p_required_scope text,
  p_risk text,
  p_action_digest text,
  p_target text,
  p_input_text text,
  p_requires_confirmation boolean,
  p_confirmation_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_prepare$
declare
  v_session public.ip_sessions%rowtype;
  v_action_id uuid;
  v_confirmation_id uuid;
  v_status text;
begin
  select * into v_session
  from public.ip_sessions
  where id=p_session_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'pack087_session_not_found'; end if;
  if v_session.revoked_at is not null or v_session.state in ('stopped','failed') then
    raise exception 'pack087_session_unavailable';
  end if;

  if not exists (
    select 1 from public.ip_devices d
    where d.id=v_session.device_id
      and d.owner_id=p_owner_id
      and d.status='paired'
      and d.revoked_at is null
  ) then
    raise exception 'pack087_device_not_paired';
  end if;

  if not exists (
    select 1 from public.ip_permission_grants g
    where g.owner_id=p_owner_id
      and g.session_id=p_session_id
      and g.explicit_consent=true
      and g.revoked_at is null
      and g.issued_at <= now()
      and g.expires_at > now()
      and p_required_scope = any(g.scopes)
  ) then
    raise exception 'pack087_permission_scope_missing';
  end if;

  if p_action_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'pack087_action_digest_invalid';
  end if;

  v_status := case when p_requires_confirmation then 'pending_confirmation' else 'ready' end;

  insert into public.ip_actions(
    owner_id,session_id,action_type,required_scope,risk,status,
    action_digest,target,input_text,requires_confirmation,updated_at
  ) values (
    p_owner_id,p_session_id,p_action_type,p_required_scope,p_risk,v_status,
    p_action_digest,nullif(p_target,''),p_input_text,coalesce(p_requires_confirmation,false),now()
  ) returning id into v_action_id;

  if p_requires_confirmation then
    if p_confirmation_expires_at is null
       or p_confirmation_expires_at <= now()
       or p_confirmation_expires_at > now() + interval '10 minutes' then
      raise exception 'pack087_confirmation_expiry_invalid';
    end if;

    insert into public.ip_confirmations(
      owner_id,session_id,action_id,action_digest,state,expires_at
    ) values (
      p_owner_id,p_session_id,v_action_id,p_action_digest,'pending',p_confirmation_expires_at
    ) returning id into v_confirmation_id;
  end if;

  insert into public.ip_audit_events(owner_id,session_id,action_id,event_type,details)
  values (
    p_owner_id,p_session_id,v_action_id,'action_prepared',
    jsonb_build_object(
      'actionType',p_action_type,
      'requiredScope',p_required_scope,
      'risk',p_risk,
      'requiresConfirmation',coalesce(p_requires_confirmation,false)
    )
  );

  return jsonb_build_object(
    'success',true,
    'action_id',v_action_id,
    'status',v_status,
    'confirmation_id',v_confirmation_id,
    'device_action_executed',false
  );
end;
$pack087_prepare$;

create or replace function public.confirm_ip_action_pack087(
  p_owner_id uuid,
  p_action_id uuid,
  p_action_digest text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_confirm$
declare
  v_action public.ip_actions%rowtype;
  v_confirmation public.ip_confirmations%rowtype;
begin
  select * into v_action
  from public.ip_actions
  where id=p_action_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'pack087_action_not_found'; end if;
  if v_action.status <> 'pending_confirmation' or v_action.requires_confirmation is not true then
    raise exception 'pack087_action_not_pending_confirmation';
  end if;
  if v_action.action_digest <> p_action_digest then
    raise exception 'pack087_action_digest_mismatch';
  end if;

  select * into v_confirmation
  from public.ip_confirmations
  where action_id=v_action.id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'pack087_confirmation_not_found'; end if;
  if v_confirmation.state <> 'pending' then raise exception 'pack087_confirmation_not_pending'; end if;
  if v_confirmation.expires_at <= now() then
    update public.ip_confirmations
      set state='expired',resolved_at=now()
      where id=v_confirmation.id;
    update public.ip_actions
      set status='cancelled',completed_at=now(),updated_at=now()
      where id=v_action.id;
    raise exception 'pack087_confirmation_expired';
  end if;
  if v_confirmation.action_digest <> p_action_digest then
    raise exception 'pack087_confirmation_digest_mismatch';
  end if;

  update public.ip_confirmations
    set state='approved',resolved_at=now()
    where id=v_confirmation.id;

  update public.ip_actions
    set status='ready',updated_at=now()
    where id=v_action.id;

  insert into public.ip_audit_events(owner_id,session_id,action_id,event_type,details)
  values (
    p_owner_id,v_action.session_id,v_action.id,'confirmation_resolved',
    jsonb_build_object('approved',true,'confirmationId',v_confirmation.id)
  );

  return jsonb_build_object(
    'success',true,
    'action_id',v_action.id,
    'status','ready',
    'confirmation_id',v_confirmation.id
  );
end;
$pack087_confirm$;

create or replace function public.claim_ip_action_pack087(
  p_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_claim$
declare
  v_action public.ip_actions%rowtype;
  v_confirmation public.ip_confirmations%rowtype;
  v_attempt uuid := gen_random_uuid();
begin
  select * into v_action
  from public.ip_actions
  where session_id=p_session_id and status='ready'
  order by created_at,id
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('success',true,'action',null);
  end if;

  if not exists (
    select 1 from public.ip_permission_grants g
    where g.owner_id=v_action.owner_id
      and g.session_id=v_action.session_id
      and g.explicit_consent=true
      and g.revoked_at is null
      and g.issued_at <= now()
      and g.expires_at > now()
      and v_action.required_scope = any(g.scopes)
  ) then
    update public.ip_actions
      set status='cancelled',error_code='pack087_permission_expired',completed_at=now(),updated_at=now()
      where id=v_action.id;
    return jsonb_build_object('success',false,'error','pack087_permission_expired');
  end if;

  if v_action.requires_confirmation then
    select * into v_confirmation
    from public.ip_confirmations
    where action_id=v_action.id
    for update;

    if not found
       or v_confirmation.state <> 'approved'
       or v_confirmation.expires_at <= now()
       or v_confirmation.action_digest <> v_action.action_digest then
      update public.ip_actions
        set status='cancelled',error_code='pack087_confirmation_invalid',completed_at=now(),updated_at=now()
        where id=v_action.id;
      return jsonb_build_object('success',false,'error','pack087_confirmation_invalid');
    end if;

    update public.ip_confirmations
      set state='consumed',consumed_at=now()
      where id=v_confirmation.id;
  end if;

  update public.ip_actions
    set status='running',
        attempt_id=v_attempt,
        claimed_at=now(),
        started_at=now(),
        updated_at=now()
    where id=v_action.id;

  insert into public.ip_audit_events(owner_id,session_id,action_id,event_type,details)
  values (
    v_action.owner_id,v_action.session_id,v_action.id,'action_started',
    jsonb_build_object('attemptId',v_attempt,'actionType',v_action.action_type)
  );

  return jsonb_build_object(
    'success',true,
    'action',jsonb_build_object(
      'id',v_action.id,
      'attemptId',v_attempt,
      'type',v_action.action_type,
      'scope',v_action.required_scope,
      'risk',v_action.risk,
      'target',v_action.target,
      'input',v_action.input_text,
      'reversible',(v_action.action_type='write_file')
    )
  );
end;
$pack087_claim$;

create or replace function public.report_ip_action_pack087(
  p_session_id uuid,
  p_action_id uuid,
  p_attempt_id uuid,
  p_success boolean,
  p_result jsonb,
  p_error_code text,
  p_device_action_executed boolean,
  p_backup_ref text,
  p_backup_sha256 text,
  p_secret_redacted boolean
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_report$
declare
  v_action public.ip_actions%rowtype;
  v_status text := case when p_success then 'completed' else 'failed' end;
  v_undo_id uuid;
begin
  select * into v_action
  from public.ip_actions
  where id=p_action_id and session_id=p_session_id
  for update;

  if not found then raise exception 'pack087_action_not_found'; end if;
  if v_action.status <> 'running' or v_action.attempt_id <> p_attempt_id then
    raise exception 'pack087_action_attempt_mismatch';
  end if;

  update public.ip_actions
    set status=v_status,
        result=coalesce(p_result,'{}'::jsonb),
        error_code=nullif(left(coalesce(p_error_code,''),160),''),
        device_action_executed=coalesce(p_device_action_executed,false),
        backup_ref=nullif(left(coalesce(p_backup_ref,''),300),''),
        backup_sha256=case
          when coalesce(p_backup_sha256,'') ~ '^[0-9a-f]{64}$' then lower(p_backup_sha256)
          else null
        end,
        secret_redacted=coalesce(p_secret_redacted,false),
        completed_at=now(),
        updated_at=now()
    where id=v_action.id;

  if p_success
     and p_device_action_executed
     and v_action.action_type='write_file'
     and nullif(coalesce(p_backup_ref,''),'') is not null then
    insert into public.ip_undo_receipts(
      owner_id,session_id,action_id,backup_artifact_id,backup_ref,target,
      status,device_action_executed,updated_at
    ) values (
      v_action.owner_id,v_action.session_id,v_action.id,null,
      left(p_backup_ref,300),v_action.target,
      'ready',false,now()
    )
    returning id into v_undo_id;
  end if;

  insert into public.ip_audit_events(owner_id,session_id,action_id,event_type,details)
  values (
    v_action.owner_id,v_action.session_id,v_action.id,
    case when p_success then 'action_completed' else 'action_failed' end,
    jsonb_build_object(
      'attemptId',p_attempt_id,
      'deviceActionExecuted',coalesce(p_device_action_executed,false),
      'secretRedacted',coalesce(p_secret_redacted,false),
      'errorCode',nullif(left(coalesce(p_error_code,''),160),''),
      'undoReceiptId',v_undo_id
    )
  );

  return jsonb_build_object(
    'success',true,
    'action_id',v_action.id,
    'status',v_status,
    'undo_receipt_id',v_undo_id
  );
end;
$pack087_report$;

create or replace function public.request_ip_stop_pack087(
  p_owner_id uuid,
  p_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_stop_request$
declare
  v_session public.ip_sessions%rowtype;
  v_signal_id uuid;
begin
  select * into v_session
  from public.ip_sessions
  where id=p_session_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'pack087_session_not_found'; end if;
  if v_session.revoked_at is not null or v_session.state in ('stopped','failed') then
    raise exception 'pack087_session_unavailable';
  end if;

  insert into public.ip_stop_signals(owner_id,session_id,status,device_command_sent,updated_at)
  values (p_owner_id,p_session_id,'accepted',false,now())
  returning id into v_signal_id;

  update public.ip_sessions
    set state='stopping',updated_at=now()
    where id=p_session_id;

  insert into public.ip_audit_events(owner_id,session_id,event_type,details)
  values (p_owner_id,p_session_id,'stop_requested',jsonb_build_object('signalId',v_signal_id));

  return jsonb_build_object('success',true,'signal_id',v_signal_id,'status','accepted');
end;
$pack087_stop_request$;

create or replace function public.claim_ip_stop_pack087(
  p_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_stop_claim$
declare
  v_signal public.ip_stop_signals%rowtype;
begin
  select * into v_signal
  from public.ip_stop_signals
  where session_id=p_session_id and status='accepted'
  order by created_at,id
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('success',true,'stop',null);
  end if;

  update public.ip_stop_signals
    set status='delivered',
        device_command_sent=true,
        delivered_at=now(),
        updated_at=now()
    where id=v_signal.id;

  return jsonb_build_object(
    'success',true,
    'stop',jsonb_build_object(
      'id',v_signal.id,
      'sessionId',v_signal.session_id,
      'requestedAt',v_signal.created_at
    )
  );
end;
$pack087_stop_claim$;

create or replace function public.ack_ip_stop_pack087(
  p_session_id uuid,
  p_signal_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_stop_ack$
declare
  v_signal public.ip_stop_signals%rowtype;
begin
  select * into v_signal
  from public.ip_stop_signals
  where id=p_signal_id and session_id=p_session_id
  for update;

  if not found then raise exception 'pack087_stop_not_found'; end if;
  if v_signal.status not in ('delivered','acknowledged') then
    raise exception 'pack087_stop_not_delivered';
  end if;

  update public.ip_stop_signals
    set status='acknowledged',
        acknowledged_at=coalesce(acknowledged_at,now()),
        updated_at=now()
    where id=v_signal.id;

  update public.ip_actions
    set status='cancelled',
        error_code=coalesce(error_code,'pack087_stopped'),
        completed_at=coalesce(completed_at,now()),
        updated_at=now()
    where session_id=p_session_id and status in ('ready','running','pending_confirmation');

  update public.ip_sessions
    set state='ready',updated_at=now()
    where id=p_session_id and state='stopping';

  insert into public.ip_audit_events(owner_id,session_id,event_type,details)
  values (
    v_signal.owner_id,p_session_id,'stop_acknowledged',
    jsonb_build_object('signalId',v_signal.id)
  );

  return jsonb_build_object('success',true,'signal_id',v_signal.id,'status','acknowledged');
end;
$pack087_stop_ack$;

create or replace function public.request_ip_undo_pack087(
  p_owner_id uuid,
  p_action_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_undo_request$
declare
  v_action public.ip_actions%rowtype;
  v_undo public.ip_undo_receipts%rowtype;
begin
  select * into v_action
  from public.ip_actions
  where id=p_action_id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'pack087_action_not_found'; end if;
  if v_action.action_type <> 'write_file' or v_action.status <> 'completed' or v_action.device_action_executed is not true then
    raise exception 'pack087_action_not_undoable';
  end if;

  select * into v_undo
  from public.ip_undo_receipts
  where action_id=v_action.id and owner_id=p_owner_id
  for update;

  if not found then raise exception 'pack087_undo_receipt_not_found'; end if;
  if v_undo.status <> 'ready' or v_undo.requested_at is not null then
    raise exception 'pack087_undo_not_ready';
  end if;

  update public.ip_undo_receipts
    set requested_at=now(),updated_at=now()
    where id=v_undo.id;

  insert into public.ip_audit_events(owner_id,session_id,action_id,event_type,details)
  values (
    p_owner_id,v_action.session_id,v_action.id,'undo_requested',
    jsonb_build_object('undoReceiptId',v_undo.id)
  );

  return jsonb_build_object(
    'success',true,
    'undo_receipt_id',v_undo.id,
    'status','ready'
  );
end;
$pack087_undo_request$;

create or replace function public.claim_ip_undo_pack087(
  p_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_undo_claim$
declare
  v_undo public.ip_undo_receipts%rowtype;
  v_attempt uuid := gen_random_uuid();
begin
  select * into v_undo
  from public.ip_undo_receipts
  where session_id=p_session_id
    and status='ready'
    and requested_at is not null
  order by requested_at,id
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('success',true,'undo',null);
  end if;

  update public.ip_undo_receipts
    set status='running',
        attempt_id=v_attempt,
        claimed_at=now(),
        updated_at=now()
    where id=v_undo.id;

  return jsonb_build_object(
    'success',true,
    'undo',jsonb_build_object(
      'id',v_undo.id,
      'attemptId',v_attempt,
      'actionId',v_undo.action_id,
      'backupRef',v_undo.backup_ref,
      'target',v_undo.target
    )
  );
end;
$pack087_undo_claim$;

create or replace function public.report_ip_undo_pack087(
  p_session_id uuid,
  p_undo_id uuid,
  p_attempt_id uuid,
  p_success boolean,
  p_result jsonb,
  p_error_code text,
  p_device_action_executed boolean,
  p_secret_redacted boolean
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack087_undo_report$
declare
  v_undo public.ip_undo_receipts%rowtype;
  v_status text := case when p_success then 'completed' else 'failed' end;
begin
  select * into v_undo
  from public.ip_undo_receipts
  where id=p_undo_id and session_id=p_session_id
  for update;

  if not found then raise exception 'pack087_undo_not_found'; end if;
  if v_undo.status <> 'running' or v_undo.attempt_id <> p_attempt_id then
    raise exception 'pack087_undo_attempt_mismatch';
  end if;

  update public.ip_undo_receipts
    set status=v_status,
        result=coalesce(p_result,'{}'::jsonb),
        error_code=nullif(left(coalesce(p_error_code,''),160),''),
        device_action_executed=coalesce(p_device_action_executed,false),
        secret_redacted=coalesce(p_secret_redacted,false),
        completed_at=now(),
        updated_at=now()
    where id=v_undo.id;

  insert into public.ip_audit_events(owner_id,session_id,action_id,event_type,details)
  values (
    v_undo.owner_id,v_undo.session_id,v_undo.action_id,
    case when p_success then 'undo_completed' else 'undo_failed' end,
    jsonb_build_object(
      'undoReceiptId',v_undo.id,
      'deviceActionExecuted',coalesce(p_device_action_executed,false),
      'secretRedacted',coalesce(p_secret_redacted,false),
      'errorCode',nullif(left(coalesce(p_error_code,''),160),'')
    )
  );

  return jsonb_build_object('success',true,'undo_receipt_id',v_undo.id,'status',v_status);
end;
$pack087_undo_report$;

do $pack087_revoke_old_overloads$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname like '%ip_%pack087'
  loop
    execute 'revoke all on function ' || r.sig || ' from public,anon,authenticated';
    execute 'grant execute on function ' || r.sig || ' to service_role';
  end loop;
end
$pack087_revoke_old_overloads$;

comment on function public.claim_ip_action_pack087(uuid) is
  'PACK087 service-role-only atomic device action claim. Permission and single-use confirmation are revalidated at claim time.';
comment on function public.claim_ip_stop_pack087(uuid) is
  'PACK087 independent STOP delivery channel.';
comment on function public.claim_ip_undo_pack087(uuid) is
  'PACK087 atomic reversible file undo claim using an opaque local backup reference.';

commit;
