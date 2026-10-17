# ZUVYR Dashboard — الملفات الكاملة

الفرع: arena/3a403143-zuvyr-ai · المسار: zuvyr-dashboard/

ملاحظات: الخطوط الثنائية (woff2) في assets/fonts/files/ مستثناة. الـ Gateway (gateway/app.py) خارج هذا الملف.

## قائمة الملفات

- README.md
- index.html
- server.js
- css/base.css
- css/components.css
- css/layout.css
- css/modules.css
- css/tokens.css
- assets/fonts/fonts.css
- assets/logo.svg
- js/config.js
- js/main.js
- js/core/api.js
- js/core/dom.js
- js/core/format.js
- js/core/i18n.js
- js/core/prefs.js
- js/core/store.js
- js/ui/header.js
- js/ui/icons.js
- js/ui/layout.js
- js/ui/lightbox.js
- js/ui/parts.js
- js/ui/settings.js
- js/ui/toast.js
- js/modules/bi.js
- js/modules/brand.js
- js/modules/cartoon.js
- js/modules/evolution.js
- js/modules/index.js
- js/modules/kids.js
- js/modules/media.js
- js/locales/ar.js
- js/locales/en.js



===== FILE: zuvyr-dashboard/README.md =====

```markdown
# ZUVYR Dashboard · لوحة قيادة الأتمتة

لوحة تحكم داكنة بالكامل من جانب العميل (HTML + CSS + JavaScript بدون أطر عمل)، بواجهة عربية RTL مع تبديل إلى الإنجليزية، وستة وحدات مستقلة في بطاقات منفصلة، مرتبطة بالـ Gateway المحلي على `http://127.0.0.1:5000`.

## التشغيل

```bash
# 1) الـ Gateway (Flask) على المنفذ 5000
pip install -r zuvyr-dashboard/gateway/requirements.txt
python zuvyr-dashboard/gateway/app.py

# 2) الواجهة (بدون تبعيات) على http://127.0.0.1:8080
node zuvyr-dashboard/server.js

# اختياري: تشغيل الوسائط المحلية من مجلد ما
ZUVYR_MEDIA_ROOT=/path/to/media node zuvyr-dashboard/server.js
```

المتغيرات المدعومة في `server.js`: `PORT` و`HOST` و`BACKEND_URL` (افتراضياً `http://127.0.0.1:5000`) و`ZUVYR_MEDIA_ROOT`.

## لماذا يوجد خادم وسيط؟

الـ Gateway لا يرسل ترويسات CORS، لذلك لا يستطيع المتصفح استدعاءه مباشرة. يمرّر `server.js` طلبات `/api/*` إلى الـ Gateway بنفس الأصل (same-origin)، ويقدّم ملفات الوسائط عبر `/media/<folder>/<file>` مع دعم `Range` للفيديو. عند تعطّل الـ Gateway تُعاد استجابة `502` بصيغة JSON، وتظهر الواجهة حالة "غير متصل" دون بيانات وهمية.

## الوحدات الست

| # | الوحدة | المحتوى |
|---|--------|---------|
| 01 | محرك الوسائط اللامتناهي · Infinite Media Engine | ملفات السيناريو، لغات الترجمة، معاينة النص |
| 02 | محرك الرسوم المتحركة · Cartoon Animation Engine | مشغّل عمودي، عداد دقائق المشاهدة، الجدول الزمني |
| 03 | الأطفال والموسيقى · Kids & Music Core | درع الحماية (نسبة)، تصفية المحتوى حسب النوع |
| 04 | العلامة والصور المصغّرة · Branding & Thumbnail Engine | معرض الصور مع عرض مكبّر (Lightbox) |
| 05 | ذكاء الأعمال · Infinite Business Intelligence | عدادات الأداء، التكاملات، المستندات الاستراتيجية |
| 06 | المُنسِّق ذاتي التطور · Self-Evolution Orchestrator | زر التشغيل الرئيسي، حالة الحماية، سجل التشغيل |

الوحدة تُعرَّف بعقد واحد: `mount(body, ctx)` يعيد `{ render(state) }`، وتُسجَّل في `js/modules/index.js`.

## الميزات

- **الهوية**: ألوان ZUVYR (`#0B0F1A` و`#6366F1` و`#8B5CF6`) مع تدرجات مستمدة من `frontend/rox-brand-blue-violet.css`.
- **الخطوط**: Tajawal للعربية والإنجليزية، وIBM Plex Mono للأرقام والسجلات، وكلاهما مستضاف محلياً.
- **المظهر**: داكن افتراضياً مع وضع فاتح، ويُحفظ الاختيار.
- **اللغة**: عربي (RTL) وإنجليزي (LTR)، وتُحدَّث النصوص الثابتة فورياً عبر `data-i18n`.
- **التنقل**: شريط وحدات ثابت مع تتبّع للقسم الظاهر (scroll-spy).
- **الإعدادات**: إظهار/إخفاء كل وحدة، ومدة التحديث التلقائي (5 ثوانٍ، 15 ثانية، 30 ثانية، أو إيقاف)، وإعادة الضبط. لا يمكن إخفاء كل الوحدات معاً.
- **الحفظ**: التفضيلات في `localStorage` تحت المفتاح `zuvyr-dashboard:prefs:v1`.
- **الأداء**: التحديث الدوري يتوقف عندما تكون الصفحة مخفية، ويُعاد رسم البطاقات فقط عند تغيّر الحالة.
- **الأمان**: سياسة CSP صارمة (`style-src 'self'`، بدون `style` مضمّنة)، ولا يدخل نص من الـ API إلا عبر `textContent`، والأيقونات من ثابت داخلي فقط.
- **إمكانية الوصول**: أزرار بتسميات `aria`، و`aria-live` لسجل التشغيل، ودعم لوحة المفاتيح في المعرض المكبّر (الأسهم، وEsc).

## البنية

```
zuvyr-dashboard/
├── index.html            الهيكل (lang=ar dir=rtl)
├── server.js             خادم ثابت + وسيط /api + وسائط /media (بدون تبعيات)
├── assets/               الشعار وملفات الخطوط
├── css/
│   ├── tokens.css        الألوان والمسافات والظلال (المصدر الوحيد)
│   ├── base.css          إعادة الضبط والخلفية
│   ├── layout.css        الترويسة والهيرو والشبكة والتنقل
│   ├── components.css    البطاقات والأزرار والشرائح والحوارات والإشعارات
│   └── modules.css       مكوّنات كل وحدة
├── js/
│   ├── config.js         الإعدادات (المسارات، المهلات، المجلدات، الافتراضات)
│   ├── main.js           نقطة الدخول والحلقة الرئيسية
│   ├── core/             store · api · i18n · prefs · format · dom
│   ├── ui/               header · layout · settings · parts · icons · toast · lightbox
│   ├── modules/          media · cartoon · kids · brand · bi · evolution · index
│   └── locales/          ar.js · en.js (مفاتيح متطابقة)
└── gateway/              Flask gateway (app.py) كما هو
```

## الإعدادات والتخصيص

- **الألوان والمسافات**: عدّل `css/tokens.css` فقط.
- **النصوص**: أضف المفتاح إلى `js/locales/ar.js` و`en.js` معاً.
- **مجلدات الوسائط**: `CONFIG.media.folders` في `js/config.js`، ويجب أن تطابق `MEDIA_FOLDERS` في `server.js` (حالياً `videos_pool` و`scripts_pool`).
- **التحديث الدوري والمهلات**: `CONFIG.defaults.refreshMs` و`CONFIG.refreshOptions` و`CONFIG.api.timeoutMs` في `js/config.js`.

## ملاحظات

- قوائم الملفات في الـ Gateway مكتوبة يدوياً في `gateway/app.py`، ولا يقرأها من القرص. لذلك قد يُعرض ملف غير موجود محلياً؛ وتظهر عندها رسالة "الملف غير موجود محلياً" بدل فشل صامت.
- نقطة `POST /api/zuvyr-dashboard/master-run` غير موجودة في الـ Gateway الحالي، فيعرض الزر رسالة 404 واضحة في السجل بدل أن يتعطّل.
- الحسابات المالية تظهر "—" حتى يعيد الـ Gateway أرقاماً فعلية في `financial_analytics`، ولا توجد بيانات وهمية.
- `fake_useragent` قد يحتاج إنترنت في أول تشغيل.
```


===== FILE: zuvyr-dashboard/index.html =====

```html
<!doctype html>
<html lang="ar" dir="rtl" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="ZUVYR True Automation Core · لوحة قيادة المحركات متعددة الوكلاء" />
  <meta name="theme-color" content="#0b0f1a" />
  <title>ZUVYR · True Automation Core</title>
  <link rel="icon" href="assets/logo.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="assets/fonts/fonts.css" />
  <link rel="stylesheet" href="css/tokens.css" />
  <link rel="stylesheet" href="css/base.css" />
  <link rel="stylesheet" href="css/layout.css" />
  <link rel="stylesheet" href="css/components.css" />
  <link rel="stylesheet" href="css/modules.css" />
</head>
<body>
  <a class="skip-link" href="#grid" data-i18n="a11y.skip">تخطَّ إلى المحتوى</a>

  <header class="topbar">
    <div class="brand">
      <img class="brand-logo" src="assets/logo.svg" alt="" width="40" height="40" />
      <div class="brand-name">ZUVYR <span data-i18n="app.product">True Automation Core</span></div>
    </div>

    <div class="topbar-actions">
      <span class="updated" id="updated" aria-live="polite"></span>

      <span class="tag" id="conn" role="status">
        <i class="dot pulse"></i>
        <span data-i18n="topbar.connecting">جارٍ الاتصال</span>
      </span>

      <div class="seg" role="group" data-i18n-aria="topbar.language" id="lang-switch">
        <button type="button" data-lang="ar">AR</button>
        <button type="button" data-lang="en">EN</button>
      </div>

      <button class="btn btn-ghost btn-icon" type="button" id="theme-toggle" data-i18n-title="topbar.theme" data-i18n-aria="topbar.theme"></button>
      <button class="btn" type="button" id="refresh" data-i18n-title="topbar.refresh">
        <span data-i18n="topbar.refresh">تحديث</span>
      </button>
      <button class="btn btn-ghost btn-icon" type="button" id="settings-open" data-i18n-title="topbar.settings" data-i18n-aria="topbar.settings"></button>
    </div>
  </header>

  <section class="hero" aria-labelledby="hero-title">
    <div>
      <span class="eyebrow"><i class="dot"></i><span data-i18n="hero.eyebrow">Multi-Agent Control · 2026</span></span>
      <h1 class="hero-title" id="hero-title">
        <span data-i18n="hero.title">مركز قيادة الأتمتة</span>
        <span class="grad" data-i18n="hero.titleAccent">ZUVYR</span>
      </h1>
      <p class="hero-lead" data-i18n="hero.lead">ستة محركات مستقلة تعمل كفريق واحد.</p>
    </div>
    <div class="hero-meta" id="hero-meta"></div>
  </section>

  <section class="kpis" id="kpis" aria-label="ملخص"></section>

  <div class="modnav-wrap">
    <nav class="modnav" id="modnav" data-i18n-aria="nav.label" aria-label="وحدات النظام"></nav>
  </div>

  <main class="grid" id="grid"></main>

  <footer class="footer">
    <span data-i18n="footer.text">ZUVYR · لوحة التحكم</span>
    <span class="mono" id="footer-version"></span>
  </footer>

  <!-- إعدادات -->
  <dialog id="settings" data-i18n-aria="settings.title" aria-labelledby="settings-title">
    <div class="panel">
      <div class="panel-head">
        <h2 id="settings-title" data-i18n="settings.title">الإعدادات</h2>
        <button class="btn btn-ghost btn-icon" type="button" id="settings-close" data-i18n-title="settings.close" data-i18n-aria="settings.close"></button>
      </div>

      <div class="field">
        <span class="field-label" data-i18n="settings.refresh">فترة التحديث التلقائي</span>
        <div class="seg" id="refresh-options" role="group" data-i18n-aria="settings.refresh"></div>
      </div>

      <div class="field">
        <span class="field-label" data-i18n="settings.modules">الوحدات الظاهرة</span>
        <div class="toggle-list" id="module-toggles"></div>
      </div>

      <div class="row space settings-foot">
        <span class="hint" data-i18n="settings.saved">تُحفظ التفضيلات في هذا المتصفح.</span>
        <button class="btn" type="button" id="settings-reset" data-i18n="settings.reset">استعادة الافتراضي</button>
      </div>
    </div>
  </dialog>

  <!-- معرض الصور -->
  <dialog id="lightbox" data-i18n-aria="brand.gallery" aria-labelledby="lb-caption">
    <div class="lightbox">
      <img id="lb-image" alt="" />
      <div class="lightbox-bar">
        <span class="fname" id="lb-caption"></span>
        <span class="tag" id="lb-count"></span>
        <button class="btn btn-ghost btn-icon" type="button" id="lb-close" data-i18n-title="brand.close" data-i18n-aria="brand.close"></button>
      </div>
      <button class="lightbox-nav prev" type="button" id="lb-prev" data-i18n-title="brand.prev" data-i18n-aria="brand.prev"></button>
      <button class="lightbox-nav next" type="button" id="lb-next" data-i18n-title="brand.next" data-i18n-aria="brand.next"></button>
    </div>
  </dialog>

  <div class="toasts" id="toasts" role="status" aria-live="polite"></div>

  <script type="module" src="js/main.js"></script>
</body>
</html>
```


===== FILE: zuvyr-dashboard/server.js =====

```javascript
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
```


===== FILE: zuvyr-dashboard/css/base.css =====

```css
/* ── Reset & base ─────────────────────────────────────────── */
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}

body {
  min-height: 100vh;
  font-family: var(--font);
  font-size: 15px;
  line-height: 1.6;
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  overflow-x: hidden;
}

/* خلفية "شفق" متحركة بخفة: ثلاث بقع لونية ثابتة فوق تدرج أساسي */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(900px 560px at 88% -8%, var(--aurora-1), transparent 62%),
    radial-gradient(760px 520px at -6% 14%, var(--aurora-2), transparent 60%),
    radial-gradient(640px 420px at 50% 110%, var(--aurora-3), transparent 65%);
}

