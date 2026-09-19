'use strict';

const crypto=require('crypto');
const {CONFIG:ASSET_CONFIG,buildCanonicalObjectPath}=require('./assetStorageContract');
const {createAssetStorageKernel}=require('./assetStorageKernel');
const {createContentRepository}=require('./contentRepository');

function repoError(code,cause=null){const e=new Error(code);e.code=code;e.cause=cause;return e;}
function duplicate(error){const s=Number(error&&(error.statusCode||error.status||error.code));const m=String(error?.message||'').toLowerCase();return s===409||m.includes('already exists')||m.includes('duplicate');}
function digest(buffer){return crypto.createHash('sha256').update(buffer).digest('hex');}

function createAudioResultRepository({db,storage,contentRepository=null,assetKernel=null}={}){
  if(!db||typeof db.from!=='function'||typeof db.rpc!=='function') throw new TypeError('Audio result repository requires database client.');
  if(!storage||typeof storage.from!=='function') throw new TypeError('Audio result repository requires storage client.');
  const content=contentRepository||createContentRepository({client:db});
  const assets=assetKernel||createAssetStorageKernel({client:db,storage});

  async function upload({ownerId,contentId,versionId,buffer,mimeType,metadata}){
    const sha256=digest(buffer);
    const storagePath=buildCanonicalObjectPath({ownerId,sha256});
    const result=await storage.from(ASSET_CONFIG.bucket).upload(storagePath,buffer,{
      contentType:mimeType,cacheControl:'3600',upsert:false
    });
    if(result.error&&!duplicate(result.error)) throw repoError('audio_result_upload_failed',result.error);
    const registered=await assets.register({
      ownerId,canonicalContentId:contentId,canonicalVersionId:versionId,
      storagePath,mimeType,fileSizeBytes:buffer.length,sha256,
      retentionClass:'standard',metadata
    });
    return Object.freeze({
      assetId:registered.assetId,contentId,versionId,mimeType,
      fileSizeBytes:buffer.length,sha256,storagePath:registered.storagePath||storagePath
    });
  }

  async function lineage({ownerId,derivedAssetId,source,relationType,metadata}){
    if(!source?.assetId||!source?.versionId) return;
    const result=await db.rpc('link_zuvyr_asset_lineage',{
      p_owner_id:ownerId,p_derived_asset_id:derivedAssetId,
      p_source_asset_id:source.assetId,p_source_content_version_id:source.versionId,
      p_relation_type:relationType,p_task_run_id:null,p_step_id:null,p_metadata:metadata||{}
    });
    if(result.error) throw repoError('audio_result_lineage_failed',result.error);
  }

  async function persistTranscript({ownerId,jobId,result,source,provider='deepgram',model='nova-3'}){
    const payload={
      transcript:result.transcript,
      language:result.language,
      languageConfidence:result.languageConfidence,
      words:result.words,
      utterances:result.utterances,
      providerMetadata:result.metadata
    };
    const jsonBuffer=Buffer.from(JSON.stringify(payload,null,2)+'\n','utf8');
    const textBuffer=Buffer.from(result.transcript+'\n','utf8');
    const sha256=digest(jsonBuffer);
    const record=await content.ensure({
      ownerId,projectId:null,kind:'text',title:'Audio transcript',
      sourceKind:'audio_transcription',sourceSystem:'zuvyr_audio_pack071',
      sourceId:'audio-job:'+jobId,sourceVersionKey:sha256,
      metadata:{pack:71,jobId,provider,model,sourceAudioAssetId:source.conversationAssetId},
      version:{
        mimeType:'application/json',uri:null,text:result.transcript,sha256,
        payload,
        provenance:{pack:71,jobId,provider,model,sourceAudio:source}
      }
    });
    const jsonAsset=await upload({
      ownerId,contentId:record.contentId,versionId:record.versionId,
      buffer:jsonBuffer,mimeType:'application/json',
      metadata:{pack:71,jobId,artifact:'transcript_json',provider,model}
    });
    const textAsset=await upload({
      ownerId,contentId:record.contentId,versionId:record.versionId,
      buffer:textBuffer,mimeType:'text/plain; charset=utf-8',
      metadata:{pack:71,jobId,artifact:'transcript_text',provider,model}
    });
    await lineage({ownerId,derivedAssetId:jsonAsset.assetId,source,relationType:'extracted_from',metadata:{pack:71,jobId,artifact:'transcript_json'}});
    await lineage({ownerId,derivedAssetId:textAsset.assetId,source,relationType:'extracted_from',metadata:{pack:71,jobId,artifact:'transcript_text'}});

    const segments=(result.utterances?.length?result.utterances:result.words).map((s,index)=>({
      owner_id:ownerId,job_id:jobId,segment_index:index,
      start_seconds:s.start,end_seconds:s.end,speaker:s.speaker,
      confidence:Number.isFinite(s.confidence)?s.confidence:null,
      text:s.text,metadata:{source:result.utterances?.length?'utterance':'word'}
    }));
    if(segments.length){
      const seg=await db.from('audio_transcript_segments').upsert(segments,{onConflict:'job_id,segment_index'});
      if(seg.error) throw repoError('audio_segments_persist_failed',seg.error);
    }

    const artifact=await db.from('audio_artifacts').insert({
      owner_id:ownerId,job_id:jobId,asset_type:'transcript',url:null,
      mime_type:'application/json',duration_seconds:source.durationSeconds,
      metadata:{pack:71,language:result.language,provider,model,textAssetId:textAsset.assetId},
      canonical_content_id:record.contentId,canonical_asset_id:jsonAsset.assetId
    });
    if(artifact.error&&!duplicate(artifact.error)) throw repoError('audio_artifact_persist_failed',artifact.error);

    const update=await db.from('audio_jobs').update({
      canonical_content_id:record.contentId,canonical_asset_id:jsonAsset.assetId,
      detected_language:result.language,result_text:result.transcript,
      usage:{
        provider,model,durationSeconds:source.durationSeconds,
        languageConfidence:result.languageConfidence,
        transcriptJsonAssetId:jsonAsset.assetId,
        transcriptTextAssetId:textAsset.assetId,
        diarized:result.words.some(w=>Number.isInteger(w.speaker))
      },
      updated_at:new Date().toISOString()
    }).eq('id',jobId).eq('owner_id',ownerId);
    if(update.error) throw repoError('audio_job_result_link_failed',update.error);

    return Object.freeze({
      contentId:record.contentId,versionId:record.versionId,
      assetId:jsonAsset.assetId,textAssetId:textAsset.assetId,
      transcript:result.transcript,language:result.language,
      segmentCount:segments.length
    });
  }

  async function persistCleanedAudio({ownerId,jobId,buffer,mimeType,format,source}){
    const sha256=digest(buffer);
    const record=await content.ensure({
      ownerId,projectId:null,kind:'audio',title:'Cleaned audio',
      sourceKind:'audio_cleanup',sourceSystem:'zuvyr_audio_pack071',
      sourceId:'audio-job:'+jobId,sourceVersionKey:sha256,
      metadata:{pack:71,jobId,operation:'audio_cleanup',sourceAudioAssetId:source.conversationAssetId},
      version:{
        mimeType,uri:null,text:null,sha256,
        payload:{operation:'audio_cleanup',format,durationSeconds:source.durationSeconds},
        provenance:{pack:71,jobId,provider:'local',model:'ffmpeg-alpine',sourceAudio:source}
      }
    });
    const audioAsset=await upload({
      ownerId,contentId:record.contentId,versionId:record.versionId,
      buffer,mimeType,
      metadata:{pack:71,jobId,artifact:'cleaned_audio',provider:'local',model:'ffmpeg-alpine',format}
    });
    await lineage({ownerId,derivedAssetId:audioAsset.assetId,source,relationType:'edited_from',metadata:{pack:71,jobId,operation:'audio_cleanup'}});
    const artifact=await db.from('audio_artifacts').insert({
      owner_id:ownerId,job_id:jobId,asset_type:'audio',url:null,mime_type:mimeType,
      duration_seconds:source.durationSeconds,
      metadata:{pack:71,provider:'local',model:'ffmpeg-alpine',format},
      canonical_content_id:record.contentId,canonical_asset_id:audioAsset.assetId
    });
    if(artifact.error&&!duplicate(artifact.error)) throw repoError('audio_artifact_persist_failed',artifact.error);
    const update=await db.from('audio_jobs').update({
      canonical_content_id:record.contentId,canonical_asset_id:audioAsset.assetId,
      usage:{provider:'local',model:'ffmpeg-alpine',durationSeconds:source.durationSeconds,format},
      updated_at:new Date().toISOString()
    }).eq('id',jobId).eq('owner_id',ownerId);
    if(update.error) throw repoError('audio_job_result_link_failed',update.error);
    return Object.freeze({contentId:record.contentId,versionId:record.versionId,assetId:audioAsset.assetId,mimeType,format});
  }

  return Object.freeze({persistTranscript,persistCleanedAudio});
}

function getDefaultAudioResultRepository(){
  const {supabaseAdmin}=require('./supabaseAdmin');
  return createAudioResultRepository({db:supabaseAdmin,storage:supabaseAdmin.storage});
}

module.exports={createAudioResultRepository,getDefaultAudioResultRepository};
