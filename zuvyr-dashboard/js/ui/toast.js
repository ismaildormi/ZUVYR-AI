import { h, icon } from '../core/dom.js';

/**
 * إشعارات خفيفة في الزاوية. tone: info | ok | danger
 */
export function createToaster(container) {
  return function toast(message, tone = 'info', duration = 3800) {
    const item = h('div', { class: `toast tone-${tone}`, role: 'status' },
      icon(tone === 'danger' ? 'alert' : tone === 'ok' ? 'check' : 'signal', 'ico-sm'),
      h('span', {}, message));

    container.append(item);
    setTimeout(() => {
      item.classList.add('is-leaving');
      setTimeout(() => item.remove(), 260);
    }, duration);
  };
}