/* شبكة دقيقة خفيفة تعطي إحساس "لوحة قيادة تقنية" */
body::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: 0.35;
  background-image:
    linear-gradient(var(--border) 1px, transparent 1px),
    linear-gradient(90deg, var(--border) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(ellipse at top, #000 0%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse at top, #000 0%, transparent 70%);
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1 {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.2px;
}

h2 {
  font-size: 17px;
  font-weight: 800;
}

button,
input,
select {
  font: inherit;
  color: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
}

img,
video,
svg {
  display: block;
  max-width: 100%;
}

code,
.mono {
  font-family: var(--font-mono);
}

a {
  color: inherit;
}

/* حالة التركيز: حلقة واضحة لكل العناصر التفاعلية (إمكانية الوصول) */
:focus-visible {
  outline: 2px solid var(--violet);
  outline-offset: 3px;
  border-radius: 8px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.skip-link {
  position: fixed;
  top: 8px;
  inset-inline-start: 8px;
  z-index: 100;
  padding: 8px 14px;
  border-radius: var(--r-sm);
  background: var(--grad-brand);
  color: #fff;
  transform: translateY(-160%);
  transition: transform var(--dur) var(--ease);
}

.skip-link:focus {
  transform: translateY(0);
}

/* أيقونات SVG موحّدة: مرسومة بالحد لا بالتعبئة */
.ico {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: 0 0 auto;
}

.ico-sm {
  width: 16px;
  height: 16px;
}

.muted {
  color: var(--text-2);
}

.note {
  color: var(--text-2);
  font-size: 13px;
}

.row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-3);
}

.row.space {
  justify-content: space-between;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

[hidden] {
  display: none !important;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```


===== FILE: zuvyr-dashboard/css/components.css =====

```css
/* ── Buttons ──────────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  min-height: 38px;
  padding: 8px 16px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--input-bg);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  transition: background var(--dur), border-color var(--dur), transform var(--dur) var(--ease), box-shadow var(--dur);
}

.btn:hover:not(:disabled) {
  border-color: var(--border-soft);
  background: var(--surface-hover);
}

.btn:active:not(:disabled) {
  transform: translateY(1px);
}

.btn:disabled {
  opacity: 0.45;
}

.btn-primary {
  border-color: transparent;
  color: #fff;
  background: var(--grad-brand);
  box-shadow: 0 10px 28px -12px rgba(99, 102, 241, 0.8);
}

.btn-primary:hover:not(:disabled) {
  background: var(--grad-brand);
  box-shadow: 0 14px 34px -12px rgba(99, 102, 241, 0.95);
  filter: brightness(1.06);
}

.btn-ghost {
  background: transparent;
}

.btn-icon {
  width: 38px;
  padding: 0;
}

.btn-sm {
  min-height: 32px;
  padding: 4px 12px;
  font-size: 13px;
}

.btn.is-spinning .ico {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Segmented control & chips ────────────────────────────── */
.seg {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--input-bg);
}

.seg button {
  min-height: 30px;
  padding: 4px 12px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  transition: background var(--dur), color var(--dur);
}

.seg button:hover {
  color: var(--text);
}

.seg button[aria-pressed="true"] {
  color: #fff;
  background: var(--grad-brand);
  box-shadow: 0 6px 16px -8px rgba(99, 102, 241, 0.9);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.chip {
  min-height: 32px;
  padding: 5px 12px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
  background: var(--input-bg);
  color: var(--text-2);
  font-size: 13px;
  transition: all var(--dur) var(--ease);
}

.chip:hover {
  color: var(--text);
  border-color: var(--border-soft);
}

.chip[aria-pressed="true"] {
  color: var(--text);
  border-color: var(--border-soft);
  background: color-mix(in srgb, var(--indigo) 16%, transparent);
  box-shadow: inset 0 0 0 1px var(--border-soft);
}

.chip .count {
  margin-inline-start: 6px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-3);
}

/* ── Tags & status ────────────────────────────────────────── */
.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 9px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
  background: var(--input-bg);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.tag.tone-ok {
  color: var(--ok);
  border-color: color-mix(in srgb, var(--ok) 35%, transparent);
  background: color-mix(in srgb, var(--ok) 10%, transparent);
}

.tag.tone-warn {
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 35%, transparent);
  background: color-mix(in srgb, var(--warn) 10%, transparent);
}

.tag.tone-danger {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 35%, transparent);
  background: color-mix(in srgb, var(--danger) 10%, transparent);
}

.tag.tone-info {
  color: #a5b4fc;
  border-color: var(--border-soft);
  background: color-mix(in srgb, var(--indigo) 12%, transparent);
}

.tag.tone-video {
  color: #c4b5fd;
}

.tag.tone-image {
  color: #67e8f9;
}

.tag.tone-script {
  color: #fde68a;
}

.tag.tone-audio {
  color: #86efac;
}

.tag.tone-3d {
  color: #f9a8d4;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  flex: 0 0 auto;
}

.dot.pulse {
  box-shadow: 0 0 0 0 currentColor;
  animation: pulse-dot 2s var(--ease) infinite;
}

@keyframes pulse-dot {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 60%, transparent);
  }
  70% {
    box-shadow: 0 0 0 9px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

/* ── Cards ────────────────────────────────────────────────── */
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  padding: var(--s-5);
  border-radius: var(--r-xl);
  border: 1px solid var(--border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--indigo) 6%, transparent), transparent 40%),
    var(--surface);
  box-shadow: var(--shadow);
  min-width: 0;
  scroll-margin-top: 170px;
  transition: border-color var(--dur), transform var(--dur) var(--ease), box-shadow var(--dur);
  isolation: isolate;
}

.card::before {
  /* شريط لوني علوي يميّز كل وحدة */
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 2px;
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  background: var(--grad-brand);
  opacity: 0.6;
}

.card:hover {
  border-color: var(--border-soft);
  box-shadow: var(--shadow), var(--glow);
}

.card-head {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}

.card-ico {
  width: 46px;
  height: 46px;
  border-radius: var(--r-md);
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--grad-brand);
  box-shadow: var(--glow);
  flex: 0 0 auto;
}

.card-ico .ico {
  width: 22px;
  height: 22px;
}

.card-titles {
  flex: 1;
  min-width: 0;
}

.card-sub {
  color: var(--text-3);
  font-size: 12.5px;
  font-family: var(--font-mono);
  direction: ltr;
  text-align: start;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.card[data-state="loading"] .card-body {
  display: none;
}

.card:not([data-state="loading"]) .skeleton {
  display: none;
}

.card-foot {
  margin-top: auto;
  padding-top: var(--s-3);
  border-top: 1px dashed var(--border);
  color: var(--text-3);
  font-size: 12.5px;
}

/* ── Section label ───────────────────────────────────────── */
.sec {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  color: var(--text-3);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.sec::after {
  content: "";
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--border), transparent);
}

/* ── Lists & file items ──────────────────────────────────── */
.list {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  width: 100%;
  min-height: 46px;
  padding: 10px 12px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--input-bg);
  color: var(--text);
  text-align: start;
  transition: background var(--dur), border-color var(--dur), transform var(--dur) var(--ease);
}

button.item:hover {
  background: var(--surface-hover);
  border-color: var(--border-soft);
}

button.item:active {
  transform: scale(0.995);
}

.item[aria-pressed="true"] {
  border-color: var(--border-soft);
  background: color-mix(in srgb, var(--indigo) 14%, transparent);
  box-shadow: inset 3px 0 0 var(--indigo);
}

[dir="rtl"] .item[aria-pressed="true"] {
  box-shadow: inset -3px 0 0 var(--indigo);
}

.item-main {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
}

.item-main .ico {
  color: var(--text-2);
}

.fname {
  direction: ltr;
  font-family: var(--font-mono);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* ── Stats ───────────────────────────────────────────────── */
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--s-2);
}

.stat {
  padding: 12px 14px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--input-bg);
  min-width: 0;
}

.stat small {
  display: block;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
}

.stat strong {
  display: block;
  margin-top: 2px;
  font-size: 14.5px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

/* ── Empty & skeleton ────────────────────────────────────── */
.empty {
  display: grid;
  place-items: center;
  gap: var(--s-2);
  padding: var(--s-5);
  border-radius: var(--r-md);
  border: 1px dashed var(--border);
  color: var(--text-3);
  font-size: 13.5px;
  text-align: center;
}

.empty .ico {
  width: 26px;
  height: 26px;
  color: var(--text-3);
}

.skeleton {
  display: grid;
  gap: var(--s-3);
  padding: var(--s-2) 0;
}

.skeleton span {
  display: block;
  height: 44px;
  border-radius: var(--r-md);
  background: linear-gradient(90deg, var(--input-bg) 25%, var(--surface-hover) 50%, var(--input-bg) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}

.skeleton span:nth-child(2) {
  height: 120px;
}

.skeleton span:nth-child(3) {
  width: 70%;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

/* ── Progress bar ────────────────────────────────────────── */
.bar {
  height: 8px;
  border-radius: var(--r-pill);
  background: var(--input-bg);
  border: 1px solid var(--border);
  overflow: hidden;
}

.bar > i {
  display: block;
  height: 100%;
  width: 0;
  background: linear-gradient(90deg, var(--ok), #22d3ee);
  transition: width 0.8s var(--ease);
}

/* ── Toasts ──────────────────────────────────────────────── */
.toasts {
  position: fixed;
  z-index: 60;
  bottom: var(--s-5);
  inset-inline-end: var(--s-5);
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  max-width: min(380px, calc(100vw - 32px));
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: 12px 14px;
  border-radius: var(--r-md);
  border: 1px solid var(--border-soft);
  background: var(--surface-2);
  box-shadow: var(--shadow);
  font-size: 14px;
  pointer-events: auto;
  animation: toast-in 0.35s var(--ease);
}

.toast.tone-ok {
  border-color: color-mix(in srgb, var(--ok) 40%, transparent);
}

.toast.tone-danger {
  border-color: color-mix(in srgb, var(--danger) 40%, transparent);
}

.toast.is-leaving {
  opacity: 0;
  transform: translateY(6px);
  transition: all 0.25s var(--ease);
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

.settings-foot {
  margin-top: var(--s-4);
  padding-top: var(--s-4);
  border-top: 1px solid var(--border);
}

/* ── Dialogs (settings & lightbox) ───────────────────────── */
dialog {
  border: 0;
  padding: 0;
  margin: auto;
  background: transparent;
  color: var(--text);
  max-width: min(94vw, 760px);
}

dialog::backdrop {
  background: var(--scrim);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

dialog[open] {
  animation: dialog-in 0.3s var(--ease);
}

@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.985);
  }
}

.panel {
  width: min(94vw, 560px);
  padding: var(--s-6);
  border-radius: var(--r-xl);
  border: 1px solid var(--border-soft);
  background: var(--surface);
  box-shadow: var(--shadow), var(--glow);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-5);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-4) 0;
  border-top: 1px solid var(--border);
}

.field:first-of-type {
  border-top: 0;
}

.field-label {
  font-weight: 700;
}

.toggle-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--s-2);
}

.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  min-height: 46px;
  padding: 8px 12px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--input-bg);
  cursor: pointer;
  font-size: 14px;
}

.toggle input {
  appearance: none;
  width: 38px;
  height: 22px;
  margin: 0;
  flex: 0 0 auto;
  border-radius: var(--r-pill);
  background: var(--border);
  position: relative;
  cursor: pointer;
  transition: background var(--dur);
}

.toggle input::after {
  content: "";
  position: absolute;
  top: 3px;
  inset-inline-start: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform var(--dur) var(--ease);
}

.toggle input:checked {
  background: var(--grad-brand);
}

.toggle input:checked::after {
  transform: translateX(16px);
}

[dir="rtl"] .toggle input:checked::after {
  transform: translateX(-16px);
}

.lightbox {
  position: relative;
  display: grid;
  gap: var(--s-3);
  justify-items: center;
}

.lightbox img {
  max-width: min(92vw, 1280px);
  max-height: 82vh;
  border-radius: var(--r-lg);
  box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.8);
  border: 1px solid var(--border-soft);
}

.lightbox-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  width: min(92vw, 1280px);
}

.lightbox-bar .fname {
  color: var(--text-2);
}

.lightbox-nav {
  position: absolute;
  top: 40%;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-soft);
  background: color-mix(in srgb, var(--surface) 85%, transparent);
  color: var(--text);
}

.lightbox-nav.prev {
  inset-inline-start: -58px;
}

.lightbox-nav.next {
  inset-inline-end: -58px;
}

@media (max-width: 900px) {
  .lightbox-nav.prev {
    inset-inline-start: 4px;
  }

  .lightbox-nav.next {
    inset-inline-end: 4px;
  }
}
```


===== FILE: zuvyr-dashboard/css/layout.css =====

```css
/* ── Top bar ──────────────────────────────────────────────── */
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  height: var(--topbar-h);
  padding: 0 clamp(16px, 3vw, 36px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  background: color-mix(in srgb, var(--bg) 78%, transparent);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
}

.brand-logo {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  filter: drop-shadow(0 6px 18px rgba(99, 102, 241, 0.45));
}

.brand-name {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.5px;
  line-height: 1.1;
  white-space: nowrap;
}

.brand-name span {
  font-weight: 500;
  color: var(--text-2);
  letter-spacing: 0.2px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  flex-wrap: wrap;
  justify-content: flex-end;
}

.updated {
  color: var(--text-3);
  font-size: 12.5px;
  font-family: var(--font-mono);
  white-space: nowrap;
}

/* ── Hero ─────────────────────────────────────────────────── */
.hero {
  position: relative;
  max-width: var(--content-max);
  margin: 0 auto;
  padding: clamp(28px, 4vw, 44px) clamp(16px, 3vw, 36px) var(--s-4);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--s-6);
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: 5px 12px 5px 10px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border-soft);
  background: color-mix(in srgb, var(--indigo) 10%, transparent);
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
}

.eyebrow .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ember);
  box-shadow: 0 0 10px var(--ember);
}

.hero-title {
  margin-top: var(--s-4);
  font-size: clamp(30px, 4.4vw, 52px);
  font-weight: 800;
  line-height: 1.12;
  letter-spacing: -0.5px;
}

.hero-title .grad {
  background: var(--grad-text);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero-lead {
  margin-top: var(--s-3);
  max-width: 62ch;
  color: var(--text-2);
  font-size: 16px;
}

.hero-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--s-2);
  min-width: 220px;
}

.hero-meta .meta-chip {
  display: flex;
  justify-content: space-between;
  gap: var(--s-4);
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 13px;
}

.hero-meta .meta-chip b {
  font-family: var(--font-mono);
  font-weight: 500;
  color: var(--text);
  direction: ltr;
  text-align: end;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}

/* ── KPI strip ────────────────────────────────────────────── */
.kpis {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--s-4) clamp(16px, 3vw, 36px) 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--s-3);
}

.kpi {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-4);
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
  background: var(--surface);
  overflow: hidden;
  min-width: 0;
}

.kpi-ico {
  width: 40px;
  height: 40px;
  border-radius: var(--r-md);
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  color: #fff;
  background: var(--grad-brand);
  box-shadow: var(--glow);
}

