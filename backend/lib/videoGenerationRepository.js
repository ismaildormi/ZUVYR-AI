'use strict';

const crypto=require('node:crypto');
const {CONFIG:ASSET_CONFIG,buildCanonicalObjectPath,assertOwnedStoragePath}=require('./assetStorageContract');
const {createAssetStorageKernel}=require('./assetStorageKernel');
const {createContentRepository}=require('./contentRepository');
const VIDEO_SOURCE_SYSTEM='generation_job';
const MAX_CANONICAL_VIDEO_BYTES=300*1024*1024;
const ALLOWED_VIDEO_MIME=new Set(['video/mp4']);
function repositoryError(code,status=500,cause=null){const error=new Error(code);error.code=code;error.status=status;error.retryable=false;error.cause=cause;return error;}
function duplicate(error){const status=Number(error&&(error.statusCode||error.status||error.code));const message=String(error&&error.message||'').toLowerCase();return status===409||message.includes('already exists')||message.includes('duplicate');}
function mime(value){return String(value||'').split(';',1)[0].trim().toLowerCase();}
function title(prompt){const text=String(prompt||'').replace(/\s+/g,' ').trim();if(!text)return 'Generated video';return text.length<=120?text:text.slice(0,117)+'…';}
async function fetchVideoBytes(url,{fetchImpl=globalThis.fetch,maxBytes=MAX_CANONICAL_VIDEO_BYTES}={}){
 if(typeof fetchImpl!=='function')throw repositoryError('video_fetch_unavailable');
 let parsed;try{parsed=new URL(String(url||''));}catch(_){throw repositoryError('invalid_video_result_url',502);}
 if(parsed.protocol!=='https:')throw repositoryError('invalid_video_result_protocol',502);
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),120000);let response;
 try{response=await fetchImpl(parsed.toString(),{method:'GET',redirect:'follow',signal:controller.signal,headers:{accept:'video/mp4'}});}catch(error){throw repositoryError('video_result_download_failed',502,error);}finally{clearTimeout(timeout);}
 if(!response||!response.ok)throw repositoryError('video_result_download_failed',502);
 const mimeType=mime(response.headers&&response.headers.get?response.headers.get('content-type'):'');
 if(!ALLOWED_VIDEO_MIME.has(mimeType))throw repositoryError('video_result_mime_unsupported',502);
 const declared=Number(response.headers&&response.headers.get?response.headers.get('content-length'):0);
 if(Number.isFinite(declared)&&declared>maxBytes)throw repositoryError('video_result_too_large',502);
 const buffer=Buffer.from(await response.arrayBuffer());
 if(!buffer.length||buffer.length>maxBytes)throw repositoryError('video_result_size_invalid',502);
 return Object.freeze({buffer,mimeType});
}
function createVideoGenerationRepository({db,storage,contentRepository=null,assetKernel=null,fetchImpl=globalThis.fetch}={}){
 if(!db||typeof db.from!=='function'||typeof db.rpc!=='function')throw new TypeError('Video Generation repository requires a Supabase-compatible database client.');
 if(!storage||typeof storage.from!=='function')throw new TypeError('Video Generation repository requires a Supabase-compatible storage client.');
 const contentRepo=contentRepository||createContentRepository({client:db});
 const assets=assetKernel||createAssetStorageKernel({client:db,storage});
 async function ownedJob(ownerId,jobId){
  const r=await db.from('generation_jobs').select('id,user_id,feature,status,prompt,result_url,canonical_content_id,video_operation,video_options,created_at,completed_at,error_message').eq('id',jobId).eq('user_id',ownerId).eq('feature','video').maybeSingle();
  if(r.error)throw repositoryError('video_job_lookup_failed',500,r.error);return r.data||null;
 }
 async function newestAsset(ownerId,contentId){
  if(!contentId)return null;
  const r=await db.from('zuvyr_assets').select('id,canonical_content_id,canonical_version_id,mime_type,file_size_bytes,sha256,status,created_at').eq('owner_id',ownerId).eq('canonical_content_id',contentId).eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(r.error)throw repositoryError('video_asset_lookup_failed',500,r.error);return r.data||null;
 }
 async function signOwnedAsset(ownerId,asset){
  const resolved=await assets.resolveOwned({ownerId,assetId:asset.id});
  if(!resolved||resolved.assetId!==asset.id)throw repositoryError('video_asset_not_found',404);
  const storagePath=assertOwnedStoragePath({ownerId,storagePath:resolved.storagePath});
  const signed=await storage.from(resolved.storageBucket||ASSET_CONFIG.bucket).createSignedUrl(storagePath,3600);
  if(signed.error||!signed.data||!signed.data.signedUrl)throw repositoryError('video_asset_sign_failed',500,signed.error);
  return signed.data.signedUrl;
 }
 async function getExisting({ownerId,jobId}){
  const job=await ownedJob(ownerId,jobId);if(!job||!job.canonical_content_id)return null;
  const asset=await newestAsset(ownerId,job.canonical_content_id);if(!asset)return null;
  const canonicalUrl=await signOwnedAsset(ownerId,asset);
  const options=job.video_options&&typeof job.video_options==='object'?job.video_options:{};
  return Object.freeze({jobId:job.id,canonicalUrl,providerResultUrl:options.providerResultUrl||job.result_url||null,contentId:job.canonical_content_id,versionId:asset.canonical_version_id||null,assetId:asset.id,mimeType:asset.mime_type,fileSizeBytes:Number(asset.file_size_bytes||0),sha256:asset.sha256||null,provider:options.outputProvider||'replicate',model:options.outputModel||'wan-video/wan-2.2-t2v-fast',providerInput:options.providerInput||null,providerBilling:options.providerBilling||null,options,replayed:true});
 }
 async function persistGenerated({ownerId,jobId,prompt,providerUrl,provider,model,operation='text_to_video',options={},providerInput={},providerBilling={}}){
  const existing=await getExisting({ownerId,jobId});if(existing)return existing;
  const downloaded=await fetchVideoBytes(providerUrl,{fetchImpl});
  const sha256=crypto.createHash('sha256').update(downloaded.buffer).digest('hex');
  const promptHash=crypto.createHash('sha256').update(String(prompt||'')).digest('hex');
  const record=await contentRepo.ensure({ownerId,projectId:null,kind:'video',title:title(prompt),sourceKind:'video_generation',sourceSystem:VIDEO_SOURCE_SYSTEM,sourceId:'video-job:'+jobId,sourceVersionKey:sha256,metadata:{videoGeneration:true,pack:66,jobId,provider,model,operation,promptHash,options,providerInput,providerBilling},version:{mimeType:downloaded.mimeType,uri:providerUrl,text:null,sha256,payload:{prompt:String(prompt||''),provider,model,operation,options,providerInput,providerBilling},provenance:{source:'pack066_text_to_video',jobId,provider,model}}});
  const storagePath=buildCanonicalObjectPath({ownerId,sha256});
  const upload=await storage.from(ASSET_CONFIG.bucket).upload(storagePath,downloaded.buffer,{contentType:downloaded.mimeType,cacheControl:'3600',upsert:false});
  if(upload.error&&!duplicate(upload.error))throw repositoryError('video_asset_upload_failed',500,upload.error);
  const registered=await assets.register({ownerId,canonicalContentId:record.contentId,canonicalVersionId:record.versionId,storagePath,mimeType:downloaded.mimeType,fileSizeBytes:downloaded.buffer.length,sha256,retentionClass:'standard',metadata:{videoGeneration:true,pack:66,jobId,provider,model,operation,promptHash}});
  const update=await db.from('generation_jobs').update({canonical_content_id:record.contentId,video_options:{...options,outputProvider:provider,outputModel:model,providerResultUrl:String(providerUrl),providerInput,providerBilling}}).eq('id',jobId).eq('user_id',ownerId).eq('feature','video');
  if(update.error)throw repositoryError('video_job_canonical_link_failed',500,update.error);
  const canonicalUrl=await signOwnedAsset(ownerId,{id:registered.assetId});
  return Object.freeze({jobId,canonicalUrl,providerResultUrl:String(providerUrl),contentId:record.contentId,versionId:record.versionId,assetId:registered.assetId,mimeType:downloaded.mimeType,fileSizeBytes:downloaded.buffer.length,sha256,provider,model,providerInput,providerBilling,options,replayed:record.replayed===true||registered.replayed===true});
 }
 return Object.freeze({getExisting,persistGenerated});
}
function getDefaultVideoGenerationRepository(){const {supabaseAdmin}=require('./supabaseAdmin');return createVideoGenerationRepository({db:supabaseAdmin,storage:supabaseAdmin.storage});}
module.exports={VIDEO_SOURCE_SYSTEM,MAX_CANONICAL_VIDEO_BYTES,ALLOWED_VIDEO_MIME,fetchVideoBytes,createVideoGenerationRepository,getDefaultVideoGenerationRepository};
