/**
 * قطع واجهة مشتركة بين الوحدات (أقسام، وسوم، عناصر ملفات، إحصاءات، حالات فارغة).
 */
import { h, icon } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { typeOf } from '../core/format.js';

/** عنوان قسم داخل البطاقة (نص ثابت قابل للترجمة) */
export const section = (key) => h('div', { class: 'sec', 'data-i18n': key }, t(key));

/** وسم حالة. tone: ok | warn | danger | info | '' */
export const tag = (label, tone = '', iconName = null) =>
  h('span', { class: `tag ${tone ? `tone-${tone}` : ''}` }, iconName ? icon(iconName, 'ico-sm') : null, label);

const TYPE_META = {
  video: { key: 'type.video', tone: 'video', icon: 'video' },
  image: { key: 'type.image', tone: 'image', icon: 'image' },
  script: { key: 'type.script', tone: 'script', icon: 'doc' },
  audio: { key: 'type.audio', tone: 'audio', icon: 'music' },
  '3d': { key: 'type.3d', tone: '3d', icon: 'cube' },
  other: { key: 'type.other', tone: '', icon: 'doc' },
};

/** وسم نوع الملف (فيديو، صورة، نص...) */
export function typeTag(name) {
  const meta = TYPE_META[typeOf(name)];
  return tag(t(meta.key), meta.tone);
}

export const typeIcon = (name) => TYPE_META[typeOf(name)].icon;

/** عنصر ملف في قائمة. إن مُرّر onClick يصبح زراً قابلاً للاختيار */
export function fileItem({ name, active = false, onClick, trailing = null }) {
  const main = h('span', { class: 'item-main' }, icon(typeIcon(name), 'ico-sm'), h('span', { class: 'fname', title: name }, name));
  if (!onClick) {
    return h('div', { class: 'item', role: 'listitem' }, main, trailing ?? typeTag(name));
  }
  return h('button', {
    type: 'button',
    class: 'item',
    'aria-pressed': String(active),
    onclick: onClick,
  }, main, trailing ?? typeTag(name));
}

/** بطاقة إحصاء صغيرة. يعيد العنصر ومرجع القيمة لتحديثها لاحقاً */
export function stat(labelKey, initial = '—') {
  const value = h('strong', { dir: 'auto' }, initial);
  const el = h('div', { class: 'stat' }, h('small', { 'data-i18n': labelKey }, t(labelKey)), value);
  return { el, value };
}

/** حالة فارغة مع أيقونة ورسالة */
export const emptyState = (message, iconName = 'inbox') =>
  h('div', { class: 'empty' }, icon(iconName), h('span', {}, message));

/** إطار صغير لعنصر مع نص يمكن أن يتغيّر بتغيّر اللغة */
export const note = (text) => h('p', { class: 'note' }, text);