.kpi-ico.ember {
  background: var(--grad-ember);
  box-shadow: 0 14px 34px -14px rgba(255, 90, 31, 0.6);
}

.kpi-body {
  min-width: 0;
}

.kpi-value {
  font-size: 24px;
  font-weight: 800;
  line-height: 1.1;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  direction: ltr;
  text-align: start;
}

.kpi-label {
  color: var(--text-2);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Module navigation (sticky, scroll-spy) ───────────────── */
.modnav-wrap {
  position: sticky;
  top: var(--topbar-h);
  z-index: 15;
  margin-top: var(--s-5);
  background: linear-gradient(var(--bg) 60%, transparent);
  padding-bottom: var(--s-3);
}

.modnav {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: 0 clamp(16px, 3vw, 36px);
  display: flex;
  gap: var(--s-2);
  overflow-x: auto;
  scrollbar-width: none;
}

.modnav::-webkit-scrollbar {
  display: none;
}

.navbtn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: 8px 14px 8px 8px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-2);
  text-decoration: none;
  font-size: 14px;
  white-space: nowrap;
  transition: color var(--dur), border-color var(--dur), background var(--dur), transform var(--dur) var(--ease);
}

.navbtn:hover {
  color: var(--text);
  border-color: var(--border-soft);
  transform: translateY(-1px);
}

.navbtn[aria-current="true"] {
  color: var(--text);
  border-color: transparent;
  background: color-mix(in srgb, var(--indigo) 18%, var(--surface));
  box-shadow: inset 0 0 0 1px var(--border-soft);
}

.navno {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  color: #fff;
  background: var(--grad-brand);
}

/* ── Cards grid ───────────────────────────────────────────── */
.grid {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--s-5) clamp(16px, 3vw, 36px) var(--s-8);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 440px), 1fr));
  gap: var(--s-5);
}

/* عند وجود بطاقة واحدة مرئية فقط نجعلها عريضة */
.grid > .card:only-child {
  grid-column: 1 / -1;
}

.footer {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--s-4) clamp(16px, 3vw, 36px) var(--s-8);
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--s-3);
  color: var(--text-3);
  font-size: 13px;
  border-top: 1px solid var(--border);
}

.footer .mono {
  direction: ltr;
}

/* ── Responsive ───────────────────────────────────────────── */
@media (max-width: 1080px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  :root {
    --topbar-h: auto;
  }

  .topbar {
    height: auto;
    padding: var(--s-3) 16px;
    flex-wrap: wrap;
  }

  .hero {
    grid-template-columns: 1fr;
  }

  .hero-meta {
    align-items: stretch;
    min-width: 0;
  }
}

@media (max-width: 640px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .kpis {
    gap: var(--s-2);
  }

  .kpi {
    padding: var(--s-3);
  }

  .kpi-value {
    font-size: 20px;
  }

  .updated {
    display: none;
  }

  .modnav-wrap {
    position: static;
  }
}
```


===== FILE: zuvyr-dashboard/css/modules.css =====

```css
/* ── Module 1 · Media ─────────────────────────────────────── */
.script-preview {
  display: grid;
  gap: var(--s-2);
  padding: var(--s-4);
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--code-bg);
  color: #c7d2fe;
}

.script-preview .fname {
  color: #e0e7ff;
}

.script-preview p {
  color: #94a3c7;
  font-size: 13.5px;
}

/* ── Module 2 · Cartoon player ────────────────────────────── */
.stage {
  display: grid;
  place-items: center;
  padding: var(--s-4);
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
  background:
    radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--indigo) 22%, transparent), transparent 70%),
    var(--code-bg);
}

.player {
  width: 100%;
  max-height: 440px;
  aspect-ratio: 16 / 9;
  border-radius: var(--r-md);
  background: #000;
  object-fit: contain;
  box-shadow: 0 20px 50px -20px rgba(0, 0, 0, 0.8);
}

.player.is-vertical {
  width: auto;
  height: 420px;
  aspect-ratio: 9 / 16;
  max-width: 100%;
}

.counter-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  flex-wrap: wrap;
  padding: var(--s-4);
  border-radius: var(--r-lg);
  border: 1px solid var(--border-soft);
  background: linear-gradient(135deg, color-mix(in srgb, var(--indigo) 14%, transparent), transparent);
}

.counter {
  font-family: var(--font-mono);
  font-size: clamp(30px, 4vw, 40px);
  font-weight: 500;
  letter-spacing: 1px;
  line-height: 1;
  direction: ltr;
  font-variant-numeric: tabular-nums;
  background: var(--grad-text);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.counter-label {
  display: grid;
  gap: 4px;
}

.counter-label small {
  color: var(--text-3);
  font-size: 12.5px;
  font-family: var(--font-mono);
  direction: ltr;
  text-align: start;
}

/* ── Module 3 · Safety ring ───────────────────────────────── */
.shield {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-4);
  border-radius: var(--r-lg);
  border: 1px solid var(--border-soft);
  background: linear-gradient(135deg, color-mix(in srgb, var(--ok) 9%, transparent), transparent 70%);
}

.ring {
  position: relative;
  width: 104px;
  height: 104px;
  display: grid;
  place-items: center;
}

.ring svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring circle {
  fill: none;
  stroke-width: 9;
  stroke-linecap: round;
}

.ring .track {
  stroke: color-mix(in srgb, var(--border) 80%, transparent);
}

.ring .value {
  stroke: url(#ring-grad);
  stroke-dasharray: 0 100;
  transition: stroke-dasharray 0.9s var(--ease);
}

.ring-text {
  position: relative;
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 500;
  direction: ltr;
}

.shield-copy {
  display: grid;
  gap: var(--s-2);
  min-width: 0;
}

.shield-copy strong {
  font-size: 17px;
}

/* ── Module 4 · Gallery & neon sample ─────────────────────── */
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: var(--s-3);
}

.thumb {
  position: relative;
  padding: 0;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--code-bg);
  transition: transform var(--dur) var(--ease), border-color var(--dur), box-shadow var(--dur);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.6s var(--ease);
}

.thumb:hover {
  border-color: var(--border-soft);
  box-shadow: var(--glow);
  transform: translateY(-2px);
}

.thumb:hover img {
  transform: scale(1.06);
}

.thumb-cap {
  position: absolute;
  inset: auto 0 0 0;
  padding: 22px 10px 8px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.88));
  color: #f1f5ff;
  font-family: var(--font-mono);
  font-size: 11.5px;
  direction: ltr;
  text-align: start;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.thumb .missing {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 8px;
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
}

.neon-sample {
  display: grid;
  place-items: center;
  min-height: 110px;
  padding: var(--s-4);
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background:
    radial-gradient(circle at 50% 50%, rgba(255, 90, 31, 0.18), transparent 60%),
    var(--code-bg);
  overflow: hidden;
}

.neon-sample span {
  font-size: clamp(30px, 4.5vw, 46px);
  font-weight: 800;
  letter-spacing: 3px;
  color: #fff7ed;
  text-shadow:
    0 0 2px #fff,
    0 3px 0 #ff5a1f,
    0 6px 16px rgba(255, 90, 31, 0.6),
    0 0 30px rgba(139, 92, 246, 0.7);
}

/* ── Module 5 · BI ────────────────────────────────────────── */
.tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-2);
}

.tile {
  display: grid;
  gap: 6px;
  padding: var(--s-4);
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--indigo) 14%, transparent), transparent 65%),
    var(--input-bg);
  min-width: 0;
}

.tile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
  color: var(--text-2);
  font-size: 13px;
}

.tile-head .ico {
  color: var(--indigo);
}

.tile-value {
  font-family: var(--font-mono);
  font-size: 26px;
  font-weight: 500;
  line-height: 1.1;
  direction: ltr;
  text-align: start;
  font-variant-numeric: tabular-nums;
}

.tile-sub {
  color: var(--text-3);
  font-size: 12px;
  font-family: var(--font-mono);
  direction: ltr;
  text-align: start;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.integ {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: 10px 12px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--input-bg);
}

.integ-name {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-weight: 700;
}

/* ── Module 6 · Orchestrator ──────────────────────────────── */
.orb-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--s-4);
}

.orb {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 35% 30%, #fbbf24, var(--ember) 45%, #7c2d12 100%);
  box-shadow: 0 0 40px -6px rgba(255, 90, 31, 0.7);
}

.orb::after {
  content: "";
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  border: 1px dashed color-mix(in srgb, var(--ember-2) 50%, transparent);
  animation: spin 12s linear infinite;
}

.orb.is-idle {
  filter: grayscale(0.7) brightness(0.8);
}

.orb.is-running {
  animation: breathe 1.4s ease-in-out infinite;
}

.orb.is-running::after {
  animation-duration: 2.5s;
}

.orb.is-done {
  background: radial-gradient(circle at 35% 30%, #a7f3d0, var(--ok) 50%, #064e3b 100%);
  box-shadow: 0 0 40px -6px rgba(52, 211, 153, 0.7);
}

.orb.is-error {
  background: radial-gradient(circle at 35% 30%, #fecdd3, var(--danger) 50%, #881337 100%);
  box-shadow: 0 0 40px -6px rgba(251, 113, 133, 0.7);
}

@keyframes breathe {
  50% {
    transform: scale(1.06);
  }
}

.orb .ico {
  width: 28px;
  height: 28px;
  color: #fff;
  stroke-width: 2.2;
}

.master-btn {
  width: 100%;
  min-height: 62px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-3);
  border: 0;
  border-radius: var(--r-lg);
  color: #fff;
  font-size: 17px;
  font-weight: 800;
  background: var(--grad-ember);
  box-shadow: 0 16px 40px -14px rgba(255, 90, 31, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  transition: transform var(--dur) var(--ease), box-shadow var(--dur), filter var(--dur);
}

.master-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.05);
  box-shadow: 0 22px 50px -14px rgba(255, 90, 31, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.master-btn:disabled {
  opacity: 0.45;
  filter: grayscale(0.4);
}

.master-btn.is-running {
  animation: glow-pulse 1.8s ease-in-out infinite;
}

@keyframes glow-pulse {
  50% {
    box-shadow: 0 0 0 12px rgba(255, 90, 31, 0), 0 16px 40px -14px rgba(255, 90, 31, 0.9);
  }
}

.master-btn .ico {
  width: 22px;
  height: 22px;
  stroke-width: 2.2;
}

.terminal {
  display: grid;
  gap: var(--s-3);
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--code-bg);
  overflow: hidden;
}

.terminal-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
  padding: 8px 12px;
  border-bottom: 1px solid #1e293b;
  color: #64748b;
  font-family: var(--font-mono);
  font-size: 12px;
}

.terminal-bar .btns {
  display: flex;
  gap: 6px;
}

.terminal-bar .btns i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #334155;
}

.terminal-body {
  max-height: 210px;
  min-height: 96px;
  overflow: auto;
  padding: 0 12px 12px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  color: #a5f3fc;
  direction: ltr;
  text-align: start;
  scrollbar-width: thin;
}

