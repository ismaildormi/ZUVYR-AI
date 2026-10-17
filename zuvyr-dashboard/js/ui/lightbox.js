import { $, icon, replace } from '../core/dom.js';
import { truncate } from '../core/format.js';

/**
 * معرض مكبّر مع تنقل بالأسهم ولوحة المفاتيح.
 * items: [{ src, caption }]
 */
export function createLightbox(dialog) {
  const img = $('#lb-image', dialog);
  const caption = $('#lb-caption', dialog);
  const counter = $('#lb-count', dialog);
  const prevBtn = $('#lb-prev', dialog);
  const nextBtn = $('#lb-next', dialog);
  const closeBtn = $('#lb-close', dialog);

  let items = [];
  let index = 0;

  replace(prevBtn, icon('chevronRight'));
  replace(nextBtn, icon('chevronLeft'));
  replace(closeBtn, icon('close'));

  // الأزرار والأسهم تطابق موضعها البصري: في RTL يقع "التالي" على اليسار
  function show(i) {
    if (!items.length) return;
    index = (i + items.length) % items.length;
    const item = items[index];
    img.src = item.src;
    img.alt = item.caption;
    caption.textContent = truncate(item.caption, 80);
    counter.textContent = `${index + 1} / ${items.length}`;
    const multi = items.length > 1;
    prevBtn.hidden = !multi;
    nextBtn.hidden = !multi;
  }

  prevBtn.addEventListener('click', () => show(index - 1));
  nextBtn.addEventListener('click', () => show(index + 1));
  closeBtn.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(index + 1);
    if (e.key === 'ArrowRight') show(index - 1);
  });

  return {
    open(list, start = 0) {
      items = list;
      show(start);
      dialog.showModal();
      closeBtn.focus();
    },
  };
}
