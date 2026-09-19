'use strict';
const assert=require('node:assert/strict');
const {normalizeProviderOutput,buildReplicateInput,generateVideo}=require('./lib/videoProvider');
assert.equal(normalizeProviderOutput(['https://cdn.example/a.mp4']),'https://cdn.example/a.mp4');
assert.equal(normalizeProviderOutput({url:'https://cdn.example/b.mp4'}),'https://cdn.example/b.mp4');
assert.throws(()=>normalizeProviderOutput({}),error=>error.code==='video_provider_returned_no_url');
const baseRequest={operation:'text_to_video',prompt:'Ocean wave',options:{durationSeconds:5,ratio:'16:9',resolution:'480p',fps:16,audio:false,seed:null,exportFormat:'mp4'}};
assert.deepEqual(buildReplicateInput(baseRequest),{prompt:'Ocean wave',go_fast:true,num_frames:81,resolution:'480p',aspect_ratio:'16:9',sample_shift:12,optimize_prompt:false,frames_per_second:16,interpolate_output:true});
async function run(){
 let captured=null;
 const result=await generateVideo(baseRequest,{env:{REPLICATE_API_TOKEN:'test-token'},createClient:token=>({async run(model,input){captured={token,model,input};return ['https://cdn.example/video.mp4'];}})});
 assert.equal(captured.token,'test-token');assert.equal(captured.model,'wan-video/wan-2.2-t2v-fast');assert.deepEqual(captured.input.input,buildReplicateInput(baseRequest));assert.equal(result.provider,'replicate');assert.equal(result.billing.durationSeconds,5);
 await assert.rejects(()=>generateVideo(baseRequest,{env:{},createClient:()=>{throw new Error('network_must_not_start');}}),e=>e.code==='replicate_video_provider_not_configured');
 await assert.rejects(()=>generateVideo(baseRequest,{env:{REPLICATE_API_TOKEN:'test',REPLICATE_VIDEO_MODEL:'different/model'},createClient:()=>{throw new Error('network_must_not_start');}}),e=>e.code==='replicate_video_model_mismatch');
 console.log('PASS: Pack05/066 exact Wan T2V mapping and pre-network guards');
}
run().catch(e=>{console.error(e);process.exit(1);});
