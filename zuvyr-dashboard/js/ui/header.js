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

