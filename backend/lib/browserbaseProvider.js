'use strict';

const {
  config,
  browserError,
  assertLiveAvailable,
  assertProviderCredentials
} = require('./cloudBrowserPolicy');

function providerError(code, status = null, cause = null) {
  const error=browserError(code);
  if (status !== null) error.providerStatus=Number(status);
  if (cause) error.cause=cause;
  return error;
}

function safeProviderSession(value) {
  const id=String(value?.id || '').trim();
  if (!id || id.length > 200) throw providerError('cloud_browser_provider_session_missing');
  const startedAt=value?.startedAt || value?.started_at || null;
  const endedAt=value?.endedAt || value?.ended_at || null;
  const startMs=startedAt ? Date.parse(startedAt) : NaN;
  const endMs=endedAt ? Date.parse(endedAt) : NaN;
  const usageSeconds=
    Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs
      ? Math.ceil((endMs-startMs)/1000)
      : 0;
  const proxyBytesRaw=
    value?.proxyBytes ??
    value?.proxy_bytes ??
    value?.networkUsage?.proxyBytes ??
    0;
  const proxyBytes=Number(proxyBytesRaw);
  return Object.freeze({
    id,
    status:String(value?.status || 'UNKNOWN').slice(0,80),
    region:value?.region ? String(value.region).slice(0,80) : null,
    startedAt,
    endedAt,
    usageSeconds,
    proxyBytes:Number.isFinite(proxyBytes) && proxyBytes >= 0
      ? Math.floor(proxyBytes)
      : 0
  });
}

