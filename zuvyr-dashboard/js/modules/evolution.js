/** الوحدة 6 · المُنسِّق ذاتي التطور: زر التشغيل الرئيسي، درع الأمان، وسجل التشغيل */
import { CONFIG } from '../config.js';
import { h, icon, replace } from '../core/dom.js';
import { runMasterRun } from '../core/api.js';
import { t } from '../core/i18n.js';
import { fmtClock, obj, text } from '../core/format.js';
import { note, section } from '../ui/parts.js';

const MAX_LINES = 200;

/** حالة الزر والكرة البصرية حسب نتيجة آخر تشغيل */
const RUN_VIEW = {
  idle: { orb: 'is-idle', label: 'evo.orbIdle' },
  running: { orb: 'is-running', label: 'evo.orbRunning' },
  done: { orb: 'is-done', label: 'evo.orbDone' },
  error: { orb: 'is-error', label: 'evo.orbError' },
  unavailable: { orb: 'is-idle', label: 'state.unavailable' },
};

export default {
  id: 'evo',
  icon: 'bolt',
  titleKey: 'mod.evo.title',
  subKey: 'mod.evo.sub',
  shortKey: 'mod.evo.short',

  mount(body, ctx) {
    const st = { online: false, running: false, runState: 'idle', lines: [], userAgent: '' };

    const orb = h('div', { class: 'orb is-idle' }, icon('bolt'));
    const orbLabel = h('strong');
    const statusTag = h('span', { class: 'tag' });
    const antiBotTag = h('span', { class: 'tag' });
    const uaCode = h('code');
    const copyBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: copyUserAgent },
      icon('copy', 'ico-sm'),
      h('span', { 'data-i18n': 'evo.copy' }, t('evo.copy')));

    const masterBtn = h('button', { type: 'button', class: 'master-btn', disabled: true, onclick: runMaster });
    const logBody = h('div', { class: 'terminal-body', role: 'log', 'aria-live': 'polite' });
    const clearBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: clearLog },
      icon('trash', 'ico-sm'),
      h('span', { 'data-i18n': 'evo.clear' }, t('evo.clear')));

    body.append(
      h('div', { class: 'orb-row' },
        orb,
        h('div', { class: 'stack' },
          h('span', { class: 'muted', 'data-i18n': 'evo.status' }, t('evo.status')),
          orbLabel,
          statusTag)),
      section('evo.shield'),
      h('div', { class: 'row' }, h('span', { class: 'muted', 'data-i18n': 'evo.antiBot' }, t('evo.antiBot')), antiBotTag),
      h('div', { class: 'ua-line' }, uaCode, copyBtn),
      h('span', { class: 'muted', 'data-i18n': 'evo.userAgent' }, t('evo.userAgent')),
      section('evo.source'),
      note(t('evo.sourceValue')),
      masterBtn,
      section('evo.log'),
      h('div', { class: 'terminal' },
        h('div', { class: 'terminal-bar' },
          h('span', { class: 'btns' }, h('i'), h('i'), h('i')),
          h('span', {}, 'zuvyr://master-run'),
          clearBtn),
        logBody),
    );

    function addLine(message, tone = '') {
      st.lines = [...st.lines, { time: fmtClock(), message, tone }].slice(-MAX_LINES);
      paintLog();
    }

    function clearLog() {
      st.lines = [];
      paintLog();
      ctx.toast(t('toast.logCleared'));
    }

    function paintLog() {
      replace(logBody, st.lines.length
        ? st.lines.map((line) => h('div', { class: `line ${line.tone}`.trim() },
          h('span', { class: 'ts' }, line.time),
          line.message))
        : h('div', { class: 'placeholder', dir: 'auto' }, t('evo.logEmpty')));
      logBody.scrollTop = logBody.scrollHeight;
    }

    function paintControls() {
      const view = RUN_VIEW[st.runState];
      orb.className = `orb ${view.orb}`;
      orbLabel.textContent = t(view.label);
      masterBtn.disabled = !st.online || st.running;
      masterBtn.classList.toggle('is-running', st.running);
      replace(masterBtn, icon(st.running ? 'refresh' : 'bolt'),
        h('span', {}, t(st.running ? 'evo.running' : 'evo.run')));
    }

    async function runMaster() {
      if (st.running || !st.online) return;
      st.running = true;
      st.runState = 'running';
      paintControls();
      addLine(t('evo.started'), 'warn');

      try {
        const res = await runMasterRun();
        if (res.status === 404) {
          st.runState = 'unavailable';
          addLine(t('evo.unavailable', { path: CONFIG.api.masterRun }), 'warn');
        } else if (!res.ok) {
          st.runState = 'error';
          addLine(t('evo.failed', { status: res.status }), 'err');
          if (res.text) addLine(res.text.slice(0, 300), 'err');
        } else {
          st.runState = 'done';
          addLine(t('evo.done'), 'ok');
          if (res.text) addLine(res.text.slice(0, 2000));
          ctx.toast(t('evo.done'), 'ok');
        }
      } catch (err) {
        st.runState = 'error';
        addLine(t('evo.network', { message: err.message }), 'err');
        ctx.toast(t('toast.offline'), 'danger');
      } finally {
        st.running = false;
        paintControls();
      }
    }

    async function copyUserAgent() {
      try {
        await navigator.clipboard.writeText(st.userAgent);
        ctx.toast(t('toast.copied'), 'ok');
      } catch {
        ctx.toast(t('toast.offline'), 'danger');
      }
    }

    paintLog();

    return {
      render(state) {
        st.online = state.status === 'ready';
        const data = obj(state.data);
        const security = obj(data.security_gate);
        const evolution = text(data.self_evolution_status, '');
        const antiBot = text(security.anti_bot_protection, '');

        statusTag.className = `tag ${/active/i.test(evolution) ? 'tone-ok' : ''}`.trim();
        statusTag.textContent = text(evolution, t('state.empty'));
        antiBotTag.className = `tag ${/enabled/i.test(antiBot) ? 'tone-ok' : ''}`.trim();
        antiBotTag.textContent = antiBot;

        st.userAgent = text(security.current_spoofed_agent, '');
        uaCode.textContent = st.userAgent;
        uaCode.title = st.userAgent;

        paintControls();

        return /active/i.test(evolution)
          ? { tone: 'ok', key: 'state.active' }
          : { tone: '', key: 'state.idle' };
      },
    };
  },
};
