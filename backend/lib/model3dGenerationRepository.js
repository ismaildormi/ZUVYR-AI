'use strict';

const crypto = require('node:crypto');
const sharp = require('sharp');
const config = require('../config/model3d-system.v1.json');
const {
  CONFIG: ASSET_CONFIG,
  buildCanonicalObjectPath,
  assertOwnedStoragePath
} = require('./assetStorageContract');
const { createAssetStorageKernel } = require('./assetStorageKernel');
const { createContentRepository } = require('./contentRepository');

const SOURCE_SYSTEM = 'zuvyr_model3d_pack083';

const ROLE_POLICY = Object.freeze({
  model_glb: {
    maxBytes: config.output.maxModelBytes,
    mime: new Set(['model/gltf-binary','application/octet-stream'])
  },
  thumbnail: {
    maxBytes: config.output.maxPreviewBytes,
    mime: new Set(config.output.previewMimeTypes)
  },
  export_glb: {
    maxBytes: config.output.maxModelBytes,
    mime: new Set(['model/gltf-binary','application/octet-stream'])
  },
  export_obj: {
    maxBytes: config.output.maxModelBytes,
    mime: new Set(['model/obj','text/plain','application/octet-stream'])
  },
  export_fbx: {
    maxBytes: config.output.maxModelBytes,
    mime: new Set(['model/fbx','application/octet-stream'])
  },
  export_usdz: {
    maxBytes: config.output.maxModelBytes,
    mime: new Set(['model/vnd.usdz+zip','application/zip','application/octet-stream'])
  }
});

function repositoryError(code, status=500, cause=null) {
  const error=new Error(code);
  error.code=code;
  error.status=status;
  error.cause=cause;
  return error;
}

function duplicateStorage(error) {
  const status=Number(error?.statusCode||error?.status||error?.code);
  const message=String(error?.message||'').toLowerCase();
  return status===409 || message.includes('already exists') || message.includes('duplicate');
}

function normalizeMime(value) {
  return String(value||'').split(';',1)[0].trim().toLowerCase();
}

function titleFromPrompt(prompt, operation) {
  const text=String(prompt||'').replace(/\s+/g,' ').trim();
  if (text) return text.length<=120 ? text : text.slice(0,117)+'…';
  return operation==='multiview_to_3d' ? 'Generated multiview 3D model' : 'Generated 3D model';
}

function assertFalArtifactUrl(raw) {
  let url;
  try { url=new URL(String(raw||'')); }
  catch (_) { throw repositoryError('model3d_artifact_url_invalid',502); }
  const host=url.hostname.toLowerCase();
  if (
    url.protocol!=='https:' ||
    !(host==='fal.media' || host.endsWith('.fal.media'))
  ) {
    throw repositoryError('model3d_artifact_url_untrusted',502);
  }
  return url.toString();
}

function validateGlb(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length<12) {
    throw repositoryError('model3d_glb_invalid',502);
  }
  if (buffer.toString('ascii',0,4)!=='glTF') {
    throw repositoryError('model3d_glb_magic_invalid',502);
  }
  if (buffer.readUInt32LE(4)!==2) {
    throw repositoryError('model3d_glb_version_unsupported',502);
  }
  if (buffer.readUInt32LE(8)!==buffer.length) {
    throw repositoryError('model3d_glb_length_invalid',502);
  }
}

function validateObj(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length<8) {
    throw repositoryError('model3d_obj_invalid',502);
  }
  const text=buffer.toString('utf8');
  if (text.includes('\u0000')) {
    throw repositoryError('model3d_obj_binary_invalid',502);
  }
  const hasVertex=/(?:^|\r?\n)\s*v\s+-?\d/m.test(text);
  const hasFace=/(?:^|\r?\n)\s*f\s+\d/m.test(text);
  if (!hasVertex || !hasFace) {
    throw repositoryError('model3d_obj_structure_invalid',502);
  }
}

function validateFbx(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length<24) {
    throw repositoryError('model3d_fbx_invalid',502);
  }
  const head=buffer.subarray(0,Math.min(buffer.length,4096)).toString('utf8');
  const binary=buffer.subarray(0,18).toString('ascii')==='Kaydara FBX Binary';
  const ascii=/FBXHeaderExtension|;\s*FBX\s+\d/i.test(head);
  if (!binary && !ascii) {
    throw repositoryError('model3d_fbx_structure_invalid',502);
  }
}

