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
const { assertVideoRequestAvailable } = require('./lib/videoOperationRegistry');
const {
  DEFAULT_IMAGE_TO_VIDEO_MODEL,
  DEFAULT_REFERENCE_TO_VIDEO_MODEL,
  buildWan22ImageToVideoInput,
  buildWan27ReferenceToVideoInput,
  generateVideo
} = require('./lib/videoProvider');
const { createVideoReferenceResolver } = require('./lib/videoReferenceResolver');
const { quoteGeneration } = require('./lib/dynamicPricing');

const OWNER='11111111-1111-4111-8111-111111111111';
const SOURCE='22222222-2222-4222-8222-222222222222';
const LAST='33333333-3333-4333-8333-333333333333';
const REF1='44444444-4444-4444-8444-444444444444';
const REF2='55555555-5555-4555-8555-555555555555';
const A1='66666666-6666-4666-8666-666666666666';
const A2='77777777-7777-4777-8777-777777777777';
const A3='88888888-8888-4888-8888-888888888888';
const A4='99999999-9999-4999-8999-999999999999';

function makeResolverFixture() {
  const calls=[];
  const rows=new Map([
    [SOURCE,{id:SOURCE,owner_id:OWNER,asset_type:'image',mime_type:'image/png',file_size_bytes:100,sha256:'a'.repeat(64),scan_status:'clean',canonical_content_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',canonical_asset_id:A1}],
    [LAST,{id:LAST,owner_id:OWNER,asset_type:'image',mime_type:'image/png',file_size_bytes:101,sha256:'b'.repeat(64),scan_status:'clean',canonical_content_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',canonical_asset_id:A2}],
    [REF1,{id:REF1,owner_id:OWNER,asset_type:'image',mime_type:'image/jpeg',file_size_bytes:102,sha256:'c'.repeat(64),scan_status:'clean',canonical_content_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',canonical_asset_id:A3}],
    [REF2,{id:REF2,owner_id:OWNER,asset_type:'image',mime_type:'image/webp',file_size_bytes:103,sha256:'d'.repeat(64),scan_status:'clean',canonical_content_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',canonical_asset_id:A4}]
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
          versionId:'eeeeeeee-eeee-4eee-8eee-'+row.id.slice(0,12),
          status:'active',
          storageBucket:ASSET_CONFIG.bucket,
          storagePath:OWNER+'/objects/aa/'+row.sha256,
          mimeType:row.mime_type,
          fileSizeBytes:row.file_size_bytes,
          sha256:row.sha256
        }:null};
      }
      if(name==='record_zuvyr_asset_egress') return {data:{ok:true}};
      throw new Error('unexpected_rpc:'+name);
    }
  };
  const storage={
    from(bucket){
      assert.equal(bucket,ASSET_CONFIG.bucket);
      return {
        async createSignedUrl(storagePath){
          calls.push({name:'sign',storagePath});
          return {data:{signedUrl:'https://fixture.invalid/'+storagePath.split('/').pop()+'?signed=1'}};
        }
      };
    }
  };
  return {resolve:createVideoReferenceResolver({db,storage}),calls};
}

async function run(){
  assert.equal(videoSystem.operations.image_to_video.status,'implemented_pack067_paid_live_deferred');
  assert.equal(videoSystem.operations.reference_to_video.status,'implemented_pack067_paid_live_deferred');
  assert.equal(videoSystem.pack067.paidExecutionDefault,false);
  assert.equal(videoSystem.pack067.maxReferenceImages,4);

  for(const [operation,gate] of [
    ['image_to_video','PACK067_I2V_PAID_EXECUTION_ENABLED'],
    ['reference_to_video','PACK067_R2V_PAID_EXECUTION_ENABLED']
  ]){
    assert.throws(
      ()=>assertVideoRequestAvailable({operation},{env:{}}),
      /video_operation_paid_execution_disabled/
    );
    assert.equal(
      assertVideoRequestAvailable({operation},{env:{[gate]:'true'}}).operation,
      operation
    );
  }

  const i2v=normalizeVideoRequest({
    videoOperation:'image_to_video',
    prompt:'Slow camera push',
    sourceImageAssetId:SOURCE,
    endFrameAssetId:LAST,
    videoOptions:{durationSeconds:5,resolution:'480p',seed:67}
  });
  assert.equal(i2v.options.ratio,null);
  assert.equal(i2v.options.fps,16);
  assert.throws(
    ()=>normalizeVideoRequest({
      videoOperation:'image_to_video',
      prompt:'x',
      sourceImageAssetId:SOURCE,
      startFrameAssetId:REF1
    }),
    e=>e.code==='video_source_image_conflict'
  );

  const r2v=normalizeVideoRequest({
    videoOperation:'reference_to_video',
    prompt:'Keep the same product identity while rotating',
    referenceImageAssetIds:[REF1,REF2],
    videoOptions:{
      durationSeconds:5,
      resolution:'720p',
      ratio:'9:16',
      negativePrompt:'text artifacts',
      shotType:'multi',
      seed:7
    }
  });
  assert.deepEqual(r2v.referenceImageAssetIds,[REF1,REF2]);
  assert.equal(r2v.options.fps,null);
  assert.equal(r2v.options.shotType,'multi');

  const fixture=makeResolverFixture();
  const resolvedI2v=await fixture.resolve({ownerId:OWNER,request:i2v,requestId:'i2v-job'});
  assert.equal(resolvedI2v.source.conversationAssetId,SOURCE);
  assert.equal(resolvedI2v.last.conversationAssetId,LAST);
  assert.equal(resolvedI2v.lineage.sourceImage.assetId,A1);
  assert.equal(JSON.stringify(resolvedI2v.lineage).includes('signed=1'),false);

  const i2vInput=buildWan22ImageToVideoInput(i2v,resolvedI2v);
  assert.equal(i2vInput.image,resolvedI2v.source.url);
  assert.equal(i2vInput.last_image,resolvedI2v.last.url);
  assert.equal(i2vInput.num_frames,81);
  assert.equal(i2vInput.frames_per_second,16);
  assert.equal(i2vInput.interpolate_output,false);
  assert.equal(Object.hasOwn(i2vInput,'aspect_ratio'),false);

  const resolvedR2v=await fixture.resolve({ownerId:OWNER,request:r2v,requestId:'r2v-job'});
  assert.deepEqual(resolvedR2v.references.map(x=>x.conversationAssetId),[REF1,REF2]);
  assert.equal(resolvedR2v.lineage.referenceImages.length,2);

  const r2vInput=buildWan27ReferenceToVideoInput(r2v,resolvedR2v);
  assert.deepEqual(r2vInput.reference_images,resolvedR2v.references.map(x=>x.url));
  assert.deepEqual(r2vInput.reference_videos,[]);
  assert.equal(r2vInput.duration,5);
  assert.equal(r2vInput.aspect_ratio,'9:16');
  assert.equal(r2vInput.resolution,'720p');
  assert.equal(r2vInput.shot_type,'multi');

  let networkCalls=0;
  await assert.rejects(
    ()=>generateVideo(i2v,{
      env:{REPLICATE_API_TOKEN:'synthetic'},
      resolvedInputs:resolvedI2v,
      createClient:()=>({run:async()=>{networkCalls+=1;}})
    }),
    /video_paid_execution_disabled/
  );
  assert.equal(networkCalls,0);

  const i2vProvider=await generateVideo(i2v,{
    env:{REPLICATE_API_TOKEN:'synthetic',PACK067_I2V_PAID_EXECUTION_ENABLED:'true'},
    resolvedInputs:resolvedI2v,
    createClient:token=>({
      async run(model,{input}){
        networkCalls+=1;
        assert.equal(token,'synthetic');
        assert.equal(model,DEFAULT_IMAGE_TO_VIDEO_MODEL);
        assert.equal(input.image,resolvedI2v.source.url);
        return 'https://fixture.invalid/i2v.mp4';
      }
    })
  });
  assert.equal(i2vProvider.billableUnits.unitType,'videos');
  assert.equal(i2vProvider.billableUnits.units,1);

  const r2vProvider=await generateVideo(r2v,{
    env:{REPLICATE_API_TOKEN:'synthetic',PACK067_R2V_PAID_EXECUTION_ENABLED:'true'},
    resolvedInputs:resolvedR2v,
    createClient:()=>({
      async run(model,{input}){
        networkCalls+=1;
        assert.equal(model,DEFAULT_REFERENCE_TO_VIDEO_MODEL);
        assert.equal(input.reference_images.length,2);
        return 'https://fixture.invalid/r2v.mp4';
      }
    })
  });
  assert.equal(r2vProvider.billableUnits.unitType,'video_seconds');
  assert.equal(r2vProvider.billableUnits.units,5);
  assert.equal(networkCalls,2);

  const now=Date.parse('2026-09-19T01:00:00Z');
  const q480=quoteGeneration('video',{
    videoRequest:i2v,
    env:{REPLICATE_API_TOKEN:'synthetic',PACK067_I2V_PAID_EXECUTION_ENABLED:'true'},
    now
  });
  assert.equal(q480.providerCostMicroUsd,'50000');

  const q720=quoteGeneration('video',{
    videoRequest:normalizeVideoRequest({
      videoOperation:'image_to_video',
      prompt:'x',
      sourceImageAssetId:SOURCE,
      videoOptions:{resolution:'720p'}
    }),
    env:{REPLICATE_API_TOKEN:'synthetic',PACK067_I2V_PAID_EXECUTION_ENABLED:'true'},
    now
  });
  assert.equal(q720.providerCostMicroUsd,'110000');

  const qR2v=quoteGeneration('video',{
    videoRequest:r2v,
    env:{REPLICATE_API_TOKEN:'synthetic',PACK067_R2V_PAID_EXECUTION_ENABLED:'true'},
    now
  });
  assert.equal(qR2v.providerCostMicroUsd,'500000');

  for(const id of [
    'replicate-wan-2.2-i2v-fast-480p',
    'replicate-wan-2.2-i2v-fast-720p',
    'replicate-wan-2.7-r2v-second'
  ]){
    const entry=costRegistry.entries.find(item=>item.id===id);
    assert(entry,'missing cost entry '+id);
    assert.equal(entry.verificationStatus,'verified');
    assert.equal(entry.enabledState,'conditional');
  }

  const providerCaps=providerRegistry.providers.replicate.capabilities;
  assert(providerCaps.some(x=>x.id==='video.image_to_video'&&x.model===DEFAULT_IMAGE_TO_VIDEO_MODEL));
  assert(providerCaps.some(x=>x.id==='video.reference_to_video'&&x.model===DEFAULT_REFERENCE_TO_VIDEO_MODEL));
  assert(modelRegistry.models.some(x=>x.modelId===DEFAULT_IMAGE_TO_VIDEO_MODEL));
  assert(modelRegistry.models.some(x=>x.modelId===DEFAULT_REFERENCE_TO_VIDEO_MODEL));

  const migration=fs.readFileSync(path.join(__dirname,'66_pack067_video_reference_foundation.sql'),'utf8');
  assert(migration.includes('video_reference_asset_ids'));
  assert(migration.includes("'reference_to_video'"));
  const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  const worker=fs.readFileSync(path.join(__dirname,'worker.js'),'utf8');
  const repository=fs.readFileSync(path.join(__dirname,'lib/videoGenerationRepository.js'),'utf8');
  for(const marker of [
    'referenceImageAssetIds',
    'video_reference_asset_ids: videoRequest.referenceImageAssetIds'
  ]) assert(server.includes(marker),marker);
  for(const marker of [
    "require('./lib/videoReferenceResolver')",
    'resolvedInputs = await resolveVideoReferences({',
    'lineage: resolvedInputs?.lineage || {}',
    'referenceImageAssetIds: artifact.lineage.referenceImageAssetIds'
  ]) assert(worker.includes(marker),marker);
  assert(repository.includes('canonicalLineage'));

  assert(fixture.calls.some(x=>x.name==='record_zuvyr_asset_egress'));
  console.log('PASS: PACK067 owner-scoped I2V source/last-frame inputs are resolved to canonical assets and actually mapped into Wan 2.2 I2V');
  console.log('PASS: PACK067 ordered reference images are resolved, lineage-bound and actually mapped into Wan 2.7 R2V');
  console.log('PASS: PACK067 exact provider pricing and independent paid gates are fail-closed before live inference');
  console.log('LIVE PROVIDER / PAYMENT / PRODUCTION DATABASE / NETWORK CALLS: NONE');
}

run().catch(error=>{console.error(error);process.exit(1);});
