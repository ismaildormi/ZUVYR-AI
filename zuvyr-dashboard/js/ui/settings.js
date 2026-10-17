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