function createBrowserbaseProvider({
  fetchImpl=globalThis.fetch,
  env=process.env
}={}) {
  if (typeof fetchImpl !== 'function') throw providerError('cloud_browser_fetch_unavailable');

  function headers() {
    assertProviderCredentials(env);
    return {
      'X-BB-API-Key':String(env.BROWSERBASE_API_KEY || '').trim(),
      'Content-Type':'application/json'
    };
  }

  async function request(path, options={}, { requireLiveGate=false }={}) {
    if (requireLiveGate) assertLiveAvailable(env);
    else assertProviderCredentials(env);

    let response;
    try {
      response=await fetchImpl(config.provider.apiBaseUrl + path, {
        ...options,
        headers:{...headers(),...(options.headers||{})}
      });
    } catch (cause) {
      throw providerError('cloud_browser_provider_unreachable', null, cause);
    }

    let body={};
    try { body=await response.json(); } catch (_) {}
    if (!response.ok) {
      throw providerError('cloud_browser_provider_rejected', response.status);
    }
    return body;
  }

  async function createSession({ localSessionId, ttlSeconds=config.session.defaultTtlSeconds }={}) {
    assertLiveAvailable(env);
    const ttl=Math.max(30,Math.min(config.session.maxTtlSeconds,Number(ttlSeconds)||config.session.defaultTtlSeconds));
    const body={
      projectId:String(env.BROWSERBASE_PROJECT_ID || '').trim(),
      keepAlive:config.session.keepAlive === true,
      timeout:ttl,
      proxies:config.session.proxies === true,
      browserSettings:{
        recordSession:config.session.recordSession === true
      },
      userMetadata:{
        zuvyrSessionId:String(localSessionId || '').slice(0,100)
      }
    };
    const data=await request(config.provider.createPath,{
      method:'POST',
      body:JSON.stringify(body)
    },{requireLiveGate:true});
    return safeProviderSession(data);
  }

  async function getSession(providerSessionId) {
    const id=String(providerSessionId || '').trim();
    if (!id || id.length > 200) throw providerError('cloud_browser_provider_session_invalid');
    const data=await request('/v1/sessions/' + encodeURIComponent(id),{method:'GET'});
    return safeProviderSession(data);
  }

  function connectUrl(providerSessionId) {
    assertProviderCredentials(env);
    const id=String(providerSessionId || '').trim();
    if (!id || id.length > 200) throw providerError('cloud_browser_provider_session_invalid');
    const url=new URL('wss://connect.browserbase.com');
    url.searchParams.set('apiKey',String(env.BROWSERBASE_API_KEY || '').trim());
    url.searchParams.set('sessionId',id);
    return url.toString();
  }

  async function releaseSession(providerSessionId) {
    const id=String(providerSessionId || '').trim();
    if (!id || id.length > 200) throw providerError('cloud_browser_provider_session_invalid');
    const data=await request(
      '/v1/sessions/' + encodeURIComponent(id),
      {
        method:'POST',
        body:JSON.stringify({status:'REQUEST_RELEASE'})
      }
    );
    return safeProviderSession(data);
  }

  async function uploadFile(providerSessionId,{
    buffer,
    fileName,
    mimeType='application/octet-stream'
  }={}) {
    assertProviderCredentials(env);
    const id=String(providerSessionId || '').trim();
    if (!id || id.length > 200) throw providerError('cloud_browser_provider_session_invalid');
    if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > config.files.maxUploadBytes) {
      throw providerError('cloud_browser_upload_invalid');
    }
    const name=String(fileName || 'upload.bin').replace(/[\\/\0]/g,'_').slice(0,240);
    const form=new FormData();
    form.append(
      'file',
      new Blob([buffer],{type:String(mimeType || 'application/octet-stream').slice(0,255)}),
      name
    );
    let response;
    try {
      response=await fetchImpl(
        config.provider.apiBaseUrl + '/v1/sessions/' + encodeURIComponent(id) + '/uploads',
        {
          method:'POST',
          headers:{'X-BB-API-Key':String(env.BROWSERBASE_API_KEY || '').trim()},
          body:form
        }
      );
    } catch (cause) {
      throw providerError('cloud_browser_provider_unreachable',null,cause);
    }
    if (!response.ok) throw providerError('cloud_browser_provider_rejected',response.status);
    const data=await response.json().catch(()=>({}));
    return Object.freeze({
      providerArtifactId:String(data?.id || data?.uploadId || '').slice(0,300) || null,
      fileName:name,
      size:buffer.length
    });
  }

  async function listDownloads(providerSessionId,{cursor=null,limit=50}={}) {
    assertProviderCredentials(env);
    const id=String(providerSessionId || '').trim();
    if (!id || id.length > 200) throw providerError('cloud_browser_provider_session_invalid');
    const url=new URL(config.provider.apiBaseUrl + '/v1/downloads');
    url.searchParams.set('sessionId',id);
    url.searchParams.set('limit',String(Math.max(1,Math.min(100,Number(limit)||50))));
    if (cursor) url.searchParams.set('cursor',String(cursor).slice(0,500));
    let response;
    try {
      response=await fetchImpl(url.toString(),{method:'GET',headers:headers()});
    } catch (cause) {
      throw providerError('cloud_browser_provider_unreachable',null,cause);
    }
    if (!response.ok) throw providerError('cloud_browser_provider_rejected',response.status);
    const data=await response.json().catch(()=>({}));
    const items=Array.isArray(data?.downloads) ? data.downloads : Array.isArray(data?.data) ? data.data : [];
    return Object.freeze({
      downloads:Object.freeze(items.map(item=>Object.freeze({
        id:String(item?.id || ''),
        fileName:String(item?.fileName || item?.filename || 'download').slice(0,240),
        mimeType:String(item?.mimeType || item?.mime_type || 'application/octet-stream').slice(0,255),
        size:Number(item?.size || item?.sizeBytes || item?.fileSizeBytes || 0),
        createdAt:item?.createdAt || item?.created_at || null
      })).filter(item=>item.id)),
      nextCursor:data?.nextCursor || data?.next_cursor || null
    });
  }

  async function getDownload(downloadId) {
    assertProviderCredentials(env);
    const id=String(downloadId || '').trim();
    if (!id || id.length > 300) throw providerError('cloud_browser_download_id_invalid');
    let response;
    try {
      response=await fetchImpl(
        config.provider.apiBaseUrl + '/v1/downloads/' + encodeURIComponent(id),
        {
          method:'GET',
          headers:{
            'X-BB-API-Key':String(env.BROWSERBASE_API_KEY || '').trim(),
            Accept:'application/octet-stream'
          }
        }
      );
    } catch (cause) {
      throw providerError('cloud_browser_provider_unreachable',null,cause);
    }
    if (!response.ok) throw providerError('cloud_browser_provider_rejected',response.status);
    const length=Number(response.headers?.get?.('content-length') || 0);
    if (length > config.files.maxDownloadBytes) throw providerError('cloud_browser_download_too_large');
    const buffer=Buffer.from(await response.arrayBuffer());
    if (buffer.length > config.files.maxDownloadBytes) throw providerError('cloud_browser_download_too_large');
    return Object.freeze({
      buffer,
      mimeType:String(response.headers?.get?.('content-type') || 'application/octet-stream').split(';')[0].trim(),
      contentDisposition:String(response.headers?.get?.('content-disposition') || '')
    });
  }

  return Object.freeze({
    createSession,
    getSession,
    connectUrl,
    releaseSession,
    uploadFile,
    listDownloads,
    getDownload
  });
}

module.exports={
  createBrowserbaseProvider,
  safeProviderSession
};
