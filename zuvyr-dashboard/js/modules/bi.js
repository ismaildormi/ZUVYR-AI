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
