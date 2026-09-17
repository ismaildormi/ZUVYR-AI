'use strict';
const assert=require('node:assert/strict');
const {createImageReferenceResolver}=require('./lib/imageReferenceResolver');
const owner='11111111-1111-4111-8111-111111111111';
const a='22222222-2222-4222-8222-222222222222', b='33333333-3333-4333-8333-333333333333';
let calls=[], forbidden=null, parentMissing=false, mime='image/png';
const db={
 async rpc(name,args){
  calls.push({name,args});
  if(name==='resolve_zuvyr_asset_for_owner') return {data:args.p_owner_id!==owner || args.p_asset_id===forbidden ? null :
   {assetId:args.p_asset_id,contentId:'content',versionId:'version',status:'active',storageBucket:'conversation-files',
    storagePath:owner+'/objects/image',mimeType:mime,fileSizeBytes:100,sha256:'digest'}};
  return {data:{}};
 },
 from(){const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:parentMissing?null:{id:'content'}};}};return q;}
};
const storage={from(){return {async createSignedUrl(path,ttl){calls.push({name:'sign',path,ttl});return {data:{signedUrl:'https://fixture.invalid/private'}};}};}};
async function run(){
 const resolve=createImageReferenceResolver({db,storage});
 const request={referenceAssetIds:[b,a],sourceAssetId:a};
 const out=await resolve({ownerId:owner,request,requestId:'job'});
 assert.deepEqual(out.references.map(x=>x.assetId),[b,a]);assert.equal(out.source.assetId,a);
 assert.equal(calls.filter(x=>x.name==='sign').length,2,'shared source/reference signed once');
 assert.equal(calls.filter(x=>x.name==='record_zuvyr_asset_egress').length,2);
 for(const mode of ['foreign','parent','mime']){
  calls=[];forbidden=mode==='foreign'?a:null;parentMissing=mode==='parent';mime=mode==='mime'?'text/html':'image/png';
  await assert.rejects(resolve({ownerId:owner,request,requestId:'job'}));
  assert.equal(calls.filter(x=>x.name==='sign'||x.name==='record_zuvyr_asset_egress').length,0);
 }
 console.log('PASS: PACK062 resolver preserves order, scopes assets and parents, rejects invalid images before signing, deduplicates signing and records egress');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
