(() => {
  'use strict';

  /* ─────────────── Configuration ─────────────── */
  const CONFIG = {
    // نقطة الدخول المحلية. تُمرَّر عبر server.js إلى 127.0.0.1:5000
    endpoint: '/api/zuvyr-dashboard',
    // مسار التشغيل الرئيسي (غير موجود في الـ Gateway الحالي حتى الآن)
    masterRunEndpoint: '/api/zuvyr-dashboard/master-run',
    refreshMs: 15000,
    fetchTimeoutMs: 6000,
    masterRunTimeoutMs: 180000,
  };

  const LANG_NAMES = { AR: 'العربية', EN: 'English (Base)', ES: 'Español', FR: 'Français' };

  const EXT_TYPE = {
    mp4: 'video', mov: 'video', webm: 'video',
    jpg: 'image', jpeg: 'image', png: 'image', webp: 'image',
    txt: 'script', md: 'script',
    mp3: 'audio', wav: 'audio', m4a: 'audio',
    obj: '3d', glb: '3d', gltf: '3d', stl: '3d',
  };
  const TYPE_INFO = {
    video: { label: 'فيديو', cls: 'video' },
    image: { label: 'صورة', cls: 'image' },
    script: { label: 'نص', cls: 'script' },
    audio: { label: 'صوت', cls: 'audio' },
    '3d': { label: '3D', cls: 'k3d' },
    other: { label: 'ملف', cls: '' },
  };

  const ICONS = {
    media: '<path d="M4 5h16v14H4z"/><path d="M10 9l5 3-5 3z"/>',
    cartoon: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
    kids: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>',
    brand: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
    bi: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    evo: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  };

  /* ─────────────── Helpers ─────────────── */
  const $ = (sel, root = document) => root.querySelector(sel);
  const A = (x) => (Array.isArray(x) ? x : []);
  const O = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const S = (x, fb = '—') => (x === undefined || x === null || x === '' ? fb : String(x));

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of kids.flat()) {
      if (c === undefined || c === null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ico');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name] || '';
    return svg;
  }

  const sec = (text) => h('div', { class: 'sec' }, text);
  const empty = (text) => h('div', { class: 'empty' }, text);
  const typeOf = (name) => EXT_TYPE[String(name).split('.').pop().toLowerCase()] || 'other';
  const mediaUrl = (folder, name) => `/media/${folder}/${encodeURIComponent(name)}`;

  function typeTag(name) {
    const info = TYPE_INFO[typeOf(name)];
    return h('span', { class: `tag ${info.cls}` }, info.label);
  }

  function fileItem({ name, tag, active = false, onClick }) {
    return h('button', {
      type: 'button',
      class: 'item' + (active ? ' active' : ''),
      'aria-pressed': onClick ? String(active) : undefined,
      onclick: onClick,
    }, h('span', { class: 'nm', title: name }, name), tag);
  }

  function stat(label, init = '—') {
    const strong = h('strong', { dir: 'auto' }, init);
    return { el: h('div', { class: 'stat' }, h('small', {}, label), strong), strong };
  }

  function tile(label) {
    const v = h('div', { class: 'v', dir: 'auto' }, '—');
    const s = h('div', { class: 's' }, '');
    return { el: h('div', { class: 'tile' }, h('div', { class: 'l' }, label), v, s), v, s };
  }

  function fmtTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '00:00';
    const s = Math.floor(sec);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
  }

  function animateNumber(el, to, fmt) {
    const from = Number(el.dataset.v || 0);
    el.dataset.v = String(to);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) {
      el.textContent = fmt(to);
      return;
    }
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 900);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // قائمة الأصول المادية كما يعيدها الـ Gateway (أسماء ملفات فقط)
  function assetsOf(d) {
    return [
      ...A(d.videos_pool_list).map((n) => ({ name: String(n), folder: 'videos_pool', type: typeOf(n) })),
      ...A(d.scripts_pool_list).map((n) => ({ name: String(n), folder: 'scripts_pool', type: typeOf(n) })),
    ];
  }

  /* ─────────────── Module 1 · Infinite Media Engine ─────────────── */
  function makeMedia(root) {
    const st = { scripts: [], langs: [], selected: null, lang: null };
    const scriptsEl = h('div', { class: 'list' });
    const langsEl = h('div', { class: 'seg', role: 'group', 'aria-label': 'لغة الترجمة' });
    const previewEl = h('p', { class: 'note' });
    const transBtn = h('button', {
      type: 'button', class: 'btn btn-primary', disabled: true,
      title: 'نقطة خدمة الترجمة غير متوفرة في الـ Gateway الحالي',
    }, 'ترجمة فورية');

    root.append(
      sec('ملفات السيناريو · scripts_pool'), scriptsEl,
      sec('اللغات المدعومة'), langsEl,
      sec('المعاينة'), previewEl,
      h('div', { class: 'row' }, transBtn),
    );

    function render() {
      scriptsEl.replaceChildren(...(st.scripts.length
        ? st.scripts.map((n) => fileItem({
          name: n, tag: typeTag(n), active: n === st.selected,
          onClick: () => { st.selected = n; render(); },
        }))
        : [empty('لا توجد سيناريوهات في scripts_pool بعد.')]));

      langsEl.replaceChildren(...(st.langs.length
        ? st.langs.map((l) => h('button', {
          type: 'button', 'aria-pressed': String(l === st.lang),
          onclick: () => { st.lang = l; render(); },
        }, LANG_NAMES[l] || l))
        : [h('span', { class: 'note' }, 'لم تُرجع اللغات المدعومة.')]));

      const langLabel = LANG_NAMES[st.lang] || st.lang || '—';
      previewEl.textContent = st.selected
        ? `السيناريو: ${st.selected} · اللغة المختارة: ${langLabel}. عرض النص وترجمته الفورية يحتاجان نقطة خدمة للنصوص غير موجودة في الـ Gateway الحالي.`
        : 'لا يوجد سيناريو محدد.';
    }

    return {
      update(d) {
        st.scripts = A(d.scripts_pool_list).map(String);
        st.langs = A(d.languages_supported).map((l) => String(l).toUpperCase());
        if (!st.scripts.includes(st.selected)) st.selected = st.scripts[0] || null;
        if (!st.langs.includes(st.lang)) st.lang = st.langs[0] || null;
        render();
      },
    };
  }

  /* ─────────────── Module 2 · Cartoon Animation Engine ─────────────── */
  function makeCartoon(root) {
    const st = { videos: [], selected: null, watched: 0, last: 0 };

    const player = h('video', { class: 'player', controls: true, playsinline: true, preload: 'metadata' });
    const noteEl = h('p', { class: 'note', 'aria-live': 'polite' });
    const chipsEl = h('div', { class: 'chips' });

    const counterEl = h('div', { class: 'counter' }, '00:00');
    const minutesEl = h('small', { class: 'note' }, '0.00 دقيقة');
    const resetBtn = h('button', {
      type: 'button', class: 'btn btn-ghost',
      onclick: () => { st.watched = 0; renderCounter(); },
    }, 'تصفير العداد');

    const clipDur = stat('مدة الكليب');
    const shortsStat = stat('Shorts / Reels');
    const longStat = stat('Long Videos');
    const formatStat = stat('الصيغة', 'MP4 · عمودي 1080×1920');

    root.append(
      sec('الكليبات الكرتونية'), chipsEl,
      player, noteEl,
      sec('عداد دقائق المشاهدة'),
      h('div', { class: 'row space' }, h('div', {}, counterEl, minutesEl), resetBtn),
      sec('الجدول الزمني'),
      h('div', { class: 'stats' }, shortsStat.el, longStat.el, clipDur.el, formatStat.el),
    );

    function renderCounter() {
      counterEl.textContent = fmtTime(st.watched);
      minutesEl.textContent = `${(st.watched / 60).toFixed(2)} دقيقة`;
    }

    function select(name) {
      st.selected = name;
      st.last = 0;
      noteEl.textContent = '';
      player.src = mediaUrl('videos_pool', name);
      player.load();
      render();
    }

    function render() {
      chipsEl.replaceChildren(...(st.videos.length
        ? st.videos.map((v) => h('button', {
          type: 'button', class: 'chip', 'aria-pressed': String(v.name === st.selected),
          onclick: () => select(v.name),
        }, v.name))
        : [h('span', { class: 'note' }, 'لا توجد كليبات فيديو في القائمة.')]));
    }

    player.addEventListener('loadedmetadata', () => {
      clipDur.strong.textContent = `${fmtTime(player.duration)} · ${(player.duration / 60).toFixed(2)} د`;
      player.classList.toggle('vertical', player.videoHeight > player.videoWidth);
      st.last = player.currentTime;
    });
    player.addEventListener('play', () => { st.last = player.currentTime; });
    player.addEventListener('seeking', () => { st.last = player.currentTime; });
    player.addEventListener('timeupdate', () => {
      const delta = player.currentTime - st.last;
      if (delta > 0 && delta < 2) { st.watched += delta; renderCounter(); }
      st.last = player.currentTime;
    });
    player.addEventListener('error', () => {
      if (st.selected) noteEl.textContent = 'تعذّر تشغيل الملف. تأكد من وجوده في videos_pool أو من ضبط ZUVYR_MEDIA_ROOT في الخادم.';
    });

    renderCounter();

    return {
      update(d) {
        const sch = O(d.schedules_and_timing);
        st.videos = assetsOf(d).filter((a) => a.folder === 'videos_pool' && a.type === 'video');
        if (!st.videos.some((v) => v.name === st.selected)) {
          if (st.videos.length) select(st.videos[0].name);
          else { st.selected = null; render(); }
        } else {
          render();
        }
        shortsStat.strong.textContent = S(sch.shorts_reels_duration);
        longStat.strong.textContent = S(sch.long_videos_duration);
      },
    };
  }

  /* ─────────────── Module 3 · Kids & Music Core ─────────────── */
  const KID_FILTERS = [
    { id: 'all', label: 'الكل' },
    { id: 'video', label: 'فيديو' },
    { id: 'image', label: 'صور' },
    { id: 'script', label: 'نصوص' },
    { id: 'audio', label: 'موسيقى / صوت' },
    { id: '3d', label: 'مجسمات 3D' },
  ];

  function makeKids(root) {
    const st = { filter: 'all', assets: [] };
    const safetyEl = h('div', { class: 'stats' });
    const protoStat = stat('بروتوكول الأطفال');
    const percentStat = stat('نسبة الحماية');
    const musicStat = stat('موسيقى بدون حقوق');
    const barEl = h('i');
    const rawEl = h('p', { class: 'note', dir: 'auto' });
    const filtersEl = h('div', { class: 'chips' });
    const listEl = h('div', { class: 'list' });

    safetyEl.append(protoStat.el, percentStat.el, musicStat.el);
    root.append(
      sec('مراقبة الأمان'), safetyEl,
      h('div', { class: 'bar', role: 'meter', 'aria-label': 'نسبة الحماية' }, barEl),
      rawEl,
      sec('تصفية الفئات'), filtersEl,
      sec('المحتوى'), listEl,
    );

    function render() {
      const counts = Object.fromEntries(KID_FILTERS.map((f) => [f.id, 0]));
      counts.all = st.assets.length;
      for (const a of st.assets) counts[a.type] = (counts[a.type] || 0) + 1;

      filtersEl.replaceChildren(...KID_FILTERS.map((f) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(st.filter === f.id),
        onclick: () => { st.filter = f.id; render(); },
      }, `${f.label} (${counts[f.id] || 0})`)));

      const shown = st.filter === 'all' ? st.assets : st.assets.filter((a) => a.type === st.filter);
      listEl.replaceChildren(...(shown.length
        ? shown.map((a) => h('div', { class: 'item', role: 'listitem' },
          h('span', { class: 'nm', title: a.name }, a.name), typeTag(a.name)))
        : [empty(st.assets.length ? 'لا توجد ملفات في هذه الفئة ضمن الـ Gateway الحالي.' : 'لا توجد أصول مدرجة بعد.')]));
    }

    return {
      update(d) {
        const sch = O(d.schedules_and_timing);
        const raw = S(sch.kids_content_filter, '');
        const pct = raw.match(/(\d{1,3})\s*%/);
        const enabled = /kids\s*safe/i.test(raw) && /enabled|active/i.test(raw);

        protoStat.strong.textContent = raw ? (enabled ? 'فعّال' : 'غير مفعّل') : '—';
        percentStat.strong.textContent = pct ? `${pct[1]}%` : '—';
        musicStat.strong.textContent = /no\s*copyright/i.test(raw) ? 'مفعّل' : '—';
        barEl.style.width = pct ? `${Math.min(100, Number(pct[1]))}%` : '0%';
        rawEl.textContent = raw ? `القيمة من الـ Gateway: ${raw}` : '';

        st.assets = assetsOf(d);
        render();
      },
    };
  }

  /* ─────────────── Module 4 · Branding & Thumbnail Engine ─────────────── */
  function makeBrand(root) {
    const gallery = h('div', { class: 'gallery' });
    const resStat = stat('الدقة', '1280×720');
    const platStat = stat('المنصة', 'YouTube Global');
    const shadowStat = stat('النص المظلل', 'Drop Shadow Active');

    root.append(
      h('div', { class: 'stats' }, resStat.el, platStat.el, shadowStat.el),
      h('p', { class: 'note' }, 'النمط: Cinematic Neon High-Contrast'),
      sec('معرض الصور المصغّرة'),
      gallery,
    );

    return {
      update(d) {
        const images = assetsOf(d).filter((a) => a.type === 'image');
        gallery.replaceChildren(...(images.length
          ? images.map((a) => {
            const src = mediaUrl(a.folder, a.name);
            return h('button', {
              type: 'button', class: 'thumb', title: a.name,
              onclick: () => openLightbox(src, a.name),
            },
            h('img', {
              src, alt: a.name, loading: 'lazy',
              onerror: (e) => e.target.replaceWith(h('div', { class: 'missing' }, 'الملف غير موجود محلياً')),
            }),
            h('span', { class: 'cap' }, a.name));
          })
          : [empty('لا توجد صور مصغّرة في القائمة.')]));
      },
    };
  }

  /* ─────────────── Module 5 · Infinite Business Intelligence ─────────────── */
  const BUSINESS_RE = /business|financial|strategy|report/i;

  function makeBI(root) {
    const views = tile('المشاهدات');
    const rpm = tile('RPM');
    const adsense = tile('أرباح الأدسنس');
    const affiliate = tile('عوائد الأفلييت');
    const integEl = h('div', { class: 'list' });
    const docsEl = h('div', { class: 'list' });

    root.append(
      sec('عدادات حيّة'),
      h('div', { class: 'tiles' }, views.el, rpm.el, adsense.el, affiliate.el),
      sec('التكاملات'), integEl,
      sec('مستندات الاستراتيجية'), docsEl,
      h('p', { class: 'note' }, 'تظهر الأرقام تلقائياً عندما يرجع الـ Gateway الحقول views و rpm و adsense_earnings و affiliate_earnings كقيم رقمية.'),
    );

    const numFmt = (digits) => (n) => Number(n).toLocaleString('en-US', {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    });

    function setNumberOrStatus(t, value, status, digits) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        animateNumber(t.v, value, numFmt(digits));
      } else {
        t.v.textContent = '—';
        t.v.dataset.v = '0';
      }
      t.s.textContent = S(status, '');
    }

    return {
      update(d) {
        const fin = O(d.financial_analytics);
        setNumberOrStatus(views, fin.views, fin.views_growth, 0);
        setNumberOrStatus(rpm, fin.rpm, 'Pending Live Tracking', 2);
        setNumberOrStatus(adsense, fin.adsense_earnings, d.adsense_status, 2);
        setNumberOrStatus(affiliate, fin.affiliate_earnings, fin.affiliate_revenue_sync, 2);

        const connected = /connected/i.test(S(d.adsense_status, ''));
        integEl.replaceChildren(
          h('div', { class: 'item' },
            h('span', { class: 'nm' }, 'Google AdSense'),
            h('span', { class: 'tag ' + (connected ? 'ok' : '') }, S(d.adsense_status, 'غير متصل'))),
        );

        const docs = assetsOf(d).filter((a) => a.folder === 'scripts_pool' && BUSINESS_RE.test(a.name));
        docsEl.replaceChildren(...(docs.length
          ? docs.map((a) => fileItem({ name: a.name, tag: typeTag(a.name) }))
          : [empty('لا توجد مستندات مالية أو استراتيجية في القائمة.')]));
      },
    };
  }

  /* ─────────────── Module 6 · Self-Evolution Orchestrator ─────────────── */
  function makeEvo(root) {
    const st = { running: false, online: false };
    const statusTag = h('span', { class: 'tag' });
    const shieldTag = h('span', { class: 'tag' });
    const uaEl = h('code', { class: 'code' });
    const logEl = h('pre', { class: 'log', 'aria-live': 'polite' }, 'جاهز. بانتظار تشغيل المحرك الرئيسي…');
    const btn = h('button', { type: 'button', class: 'masterbtn', disabled: true }, 'تشغيل المحرك الرئيسي', h('small', {}, 'MASTER RUN'));

    const log = (msg) => {
      logEl.textContent += `\n[${new Date().toLocaleTimeString('en-GB')}] ${msg}`;
      logEl.scrollTop = logEl.scrollHeight;
    };

    function setBtn(label, running) {
      btn.classList.toggle('running', running);
      btn.replaceChildren(label, h('small', {}, running ? 'RUNNING' : 'MASTER RUN'));
    }

    async function runMaster() {
      if (st.running || !st.online) return;
      st.running = true;
      btn.disabled = true;
      setBtn('جارٍ التطوير والتحديث…', true);
      log('بدء تشغيل المحرك الرئيسي…');
      try {
        const res = await fetch(CONFIG.masterRunEndpoint, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(CONFIG.masterRunTimeoutMs),
        });
        const text = await res.text();
        if (res.status === 404) {
          log(`مسار التشغيل ${CONFIG.masterRunEndpoint} غير موجود في الـ Gateway الحالي (404). أضف هذا المسار في الخادم لتفعيل الزر.`);
        } else if (!res.ok) {
          log(`فشل التشغيل — HTTP ${res.status}: ${text.slice(0, 300)}`);
        } else {
          log(`تم التشغيل:\n${text.slice(0, 2000)}`);
        }
      } catch (err) {
        log(`تعذّر الاتصال بالخادم: ${err.message || err}`);
      } finally {
        st.running = false;
        setBtn('تشغيل المحرك الرئيسي', false);
        btn.disabled = !st.online;
      }
    }
    btn.addEventListener('click', runMaster);

    root.append(
      sec('الحالة'),
      h('div', { class: 'row' }, statusTag),
      sec('درع الأمان'),
      h('div', { class: 'row' }, h('span', { class: 'note' }, 'Anti-Bot:'), shieldTag),
      h('div', { class: 'row' }, h('span', { class: 'note' }, 'User-Agent الحالي:')),
      uaEl,
      sec('المصدر'),
      h('p', { class: 'note' }, 'Dynamic Trend Scraping عبر DuckDuckGo HTML · yt-dlp'),
      btn,
      sec('سجل التشغيل'),
      logEl,
    );

    return {
      update(d, online) {
        st.online = Boolean(online);
        const sg = O(d.security_gate);
        const evo = S(d.self_evolution_status, '');
        statusTag.textContent = evo;
        statusTag.className = 'tag' + (/active/i.test(evo) ? ' ok' : '');
        shieldTag.textContent = S(sg.anti_bot_protection);
        shieldTag.className = 'tag' + (/enabled/i.test(S(sg.anti_bot_protection, '')) ? ' ok' : '');
        uaEl.textContent = S(sg.current_spoofed_agent);
        uaEl.title = S(sg.current_spoofed_agent, '');
        if (!st.running) btn.disabled = !st.online;
      },
    };
  }

  const FACTORIES = { media: makeMedia, cartoon: makeCartoon, kids: makeKids, brand: makeBrand, bi: makeBI, evo: makeEvo };

  const MODULES = [
    { key: 'media', no: 1, title: 'محرك الوسائط اللامتناهي', en: 'Infinite Media Engine', icon: 'media' },
    { key: 'cartoon', no: 2, title: 'محرك الرسوم المتحركة', en: 'Cartoon Animation Engine', icon: 'cartoon' },
    { key: 'kids', no: 3, title: 'الأطفال والموسيقى', en: 'Kids & Music Core', icon: 'kids' },
    { key: 'brand', no: 4, title: 'العلامة والصور المصغّرة', en: 'Branding & Thumbnail Engine', icon: 'brand' },
    { key: 'bi', no: 5, title: 'ذكاء الأعمال اللامتناهي', en: 'Infinite Business Intelligence', icon: 'bi' },
    { key: 'evo', no: 6, title: 'المُنسِّق ذاتي التطور', en: 'Self-Evolution Orchestrator', icon: 'evo' },
  ];

  /* ─────────────── Shell & lifecycle ─────────────── */
  const state = { data: null, online: false };
  const controllers = [];

  function buildShell() {
    const nav = $('#modnav');
    const grid = $('#grid');

    for (const m of MODULES) {
      nav.append(h('a', { class: 'navbtn', href: `#card-${m.key}` },
        h('span', { class: 'navno' }, String(m.no)), m.title));

      const body = h('div', { class: 'card-body' });
      const card = h('section', { class: 'card', id: `card-${m.key}`, 'aria-labelledby': `t-${m.key}` },
        h('header', { class: 'card-head' },
          h('div', { class: 'card-ico' }, icon(m.icon)),
          h('div', { class: 'card-titles' },
            h('h2', { id: `t-${m.key}` }, m.title),
            h('p', { class: 'en' }, m.en)),
          h('span', { class: 'card-no' }, `0${m.no}`)),
        body);
      grid.append(card);
      controllers.push({ key: m.key, ctrl: FACTORIES[m.key](body) });
    }

    const lb = $('#lightbox');
    lb.querySelector('.close').addEventListener('click', () => lb.close());
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
  }

  function openLightbox(src, caption) {
    const lb = $('#lightbox');
    const img = lb.querySelector('img');
    img.src = src;
    img.alt = caption;
    $('#lbcap').textContent = caption;
    lb.showModal();
  }

  function setConn(kind, text) {
    const pill = $('#conn');
    pill.className = `pill ${kind}`;
    pill.lastElementChild.textContent = text;
  }

  function renderKpis(d) {
    const assets = assetsOf(d);
    const kids = S(O(d.schedules_and_timing).kids_content_filter, '');
    const items = [
      [assets.filter((a) => a.type === 'video').length, 'فيديوهات'],
      [A(d.scripts_pool_list).length, 'سيناريوهات'],
      [A(d.languages_supported).length, 'لغات مدعومة'],
      [/kids\s*safe/i.test(kids) ? 'فعّالة' : '—', 'حماية الأطفال'],
    ];
    $('#kpis').replaceChildren(...items.map(([v, l]) => h('div', { class: 'kpi' }, h('b', { dir: 'auto' }, String(v)), h('span', {}, l))));
  }

  async function load() {
    const btn = $('#refresh');
    btn.disabled = true;
    try {
      const res = await fetch(CONFIG.endpoint, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(CONFIG.fetchTimeoutMs),
      });
      if (!res.ok) {
        let serverMsg = null;
        try { serverMsg = (await res.json()).message || null; } catch { /* ليس JSON */ }
        const err = new Error(serverMsg || `HTTP ${res.status}`);
        err.fromServer = Boolean(serverMsg);
        throw err;
      }
      const json = await res.json();
      state.data = json;
      state.online = true;
      setConn('on', `متصل · ${S(json.status, 'ONLINE')}`);
    } catch (err) {
      state.data = null;
      state.online = false;
      const hint = err.fromServer ? '' : '. شغّل الخادم والـ Gateway على 127.0.0.1:5000';
      setConn('off', `غير متصل — ${err.message || err}${hint}`);
    } finally {
      btn.disabled = false;
    }

    $('#updated').textContent = `آخر تحديث: ${new Date().toLocaleTimeString('en-GB')}`;
    const d = O(state.data);
    renderKpis(d);
    for (const { key, ctrl } of controllers) {
      try {
        ctrl.update(d, state.online);
      } catch (err) {
        console.error(`[ZUVYR] module ${key} failed to render`, err);
      }
    }
  }

  buildShell();
  $('#refresh').addEventListener('click', load);
  load();
  setInterval(load, CONFIG.refreshMs);
})();
