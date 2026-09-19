'use strict';

const DEEPGRAM_MODEL='nova-3';
const ENDPOINT='https://api.deepgram.com/v1/listen';
const TTS_ENDPOINT='https://api.deepgram.com/v1/speak';
const TTS_DEFAULT_MODEL='aura-2-thalia-en';
const TTS_SPANISH_MODEL='aura-2-selena-es';
const TTS_MODELS=new Set([TTS_DEFAULT_MODEL,TTS_SPANISH_MODEL]);

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
  const words=normalizeWords(alt.words);
  const languages=Array.isArray(alt.languages)
    ? alt.languages.map(x=>String(x||'').trim()).filter(Boolean)
    : [...new Set((alt.words||[]).map(w=>String(w?.language||'').trim()).filter(Boolean))];
  const language=String(channel?.detected_language||payload?.results?.detected_language||languages[0]||'').trim()||null;
  const languageConfidence=Number(channel?.language_confidence??payload?.results?.language_confidence);
  return Object.freeze({
    transcript,
    words:Object.freeze(words),
    utterances:Object.freeze(normalizeUtterances(payload?.results?.utterances)),
    language,
    languages:Object.freeze(languages),
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
  url.searchParams.set('mip_opt_out','true');
  if (request.language) {
    url.searchParams.set('language', request.language);
  } else {
    url.searchParams.set('language','multi');
  }
  return url.toString();
}

function resolveTtsModel(request){
  const explicit=String(request?.voiceId||'').trim();
  if(explicit){
    if(!TTS_MODELS.has(explicit)) throw providerError('unsupported_tts_voice',400);
    return explicit;
  }
  const language=String(request?.language||'').trim().toLowerCase();
  if(!language||language==='en'||language.startsWith('en-')) return TTS_DEFAULT_MODEL;
  if(language==='es'||language.startsWith('es-')) return TTS_SPANISH_MODEL;
  throw providerError('unsupported_tts_language',400);
}

function buildDeepgramTtsUrl(request){
  const model=resolveTtsModel(request);
  const format=String(request?.outputFormat||'mp3').toLowerCase();
  if(!['mp3','wav'].includes(format)) throw providerError('unsupported_tts_output_format',400);
  const url=new URL(TTS_ENDPOINT);
  url.searchParams.set('model',model);
  if(format==='mp3'){
    url.searchParams.set('encoding','mp3');
  } else {
    url.searchParams.set('encoding','linear16');
    url.searchParams.set('container','wav');
    if(request.sampleRate) url.searchParams.set('sample_rate',String(request.sampleRate));
  }
  return Object.freeze({url:url.toString(),model,format});
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
  const normalized = normalizeDeepgramResponse(payload);
  const language = normalized.language || request.language || normalized.languages[0] || null;
  const languages = normalized.languages.length
    ? normalized.languages
    : (language ? Object.freeze([language]) : Object.freeze([]));
  return Object.freeze({ ...normalized, language, languages });
}

async function synthesizeSpeech(request,{env=process.env,fetchImpl=globalThis.fetch}={}){
  if(String(env.PACK072_TTS_PAID_EXECUTION_ENABLED||'').toLowerCase()!=='true'){
    throw providerError('pack072_tts_paid_execution_disabled',503);
  }
  if(!env.DEEPGRAM_API_KEY) throw providerError('deepgram_api_key_missing',503);
  if(typeof fetchImpl!=='function') throw providerError('audio_provider_fetch_unavailable',500);
  const text=String(request?.text||'');
  if(!text.trim()) throw providerError('speech_text_required',400);
  const spec=buildDeepgramTtsUrl(request);
  const response=await fetchImpl(spec.url,{
    method:'POST',
    headers:{
      Authorization:'Token '+env.DEEPGRAM_API_KEY,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({text}),
    signal:AbortSignal.timeout(120000)
  }).catch(error=>{throw providerError('deepgram_tts_failed',502,error);});
  if(!response?.ok) throw providerError('deepgram_tts_failed',502);
  const raw=await response.arrayBuffer().catch(error=>{throw providerError('deepgram_tts_invalid_audio',502,error);});
  const buffer=Buffer.from(raw);
  if(buffer.length<1) throw providerError('deepgram_tts_empty_audio',502);
  const mimeType=spec.format==='wav'?'audio/wav':'audio/mpeg';
  const requestId=
    (typeof response.headers?.get==='function' && (
      response.headers.get('dg-request-id')||
      response.headers.get('x-request-id')
    ))||null;
  return Object.freeze({
    buffer,
    mimeType,
    format:spec.format,
    provider:'deepgram',
    model:spec.model,
    characterCount:Array.from(text).length,
    metadata:Object.freeze({requestId})
  });
}

function serializeTtsProviderResult(result){
  if(!result?.buffer||!Buffer.isBuffer(result.buffer)) throw providerError('tts_provider_result_invalid',500);
  return Object.freeze({
    kind:'pack072_tts_audio',
    audioBase64:result.buffer.toString('base64'),
    mimeType:result.mimeType,
    format:result.format,
    provider:result.provider,
    model:result.model,
    characterCount:result.characterCount,
    metadata:result.metadata||{}
  });
}

function restoreTtsProviderResult(value){
  if(!value||value.kind!=='pack072_tts_audio'||typeof value.audioBase64!=='string'||!value.audioBase64){
    return null;
  }
  const buffer=Buffer.from(value.audioBase64,'base64');
  if(!buffer.length) return null;
  return Object.freeze({
    buffer,
    mimeType:String(value.mimeType||'audio/mpeg'),
    format:String(value.format||'mp3'),
    provider:String(value.provider||'deepgram'),
    model:String(value.model||TTS_DEFAULT_MODEL),
    characterCount:Number(value.characterCount||0),
    metadata:value.metadata&&typeof value.metadata==='object'?value.metadata:{}
  });
}

module.exports={
  DEEPGRAM_MODEL,
  ENDPOINT,
  TTS_ENDPOINT,
  TTS_DEFAULT_MODEL,
  TTS_SPANISH_MODEL,
  buildDeepgramUrl,
  buildDeepgramTtsUrl,
  resolveTtsModel,
  normalizeDeepgramResponse,
  transcribeAudio,
  synthesizeSpeech,
  serializeTtsProviderResult,
  restoreTtsProviderResult
};