.terminal-body .line {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.terminal-body .ts {
  color: #475569;
  margin-inline-end: 8px;
}

.terminal-body .line.ok {
  color: #6ee7b7;
}

.terminal-body .line.err {
  color: #fda4af;
}

.terminal-body .line.warn {
  color: #fcd34d;
}

.terminal-body .placeholder {
  color: #475569;
}

.ua-line {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-width: 0;
}

.ua-line code {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: ltr;
  font-size: 12.5px;
  color: var(--text-2);
}

/* ── Footer hint ─────────────────────────────────────────── */
.hint {
  color: var(--text-3);
  font-size: 12.5px;
}
```


===== FILE: zuvyr-dashboard/css/tokens.css =====

```css
/*
 * ZUVYR Dashboard · Design tokens
 * ─────────────────────────────────────────────────────────────
 * الهوية مطابقة لألوان ZUVYR في frontend/rox-brand-blue-violet.css:
 *   خلفية #0B0F1A · ألواح #0F172A · تدرج أزرق → بنفسجي · لمسة Ember برتقالية.
 * لتغيير المظهر كاملاً عدّل هذه المتغيرات فقط؛ كل المكوّنات تعتمد عليها.
 */

:root,
[data-theme="dark"] {
  color-scheme: dark;

  --bg: #0b0f1a;
  --bg-deep: #070a13;
  --surface: #0f172a;
  --surface-2: #131d33;
  --surface-hover: rgba(255, 255, 255, 0.035);
  --border: #23304a;
  --border-soft: rgba(99, 102, 241, 0.28);
  --input-bg: rgba(255, 255, 255, 0.03);
  --code-bg: #05070f;
  --scrim: rgba(3, 5, 12, 0.82);

  --text: #e6ecff;
  --text-2: #98a4be;
  --text-3: #66718f;

  --blue: #2563eb;
  --indigo: #6366f1;
  --violet: #8b5cf6;
  --ember: #ff5a1f;
  --ember-2: #fb923c;
  --ok: #34d399;
  --warn: #fbbf24;
  --danger: #fb7185;

  --grad-brand: linear-gradient(135deg, #2563eb 0%, #6366f1 55%, #8b5cf6 100%);
  --grad-ember: linear-gradient(135deg, #ff5a1f 0%, #fb923c 100%);
  --grad-text: linear-gradient(90deg, #93c5fd, #a5b4fc 45%, #f0abfc);

  --aurora-1: rgba(37, 99, 235, 0.22);
  --aurora-2: rgba(139, 92, 246, 0.18);
  --aurora-3: rgba(255, 90, 31, 0.08);

  --shadow: 0 24px 60px -28px rgba(0, 0, 0, 0.75);
  --glow: 0 18px 50px -18px rgba(99, 102, 241, 0.55);
}

[data-theme="light"] {
  color-scheme: light;

  --bg: #f3f6fd;
  --bg-deep: #e9eef9;
  --surface: #ffffff;
  --surface-2: #f7f9ff;
  --surface-hover: rgba(37, 99, 235, 0.04);
  --border: #dce3f2;
  --border-soft: rgba(99, 102, 241, 0.25);
  --input-bg: #f4f7fd;
  --code-bg: #0b1020;
  --scrim: rgba(15, 20, 40, 0.6);

  --text: #0e1530;
  --text-2: #4b5878;
  --text-3: #7a86a5;

  --ok: #059669;
  --warn: #b45309;
  --danger: #e11d48;

  --grad-text: linear-gradient(90deg, #2563eb, #7c3aed 60%, #db2777);

  --aurora-1: rgba(37, 99, 235, 0.1);
  --aurora-2: rgba(139, 92, 246, 0.09);
  --aurora-3: rgba(255, 90, 31, 0.05);

  --shadow: 0 20px 50px -28px rgba(30, 41, 90, 0.35);
  --glow: 0 18px 50px -20px rgba(99, 102, 241, 0.35);
}

:root {
  --font: "Tajawal", "Segoe UI", Tahoma, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, Consolas, monospace;

  --r-xl: 24px;
  --r-lg: 18px;
  --r-md: 14px;
  --r-sm: 10px;
  --r-pill: 999px;

  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 20px;
  --s-6: 24px;
  --s-8: 32px;

  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dur: 0.25s;
  --topbar-h: 68px;
  --content-max: 1480px;
}
```


===== FILE: zuvyr-dashboard/assets/fonts/fonts.css =====

```css
/* ZUVYR Dashboard · self-hosted fonts (SIL OFL 1.1)
   Tajawal (Arabic + Latin) and IBM Plex Mono (Latin) via @fontsource. */
@font-face {
  font-family: 'Tajawal';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/tajawal-arabic-400-normal.woff2) format('woff2'), url(./files/tajawal-arabic-400-normal.woff) format('woff');
}
@font-face {
  font-family: 'Tajawal';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/tajawal-latin-400-normal.woff2) format('woff2'), url(./files/tajawal-latin-400-normal.woff) format('woff');
}
@font-face {
  font-family: 'Tajawal';
  font-style: normal;
  font-display: swap;
  font-weight: 500;
  src: url(./files/tajawal-arabic-500-normal.woff2) format('woff2'), url(./files/tajawal-arabic-500-normal.woff) format('woff');
}
@font-face {
  font-family: 'Tajawal';
  font-style: normal;
  font-display: swap;
  font-weight: 500;
  src: url(./files/tajawal-latin-500-normal.woff2) format('woff2'), url(./files/tajawal-latin-500-normal.woff) format('woff');
}
@font-face {
  font-family: 'Tajawal';
  font-style: normal;
  font-display: swap;
  font-weight: 700;
  src: url(./files/tajawal-arabic-700-normal.woff2) format('woff2'), url(./files/tajawal-arabic-700-normal.woff) format('woff');
}
@font-face {
  font-family: 'Tajawal';
  font-style: normal;
  font-display: swap;
  font-weight: 700;
  src: url(./files/tajawal-latin-700-normal.woff2) format('woff2'), url(./files/tajawal-latin-700-normal.woff) format('woff');
}
@font-face {
  font-family: 'Tajawal';
  font-style: normal;
  font-display: swap;
  font-weight: 800;
  src: url(./files/tajawal-arabic-800-normal.woff2) format('woff2'), url(./files/tajawal-arabic-800-normal.woff) format('woff');
}
@font-face {
  font-family: 'Tajawal';
  font-style: normal;
  font-display: swap;
  font-weight: 800;
  src: url(./files/tajawal-latin-800-normal.woff2) format('woff2'), url(./files/tajawal-latin-800-normal.woff) format('woff');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src: url(./files/ibm-plex-mono-latin-400-normal.woff2) format('woff2'), url(./files/ibm-plex-mono-latin-400-normal.woff) format('woff');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-display: swap;
  font-weight: 500;
  src: url(./files/ibm-plex-mono-latin-500-normal.woff2) format('woff2'), url(./files/ibm-plex-mono-latin-500-normal.woff) format('woff');
}
```


===== FILE: zuvyr-dashboard/assets/logo.svg =====

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="ZUVYR">
  <defs>
    <linearGradient id="zv-g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2563EB"/>
      <stop offset="0.55" stop-color="#6366F1"/>
      <stop offset="1" stop-color="#8B5CF6"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#zv-g)"/>
  <path d="M19 21h26L21 43h24" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="47" cy="17" r="4.5" fill="#FF5A1F"/>
</svg>
```


===== FILE: zuvyr-dashboard/js/config.js =====

```javascript
/**
 * إعدادات اللوحة. عدّل هنا فقط لتغيير السلوك دون لمس الواجهة.
 *
 * - api.*        : مسارات الـ Gateway (يمرّرها server.js إلى 127.0.0.1:5000)
 * - media.*      : مسارات الوسائط المحلية (تُقدَّم من ZUVYR_MEDIA_ROOT)
 * - defaults.*   : القيم الافتراضية قبل أن يغيّرها المستخدم
 */
export const CONFIG = Object.freeze({
  brand: {
    name: 'ZUVYR',
    product: 'True Automation Core',
  },

  api: {
    dashboard: '/api/zuvyr-dashboard',
    masterRun: '/api/zuvyr-dashboard/master-run',
    timeoutMs: 6000,
    masterRunTimeoutMs: 180000,
  },

  media: {
    base: '/media',
    folders: {
      videos: 'videos_pool',
      scripts: 'scripts_pool',
    },
  },

  defaults: {
    lang: 'ar',
    theme: 'dark',
    refreshMs: 15000,
    hidden: [],
  },

  refreshOptions: [
    { value: 5000, label: '5s' },
    { value: 15000, label: '15s' },
    { value: 30000, label: '30s' },
    { value: 0, labelKey: 'settings.off' },
  ],

  languages: ['ar', 'en'],
  themes: ['dark', 'light'],
});
```


===== FILE: zuvyr-dashboard/js/main.js =====

```javascript
/**
 * نقطة الدخول: تركيب الواجهة، ربط الحالة بالعرض، والتحديث الدوري.
 *
 *   store (الحالة) ──► render() ──► ترويسة · بيانات الهيرو · KPIs · البطاقات
 *        ▲                  │
 *        └── actions ◄──────┘  (تحديث، لغة، مظهر، إعدادات، تشغيل)
 */
import { $ } from './core/dom.js';
import { fetchDashboard } from './core/api.js';
import { applyStatic, setLang, t } from './core/i18n.js';
import { createStore } from './core/store.js';
import { loadPrefs, savePrefs } from './core/prefs.js';
import { assetsOf, fmtClock, list, obj, percentFrom } from './core/format.js';
import { MODULES } from './modules/index.js';
import { renderHeader, renderHero, renderKpis, bindHeader } from './ui/header.js';
import { buildLayout, renderLayout } from './ui/layout.js';
import { createLightbox } from './ui/lightbox.js';
import { bindSettings } from './ui/settings.js';
import { createToaster } from './ui/toast.js';

const prefs = loadPrefs();
setLang(prefs.lang);

const store = createStore({
  status: 'loading',
  online: false,
  data: null,
  error: null,
  loading: false,
  updatedAt: null,
  lang: prefs.lang,
  theme: prefs.theme,
  refreshMs: prefs.refreshMs,
  hidden: prefs.hidden,
});

const ctx = {
  store,
  toast: createToaster($('#toasts')),
  lightbox: createLightbox($('#lightbox')),
  refresh: () => refresh({ manual: true }),
  openSettings: () => settings.open(),
};

const entries = buildLayout(MODULES, ctx);
bindHeader(ctx);
const settings = bindSettings(ctx, MODULES);

let appliedLang = null;
let appliedRefresh = null;
let timer = null;

/** الدالة الوحيدة التي تلمس DOM بناءً على الحالة */
function render(state) {
  if (state.lang !== appliedLang) {
    appliedLang = state.lang;
    setLang(state.lang);
    applyStatic(document);
  }
  document.documentElement.dataset.theme = state.theme;

  if (state.refreshMs !== appliedRefresh) {
    appliedRefresh = state.refreshMs;
    schedule();
  }

  const data = obj(state.data);
  const assets = assetsOf(data);
  const kidsRaw = obj(data.schedules_and_timing).kids_content_filter;
  const pct = percentFrom(kidsRaw);

  renderHeader(state);
  renderHero(state);
  renderKpis({
    videos: assets.filter((a) => a.type === 'video').length,
    scripts: list(data.scripts_pool_list).length,
    languages: list(data.languages_supported).length,
    kidsProtected: pct === null ? '—' : `${pct}%`,
  });
  renderLayout(entries, state);

  savePrefs({
    lang: state.lang,
    theme: state.theme,
    refreshMs: state.refreshMs,
    hidden: state.hidden,
  });
}

store.subscribe(render);

async function refresh({ manual = false } = {}) {
  const before = store.get();
  store.set({ loading: true });

  try {
    const data = await fetchDashboard();
    store.set({
      status: 'ready',
      online: true,
      data,
      error: null,
      loading: false,
      updatedAt: fmtClock(),
    });
    if (manual) ctx.toast(t('toast.refreshed'), 'ok');
  } catch (err) {
    store.set({
      status: 'offline',
      online: false,
      data: null,
      error: err.message,
      loading: false,
    });
    // ننبّه مرة واحدة عند الانقطاع، أو عند طلب يدوي
    if (manual || before.online) ctx.toast(t('toast.offline'), 'danger');
  }
}

function schedule() {
  clearInterval(timer);
  timer = null;
  const ms = store.get().refreshMs;
  if (ms > 0) {
    timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, ms);
  }
}

render(store.get());
refresh();
```


===== FILE: zuvyr-dashboard/js/core/api.js =====

```javascript
import { CONFIG } from '../config.js';

/** خطأ من الـ API يحمل الحالة ورسالة قابلة للعرض */
export class ApiError extends Error {
  constructor(message, { status = null, fromServer = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fromServer = fromServer;
  }
}

/** جلب قائمة المحركات والأصول من الـ Gateway */
export async function fetchDashboard() {
  const res = await fetch(CONFIG.api.dashboard, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(CONFIG.api.timeoutMs),
  });

  if (!res.ok) {
    // server.js يعيد رسالة واضحة عند تعذّر الوصول إلى الـ Gateway
    let serverMessage = null;
    try {
      serverMessage = (await res.json()).message || null;
    } catch {
      /* الرد ليس JSON */
    }
    throw new ApiError(serverMessage ?? `HTTP ${res.status}`, {
      status: res.status,
      fromServer: Boolean(serverMessage),
    });
  }

  return res.json();
}

/** تشغيل المحرك الرئيسي. لا يرمي عند أخطاء HTTP، بل يعيد الحالة للعرض */
export async function runMasterRun() {
  try {
    const res = await fetch(CONFIG.api.masterRun, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(CONFIG.api.masterRunTimeoutMs),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    throw new ApiError(err.message || 'network error');
  }
}
```


===== FILE: zuvyr-dashboard/js/core/dom.js =====

```javascript
import { ICONS } from '../ui/icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/**
 * إنشاء عنصر HTML. النصوص تُضاف كـ textContent دائماً فلا يوجد أي حقن HTML
 * من بيانات الـ API. الخصائص المنطقية (disabled, hidden...) تُعيَّن كخاصية DOM.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  appendChildren(el, children);
  return el;
}

/** نفس h() لكن لعناصر SVG (مثل حلقة الدرع) */
export function svg(tag, props = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  appendChildren(el, children);
  return el;
}

function applyProps(el, props) {
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.setAttribute('class', value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'hidden' || key === 'disabled' || key === 'checked') el[key] = Boolean(value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
}

function appendChildren(el, children) {
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** أيقونة من مجموعة ICONS الثابتة (مرسومة بالحد) */
export function icon(name, extraClass = '') {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', `ico ${extraClass}`.trim());
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  // المحتوى ثابت من ملف الأيقونات وليس من بيانات خارجية
  el.innerHTML = ICONS[name] ?? '';
  return el;
}

/** إعادة بناء محتوى عنصر بأمان */
export function replace(el, ...children) {
  el.replaceChildren(...children.flat().filter((c) => c !== undefined && c !== null && c !== false)
    .map((c) => (c instanceof Node ? c : document.createTextNode(String(c)))));
}
```


===== FILE: zuvyr-dashboard/js/core/format.js =====

```javascript
import { CONFIG } from '../config.js';
import { getLang } from './i18n.js';

export const LANGUAGE_NAMES = {
  AR: 'العربية',
  EN: 'English',
  ES: 'Español',
  FR: 'Français',
};

const EXT_TYPE = {
  mp4: 'video', mov: 'video', webm: 'video',
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image',
  txt: 'script', md: 'script',
  mp3: 'audio', wav: 'audio', m4a: 'audio',
  obj: '3d', glb: '3d', gltf: '3d', stl: '3d',
};

/** نوع الملف من امتداده */
export const typeOf = (name) => EXT_TYPE[String(name).split('.').pop().toLowerCase()] ?? 'other';

/** رابط تشغيل/عرض ملف محلي عبر الخادم */
export const mediaUrl = (folder, name) => `${CONFIG.media.base}/${folder}/${encodeURIComponent(name)}`;

/** قائمة الأصول المادية كما يعيدها الـ Gateway (أسماء ملفات فقط) */
export function assetsOf(data) {
  const videos = list(data.videos_pool_list).map((name) => ({
    name: String(name), folder: CONFIG.media.folders.videos, type: typeOf(name),
  }));
  const scripts = list(data.scripts_pool_list).map((name) => ({
    name: String(name), folder: CONFIG.media.folders.scripts, type: typeOf(name),
  }));
  return [...videos, ...scripts];
}

/** تحويل آمن إلى مصفوفة */
export const list = (value) => (Array.isArray(value) ? value : []);

/** تحويل آمن إلى كائن */
export const obj = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

/** قيمة نصية أو قيمة بديلة */
export const text = (value, fallback = '—') => (value === undefined || value === null || value === '' ? fallback : String(value));

/** رقم منتهٍ أو null */
export const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** أرقام بصيغة لاتينية داخل الواجهة العربية أيضاً (أوضح للقراءة التقنية) */
const numberLocale = () => (getLang() === 'ar' ? 'ar-u-nu-latn' : 'en-US');

export function fmtNumber(value, digits = 0) {
  return Number(value).toLocaleString(numberLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** mm:ss أو hh:mm:ss */
export function fmtTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const s = Math.floor(seconds);
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const fmtClock = () => new Date().toLocaleTimeString('en-GB');

/** النسبة المئوية من نص مثل "100% No Copyright" */
export function percentFrom(raw) {
  const match = String(raw ?? '').match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  return match ? Math.min(100, Number(match[1])) : null;
}

/**
 * عدّ متحرّك إلى قيمة جديدة. يحفظ آخر قيمة في dataset حتى يبدأ من مكانه.
 * يحترم reduce-motion.
 */
export function animateNumber(el, to, format) {
  const from = Number(el.dataset.value ?? 0);
  el.dataset.value = String(to);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || from === to) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const duration = 900;
  const step = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = format(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const truncate = (value, max = 64) => {
  const s = String(value ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
```


===== FILE: zuvyr-dashboard/js/core/i18n.js =====

```javascript
import ar from '../locales/ar.js';
import en from '../locales/en.js';
import { CONFIG } from '../config.js';

const DICTS = { ar, en };
const DIRECTION = { ar: 'rtl', en: 'ltr' };

let current = CONFIG.defaults.lang;

export const getLang = () => current;

/** ترجمة مفتاح مع استبدال المتغيرات {name} */
export function t(key, vars) {
  const text = DICTS[current][key] ?? DICTS.ar[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
}

/** تغيير اللغة واتجاه الصفحة. ينبغي استدعاؤها قبل بناء العناصر */
export function setLang(lang) {
  current = DICTS[lang] ? lang : CONFIG.defaults.lang;
  document.documentElement.lang = current;
  document.documentElement.dir = DIRECTION[current];
}

/**
 * تحديث النصوص الثابتة داخل الشجرة:
 *  data-i18n="key"            → textContent
 *  data-i18n-title="key"      → title
 *  data-i18n-aria="key"       → aria-label
 */
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
}
```


===== FILE: zuvyr-dashboard/js/core/prefs.js =====

```javascript
import { CONFIG } from '../config.js';

const KEY = 'zuvyr-dashboard:prefs:v1';

/** تحميل التفضيلات مع التحقق من كل قيمة (تفضيلات تالفة لا تكسر الواجهة) */
export function loadPrefs() {
  const defaults = CONFIG.defaults;
  let saved = {};
  try {
    saved = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    saved = {};
  }

  const refreshValues = CONFIG.refreshOptions.map((o) => o.value);
  return {
    lang: CONFIG.languages.includes(saved.lang) ? saved.lang : defaults.lang,
    theme: CONFIG.themes.includes(saved.theme) ? saved.theme : defaults.theme,
    refreshMs: refreshValues.includes(saved.refreshMs) ? saved.refreshMs : defaults.refreshMs,
    hidden: Array.isArray(saved.hidden) ? saved.hidden.filter((id) => typeof id === 'string') : [...defaults.hidden],
  };
}

export function savePrefs(prefs) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* التخزين غير متاح (وضع خاص مثلاً): نتجاهل بهدوء */
  }
}
```


===== FILE: zuvyr-dashboard/js/core/store.js =====

```javascript
/**
 * مخزن حالة بسيط وقابل للتنبؤ: كل تغيير ينتج كائن حالة جديد ثم يبلّغ المشتركين.
 */
export function createStore(initial) {
  let state = Object.freeze({ ...initial });
  const listeners = new Set();

  return {
    get: () => state,

    set(patch) {
      state = Object.freeze({ ...state, ...patch });
      listeners.forEach((fn) => fn(state));
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
```


===== FILE: zuvyr-dashboard/js/ui/header.js =====

```javascript
/**
 * الترويسة: حالة الاتصال، اللغة، المظهر، التحديث، وبيانات الهيرو والتذييل.
 */
import { $, $$, h, icon, replace } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { obj, text } from '../core/format.js';
import { CONFIG } from '../config.js';

export function bindHeader(ctx) {
  const { store } = ctx;

  replace($('#theme-toggle'), icon('sun'));
  replace($('#settings-open'), icon('sliders'));
  $('#refresh').prepend(icon('refresh'));

  $$('#lang-switch [data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => store.set({ lang: btn.dataset.lang }));
  });

  $('#theme-toggle').addEventListener('click', () => {
    const next = store.get().theme === 'dark' ? 'light' : 'dark';
    store.set({ theme: next });
  });

  $('#refresh').addEventListener('click', () => ctx.refresh());
  $('#settings-open').addEventListener('click', () => ctx.openSettings());
}

/** يعكس الحالة الحالية على كل عناصر الترويسة */
export function renderHeader(state) {
  const conn = $('#conn');
  const dot = conn.querySelector('.dot');
  const label = conn.querySelector('span:last-child');

  if (state.status === 'ready') {
    conn.className = 'tag tone-ok';
    dot.className = 'dot pulse';
    label.textContent = t('topbar.online');
    conn.removeAttribute('title');
  } else if (state.status === 'offline') {
    conn.className = 'tag tone-danger';
    dot.className = 'dot';
    label.textContent = t('topbar.offline');
    conn.title = state.error ?? '';
  } else {
    conn.className = 'tag';
    dot.className = 'dot pulse';
    label.textContent = t('topbar.connecting');
  }

  $('#updated').textContent = state.updatedAt
    ? t('topbar.updated', { time: state.updatedAt })
    : t('topbar.never');

  $$('#lang-switch [data-lang]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === state.lang));
  });

  const themeBtn = $('#theme-toggle');
  replace(themeBtn, icon(state.theme === 'dark' ? 'sun' : 'moon'));

  $('#refresh').classList.toggle('is-spinning', Boolean(state.loading));
}

/** بيانات الهيرو (الإصدار والنمط) والتذييل من الـ Gateway */
export function renderHero(state) {
  const data = obj(state.data);
  const meta = $('#hero-meta');
  const rows = [
    [t('hero.version'), data.system_version],
    [t('hero.style'), data.niche_style],
    [t('hero.gateway'), state.online ? CONFIG.api.dashboard : null],
  ].filter(([, value]) => value);

  replace(meta, rows.map(([label, value]) =>
    h('div', { class: 'meta-chip' }, h('span', { class: 'muted' }, label), h('b', { title: String(value) }, String(value)))));

  $('#footer-version').textContent = text(data.system_version, CONFIG.brand.name);
}

/** بطاقات الملخص العلوي */
export function renderKpis({ videos, scripts, languages, kidsProtected }) {
  const items = [
    { icon: 'film', value: videos, labelKey: 'kpi.videos' },
    { icon: 'doc', value: scripts, labelKey: 'kpi.scripts' },
    { icon: 'globe', value: languages, labelKey: 'kpi.languages' },
    { icon: 'shield', value: kidsProtected, labelKey: 'kpi.kids', ember: true },
  ];

  replace($('#kpis'), items.map((item) => h('div', { class: 'kpi' },
    h('span', { class: `kpi-ico ${item.ember ? 'ember' : ''}` }, icon(item.icon)),
    h('div', { class: 'kpi-body' },
      h('div', { class: 'kpi-value', dir: 'auto' }, String(item.value)),
      h('div', { class: 'kpi-label', 'data-i18n': item.labelKey }, t(item.labelKey))))));
}
```


===== FILE: zuvyr-dashboard/js/ui/icons.js =====

```javascript
/**
 * مجموعة الأيقونات (24×24، مرسومة بالحد). المحتوى ثابت داخل الكود،
 * لذلك يُقبل تمريره إلى innerHTML بأمان.
 */
export const ICONS = {
  // وحدات النظام
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',

  // واجهة
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  signal: '<path d="M4 12a8 8 0 0 1 16 0"/><path d="M7.5 12a4.5 4.5 0 0 1 9 0"/><circle cx="12" cy="12" r="1.2"/>',

  // بيانات
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  music: '<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  cube: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>',
  dollar: '<path d="M12 3v18M16 7.5c-.8-1-2.2-1.5-4-1.5-2.2 0-3.5 1-3.5 2.5s1.3 2.1 3.5 2.6 3.5 1.2 3.5 2.6-1.3 2.5-3.5 2.5c-1.9 0-3.4-.6-4.2-1.8"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h5l1 2h6l1-2h5"/>',
};
```


===== FILE: zuvyr-dashboard/js/ui/layout.js =====

```javascript
/**
 * تخطيط البطاقات والتنقل. يبني الهيكل مرة واحدة، ثم يعيد عرض المحتوى مع كل تغيير حالة.
 *
 * عقد الوحدة (module contract):
 *   id, icon, titleKey, subKey, shortKey
 *   mount(bodyEl, ctx) → { render(state) → { tone, key } | null }
 *     - mount يبني العناصر الدائمة مرة واحدة (مثل مشغّل الفيديو فلا يُعاد إنشاؤه)
 *     - render تُستدعى مع كل تغيير حالة وتعيد وسم الحالة الظاهر في رأس البطاقة
 */
import { $, h, icon } from '../core/dom.js';
import { t } from '../core/i18n.js';

export function buildLayout(modules, ctx) {
  const nav = $('#modnav');
  const grid = $('#grid');

  const entries = modules.map((mod, index) => {
    const titleId = `title-${mod.id}`;
    const badge = h('span', { class: 'tag' });
    const body = h('div', { class: 'card-body' });
    const skeleton = h('div', { class: 'skeleton', 'aria-hidden': 'true' }, h('span'), h('span'), h('span'));

    const card = h('section', {
      class: 'card',
      id: `card-${mod.id}`,
      'aria-labelledby': titleId,
      dataset: { module: mod.id, state: 'loading' },
    },
    h('header', { class: 'card-head' },
      h('div', { class: 'card-ico' }, icon(mod.icon)),
      h('div', { class: 'card-titles' },
        h('h2', { id: titleId, 'data-i18n': mod.titleKey }, t(mod.titleKey)),
        h('p', { class: 'card-sub', 'data-i18n': mod.subKey }, t(mod.subKey))),
      badge),
    body,
    skeleton);

    const link = h('a', { class: 'navbtn', href: `#card-${mod.id}`, dataset: { module: mod.id } },
      h('span', { class: 'navno' }, String(index + 1).padStart(2, '0')),
      h('span', { 'data-i18n': mod.shortKey }, t(mod.shortKey)));

    const renderer = mod.mount(body, ctx);
    return { mod, card, link, badge, renderer };
  });

  grid.append(...entries.map((e) => e.card));
  nav.append(...entries.map((e) => e.link));
  observeSections(entries);
  return entries;
}

