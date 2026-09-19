'use strict';

const fsp=require('fs/promises');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');

const FORMATS=Object.freeze({
  wav:{ext:'wav',mimeType:'audio/wav',codec:['-c:a','pcm_s16le']},
  mp3:{ext:'mp3',mimeType:'audio/mpeg',codec:['-c:a','libmp3lame','-b:a','192k']}
});

function cleanupError(code,cause=null){const e=new Error(code);e.code=code;e.cause=cause;return e;}

function argsFor({inputPath,outputPath,format='wav',strength='balanced'}={}){
  const spec=FORMATS[format];
  if(!spec) throw cleanupError('invalid_audio_cleanup_format');
  const noise=strength==='light'?'6':strength==='strong'?'18':'12';
  return [
    '-y','-hide_banner','-loglevel','error','-i',inputPath,
    '-vn',
    '-af',`highpass=f=70,lowpass=f=12000,afftdn=nf=-${noise},loudnorm=I=-16:LRA=11:TP=-1.5`,
    ...spec.codec,outputPath
  ];
}

function run(binary,args,timeoutMs=120000){
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{stdio:['ignore','ignore','pipe'],shell:false});
    let err='';
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(cleanupError('audio_cleanup_timeout'));},timeoutMs);
    child.stderr.on('data',d=>{if(err.length<16000)err+=d.toString();});
    child.on('error',e=>{clearTimeout(timer);reject(cleanupError('audio_cleanup_spawn_failed',e));});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(cleanupError('audio_cleanup_failed',new Error(err)));});
  });
}

async function executeLocalAudioCleanup({sourceUrl,format='wav',strength='balanced',fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function') throw cleanupError('audio_cleanup_fetch_unavailable');
  const response=await fetchImpl(String(sourceUrl||''),{signal:AbortSignal.timeout(120000)});
  if(!response?.ok) throw cleanupError('audio_cleanup_source_download_failed');
  const input=Buffer.from(await response.arrayBuffer());
  if(!input.length||input.length>50*1024*1024) throw cleanupError('audio_cleanup_source_size_invalid');
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'zuvyr-audio-cleanup-'));
  const inputPath=path.join(dir,'input.bin');
  const outputPath=path.join(dir,'output.'+FORMATS[format].ext);
  try{
    await fsp.writeFile(inputPath,input,{mode:0o600});
    await run('ffmpeg',argsFor({inputPath,outputPath,format,strength}));
    const buffer=await fsp.readFile(outputPath);
    if(!buffer.length) throw cleanupError('audio_cleanup_output_empty');
    return Object.freeze({buffer,mimeType:FORMATS[format].mimeType,provider:'local',model:'ffmpeg-alpine',format});
  }finally{
    await fsp.rm(dir,{recursive:true,force:true});
  }
}

module.exports={FORMATS,argsFor,executeLocalAudioCleanup};
