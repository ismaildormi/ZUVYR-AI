'use strict';

const crypto = require('node:crypto');
const JSZip = require('jszip');
const releaseConfig = require('../config/code-release.v1.json');
const { safePath } = require('./codeProjectSandboxArchive');

function providerError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function envTrue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function deploymentAvailability(env = process.env) {
  const blockers = [];
  if (releaseConfig.deploy.liveEnabledByDefault !== true) {
    blockers.push('pack079_source_live_gate_closed');
  }
  if (!envTrue(env.ZUVYR_M16_VERIFIED)) {
    blockers.push('pack079_m16_unverified');
  }
  if (releaseConfig.deploy.pricingVerificationStatus !== 'verified') {
    blockers.push('pack079_deploy_pricing_unverified');
  }
  if (!envTrue(env.ZUVYR_DEPLOY_PRICING_VERIFIED)) {
    blockers.push('pack079_deploy_pricing_operator_gate_closed');
  }
  for (const key of releaseConfig.deploy.requiredEnvironment) {
    if (!String(env[key] || '').trim()) {
      blockers.push('pack079_missing_' + key.toLowerCase());
    }
  }
  return Object.freeze({
    live:blockers.length===0,
    provider:releaseConfig.deploy.provider,
    externalGate:releaseConfig.deploy.externalGate,
    blockers:Object.freeze(blockers)
  });
}

function providerCredentialsAvailability(env = process.env) {
  const blockers = [];
  for (const key of releaseConfig.deploy.requiredEnvironment) {
    if (!String(env[key] || '').trim()) {
      blockers.push('pack079_missing_' + key.toLowerCase());
    }
  }
  return Object.freeze({
    available:blockers.length===0,
    blockers:Object.freeze(blockers)
  });
}

function assertDeploymentLive(env = process.env) {
  const status=deploymentAvailability(env);
  if(!status.live){
    const error=providerError('pack079_deploy_live_gate_closed');
    error.blockers=status.blockers;
    throw error;
  }
  return status;
}

function assertProviderCredentials(env = process.env) {
  const status=providerCredentialsAvailability(env);
  if(!status.available){
    const error=providerError('pack079_provider_credentials_unavailable');
    error.blockers=status.blockers;
    throw error;
  }
  return status;
}

