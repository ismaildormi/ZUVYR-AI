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
