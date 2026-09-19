'use strict';

const DEEPGRAM_MODEL='nova-3';
const ENDPOINT='https://api.deepgram.com/v1/listen';

function providerError(code,status=500,cause=null){const e=new Error(code);e.code=code;e.status=status;e.cause=cause;return e;}

function normalizeWords(value){
  if(!Array.isArray(value)) return [];
  return value.map((w,index)=>({
    index,
    text:String(w.punctuated_word||w.word||'').trim(),
    start:Number(w.start),
    end:Number(w.end),
    confidence:Number(w.confidence),
    speaker:Number.isInteger(w.speaker)?w.speaker:null,
    speakerConfidence:Number.isFinite(Number(w.speaker_confidence))?Number(w.speaker_confidence):null
  })).filter(w=>w.text&&Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>=w.start);
}

function normalizeUtterances(value){
  if(!Array.isArray(value)) return [];
  return value.map((u,index)=>({
    index,
    text:String(u.transcript||'').trim(),
    start:Number(u.start),
    end:Number(u.end),
    confidence:Number.isFinite(Number(u.confidence))?Number(u.confidence):null,
    speaker:Number.isInteger(u.speaker)?u.speaker:null
  })).filter(u=>u.text&&Number.isFinite(u.start)&&Number.isFinite(u.end)&&u.end>=u.start);
}

function normalizeDeepgramResponse(payload){
  const channel=payload?.results?.channels?.[0];
  const alt=channel?.alternatives?.[0]||{};
  const transcript=String(alt.transcript||'').trim();
  if(!transcript) throw providerError('audio_transcription_empty',502);
  const language=String(channel?.detected_language||payload?.results?.detected_language||'').trim()||null;
  const languageConfidence=Number(channel?.language_confidence??payload?.results?.language_confidence);
  return Object.freeze({
    transcript,
    words:Object.freeze(normalizeWords(alt.words)),
    utterances:Object.freeze(normalizeUtterances(payload?.results?.utterances)),
    language,
    languageConfidence:Number.isFinite(languageConfidence)?languageConfidence:null,
    metadata:Object.freeze({
      requestId:payload?.metadata?.request_id||null,
      modelInfo:payload?.metadata?.model_info||null,
      duration:Number(payload?.metadata?.duration)||null,
      channels:Number(payload?.metadata?.channels)||null
    })
  });
}

function buildDeepgramUrl(request){
  const url=new URL(ENDPOINT);
  url.searchParams.set('model',DEEPGRAM_MODEL);
  url.searchParams.set('smart_format',request.options.smartFormat?'true':'false');
  url.searchParams.set('utterances',request.options.utterances?'true':'false');
  if(request.options.diarization){
    url.searchParams.set('diarize_model','latest');
  }
  if(request.language){
    url.searchParams.set('language',request.language);
  }else if(request.options.detectLanguage){
    url.searchParams.set('detect_language','true');
    url.searchParams.set('language','multi');
  }else{
    url.searchParams.set('language','multi');
  }
  return url.toString();
}

async function transcribeAudio(request,{source,env=process.env,fetchImpl=globalThis.fetch}={}){
  if(String(env.PACK071_STT_PAID_EXECUTION_ENABLED||'').toLowerCase()!=='true'){
    throw providerError('pack071_stt_paid_execution_disabled',503);
  }
  if(!env.DEEPGRAM_API_KEY) throw providerError('deepgram_api_key_missing',503);
  if(!source?.url) throw providerError('audio_source_url_missing',400);
  if(typeof fetchImpl!=='function') throw providerError('audio_provider_fetch_unavailable',500);
  const response=await fetchImpl(buildDeepgramUrl(request),{
    method:'POST',
    headers:{
      Authorization:'Token '+env.DEEPGRAM_API_KEY,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({url:source.url}),
    signal:AbortSignal.timeout(120000)
  }).catch(error=>{throw providerError('deepgram_transcription_failed',502,error);});
  if(!response?.ok) throw providerError('deepgram_transcription_failed',502);
  const payload=await response.json().catch(error=>{throw providerError('deepgram_transcription_invalid_json',502,error);});
  return normalizeDeepgramResponse(payload);
}

module.exports={DEEPGRAM_MODEL,ENDPOINT,buildDeepgramUrl,normalizeDeepgramResponse,transcribeAudio};
