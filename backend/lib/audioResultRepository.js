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

  async function getExisting({ownerId,jobId}){
    const result=await db.from('audio_jobs')
      .select('id,owner_id,operation,status,provider,model,canonical_content_id,canonical_asset_id,result_text,detected_language,provider_result,usage')
      .eq('id',jobId).eq('owner_id',ownerId).maybeSingle();
    if(result.error) throw repoError('audio_job_lookup_failed',result.error);
    const job=result.data;
    if(!job) return null;
    if(job.canonical_content_id&&job.canonical_asset_id){
      return Object.freeze({
        contentId:job.canonical_content_id,
        assetId:job.canonical_asset_id,
        transcript:job.result_text||null,
        language:job.detected_language||null,
        provider:job.provider||null,
        model:job.model||null,
        canonical:true
      });
    }
    const providerResult=job.provider_result&&typeof job.provider_result==='object'
      ? job.provider_result
      : {};
    if(job.operation==='transcription'&&providerResult.transcript){
      return Object.freeze({
        providerResult,
        provider:job.provider||'deepgram',
        model:job.model||'nova-3',
        canonical:false
      });
    }
    if(job.operation==='text_to_speech'&&providerResult.kind==='pack072_tts_audio'&&providerResult.audioBase64){
      return Object.freeze({
        providerResult,
        provider:job.provider||'deepgram',
        model:job.model||'aura-2-thalia-en',
        canonical:false
      });
    }
    return null;
  }

  async function persistTranscript({ownerId,jobId,result,source,provider='deepgram',model='nova-3'}){
    const payload={
      schemaVersion:'pack071.transcript.v1',
      zuvyr:{
        pack:71,
        jobId,
        sourceAudioAssetId:source.assetId
      },
      transcript:result.transcript,
      language:result.language,
      languages:result.languages || [],
      languageConfidence:result.languageConfidence,
      words:result.words,
      utterances:result.utterances,
      providerMetadata:result.metadata
    };
    const jsonBuffer=Buffer.from(JSON.stringify(payload,null,2)+'\n','utf8');
    const sha256=digest(jsonBuffer);
    const record=await content.ensure({
      ownerId,projectId:null,kind:'text',title:'Audio transcript',
      sourceKind:'audio_transcription',sourceSystem:'zuvyr_audio_pack071',
      sourceId:[
        'transcription',source.assetId,provider,model,'multi','diarize'
      ].join(':'),sourceVersionKey:sha256,
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
    await lineage({ownerId,derivedAssetId:jsonAsset.assetId,source,relationType:'extracted_from',metadata:{pack:71,jobId,artifact:'transcript_json'}});

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
      metadata:{pack:71,language:result.language,provider,model},
      canonical_content_id:record.contentId,canonical_asset_id:jsonAsset.assetId
    });
    if(artifact.error&&!duplicate(artifact.error)) throw repoError('audio_artifact_persist_failed',artifact.error);

    const update=await db.from('audio_jobs').update({
      canonical_content_id:record.contentId,canonical_asset_id:jsonAsset.assetId,
      detected_language:result.language,result_text:result.transcript,
      usage:{
        provider,model,durationSeconds:source.durationSeconds,
        languageConfidence:result.languageConfidence,
        languages:result.languages || [],
        transcriptJsonAssetId:jsonAsset.assetId,
        diarized:result.words.some(w=>Number.isInteger(w.speaker))
      },
      updated_at:new Date().toISOString()
    }).eq('id',jobId).eq('owner_id',ownerId);
    if(update.error) throw repoError('audio_job_result_link_failed',update.error);

    return Object.freeze({
      contentId:record.contentId,versionId:record.versionId,
      assetId:jsonAsset.assetId,
      transcript:result.transcript,language:result.language,
      segmentCount:segments.length
    });
  }

  async function persistSynthesizedAudio({ownerId,jobId,text,buffer,mimeType,format,provider='deepgram',model,characterCount,providerMetadata={}}){
    if(!Buffer.isBuffer(buffer)||buffer.length<1) throw repoError('tts_audio_buffer_invalid');
    const textHash=digest(Buffer.from(String(text||''),'utf8'));
    const audioSha=digest(buffer);
    const record=await content.ensure({
      ownerId,projectId:null,kind:'audio',title:'Synthesized speech',
      sourceKind:'text_to_speech',sourceSystem:'zuvyr_audio_pack072',
      sourceId:['tts',textHash,provider,model,format].join(':'),
      sourceVersionKey:audioSha,
      metadata:{pack:72,jobId,operation:'text_to_speech',provider,model,format,characterCount},
      version:{
        mimeType,uri:null,text:null,sha256:audioSha,
        payload:{operation:'text_to_speech',provider,model,format,characterCount},
        provenance:{pack:72,jobId,provider,model,characterCount}
      }
    });
    const audioAsset=await upload({
      ownerId,contentId:record.contentId,versionId:record.versionId,
      buffer,mimeType,
      metadata:{pack:72,jobId,artifact:'tts_audio',provider,model,format,characterCount}
    });

    const artifact=await db.from('audio_artifacts').insert({
      owner_id:ownerId,job_id:jobId,asset_type:'audio',url:null,mime_type:mimeType,
      duration_seconds:null,
      metadata:{pack:72,provider,model,format,characterCount,providerMetadata},
      canonical_content_id:record.contentId,canonical_asset_id:audioAsset.assetId
    });
    if(artifact.error&&!duplicate(artifact.error)) throw repoError('audio_artifact_persist_failed',artifact.error);

    const current=await db.from('audio_jobs').select('usage').eq('id',jobId).eq('owner_id',ownerId).maybeSingle();
    if(current.error) throw repoError('audio_job_usage_lookup_failed',current.error);
    const usage=current.data?.usage&&typeof current.data.usage==='object'?current.data.usage:{};
    const update=await db.from('audio_jobs').update({
      canonical_content_id:record.contentId,
      canonical_asset_id:audioAsset.assetId,
      provider_result:{
        kind:'pack072_tts_persisted',
        provider,model,format,characterCount,
        requestId:providerMetadata?.requestId||null
      },
      usage:{...usage,provider,model,format,speechCharacters:characterCount},
      updated_at:new Date().toISOString()
    }).eq('id',jobId).eq('owner_id',ownerId);
    if(update.error) throw repoError('audio_job_result_link_failed',update.error);
    return Object.freeze({
      contentId:record.contentId,versionId:record.versionId,
      assetId:audioAsset.assetId,mimeType,format,characterCount
    });
  }

  async function persistCleanedAudio({ownerId,jobId,buffer,mimeType,format,strength='balanced',source}){
    const sha256=digest(buffer);
    const record=await content.ensure({
      ownerId,projectId:null,kind:'audio',title:'Cleaned audio',
      sourceKind:'audio_cleanup',sourceSystem:'zuvyr_audio_pack071',
      sourceId:['cleanup',source.assetId,format,strength].join(':'),
      sourceVersionKey:sha256,
      metadata:{pack:71,jobId,operation:'audio_cleanup',sourceAudioAssetId:source.conversationAssetId},
      version:{
        mimeType,uri:null,text:null,sha256,
        payload:{operation:'audio_cleanup',format,strength,durationSeconds:source.durationSeconds},
        provenance:{pack:71,jobId,provider:'local',model:'ffmpeg-alpine',sourceAudio:source}
      }
    });
    const audioAsset=await upload({
      ownerId,contentId:record.contentId,versionId:record.versionId,
      buffer,mimeType,
      metadata:{pack:71,jobId,artifact:'cleaned_audio',provider:'local',model:'ffmpeg-alpine',format,strength}
    });
    await lineage({ownerId,derivedAssetId:audioAsset.assetId,source,relationType:'edited_from',metadata:{pack:71,jobId,operation:'audio_cleanup'}});
    const artifact=await db.from('audio_artifacts').insert({
      owner_id:ownerId,job_id:jobId,asset_type:'audio',url:null,mime_type:mimeType,
      duration_seconds:source.durationSeconds,
      metadata:{pack:71,provider:'local',model:'ffmpeg-alpine',format,strength},
      canonical_content_id:record.contentId,canonical_asset_id:audioAsset.assetId
    });
    if(artifact.error&&!duplicate(artifact.error)) throw repoError('audio_artifact_persist_failed',artifact.error);
    const update=await db.from('audio_jobs').update({
      canonical_content_id:record.contentId,canonical_asset_id:audioAsset.assetId,
      usage:{provider:'local',model:'ffmpeg-alpine',durationSeconds:source.durationSeconds,format,strength},
      updated_at:new Date().toISOString()
    }).eq('id',jobId).eq('owner_id',ownerId);
    if(update.error) throw repoError('audio_job_result_link_failed',update.error);
    return Object.freeze({contentId:record.contentId,versionId:record.versionId,assetId:audioAsset.assetId,mimeType,format});
  }

  return Object.freeze({getExisting,persistTranscript,persistSynthesizedAudio,persistCleanedAudio});
}

function getDefaultAudioResultRepository(){
  const {supabaseAdmin}=require('./supabaseAdmin');
  return createAudioResultRepository({db:supabaseAdmin,storage:supabaseAdmin.storage});
}

module.exports={createAudioResultRepository,getDefaultAudioResultRepository};
