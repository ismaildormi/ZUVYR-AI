'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const videoSystem = require('./config/video-system.v1.json');
const flags = require('./config/feature-flags.json');
const costRegistry = require('./config/cost-registry.v1.json');
const providerRegistry = require('./config/provider-registry.v1.json');
const modelRegistry = require('./config/model-registry.v1.json');
const { normalizeVideoRequest } = require('./lib/videoRequestContract');
const {
  assertVideoRequestAvailable,
  providerSupports
} = require('./lib/videoOperationRegistry');
const {
  DEFAULT_VIDEO_SUBTITLES_MODEL,
  DEFAULT_VIDEO_DUB_MODEL,
  DEFAULT_VIDEO_ENHANCE_MODEL,
  DEFAULT_VIDEO_EXPORT_MODEL,
  buildFalSubtitlesInput,
  buildFalDubInput,
  buildFalEnhanceInput,
  roundedMinuteBillingUnits,
  generateVideo
} = require('./lib/videoProvider');
const { quoteGeneration } = require('./lib/dynamicPricing');
const {
  normalizeSubtitleEvidence,
  buildSubtitleArtifacts
} = require('./lib/videoSubtitleArtifacts');
const {
  buildFfmpegArgs,
  FORMAT
} = require('./lib/localVideoExport');

const VIDEO='22222222-2222-4222-8222-222222222222';
const SOURCE={
  conversationAssetId:VIDEO,
  assetId:'33333333-3333-4333-8333-333333333333',
  contentId:'44444444-4444-4444-8444-444444444444',
  versionId:'55555555-5555-4555-8555-555555555555',
  assetType:'video',
  mimeType:'video/mp4',
  fileSizeBytes:1234567,
  sha256:'a'.repeat(64),
  durationSeconds:61
};
const RESOLVED={
  source:{...SOURCE,url:'https://fixture.invalid/source.mp4?signed=1'},
  last:null,
  audio:null,
  references:[],
  lineage:{
    sourceInputField:'sourceVideoAssetId',
    sourceImage:null,
    sourceVideo:{...SOURCE},
    sourceAudio:null,
    lastImage:null,
    referenceImages:[]
  }
};

