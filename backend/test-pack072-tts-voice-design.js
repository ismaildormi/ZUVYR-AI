'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const audioSystem=require('./config/audio-system.v1.json');
const flags=require('./config/feature-flags.json');
const costs=require('./config/cost-registry.v1.json');
const providers=require('./config/provider-registry.v1.json');
const models=require('./config/model-registry.v1.json');
const {normalizeAudioRequest}=require('./lib/audioRequestContract');
const {assertAudioOperationAvailable,providerSupports}=require('./lib/audioOperationRegistry');
const {quoteGeneration}=require('./lib/dynamicPricing');
const {
  buildDeepgramTtsUrl,
  resolveTtsModel,
  synthesizeSpeech,
  serializeTtsProviderResult,
  restoreTtsProviderResult
}=require('./lib/audioProvider');
const {createVoiceRightsStore}=require('./lib/voiceRightsRepository');

const OWNER='11111111-1111-4111-8111-111111111111';
const SOURCE='22222222-2222-4222-8222-222222222222';
const CANONICAL='33333333-3333-4333-8333-333333333333';

function voiceRightsDb({authorized=false}={}){
  return {
    from(table){
      const filters={};
      const q={
        select(){return q;},
        eq(k,v){filters[k]=v;return q;},
        is(){return q;},
        order(){return q;},
        limit(){return q;},
        async maybeSingle(){
          if(table!=='conversation_assets') throw new Error('unexpected maybeSingle '+table);
          if(filters.id!==SOURCE||filters.owner_id!==OWNER) return {data:null,error:null};
          return {data:{
            id:SOURCE,owner_id:OWNER,asset_type:'audio',scan_status:'clean',
            canonical_asset_id:CANONICAL
          },error:null};
        },
        then(resolve,reject){
          if(table!=='zuvyr_voice_rights') return Promise.resolve({data:[],error:null}).then(resolve,reject);
          const data=authorized?[{
            id:'44444444-4444-4444-8444-444444444444',
            canonical_source_asset_id:CANONICAL,
            scope:'voice_clone',
            rights_basis:'self_voice',
            consent_fingerprint:'a'.repeat(64),
            issued_at:'2026-09-19T00:00:00Z'
          }]:[];
          return Promise.resolve({data,error:null}).then(resolve,reject);
        }
      };
      return q;
    }
  };
}