/** تمييز الوحدة المرئية حالياً في شريط التنقل */
function observeSections(entries) {
  const byId = new Map(entries.map((e) => [e.mod.id, e.link]));
  const observer = new IntersectionObserver((records) => {
    for (const record of records) {
      if (!record.isIntersecting) continue;
      const activeId = record.target.dataset.module;
      for (const [id, link] of byId) {
        link.setAttribute('aria-current', String(id === activeId));
      }
    }
  }, { rootMargin: '-35% 0px -55% 0px' });

  entries.forEach((e) => observer.observe(e.card));
}

/** يعيد عرض كل البطاقات حسب الحالة والتفضيلات */
export function renderLayout(entries, state) {
  for (const entry of entries) {
    const hidden = state.hidden.includes(entry.mod.id);
    entry.card.hidden = hidden;
    entry.link.hidden = hidden;
    entry.card.dataset.state = state.status;
    if (hidden) continue;

    const status = entry.renderer.render(state);
    if (status) {
      entry.badge.className = `tag ${status.tone ? `tone-${status.tone}` : ''}`.trim();
      entry.badge.textContent = t(status.key);
    }
  }
}
```


===== FILE: zuvyr-dashboard/js/ui/lightbox.js =====

```javascript
import { $, icon, replace } from '../core/dom.js';
import { truncate } from '../core/format.js';

/**
 * معرض مكبّر مع تنقل بالأسهم ولوحة المفاتيح.
 * items: [{ src, caption }]
 */
export function createLightbox(dialog) {
  const img = $('#lb-image', dialog);
  const caption = $('#lb-caption', dialog);
  const counter = $('#lb-count', dialog);
  const prevBtn = $('#lb-prev', dialog);
  const nextBtn = $('#lb-next', dialog);
  const closeBtn = $('#lb-close', dialog);

  let items = [];
  let index = 0;

  replace(prevBtn, icon('chevronRight'));
  replace(nextBtn, icon('chevronLeft'));
  replace(closeBtn, icon('close'));

  // الأزرار والأسهم تطابق موضعها البصري: في RTL يقع "التالي" على اليسار
  function show(i) {
    if (!items.length) return;
    index = (i + items.length) % items.length;
    const item = items[index];
    img.src = item.src;
    img.alt = item.caption;
    caption.textContent = truncate(item.caption, 80);
    counter.textContent = `${index + 1} / ${items.length}`;
    const multi = items.length > 1;
    prevBtn.hidden = !multi;
    nextBtn.hidden = !multi;
  }

  prevBtn.addEventListener('click', () => show(index - 1));
  nextBtn.addEventListener('click', () => show(index + 1));
  closeBtn.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(index + 1);
    if (e.key === 'ArrowRight') show(index - 1);
  });

  return {
    open(list, start = 0) {
      items = list;
      show(start);
      dialog.showModal();
      closeBtn.focus();
    },
  };
}
```


===== FILE: zuvyr-dashboard/js/ui/parts.js =====

```javascript
/**
 * قطع واجهة مشتركة بين الوحدات (أقسام، وسوم، عناصر ملفات، إحصاءات، حالات فارغة).
 */
import { h, icon } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { typeOf } from '../core/format.js';

/** عنوان قسم داخل البطاقة (نص ثابت قابل للترجمة) */
export const section = (key) => h('div', { class: 'sec', 'data-i18n': key }, t(key));

/** وسم حالة. tone: ok | warn | danger | info | '' */
export const tag = (label, tone = '', iconName = null) =>
  h('span', { class: `tag ${tone ? `tone-${tone}` : ''}` }, iconName ? icon(iconName, 'ico-sm') : null, label);

const TYPE_META = {
  video: { key: 'type.video', tone: 'video', icon: 'video' },
  image: { key: 'type.image', tone: 'image', icon: 'image' },
  script: { key: 'type.script', tone: 'script', icon: 'doc' },
  audio: { key: 'type.audio', tone: 'audio', icon: 'music' },
  '3d': { key: 'type.3d', tone: '3d', icon: 'cube' },
  other: { key: 'type.other', tone: '', icon: 'doc' },
};

/** وسم نوع الملف (فيديو، صورة، نص...) */
export function typeTag(name) {
  const meta = TYPE_META[typeOf(name)];
  return tag(t(meta.key), meta.tone);
}

export const typeIcon = (name) => TYPE_META[typeOf(name)].icon;

/** عنصر ملف في قائمة. إن مُرّر onClick يصبح زراً قابلاً للاختيار */
export function fileItem({ name, active = false, onClick, trailing = null }) {
  const main = h('span', { class: 'item-main' }, icon(typeIcon(name), 'ico-sm'), h('span', { class: 'fname', title: name }, name));
  if (!onClick) {
    return h('div', { class: 'item', role: 'listitem' }, main, trailing ?? typeTag(name));
  }
  return h('button', {
    type: 'button',
    class: 'item',
    'aria-pressed': String(active),
    onclick: onClick,
  }, main, trailing ?? typeTag(name));
}

/** بطاقة إحصاء صغيرة. يعيد العنصر ومرجع القيمة لتحديثها لاحقاً */
export function stat(labelKey, initial = '—') {
  const value = h('strong', { dir: 'auto' }, initial);
  const el = h('div', { class: 'stat' }, h('small', { 'data-i18n': labelKey }, t(labelKey)), value);
  return { el, value };
}

/** حالة فارغة مع أيقونة ورسالة */
export const emptyState = (message, iconName = 'inbox') =>
  h('div', { class: 'empty' }, icon(iconName), h('span', {}, message));

