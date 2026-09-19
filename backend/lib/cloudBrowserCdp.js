'use strict';

const crypto = require('node:crypto');
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


  function agentHandle(value) {
    const handle=String(value || '').trim();
    if (!/^za_[a-z0-9]{8,80}$/i.test(handle)) {
      throw cdpError('cloud_browser_agent_handle_invalid');
    }
    return handle;
  }

  async function interactiveSnapshot({maxElements=200}={}) {
    const limit=Math.max(1,Math.min(200,Number(maxElements) || 200));
    const nonce=crypto.randomBytes(8).toString('hex');
    const expression=[
      '(() => {',
      'const limit=' + JSON.stringify(limit) + ';',
      'const prefix=' + JSON.stringify('za_' + nonce) + ';',
      'const selectors=[\'a[href]\',\'button\',\'input\',\'textarea\',\'select\',\'[role="button"]\',\'[role="link"]\',\'[role="checkbox"]\',\'[role="radio"]\',\'[role="option"]\',\'[contenteditable="true"]\'].join(\',\');',
      'const candidates=Array.from(document.querySelectorAll(selectors));',
      'const items=[]; let index=0; const used=new Set();',
      'for (const el of candidates) {',
      ' if (items.length>=limit) break;',
      ' const rect=el.getBoundingClientRect(); const style=getComputedStyle(el);',
      ' const visible=rect.width>0&&rect.height>0&&style.visibility!==\'hidden\'&&style.display!==\'none\'&&Number(style.opacity||1)>0;',
      ' if (!visible) continue;',
      ' let handle=String(el.getAttribute(\'data-zuvyr-agent-id\')||\'\'); if (!/^za_[a-z0-9]{8,80}$/i.test(handle)||used.has(handle)) { do { handle=prefix+(index++).toString(36); } while (used.has(handle)); el.setAttribute(\'data-zuvyr-agent-id\',handle); } used.add(handle);',
      ' const tag=String(el.tagName||\'\').toLowerCase(); const role=String(el.getAttribute(\'role\')||\'\').toLowerCase();',
      ' const type=String(el.getAttribute(\'type\')||\'\').toLowerCase(); const name=String(el.getAttribute(\'name\')||\'\').toLowerCase();',
      ' const autocomplete=String(el.getAttribute(\'autocomplete\')||\'\').toLowerCase(); const aria=String(el.getAttribute(\'aria-label\')||\'\').trim();',
      ' const placeholder=String(el.getAttribute(\'placeholder\')||\'\').trim();',
      ' const text=(tag===\'input\'||tag===\'textarea\'||tag===\'select\' ? (aria||placeholder||name) : (aria||String(el.innerText||el.textContent||\'\').trim())).slice(0,300);',
      ' const sensitive=type===\'password\'||/password|passcode|otp|one-time|verification|cvv|cvc|card.?number/.test([name,autocomplete,aria,placeholder].join(\' \').toLowerCase());',
      ' const submitLike=type===\'submit\'||(tag===\'button\'&&/submit|pay|purchase|buy|order|send|post|delete|remove|confirm|book|reserve/i.test(text));',
      ' let href=null; try { if (tag===\'a\'&&el.href) href=String(el.href); } catch (_) {}',
      ' items.push({handle,tag,role,type,text,sensitive,submitLike,href,disabled:!!el.disabled,x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)});',
      '}',
      'const captchaDetected=!!document.querySelector(\'iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="challenges.cloudflare.com"],[class*="captcha" i],[id*="captcha" i],[data-sitekey]\');',
      'const authChallengeDetected=items.some(item=>item.sensitive)||/\\b(sign in|log in|verify your identity|two[- ]factor|verification code)\\b/i.test(String(document.body&&document.body.innerText||\'\').slice(0,20000));',
      'return {href:String(location.href||\'\'),title:String(document.title||\'\').slice(0,500),captchaDetected,authChallengeDetected,items};',
      '})()'
    ].join('\n');

    const result=await send('Runtime.evaluate',{
      expression,
      returnByValue:true,
      awaitPromise:true
    },{timeoutMs:15000});
    const value=result?.result?.value || {};
    let page={host:null,path:null};
    try {
      const normalized=normalizePublicUrl(String(value.href || ''),{allowedHosts});
      const parsed=new URL(normalized.url);
      page={host:normalized.host,path:parsed.pathname};
    } catch (_) {}
    const items=[];
    for (const raw of Array.isArray(value.items) ? value.items : []) {
      let link=null;
      if (raw.href) {
        try {
          const normalized=normalizePublicUrl(String(raw.href),{allowedHosts});
          const parsed=new URL(normalized.url);
          link={host:normalized.host,path:parsed.pathname};
        } catch (_) {}
      }
      items.push(Object.freeze({
        handle:agentHandle(raw.handle),
        tag:String(raw.tag || '').slice(0,30),
        role:String(raw.role || '').slice(0,80),
        type:String(raw.type || '').slice(0,40),
        text:String(raw.text || '').slice(0,300),
        sensitive:raw.sensitive===true,
        submitLike:raw.submitLike===true,
        disabled:raw.disabled===true,
        link,
        bounds:Object.freeze({
          x:Number(raw.x)||0,y:Number(raw.y)||0,
          width:Number(raw.width)||0,height:Number(raw.height)||0
        })
      }));
    }
    return Object.freeze({
      page:Object.freeze({
        host:page.host,
        path:page.path,
        title:String(value.title || '').slice(0,500)
      }),
      captchaDetected:value.captchaDetected===true,
      authChallengeDetected:value.authChallengeDetected===true,
      items:Object.freeze(items)
    });
  }

  async function robotsStatus() {
    const expression=[
      '(async () => {',
      'try {',
      ' if (!/^https?:$/.test(location.protocol)) return {status:\'unknown\'};',
      ' const response=await fetch(\'/robots.txt\',{method:\'GET\',credentials:\'omit\',cache:\'no-store\',redirect:\'error\'});',
      ' if (response.status===404||response.status===410) return {status:\'allowed\'};',
      ' if (!response.ok) return {status:\'unknown\'};',
      ' const text=(await response.text()).slice(0,65536); const lines=text.split(/\\r?\\n/);',
      ' let applies=false; const disallow=[];',
      ' for (const raw of lines) { const line=raw.replace(/#.*$/,\'\').trim(); if (!line) continue; const idx=line.indexOf(\':\'); if (idx<0) continue; const key=line.slice(0,idx).trim().toLowerCase(); const value=line.slice(idx+1).trim(); if (key===\'user-agent\') { applies=value===\'*\'; continue; } if (applies&&key===\'disallow\'&&value) disallow.push(value); }',
      ' const path=location.pathname||\'/\'; const blocked=disallow.some(rule=>rule===\'/\'||path.startsWith(rule));',
      ' return {status:blocked?\'disallowed\':\'allowed\'};',
      '} catch (_) { return {status:\'unknown\'}; }',
      '})()'
    ].join('\n');
    const result=await send('Runtime.evaluate',{
      expression,returnByValue:true,awaitPromise:true
    },{timeoutMs:10000});
    const status=String(result?.result?.value?.status || 'unknown');
    return ['allowed','disallowed','unknown'].includes(status) ? status : 'unknown';
  }

  async function focusHandle(handle) {
    const safe=agentHandle(handle);
    const expression=[
      '(() => {',
      'const handle=' + JSON.stringify(safe) + ';',
      'const el=document.querySelector(\'[data-zuvyr-agent-id="\'+handle+\'"]\');',
      'if (!el) return {ok:false,error:\'not_found\'};',
      'const type=String(el.getAttribute(\'type\')||\'\').toLowerCase(); const name=String(el.getAttribute(\'name\')||\'\').toLowerCase();',
      'const autocomplete=String(el.getAttribute(\'autocomplete\')||\'\').toLowerCase(); const aria=String(el.getAttribute(\'aria-label\')||\'\').toLowerCase(); const placeholder=String(el.getAttribute(\'placeholder\')||\'\').toLowerCase();',
      'const sensitive=type===\'password\'||/password|passcode|otp|one-time|verification|cvv|cvc|card.?number/.test([name,autocomplete,aria,placeholder].join(\' \'));',
      'if (sensitive) return {ok:false,error:\'sensitive\'}; if (el.disabled) return {ok:false,error:\'disabled\'};',
      'el.scrollIntoView({block:\'center\',inline:\'center\'}); el.focus(); return {ok:true};',
      '})()'
    ].join('\n');
    const result=await send('Runtime.evaluate',{expression,returnByValue:true});
    const value=result?.result?.value || {};
    if (value.error==='sensitive') throw cdpError('cloud_browser_agent_sensitive_input_blocked');
    if (!value.ok) throw cdpError('cloud_browser_agent_target_unavailable');
    return true;
  }

  async function clickHandle(handle) {
    const safe=agentHandle(handle);
    const expression=[
      '(() => {',
      'const handle=' + JSON.stringify(safe) + ';',
      'const el=document.querySelector(\'[data-zuvyr-agent-id="\'+handle+\'"]\');',
      'if (!el||el.disabled) return {ok:false}; el.scrollIntoView({block:\'center\',inline:\'center\'}); el.click(); return {ok:true};',
      '})()'
    ].join('\n');
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},{timeoutMs:15000});
    if (result?.result?.value?.ok !== true) throw cdpError('cloud_browser_agent_target_unavailable');
    return currentPage();
  }

  async function typeHandle(handle,text) {
    const value=String(text == null ? '' : text);
    if (value.length>4000) throw cdpError('cloud_browser_agent_text_too_long');
    await focusHandle(handle);
    const safe=agentHandle(handle);
    const clearExpression=[
      '(() => {',
      'const handle=' + JSON.stringify(safe) + ';',
      'const el=document.querySelector(\'[data-zuvyr-agent-id="\'+handle+\'"]\');',
      'if (!el) return false;',
      'if (\'value\' in el) { const proto=Object.getPrototypeOf(el); const descriptor=Object.getOwnPropertyDescriptor(proto,\'value\'); if (descriptor&&descriptor.set) descriptor.set.call(el,\'\'); else el.value=\'\'; el.dispatchEvent(new Event(\'input\',{bubbles:true})); } else if (el.isContentEditable) { el.textContent=\'\'; el.dispatchEvent(new Event(\'input\',{bubbles:true})); }',
      'return true;',
      '})()'
    ].join('\n');
    const cleared=await send('Runtime.evaluate',{expression:clearExpression,returnByValue:true});
    if (cleared?.result?.value !== true) throw cdpError('cloud_browser_agent_target_unavailable');
    await send('Input.insertText',{text:value},{timeoutMs:15000});
    return Object.freeze({typedCharacters:value.length});
  }

  async function submitHandle(handle) {
    const safe=agentHandle(handle);
    const expression=[
      '(() => {',
      'const handle=' + JSON.stringify(safe) + ';',
      'const el=document.querySelector(\'[data-zuvyr-agent-id="\'+handle+\'"]\');',
      'if (!el||el.disabled) return {ok:false}; el.scrollIntoView({block:\'center\',inline:\'center\'});',
      'const form=el.form||el.closest(\'form\'); if (form&&typeof form.requestSubmit===\'function\') { if (el.tagName===\'BUTTON\'||el.type===\'submit\') form.requestSubmit(el); else form.requestSubmit(); } else { el.click(); } return {ok:true};',
      '})()'
    ].join('\n');
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},{timeoutMs:15000});
    if (result?.result?.value?.ok !== true) throw cdpError('cloud_browser_agent_target_unavailable');
    return currentPage();
  }

  async function scrollBy(deltaY=600) {
    const amount=Math.max(-2000,Math.min(2000,Number(deltaY) || 0));
    const expression='(() => { window.scrollBy({top:' + amount + ',left:0,behavior:\'instant\'}); return {x:window.scrollX,y:window.scrollY}; })()';
    const result=await send('Runtime.evaluate',{expression,returnByValue:true});
    const value=result?.result?.value || {};
    return Object.freeze({x:Number(value.x)||0,y:Number(value.y)||0});
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
    interactiveSnapshot,
    robotsStatus,
    clickHandle,
    typeHandle,
    submitHandle,
    scrollBy,
    currentPage,
    disconnect
  });
}

module.exports={
  createCdpConnection
};
