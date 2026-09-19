'use strict';

const WebSocket = require('ws');
const {
  config,
  browserError,
  normalizePublicUrl
} = require('./cloudBrowserPolicy');

function cdpError(code) {
  const error=browserError(code);
  return error;
}

function createCdpConnection({
  connectUrl,
  allowedHosts,
  WebSocketImpl=WebSocket,
  commandTimeoutMs=15000,
  connectTimeoutMs=10000
}={}) {
  const url=String(connectUrl || '');
  if (!/^wss:\/\/connect\.browserbase\.com(?:[/?]|$)/i.test(url)) {
    throw cdpError('cloud_browser_cdp_url_invalid');
  }
  if (!Array.isArray(allowedHosts) || allowedHosts.length < 1) {
    throw cdpError('cloud_browser_allowed_hosts_invalid');
  }

  let socket=null;
  let sequence=0;
  let targetSessionId=null;
  let closed=false;
  const pending=new Map();
  const eventWaiters=new Map();

  function rejectAll(code) {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(cdpError(code));
    }
    pending.clear();
    for (const list of eventWaiters.values()) {
      for (const item of list) {
        clearTimeout(item.timer);
        item.reject(cdpError(code));
      }
    }
    eventWaiters.clear();
  }

  function waitEvent(method, timeoutMs=commandTimeoutMs) {
    if (closed) return Promise.reject(cdpError('cloud_browser_cdp_closed'));
    return new Promise((resolve,reject)=>{
      const item={
        resolve,
        reject,
        timer:setTimeout(()=>{
          const list=eventWaiters.get(method) || [];
          eventWaiters.set(method,list.filter(entry=>entry!==item));
          reject(cdpError('cloud_browser_cdp_event_timeout'));
        },timeoutMs)
      };
      const list=eventWaiters.get(method) || [];
      list.push(item);
      eventWaiters.set(method,list);
    });
  }

  function emitEvent(message) {
    const list=eventWaiters.get(message.method);
    if (!list || !list.length) return;
    eventWaiters.delete(message.method);
    for (const item of list) {
      clearTimeout(item.timer);
      item.resolve(message.params || {});
    }
  }

  function send(method, params={}, {
    sessionId=targetSessionId,
    timeoutMs=commandTimeoutMs
  }={}) {
    if (!socket || socket.readyState !== WebSocketImpl.OPEN || closed) {
      return Promise.reject(cdpError('cloud_browser_cdp_not_connected'));
    }
    const id=++sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        pending.delete(id);
        reject(cdpError('cloud_browser_cdp_command_timeout'));
      },timeoutMs);
      pending.set(id,{resolve,reject,timer});
      socket.send(JSON.stringify({
        id,
        method,
        params,
        ...(sessionId ? {sessionId} : {})
      }),error=>{
        if (!error) return;
        const item=pending.get(id);
        if (!item) return;
        pending.delete(id);
        clearTimeout(item.timer);
        reject(cdpError('cloud_browser_cdp_send_failed'));
      });
    });
  }

  async function handlePaused(message) {
    const params=message.params || {};
    const requestId=params.requestId;
    const requestUrl=String(params.request?.url || '');
    if (!requestId) return;

    let allowed=false;
    try {
      const parsed=new URL(requestUrl);
      if (['data:','blob:','about:'].includes(parsed.protocol)) {
        allowed=true;
      } else if (['http:','https:'].includes(parsed.protocol)) {
        normalizePublicUrl(requestUrl,{allowedHosts});
        allowed=true;
      }
    } catch (_) {
      allowed=false;
    }

    try {
      if (allowed) {
        await send('Fetch.continueRequest',{requestId},{
          sessionId:message.sessionId || targetSessionId,
          timeoutMs:5000
        });
      } else {
        await send('Fetch.failRequest',{
          requestId,
          errorReason:'BlockedByClient'
        },{
          sessionId:message.sessionId || targetSessionId,
          timeoutMs:5000
        });
      }
    } catch (_) {
      // Session teardown may race a paused request. Never surface the URL.
    }
  }

  async function onMessage(raw) {
    let message;
    try { message=JSON.parse(String(raw)); }
    catch (_) { return; }

    if (message.id) {
      const item=pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) {
        item.reject(cdpError('cloud_browser_cdp_command_failed'));
      } else {
        item.resolve(message.result || {});
      }
      return;
    }

    if (message.method === 'Fetch.requestPaused') {
      void handlePaused(message);
      return;
    }
    emitEvent(message);
  }

  async function connect() {
    if (socket) throw cdpError('cloud_browser_cdp_already_connected');
    socket=new WebSocketImpl(url,{
      perMessageDeflate:false,
      handshakeTimeout:connectTimeoutMs
    });

    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        try { socket.terminate(); } catch (_) {}
        reject(cdpError('cloud_browser_cdp_connect_timeout'));
      },connectTimeoutMs);
      socket.once('open',()=>{
        clearTimeout(timer);
        resolve();
      });
      socket.once('error',()=>{
        clearTimeout(timer);
        reject(cdpError('cloud_browser_cdp_connect_failed'));
      });
    });

    socket.on('message',onMessage);
    socket.on('close',()=>{
      closed=true;
      rejectAll('cloud_browser_cdp_closed');
    });
    socket.on('error',()=>{});

    const targets=await send('Target.getTargets',{}, {sessionId:null});
    let pageTarget=(targets.targetInfos || []).find(
      target=>target.type === 'page' && !String(target.url || '').startsWith('devtools:')
    );
    if (!pageTarget) {
      const created=await send('Target.createTarget',{url:'about:blank'},{sessionId:null});
      pageTarget={targetId:created.targetId};
    }
    const attached=await send(
      'Target.attachToTarget',
      {targetId:pageTarget.targetId,flatten:true},
      {sessionId:null}
    );
    targetSessionId=attached.sessionId;
    if (!targetSessionId) throw cdpError('cloud_browser_cdp_target_attach_failed');

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Fetch.enable',{
      patterns:[{urlPattern:'*',requestStage:'Request'}]
    });
    return true;
  }

  async function navigate(value) {
    const target=normalizePublicUrl(value,{allowedHosts});
    const load=waitEvent('Page.loadEventFired',30000).catch(()=>null);
    const result=await send('Page.navigate',{url:target.url},{timeoutMs:30000});
    if (result.errorText) throw cdpError('cloud_browser_navigation_failed');
    await load;
    return Object.freeze({host:target.host,url:target.url});
  }

  async function domSnapshot() {
    const result=await send('Runtime.evaluate',{
      expression:'document.documentElement ? document.documentElement.outerHTML : ""',
      returnByValue:true,
      awaitPromise:true
    });
    const html=String(result?.result?.value || '');
    const bytes=Buffer.byteLength(html,'utf8');
    if (bytes > config.observations.maxDomBytes) {
      throw cdpError('cloud_browser_dom_too_large');
    }
    return Object.freeze({
      html,
      bytes,
      mimeType:'text/html; charset=utf-8'
    });
  }

  async function screenshot({format='png',quality=null}={}) {
    const normalized=String(format || 'png').toLowerCase();
    if (!config.observations.screenshotFormats.includes(normalized)) {
      throw cdpError('cloud_browser_screenshot_format_invalid');
    }
    const params={
      format:normalized,
      fromSurface:true,
      captureBeyondViewport:false
    };
    if (normalized === 'jpeg') {
      const q=Number(quality);
      params.quality=Number.isInteger(q) ? Math.max(1,Math.min(100,q)) : 85;
    }
    const result=await send('Page.captureScreenshot',params,{timeoutMs:30000});
    const buffer=Buffer.from(String(result.data || ''),'base64');
    if (!buffer.length || buffer.length > config.observations.maxScreenshotBytes) {
      throw cdpError('cloud_browser_screenshot_invalid');
    }
    return Object.freeze({
      buffer,
      mimeType:normalized === 'jpeg' ? 'image/jpeg' : 'image/png',
      format:normalized
    });
  }

  async function currentPage() {
    const result=await send('Runtime.evaluate',{
      expression:'({href:location.href,title:document.title,readyState:document.readyState})',
      returnByValue:true
    });
    const value=result?.result?.value || {};
    let host=null;
    try {
      const parsed=new URL(String(value.href || ''));
      host=['http:','https:'].includes(parsed.protocol)
        ? normalizePublicUrl(parsed.toString(),{allowedHosts}).host
        : null;
    } catch (_) {}
    return Object.freeze({
      host,
      title:String(value.title || '').slice(0,500),
      readyState:String(value.readyState || '').slice(0,40)
    });
  }

  async function disconnect() {
    if (closed) return;
    closed=true;
    rejectAll('cloud_browser_cdp_closed');
    if (socket) {
      await new Promise(resolve=>{
        const timer=setTimeout(()=>{
          try { socket.terminate(); } catch (_) {}
          resolve();
        },1000);
        socket.once('close',()=>{
          clearTimeout(timer);
          resolve();
        });
        try { socket.close(1000,'zuvyr-detach'); }
        catch (_) {
          clearTimeout(timer);
          resolve();
        }
      });
    }
  }

  return Object.freeze({
    connect,
    navigate,
    domSnapshot,
    screenshot,
    currentPage,
    disconnect
  });
}

module.exports={
  createCdpConnection
};
