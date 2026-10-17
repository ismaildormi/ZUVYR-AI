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
