import { CONFIG } from '../config.js';

const KEY = 'zuvyr-dashboard:prefs:v1';

/** تحميل التفضيلات مع التحقق من كل قيمة (تفضيلات تالفة لا تكسر الواجهة) */
export function loadPrefs() {
  const defaults = CONFIG.defaults;
  let saved = {};
  try {
    saved = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    saved = {};
  }

  const refreshValues = CONFIG.refreshOptions.map((o) => o.value);
  return {
    lang: CONFIG.languages.includes(saved.lang) ? saved.lang : defaults.lang,
    theme: CONFIG.themes.includes(saved.theme) ? saved.theme : defaults.theme,
    refreshMs: refreshValues.includes(saved.refreshMs) ? saved.refreshMs : defaults.refreshMs,
    hidden: Array.isArray(saved.hidden) ? saved.hidden.filter((id) => typeof id === 'string') : [...defaults.hidden],
  };
}

export function savePrefs(prefs) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* التخزين غير متاح (وضع خاص مثلاً): نتجاهل بهدوء */
  }
}