/** إطار صغير لعنصر مع نص يمكن أن يتغيّر بتغيّر اللغة */
export const note = (text) => h('p', { class: 'note' }, text);
```


===== FILE: zuvyr-dashboard/js/ui/settings.js =====

```javascript
/**
 * لوحة الإعدادات: فترة التحديث، وإظهار/إخفاء الوحدات. تُحفظ عبر store ثم prefs.
 */
import { $, h, icon, replace } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { CONFIG } from '../config.js';

export function bindSettings(ctx, modules) {
  const dialog = $('#settings');
  const refreshWrap = $('#refresh-options');
  const togglesWrap = $('#module-toggles');

  replace($('#settings-close'), icon('close'));
  $('#settings-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  $('#settings-reset').addEventListener('click', () => {
    ctx.store.set({ hidden: [...CONFIG.defaults.hidden], refreshMs: CONFIG.defaults.refreshMs });
  });

  function paint(state) {
    replace(refreshWrap, CONFIG.refreshOptions.map((option) => h('button', {
      type: 'button',
      'aria-pressed': String(option.value === state.refreshMs),
      onclick: () => ctx.store.set({ refreshMs: option.value }),
    }, option.labelKey ? t(option.labelKey) : option.label)));

    replace(togglesWrap, modules.map((mod) => {
      const input = h('input', {
        type: 'checkbox',
        checked: !state.hidden.includes(mod.id),
        onchange: (e) => {
          const others = ctx.store.get().hidden.filter((id) => id !== mod.id);
          const hidden = e.currentTarget.checked ? others : [...others, mod.id];
          if (hidden.length >= modules.length) {
            // لا نسمح بإخفاء كل الوحدات، وإلا تصبح اللوحة فارغة
            e.currentTarget.checked = true;
            ctx.toast(t('settings.atLeastOne'), 'danger');
            return;
          }
          ctx.store.set({ hidden });
        },
      });
      return h('label', { class: 'toggle' },
        h('span', { 'data-i18n': mod.titleKey }, t(mod.titleKey)),
        input);
    }));
  }

  // أثناء فتح اللوحة تُحدَّث محتوياتها مع أي تغيير
  ctx.store.subscribe((state) => {
    if (dialog.open) paint(state);
  });

  return {
    open() {
      paint(ctx.store.get());
      dialog.showModal();
      dialog.querySelector('button, input')?.focus();
    },
  };
}
```


===== FILE: zuvyr-dashboard/js/ui/toast.js =====

```javascript
import { h, icon } from '../core/dom.js';

/**
 * إشعارات خفيفة في الزاوية. tone: info | ok | danger
 */
export function createToaster(container) {
  return function toast(message, tone = 'info', duration = 3800) {
    const item = h('div', { class: `toast tone-${tone}`, role: 'status' },
      icon(tone === 'danger' ? 'alert' : tone === 'ok' ? 'check' : 'signal', 'ico-sm'),
      h('span', {}, message));

    container.append(item);
    setTimeout(() => {
      item.classList.add('is-leaving');
      setTimeout(() => item.remove(), 260);
    }, duration);
  };
}
```


===== FILE: zuvyr-dashboard/js/modules/bi.js =====

```javascript
/** الوحدة 5 · ذكاء الأعمال: عدادات حيّة، التكاملات، ومستندات الاستراتيجية */
import { h, icon, replace } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { animateNumber, assetsOf, fmtNumber, num, obj, text } from '../core/format.js';
import { emptyState, fileItem, note, section, tag } from '../ui/parts.js';

const BUSINESS_DOC = /business|financial|strategy|report/i;

function metricTile(labelKey, iconName) {
  const value = h('div', { class: 'tile-value' }, '—');
  const sub = h('div', { class: 'tile-sub' });
  const el = h('div', { class: 'tile' },
    h('div', { class: 'tile-head' }, icon(iconName, 'ico-sm'), h('span', { 'data-i18n': labelKey }, t(labelKey))),
    value,
    sub);
  return { el, value, sub };
}

/** يعرض رقماً متحركاً إن وُجد، وإلا يكتفي بالشرطة مع نص الحالة */
function setMetric(metric, raw, { digits = 0, subText = '' } = {}) {
  const n = num(raw);
  if (n !== null) {
    animateNumber(metric.value, n, (v) => fmtNumber(v, digits));
  } else {
    metric.value.textContent = '—';
    metric.value.dataset.value = '0';
  }
  metric.sub.textContent = subText;
}

export default {
  id: 'bi',
  icon: 'chart',
  titleKey: 'mod.bi.title',
  subKey: 'mod.bi.sub',
  shortKey: 'mod.bi.short',

  mount(body) {
    const views = metricTile('bi.views', 'eye');
    const rpm = metricTile('bi.rpm', 'chart');
    const adsense = metricTile('bi.adsense', 'dollar');
    const affiliate = metricTile('bi.affiliate', 'layers');
    const integrationsEl = h('div', { class: 'list' });
    const docsEl = h('div', { class: 'list' });

    body.append(
      section('bi.counters'),
      h('div', { class: 'tiles' }, views.el, rpm.el, adsense.el, affiliate.el),
      section('bi.integrations'),
      integrationsEl,
      section('bi.docs'),
      docsEl,
      note(t('bi.note')),
    );

    return {
      render(state) {
        const data = obj(state.data);
        const fin = obj(data.financial_analytics);
        const adsenseStatus = text(data.adsense_status, '');
        const connected = /connected/i.test(adsenseStatus);

        setMetric(views, fin.views, { subText: text(fin.views_growth, '') });
        setMetric(rpm, fin.rpm, { digits: 2, subText: num(fin.rpm) === null ? t('bi.pendingRpm') : '' });
        setMetric(adsense, fin.adsense_earnings, { digits: 2, subText: adsenseStatus });
        setMetric(affiliate, fin.affiliate_earnings, { digits: 2, subText: text(fin.affiliate_revenue_sync, '') });

        replace(integrationsEl, h('div', { class: 'integ' },
          h('span', { class: 'integ-name' }, icon('dollar', 'ico-sm'), t('bi.adsenseName')),
          tag(text(data.adsense_status, t('state.pending')), connected ? 'ok' : 'warn')));

        const docs = assetsOf(data).filter((a) => a.folder === 'scripts_pool' && BUSINESS_DOC.test(a.name));
        replace(docsEl, docs.length
          ? docs.map((a) => fileItem({ name: a.name }))
          : emptyState(t('bi.noDocs'), 'doc'));

        return connected
          ? { tone: 'ok', key: 'state.connected' }
          : { tone: 'warn', key: 'state.pending' };
      },
    };
  },
};
```


===== FILE: zuvyr-dashboard/js/modules/brand.js =====

```javascript
/** الوحدة 4 · العلامة والصور المصغّرة: معرض مع عرض مكبّر */
import { h, replace } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { assetsOf, mediaUrl, obj } from '../core/format.js';
import { emptyState, section, stat } from '../ui/parts.js';

export default {
  id: 'brand',
  icon: 'image',
  titleKey: 'mod.brand.title',
  subKey: 'mod.brand.sub',
  shortKey: 'mod.brand.short',

  mount(body, ctx) {
    const gallery = h('div', { class: 'gallery' });

    const resolution = stat('brand.resolution', '1280×720');
    const platform = stat('brand.platform', 'YouTube Global');
    const shadow = stat('brand.shadow');

    body.append(
      h('div', { class: 'stats' }, resolution.el, platform.el, shadow.el),
      h('div', { class: 'row' },
        h('span', { class: 'muted', 'data-i18n': 'brand.style' }, t('brand.style')),
        h('span', { class: 'tag tone-info', 'data-i18n': 'brand.styleValue' }, t('brand.styleValue'))),
      section('brand.sample'),
      h('div', { class: 'neon-sample', role: 'img', 'aria-label': 'ZUVYR' }, h('span', {}, 'ZUVYR')),
      section('brand.gallery'),
      gallery,
    );

    return {
      render(state) {
        const images = assetsOf(obj(state.data)).filter((a) => a.type === 'image');
        const items = images.map((a) => ({ src: mediaUrl(a.folder, a.name), caption: a.name }));

        shadow.value.textContent = t('brand.shadowOn');

        replace(gallery, items.length
          ? items.map((item, index) => h('button', {
            type: 'button',
            class: 'thumb',
            title: item.caption,
            'aria-label': item.caption,
            onclick: () => ctx.lightbox.open(items, index),
          },
          h('img', {
            src: item.src,
            alt: item.caption,
            loading: 'lazy',
            onerror: (e) => e.currentTarget.replaceWith(h('div', { class: 'missing' }, t('brand.missing'))),
          }),
          h('span', { class: 'thumb-cap' }, item.caption)))
          : emptyState(t('brand.noImages'), 'image'));

        return items.length
          ? { tone: 'ok', key: 'state.ready' }
          : { tone: '', key: 'state.empty' };
      },
    };
  },
};
```


===== FILE: zuvyr-dashboard/js/modules/cartoon.js =====

```javascript
/** الوحدة 2 · محرك الرسوم المتحركة: مشغّل عمودي وعداد دقائق المشاهدة */
import { CONFIG } from '../config.js';
import { h, icon, replace } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { assetsOf, fmtTime, mediaUrl, obj, text } from '../core/format.js';
import { note, section, stat } from '../ui/parts.js';

/** أقصى فجوة زمنية بين تحديثين نعدّها مشاهدة متصلة (ثوانٍ) — أي قفزة أكبر تُعدّ seek */
const MAX_CONTINUOUS_GAP = 2;

export default {
  id: 'cartoon',
  icon: 'sparkles',
  titleKey: 'mod.cartoon.title',
  subKey: 'mod.cartoon.sub',
  shortKey: 'mod.cartoon.short',

  mount(body) {
    const st = { clips: [], selected: null, watched: 0, last: 0, error: false };

    const player = h('video', { class: 'player', controls: true, playsinline: true, preload: 'metadata' });
    const clipsEl = h('div', { class: 'chips' });
    const errorEl = h('p', { class: 'note', role: 'alert' });

    const counterEl = h('div', { class: 'counter' }, '00:00');
    const minutesEl = h('small', {}, `0.00 ${t('cartoon.minutes')}`);
    const resetBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { st.watched = 0; paintCounter(); } },
      icon('refresh', 'ico-sm'),
      h('span', { 'data-i18n': 'cartoon.reset' }, t('cartoon.reset')));

    const clipLength = stat('cartoon.clipLength');
    const shorts = stat('cartoon.shorts');
    const long = stat('cartoon.long');
    const format = stat('cartoon.format');

    body.append(
      section('cartoon.clips'),
      clipsEl,
      h('div', { class: 'stage' }, player),
      errorEl,
      h('div', { class: 'counter-panel' },
        h('div', { class: 'counter-label' },
          h('span', { class: 'muted', 'data-i18n': 'cartoon.watched' }, t('cartoon.watched')),
          counterEl,
          minutesEl),
        resetBtn),
      section('cartoon.schedule'),
      h('div', { class: 'stats' }, shorts.el, long.el, clipLength.el, format.el),
    );

    function paintCounter() {
      counterEl.textContent = fmtTime(st.watched);
      minutesEl.textContent = `${(st.watched / 60).toFixed(2)} ${t('cartoon.minutes')}`;
    }

    function select(name) {
      st.selected = name;
      st.last = 0;
      st.error = false;
      player.src = mediaUrl(CONFIG.media.folders.videos, name);
      player.load();
      paintClips();
    }

    function paintClips() {
      replace(clipsEl, st.clips.length
        ? st.clips.map((clip) => h('button', {
          type: 'button',
          class: 'chip',
          'aria-pressed': String(clip.name === st.selected),
          onclick: () => select(clip.name),
        }, clip.name))
        : note(t('cartoon.noClips')));
      errorEl.textContent = st.error ? t('cartoon.error') : '';
    }

    player.addEventListener('loadedmetadata', () => {
      clipLength.value.textContent = `${fmtTime(player.duration)} · ${(player.duration / 60).toFixed(2)} ${t('cartoon.minutes')}`;
      player.classList.toggle('is-vertical', player.videoHeight > player.videoWidth);
      st.last = player.currentTime;
    });
    player.addEventListener('play', () => {
      st.last = player.currentTime;
    });
    player.addEventListener('seeking', () => {
      st.last = player.currentTime;
    });
    player.addEventListener('timeupdate', () => {
      const delta = player.currentTime - st.last;
      if (delta > 0 && delta < MAX_CONTINUOUS_GAP) {
        st.watched += delta;
        paintCounter();
      }
      st.last = player.currentTime;
    });
    player.addEventListener('error', () => {
      if (!st.selected) return;
      st.error = true;
      paintClips();
    });

    paintCounter();

    return {
      render(state) {
        const data = obj(state.data);
        const schedule = obj(data.schedules_and_timing);
        st.clips = assetsOf(data).filter((a) => a.folder === CONFIG.media.folders.videos && a.type === 'video');

        if (!st.clips.some((c) => c.name === st.selected)) {
          if (st.clips.length) select(st.clips[0].name);
          else st.selected = null;
        }

        shorts.value.textContent = text(schedule.shorts_reels_duration);
        long.value.textContent = text(schedule.long_videos_duration);
        format.value.textContent = t('cartoon.formatValue');
        paintClips();
        paintCounter();

        return st.clips.length
          ? { tone: 'ok', key: 'state.ready' }
          : { tone: '', key: 'state.empty' };
      },
    };
  },
};
```


===== FILE: zuvyr-dashboard/js/modules/evolution.js =====

```javascript
/** الوحدة 6 · المُنسِّق ذاتي التطور: زر التشغيل الرئيسي، درع الأمان، وسجل التشغيل */
import { CONFIG } from '../config.js';
import { h, icon, replace } from '../core/dom.js';
import { runMasterRun } from '../core/api.js';
import { t } from '../core/i18n.js';
import { fmtClock, obj, text } from '../core/format.js';
import { note, section } from '../ui/parts.js';

const MAX_LINES = 200;

/** حالة الزر والكرة البصرية حسب نتيجة آخر تشغيل */
const RUN_VIEW = {
  idle: { orb: 'is-idle', label: 'evo.orbIdle' },
  running: { orb: 'is-running', label: 'evo.orbRunning' },
  done: { orb: 'is-done', label: 'evo.orbDone' },
  error: { orb: 'is-error', label: 'evo.orbError' },
  unavailable: { orb: 'is-idle', label: 'state.unavailable' },
};