async function fetchArtifactBytes(artifact,{fetchImpl=globalThis.fetch}={}) {
  const policy=ROLE_POLICY[artifact?.role];
  if (!policy) throw repositoryError('model3d_artifact_role_unsupported',502);
  if (typeof fetchImpl!=='function') throw repositoryError('model3d_fetch_unavailable',500);

  const url=assertFalArtifactUrl(artifact.url);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),30_000);
  let response;
  try {
    response=await fetchImpl(url,{
      method:'GET',
      redirect:'error',
      signal:controller.signal,
      headers:{accept:'*/*'}
    });
  } catch (cause) {
    throw repositoryError('model3d_artifact_download_failed',502,cause);
  } finally {
    clearTimeout(timer);
  }

  if (!response?.ok) throw repositoryError('model3d_artifact_download_failed',502);
  const declared=Number(response.headers?.get?.('content-length')||0);
  if (Number.isFinite(declared) && declared>policy.maxBytes) {
    throw repositoryError('model3d_artifact_too_large',502);
  }
  const buffer=Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length>policy.maxBytes) {
    throw repositoryError('model3d_artifact_size_invalid',502);
  }

  const responseMime=normalizeMime(response.headers?.get?.('content-type'));
  const declaredMime=normalizeMime(artifact.mimeType);
  const mimeType=responseMime || declaredMime;
  if (!policy.mime.has(mimeType)) {
    throw repositoryError('model3d_artifact_mime_unsupported',502);
  }

  if (artifact.role==='model_glb' || artifact.role==='export_glb') {
    validateGlb(buffer);
  }
  if (artifact.role==='export_obj') {
    validateObj(buffer);
  }
  if (artifact.role==='export_fbx') {
    validateFbx(buffer);
  }
  if (artifact.role==='thumbnail') {
    try {
      const meta=await sharp(buffer,{failOn:'warning'}).metadata();
      if (!meta.width || !meta.height) throw new Error('missing_dimensions');
    } catch (cause) {
      throw repositoryError('model3d_thumbnail_invalid',502,cause);
    }
  }
  if (artifact.role==='export_usdz' && buffer.subarray(0,2).toString('ascii')!=='PK') {
    throw repositoryError('model3d_usdz_invalid',502);
  }

  return Object.freeze({buffer,mimeType,url});
}

