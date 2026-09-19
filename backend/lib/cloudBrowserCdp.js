'use strict';

const WebSocket = require('ws');
const { config, browserError, normalizePublicUrl } = require('./cloudBrowserPolicy');

function cdpError(code, cause = null) {
  const error = browserError(code);
  if (cause) error.cause = cause;
  return error;
}

function createCdpClient({ url, WebSocketImpl = WebSocket, timeoutMs = 15000 } = {}) {
  let ws = null;
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();

  function emit(method, event) {
    for (const fn of listeners.get(method) || []) {
      Promise.resolve().then(() => fn(event)).catch(() => {});
    }
  }

  async function open() {
    if (ws) return;
    await new Promise((resolve, reject) => {
      const socket = new WebSocketImpl(url);
      const timer = setTimeout(() => {
        try { socket.terminate?.(); } catch (_) {}
        reject(cdpError('cloud_browser_cdp_connect_timeout'));
      }, timeoutMs);

      socket.once('open', () => {
        clearTimeout(timer);
        ws = socket;
        resolve();
      });
      socket.once('error', error => {
        clearTimeout(timer);
        reject(cdpError('cloud_browser_cdp_connect_failed', error));
      });
      socket.on('message', raw => {
        let message;
        try { message = JSON.parse(String(raw)); } catch (_) { return; }

        if (message.id && pending.has(message.id)) {
          const item = pending.get(message.id);
          pending.delete(message.id);
          clearTimeout(item.timer);
          if (message.error) item.reject(cdpError('cloud_browser_cdp_command_failed'));
          else item.resolve(message.result || {});
          return;
        }

        if (message.method) emit(message.method, message);
      });
      socket.on('close', () => {
        for (const item of pending.values()) {
          clearTimeout(item.timer);
          item.reject(cdpError('cloud_browser_cdp_closed'));
        }
        pending.clear();
      });
    });
  }

  async function send(method, params = {}, sessionId = null) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw cdpError('cloud_browser_cdp_not_connected');
    }

    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(cdpError('cloud_browser_cdp_command_timeout'));
      }, timeoutMs);

      pending.set(id, { resolve, reject, timer });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;

      ws.send(JSON.stringify(payload), error => {
        if (error && pending.has(id)) {
          const item = pending.get(id);
          pending.delete(id);
          clearTimeout(item.timer);
          reject(cdpError('cloud_browser_cdp_send_failed', error));
        }
      });
    });
  }

  function on(method, handler) {
    const set = listeners.get(method) || new Set();
    set.add(handler);
    listeners.set(method, set);
    return () => set.delete(handler);
  }

  function closeTransport() {
    try { ws?.close(); } catch (_) {}
    ws = null;
  }

  return Object.freeze({ open, send, on, closeTransport });
}

