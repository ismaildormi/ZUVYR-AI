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
