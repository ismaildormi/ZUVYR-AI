/** الوحدة 2 · محرك الرسوم المتحركة: مشغّل عمودي وعداد دقائق المشاهدة */
import { CONFIG } from '../config.js';
import { h, icon, replace } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { assetsOf, fmtTime, mediaUrl, obj, text } from '../core/format.js';
import { note, section, stat } from '../ui/parts.js';

/** أقصى فجوة زمنية بين تحديثين نعدّها مشاهدة متصلة (ثوانٍ) — أي قفزة أكبر تُعدّ seek */
const MAX_CONTINUOUS_GAP = 2;

export default {
  id: 'cartoon',
  icon: 'sparkles',
  titleKey: 'mod.cartoon.title',
  subKey: 'mod.cartoon.sub',
  shortKey: 'mod.cartoon.short',

  mount(body) {
    const st = { clips: [], selected: null, watched: 0, last: 0, error: false };

    const player = h('video', { class: 'player', controls: true, playsinline: true, preload: 'metadata' });
    const clipsEl = h('div', { class: 'chips' });
    const errorEl = h('p', { class: 'note', role: 'alert' });

    const counterEl = h('div', { class: 'counter' }, '00:00');
    const minutesEl = h('small', {}, `0.00 ${t('cartoon.minutes')}`);
    const resetBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { st.watched = 0; paintCounter(); } },
      icon('refresh', 'ico-sm'),
      h('span', { 'data-i18n': 'cartoon.reset' }, t('cartoon.reset')));

    const clipLength = stat('cartoon.clipLength');
    const shorts = stat('cartoon.shorts');
    const long = stat('cartoon.long');
    const format = stat('cartoon.format');

    body.append(
      section('cartoon.clips'),
      clipsEl,
      h('div', { class: 'stage' }, player),
      errorEl,
      h('div', { class: 'counter-panel' },
        h('div', { class: 'counter-label' },
          h('span', { class: 'muted', 'data-i18n': 'cartoon.watched' }, t('cartoon.watched')),
          counterEl,
          minutesEl),
        resetBtn),
      section('cartoon.schedule'),
      h('div', { class: 'stats' }, shorts.el, long.el, clipLength.el, format.el),
    );

    function paintCounter() {
      counterEl.textContent = fmtTime(st.watched);
      minutesEl.textContent = `${(st.watched / 60).toFixed(2)} ${t('cartoon.minutes')}`;
    }

    function select(name) {
      st.selected = name;
      st.last = 0;
      st.error = false;
      player.src = mediaUrl(CONFIG.media.folders.videos, name);
      player.load();
      paintClips();
    }

    function paintClips() {
      replace(clipsEl, st.clips.length
        ? st.clips.map((clip) => h('button', {
          type: 'button',
          class: 'chip',
          'aria-pressed': String(clip.name === st.selected),
          onclick: () => select(clip.name),
        }, clip.name))
        : note(t('cartoon.noClips')));
      errorEl.textContent = st.error ? t('cartoon.error') : '';
    }

    player.addEventListener('loadedmetadata', () => {
      clipLength.value.textContent = `${fmtTime(player.duration)} · ${(player.duration / 60).toFixed(2)} ${t('cartoon.minutes')}`;
      player.classList.toggle('is-vertical', player.videoHeight > player.videoWidth);
      st.last = player.currentTime;
    });
    player.addEventListener('play', () => {
      st.last = player.currentTime;
    });
    player.addEventListener('seeking', () => {
      st.last = player.currentTime;
    });
    player.addEventListener('timeupdate', () => {
      const delta = player.currentTime - st.last;
      if (delta > 0 && delta < MAX_CONTINUOUS_GAP) {
        st.watched += delta;
        paintCounter();
      }
      st.last = player.currentTime;
    });
    player.addEventListener('error', () => {
      if (!st.selected) return;
      st.error = true;
      paintClips();
    });

    paintCounter();

    return {
      render(state) {
        const data = obj(state.data);
        const schedule = obj(data.schedules_and_timing);
        st.clips = assetsOf(data).filter((a) => a.folder === CONFIG.media.folders.videos && a.type === 'video');

        if (!st.clips.some((c) => c.name === st.selected)) {
          if (st.clips.length) select(st.clips[0].name);
          else st.selected = null;
        }

        shorts.value.textContent = text(schedule.shorts_reels_duration);
        long.value.textContent = text(schedule.long_videos_duration);
        format.value.textContent = t('cartoon.formatValue');
        paintClips();
        paintCounter();

        return st.clips.length
          ? { tone: 'ok', key: 'state.ready' }
          : { tone: '', key: 'state.empty' };
      },
    };
  },
};
