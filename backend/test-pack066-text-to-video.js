'use strict';
// PACK066 focused no-network release gate.
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {normalizeVideoRequest}=require('./lib/videoRequestContract');
const {assertVideoRequestAvailable}=require('./lib/videoOperationRegistry');
const {durationToFrames,buildReplicateInput,generateVideo}=require('./lib/videoProvider');
const {quoteGeneration}=require('./lib/dynamicPricing');
const {fetchVideoBytes}=require('./lib/videoGenerationRepository');
const enabledEnv={PACK066_PAID_EXECUTION_ENABLED:'true',REPLICATE_API_TOKEN:'configured'};
const now=Date.parse('2026-09-19T00:30:00Z');
function request(resolution='480p',durationSeconds=5){return normalizeVideoRequest({prompt:'A calm Atlantic sunrise',videoOptions:{durationSeconds,ratio:'16:9',resolution,fps:16,audio:false,exportFormat:'mp4'}});}
assert.equal(durationToFrames(5),81);assert.equal(durationToFrames(6),97);assert.equal(durationToFrames(7),113);assert.throws(()=>durationToFrames(8),e=>e.code==='video_duration_not_supported_by_provider');
const req=request();assert.equal(assertVideoRequestAvailable(req,{env:enabledEnv}).provider,'replicate');assert.throws(()=>assertVideoRequestAvailable(req,{env:{}}),e=>e.code==='video_operation_disabled');
const mapped=buildReplicateInput(req);assert.equal(mapped.num_frames,81);assert.equal(mapped.frames_per_second,16);
const q480=quoteGeneration('video',{videoRequest:req,env:enabledEnv,now});const q720=quoteGeneration('video',{videoRequest:request('720p'),env:enabledEnv,now});
assert.equal(q480.providerCostMicroUsd,'50000');assert.equal(q720.providerCostMicroUsd,'100000');assert.equal(q480.costEntryId,'replicate-wan-2.2-t2v-fast-480p');assert(q720.credits>q480.credits);
async function run(){
 let calls=0;const result=await generateVideo(req,{env:enabledEnv,createClient:()=>({async run(model,payload){calls++;assert.equal(model,'wan-video/wan-2.2-t2v-fast');assert.deepEqual(payload.input,mapped);return ['https://cdn.example/output.mp4'];}})});assert.equal(calls,1);assert.equal(result.billing.quantity,1);
 const bytes=await fetchVideoBytes('https://cdn.example/output.mp4',{fetchImpl:async()=>({ok:true,headers:{get:n=>String(n).toLowerCase()==='content-type'?'video/mp4':null},arrayBuffer:async()=>Uint8Array.from([0,1,2,3]).buffer})});assert.equal(bytes.buffer.length,4);
 const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8'),worker=fs.readFileSync(path.join(__dirname,'worker.js'),'utf8');
 for(const m of ['pricingVersion: pricing.pricingVersion','pricingCostEntryId: pricing.costEntryId || null','providerCostMicroUsd: pricing.providerCostMicroUsd'])assert(server.includes(m),m);
 for(const m of ['getDefaultVideoGenerationRepository','await videoRepository.persistGenerated({','await settleCredits(requestId, finalCredits)','canonicalContentId: persisted.contentId','canonicalAssetId: persisted.assetId'])assert(worker.includes(m),m);
 console.log('PASS: Pack066 verified schema, official resolution pricing, settlement and canonical persistence wiring');
 console.log('PROVIDER / DATABASE / PAYMENT CALLS: NONE');
}
run().catch(e=>{console.error(e);process.exit(1);});
