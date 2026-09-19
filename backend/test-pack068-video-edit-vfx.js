'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const videoSystem = require('./config/video-system.v1.json');
const costRegistry = require('./config/cost-registry.v1.json');
const providerRegistry = require('./config/provider-registry.v1.json');
const modelRegistry = require('./config/model-registry.v1.json');
const { CONFIG: ASSET_CONFIG } = require('./lib/assetStorageContract');
const { normalizeVideoRequest } = require('./lib/videoRequestContract');
const {
  assertVideoRequestAvailable,
  providerSupports
} = require('./lib/videoOperationRegistry');
const {
  DEFAULT_VIDEO_EDIT_MODEL,
  DEFAULT_VIDEO_EXTEND_MODEL,
  DEFAULT_VIDEO_OBJECT_REMOVE_MODEL,
  DEFAULT_VIDEO_BACKGROUND_REMOVE_MODEL,
  DEFAULT_VIDEO_RELIGHT_MODEL,
  DEFAULT_VIDEO_RECAMERA_MODEL,
  DEFAULT_VIDEO_LIPSYNC_MODEL,
  buildFalRetakeInput,
  buildFalExtendInput,
  buildFalObjectRemoveInput,
  buildFalBackgroundRemoveInput,
  buildFalRelightInput,
  buildFalRecameraInput,
  buildFalLipSyncInput,
  generateVideo
} = require('./lib/videoProvider');
const { createVideoInputResolver } = require('./lib/videoReferenceResolver');
const { quoteGeneration } = require('./lib/dynamicPricing');
const {
  readWavDurationSeconds,
  readTrustedMediaDurationSeconds
} = require('./lib/mediaDuration');

const OWNER='11111111-1111-4111-8111-111111111111';
const VIDEO4='22222222-2222-4222-8222-222222222222';
const VIDEO7='33333333-3333-4333-8333-333333333333';
const AUDIO5='44444444-4444-4444-8444-444444444444';
const A_VIDEO4='55555555-5555-4555-8555-555555555555';
const A_VIDEO7='66666666-6666-4666-8666-666666666666';
const A_AUDIO5='77777777-7777-4777-8777-777777777777';

function makeWav(seconds=2, sampleRate=8000) {
  const channels=1;
  const bits=16;
  const byteRate=sampleRate*channels*(bits/8);
  const dataBytes=Math.floor(byteRate*seconds);
  const b=Buffer.alloc(44+dataBytes);
  b.write('RIFF',0,'ascii');
  b.writeUInt32LE(36+dataBytes,4);
  b.write('WAVE',8,'ascii');
  b.write('fmt ',12,'ascii');
  b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20);
  b.writeUInt16LE(channels,22);
  b.writeUInt32LE(sampleRate,24);
  b.writeUInt32LE(byteRate,28);
  b.writeUInt16LE(channels*(bits/8),32);
  b.writeUInt16LE(bits,34);
  b.write('data',36,'ascii');
  b.writeUInt32LE(dataBytes,40);
  return b;
}

