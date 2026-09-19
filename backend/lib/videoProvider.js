'use strict';

const Replicate = require('replicate');
const { providerSupports } = require('./videoOperationRegistry');
const DEFAULT_VIDEO_MODEL='wan-video/wan-2.2-t2v-fast';
const PROVIDER_FPS=16;
const MIN_FRAMES=81;
const MAX_FRAMES=121;
function providerError(code){const error=new Error(code);error.code=code;error.retryable=false;return error;}
function normalizeProviderOutput(output){
  const first=Array.isArray(output)?output[0]:output;
  if(typeof first==='string')return first;
  if(first&&typeof first.url==='function')return first.url();
  if(first&&typeof first.url==='string')return first.url;
  throw providerError('video_provider_returned_no_url');
}
function durationToFrames(durationSeconds){
  const duration=Number(durationSeconds);
  if(!Number.isSafeInteger(duration)||duration<1)throw providerError('invalid_video_duration');
  const frames=duration*PROVIDER_FPS+1;
  if(frames<MIN_FRAMES||frames>MAX_FRAMES)throw providerError('video_duration_not_supported_by_provider');
  return frames;
}
function buildReplicateInput(request={}){
  if(request.operation!=='text_to_video')throw providerError('video_operation_not_supported_by_provider');
  const options=request.options||{};
  const resolution=String(options.resolution||'480p').toLowerCase();
  const aspectRatio=String(options.ratio||'16:9');
  const fps=Number(options.fps==null?PROVIDER_FPS:options.fps);
  const audio=options.audio===undefined?false:options.audio;
  const exportFormat=String(options.exportFormat||'mp4').toLowerCase();
  if(!['480p','720p'].includes(resolution))throw providerError('video_resolution_not_supported_by_provider');
  if(!['16:9','9:16'].includes(aspectRatio))throw providerError('video_ratio_not_supported_by_provider');
  if(fps!==PROVIDER_FPS)throw providerError('video_fps_not_supported_by_provider');
  if(audio!==false)throw providerError('video_audio_not_supported_by_provider');
  if(exportFormat!=='mp4')throw providerError('video_export_not_supported_by_provider');
  const input={prompt:String(request.prompt||'').trim(),go_fast:true,num_frames:durationToFrames(options.durationSeconds==null?5:options.durationSeconds),resolution,aspect_ratio:aspectRatio,sample_shift:12,optimize_prompt:false,frames_per_second:PROVIDER_FPS,interpolate_output:true};
  if(options.seed!==null&&options.seed!==undefined)input.seed=Number(options.seed);
  return Object.freeze(input);
}
async function generateVideo(request,{env=process.env,createClient=token=>new Replicate({auth:token})}={}){
  if(!providerSupports('replicate',request.operation))throw providerError('video_operation_not_supported_by_provider');
  if(!env.REPLICATE_API_TOKEN)throw providerError('replicate_video_provider_not_configured');
  if(env.REPLICATE_VIDEO_MODEL&&String(env.REPLICATE_VIDEO_MODEL).trim()!==DEFAULT_VIDEO_MODEL)throw providerError('replicate_video_model_mismatch');
  const input=buildReplicateInput(request);
  const client=createClient(env.REPLICATE_API_TOKEN);
  const output=await client.run(DEFAULT_VIDEO_MODEL,{input});
  return Object.freeze({url:normalizeProviderOutput(output),provider:'replicate',model:DEFAULT_VIDEO_MODEL,input,billing:Object.freeze({unit:'output_video',quantity:1,resolution:input.resolution,durationSeconds:(input.num_frames-1)/PROVIDER_FPS,numFrames:input.num_frames,fps:PROVIDER_FPS})});
}
module.exports={DEFAULT_VIDEO_MODEL,PROVIDER_FPS,MIN_FRAMES,MAX_FRAMES,durationToFrames,buildReplicateInput,normalizeProviderOutput,generateVideo};
