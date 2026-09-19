-- ZUVYR Pack073 — Realtime Voice browser-runtime session authority
-- Additive only. No paid realtime provider execution is enabled here.

begin;

alter table public.voice_sessions
  add column if not exists provider text not null default 'browser',
  add column if not exists transport text not null default 'web_speech_api',
  add column if not exists retention_mode text not null default 'transcript_only'
    check (retention_mode in ('transcript_only','none')),
  add column if not exists turn_count integer not null default 0 check (turn_count >= 0),
  add column if not exists transcript_chars bigint not null default 0 check (transcript_chars >= 0),
  add column if not exists interruption_count integer not null default 0 check (interruption_count >= 0),
  add column if not exists stop_reason text,
  add column if not exists expires_at timestamptz,
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object');

create table if not exists public.voice_session_turns (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.voice_sessions(id) on delete cascade,
  client_turn_id text not null check (length(btrim(client_turn_id)) between 8 and 120),
  turn_index integer not null check (turn_index >= 0),
  role text not null check (role in ('user','assistant')),
  text text not null check (length(btrim(text)) between 1 and 12000),
  interrupted boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  unique (owner_id,session_id,client_turn_id)
);

create index if not exists voice_sessions_owner_state_activity_idx
  on public.voice_sessions(owner_id,state,last_activity_at desc);
create index if not exists voice_session_turns_owner_session_idx
  on public.voice_session_turns(owner_id,session_id,turn_index,id);

alter table public.voice_session_turns enable row level security;

revoke all on public.voice_session_turns from public,anon,authenticated;
grant select,insert,update,delete on public.voice_session_turns to service_role;

