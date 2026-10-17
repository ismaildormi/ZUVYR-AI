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
