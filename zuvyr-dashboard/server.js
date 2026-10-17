'use strict';
/*
 * ZUVYR Dashboard — خادم محلي خفيف بدون تبعيات:
 *  - يقدّم ملفات الواجهة (index.html و css/ و js/ و assets/)
 *  - يمرّر /api/* إلى الـ Gateway (افتراضياً http://127.0.0.1:5000) فلا حاجة لتفعيل CORS
 *  - يقدّم ملفات الوسائط من ZUVYR_MEDIA_ROOT عبر /media/<videos_pool|scripts_pool>/...
 *
 * التشغيل:  node zuvyr-dashboard/server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const BACKEND = new URL(process.env.BACKEND_URL || 'http://127.0.0.1:5000');
const MEDIA_ROOT = process.env.ZUVYR_MEDIA_ROOT ? path.resolve(process.env.ZUVYR_MEDIA_ROOT) : null;
const PUBLIC_DIR = __dirname;
// ما يُقدَّم من الواجهة: index.html فقط، وملفات من هذه المجلدات الثلاثة
const STATIC_DIRS = new Set(['css', 'js', 'assets']);
const MEDIA_FOLDERS = new Set(['videos_pool', 'scripts_pool']);
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'proxy-connection', 'upgrade']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.obj': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

// لا نضع X-Frame-Options أو frame-ancestors حتى تبقى الواجهة قابلة للعرض داخل المعاينة
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'",
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function proxyApi(req, res) {
  const headers = { ...req.headers, host: BACKEND.host };
  delete headers['accept-encoding'];

  const upstream = http.request({
    protocol: BACKEND.protocol,
    hostname: BACKEND.hostname,
    port: BACKEND.port || 80,
    path: req.url,
    method: req.method,
    headers,
    timeout: 20000,
  }, (up) => {
    const out = {};
    for (const [k, v] of Object.entries(up.headers)) {
      if (!HOP_BY_HOP.has(k)) out[k] = v;
    }
    Object.assign(out, SECURITY_HEADERS);
    res.writeHead(up.statusCode || 502, out);
    up.pipe(res);
  });

  upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
  upstream.on('error', (err) => {
    if (res.headersSent) { res.destroy(); return; }
    sendJson(res, 502, {
      error: 'backend_unreachable',
      message: `تعذّر الوصول إلى الـ Gateway على ${BACKEND.origin}. تأكد من تشغيله.`,
      detail: err.code || err.message,
    });
  });
  req.pipe(upstream);
}

function serveMedia(req, res, rawRel) {
  if (!MEDIA_ROOT) {
    sendJson(res, 404, {
      error: 'media_root_not_configured',
      message: 'اضبط المتغير ZUVYR_MEDIA_ROOT ليشير إلى المجلد الذي يحتوي على videos_pool و scripts_pool.',
    });
    return;
  }

  let decoded;
  try { decoded = decodeURIComponent(rawRel); } catch { sendJson(res, 400, { error: 'bad_path' }); return; }

  const segments = decoded.split(/[\\/]+/).filter(Boolean);
  if (segments.length < 2 || segments.some((s) => s === '..' || s.startsWith('.'))) {
    sendJson(res, 400, { error: 'bad_path' });
    return;
  }
  if (!MEDIA_FOLDERS.has(segments[0])) {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }

  const filePath = path.join(MEDIA_ROOT, ...segments);
  if (!filePath.startsWith(MEDIA_ROOT + path.sep)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      sendJson(res, 404, { error: 'not_found', message: 'الملف غير موجود محلياً.' });
      return;
    }

    const size = st.size;
    const common = {
      ...SECURITY_HEADERS,
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    };

    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start;
      let end;
      if (m && m[1] === '' && m[2] !== '') {
        start = Math.max(0, size - Number(m[2]));
        end = size - 1;
      } else if (m && m[1] !== '') {
        start = Number(m[1]);
        end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
      }
      if (start === undefined || start > end || start >= size) {
        res.writeHead(416, { ...common, 'Content-Range': `bytes */${size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        ...common,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': end - start + 1,
      });
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = fs.createReadStream(filePath, { start, end });
      stream.on('error', () => res.destroy());
      stream.pipe(res);
      return;
    }

    res.writeHead(200, { ...common, 'Content-Length': size });
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { sendJson(res, 400, { error: 'bad_path' }); return; }

  if (rel === '/' || rel === '/index.html') {
    rel = '/index.html';
  } else {
    const [top] = rel.split('/').filter(Boolean);
    if (!STATIC_DIRS.has(top)) { sendJson(res, 404, { error: 'not_found' }); return; }
  }

  const filePath = path.resolve(PUBLIC_DIR, `.${rel}`);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) { sendJson(res, 403, { error: 'forbidden' }); return; }

  const type = MIME[path.extname(filePath).toLowerCase()];
  if (!type) { sendJson(res, 404, { error: 'not_found' }); return; }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { sendJson(res, 404, { error: 'not_found' }); return; }
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': type,
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  let pathname;
  try { pathname = new URL(req.url, 'http://local').pathname; } catch { sendJson(res, 400, { error: 'bad_request' }); return; }

  if (pathname.startsWith('/api/')) { proxyApi(req, res); return; }
  if (pathname.startsWith('/media/')) { serveMedia(req, res, pathname.slice('/media/'.length)); return; }
  if (req.method === 'POST') { sendJson(res, 405, { error: 'method_not_allowed' }); return; }
  serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`ZUVYR Dashboard  → http://127.0.0.1:${PORT}`);
  console.log(`Gateway proxy    → ${BACKEND.origin}`);
  console.log(`Media root       → ${MEDIA_ROOT || '(غير مضبوط: ZUVYR_MEDIA_ROOT)'}`);
});
