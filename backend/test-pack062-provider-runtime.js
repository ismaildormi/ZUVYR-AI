'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { registerImageProvider, generateImage } = require('./src/modules/ai/providers/imageProviders');
const { normalizeImageRequest } = require('./lib/imageRequestContract');
const { assertImageProviderCapabilities } = require('./lib/imageCapabilityGate');
async function run() {
 let calls=0;
 for(const name of ['pack062-primary','pack062-fallback']) registerImageProvider(name, {
   generate: async()=>{calls++; return 'https://fixture.invalid/image.png';}
 });
 const chain=['pack062-primary','pack062-fallback'];
 const cases=[
   {referenceAssetIds:['11111111-1111-4111-8111-111111111111']},
   {sourceAssetId:'11111111-1111-4111-8111-111111111111'},
   {maskAssetId:'11111111-1111-4111-8111-111111111111'},
   {imageOptions:{seed:0}}, {imageOptions:{quantity:2}},
   {imageOptions:{ratio:'16:9'}}, {imageOptions:{resolution:'512'}},
   {imageOptions:{style:'watercolor'}},
   {imageOperation:'variations',sourceAssetId:'11111111-1111-4111-8111-111111111111'}
 ];
 for(const input of cases) {
   await assert.rejects(generateImage('test',{chain,imageRequest:normalizeImageRequest(input)}), error=>
     error.code==='all_image_providers_failed' && error.attempts.length===2);
   assert.equal(calls,0,'unsupported input must never reach primary or fallback');
 }
 await assert.rejects(generateImage('test',{chain,imageOptions:{seed:42}}));
 assert.equal(calls,0,'legacy caller options must be checked too');
 const result=await generateImage('test',{chain,imageRequest:normalizeImageRequest({})});
 assert.equal(calls,1); assert.equal(result.url,'https://fixture.invalid/image.png');
 for(const quantity of [0,-1,NaN,Infinity,1.5]) assert.throws(()=>assertImageProviderCapabilities({options:{quantity}},{}),/invalid_image_quantity/);
 for(const seed of [-1,NaN,Infinity,1.5,2147483648]) assert.throws(()=>assertImageProviderCapabilities({options:{seed}},{}),/invalid_image_seed/);
 const worker=fs.readFileSync(require.resolve('./worker.js'),'utf8');
 assert.match(worker,/generateImage\(prompt, \{\s*imageRequest,/);
 console.log('PASS: PACK062 runtime rejects unsupported inputs before primary/fallback calls; default generate preserved; worker forwards normalized request');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