export default {
  id: 'evo',
  icon: 'bolt',
  titleKey: 'mod.evo.title',
  subKey: 'mod.evo.sub',
  shortKey: 'mod.evo.short',

  mount(body, ctx) {
    const st = { online: false, running: false, runState: 'idle', lines: [], userAgent: '' };

    const orb = h('div', { class: 'orb is-idle' }, icon('bolt'));
    const orbLabel = h('strong');
    const statusTag = h('span', { class: 'tag' });
    const antiBotTag = h('span', { class: 'tag' });
    const uaCode = h('code');
    const copyBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: copyUserAgent },
      icon('copy', 'ico-sm'),
      h('span', { 'data-i18n': 'evo.copy' }, t('evo.copy')));

    const masterBtn = h('button', { type: 'button', class: 'master-btn', disabled: true, onclick: runMaster });
    const logBody = h('div', { class: 'terminal-body', role: 'log', 'aria-live': 'polite' });
    const clearBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: clearLog },
      icon('trash', 'ico-sm'),
      h('span', { 'data-i18n': 'evo.clear' }, t('evo.clear')));

    body.append(
      h('div', { class: 'orb-row' },
        orb,
        h('div', { class: 'stack' },
          h('span', { class: 'muted', 'data-i18n': 'evo.status' }, t('evo.status')),
          orbLabel,
          statusTag)),
      section('evo.shield'),
      h('div', { class: 'row' }, h('span', { class: 'muted', 'data-i18n': 'evo.antiBot' }, t('evo.antiBot')), antiBotTag),
      h('div', { class: 'ua-line' }, uaCode, copyBtn),
      h('span', { class: 'muted', 'data-i18n': 'evo.userAgent' }, t('evo.userAgent')),
      section('evo.source'),
      note(t('evo.sourceValue')),
      masterBtn,
      section('evo.log'),
      h('div', { class: 'terminal' },
        h('div', { class: 'terminal-bar' },
          h('span', { class: 'btns' }, h('i'), h('i'), h('i')),
          h('span', {}, 'zuvyr://master-run'),
          clearBtn),
        logBody),
    );

    function addLine(message, tone = '') {
      st.lines = [...st.lines, { time: fmtClock(), message, tone }].slice(-MAX_LINES);
      paintLog();
    }

    function clearLog() {
      st.lines = [];
      paintLog();
      ctx.toast(t('toast.logCleared'));
    }

    function paintLog() {
      replace(logBody, st.lines.length
        ? st.lines.map((line) => h('div', { class: `line ${line.tone}`.trim() },
          h('span', { class: 'ts' }, line.time),
          line.message))
        : h('div', { class: 'placeholder', dir: 'auto' }, t('evo.logEmpty')));
      logBody.scrollTop = logBody.scrollHeight;
    }

    function paintControls() {
      const view = RUN_VIEW[st.runState];
      orb.className = `orb ${view.orb}`;
      orbLabel.textContent = t(view.label);
      masterBtn.disabled = !st.online || st.running;
      masterBtn.classList.toggle('is-running', st.running);
      replace(masterBtn, icon(st.running ? 'refresh' : 'bolt'),
        h('span', {}, t(st.running ? 'evo.running' : 'evo.run')));
    }

    async function runMaster() {
      if (st.running || !st.online) return;
      st.running = true;
      st.runState = 'running';
      paintControls();
      addLine(t('evo.started'), 'warn');

      try {
        const res = await runMasterRun();
        if (res.status === 404) {
          st.runState = 'unavailable';
          addLine(t('evo.unavailable', { path: CONFIG.api.masterRun }), 'warn');
        } else if (!res.ok) {
          st.runState = 'error';
          addLine(t('evo.failed', { status: res.status }), 'err');
          if (res.text) addLine(res.text.slice(0, 300), 'err');
        } else {
          st.runState = 'done';
          addLine(t('evo.done'), 'ok');
          if (res.text) addLine(res.text.slice(0, 2000));
          ctx.toast(t('evo.done'), 'ok');
        }
      } catch (err) {
        st.runState = 'error';
        addLine(t('evo.network', { message: err.message }), 'err');
        ctx.toast(t('toast.offline'), 'danger');
      } finally {
        st.running = false;
        paintControls();
      }
    }

    async function copyUserAgent() {
      try {
        await navigator.clipboard.writeText(st.userAgent);
        ctx.toast(t('toast.copied'), 'ok');
      } catch {
        ctx.toast(t('toast.offline'), 'danger');
      }
    }

    paintLog();

    return {
      render(state) {
        st.online = state.status === 'ready';
        const data = obj(state.data);
        const security = obj(data.security_gate);
        const evolution = text(data.self_evolution_status, '');
        const antiBot = text(security.anti_bot_protection, '');

        statusTag.className = `tag ${/active/i.test(evolution) ? 'tone-ok' : ''}`.trim();
        statusTag.textContent = text(evolution, t('state.empty'));
        antiBotTag.className = `tag ${/enabled/i.test(antiBot) ? 'tone-ok' : ''}`.trim();
        antiBotTag.textContent = antiBot;

        st.userAgent = text(security.current_spoofed_agent, '');
        uaCode.textContent = st.userAgent;
        uaCode.title = st.userAgent;

        paintControls();

        return /active/i.test(evolution)
          ? { tone: 'ok', key: 'state.active' }
          : { tone: '', key: 'state.idle' };
      },
    };
  },
};
```


===== FILE: zuvyr-dashboard/js/modules/index.js =====

```javascript
/**
 * سجل الوحدات بالترتيب الذي يظهر به في الواجهة.
 * لإضافة وحدة جديدة: أنشئ ملفاً يتبع عقد الوحدة (انظر ui/layout.js) ثم أضفه هنا.
 */
import media from './media.js';
import cartoon from './cartoon.js';
import kids from './kids.js';
import brand from './brand.js';
import bi from './bi.js';
import evolution from './evolution.js';

export const MODULES = [media, cartoon, kids, brand, bi, evolution];
```


===== FILE: zuvyr-dashboard/js/modules/kids.js =====

```javascript
/** الوحدة 3 · الأطفال والموسيقى: درع الحماية، والتصفية حسب الفئة */
import { h, icon, replace, svg } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { assetsOf, obj, percentFrom, text } from '../core/format.js';
import { emptyState, fileItem, section, stat } from '../ui/parts.js';

const FILTERS = ['all', 'video', 'image', 'script', 'audio', '3d'];

/** حلقة التقدّم الدائرية لنسبة الحماية */
function shieldRing() {
  const arc = svg('circle', { cx: 60, cy: 60, r: 50, class: 'value', pathLength: 100 });
  const ring = h('div', { class: 'ring' },
    svg('svg', { viewBox: '0 0 120 120', 'aria-hidden': 'true' },
      svg('defs', {},
        svg('linearGradient', { id: 'ring-grad', x1: 0, y1: 0, x2: 1, y2: 1 },
          svg('stop', { offset: 0, 'stop-color': '#34d399' }),
          svg('stop', { offset: 1, 'stop-color': '#22d3ee' }))),
      svg('circle', { cx: 60, cy: 60, r: 50, class: 'track' }),
      arc),
    h('span', { class: 'ring-text' }, '—'));
  return { ring, arc, label: ring.querySelector('.ring-text') };
}

export default {
  id: 'kids',
  icon: 'shield',
  titleKey: 'mod.kids.title',
  subKey: 'mod.kids.sub',
  shortKey: 'mod.kids.short',

  mount(body) {
    const st = { filter: 'all', assets: [] };
    const { ring, arc, label: ringLabel } = shieldRing();

    const protocolStat = stat('kids.protocol');
    const musicStat = stat('kids.music');
    const rawEl = h('p', { class: 'note', dir: 'auto' });
    const filtersEl = h('div', { class: 'chips' });
    const listEl = h('div', { class: 'list' });

    body.append(
      section('kids.shield'),
      h('div', { class: 'shield' },
        ring,
        h('div', { class: 'shield-copy' },
          h('div', { class: 'stats' }, protocolStat.el, musicStat.el),
          rawEl)),
      section('kids.filter'),
      filtersEl,
      section('kids.content'),
      listEl,
    );

    function paintFilters() {
      const counts = { all: st.assets.length };
      for (const asset of st.assets) counts[asset.type] = (counts[asset.type] ?? 0) + 1;

      replace(filtersEl, FILTERS.map((id) => h('button', {
        type: 'button',
        class: 'chip',
        'aria-pressed': String(st.filter === id),
        onclick: () => {
          st.filter = id;
          paintFilters();
          paintList();
        },
      }, id === 'all' ? t('kids.f.all') : t(`type.${id}`), h('span', { class: 'count' }, String(counts[id] ?? 0)))));
    }

    function paintList() {
      const shown = st.filter === 'all' ? st.assets : st.assets.filter((a) => a.type === st.filter);
      replace(listEl, shown.length
        ? shown.map((a) => fileItem({ name: a.name }))
        : emptyState(st.assets.length ? t('kids.noCategory') : t('kids.noAssets'), 'inbox'));
    }

    return {
      render(state) {
        const data = obj(state.data);
        const raw = text(obj(data.schedules_and_timing).kids_content_filter, '');
        const pct = percentFrom(raw);
        const protectedOn = /kids\s*safe/i.test(raw) && /enabled|active/i.test(raw);
        const musicOn = /no\s*copyright/i.test(raw);

        arc.style.strokeDasharray = `${pct ?? 0} 100`;
        ringLabel.textContent = pct === null ? '—' : `${pct}%`;
        protocolStat.value.textContent = raw ? t(protectedOn ? 'kids.protocolOn' : 'kids.protocolOff') : '—';
        musicStat.value.textContent = musicOn ? t('kids.musicOn') : '—';
        rawEl.textContent = raw ? `${t('kids.raw')}: ${raw}` : '';

        st.assets = assetsOf(data);
        paintFilters();
        paintList();

        if (protectedOn) return { tone: 'ok', key: 'state.protected' };
        return raw ? { tone: 'warn', key: 'state.off' } : { tone: '', key: 'state.empty' };
      },
    };
  },
};
```


===== FILE: zuvyr-dashboard/js/modules/media.js =====

```javascript
/** الوحدة 1 · محرك الوسائط اللامتناهي: السيناريوهات واللغات المدعومة */
import { h, icon, replace } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { LANGUAGE_NAMES, list, obj } from '../core/format.js';
import { emptyState, fileItem, note, section } from '../ui/parts.js';