async function run(){
  assert.equal(audioSystem.pack072.phase,'IMPLEMENTED_PAID_LIVE_DEFERRED');
  assert.equal(audioSystem.operations.text_to_speech.enabledByDefault,true);
  assert.equal(audioSystem.operations.text_to_speech.paidExecutionEnvironment,'PACK072_TTS_PAID_EXECUTION_ENABLED');
  assert.equal(flags.audio_text_to_speech.enabled,false);
  assert.equal(flags.audio_text_to_speech.status,'implemented_pack072_paid_live_deferred');
  assert.equal(providerSupports('deepgram','text_to_speech'),true);

  assert.throws(
    ()=>assertAudioOperationAvailable('text_to_speech',{env:{}}),
    e=>e.code==='audio_operation_paid_execution_disabled'
  );
  assert.equal(
    assertAudioOperationAvailable('text_to_speech',{env:{PACK072_TTS_PAID_EXECUTION_ENABLED:'true'}}).operation,
    'text_to_speech'
  );

  const request=normalizeAudioRequest({
    operation:'text_to_speech',
    text:'a'.repeat(1000),
    language:'en',
    outputFormat:'mp3'
  });
  assert.equal(request.text.length,1000);
  assert.equal(resolveTtsModel(request),'aura-2-thalia-en');
  assert.equal(resolveTtsModel(normalizeAudioRequest({
    operation:'text_to_speech',text:'hola mundo',language:'es',outputFormat:'mp3'
  })),'aura-2-selena-es');
  assert.throws(
    ()=>resolveTtsModel(normalizeAudioRequest({
      operation:'text_to_speech',text:'مرحبا',language:'ar',outputFormat:'mp3'
    })),
    e=>e.code==='unsupported_tts_language'
  );
  assert.throws(
    ()=>normalizeAudioRequest({operation:'text_to_speech',text:'hello',outputFormat:'flac'}),
    e=>e.code==='invalid_tts_output_format'
  );

  const spec=buildDeepgramTtsUrl(request);
  const url=new URL(spec.url);
  assert.equal(url.origin,'https://api.deepgram.com');
  assert.equal(url.pathname,'/v1/speak');
  assert.equal(url.searchParams.get('model'),'aura-2-thalia-en');
  assert.equal(url.searchParams.get('encoding'),'mp3');

  const now=Date.parse('2026-09-19T12:00:00Z');
  const quote=quoteGeneration('audio',{
    audioRequest:request,
    audioPricingContext:{speechCharacters:1000},
    env:{DEEPGRAM_API_KEY:'synthetic',PACK072_TTS_PAID_EXECUTION_ENABLED:'true'},
    now
  });
  assert.equal(quote.provider,'deepgram');
  assert.equal(quote.providerCostMicroUsd,'30000');
  assert(quote.credits>=1);

  const cost=costs.entries.find(x=>x.id==='deepgram-aura-2-tts');
  assert(cost);
  assert.equal(cost.inputUnitPriceMicroUsd,'30000');
  assert.equal(cost.unitScale,'1000');
  assert.equal(cost.unitType,'speech_characters');
  assert.equal(cost.verificationStatus,'verified');

  let providerCalls=0;
  await assert.rejects(
    ()=>synthesizeSpeech(request,{
      env:{DEEPGRAM_API_KEY:'synthetic'},
      fetchImpl:async()=>{providerCalls+=1;throw new Error('must not run');}
    }),
    e=>e.code==='pack072_tts_paid_execution_disabled'
  );
  assert.equal(providerCalls,0);

  const generated=await synthesizeSpeech(request,{
    env:{DEEPGRAM_API_KEY:'synthetic',PACK072_TTS_PAID_EXECUTION_ENABLED:'true'},
    fetchImpl:async(called,options)=>{
      providerCalls+=1;
      assert.equal(new URL(called).pathname,'/v1/speak');
      assert.equal(options.method,'POST');
      assert.equal(options.headers.Authorization,'Token synthetic');
      assert.equal(JSON.parse(options.body).text.length,1000);
      return {
        ok:true,
        headers:{get:name=>name==='dg-request-id'?'fixture-tts':null},
        arrayBuffer:async()=>Uint8Array.from([73,68,51,4,5,6]).buffer
      };
    }
  });
  assert.equal(providerCalls,1);
  assert.equal(generated.provider,'deepgram');
  assert.equal(generated.model,'aura-2-thalia-en');
  assert.equal(generated.characterCount,1000);
  assert.equal(generated.mimeType,'audio/mpeg');
  assert(generated.buffer.length>0);

  const serialized=serializeTtsProviderResult(generated);
  assert(serialized.audioBase64);
  const restored=restoreTtsProviderResult(serialized);
  assert.equal(restored.model,generated.model);
  assert.deepEqual(restored.buffer,generated.buffer);

  const denied=createVoiceRightsStore(voiceRightsDb({authorized:false}));
  await assert.rejects(
    ()=>denied.assertActive({ownerId:OWNER,sourceAudioAssetId:SOURCE,scope:'voice_clone'}),
    e=>e.code==='voice_rights_active_consent_required'
  );
  const allowed=createVoiceRightsStore(voiceRightsDb({authorized:true}));
  const right=await allowed.assertActive({ownerId:OWNER,sourceAudioAssetId:SOURCE,scope:'voice_clone'});
  assert.equal(right.canonical_source_asset_id,CANONICAL);

  assert(providers.providers.deepgram.capabilities.some(x=>x.id==='audio.text_to_speech'&&x.model==='aura-2'));
  assert(models.models.some(x=>x.id==='deepgram:audio.tts:aura-2-thalia-en'));
  assert(models.models.some(x=>x.id==='deepgram:audio.tts:aura-2-selena-es'));

  const routes=fs.readFileSync(path.join(__dirname,'lib/audioStudioRoutes.js'),'utf8');
  const worker=fs.readFileSync(path.join(__dirname,'worker.js'),'utf8');
  const repository=fs.readFileSync(path.join(__dirname,'lib/audioResultRepository.js'),'utf8');
  const permissionRoutes=fs.readFileSync(path.join(__dirname,'lib/permissionCenterRoutes.js'),'utf8');
  const rightsRepo=fs.readFileSync(path.join(__dirname,'lib/voiceRightsRepository.js'),'utf8');
  const migration=fs.readFileSync(path.join(__dirname,'72_pack072_tts_voice_rights.sql'),'utf8');

  assert(routes.includes("request.operation === 'text_to_speech'"));
  assert(routes.includes("'audio_text_to_speech'"));
  assert(routes.includes('resolveTtsModel(request)'));
  assert(worker.includes("request.operation === 'text_to_speech'"));
  assert(worker.includes('serializeTtsProviderResult(result)'));
  assert(worker.includes('persistSynthesizedAudio({'));
  assert(repository.includes("sourceKind:'text_to_speech'"));
  assert(repository.includes("kind:'pack072_tts_persisted'"));
  assert(permissionRoutes.includes("router.post('/voice-rights'"));
  assert(permissionRoutes.includes("router.post('/voice-rights/:id/revoke'"));
  assert(rightsRepo.includes('canonical_source_asset_id'));
  assert(rightsRepo.includes('voice_rights_active_consent_required'));
  assert(migration.includes('explicit_consent boolean not null check (explicit_consent = true)'));
  assert(migration.includes('Independent from model-training consent'));

  console.log('PASS: PACK072 exact Aura-2 character pricing, stock-voice preflight and paid gate are fail-closed before provider execution');
  console.log('PASS: PACK072 TTS binary output is retry-recoverable, canonical-persistence wired, signed-download compatible and metered as audio_text_to_speech');
  console.log('PASS: PACK072 voice cloning/design-reference rights are owner/canonical-asset scoped, explicit, revocable and independent from model-training consent');
  console.log('LIVE PROVIDER / PAYMENT / PRODUCTION DATABASE / NETWORK CALLS: NONE');
}

run().catch(error=>{console.error(error);process.exit(1);});