create or replace function public.transition_zuvyr_voice_session(
  p_owner_id uuid,
  p_session_id uuid,
  p_next_state text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_session public.voice_sessions%rowtype;
  v_next text:=lower(btrim(coalesce(p_next_state,'')));
  v_now timestamptz:=now();
  v_allowed boolean:=false;
begin
  if v_next not in ('ready','listening','processing','speaking','stopped','failed') then
    raise exception 'pack073_voice_state_invalid';
  end if;

  select * into v_session
  from public.voice_sessions
  where id=p_session_id and owner_id=p_owner_id
  for update;

  if v_session.id is null then
    raise exception 'pack073_voice_session_not_found';
  end if;

  if v_session.state in ('stopped','failed') then
    return jsonb_build_object(
      'changed',false,'terminal',true,'state',v_session.state,
      'startedAt',v_session.started_at,'stoppedAt',v_session.stopped_at,
      'expiresAt',v_session.expires_at,'stopReason',v_session.stop_reason
    );
  end if;

  if v_session.expires_at is not null and v_now >= v_session.expires_at then
    update public.voice_sessions
      set state='stopped',stopped_at=coalesce(stopped_at,v_now),
          stop_reason='timeout',last_activity_at=v_now,updated_at=v_now
      where id=v_session.id;
    return jsonb_build_object(
      'changed',true,'terminal',true,'state','stopped',
      'startedAt',v_session.started_at,'stoppedAt',v_now,
      'expiresAt',v_session.expires_at,'stopReason','timeout'
    );
  end if;

  v_allowed :=
    (v_session.state='ready' and v_next in ('ready','listening','stopped','failed')) or
    (v_session.state='listening' and v_next in ('listening','processing','stopped','failed')) or
    (v_session.state='processing' and v_next in ('processing','speaking','ready','listening','stopped','failed')) or
    (v_session.state='speaking' and v_next in ('speaking','ready','listening','stopped','failed'));

  if not v_allowed then
    raise exception 'pack073_voice_state_transition_invalid:%->%',v_session.state,v_next;
  end if;

  update public.voice_sessions
  set state=v_next,
      started_at=case when v_next='listening' then coalesce(started_at,v_now) else started_at end,
      stopped_at=case when v_next in ('stopped','failed') then coalesce(stopped_at,v_now) else stopped_at end,
      stop_reason=case when v_next in ('stopped','failed') then nullif(left(btrim(coalesce(p_reason,'')),120),'') else stop_reason end,
      last_activity_at=v_now,
      updated_at=v_now
  where id=v_session.id;

  return jsonb_build_object(
    'changed',v_next<>v_session.state,
    'terminal',v_next in ('stopped','failed'),
    'state',v_next,
    'startedAt',case when v_next='listening' then coalesce(v_session.started_at,v_now) else v_session.started_at end,
    'stoppedAt',case when v_next in ('stopped','failed') then coalesce(v_session.stopped_at,v_now) else v_session.stopped_at end,
    'expiresAt',v_session.expires_at,
    'stopReason',case when v_next in ('stopped','failed') then nullif(left(btrim(coalesce(p_reason,'')),120),'') else v_session.stop_reason end
  );
end
$$;

create or replace function public.record_zuvyr_voice_turn(
  p_owner_id uuid,
  p_session_id uuid,
  p_client_turn_id text,
  p_turn_index integer,
  p_role text,
  p_text text,
  p_interrupted boolean default false,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_session public.voice_sessions%rowtype;
  v_existing public.voice_session_turns%rowtype;
  v_role text:=lower(btrim(coalesce(p_role,'')));
  v_text text:=btrim(coalesce(p_text,''));
  v_client_turn_id text:=btrim(coalesce(p_client_turn_id,''));
  v_now timestamptz:=now();
  v_inserted_id bigint;
begin
  if length(v_client_turn_id) not between 8 and 120 then
    raise exception 'pack073_voice_turn_id_invalid';
  end if;
  if p_turn_index is null or p_turn_index < 0 then
    raise exception 'pack073_voice_turn_index_invalid';
  end if;
  if v_role not in ('user','assistant') then
    raise exception 'pack073_voice_turn_role_invalid';
  end if;
  if length(v_text) not between 1 and 12000 then
    raise exception 'pack073_voice_turn_text_invalid';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then
    raise exception 'pack073_voice_turn_metadata_invalid';
  end if;

  select * into v_session
  from public.voice_sessions
  where id=p_session_id and owner_id=p_owner_id
  for update;

  if v_session.id is null then
    raise exception 'pack073_voice_session_not_found';
  end if;
  if v_session.state in ('stopped','failed') then
    raise exception 'pack073_voice_session_terminal';
  end if;
  if v_session.expires_at is not null and v_now >= v_session.expires_at then
    update public.voice_sessions
      set state='stopped',stopped_at=coalesce(stopped_at,v_now),
          stop_reason='timeout',last_activity_at=v_now,updated_at=v_now
      where id=v_session.id;
    raise exception 'pack073_voice_session_expired';
  end if;

  select * into v_existing
  from public.voice_session_turns
  where owner_id=p_owner_id and session_id=p_session_id and client_turn_id=v_client_turn_id;

  if v_existing.id is not null then
    return jsonb_build_object('replayed',true,'id',v_existing.id,'turnIndex',v_existing.turn_index,'role',v_existing.role);
  end if;

  insert into public.voice_session_turns(
    owner_id,session_id,client_turn_id,turn_index,role,text,interrupted,metadata
  ) values (
    p_owner_id,p_session_id,v_client_turn_id,p_turn_index,v_role,v_text,coalesce(p_interrupted,false),p_metadata
  )
  returning id into v_inserted_id;

  update public.voice_sessions
    set turn_count=turn_count+1,
        transcript_chars=transcript_chars+char_length(v_text),
        interruption_count=interruption_count+case when coalesce(p_interrupted,false) then 1 else 0 end,
        last_activity_at=v_now,
        updated_at=v_now
  where id=v_session.id;

  return jsonb_build_object('replayed',false,'id',v_inserted_id,'turnIndex',p_turn_index,'role',v_role);
end
$$;

revoke all on function public.transition_zuvyr_voice_session(uuid,uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.record_zuvyr_voice_turn(uuid,uuid,text,integer,text,text,boolean,jsonb)
  from public,anon,authenticated;

grant execute on function public.transition_zuvyr_voice_session(uuid,uuid,text,text) to service_role;
grant execute on function public.record_zuvyr_voice_turn(uuid,uuid,text,integer,text,text,boolean,jsonb) to service_role;

comment on table public.voice_session_turns is
  'Pack073 owner-scoped transcript turns for browser realtime voice. Raw microphone audio is not stored by ZUVYR.';
comment on function public.transition_zuvyr_voice_session(uuid,uuid,text,text) is
  'Pack073 row-locked realtime session state machine; terminal STOP/failed states cannot be reopened.';
comment on function public.record_zuvyr_voice_turn(uuid,uuid,text,integer,text,text,boolean,jsonb) is
  'Pack073 idempotent owner-scoped transcript turn recorder; transcript metrics are telemetry, never trusted provider billing duration.';

commit;
