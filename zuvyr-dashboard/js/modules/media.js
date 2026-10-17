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