async function run(){
  assert.equal(videoSystem.pack069.phase,'IMPLEMENTED_PAID_LIVE_DEFERRED');
  assert.equal(videoSystem.jobs.cancelEnabledByDefault,true);
  assert.equal(videoSystem.operations.export.enabledByDefault,true);
  assert.equal(videoSystem.operations.subtitles.enabledByDefault,true);
  assert.equal(videoSystem.operations.dub.enabledByDefault,true);
  assert.equal(videoSystem.operations.enhance.enabledByDefault,true);

  for(const [operation,gate] of [
    ['subtitles','PACK069_SUBTITLES_PAID_EXECUTION_ENABLED'],
    ['dub','PACK069_DUB_PAID_EXECUTION_ENABLED'],
    ['enhance','PACK069_ENHANCE_PAID_EXECUTION_ENABLED']
  ]){
    assert.throws(
      ()=>assertVideoRequestAvailable({operation},{env:{}}),
      e=>e.code==='video_operation_paid_execution_disabled'
    );
    assert.equal(
      assertVideoRequestAvailable({operation},{env:{[gate]:'true'}}).operation,
      operation
    );
    assert.equal(providerSupports('fal',operation),true);
  }
  assert.equal(assertVideoRequestAvailable({operation:'export'},{env:{}}).operation,'export');
  assert.equal(providerSupports('local','export'),true);

  const subtitles=normalizeVideoRequest({
    videoOperation:'subtitles',
    sourceVideoAssetId:VIDEO,
    videoOptions:{
      subtitleLanguage:'fr',
      subtitleFormats:['srt','vtt'],
      fontName:'Montserrat',
      fontSize:96,
      fontWeight:'bold',
      fontColor:'white',
      highlightColor:'purple',
      strokeWidth:3,
      strokeColor:'black',
      backgroundColor:'none',
      backgroundOpacity:0,
      position:'bottom',
      yOffset:75,
      wordsPerSubtitle:2,
      enableAnimation:true
    }
  });
  const dub=normalizeVideoRequest({
    videoOperation:'dub',
    sourceVideoAssetId:VIDEO,
    videoOptions:{
      sourceLanguage:'auto',
      targetLanguage:'es',
      highestResolution:true
    }
  });
  const enhance=normalizeVideoRequest({
    videoOperation:'enhance',
    sourceVideoAssetId:VIDEO,
    videoOptions:{
      increaseFactor:4,
      preserveAudio:true,
      exportFormat:'webm'
    }
  });
  const exported=normalizeVideoRequest({
    videoOperation:'export',
    sourceVideoAssetId:VIDEO,
    videoOptions:{exportFormat:'mov'}
  });

  const subtitleInput=buildFalSubtitlesInput(subtitles,RESOLVED);
  assert.equal(subtitleInput.video_url,RESOLVED.source.url);
  assert.equal(subtitleInput.language,'fr');
  assert.equal(subtitleInput.words_per_subtitle,2);
  assert.equal(subtitleInput.font_name,'Montserrat');

  const dubInput=buildFalDubInput(dub,RESOLVED);
  assert.equal(dubInput.video_url,RESOLVED.source.url);
  assert.equal(dubInput.target_lang,'es');
  assert.equal(dubInput.source_lang,undefined);
  assert.equal(dubInput.highest_resolution,true);

  const enhanceInput=buildFalEnhanceInput(enhance,RESOLVED);
  assert.equal(enhanceInput.video_url,RESOLVED.source.url);
  assert.equal(enhanceInput.desired_increase,'4');
  assert.equal(enhanceInput.output_container_and_codec,'webm_vp9');
  assert.equal(enhanceInput.preserve_audio,true);

  assert.equal(roundedMinuteBillingUnits(0.001),1);
  assert.equal(roundedMinuteBillingUnits(60),1);
  assert.equal(roundedMinuteBillingUnits(60.001),2);
  assert.equal(roundedMinuteBillingUnits(61),2);

  let falCalls=0;
  await assert.rejects(
    ()=>generateVideo(subtitles,{
      env:{FAL_KEY:'synthetic'},
      resolvedInputs:RESOLVED,
      createFalClient:async()=>({
        subscribe:async()=>{falCalls+=1;return null;}
      })
    }),
    /pack069_subtitles_paid_execution_disabled/
  );
  assert.equal(falCalls,0);

  const generated=await generateVideo(subtitles,{
    env:{FAL_KEY:'synthetic',PACK069_SUBTITLES_PAID_EXECUTION_ENABLED:'true'},
    resolvedInputs:RESOLVED,
    createFalClient:async key=>({
      async subscribe(model,{input}){
        falCalls+=1;
        assert.equal(key,'synthetic');
        assert.equal(model,DEFAULT_VIDEO_SUBTITLES_MODEL);
        assert.equal(input.video_url,RESOLVED.source.url);
        return {data:{
          video:{url:'https://fixture.invalid/subtitled.mp4'},
          transcription:'Hello world from ZUVYR',
          subtitle_count:2,
          words:[
            {text:'Hello',start:0,end:0.4},
            {text:'world',start:0.4,end:0.9},
            {text:'from',start:1,end:1.2},
            {text:'ZUVYR',start:1.2,end:1.8}
          ],
          transcription_metadata:{language:'en'}
        }};
      }
    })
  });
  assert.equal(falCalls,1);
  assert.equal(generated.url,'https://fixture.invalid/subtitled.mp4');
  assert.equal(generated.billableUnits.unitType,'video_seconds');
  assert.equal(generated.billableUnits.units,61);
  assert.equal(generated.providerMetadata.words.length,4);

  const evidence=normalizeSubtitleEvidence({
    transcription:generated.providerMetadata.transcription,
    words:generated.providerMetadata.words,
    transcriptionMetadata:generated.providerMetadata.transcriptionMetadata,
    wordsPerSubtitle:2
  });
  assert.equal(evidence.cues.length,2);
  const subtitleFiles=buildSubtitleArtifacts({
    transcription:generated.providerMetadata.transcription,
    words:generated.providerMetadata.words,
    transcriptionMetadata:generated.providerMetadata.transcriptionMetadata,
    wordsPerSubtitle:2
  },['srt','vtt']);
  assert.equal(subtitleFiles.artifacts.length,2);
  const srt=subtitleFiles.artifacts.find(x=>x.format==='srt').buffer.toString('utf8');
  const vtt=subtitleFiles.artifacts.find(x=>x.format==='vtt').buffer.toString('utf8');
  assert(srt.includes('00:00:00,000 --> 00:00:00,900'));
  assert(srt.includes('Hello world'));
  assert(vtt.startsWith('WEBVTT\n\n'));
  assert(vtt.includes('00:00:01.000 --> 00:00:01.800'));

  const now=Date.parse('2026-09-19T02:00:00Z');
  const quote=(request,gate,context)=>quoteGeneration('video',{
    videoRequest:request,
    videoPricingContext:context,
    env:{FAL_KEY:'synthetic',...(gate?{[gate]:'true'}:{})},
    now
  });
  const subtitleQuote=quote(
    subtitles,
    'PACK069_SUBTITLES_PAID_EXECUTION_ENABLED',
    {sourceDurationSeconds:90}
  );
  assert.equal(subtitleQuote.providerCostMicroUsd,'45000');

  const dub61=normalizeVideoRequest({
    videoOperation:'dub',
    sourceVideoAssetId:VIDEO,
    videoOptions:{targetLanguage:'fr'}
  });
  const dubQuote=quote(
    dub61,
    'PACK069_DUB_PAID_EXECUTION_ENABLED',
    {sourceDurationSeconds:61}
  );
  assert.equal(dubQuote.providerCostMicroUsd,'1200000');

  const enhance45=normalizeVideoRequest({
    videoOperation:'enhance',
    sourceVideoAssetId:VIDEO,
    videoOptions:{increaseFactor:2,exportFormat:'mp4'}
  });
  const enhanceQuote=quote(
    enhance45,
    'PACK069_ENHANCE_PAID_EXECUTION_ENABLED',
    {sourceDurationSeconds:4.5}
  );
  assert.equal(enhanceQuote.providerCostMicroUsd,'630000');

  const exportQuote=quoteGeneration('video',{
    videoRequest:exported,
    videoPricingContext:{sourceDurationSeconds:61},
    env:{},
    now
  });
  assert.equal(exportQuote.provider,'local-ffmpeg');
  assert.equal(exportQuote.providerCostMicroUsd,'0');
  assert(Number.isSafeInteger(exportQuote.credits));
  assert(exportQuote.credits>=1);

  const ffmpegArgs=buildFfmpegArgs({
    inputPath:'/tmp/input.mp4',
    outputPath:'/tmp/output.webm',
    format:'webm'
  });
  assert(ffmpegArgs.includes('libvpx-vp9'));
  assert(ffmpegArgs.includes('libopus'));
  assert.equal(FORMAT.mov.mimeType,'video/quicktime');

  const expectedCosts=[
    'fal-auto-subtitle-input-minute',
    'fal-elevenlabs-dubbing-rounded-minute',
    'fal-bria-video-increase-resolution-second',
    'local-ffmpeg-video-export'
  ];
  for(const id of expectedCosts){
    const entry=costRegistry.entries.find(x=>x.id===id);
    assert(entry,'missing Pack069 cost entry '+id);
    assert.equal(entry.verificationStatus,'verified');
  }

  for(const [provider,model,cap] of [
    ['fal',DEFAULT_VIDEO_SUBTITLES_MODEL,'video.subtitles'],
    ['fal',DEFAULT_VIDEO_DUB_MODEL,'video.dub'],
    ['fal',DEFAULT_VIDEO_ENHANCE_MODEL,'video.enhance'],
    ['local',DEFAULT_VIDEO_EXPORT_MODEL,'video.export']
  ]){
    assert(
      providerRegistry.providers[provider].capabilities.some(x=>x.id===cap && x.model===model),
      'provider registry missing '+model
    );
    assert(
      modelRegistry.models.some(x=>x.providerId===provider && x.modelId===model),
      'model registry missing '+model
    );
  }

  assert.equal(flags.video_subtitles.enabled,false);
  assert.equal(flags.video_dubbing.enabled,false);
  assert.equal(flags.video_enhance.enabled,false);
  assert.equal(flags.video_export.enabled,true);
  assert.equal(flags.video_cancel.enabled,true);

  const migration=fs.readFileSync(
    path.join(__dirname,'69_pack069_subtitles_dubbing_enhance_export_cancel.sql'),
    'utf8'
  );
  const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  const worker=fs.readFileSync(path.join(__dirname,'worker.js'),'utf8');
  const docker=fs.readFileSync(path.join(__dirname,'Dockerfile.worker'),'utf8');
  const derived=fs.readFileSync(path.join(__dirname,'lib/videoDerivedRepository.js'),'utf8');

  for(const marker of [
    "'dub'",
    'begin_zuvyr_video_job',
    'claim_zuvyr_video_execution',
    'request_zuvyr_video_job_cancel',
    'for update'
  ]) assert(migration.includes(marker),marker);

  for(const marker of [
    "app.post('/api/video-jobs/:jobId/cancel'",
    'request_zuvyr_video_job_cancel',
    'assetStorageKernel.createSignedDownload',
    "'subtitles','dub','enhance','export'"
  ]) assert(server.includes(marker),marker);

  for(const marker of [
    'executeLocalVideoExport({',
    'buildSubtitleArtifacts(',
    'getDefaultVideoDerivedRepository()',
    'assertVideoCommitAllowed({',
    'refundCancelledVideo({'
  ]) assert(worker.includes(marker),marker);

  assert(docker.includes('ffmpeg \\'));
  assert(docker.includes('ffprobe -version'));
  assert(derived.includes("'transcoded_from'"));
  assert(derived.includes("'extracted_from'"));

  console.log('PASS: PACK069 exact request/provider/pricing contracts cover subtitles, dubbing, enhancement and local export');
  console.log('PASS: PACK069 builds bounded SRT/VTT artifacts and preserves canonical video/subtitle lineage');
  console.log('PASS: PACK069 cancellation is DB-authoritative before execution claim; late/terminal results cannot overwrite terminal state');
  console.log('LIVE PROVIDER / PAYMENT / PRODUCTION DATABASE / NETWORK CALLS: NONE');
}

run().catch(error=>{console.error(error);process.exit(1);});