function createModel3dGenerationRepository({
  db,
  storage,
  contentRepository=null,
  assetKernel=null,
  fetchImpl=globalThis.fetch
}={}) {
  if (!db || typeof db.from!=='function' || typeof db.rpc!=='function') {
    throw new TypeError('3D repository requires a Supabase-compatible database client.');
  }
  if (!storage || typeof storage.from!=='function') {
    throw new TypeError('3D repository requires a Supabase-compatible storage client.');
  }

  const contentRepo=contentRepository||createContentRepository({client:db});
  const assets=assetKernel||createAssetStorageKernel({client:db,storage});

  async function ownedJob(ownerId,jobId) {
    const result=await db.from('generation_jobs')
      .select('id,user_id,feature,status,prompt,conversation_id,response_message_id,canonical_content_id,model3d_operation,model3d_options,model3d_output_manifest,created_at,completed_at,error_message')
      .eq('id',jobId).eq('user_id',ownerId).eq('feature','3d').maybeSingle();
    if (result.error) throw repositoryError('model3d_job_lookup_failed',500,result.error);
    return result.data||null;
  }

  async function getExisting({ownerId,jobId}) {
    const job=await ownedJob(ownerId,jobId);
    if (!job?.canonical_content_id) return null;
    const manifest=Array.isArray(job.model3d_output_manifest)?job.model3d_output_manifest:[];
    if (!manifest.some(item=>item.role==='model_glb'&&item.assetId)) return null;
    return Object.freeze({
      jobId:job.id,
      contentId:job.canonical_content_id,
      manifest:Object.freeze(manifest.map(item=>Object.freeze({...item}))),
      replayed:true
    });
  }

  async function persistArtifact({
    ownerId,
    contentId,
    versionId,
    jobId,
    artifact,
    metadata
  }) {
    const downloaded=await fetchArtifactBytes(artifact,{fetchImpl});
    const sha256=crypto.createHash('sha256').update(downloaded.buffer).digest('hex');
    const storagePath=buildCanonicalObjectPath({ownerId,sha256});
    const upload=await storage.from(ASSET_CONFIG.bucket).upload(
      storagePath,
      downloaded.buffer,
      {contentType:downloaded.mimeType,cacheControl:'3600',upsert:false}
    );
    if (upload.error && !duplicateStorage(upload.error)) {
      throw repositoryError('model3d_asset_upload_failed',500,upload.error);
    }

    const registered=await assets.register({
      ownerId,
      canonicalContentId:contentId,
      canonicalVersionId:versionId,
      storagePath,
      mimeType:downloaded.mimeType,
      fileSizeBytes:downloaded.buffer.length,
      sha256,
      retentionClass:'standard',
      metadata:{...metadata,role:artifact.role,jobId}
    });

    return Object.freeze({
      role:artifact.role,
      assetId:registered.assetId,
      mimeType:downloaded.mimeType,
      fileSizeBytes:downloaded.buffer.length,
      sha256,
      storagePath,
      fileName:artifact.fileName||null
    });
  }

  async function attachConversationModel({
    ownerId,
    job,
    primary,
    contentId,
    versionId,
    metadata
  }) {
    if (!job.conversation_id) return null;

    const payload={
      conversation_id:job.conversation_id,
      message_id:job.response_message_id||null,
      owner_id:ownerId,
      asset_type:'model3d',
      url:null,
      storage_path:primary.storagePath,
      storage_bucket:ASSET_CONFIG.bucket,
      mime_type:primary.mimeType,
      original_name:primary.fileName||'model.glb',
      file_size_bytes:primary.fileSizeBytes,
      duration_seconds:null,
      sha256:primary.sha256,
      scan_status:'clean',
      extraction_status:'not_required',
      canonical_content_id:contentId,
      canonical_asset_id:primary.assetId,
      metadata:{...metadata,canonicalVersionId:versionId,role:'model_glb'}
    };

    let query=db.from('conversation_assets');
    query=query.upsert(payload,{onConflict:'storage_bucket,storage_path'});
    const result=await query.select('id').single();
    if (result.error) throw repositoryError('model3d_conversation_asset_failed',500,result.error);
    return result.data?.id||null;
  }

  async function persistProviderResult({
    ownerId,
    jobId,
    providerResult,
    provider,
    model,
    request,
    lineage={}
  }={}) {
    const existing=await getExisting({ownerId,jobId});
    if (existing) return existing;

    const job=await ownedJob(ownerId,jobId);
    if (!job) throw repositoryError('model3d_job_not_found',404);

    const primaryArtifact=providerResult?.artifacts?.find(item=>item.role==='model_glb');
    if (!primaryArtifact) throw repositoryError('model3d_primary_output_missing',502);

    const primaryDownloaded=await fetchArtifactBytes(primaryArtifact,{fetchImpl});
    const primarySha=crypto.createHash('sha256').update(primaryDownloaded.buffer).digest('hex');
    const promptHash=crypto.createHash('sha256').update(String(job.prompt||'')).digest('hex');
    const metadata={
      model3dGeneration:true,
      pack:83,
      jobId,
      provider,
      model,
      operation:request.operation,
      promptHash,
      options:request.options,
      inputLineage:lineage,
      seed:providerResult.seed??null
    };

    const record=await contentRepo.ensure({
      ownerId,
      projectId:null,
      kind:'3d',
      title:titleFromPrompt(job.prompt,request.operation),
      sourceKind:'model3d_generation',
      sourceSystem:SOURCE_SYSTEM,
      sourceId:'model3d-job:'+jobId,
      sourceVersionKey:primarySha,
      metadata,
      version:{
        mimeType:primaryDownloaded.mimeType,
        uri:primaryDownloaded.url,
        text:null,
        sha256:primarySha,
        payload:{
          operation:request.operation,
          provider,
          model,
          options:request.options,
          inputLineage:lineage
        },
        provenance:{
          source:'pack083_model3d_generation',
          jobId,
          provider,
          model,
          operation:request.operation,
          inputLineage:lineage
        }
      }
    });

    // Persist primary using the already downloaded bytes to avoid a second GET.
    const primaryPath=buildCanonicalObjectPath({ownerId,sha256:primarySha});
    const primaryUpload=await storage.from(ASSET_CONFIG.bucket).upload(
      primaryPath,
      primaryDownloaded.buffer,
      {contentType:primaryDownloaded.mimeType,cacheControl:'3600',upsert:false}
    );
    if (primaryUpload.error && !duplicateStorage(primaryUpload.error)) {
      throw repositoryError('model3d_asset_upload_failed',500,primaryUpload.error);
    }
    const primaryRegistered=await assets.register({
      ownerId,
      canonicalContentId:record.contentId,
      canonicalVersionId:record.versionId,
      storagePath:primaryPath,
      mimeType:primaryDownloaded.mimeType,
      fileSizeBytes:primaryDownloaded.buffer.length,
      sha256:primarySha,
      retentionClass:'standard',
      metadata:{...metadata,role:'model_glb'}
    });
    const primary=Object.freeze({
      role:'model_glb',
      assetId:primaryRegistered.assetId,
      mimeType:primaryDownloaded.mimeType,
      fileSizeBytes:primaryDownloaded.buffer.length,
      sha256:primarySha,
      storagePath:primaryPath,
      fileName:primaryArtifact.fileName||'model.glb'
    });

    const manifest=[primary];
    for (const artifact of providerResult.artifacts||[]) {
      if (!artifact || artifact===primaryArtifact || artifact.role==='model_glb') continue;
      manifest.push(await persistArtifact({
        ownerId,
        contentId:record.contentId,
        versionId:record.versionId,
        jobId,
        artifact,
        metadata
      }));
    }

    const conversationAssetId=await attachConversationModel({
      ownerId,job,primary,contentId:record.contentId,versionId:record.versionId,metadata
    });

    const publicManifest=manifest.map(item=>({
      role:item.role,
      assetId:item.assetId,
      mimeType:item.mimeType,
      fileSizeBytes:item.fileSizeBytes,
      sha256:item.sha256,
      fileName:item.fileName
    }));

    const update=await db.from('generation_jobs').update({
      canonical_content_id:record.contentId,
      model3d_output_manifest:publicManifest,
      job_stage:'done',
      progress_percent:100
    }).eq('id',jobId).eq('user_id',ownerId).eq('feature','3d');
    if (update.error) throw repositoryError('model3d_job_canonical_link_failed',500,update.error);

    return Object.freeze({
      jobId,
      contentId:record.contentId,
      versionId:record.versionId,
      conversationAssetId,
      manifest:Object.freeze(publicManifest.map(item=>Object.freeze(item))),
      replayed:record.replayed===true
    });
  }

  async function signRole({ownerId,jobId,role='model_glb',requestId}={}) {
    const existing=await getExisting({ownerId,jobId});
    if (!existing) throw repositoryError('model3d_output_not_found',404);
    const item=existing.manifest.find(entry=>entry.role===role);
    if (!item?.assetId) throw repositoryError('model3d_output_role_not_found',404);
    const signed=await assets.createSignedDownload({
      ownerId,
      assetId:item.assetId,
      requestId,
      expiresIn:300
    });
    return Object.freeze({
      jobId,
      role,
      assetId:item.assetId,
      mimeType:item.mimeType,
      fileSizeBytes:item.fileSizeBytes,
      signedUrl:signed.signedUrl,
      expiresIn:300
    });
  }

  async function history({ownerId,limit=50}={}) {
    const result=await db.from('generation_jobs')
      .select('id,status,prompt,model3d_operation,model3d_options,model3d_output_manifest,canonical_content_id,created_at,completed_at,error_message')
      .eq('user_id',ownerId).eq('feature','3d')
      .order('created_at',{ascending:false})
      .limit(Math.max(1,Math.min(100,Number(limit)||50)));
    if (result.error) throw repositoryError('model3d_history_failed',500,result.error);
    return Object.freeze((result.data||[]).map(row=>Object.freeze({
      jobId:row.id,
      status:row.status,
      prompt:row.prompt||'',
      operation:row.model3d_operation,
      options:row.model3d_options||{},
      manifest:Array.isArray(row.model3d_output_manifest)?row.model3d_output_manifest:[],
      contentId:row.canonical_content_id||null,
      createdAt:row.created_at,
      completedAt:row.completed_at||null,
      error:row.error_message||null
    })));
  }

  return Object.freeze({
    getExisting,
    persistProviderResult,
    signRole,
    history
  });
}

module.exports={
  SOURCE_SYSTEM,
  ROLE_POLICY,
  validateGlb,
  validateObj,
  validateFbx,
  fetchArtifactBytes,
  createModel3dGenerationRepository
};
