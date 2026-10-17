import { CONFIG } from '../config.js';
import { getLang } from './i18n.js';

export const LANGUAGE_NAMES = {
  AR: 'العربية',
  EN: 'English',
  ES: 'Español',
  FR: 'Français',
};

const EXT_TYPE = {
  mp4: 'video', mov: 'video', webm: 'video',
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image',
  txt: 'script', md: 'script',
  mp3: 'audio', wav: 'audio', m4a: 'audio',
  obj: '3d', glb: '3d', gltf: '3d', stl: '3d',
};

/** نوع الملف من امتداده */
export const typeOf = (name) => EXT_TYPE[String(name).split('.').pop().toLowerCase()] ?? 'other';

/** رابط تشغيل/عرض ملف محلي عبر الخادم */
export const mediaUrl = (folder, name) => `${CONFIG.media.base}/${folder}/${encodeURIComponent(name)}`;

/** قائمة الأصول المادية كما يعيدها الـ Gateway (أسماء ملفات فقط) */
export function assetsOf(data) {
  const videos = list(data.videos_pool_list).map((name) => ({
    name: String(name), folder: CONFIG.media.folders.videos, type: typeOf(name),
  }));
  const scripts = list(data.scripts_pool_list).map((name) => ({
    name: String(name), folder: CONFIG.media.folders.scripts, type: typeOf(name),
  }));
  return [...videos, ...scripts];
}

/** تحويل آمن إلى مصفوفة */
export const list = (value) => (Array.isArray(value) ? value : []);

/** تحويل آمن إلى كائن */
export const obj = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

/** قيمة نصية أو قيمة بديلة */
export const text = (value, fallback = '—') => (value === undefined || value === null || value === '' ? fallback : String(value));

/** رقم منتهٍ أو null */
export const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** أرقام بصيغة لاتينية داخل الواجهة العربية أيضاً (أوضح للقراءة التقنية) */
const numberLocale = () => (getLang() === 'ar' ? 'ar-u-nu-latn' : 'en-US');

export function fmtNumber(value, digits = 0) {
  return Number(value).toLocaleString(numberLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** mm:ss أو hh:mm:ss */
export function fmtTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const s = Math.floor(seconds);
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const fmtClock = () => new Date().toLocaleTimeString('en-GB');

/** النسبة المئوية من نص مثل "100% No Copyright" */
export function percentFrom(raw) {
  const match = String(raw ?? '').match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  return match ? Math.min(100, Number(match[1])) : null;
}

/**
 * عدّ متحرّك إلى قيمة جديدة. يحفظ آخر قيمة في dataset حتى يبدأ من مكانه.
 * يحترم reduce-motion.
 */
export function animateNumber(el, to, format) {
  const from = Number(el.dataset.value ?? 0);
  el.dataset.value = String(to);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || from === to) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const duration = 900;
  const step = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = format(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const truncate = (value, max = 64) => {
  const s = String(value ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
