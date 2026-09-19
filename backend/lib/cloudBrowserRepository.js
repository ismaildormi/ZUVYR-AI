'use strict';

const crypto = require('node:crypto');
const { createContentRepository } = require('./contentRepository');
const { createAssetStorageKernel } = require('./assetStorageKernel');
const {
  CONFIG: assetConfig,
  buildCanonicalObjectPath
} = require('./assetStorageContract');
const {
  publicSession,
  sessionPolicies
} = require('./cloudBrowserPolicy');

function repoError(code, cause = null) {
  const error=new Error(code);
  error.code=code;
  if (cause) error.cause=cause;
  return error;
}

function rpcCode(error, fallback) {
  const text=String(error?.message || error?.details || error?.hint || '');
  const match=text.match(/pack081_[a-z0-9_]+/i);
  return match ? match[0].toLowerCase() : fallback;
}

function digest(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function safeFileName(value, fallback) {
  const text=String(value || fallback || 'artifact')
    .replace(/[\\/\0\r\n]/g,'_')
    .trim()
    .slice(0,240);
  return text || fallback || 'artifact';
}

function createCloudBrowserRepository({db,storage}={}) {
  if (!db || typeof db.from !== 'function' || typeof db.rpc !== 'function') {
    throw repoError('cloud_browser_repository_db_required');
  }
  if (!storage || typeof storage.from !== 'function') {
    throw repoError('cloud_browser_repository_storage_required');
  }

  const content=createContentRepository({client:db});
  const assets=createAssetStorageKernel({client:db,storage});

  async function internal({ownerId,sessionId}) {
    const result=await db.from('browser_sessions')
      .select('*')
      .eq('id',sessionId)
      .eq('owner_id',ownerId)
      .maybeSingle();
    if (result.error) throw repoError('cloud_browser_session_lookup_failed',result.error);
    if (!result.data) throw repoError('pack081_session_not_found');
    return result.data;
  }

  async function get({ownerId,sessionId}) {
    return publicSession(await internal({ownerId,sessionId}));
  }

  async function byRequest({ownerId,requestId}) {
    const result=await db.from('browser_sessions')
      .select('*')
      .eq('owner_id',ownerId)
      .eq('request_id',requestId)
      .maybeSingle();
    if (result.error) throw repoError('cloud_browser_request_lookup_failed',result.error);
    return result.data ? Object.freeze({
      internal:result.data,
      public:publicSession(result.data)
    }) : null;
  }

  async function list({ownerId,limit=20}) {
    const result=await db.from('browser_sessions')
      .select('id,owner_id,conversation_id,task_run_id,project_id,status,provider,region,current_host,started_at,last_activity_at,expires_at,idle_expires_at,ended_at,usage_seconds,proxy_bytes,billing_state,final_credits,failure_code,created_at,updated_at')
      .eq('owner_id',ownerId)
      .order('created_at',{ascending:false})
      .limit(Math.max(1,Math.min(100,Number(limit)||20)));
    if (result.error) throw repoError('cloud_browser_session_list_failed',result.error);
    return Object.freeze((result.data||[]).map(publicSession));
  }

  async function reserve({
    ownerId,conversationId=null,taskRunId=null,projectId=null,
    requestId,billingRequestId,expiresAt,idleExpiresAt,allowedHosts,
    pricingVersion,browserHourPriceMicroUsd,reservedCredits
  }={}) {
    const policies=sessionPolicies({allowedHosts});
    const result=await db.rpc('reserve_zuvyr_browser_session_pack081',{
      p_owner_id:ownerId,
      p_conversation_id:conversationId,
      p_task_run_id:taskRunId,
      p_project_id:projectId,
      p_request_id:requestId,
      p_billing_request_id:billingRequestId,
      p_expires_at:expiresAt,
      p_idle_expires_at:idleExpiresAt,
      p_network_policy:policies.network,
      p_secret_policy:policies.secrets,
      p_pricing_version:pricingVersion,
      p_browser_hour_price_micro_usd:browserHourPriceMicroUsd,
      p_reserved_credits:reservedCredits
    });
    if (result.error) throw repoError(rpcCode(result.error,'cloud_browser_reserve_failed'),result.error);
    return get({ownerId,sessionId:result.data.session_id});
  }

  async function transition({
    ownerId,sessionId,status,providerSessionId=null,region=null,
    currentHost=null,usageSeconds=null,proxyBytes=null,failureCode=null
  }={}) {
    const result=await db.rpc('transition_zuvyr_browser_session_pack081',{
      p_owner_id:ownerId,
      p_session_id:sessionId,
      p_next_status:status,
      p_provider_session_id:providerSessionId,
      p_region:region,
      p_current_host:currentHost,
      p_usage_seconds:usageSeconds,
      p_proxy_bytes:proxyBytes,
      p_failure_code:failureCode
    });
    if (result.error) throw repoError(rpcCode(result.error,'cloud_browser_transition_failed'),result.error);
    return get({ownerId,sessionId});
  }

  async function billing({ownerId,sessionId,expectedState,nextState,finalCredits=null}={}) {
    const result=await db.rpc('set_zuvyr_browser_billing_state_pack081',{
      p_owner_id:ownerId,
      p_session_id:sessionId,
      p_expected_state:expectedState,
      p_next_state:nextState,
      p_final_credits:finalCredits
    });
    if (result.error) throw repoError(rpcCode(result.error,'cloud_browser_billing_update_failed'),result.error);
    if (!result.data?.success) throw repoError(result.data?.error || 'cloud_browser_billing_state_conflict');
    return get({ownerId,sessionId});
  }

  async function touch({ownerId,sessionId,idleExpiresAt,currentHost=null,usageSeconds=null}={}) {
    const result=await db.rpc('touch_zuvyr_browser_session_pack081',{
      p_owner_id:ownerId,
      p_session_id:sessionId,
      p_idle_expires_at:idleExpiresAt,
      p_current_host:currentHost,
      p_usage_seconds:usageSeconds
    });
    if (result.error) throw repoError(rpcCode(result.error,'cloud_browser_touch_failed'),result.error);
    return get({ownerId,sessionId});
  }

  async function uploadCanonical({
    ownerId,sessionId,kind,buffer,mimeType,fileName,providerArtifactId=null,
    projectId=null,metadata={}
  }={}) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > assetConfig.maxFileBytes) {
      throw repoError('cloud_browser_artifact_buffer_invalid');
    }
    const sha256=digest(buffer);
    const name=safeFileName(fileName,kind);
    const record=await content.ensure({
      ownerId,
      projectId,
      kind: kind === 'screenshot' ? 'image' : kind === 'dom' ? 'text' : 'document',
      title:name,
      sourceKind:'cloud_browser_' + kind,
      sourceSystem:'zuvyr_browser_pack081',
      sourceId:['browser',sessionId,kind,providerArtifactId || sha256].join(':'),
      sourceVersionKey:sha256,
      metadata:{pack:81,sessionId,artifactKind:kind,...metadata},
      version:{
        mimeType,
        uri:null,
        text:kind === 'dom' ? buffer.toString('utf8') : null,
        sha256,
        payload:{artifactKind:kind,fileName:name,...metadata},
        provenance:{pack:81,sessionId,artifactKind:kind,provider:'browserbase'}
      }
    });

    const storagePath=buildCanonicalObjectPath({ownerId,sha256});
    const uploaded=await storage.from(assetConfig.bucket).upload(
      storagePath,
      buffer,
      {contentType:mimeType,cacheControl:'3600',upsert:false}
    );
    if (uploaded.error) {
      const status=Number(uploaded.error.statusCode || uploaded.error.status || 0);
      const message=String(uploaded.error.message || '').toLowerCase();
      const duplicate=status===409 || message.includes('already exists') || message.includes('duplicate');
      if (!duplicate) throw repoError('cloud_browser_asset_upload_failed',uploaded.error);
    }

    const asset=await assets.register({
      ownerId,
      canonicalContentId:record.contentId,
      canonicalVersionId:record.versionId,
      storagePath,
      mimeType,
      fileSizeBytes:buffer.length,
      sha256,
      retentionClass:'standard',
      metadata:{pack:81,sessionId,artifactKind:kind,fileName:name,...metadata}
    });

    const row=await db.from('browser_session_artifacts').insert({
      owner_id:ownerId,
      session_id:sessionId,
      artifact_kind:kind === 'dom' ? 'dom' : kind,
      canonical_content_id:record.contentId,
      canonical_version_id:record.versionId,
      asset_id:asset.assetId,
      provider_artifact_id:providerArtifactId,
      file_name:name,
      mime_type:mimeType,
      file_size_bytes:buffer.length,
      sha256,
      metadata:{pack:81,...metadata}
    }).select('id').single();
    if (row.error) throw repoError('cloud_browser_artifact_row_failed',row.error);

    return Object.freeze({
      id:row.data.id,
      kind,
      contentId:record.contentId,
      versionId:record.versionId,
      assetId:asset.assetId,
      fileName:name,
      mimeType,
      fileSizeBytes:buffer.length,
      sha256
    });
  }

  async function resolveOwnedAsset({ownerId,assetId}) {
    return assets.resolveOwned({ownerId,assetId});
  }

  async function downloadOwnedAssetBuffer({ownerId,assetId}) {
    const asset=await resolveOwnedAsset({ownerId,assetId});
    if (!asset?.assetId) throw repoError('cloud_browser_upload_asset_not_found');
    const result=await storage.from(asset.storageBucket || assetConfig.bucket)
      .download(asset.storagePath);
    if (result.error || !result.data) throw repoError('cloud_browser_upload_asset_download_failed',result.error);
    const buffer=Buffer.from(await result.data.arrayBuffer());
    if (!buffer.length || buffer.length > require('../config/cloud-browser.v1.json').files.maxUploadBytes) {
      throw repoError('cloud_browser_upload_asset_too_large');
    }
    return Object.freeze({
      asset,
      buffer,
      mimeType:String(asset.mimeType || 'application/octet-stream'),
      fileName:safeFileName(asset.metadata?.fileName || asset.storagePath.split('/').pop(),'upload.bin')
    });
  }

  async function recordOwnedUpload({
    ownerId,sessionId,assetId,providerArtifactId=null,fileName=null
  }={}) {
    await internal({ownerId,sessionId});
    const asset=await resolveOwnedAsset({ownerId,assetId});
    if (!asset?.assetId) throw repoError('cloud_browser_upload_asset_not_found');

    const canonicalContentId=
      asset.canonicalContentId || asset.canonical_content_id || null;
    const canonicalVersionId=
      asset.canonicalVersionId || asset.canonical_version_id || null;
    if (!canonicalContentId || !canonicalVersionId) {
      throw repoError('cloud_browser_upload_asset_not_canonical');
    }

    const row=await db.from('browser_session_artifacts').insert({
      owner_id:ownerId,
      session_id:sessionId,
      artifact_kind:'upload',
      canonical_content_id:canonicalContentId,
      canonical_version_id:canonicalVersionId,
      asset_id:asset.assetId,
      provider_artifact_id:providerArtifactId,
      file_name:safeFileName(fileName || asset.metadata?.fileName || 'upload.bin','upload.bin'),
      mime_type:asset.mimeType || asset.mime_type || 'application/octet-stream',
      file_size_bytes:Number(asset.fileSizeBytes || asset.file_size_bytes || 0),
      sha256:asset.sha256 || null,
      metadata:{pack:81,direction:'upload'}
    }).select('id').single();
    if (row.error) throw repoError('cloud_browser_upload_artifact_row_failed',row.error);
    return Object.freeze({
      id:row.data.id,
      kind:'upload',
      assetId:asset.assetId,
      providerArtifactId
    });
  }

  async function signedArtifactDownload({ownerId,artifactId,requestId}={}) {
    const row=await db.from('browser_session_artifacts')
      .select('id,asset_id')
      .eq('id',artifactId)
      .eq('owner_id',ownerId)
      .maybeSingle();
    if (row.error) throw repoError('cloud_browser_artifact_lookup_failed',row.error);
    if (!row.data?.asset_id) throw repoError('cloud_browser_artifact_download_unavailable');
    return assets.createSignedDownload({
      ownerId,
      assetId:row.data.asset_id,
      requestId
    });
  }

  async function artifacts({ownerId,sessionId,limit=100}) {
    await internal({ownerId,sessionId});
    const result=await db.from('browser_session_artifacts')
      .select('id,artifact_kind,canonical_content_id,canonical_version_id,asset_id,provider_artifact_id,file_name,mime_type,file_size_bytes,sha256,metadata,created_at')
      .eq('owner_id',ownerId)
      .eq('session_id',sessionId)
      .order('created_at',{ascending:false})
      .limit(Math.max(1,Math.min(200,Number(limit)||100)));
    if (result.error) throw repoError('cloud_browser_artifact_list_failed',result.error);
    return Object.freeze(result.data||[]);
  }

  async function stale({limit=50}={}) {
    const now=new Date().toISOString();
    const result=await db.from('browser_sessions')
      .select('*')
      .in('status',['reserved','provisioning','running','detached','closing'])
      .or('expires_at.lte.'+now+',idle_expires_at.lte.'+now)
      .order('updated_at',{ascending:true})
      .limit(Math.max(1,Math.min(200,Number(limit)||50)));
    if (result.error) throw repoError('cloud_browser_stale_lookup_failed',result.error);
    return Object.freeze(result.data||[]);
  }

  return Object.freeze({
    internal,get,byRequest,list,reserve,transition,billing,touch,
    uploadCanonical,resolveOwnedAsset,downloadOwnedAssetBuffer,
    recordOwnedUpload,signedArtifactDownload,artifacts,stale
  });
}

module.exports={createCloudBrowserRepository};