function createCloudBrowserDriver({ provider, WebSocketImpl = WebSocket } = {}) {
  if (!provider || typeof provider.connectUrl !== 'function') {
    throw cdpError('cloud_browser_provider_required');
  }

  async function connect(providerSessionId) {
    const transientUrl = provider.connectUrl(providerSessionId);
    const client = createCdpClient({ url: transientUrl, WebSocketImpl });
    await client.open();

    const targets = await client.send('Target.getTargets');
    let pageTarget = (targets.targetInfos || []).find(t => t.type === 'page');

    if (!pageTarget) {
      const created = await client.send('Target.createTarget', { url: 'about:blank' });
      pageTarget = { targetId: created.targetId, type: 'page' };
    }

    const attached = await client.send('Target.attachToTarget', {
      targetId: pageTarget.targetId,
      flatten: true
    });

    const sessionId = attached.sessionId;
    if (!sessionId) throw cdpError('cloud_browser_page_attach_failed');

    await Promise.all([
      client.send('Page.enable', {}, sessionId),
      client.send('Runtime.enable', {}, sessionId),
      client.send('DOM.enable', {}, sessionId),
      client.send('Network.enable', {}, sessionId),
      client.send(
        'Fetch.enable',
        { patterns: [{ urlPattern: '*', requestStage: 'Request' }] },
        sessionId
      )
    ]);

    const removeFetch = client.on('Fetch.requestPaused', async event => {
      if (event.sessionId !== sessionId) return;
      const requestId = event.params?.requestId;
      const rawUrl = String(event.params?.request?.url || '');

      try {
        if (/^(data:|blob:|about:)/i.test(rawUrl)) {
          await client.send('Fetch.continueRequest', { requestId }, sessionId);
          return;
        }
        normalizePublicUrl(rawUrl);
        await client.send('Fetch.continueRequest', { requestId }, sessionId);
      } catch (_) {
        await client
          .send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId)
          .catch(() => {});
      }
    });

    async function evaluate(expression, { awaitPromise = true, returnByValue = true } = {}) {
      const result = await client.send(
        'Runtime.evaluate',
        { expression, awaitPromise, returnByValue, userGesture: false },
        sessionId
      );
      if (result.exceptionDetails) throw cdpError('cloud_browser_page_evaluation_failed');
      return result.result?.value;
    }

    async function navigate(value) {
      const normalized = normalizePublicUrl(value);
      const result = await client.send('Page.navigate', { url: normalized.url }, sessionId);
      if (result.errorText) throw cdpError('cloud_browser_navigation_failed');

      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const ready = await evaluate('document.readyState');
        if (ready === 'interactive' || ready === 'complete') break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const current = await evaluate('location.href');
      return normalizePublicUrl(current);
    }

    async function domSnapshot() {
      const expression =
        "(()=>{" +
        "const clone=document.documentElement.cloneNode(true);" +
        "clone.querySelectorAll('input,textarea,select').forEach(el=>{" +
        "el.removeAttribute('value');el.removeAttribute('autocomplete');" +
        "if(el.tagName==='TEXTAREA')el.textContent='';" +
        "if(el.tagName==='SELECT')el.querySelectorAll('option').forEach(o=>o.removeAttribute('selected'));" +
        "});" +
        "clone.querySelectorAll('script').forEach(el=>el.remove());" +
        "return '<!doctype html>'+clone.outerHTML;" +
        "})()";

      const html = String((await evaluate(expression)) || '');
      if (Buffer.byteLength(html, 'utf8') > config.observations.maxDomBytes) {
        throw cdpError('cloud_browser_dom_too_large');
      }
      return html;
    }

    async function screenshot({ format = 'png', quality = null } = {}) {
      const normalized = String(format || 'png').toLowerCase();
      if (!config.observations.screenshotFormats.includes(normalized)) {
        throw cdpError('cloud_browser_screenshot_format_invalid');
      }

      const params = {
        format: normalized,
        captureBeyondViewport: true,
        fromSurface: true
      };

      if (normalized === 'jpeg' && Number.isInteger(Number(quality))) {
        params.quality = Math.max(1, Math.min(100, Number(quality)));
      }

      const result = await client.send('Page.captureScreenshot', params, sessionId);
      const buffer = Buffer.from(String(result.data || ''), 'base64');

      if (!buffer.length || buffer.length > config.observations.maxScreenshotBytes) {
        throw cdpError('cloud_browser_screenshot_size_invalid');
      }

      return Object.freeze({
        buffer,
        mimeType: normalized === 'jpeg' ? 'image/jpeg' : 'image/png',
        format: normalized
      });
    }

    async function uploadFile({ selector, fileName, mimeType, buffer } = {}) {
      if (!Buffer.isBuffer(buffer)) throw cdpError('cloud_browser_upload_buffer_required');
      if (buffer.length < 1 || buffer.length > config.files.maxUploadBytes) {
        throw cdpError('cloud_browser_upload_size_invalid');
      }

      const sel = String(selector || '').trim();
      if (!sel || sel.length > 1000) throw cdpError('cloud_browser_upload_selector_invalid');

      const name = String(fileName || 'upload.bin').replace(/[\\/\0]/g, '_').slice(0, 180);
      const mime = String(mimeType || 'application/octet-stream').slice(0, 255);
      const base64 = buffer.toString('base64');

      const expression =
        '(async()=>{' +
        'const input=document.querySelector(' + JSON.stringify(sel) + ');' +
        "if(!input||input.tagName!=='INPUT'||String(input.type).toLowerCase()!=='file')throw new Error('file_input_not_found');" +
        'const binary=atob(' + JSON.stringify(base64) + ');' +
        'const bytes=new Uint8Array(binary.length);' +
        'for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);' +
        'const file=new File([bytes],' + JSON.stringify(name) + ',{type:' + JSON.stringify(mime) + '});' +
        'const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;' +
        "input.dispatchEvent(new Event('input',{bubbles:true}));" +
        "input.dispatchEvent(new Event('change',{bubbles:true}));" +
        'return {name:file.name,size:file.size,type:file.type,count:input.files.length};' +
        '})()';

      const result = await evaluate(expression);
      if (Number(result?.count) !== 1 || Number(result?.size) !== buffer.length) {
        throw cdpError('cloud_browser_upload_failed');
      }

      return Object.freeze({
        name: result.name,
        size: Number(result.size),
        mimeType: String(result.type || mime)
      });
    }

    async function detach() {
      removeFetch();
      await client.send('Target.detachFromTarget', { sessionId }).catch(() => {});
      client.closeTransport();
    }

    async function closeBrowser() {
      removeFetch();
      await client.send('Browser.close').catch(() => {});
      client.closeTransport();
    }

    return Object.freeze({
      providerSessionId,
      navigate,
      domSnapshot,
      screenshot,
      uploadFile,
      evaluate,
      detach,
      closeBrowser
    });
  }

  return Object.freeze({ connect });
}

module.exports = {
  createCdpClient,
  createCloudBrowserDriver
};
