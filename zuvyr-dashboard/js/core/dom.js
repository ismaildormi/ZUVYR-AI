import { ICONS } from '../ui/icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/**
 * إنشاء عنصر HTML. النصوص تُضاف كـ textContent دائماً فلا يوجد أي حقن HTML
 * من بيانات الـ API. الخصائص المنطقية (disabled, hidden...) تُعيَّن كخاصية DOM.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  appendChildren(el, children);
  return el;
}

/** نفس h() لكن لعناصر SVG (مثل حلقة الدرع) */
export function svg(tag, props = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  appendChildren(el, children);
  return el;
}

function applyProps(el, props) {
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.setAttribute('class', value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'hidden' || key === 'disabled' || key === 'checked') el[key] = Boolean(value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
}

function appendChildren(el, children) {
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** أيقونة من مجموعة ICONS الثابتة (مرسومة بالحد) */
export function icon(name, extraClass = '') {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', `ico ${extraClass}`.trim());
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  // المحتوى ثابت من ملف الأيقونات وليس من بيانات خارجية
  el.innerHTML = ICONS[name] ?? '';
  return el;
}

/** إعادة بناء محتوى عنصر بأمان */
export function replace(el, ...children) {
  el.replaceChildren(...children.flat().filter((c) => c !== undefined && c !== null && c !== false)
    .map((c) => (c instanceof Node ? c : document.createTextNode(String(c)))));
}
