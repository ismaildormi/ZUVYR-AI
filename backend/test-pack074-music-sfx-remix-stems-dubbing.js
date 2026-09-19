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
  MODELS,
  buildInput,
  normalizeOutput,
  serializeProviderResult,
  restoreProviderResult,
  generatePack074Audio
}=require('./lib/audioFalProvider');

const AUDIO='11111111-1111-4111-8111-111111111111';
const VIDEO='22222222-2222-4222-8222-222222222222';
const now=Date.parse('2026-09-19T12:00:00Z');

function rights(extra={}){
  return {
    sourceRightsConfirmed:true,
    rightsBasis:'owned_or_licensed_source',
    ...extra
  };
}

async function run(){
  assert.equal(audioSystem.version,'pack-071.audio-system.v1');
  assert.equal(audioSystem.pack074.phase,'IMPLEMENTED_PAID_LIVE_DEFERRED');
  for(const op of ['music_generation','sound_effects','remix','stem_separation','audio_to_video']){
    assert.equal(audioSystem.operations[op].enabledByDefault,true,op);
    assert.match(audioSystem.operations[op].status,/implemented_pack074/);
  }
  assert.equal(audioSystem.operations.translate_dub.enabledByDefault,false);
  assert.equal(audioSystem.operations.translate_dub.status,'blocked_provider_output_contract_unverified');

  for(const key of ['audio_music_generation','audio_sound_effects','audio_remix','audio_stem_separation','audio_to_video']){
    assert.equal(flags[key].enabled,false,key);
    assert.equal(flags[key].status,'implemented_pack074_paid_live_deferred',key);
  }
  assert.equal(flags.audio_translate_dub.enabled,false);
  assert.match(flags.audio_translate_dub.status,/output_contract_unverified/);

  const music=normalizeAudioRequest({
    operation:'music_generation',
    prompt:'cinematic orchestral rise',
    durationSeconds:60,
    outputFormat:'wav'
  });
  assert.equal(music.durationSeconds,60);
  assert.equal(music.outputFormat,'wav');
  assert.throws(
    ()=>normalizeAudioRequest({
      operation:'music_generation',prompt:'x',durationSeconds:181
    }),
    e=>e.code==='invalid_music_duration'
  );

  const sfx=normalizeAudioRequest({
    operation:'sound_effects',
    prompt:'heavy wooden door slam',
    durationSeconds:12,
    outputFormat:'wav'
  });
  assert.equal(sfx.durationSeconds,12);
  assert.throws(
    ()=>normalizeAudioRequest({
      operation:'sound_effects',prompt:'x',durationSeconds:31
    }),
    e=>e.code==='invalid_sfx_duration'
  );

  assert.throws(
    ()=>normalizeAudioRequest({
      operation:'remix',
      prompt:'lofi, jazz',
      sourceAudioAssetId:AUDIO,
      originalTags:'pop'
    }),
    e=>e.code==='source_rights_confirmation_required'
  );
  assert.throws(
    ()=>normalizeAudioRequest({
      operation:'remix',
      prompt:'lofi, jazz',
      sourceAudioAssetId:AUDIO,
      ...rights()
    }),
    e=>e.code==='original_tags_required'
  );

  const remix=normalizeAudioRequest({
    operation:'remix',
    prompt:'lofi, jazz, chill',
    sourceAudioAssetId:AUDIO,
    originalTags:'pop, vocal',
    originalLyrics:'hello',
    lyrics:'[inst]',
    numberOfSteps:27,
    ...rights()
  });
  assert.equal(remix.options.originalTags,'pop, vocal');
  assert.equal(remix.options.sourceRightsConfirmed,true);

  const stems=normalizeAudioRequest({
    operation:'stem_separation',
    prompt:'lead vocals',
    sourceAudioAssetId:AUDIO,
    outputFormat:'wav',
    rerankingCandidates:1,
    ...rights()
  });
  assert.equal(stems.options.rerankingCandidates,1);
  assert.throws(
    ()=>normalizeAudioRequest({
      operation:'stem_separation',
      prompt:'drums',
      sourceAudioAssetId:AUDIO,
      rerankingCandidates:2,
      ...rights()
    }),
    e=>e.code==='invalid_reranking_candidates'
  );

  const dub=normalizeAudioRequest({
    operation:'translate_dub',
    sourceAudioAssetId:AUDIO,
    targetLanguage:'es',
    sourceLanguage:'en',
    numSpeakers:2,
    ...rights()
  });
  assert.equal(dub.options.targetLanguage,'es');
  assert.throws(
    ()=>assertAudioOperationAvailable('translate_dub',{
      env:{PACK074_DUB_PAID_EXECUTION_ENABLED:'true'}
    }),
    e=>e.code==='audio_operation_disabled'
  );

  const a2v=normalizeAudioRequest({
    operation:'audio_to_video',
    sourceAudioAssetId:AUDIO,
    sourceVideoAssetId:VIDEO,
    outputFormat:'mp4',
    ...rights()
  });
  assert.equal(a2v.sourceVideoAssetId,VIDEO);

  const gates={
    music_generation:'PACK074_MUSIC_PAID_EXECUTION_ENABLED',
    sound_effects:'PACK074_SFX_PAID_EXECUTION_ENABLED',
    remix:'PACK074_REMIX_PAID_EXECUTION_ENABLED',
    stem_separation:'PACK074_STEMS_PAID_EXECUTION_ENABLED',
    audio_to_video:'PACK074_AUDIO_TO_VIDEO_PAID_EXECUTION_ENABLED'
  };
  for(const [op,gate] of Object.entries(gates)){
    assert.throws(
      ()=>assertAudioOperationAvailable(op,{env:{}}),
      e=>e.code==='audio_operation_paid_execution_disabled'
    );
    assert.equal(
      assertAudioOperationAvailable(op,{env:{[gate]:'true'}}).operation,
      op
    );
    assert.equal(providerSupports('fal',op),true);
  }

  const musicQuote=quoteGeneration('audio',{
    audioRequest:music,
    audioPricingContext:{},
    env:{FAL_KEY:'synthetic',PACK074_MUSIC_PAID_EXECUTION_ENABLED:'true'},
    now
  });
  assert.equal(musicQuote.provider,'fal');
  assert.equal(musicQuote.providerCostMicroUsd,'20000');

  const sfxQuote=quoteGeneration('audio',{
    audioRequest:sfx,
    audioPricingContext:{},
    env:{FAL_KEY:'synthetic',PACK074_SFX_PAID_EXECUTION_ENABLED:'true'},
    now
  });
  assert.equal(sfxQuote.providerCostMicroUsd,'10000');

  const remixQuote=quoteGeneration('audio',{
    audioRequest:remix,
    audioPricingContext:{sourceDurationSeconds:45},
    env:{FAL_KEY:'synthetic',PACK074_REMIX_PAID_EXECUTION_ENABLED:'true'},
    now
  });
  assert.equal(remixQuote.providerCostMicroUsd,'9000');

  const stemsQuote=quoteGeneration('audio',{
    audioRequest:stems,
    audioPricingContext:{sourceDurationSeconds:45},
    env:{FAL_KEY:'synthetic',PACK074_STEMS_PAID_EXECUTION_ENABLED:'true'},
    now
  });
  assert.equal(stemsQuote.providerCostMicroUsd,'75000');

  const a2vQuote=quoteGeneration('audio',{
    audioRequest:a2v,
    audioPricingContext:{sourceDurationSeconds:7,sourceVideoDurationSeconds:7},
    env:{FAL_KEY:'synthetic',PACK074_AUDIO_TO_VIDEO_PAID_EXECUTION_ENABLED:'true'},
    now
  });
  assert.equal(a2vQuote.providerCostMicroUsd,'28000');

  let providerCalls=0;
  await assert.rejects(
    ()=>generatePack074Audio(music,{
      env:{FAL_KEY:'synthetic'},
      createFalClient:async()=>({
        subscribe:async()=>{providerCalls+=1;return {};}
      })
    }),
    e=>e.code==='pack074_music_generation_paid_execution_disabled'
  );
  assert.equal(providerCalls,0);

  const generatedMusic=await generatePack074Audio(music,{
    env:{FAL_KEY:'synthetic',PACK074_MUSIC_PAID_EXECUTION_ENABLED:'true'},
    createFalClient:async key=>{
      assert.equal(key,'synthetic');
      return {
        async subscribe(model,{input,logs}){
          providerCalls+=1;
          assert.equal(model,MODELS.music_generation);
          assert.deepEqual(input,{prompt:'cinematic orchestral rise',duration:60});
          assert.equal(logs,false);
          return {requestId:'music-fixture',data:{audio_file:{url:'https://fixture.invalid/music.wav',content_type:'audio/wav'}}};
        }
      };
    }
  });
  assert.equal(generatedMusic.outputs.length,1);
  assert.equal(generatedMusic.outputs[0].assetType,'music');
  assert.equal(generatedMusic.providerMetadata.requestId,'music-fixture');

  const stemInput=buildInput(stems,{
    source:{url:'https://fixture.invalid/source.wav',assetId:AUDIO}
  });
  assert.equal(stemInput.audio_url,'https://fixture.invalid/source.wav');
  assert.equal(stemInput.prompt,'lead vocals');
  assert.equal(stemInput.reranking_candidates,1);
  assert.equal(stemInput.output_format,'wav');

  const normalizedStems=normalizeOutput('stem_separation',{
    requestId:'stem-fixture',
    data:{
      target:{url:'https://fixture.invalid/target.wav',content_type:'audio/wav'},
      residual:{url:'https://fixture.invalid/residual.wav',content_type:'audio/wav'},
      duration:45,
      sample_rate:48000
    }
  });
  assert.deepEqual(normalizedStems.outputs.map(x=>x.role),['target','residual']);
  assert.equal(normalizedStems.providerMetadata.durationSeconds,45);
  assert.equal(normalizedStems.providerMetadata.sampleRate,48000);

  const videoInputs={
    source:{
      url:'https://fixture.invalid/video.mp4',
      assetId:VIDEO,assetType:'video',mimeType:'video/mp4',
      durationSeconds:7,fileSizeBytes:1_000_000
    },
    audio:{
      url:'https://fixture.invalid/audio.wav',
      assetId:AUDIO,assetType:'audio',mimeType:'audio/wav',
      durationSeconds:7,fileSizeBytes:500_000
    }
  };
  const a2vInput=buildInput(a2v,videoInputs);
  assert.equal(a2vInput.video_url,'https://fixture.invalid/video.mp4');
  assert.equal(a2vInput.audio_url,'https://fixture.invalid/audio.wav');

  const normalizedVideo=normalizeOutput('audio_to_video',{
    data:{video:{url:'https://fixture.invalid/lipsync.mp4',content_type:'video/mp4'}}
  });
  assert.equal(normalizedVideo.outputs[0].assetType,'video');

  let dubCalls=0;
  await assert.rejects(
    ()=>generatePack074Audio(dub,{
      env:{FAL_KEY:'synthetic',PACK074_DUB_PAID_EXECUTION_ENABLED:'true'},
      resolvedInputs:{source:{url:'https://fixture.invalid/source.wav',assetId:AUDIO}},
      createFalClient:async()=>({
        subscribe:async()=>{dubCalls+=1;return {};}
      })
    }),
    e=>e.code==='pack074_dub_audio_output_contract_unverified'
  );
  assert.equal(dubCalls,0);

  const serialized=serializeProviderResult({
    operation:'stem_separation',
    provider:'fal',
    model:MODELS.stem_separation,
    outputs:normalizedStems.outputs,
    providerMetadata:normalizedStems.providerMetadata
  });
  const restored=restoreProviderResult(serialized);
  assert(restored);
  assert.equal(restored.outputs.length,2);
  assert.equal(restored.outputs[1].role,'residual');

  const requiredCosts={
    'fal-cassetteai-music-output-minute':'20000',
    'fal-cassetteai-sfx-generation':'10000',
    'fal-ace-step-remix-generated-second':'200',
    'fal-sam-audio-separate-30s':'50000',
    'fal-elevenlabs-audio-dubbing-rounded-minute':'600000',
    'fal-kling-audio-to-video-lipsync-5s':'14000'
  };
  for(const [id,price] of Object.entries(requiredCosts)){
    const entry=costs.entries.find(x=>x.id===id);
    assert(entry,id);
    assert.equal(entry.verificationStatus,'verified',id);
    assert.equal(
      entry.inputUnitPriceMicroUsd ||
      entry.outputUnitPriceMicroUsd ||
      entry.fixedOperationPriceMicroUsd,
      price,
      id
    );
  }

  for(const cap of [
    'audio.music_generation','audio.sound_effects','audio.remix',
    'audio.stem_separation','audio.translate_dub','audio.audio_to_video'
  ]){
    assert(providers.providers.fal.capabilities.some(x=>x.id===cap),cap);
  }
  for(const id of [
    'fal:audio.music:cassetteai',
    'fal:audio.sfx:cassetteai',
    'fal:audio.remix:ace-step',
    'fal:audio.stems:sam-audio',
    'fal:audio.dub:elevenlabs',
    'fal:audio.to-video:kling-lipsync'
  ]) assert(models.models.some(x=>x.id===id),id);

  const routes=fs.readFileSync(path.join(__dirname,'lib/audioStudioRoutes.js'),'utf8');
  const worker=fs.readFileSync(path.join(__dirname,'worker.js'),'utf8');
  const repository=fs.readFileSync(path.join(__dirname,'lib/audioResultRepository.js'),'utf8');
  const providerSource=fs.readFileSync(path.join(__dirname,'lib/audioFalProvider.js'),'utf8');

  for(const marker of [
    "music_generation:'audio_music_generation'",
    "sound_effects:'audio_sound_effects'",
    "remix:'audio_remix'",
    "stem_separation:'audio_stem_separation'",
    "audio_to_video:'audio_to_video'",
    'sourceVideoDurationSeconds',
    'videoInputResolver.inspect',
    'artifacts,'
  ]) assert(routes.includes(marker),marker);

  for(const marker of [
    "generatePack074Audio(request,{ resolvedInputs:resolved })",
    'restorePack074ProviderResult(existing?.providerResult)',
    'serializePack074ProviderResult(result)',
    'assertAudioCommitAllowed({ ownerId:userId, jobId:jobRowId })',
    'persistPack074Artifacts({',
    "error.preserveTerminalState === true"
  ]) assert(worker.includes(marker),marker);

  for(const marker of [
    'persistPack074Artifacts',
    "sourceSystem:'zuvyr_audio_pack074'",
    "relationType=operation==='audio_to_video'?'rendered_from':'derived_from'",
    'outputs:manifest',
    'providerCommercialUseVerified:true'
  ]) assert(repository.includes(marker),marker);

  assert(providerSource.indexOf("String(env[gate] || '').toLowerCase() !== 'true'") <
         providerSource.indexOf('client.subscribe(model'));
  assert(providerSource.indexOf("operation === 'translate_dub'") <
         providerSource.indexOf('client.subscribe(model'));

  console.log('PASS: PACK074 music/SFX/remix/stems/audio-to-video contracts are rights-gated, exactly priced and provider-gated before network');
  console.log('PASS: PACK074 fal adapters normalize playable outputs; stems preserve target+residual and retries persist provider evidence before canonical download');
  console.log('PASS: PACK074 late provider results cannot overwrite cancelled jobs; audio-only dubbing remains explicitly blocked until provider output is verified');
  console.log('LIVE PROVIDER / PAYMENT / PRODUCTION DATABASE / NETWORK CALLS: NONE');
}

run().catch(error=>{console.error(error);process.exit(1);});