function sha1(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function normalizeProviderProjectId(value) {
  const id=String(value||'').trim();
  if (
    id.length<3 ||
    id.length>240 ||
    /[/?#\s]/.test(id)
  ) throw providerError('pack079_provider_project_invalid');
  return id;
}

function normalizeDeploymentId(value) {
  const id=String(value||'').trim();
  if(!/^dpl_[A-Za-z0-9_-]{6,}$/.test(id)){
    throw providerError('pack079_provider_deployment_invalid');
  }
  return id;
}

function deploymentUrl(value) {
  const raw=String(value||'').trim();
  if(!raw) return null;
  let url;
  try{
    url=new URL(/^https:\/\//i.test(raw)?raw:'https://'+raw);
  }catch(_){
    throw providerError('pack079_provider_deployment_url_invalid');
  }
  if(url.protocol!=='https:' || !url.hostname.endsWith('.vercel.app')){
    throw providerError('pack079_provider_deployment_url_invalid');
  }
  return url.toString().replace(/\/$/,'');
}

async function deploymentFilesFromZip(archive) {
  if(!Buffer.isBuffer(archive) || archive.length<22){
    throw providerError('pack079_deploy_archive_invalid');
  }
  let zip;
  try{
    zip=await JSZip.loadAsync(archive,{checkCRC32:true});
  }catch(cause){
    throw providerError('pack079_deploy_archive_invalid',cause);
  }
  const files=[];
  for(const name of Object.keys(zip.files).sort()){
    const entry=zip.files[name];
    if(entry.dir) continue;
    const filePath=safePath(name);
    if(filePath===releaseConfig.zip.manifestPath) continue;
    const data=await entry.async('nodebuffer');
    files.push(Object.freeze({
      file:filePath,
      data,
      sha:sha1(data),
      size:data.length
    }));
  }
  if(!files.length) throw providerError('pack079_deploy_files_empty');
  if(files.length>releaseConfig.zip.maxCodeFiles+releaseConfig.zip.maxAssets){
    throw providerError('pack079_deploy_file_count_too_large');
  }
  return Object.freeze(files);
}

function publicDeployment(result) {
  if(!result || typeof result!=='object'){
    throw providerError('pack079_provider_deployment_invalid');
  }
  const id=normalizeDeploymentId(result.id||result.uid);
  const state=String(result.readyState||result.state||'UNKNOWN').toUpperCase();
  const url=deploymentUrl(result.url||result.deploymentUrl);
  return Object.freeze({
    id,
    state,
    url,
    readyAt:Number(result.ready||result.readyAt||0)||null,
    createdAt:Number(result.created||result.createdAt||0)||null
  });
}

function createVercelDeploymentProvider({
  fetchImpl=globalThis.fetch,
  env=process.env,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
}={}) {
  if(typeof fetchImpl!=='function'){
    throw providerError('pack079_fetch_unavailable');
  }

  function apiUrl(pathname,params={}) {
    const url=new URL(pathname,'https://api.vercel.com');
    const teamId=String(env.VERCEL_TEAM_ID||'').trim();
    if(teamId) url.searchParams.set('teamId',teamId);
    for(const [key,value] of Object.entries(params)){
      if(value!==undefined && value!==null && value!==''){
        url.searchParams.set(key,String(value));
      }
    }
    return url.toString();
  }

  async function request(pathname,{
    method='GET',headers={},body=null,params={},requireLiveGate=false,
    expectedStatuses=null
  }={}) {
    if(requireLiveGate) assertDeploymentLive(env);
    else assertProviderCredentials(env);
    const token=String(env.VERCEL_TOKEN||'').trim();
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    let response;
    try{
      response=await fetchImpl(apiUrl(pathname,params),{
        method,
        signal:controller.signal,
        headers:{
          Authorization:'Bearer '+token,
          ...headers
        },
        body
      });
    }catch(cause){
      if(cause?.name==='AbortError'){
        throw providerError('pack079_provider_timeout',cause);
      }
      throw providerError('pack079_provider_unreachable',cause);
    }finally{
      clearTimeout(timer);
    }

    const allowed=Array.isArray(expectedStatuses)
      ? expectedStatuses.includes(response.status)
      : response.ok;
    let parsed={};
    const contentType=String(response.headers?.get?.('content-type')||'');
    if(contentType.includes('json')){
      parsed=await response.json().catch(()=>({}));
    }else{
      const text=await response.text().catch(()=>'');
      if(text) parsed={text:text.slice(0,2000)};
    }
    if(!allowed){
      const error=providerError('pack079_provider_rejected');
      error.providerStatus=Number(response.status);
      error.providerCode=String(parsed?.error?.code||parsed?.code||'').slice(0,120)||null;
      throw error;
    }
    return parsed;
  }

  async function uploadFile(file) {
    const digest=sha1(file.data);
    if(digest!==file.sha) throw providerError('pack079_upload_digest_mismatch');
    await request('/v2/files',{
      method:'POST',
      headers:{
        'Content-Type':'application/octet-stream',
        'Content-Length':String(file.data.length),
        'x-Vercel-Digest':digest
      },
      body:file.data,
      requireLiveGate:true,
      expectedStatuses:[200,201]
    });
    return Object.freeze({
      file:file.file,
      sha:digest,
      size:file.data.length
    });
  }

  async function currentProduction(providerProjectId) {
    const projectId=normalizeProviderProjectId(providerProjectId);
    const body=await request('/v6/deployments',{
      params:{
        projectId,
        target:'production',
        state:'READY',
        limit:1
      }
    });
    const row=Array.isArray(body?.deployments)?body.deployments[0]:null;
    if(!row) return null;
    return publicDeployment(row);
  }

  async function createPreviewDeployment({
    providerProjectId,archive,artifactSha256,versionId
  }={}) {
    assertDeploymentLive(env);
    const projectId=normalizeProviderProjectId(providerProjectId);
    const files=await deploymentFilesFromZip(archive);
    const uploaded=[];
    for(const file of files) uploaded.push(await uploadFile(file));

    const body=await request('/v13/deployments',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      requireLiveGate:true,
      body:JSON.stringify({
        name:'zuvyr-'+String(artifactSha256||'release').slice(0,16),
        project:projectId,
        files:uploaded,
        meta:{
          zuvyrReleaseArtifactSha256:String(artifactSha256||''),
          zuvyrProjectVersionId:String(versionId||'')
        }
      })
    });
    return publicDeployment(body);
  }

  async function getDeployment(deploymentId) {
    const id=normalizeDeploymentId(deploymentId);
    const body=await request('/v13/deployments/'+encodeURIComponent(id));
    return publicDeployment(body);
  }

  async function waitUntilReady(deploymentId,{
    timeoutMs=180000,pollMs=2000
  }={}) {
    const started=Date.now();
    while(Date.now()-started<=timeoutMs){
      const current=await getDeployment(deploymentId);
      if(current.state==='READY') return current;
      if(['ERROR','CANCELED','BLOCKED'].includes(current.state)){
        const error=providerError('pack079_provider_deployment_failed');
        error.deployment=current;
        throw error;
      }
      await sleep(pollMs);
    }
    throw providerError('pack079_provider_deployment_wait_timeout');
  }

  async function promote({providerProjectId,deploymentId}={}) {
    assertDeploymentLive(env);
    const projectId=normalizeProviderProjectId(providerProjectId);
    const id=normalizeDeploymentId(deploymentId);
    await request(
      '/v10/projects/'+encodeURIComponent(projectId)+'/promote/'+encodeURIComponent(id),
      {method:'POST',body:'{}',headers:{'Content-Type':'application/json'},
       requireLiveGate:true,expectedStatuses:[200,201,202,204]}
    );
    return Object.freeze({promoted:true,providerProjectId:projectId,deploymentId:id});
  }

  async function rollback({providerProjectId,deploymentId,description='ZUVYR user-approved rollback'}={}) {
    const projectId=normalizeProviderProjectId(providerProjectId);
    const id=normalizeDeploymentId(deploymentId);
    await request(
      '/v1/projects/'+encodeURIComponent(projectId)+'/rollback/'+encodeURIComponent(id),
      {
        method:'POST',
        body:'{}',
        headers:{'Content-Type':'application/json'},
        params:{description:String(description||'').slice(0,200)},
        expectedStatuses:[200,201,202,204]
      }
    );
    return Object.freeze({rolledBack:true,providerProjectId:projectId,deploymentId:id});
  }

  return Object.freeze({
    currentProduction,
    createPreviewDeployment,
    getDeployment,
    waitUntilReady,
    promote,
    rollback
  });
}

module.exports={
  providerError,
  deploymentAvailability,
  providerCredentialsAvailability,
  assertDeploymentLive,
  assertProviderCredentials,
  sha1,
  normalizeProviderProjectId,
  normalizeDeploymentId,
  deploymentUrl,
  deploymentFilesFromZip,
  publicDeployment,
  createVercelDeploymentProvider
};