export default {
  id: 'media',
  icon: 'film',
  titleKey: 'mod.media.title',
  subKey: 'mod.media.sub',
  shortKey: 'mod.media.short',

  mount(body) {
    const st = { scripts: [], langs: [], selected: null, lang: null };

    const scriptsEl = h('div', { class: 'list' });
    const langsEl = h('div', { class: 'seg', role: 'group', 'data-i18n-aria': 'media.languages' });
    const previewTitle = h('span', { class: 'fname' });
    const previewText = h('p');
    const previewEl = h('div', { class: 'script-preview' }, previewTitle, previewText);

    const translateBtn = h('button', { type: 'button', class: 'btn btn-primary', disabled: true, 'data-i18n-title': 'media.translateHint' },
      icon('globe', 'ico-sm'),
      h('span', { 'data-i18n': 'media.translate' }, t('media.translate')));

    body.append(
      section('media.scripts'),
      scriptsEl,
      section('media.languages'),
      langsEl,
      section('media.preview'),
      previewEl,
      h('div', { class: 'row' }, translateBtn, h('span', { class: 'hint', 'data-i18n': 'media.translateHint' }, t('media.translateHint'))),
    );

    function paint() {
      replace(scriptsEl, st.scripts.length
        ? st.scripts.map((name) => fileItem({
          name,
          active: name === st.selected,
          onClick: () => {
            st.selected = name;
            paint();
          },
        }))
        : emptyState(t('media.noScripts'), 'doc'));

      replace(langsEl, st.langs.length
        ? st.langs.map((code) => h('button', {
          type: 'button',
          'aria-pressed': String(code === st.lang),
          onclick: () => {
            st.lang = code;
            paint();
          },
        }, LANGUAGE_NAMES[code] ?? code))
        : h('span', { class: 'note' }, t('media.noLanguages')));

      previewTitle.textContent = st.selected ?? '—';
      previewText.textContent = st.selected
        ? t('media.previewBody', { lang: LANGUAGE_NAMES[st.lang] ?? st.lang ?? '—' })
        : t('media.noSelection');
    }

    return {
      render(state) {
        const data = obj(state.data);
        st.scripts = list(data.scripts_pool_list).map(String);
        st.langs = list(data.languages_supported).map((code) => String(code).toUpperCase());
        if (!st.scripts.includes(st.selected)) st.selected = st.scripts[0] ?? null;
        if (!st.langs.includes(st.lang)) st.lang = st.langs[0] ?? null;
        paint();

        return st.scripts.length
          ? { tone: 'ok', key: 'state.ready' }
          : { tone: '', key: 'state.empty' };
      },
    };
  },
};
```


===== FILE: zuvyr-dashboard/js/locales/ar.js =====

```javascript
/* الترجمة العربية (الافتراضية). المفاتيح مشتركة مع en.js */
export default {
  'a11y.skip': 'تخطَّ إلى المحتوى',

  'app.product': 'True Automation Core',

  'topbar.connecting': 'جارٍ الاتصال',
  'topbar.online': 'متصل',
  'topbar.offline': 'غير متصل',
  'topbar.updated': 'آخر تحديث {time}',
  'topbar.never': 'لم يتم التحديث بعد',
  'topbar.refresh': 'تحديث',
  'topbar.language': 'اللغة',
  'topbar.theme': 'تبديل المظهر',
  'topbar.settings': 'الإعدادات',

  'hero.eyebrow': 'Multi-Agent Control · 2026',
  'hero.title': 'مركز قيادة الأتمتة',
  'hero.titleAccent': 'ZUVYR',
  'hero.lead': 'ستة محركات مستقلة تعمل كفريق واحد: الوسائط، الرسوم المتحركة، الأطفال والموسيقى، العلامة البصرية، ذكاء الأعمال، والتطور الذاتي.',
  'hero.version': 'الإصدار',
  'hero.style': 'النمط',
  'hero.gateway': 'المصدر',

  'kpi.videos': 'فيديوهات في المستودع',
  'kpi.scripts': 'سيناريوهات',
  'kpi.languages': 'لغات مدعومة',
  'kpi.kids': 'حماية الأطفال',

  'nav.label': 'وحدات النظام',

  'state.loading': 'جارٍ التحميل',
  'state.ready': 'جاهز',
  'state.live': 'مباشر',
  'state.idle': 'خامل',
  'state.empty': 'لا بيانات',
  'state.offline': 'الخادم غير متصل',
  'state.pending': 'بانتظار البيانات',
  'state.protected': 'محمي',
  'state.off': 'متوقف',
  'state.active': 'نشط',
  'state.connected': 'متصل',
  'state.unavailable': 'غير مفعّل',

  'mod.media.title': 'محرك الوسائط اللامتناهي',
  'mod.media.short': 'الوسائط',
  'mod.media.sub': 'Infinite Media Engine',
  'mod.cartoon.title': 'محرك الرسوم المتحركة',
  'mod.cartoon.short': 'الرسوم المتحركة',
  'mod.cartoon.sub': 'Cartoon Animation Engine',
  'mod.kids.title': 'الأطفال والموسيقى',
  'mod.kids.short': 'الأطفال',
  'mod.kids.sub': 'Kids & Music Core',
  'mod.brand.title': 'العلامة والصور المصغّرة',
  'mod.brand.short': 'العلامة',
  'mod.brand.sub': 'Branding & Thumbnail Engine',
  'mod.bi.title': 'ذكاء الأعمال اللامتناهي',
  'mod.bi.short': 'ذكاء الأعمال',
  'mod.bi.sub': 'Infinite Business Intelligence',
  'mod.evo.title': 'المُنسِّق ذاتي التطور',
  'mod.evo.short': 'التطور الذاتي',
  'mod.evo.sub': 'Self-Evolution Orchestrator',

  'media.scripts': 'ملفات السيناريو · scripts_pool',
  'media.languages': 'اللغات المدعومة',
  'media.preview': 'المعاينة',
  'media.noScripts': 'لا توجد سيناريوهات في scripts_pool بعد.',
  'media.noLanguages': 'لم تُرجع اللغات المدعومة.',
  'media.previewBody': 'اللغة المختارة: {lang}. عرض النص وترجمته الفورية يحتاجان نقطة خدمة للنصوص غير موجودة في الـ Gateway الحالي.',
  'media.noSelection': 'لا يوجد سيناريو محدد.',
  'media.translate': 'ترجمة فورية',
  'media.translateHint': 'تتطلب نقطة خدمة الترجمة',

  'cartoon.clips': 'الكليبات الكرتونية · videos_pool',
  'cartoon.noClips': 'لا توجد كليبات فيديو في القائمة.',
  'cartoon.watched': 'دقائق المشاهدة',
  'cartoon.minutes': 'دقيقة',
  'cartoon.reset': 'تصفير',
  'cartoon.schedule': 'الجدول الزمني',
  'cartoon.shorts': 'Shorts / Reels',
  'cartoon.long': 'فيديوهات طويلة',
  'cartoon.clipLength': 'مدة الكليب',
  'cartoon.format': 'الصيغة',
  'cartoon.formatValue': 'MP4 · عمودي 1080×1920',
  'cartoon.error': 'تعذّر تشغيل الملف. تأكد من وجوده في videos_pool أو من ضبط ZUVYR_MEDIA_ROOT في الخادم.',

  'kids.shield': 'درع حماية الأطفال',
  'kids.protocol': 'البروتوكول',
  'kids.protocolOn': 'فعّال',
  'kids.protocolOff': 'غير مفعّل',
  'kids.music': 'موسيقى بلا حقوق',
  'kids.musicOn': 'مفعّل',
  'kids.raw': 'القيمة من الـ Gateway',
  'kids.filter': 'تصفية الفئات',
  'kids.content': 'المحتوى',
  'kids.noCategory': 'لا توجد ملفات في هذه الفئة ضمن الـ Gateway الحالي.',
  'kids.noAssets': 'لا توجد أصول مدرجة بعد.',

  'brand.resolution': 'الدقة',
  'brand.platform': 'المنصة',
  'brand.shadow': 'النص المظلل',
  'brand.shadowOn': 'مفعّل',
  'brand.style': 'النمط',
  'brand.styleValue': 'Cinematic Neon High-Contrast',
  'brand.sample': 'معاينة النمط',
  'brand.gallery': 'معرض الصور المصغّرة',
  'brand.missing': 'الملف غير موجود محلياً',
  'brand.noImages': 'لا توجد صور مصغّرة في القائمة.',
  'brand.close': 'إغلاق',
  'brand.prev': 'الصورة السابقة',
  'brand.next': 'الصورة التالية',

  'bi.counters': 'عدادات حيّة',
  'bi.views': 'المشاهدات',
  'bi.rpm': 'RPM',
  'bi.adsense': 'أرباح الأدسنس',
  'bi.affiliate': 'عوائد الأفلييت',
  'bi.pendingRpm': 'بانتظار التتبع الحي',
  'bi.integrations': 'التكاملات',
  'bi.adsenseName': 'Google AdSense',
  'bi.docs': 'مستندات الاستراتيجية',
  'bi.noDocs': 'لا توجد مستندات مالية أو استراتيجية في القائمة.',
  'bi.note': 'تظهر الأرقام تلقائياً حين يُرجع الـ Gateway الحقول views و rpm و adsense_earnings و affiliate_earnings كقيم رقمية.',

  'evo.status': 'الحالة',
  'evo.shield': 'درع الأمان',
  'evo.antiBot': 'Anti-Bot',
  'evo.userAgent': 'User-Agent الحالي',
  'evo.copy': 'نسخ',
  'evo.copied': 'تم النسخ',
  'evo.source': 'المصدر',
  'evo.sourceValue': 'Dynamic Trend Scraping عبر DuckDuckGo HTML · yt-dlp',
  'evo.run': 'تشغيل المحرك الرئيسي',
  'evo.running': 'جارٍ التطوير والتحديث…',
  'evo.log': 'سجل التشغيل',
  'evo.clear': 'مسح',
  'evo.logEmpty': 'جاهز. بانتظار تشغيل المحرك الرئيسي…',
  'evo.started': 'بدء تشغيل المحرك الرئيسي…',
  'evo.done': 'اكتمل التشغيل بنجاح.',
  'evo.unavailable': 'مسار التشغيل {path} غير موجود في الـ Gateway الحالي (404). أضف هذا المسار في الخادم لتفعيل الزر.',
  'evo.failed': 'فشل التشغيل — HTTP {status}',
  'evo.network': 'تعذّر الاتصال بالخادم: {message}',
  'evo.orbIdle': 'في وضع الاستعداد',
  'evo.orbRunning': 'يُطوّر الآن',
  'evo.orbDone': 'اكتمل التطور',
  'evo.orbError': 'توقّف التشغيل',

  'settings.title': 'الإعدادات',
  'settings.close': 'إغلاق',
  'settings.refresh': 'فترة التحديث التلقائي',
  'settings.off': 'إيقاف',
  'settings.modules': 'الوحدات الظاهرة',
  'settings.reset': 'استعادة الافتراضي',
  'settings.saved': 'تُحفظ التفضيلات في هذا المتصفح.',

  'footer.text': 'ZUVYR · لوحة قيادة الأتمتة',

  'toast.refreshed': 'تم تحديث البيانات',
  'toast.offline': 'تعذّر الاتصال بالـ Gateway',
  'toast.copied': 'تم نسخ السطر',
  'toast.logCleared': 'تم مسح السجل',
  'type.video': 'فيديو',
  'type.image': 'صورة',
  'type.script': 'نص',
  'type.audio': 'صوت',
  'type.3d': '3D',
  'type.other': 'ملف',
  'kids.f.all': 'الكل',
  'settings.atLeastOne': 'يجب أن تبقى وحدة واحدة على الأقل ظاهرة.',
};
```


===== FILE: zuvyr-dashboard/js/locales/en.js =====

```javascript
/* English locale. Keys mirror ar.js exactly. */
export default {
  'a11y.skip': 'Skip to content',

  'app.product': 'True Automation Core',

  'topbar.connecting': 'Connecting',
  'topbar.online': 'Online',
  'topbar.offline': 'Offline',
  'topbar.updated': 'Updated {time}',
  'topbar.never': 'Not updated yet',
  'topbar.refresh': 'Refresh',
  'topbar.language': 'Language',
  'topbar.theme': 'Toggle theme',
  'topbar.settings': 'Settings',

  'hero.eyebrow': 'Multi-Agent Control · 2026',
  'hero.title': 'Automation Command Center',
  'hero.titleAccent': 'ZUVYR',
  'hero.lead': 'Six autonomous engines working as one team: media, animation, kids & music, branding, business intelligence and self-evolution.',
  'hero.version': 'Version',
  'hero.style': 'Style',
  'hero.gateway': 'Source',

  'kpi.videos': 'Videos in repository',
  'kpi.scripts': 'Scripts',
  'kpi.languages': 'Supported languages',
  'kpi.kids': 'Kids protection',

  'nav.label': 'System modules',

  'state.loading': 'Loading',
  'state.ready': 'Ready',
  'state.live': 'Live',
  'state.idle': 'Idle',
  'state.empty': 'No data',
  'state.offline': 'Server offline',
  'state.pending': 'Awaiting data',
  'state.protected': 'Protected',
  'state.off': 'Off',
  'state.active': 'Active',
  'state.connected': 'Connected',
  'state.unavailable': 'Not enabled',

  'mod.media.title': 'Infinite Media Engine',
  'mod.media.short': 'Media',
  'mod.media.sub': 'Scripts · Multilingual',
  'mod.cartoon.title': 'Cartoon Animation Engine',
  'mod.cartoon.short': 'Animation',
  'mod.cartoon.sub': 'Shorts · Long-form · 9:16',
  'mod.kids.title': 'Kids & Music Core',
  'mod.kids.short': 'Kids',
  'mod.kids.sub': 'Safety · Licensing · 3D',
  'mod.brand.title': 'Branding & Thumbnail Engine',
  'mod.brand.short': 'Branding',
  'mod.brand.sub': 'Thumbnails · 1280×720',
  'mod.bi.title': 'Infinite Business Intelligence',
  'mod.bi.short': 'Business',
  'mod.bi.sub': 'Revenue · Views · RPM',
  'mod.evo.title': 'Self-Evolution Orchestrator',
  'mod.evo.short': 'Evolution',
  'mod.evo.sub': 'Master run · Anti-bot shield',

  'media.scripts': 'Script files · scripts_pool',
  'media.languages': 'Supported languages',
  'media.preview': 'Preview',
  'media.noScripts': 'No scripts in scripts_pool yet.',
  'media.noLanguages': 'No supported languages returned.',
  'media.previewBody': 'Selected language: {lang}. Viewing and instantly translating the script requires a script service endpoint that the current Gateway does not expose.',
  'media.noSelection': 'No script selected.',
  'media.translate': 'Instant translation',
  'media.translateHint': 'Requires the translation service endpoint',

  'cartoon.clips': 'Animated clips · videos_pool',
  'cartoon.noClips': 'No video clips in the list.',
  'cartoon.watched': 'Watch minutes',
  'cartoon.minutes': 'min',
  'cartoon.reset': 'Reset',
  'cartoon.schedule': 'Schedule',
  'cartoon.shorts': 'Shorts / Reels',
  'cartoon.long': 'Long videos',
  'cartoon.clipLength': 'Clip length',
  'cartoon.format': 'Format',
  'cartoon.formatValue': 'MP4 · Vertical 1080×1920',
  'cartoon.error': 'Could not play the file. Make sure it exists in videos_pool or set ZUVYR_MEDIA_ROOT on the server.',

  'kids.shield': 'Kids safety shield',
  'kids.protocol': 'Protocol',
  'kids.protocolOn': 'Active',
  'kids.protocolOff': 'Not enabled',
  'kids.music': 'No-copyright music',
  'kids.musicOn': 'Enabled',
  'kids.raw': 'Value from the Gateway',
  'kids.filter': 'Filter categories',
  'kids.content': 'Content',
  'kids.noCategory': 'No files in this category in the current Gateway.',
  'kids.noAssets': 'No assets listed yet.',

  'brand.resolution': 'Resolution',
  'brand.platform': 'Platform',
  'brand.shadow': 'Text shadow',
  'brand.shadowOn': 'Active',
  'brand.style': 'Style',
  'brand.styleValue': 'Cinematic Neon High-Contrast',
  'brand.sample': 'Style preview',
  'brand.gallery': 'Thumbnail gallery',
  'brand.missing': 'File not found locally',
  'brand.noImages': 'No thumbnails in the list.',
  'brand.close': 'Close',
  'brand.prev': 'Previous image',
  'brand.next': 'Next image',

  'bi.counters': 'Live counters',
  'bi.views': 'Views',
  'bi.rpm': 'RPM',
  'bi.adsense': 'AdSense earnings',
  'bi.affiliate': 'Affiliate revenue',
  'bi.pendingRpm': 'Awaiting live tracking',
  'bi.integrations': 'Integrations',
  'bi.adsenseName': 'Google AdSense',
  'bi.docs': 'Strategy documents',
  'bi.noDocs': 'No financial or strategy documents in the list.',
  'bi.note': 'Numbers appear automatically once the Gateway returns views, rpm, adsense_earnings and affiliate_earnings as numeric values.',

  'evo.status': 'Status',
  'evo.shield': 'Security shield',
  'evo.antiBot': 'Anti-bot',
  'evo.userAgent': 'Current User-Agent',
  'evo.copy': 'Copy',
  'evo.copied': 'Copied',
  'evo.source': 'Source',
  'evo.sourceValue': 'Dynamic trend scraping via DuckDuckGo HTML · yt-dlp',
  'evo.run': 'Run master engine',
  'evo.running': 'Evolving and updating…',
  'evo.log': 'Run log',
  'evo.clear': 'Clear',
  'evo.logEmpty': 'Ready. Waiting for the master run…',
  'evo.started': 'Master run started…',
  'evo.done': 'Run completed successfully.',
  'evo.unavailable': 'Run endpoint {path} is not available on the current Gateway (404). Add it to the server to enable this button.',
  'evo.failed': 'Run failed — HTTP {status}',
  'evo.network': 'Could not reach the server: {message}',
  'evo.orbIdle': 'Standing by',
  'evo.orbRunning': 'Evolving now',
  'evo.orbDone': 'Evolution complete',
  'evo.orbError': 'Run stopped',

  'settings.title': 'Settings',
  'settings.close': 'Close',
  'settings.refresh': 'Auto-refresh interval',
  'settings.off': 'Off',
  'settings.modules': 'Visible modules',
  'settings.reset': 'Restore defaults',
  'settings.saved': 'Preferences are saved in this browser.',

  'footer.text': 'ZUVYR · Automation command center',

  'toast.refreshed': 'Data refreshed',
  'toast.offline': 'Could not reach the Gateway',
  'toast.copied': 'Line copied',
  'toast.logCleared': 'Log cleared',
  'type.video': 'Video',
  'type.image': 'Image',
  'type.script': 'Script',
  'type.audio': 'Audio',
  'type.3d': '3D',
  'type.other': 'File',
  'kids.f.all': 'All',
  'settings.atLeastOne': 'At least one module must stay visible.',
};
```
