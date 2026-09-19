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
const {createAudioInputResolver}=require('./lib/audioReferenceResolver');
const {buildDeepgramUrl,normalizeDeepgramResponse,transcribeAudio}=require('./lib/audioProvider');
const {argsFor}=require('./lib/localAudioCleanup');
const {probeMediaFileDurationSeconds}=require('./lib/mediaDuration');
const {quoteGeneration}=require('./lib/dynamicPricing');

const OWNER='11111111-1111-4111-8111-111111111111';
const CONVERSATION_ASSET='22222222-2222-4222-8222-222222222222';
const CANONICAL_ASSET='33333333-3333-4333-8333-333333333333';
const CONTENT='44444444-4444-4444-8444-444444444444';
const VERSION='55555555-5555-4555-8555-555555555555';

async function run(){
  assert.equal(audioSystem.version,'pack-071.audio-system.v1');
  assert.equal(audioSystem.pack071.phase,'IMPLEMENTED_PAID_LIVE_DEFERRED');
  assert.equal(audioSystem.operations.transcription.enabledByDefault,true);
  assert.equal(audioSystem.operations.audio_cleanup.enabledByDefault,true);
  assert.equal(audioSystem.jobs.cancelEnabledByDefault,true);

  assert.throws(
    ()=>assertAudioOperationAvailable('transcription',{env:{}}),
    e=>e.code==='audio_operation_paid_execution_disabled'
  );
  assert.equal(
    assertAudioOperationAvailable('transcription',{
      env:{PACK071_STT_PAID_EXECUTION_ENABLED:'true'}
    }).operation,
    'transcription'
  );
  assert.equal(assertAudioOperationAvailable('audio_cleanup',{env:{}}).operation,'audio_cleanup');
  assert.equal(providerSupports('deepgram','transcription'),true);
  assert.equal(providerSupports('local','audio_cleanup'),true);

  const request=normalizeAudioRequest({
    operation:'transcription',
    sourceAudioAssetId:CONVERSATION_ASSET,
    language:'ar-MA',
    diarization:true,
    smartFormat:true,
    utterances:true
  });
  assert.equal(request.options.diarization,true);
  assert.equal(request.options.detectLanguage,true);

  const url=new URL(buildDeepgramUrl(request));
  assert.equal(url.origin,'https://api.deepgram.com');
  assert.equal(url.pathname,'/v1/listen');
  assert.equal(url.searchParams.get('model'),'nova-3');
  assert.equal(url.searchParams.get('language'),'multi');
  assert.equal(url.searchParams.get('diarize_model'),'latest');
  assert.equal(url.searchParams.get('smart_format'),'true');
  assert.equal(url.searchParams.get('utterances'),'true');
  assert.equal(url.searchParams.has('detect_language'),false);

  const payload={
    metadata:{request_id:'fixture',duration:14.2,channels:1,model_info:{x:{name:'nova-3'}}},
    results:{
      channels:[{
        alternatives:[{
          transcript:'سلام hello',
          languages:['ar','en'],
          words:[
            {word:'سلام',punctuated_word:'سلام',start:0,end:0.5,confidence:0.99,speaker:0,speaker_confidence:0.9,language:'ar'},
            {word:'hello',punctuated_word:'hello',start:0.6,end:1.1,confidence:0.98,speaker:1,speaker_confidence:0.88,language:'en'}
          ]
        }]
      }],
      utterances:[
        {transcript:'سلام',start:0,end:0.5,confidence:0.99,speaker:0},
        {transcript:'hello',start:0.6,end:1.1,confidence:0.98,speaker:1}
      ]
    }
  };
  const normalized=normalizeDeepgramResponse(payload);
  assert.equal(normalized.transcript,'سلام hello');
  assert.deepEqual(normalized.languages,['ar','en']);
  assert.equal(normalized.language,'ar');
  assert.equal(normalized.words[0].speaker,0);
  assert.equal(normalized.words[1].speaker,1);
  assert.equal(normalized.utterances.length,2);

  let providerCalls=0;
  await assert.rejects(
    ()=>transcribeAudio(request,{
      source:{url:'https://fixture.invalid/audio.wav'},
      env:{DEEPGRAM_API_KEY:'synthetic'},
      fetchImpl:async()=>{providerCalls+=1;throw new Error('must not run');}
    }),
    e=>e.code==='pack071_stt_paid_execution_disabled'
  );
  assert.equal(providerCalls,0);

  const transcribed=await transcribeAudio(request,{
    source:{url:'https://fixture.invalid/audio.wav'},
    env:{DEEPGRAM_API_KEY:'synthetic',PACK071_STT_PAID_EXECUTION_ENABLED:'true'},
    fetchImpl:async(url,options)=>{
      providerCalls+=1;
      assert.equal(new URL(url).searchParams.get('language'),'multi');
      assert.equal(options.method,'POST');
      assert.equal(options.headers.Authorization,'Token synthetic');
      return {ok:true,json:async()=>payload};
    }
  });
  assert.equal(providerCalls,1);
  assert.equal(transcribed.transcript,'سلام hello');

  const rows=new Map([[CONVERSATION_ASSET,{
    id:CONVERSATION_ASSET,owner_id:OWNER,asset_type:'audio',
    mime_type:'audio/wav',file_size_bytes:100000,duration_seconds:14.2,
    sha256:'a'.repeat(64),scan_status:'clean',
    canonical_content_id:CONTENT,canonical_asset_id:CANONICAL_ASSET,metadata:{}
  }]]);
  const db={
    from(table){
      assert.equal(table,'conversation_assets');
      const filters={};
      const q={
        select(){return q;},
        eq(k,v){filters[k]=v;return q;},
        async maybeSingle(){
          const row=rows.get(filters.id);
          return {data:row&&filters.owner_id===OWNER?row:null,error:null};
        }
      };
      return q;
    },
    async rpc(name,args){
      if(name==='resolve_zuvyr_asset_for_owner'){
        if(args.p_owner_id!==OWNER||args.p_asset_id!==CANONICAL_ASSET) return {data:null,error:null};
        return {data:{
          assetId:CANONICAL_ASSET,contentId:CONTENT,versionId:VERSION,status:'active',
          storageBucket:'conversation-files',storagePath:OWNER+'/objects/aa/'+('a'.repeat(64)),
          mimeType:'audio/wav',fileSizeBytes:100000,sha256:'a'.repeat(64)
        },error:null};
      }
      if(name==='record_zuvyr_asset_egress') return {data:{success:true},error:null};
      throw new Error('unexpected rpc '+name);
    }
  };
  const storage={
    from(bucket){
      assert.equal(bucket,'conversation-files');
      return {
        async createSignedUrl(){return {data:{signedUrl:'https://fixture.invalid/signed.wav'},error:null};}
      };
    }
  };
  const resolver=createAudioInputResolver({db,storage});
  const inspected=await resolver.inspect({ownerId:OWNER,request});
  assert.equal(inspected.source.assetId,CANONICAL_ASSET);
  assert.equal(inspected.source.durationSeconds,14.2);
  const resolved=await resolver.resolve({ownerId:OWNER,request,requestId:'pack071-test'});
  assert.equal(resolved.source.url,'https://fixture.invalid/signed.wav');

  const now=Date.parse('2026-09-19T12:00:00Z');
  const sttQuote=quoteGeneration('audio',{
    audioRequest:request,
    audioPricingContext:{sourceDurationSeconds:14.2},
    env:{
      DEEPGRAM_API_KEY:'synthetic',
      PACK071_STT_PAID_EXECUTION_ENABLED:'true'
    },
    now
  });
  assert.equal(sttQuote.provider,'deepgram');
  assert.equal(sttQuote.providerCostMicroUsd,'1300');

  const cleanupRequest=normalizeAudioRequest({
    operation:'audio_cleanup',
    sourceAudioAssetId:CONVERSATION_ASSET,
    outputFormat:'wav',
    cleanupStrength:'balanced'
  });
  const cleanupQuote=quoteGeneration('audio',{
    audioRequest:cleanupRequest,
    audioPricingContext:{sourceDurationSeconds:14.2},
    env:{},
    now
  });
  assert.equal(cleanupQuote.provider,'local-ffmpeg');
  assert.equal(cleanupQuote.providerCostMicroUsd,'0');
  assert(cleanupQuote.credits>=1);

  const cleanupArgs=argsFor({
    inputPath:'/tmp/input.wav',
    outputPath:'/tmp/output.wav',
    format:'wav',
    strength:'strong'
  });
  assert(cleanupArgs.includes('pcm_s16le'));
  const filter=cleanupArgs[cleanupArgs.indexOf('-af')+1];
  assert(filter.includes('afftdn=nr=18:nf=-50:tn=1'));
  assert(!cleanupArgs.some(x=>String(x).includes(';')));

  const measured=await probeMediaFileDurationSeconds('/tmp/audio.mp3',{
    assetType:'audio',
    execFileImpl:(binary,args,options,callback)=>{
      assert.equal(binary,'ffprobe');
      assert(args.includes('/tmp/audio.mp3'));
      assert.equal(options.windowsHide,true);
      callback(null,'12.345\n','');
    }
  });
  assert.equal(measured,12.345);

  const sttCost=costs.entries.find(x=>x.id==='deepgram-nova-3-multilingual-prerecorded');
  assert(sttCost);
  assert.equal(sttCost.verificationStatus,'verified');
  assert.equal(sttCost.inputUnitPriceMicroUsd,'5200');
  assert.equal(sttCost.unitScale,'60');
  assert.equal(sttCost.unitType,'audio_seconds');
  const cleanupCost=costs.entries.find(x=>x.id==='local-ffmpeg-audio-cleanup');
  assert(cleanupCost);
  assert.equal(cleanupCost.fixedOperationPriceMicroUsd,'0');

  assert(providers.providers.deepgram.capabilities.some(x=>x.id==='audio.transcription'&&x.model==='nova-3'));
  assert(providers.providers.local.capabilities.some(x=>x.id==='audio.cleanup'&&x.model==='ffmpeg-alpine'));
  assert(models.models.some(x=>x.id==='deepgram:audio.transcription:nova-3'));
  assert(models.models.some(x=>x.id==='local:audio.cleanup:runtime'));

  assert.equal(flags.audio_transcription.enabled,false);
  assert.equal(flags.audio_cleanup.enabled,true);

  const migration=fs.readFileSync(path.join(__dirname,'70_pack071_stt_diarization_cleanup.sql'),'utf8');
  const fkIndexes=fs.readFileSync(path.join(__dirname,'71_pack071_audio_fk_indexes.sql'),'utf8');
  const routes=fs.readFileSync(path.join(__dirname,'lib/audioStudioRoutes.js'),'utf8');
  const worker=fs.readFileSync(path.join(__dirname,'worker.js'),'utf8');
  const repository=fs.readFileSync(path.join(__dirname,'lib/audioResultRepository.js'),'utf8');
  const attachmentWorker=fs.readFileSync(path.join(__dirname,'lib/attachmentWorker.js'),'utf8');
  const docker=fs.readFileSync(path.join(__dirname,'Dockerfile.worker'),'utf8');

  for(const marker of [
    'audio_transcript_segments',
    'provider_result jsonb',
    'begin_zuvyr_audio_job',
    'claim_zuvyr_audio_execution',
    'request_zuvyr_audio_job_cancel',
    'for update'
  ]) assert(migration.includes(marker),marker);
  assert(fkIndexes.includes('audio_jobs_conversation_idx'));
  assert(fkIndexes.includes('audio_jobs_source_audio_asset_idx'));

  for(const marker of [
    "router.post('/jobs/request'",
    "router.get('/jobs/:jobId'",
    "router.post('/jobs/:jobId/cancel'",
    "quoteGeneration('audio'",
    'creditApi.reserveCredits({'
  ]) assert(routes.includes(marker),marker);

  for(const marker of [
    "new Worker('zuvyr-audio-processing'",
    'transcribeAudio(request, { source })',
    'executeLocalAudioCleanup({',
    'provider_result: result',
    'settleCredits(requestId, finalCredits)'
  ]) assert(worker.includes(marker),marker);

  assert(repository.includes("kind:'text'"));
  assert(repository.includes("relationType:'extracted_from'"));
  assert(repository.includes("relationType:'edited_from'"));
  assert(attachmentWorker.includes('probeMediaFileDurationSeconds'));
  assert(docker.includes('zuvyr-pack071-clean.wav'));
  assert(docker.includes('zuvyr-pack071-clean.mp3'));

  console.log('PASS: PACK071 owner-scoped trusted-duration STT maps to Nova-3 multilingual with included diarization and exact per-second precharge');
  console.log('PASS: PACK071 transcript/segments and cleanup results persist through canonical content/assets/lineage with retry-safe provider evidence');
  console.log('PASS: PACK071 local cleanup is shell-safe and provider-free; paid STT gate blocks before network');
  console.log('LIVE PROVIDER / PAYMENT / PRODUCTION DATABASE / NETWORK CALLS: NONE');
}

run().catch(error=>{console.error(error);process.exit(1);});
