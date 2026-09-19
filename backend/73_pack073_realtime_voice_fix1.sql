-- ZUVYR Pack073 FIX1 — align browser dictation and request lifecycle
-- Additive function replacement only. No provider/payment execution.

begin;

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
    (v_session.state='listening' and v_next in ('listening','ready','processing','stopped','failed')) or
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

revoke all on function public.transition_zuvyr_voice_session(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.transition_zuvyr_voice_session(uuid,uuid,text,text)
  to service_role;

comment on function public.transition_zuvyr_voice_session(uuid,uuid,text,text) is
  'Pack073 FIX1 row-locked browser voice state machine. Dictation may return listening->ready before the user explicitly sends a chat request; terminal states remain irreversible.';

commit;