function makeFixture() {
  const calls=[];
  const rows=new Map([
    [VIDEO4,{id:VIDEO4,owner_id:OWNER,asset_type:'video',mime_type:'video/mp4',file_size_bytes:4000000,duration_seconds:4,sha256:'a'.repeat(64),scan_status:'clean',canonical_content_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',canonical_asset_id:A_VIDEO4,metadata:{}}],
    [VIDEO7,{id:VIDEO7,owner_id:OWNER,asset_type:'video',mime_type:'video/mp4',file_size_bytes:7000000,duration_seconds:7,sha256:'b'.repeat(64),scan_status:'clean',canonical_content_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',canonical_asset_id:A_VIDEO7,metadata:{}}],
    [AUDIO5,{id:AUDIO5,owner_id:OWNER,asset_type:'audio',mime_type:'audio/wav',file_size_bytes:80000,duration_seconds:5,sha256:'c'.repeat(64),scan_status:'clean',canonical_content_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',canonical_asset_id:A_AUDIO5,metadata:{}}]
  ]);
  const assetToRow=new Map([...rows.values()].map(row=>[row.canonical_asset_id,row]));
  const db={
    from(table){
      assert.equal(table,'conversation_assets');
      const filters={};
      const q={
        select(){return q;},
        eq(key,value){filters[key]=value;return q;},
        async maybeSingle(){
          const row=rows.get(filters.id);
          return {data:row&&filters.owner_id===OWNER?row:null,error:null};
        }
      };
      return q;
    },
    async rpc(name,args){
      calls.push({name,args});
      if(name==='resolve_zuvyr_asset_for_owner'){
        const row=assetToRow.get(args.p_asset_id);
        return {data:row&&args.p_owner_id===OWNER?{
          assetId:row.canonical_asset_id,
          contentId:row.canonical_content_id,
          versionId:'88888888-8888-4888-8888-'+row.id.slice(0,12),
          status:'active',
          storageBucket:ASSET_CONFIG.bucket,
          storagePath:OWNER+'/objects/aa/'+row.sha256,
          mimeType:row.mime_type,
          fileSizeBytes:row.file_size_bytes,
          sha256:row.sha256
        }:null,error:null};
      }
      if(name==='record_zuvyr_asset_egress') return {data:{ok:true},error:null};
      throw new Error('unexpected_rpc:'+name);
    }
  };
  const storage={
    from(bucket){
      assert.equal(bucket,ASSET_CONFIG.bucket);
      return {
        async createSignedUrl(storagePath){
          calls.push({name:'sign',storagePath});
          return {data:{signedUrl:'https://fixture.invalid/'+storagePath.split('/').pop()+'?signed=1'},error:null};
        }
      };
    }
  };
  return {resolver:createVideoInputResolver({db,storage}),calls};
}

async function run(){
  assert.equal(videoSystem.pack068.phase,'IMPLEMENTED_PAID_LIVE_DEFERRED');
  assert.equal(videoSystem.operations.edit.status,'implemented_pack068_paid_live_deferred');
  assert.equal(videoSystem.operations.relight.enabledByDefault,false);
  assert.equal(videoSystem.operations.recamera.enabledByDefault,false);

  for(const [operation,gate] of [
    ['edit','PACK068_EDIT_PAID_EXECUTION_ENABLED'],
    ['extend','PACK068_EXTEND_PAID_EXECUTION_ENABLED'],
    ['object_remove','PACK068_OBJECT_REMOVE_PAID_EXECUTION_ENABLED'],
    ['background_remove','PACK068_BACKGROUND_PAID_EXECUTION_ENABLED'],
    ['lip_sync','PACK068_LIPSYNC_PAID_EXECUTION_ENABLED']
  ]){
    assert.throws(
      ()=>assertVideoRequestAvailable({operation},{env:{}}),
      e=>e.code==='video_operation_paid_execution_disabled'
    );
    assert.equal(
      assertVideoRequestAvailable({operation},{env:{[gate]:'true'}}).operation,
      operation
    );
    assert.equal(providerSupports('fal',operation),true);
  }
  for(const operation of ['relight','recamera']){
    assert.throws(
      ()=>assertVideoRequestAvailable({operation},{env:{}}),
      e=>e.code==='video_operation_disabled'
    );
  }

  const edit=normalizeVideoRequest({
    videoOperation:'edit',
    prompt:'Turn the flower red',
    sourceVideoAssetId:VIDEO7,
    videoOptions:{durationSeconds:5,startTimeSeconds:1,retakeMode:'replace_video'}
  });
  const extend=normalizeVideoRequest({
    videoOperation:'extend',
    prompt:'Continue the motion',
    sourceVideoAssetId:VIDEO7,
    videoOptions:{durationSeconds:8,extendMode:'end',contextSeconds:4}
  });
  const erase=normalizeVideoRequest({
    videoOperation:'object_remove',
    prompt:'remove the cup',
    sourceVideoAssetId:VIDEO4,
    videoOptions:{preserveAudio:true}
  });
  const bg=normalizeVideoRequest({
    videoOperation:'background_remove',
    sourceVideoAssetId:VIDEO4,
    videoOptions:{backgroundColor:'Black',preserveAudio:true,autoZoom:false}
  });
  const relight=normalizeVideoRequest({
    videoOperation:'relight',
    prompt:'warm sunset light',
    sourceVideoAssetId:VIDEO4,
    videoOptions:{lightDirection:'Right',useSkyMask:true,seed:68}
  });
  const recamera=normalizeVideoRequest({
    videoOperation:'recamera',
    prompt:'smooth orbit',
    sourceVideoAssetId:VIDEO4,
    videoOptions:{
      cameraMode:'traj',
      motionMode:'gradual',
      trajectory:{theta:[0,5],phi:[0,-2],radius:[0,0.1]},
      seed:9
    }
  });
  const lipsync=normalizeVideoRequest({
    videoOperation:'lip_sync',
    sourceVideoAssetId:VIDEO7,
    sourceAudioAssetId:AUDIO5
  });

  const fixture=makeFixture();
  const editResolved=await fixture.resolver.resolve({ownerId:OWNER,request:edit,requestId:'edit'});
  const extendResolved=await fixture.resolver.resolve({ownerId:OWNER,request:extend,requestId:'extend'});
  const eraseResolved=await fixture.resolver.resolve({ownerId:OWNER,request:erase,requestId:'erase'});
  const bgResolved=await fixture.resolver.resolve({ownerId:OWNER,request:bg,requestId:'bg'});
  const relightResolved=await fixture.resolver.resolve({ownerId:OWNER,request:relight,requestId:'relight'});
  const recameraResolved=await fixture.resolver.resolve({ownerId:OWNER,request:recamera,requestId:'recamera'});
  const lipResolved=await fixture.resolver.resolve({ownerId:OWNER,request:lipsync,requestId:'lip'});

  assert.equal(editResolved.source.durationSeconds,7);
  assert.equal(lipResolved.audio.durationSeconds,5);
  assert.equal(JSON.stringify(lipResolved.lineage).includes('signed=1'),false);

  assert.deepEqual(buildFalRetakeInput(edit,editResolved),{
    video_url:editResolved.source.url,
    prompt:'Turn the flower red',
    start_time:1,
    duration:5,
    retake_mode:'replace_video'
  });
  assert.deepEqual(buildFalExtendInput(extend,extendResolved),{
    video_url:extendResolved.source.url,
    duration:8,
    mode:'end',
    prompt:'Continue the motion',
    context:4
  });
  assert.deepEqual(buildFalObjectRemoveInput(erase,eraseResolved),{
    output_container_and_codec:'mp4_h264',
    auto_trim:true,
    preserve_audio:true,
    prompt:'remove the cup',
    video_url:eraseResolved.source.url
  });
  assert.deepEqual(buildFalBackgroundRemoveInput(bg,bgResolved),{
    output_container_and_codec:'mp4_h264',
    preserve_audio:true,
    video_url:bgResolved.source.url,
    background_color:'Black',
    auto_zoom:false
  });
  const relightInput=buildFalRelightInput(relight,relightResolved);
  assert.equal(relightInput.relit_cond_type,'ic');
  assert.equal(relightInput.relight_parameters.bg_source,'Right');
  assert.equal(relightInput.relight_parameters.cfg,2);
  const recameraInput=buildFalRecameraInput(recamera,recameraResolved);
  assert.equal(recameraInput.camera,'traj');
  assert.deepEqual(recameraInput.trajectory.theta,[0,5]);
  assert.deepEqual(buildFalLipSyncInput(lipsync,lipResolved),{
    video_url:lipResolved.source.url,
    audio_url:lipResolved.audio.url
  });

  let falCalls=0;
  await assert.rejects(
    ()=>generateVideo(edit,{
      env:{FAL_KEY:'synthetic'},
      resolvedInputs:editResolved,
      createFalClient:async()=>({subscribe:async()=>{falCalls+=1;}})
    }),
    /pack068_edit_paid_execution_disabled/
  );
  assert.equal(falCalls,0);

  const generated=await generateVideo(edit,{
    env:{FAL_KEY:'synthetic',PACK068_EDIT_PAID_EXECUTION_ENABLED:'true'},
    resolvedInputs:editResolved,
    createFalClient:async key=>({
      async subscribe(model,{input}){
        falCalls+=1;
        assert.equal(key,'synthetic');
        assert.equal(model,DEFAULT_VIDEO_EDIT_MODEL);
        assert.equal(input.video_url,editResolved.source.url);
        return {data:{video:{url:'https://fixture.invalid/edit.mp4'}}};
      }
    })
  });
  assert.equal(generated.provider,'fal');
  assert.equal(generated.billableUnits.unitType,'video_seconds');
  assert.equal(generated.billableUnits.units,5);
  assert.equal(falCalls,1);

  const now=Date.parse('2026-09-19T01:00:00Z');
  const q=(request,gate,context)=>quoteGeneration('video',{
    videoRequest:request,
    videoPricingContext:context,
    env:{FAL_KEY:'synthetic',[gate]:'true'},
    now
  });
  assert.equal(q(edit,'PACK068_EDIT_PAID_EXECUTION_ENABLED',{sourceDurationSeconds:7}).providerCostMicroUsd,'500000');
  assert.equal(q(extend,'PACK068_EXTEND_PAID_EXECUTION_ENABLED',{sourceDurationSeconds:7}).providerCostMicroUsd,'800000');
  assert.equal(q(erase,'PACK068_OBJECT_REMOVE_PAID_EXECUTION_ENABLED',{sourceDurationSeconds:4}).providerCostMicroUsd,'560000');
  assert.equal(q(bg,'PACK068_BACKGROUND_PAID_EXECUTION_ENABLED',{sourceDurationSeconds:4}).providerCostMicroUsd,'200000');
  assert.equal(q(lipsync,'PACK068_LIPSYNC_PAID_EXECUTION_ENABLED',{
    sourceDurationSeconds:7,
    sourceFileSizeBytes:7000000,
    sourceMimeType:'video/mp4',
    audioDurationSeconds:5,
    audioFileSizeBytes:80000,
    audioMimeType:'audio/wav'
  }).providerCostMicroUsd,'28000');
  assert.equal(
    q(
      erase,
      'PACK068_OBJECT_REMOVE_PAID_EXECUTION_ENABLED',
      {sourceDurationSeconds:4.5}
    ).providerCostMicroUsd,
    '630000'
  );
  assert.equal(
    q(
      bg,
      'PACK068_BACKGROUND_PAID_EXECUTION_ENABLED',
      {sourceDurationSeconds:4.5}
    ).providerCostMicroUsd,
    '225000'
  );
  assert.throws(
    ()=>quoteGeneration('video',{
      videoRequest:relight,
      videoPricingContext:{sourceDurationSeconds:4},
      env:{FAL_KEY:'synthetic'},
      now
    }),
    /pack068_output_duration_precharge_pricing_unavailable/
  );

  const expectedCosts=[
    'fal-ltx23-retake-second','fal-ltx23-extend-second',
    'fal-bria-video-erase-prompt-second','fal-bria-video-background-v3-second',
    'fal-lightx-relight-output-second','fal-lightx-recamera-output-second',
    'fal-kling-lipsync-5s-increment'
  ];
  for(const id of expectedCosts){
    const entry=costRegistry.entries.find(x=>x.id===id);
    assert(entry,'missing cost entry '+id);
    assert.equal(entry.verificationStatus,'verified');
    if (id !== 'fal-kling-lipsync-5s-increment') {
      assert.equal(entry.unitScale,'1000');
    }
  }
  assert.equal(costRegistry.entries.find(x=>x.id==='fal-lightx-relight-output-second').enabledState,'blocked');
  assert.equal(costRegistry.entries.find(x=>x.id==='fal-lightx-recamera-output-second').enabledState,'blocked');

  const falCaps=providerRegistry.providers.fal.capabilities;
  for(const model of [
    DEFAULT_VIDEO_EDIT_MODEL,DEFAULT_VIDEO_EXTEND_MODEL,
    DEFAULT_VIDEO_OBJECT_REMOVE_MODEL,DEFAULT_VIDEO_BACKGROUND_REMOVE_MODEL,
    DEFAULT_VIDEO_RELIGHT_MODEL,DEFAULT_VIDEO_RECAMERA_MODEL,
    DEFAULT_VIDEO_LIPSYNC_MODEL
  ]){
    assert(falCaps.some(x=>x.model===model),'provider registry missing '+model);
    assert(modelRegistry.models.some(x=>x.modelId===model),'model registry missing '+model);
  }

  const wav=makeWav(2,8000);
  assert.equal(readWavDurationSeconds(wav),2);
  assert.equal(readTrustedMediaDurationSeconds(wav,{assetType:'audio',mimeType:'audio/wav'}),2);

  const migration=fs.readFileSync(path.join(__dirname,'67_pack068_video_edit_vfx_foundation.sql'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  const worker=fs.readFileSync(path.join(__dirname,'worker.js'),'utf8');
  for(const marker of ['duration_seconds','source_audio_asset_id',"'object_remove'","'lip_sync'"]){
    assert(migration.includes(marker),marker);
  }
  for(const marker of [
    'videoInputResolver.inspect({',
    'videoPricingContext',
    'source_audio_asset_id: videoRequest.sourceAudioAssetId'
  ]) assert(server.includes(marker),marker);
  for(const marker of [
    "videoRequest.operation !== 'text_to_video'",
    'sourceAudioAssetId: videoRequest.sourceAudioAssetId',
    'lineage: resolvedInputs?.lineage || {}'
  ]) assert(worker.includes(marker),marker);

  assert(fixture.calls.some(x=>x.name==='record_zuvyr_asset_egress'));
  console.log('PASS: PACK068 owner-scoped canonical video/audio inputs are resolved and mapped into exact fal provider schemas');
  console.log('PASS: PACK068 retake/extend/Bria/Kling pre-charge pricing is exact and LightX output-second billing stays fail-closed');
  console.log('PASS: PACK068 trusted duration evidence is persisted/measured without trusting client-supplied billing duration');
  console.log('LIVE PROVIDER / PAYMENT / PRODUCTION DATABASE / NETWORK CALLS: NONE');
}

run().catch(error=>{console.error(error);process.exit(1);});
