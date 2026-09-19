'use strict';

const crypto = require('node:crypto');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES=new Set(['ready','listening','processing','speaking','stopped','failed']);
const ROLES=new Set(['user','assistant']);

function voiceError(code,cause=null){
  const error=new Error(code);
  error.code=code;
  error.cause=cause;
  return error;
}
function requiredUuid(value,code){
  const text=String(value||'').trim().toLowerCase();
  if(!UUID.test(text)) throw voiceError(code);
  return text;
}
function optionalUuid(value,code){
  if(value===undefined||value===null||String(value).trim()==='') return null;
  return requiredUuid(value,code);
}
function boundedText(value,{min=1,max=12000,code='invalid_text'}={}){
  const text=String(value||'').trim();
  if(text.length<min||text.length>max) throw voiceError(code);
  return text;
}
function normalizeState(value){
  const state=String(value||'').trim().toLowerCase();
  if(!STATES.has(state)) throw voiceError('voice_session_state_invalid');
  return state;
}

function createVoiceSessionRepository(db){
  if(!db||typeof db.from!=='function'||typeof db.rpc!=='function'){
    throw voiceError('voice_session_repository_unavailable');
  }

  async function create({ownerId,conversationId=null,maxSeconds=300,retentionMode='transcript_only'}){
    const owner=requiredUuid(ownerId,'voice_session_owner_invalid');
    const conversation=optionalUuid(conversationId,'voice_session_conversation_invalid');
    if(!Number.isInteger(maxSeconds)||maxSeconds<1||maxSeconds>900){
      throw voiceError('invalid_voice_session_duration');
    }
    const retention=String(retentionMode||'transcript_only').trim().toLowerCase();
    if(!['transcript_only','none'].includes(retention)){
      throw voiceError('voice_session_retention_invalid');
    }
    const now=new Date();
    const expiresAt=new Date(now.getTime()+maxSeconds*1000).toISOString();
    const row={
      owner_id:owner,
      conversation_id:conversation,
      state:'ready',
      microphone_consent:true,
      continuous_listening:false,
      background_recording:false,
      store_raw_audio:false,
      visible_indicator:true,
      stop_control:true,
      max_seconds:maxSeconds,
      provider:'browser',
      transport:'web_speech_api',
      retention_mode:retention,
      expires_at:expiresAt,
      last_activity_at:now.toISOString(),
      updated_at:now.toISOString(),
      metadata:{
        pack:73,
        rawAudioStoredByZuvyr:false,
        providerBillingAuthority:false,
        trainingPermissionImplied:false
      }
    };
    const result=await db.from('voice_sessions').insert(row)
      .select('id,state,provider,transport,retention_mode,max_seconds,turn_count,transcript_chars,interruption_count,started_at,stopped_at,expires_at,last_activity_at,created_at')
      .single();
    if(result.error||!result.data) throw voiceError('voice_session_create_failed',result.error);
    return result.data;
  }

  async function get({ownerId,sessionId,includeTurns=true}){
    const owner=requiredUuid(ownerId,'voice_session_owner_invalid');
    const session=requiredUuid(sessionId,'voice_session_id_invalid');
    const result=await db.from('voice_sessions')
      .select('id,conversation_id,state,provider,transport,retention_mode,max_seconds,turn_count,transcript_chars,interruption_count,stop_reason,started_at,stopped_at,expires_at,last_activity_at,created_at,updated_at')
      .eq('id',session).eq('owner_id',owner).maybeSingle();
    if(result.error) throw voiceError('voice_session_lookup_failed',result.error);
    if(!result.data) throw voiceError('voice_session_not_found');
    let turns=[];
    if(includeTurns&&result.data.retention_mode==='transcript_only'){
      const turnResult=await db.from('voice_session_turns')
        .select('id,client_turn_id,turn_index,role,text,interrupted,metadata,created_at')
        .eq('owner_id',owner).eq('session_id',session)
        .order('id',{ascending:true});
      if(turnResult.error) throw voiceError('voice_session_turns_lookup_failed',turnResult.error);
      turns=turnResult.data||[];
    }
    return Object.freeze({...result.data,turns:Object.freeze(turns)});
  }

  async function transition({ownerId,sessionId,state,reason=null}){
    const owner=requiredUuid(ownerId,'voice_session_owner_invalid');
    const session=requiredUuid(sessionId,'voice_session_id_invalid');
    const next=normalizeState(state);
    const result=await db.rpc('transition_zuvyr_voice_session',{
      p_owner_id:owner,
      p_session_id:session,
      p_next_state:next,
      p_reason:reason==null?null:String(reason).trim().slice(0,120)
    });
    if(result.error){
      const detail=String(result.error.message||result.error.code||'');
      if(detail.includes('not_found')) throw voiceError('voice_session_not_found',result.error);
      if(detail.includes('transition_invalid')) throw voiceError('voice_session_transition_invalid',result.error);
      throw voiceError('voice_session_transition_failed',result.error);
    }
    return result.data||{};
  }

  async function stop({ownerId,sessionId,reason='user_stop'}){
    return transition({ownerId,sessionId,state:'stopped',reason});
  }

  async function recordTurn({ownerId,sessionId,clientTurnId=null,turnIndex,role,text,interrupted=false,metadata={}}){
    const owner=requiredUuid(ownerId,'voice_session_owner_invalid');
    const session=requiredUuid(sessionId,'voice_session_id_invalid');
    const normalizedRole=String(role||'').trim().toLowerCase();
    if(!ROLES.has(normalizedRole)) throw voiceError('voice_turn_role_invalid');
    if(!Number.isInteger(turnIndex)||turnIndex<0) throw voiceError('voice_turn_index_invalid');
    const normalizedText=boundedText(text,{code:'voice_turn_text_invalid'});
    const clientId=boundedText(clientTurnId||crypto.randomUUID(),{min:8,max:120,code:'voice_turn_id_invalid'});
    const safeMetadata=metadata&&typeof metadata==='object'&&!Array.isArray(metadata)?metadata:{};
    const sessionState=await get({ownerId:owner,sessionId:session,includeTurns:false});
    if(sessionState.retention_mode==='none'){
      return Object.freeze({replayed:false,skipped:true,reason:'retention_none'});
    }
    const result=await db.rpc('record_zuvyr_voice_turn',{
      p_owner_id:owner,
      p_session_id:session,
      p_client_turn_id:clientId,
      p_turn_index:turnIndex,
      p_role:normalizedRole,
      p_text:normalizedText,
      p_interrupted:interrupted===true,
      p_metadata:safeMetadata
    });
    if(result.error) throw voiceError('voice_turn_record_failed',result.error);
    return result.data||{};
  }

  return Object.freeze({create,get,transition,stop,recordTurn});
}

module.exports={createVoiceSessionRepository,normalizeState};
