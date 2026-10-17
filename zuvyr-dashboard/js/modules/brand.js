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
