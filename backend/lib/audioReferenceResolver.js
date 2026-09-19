'use strict';

const { createAssetStorageKernel } = require('./assetStorageKernel');
const { assertOwnedStoragePath, CONFIG } = require('./assetStorageContract');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUDIO_MIME=new Set([
  'audio/mpeg','audio/mp3','audio/ogg','audio/wav','audio/x-wav',
  'audio/mp4','audio/x-m4a','audio/aac','audio/x-aac','audio/flac','audio/webm'
]);
const MAX_AUDIO_BYTES=50*1024*1024;

function resolverError(code,retryable=false){const e=new Error(code);e.code=code;e.retryable=retryable;return e;}
function duration(value){const n=Number(value);return Number.isFinite(n)&&n>0?n:null;}
function canonicalId(row,field){
  if(row?.[field]) return String(row[field]);
  const meta=row?.metadata&&typeof row.metadata==='object'?row.metadata:{};
  return meta[field]?String(meta[field]):null;
}

function compact(item){
  return Object.freeze({
    conversationAssetId:item.conversationAssetId,
    assetId:item.assetId,
    contentId:item.contentId,
    versionId:item.versionId,
    mimeType:item.mimeType,
    fileSizeBytes:item.fileSizeBytes,
    durationSeconds:item.durationSeconds,
    sha256:item.sha256
  });
}

function createAudioInputResolver({db,storage}={}){
  if(!db||typeof db.from!=='function'||typeof db.rpc!=='function') throw new TypeError('Audio input resolver requires database client.');
  if(!storage||typeof storage.from!=='function') throw new TypeError('Audio input resolver requires storage client.');
  const kernel=createAssetStorageKernel({client:db,storage});

  async function inspect({ownerId,request}){
    const id=String(request?.sourceAudioAssetId||'');
    if(!UUID.test(String(ownerId||''))||!UUID.test(id)) throw resolverError('invalid_audio_source_asset');
    const result=await db.from('conversation_assets')
      .select('id,owner_id,asset_type,mime_type,file_size_bytes,duration_seconds,sha256,scan_status,canonical_content_id,canonical_asset_id,metadata')
      .eq('id',id).eq('owner_id',ownerId).maybeSingle();
    if(result.error) throw resolverError('audio_source_lookup_failed',true);
    const row=result.data;
    if(!row||String(row.asset_type||'').toLowerCase()!=='audio'||String(row.scan_status||'').toLowerCase()!=='clean'){
      throw resolverError('audio_source_not_ready');
    }
    const assetId=canonicalId(row,'canonical_asset_id');
    const contentId=canonicalId(row,'canonical_content_id');
    if(!UUID.test(String(assetId||''))||!UUID.test(String(contentId||''))) throw resolverError('audio_source_not_canonical');
    const canonical=await kernel.resolveOwned({ownerId,assetId});
    if(!canonical||canonical.assetId!==assetId||canonical.status!=='active') throw resolverError('audio_source_not_owned');
    assertOwnedStoragePath({ownerId,storagePath:canonical.storagePath});
    const mimeType=String(canonical.mimeType||row.mime_type||'').toLowerCase();
    const fileSizeBytes=Number(canonical.fileSizeBytes??row.file_size_bytes??0);
    const durationSeconds=duration(row.duration_seconds);
    if(canonical.storageBucket!==CONFIG.bucket||!AUDIO_MIME.has(mimeType)||!Number.isSafeInteger(fileSizeBytes)||fileSizeBytes<1||fileSizeBytes>MAX_AUDIO_BYTES){
      throw resolverError('audio_source_format_unsupported');
    }
    if(!durationSeconds) throw resolverError('audio_source_duration_unavailable');
    const source=Object.freeze({
      conversationAssetId:row.id,
      assetId:canonical.assetId,
      contentId:canonical.contentId||contentId,
      versionId:canonical.versionId,
      mimeType,fileSizeBytes,durationSeconds,
      sha256:canonical.sha256||row.sha256||null,
      storageBucket:canonical.storageBucket,
      storagePath:canonical.storagePath
    });
    return Object.freeze({source,lineage:Object.freeze({sourceAudio:compact(source)})});
  }

  async function resolve({ownerId,request,requestId}){
    const inspected=await inspect({ownerId,request});
    const signed=await kernel.createSignedDownload({
      ownerId,assetId:inspected.source.assetId,
      requestId:String(requestId)+':audio-source',expiresIn:300
    });
    return Object.freeze({
      source:Object.freeze({...inspected.source,url:signed.signedUrl}),
      lineage:inspected.lineage
    });
  }

  return Object.freeze({inspect,resolve});
}

module.exports={AUDIO_MIME,MAX_AUDIO_BYTES,createAudioInputResolver};
