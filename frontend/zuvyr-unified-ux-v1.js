(() => {
  'use strict';

  const PACK = '050';
  const state = { openMenu: null, installed: false };

  const GROUPS = Object.freeze({
    work: Object.freeze([
      ['projects', 'Projects', 'Projects and their linked context'],
      ['library', 'Library', 'Canonical assets, versions and Send-To'],
      ['creations', 'Creations', 'Generated outputs and reusable results'],
      ['research', 'Research', 'Sources, verification and research handoffs'],
      ['code', 'Code Studio', 'Owned project files and asset references'],
      ['history', 'History', 'Recent work, versions and results']
    ]),
    settings: Object.freeze([
      ['settings', 'Account & Preferences', 'Account, language, appearance and data controls'],
      ['usage', 'Plans, Credits & Usage', 'Allowance, top-up credits and billing visibility'],
      ['permissions', 'Permissions', 'Scoped grants, expiry and consequence controls'],
      ['memory', 'Memory', 'Review, edit, undo or forget remembered context'],
      ['analytics', 'Analytics', 'Usage and product signals when validated']
    ])
  });

  const ALIASES = Object.freeze({
    projects: ['projects'],
    library: ['library'],
    creations: ['creations', 'images'],
    research: ['research'],
    code: ['code'],
    history: ['history'],
    settings: ['settings'],
    usage: ['usage', 'billing'],
    permissions: ['permissions', 'permission-center', 'permission'],
    memory: ['memory'],
    analytics: ['analytics']
  });

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  function nativeControl(id) {
    const aliases = ALIASES[id] || [id];
    for (const alias of aliases) {
      const exact = document.querySelector(
        '.nav-item[data-open="' + CSS.escape(alias) + '"],' +
        '[data-open="' + CSS.escape(alias) + '"]'
      );
      if (exact) return exact;
    }
    return null;
  }

  function nativeAvailable(id) {
    if (nativeControl(id)) return true;
    const aliases = ALIASES[id] || [id];
    return aliases.some(alias => Boolean(document.getElementById('feature-' + alias)));
  }

  function openNative(id, trigger) {
    const control = nativeControl(id);
    if (control) {
      control.click();
      document.dispatchEvent(new CustomEvent('zuvyr:pack050:navigate', {
        detail: { id, source: 'unified-shell', pack: PACK }
      }));
      closeMenus(false);
      return true;
    }
    const aliases = ALIASES[id] || [id];
    const feature = aliases.map(alias => document.getElementById('feature-' + alias)).find(Boolean);
    if (feature) {
      // Never bypass native ownership by force-activating screens. If the native
      // opener is not present, expose a clear unavailable state instead.
      announce('This surface is present but has no safe navigation entry point yet.', trigger);
      return false;
    }
    announce('This surface is not available in the current product state.', trigger);
    return false;
  }

  function announce(message, trigger) {
    let live = document.getElementById('zuvyrPack050Live');
    if (!live) {
      live = document.createElement('div');
      live.id = 'zuvyrPack050Live';
      live.className = 'zuvyr-pack050-live';
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'polite');
      document.body.appendChild(live);
    }
    live.textContent = message;
    if (trigger) trigger.setAttribute('aria-description', message);
  }

  function menuItems(group) {
    return GROUPS[group].map(([id, label, description]) => {
      const available = nativeAvailable(id);
      return (
        '<button type="button" class="zuvyr-pack050-menu-item" ' +
        'data-zuvyr-pack050-open="' + esc(id) + '" role="menuitem" ' +
        (available ? '' : 'aria-disabled="true" ') +
        '><span class="zuvyr-pack050-item-copy"><strong>' + esc(label) +
        '</strong><small>' + esc(description) + '</small></span>' +
        '<span aria-hidden="true">›</span></button>'
      );
    }).join('');
  }

  function buildShell() {
    if (document.getElementById('zuvyrPack050Shell')) return;

    const shell = document.createElement('div');
    shell.id = 'zuvyrPack050Shell';
    shell.className = 'zuvyr-pack050-shell';
    shell.setAttribute('data-pack', PACK);
    shell.innerHTML =
      '<div class="zuvyr-pack050-switcher" aria-label="ZUVYR unified navigation">' +
        '<button type="button" data-zuvyr-pack050-menu="work" aria-haspopup="menu" aria-expanded="false">' +
          '<span aria-hidden="true">▣</span><span>Work</span>' +
        '</button>' +
        '<button type="button" data-zuvyr-pack050-menu="settings" aria-haspopup="menu" aria-expanded="false">' +
          '<span aria-hidden="true">⚙</span><span>Settings</span>' +
        '</button>' +
      '</div>' +
      '<div class="zuvyr-pack050-menu" data-zuvyr-pack050-panel="work" role="menu" aria-label="Work" hidden>' +
        '<div class="zuvyr-pack050-menu-head"><strong>Work</strong><small>One place to continue existing work without duplicating data.</small></div>' +
        menuItems('work') +
      '</div>' +
      '<div class="zuvyr-pack050-menu" data-zuvyr-pack050-panel="settings" role="menu" aria-label="Settings" hidden>' +
        '<div class="zuvyr-pack050-menu-head"><strong>Settings</strong><small>Open the existing source-of-truth settings and account controls.</small></div>' +
        menuItems('settings') +
      '</div>';

    document.body.appendChild(shell);

    shell.querySelectorAll('[data-zuvyr-pack050-menu]').forEach(button => {
      button.addEventListener('click', () => toggleMenu(button.dataset.zuvyrPack050Menu, button));
      button.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          openMenu(button.dataset.zuvyrPack050Menu, button, true);
        }
      });
    });

    shell.querySelectorAll('[data-zuvyr-pack050-open]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.getAttribute('aria-disabled') === 'true') {
          announce('That surface is not available yet.', button);
          return;
        }
        openNative(button.dataset.zuvyrPack050Open, button);
      });
    });
  }

  function panel(name) {
    return document.querySelector('[data-zuvyr-pack050-panel="' + name + '"]');
  }

  function trigger(name) {
    return document.querySelector('[data-zuvyr-pack050-menu="' + name + '"]');
  }

  function closeMenus(restoreFocus = false) {
    const previous = state.openMenu;
    document.querySelectorAll('[data-zuvyr-pack050-panel]').forEach(node => { node.hidden = true; });
    document.querySelectorAll('[data-zuvyr-pack050-menu]').forEach(node => node.setAttribute('aria-expanded', 'false'));
    state.openMenu = null;
    if (restoreFocus && previous) trigger(previous)?.focus();
  }

  function openMenu(name, source, focusFirst = false) {
    closeMenus(false);
    const p = panel(name);
    if (!p) return;
    p.hidden = false;
    source?.setAttribute('aria-expanded', 'true');
    state.openMenu = name;
    if (focusFirst) {
      p.querySelector('.zuvyr-pack050-menu-item:not([aria-disabled="true"])')?.focus();
    }
  }

  function toggleMenu(name, source) {
    if (state.openMenu === name) closeMenus(true);
    else openMenu(name, source, false);
  }

  function refreshAvailability() {
    document.querySelectorAll('[data-zuvyr-pack050-open]').forEach(button => {
      const available = nativeAvailable(button.dataset.zuvyrPack050Open);
      if (available) button.removeAttribute('aria-disabled');
      else button.setAttribute('aria-disabled', 'true');
    });
  }

  function enhanceSettings() {
    const screen = document.querySelector('#feature-settings .feature-screen');
    if (!screen || screen.querySelector('[data-zuvyr-pack050-settings-hub]')) return;

    const anchor = screen.querySelector('#settingsSummary') || screen.querySelector('.placeholder-view');
    if (!anchor) return;

    const hub = document.createElement('section');
    hub.className = 'zuvyr-pack050-settings-hub';
    hub.setAttribute('data-zuvyr-pack050-settings-hub', '1');
    hub.setAttribute('aria-label', 'Unified settings shortcuts');
    hub.innerHTML =
      '<div class="zuvyr-pack050-hub-head"><strong>Control Center</strong>' +
      '<small>Uses existing account APIs and existing settings screens. No provider or billing action runs on open.</small></div>' +
      '<div class="zuvyr-pack050-hub-grid">' +
      GROUPS.settings.map(([id, label]) =>
        '<button type="button" data-zuvyr-pack050-hub-open="' + esc(id) + '">' + esc(label) + '</button>'
      ).join('') +
      '</div>';
    anchor.parentNode.insertBefore(hub, anchor);

    hub.querySelectorAll('[data-zuvyr-pack050-hub-open]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.zuvyrPack050HubOpen;
        if (id === 'settings') {
          anchor.scrollIntoView({ block: 'start', behavior: 'smooth' });
          return;
        }
        openNative(id, button);
      });
    });
  }

  function installGlobalKeys() {
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && state.openMenu) {
        event.preventDefault();
        closeMenus(true);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'w') {
        event.preventDefault();
        toggleMenu('work', trigger('work'));
      }
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        openNative('settings', trigger('settings'));
      }
    });

    document.addEventListener('click', event => {
      if (!state.openMenu) return;
      const shell = document.getElementById('zuvyrPack050Shell');
      if (shell && !shell.contains(event.target)) closeMenus(false);
    });
  }

  function install() {
    if (state.installed) return;
    state.installed = true;
    buildShell();
    enhanceSettings();
    refreshAvailability();
    installGlobalKeys();

    const observer = new MutationObserver(() => {
      refreshAvailability();
      enhanceSettings();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.ZuvyrUnifiedUX = Object.freeze({
      pack: PACK,
      openWork: () => openMenu('work', trigger('work'), false),
      openSettings: () => openNative('settings', trigger('settings')),
      openNative,
      refreshAvailability
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();


/* ZUVYR PACK094 DATA RIGHTS + SHARED LEARNING PLANE */
(() => {
  'use strict';

  const PACK = '094';
  const state = {
    loading: false,
    policy: null,
    summary: null,
    memory: null,
    rights: [],
    candidates: [],
    exclusions: [],
    consentHistory: [],
    error: ''
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);
  }

  async function api(path, options = {}) {
    if (typeof window.authFetch !== 'function') {
      const error = new Error('auth_unavailable');
      error.code = 'auth_unavailable';
      throw error;
    }
    const response = await window.authFetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status !== 'success') {
      const error = new Error(data.message || data.code || 'Data Rights request failed.');
      error.code = data.code || 'pack094_ui_request_failed';
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function screen() {
    return document.querySelector('#feature-settings .feature-screen');
  }

  function panel() {
    return document.querySelector('[data-zuvyr-pack094-data-rights]');
  }

  function truncateId(value) {
    const text = String(value || '');
    return text.length > 18 ? text.slice(0, 8) + '…' + text.slice(-6) : text;
  }

  function dateText(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  }

  function statusBadge(label, on) {
    return '<span class="zuvyr-pack094-badge" data-on="' + (on ? 'true' : 'false') + '">' +
      esc(label) + '</span>';
  }

  function sharedPlaneHtml() {
    const plane = state.policy?.sharedLearningPlane || null;
    if (!plane) {
      return '<div class="zuvyr-pack094-shared-plane is-muted"><strong>Shared model knowledge</strong><p>Policy status unavailable.</p></div>';
    }
    const owned = plane.ownedModelLearning || {};
    const external = plane.externalModelPolicy || {};
    return (
      '<div class="zuvyr-pack094-shared-plane">' +
        '<div class="zuvyr-pack094-card-head">' +
          '<div><strong>Shared model knowledge</strong><span>' + esc(plane.version || 'pack094') + '</span></div>' +
          statusBadge('GOVERNED', true) +
        '</div>' +
        '<p>All routed models receive the same authorized ZUVYR runtime knowledge envelope for the task, so switching models does not silently lose approved context.</p>' +
        '<div class="zuvyr-pack094-model-grid">' +
          '<article><strong>ZUVYR-owned models</strong><span>' +
            (owned.enabledByDesign
              ? 'Can learn from rights-approved, privacy-processed candidates, failure signals and independent evaluations through PACK095/096.'
              : 'Owned-model learning is not enabled.') +
          '</span></article>' +
          '<article><strong>External provider models</strong><span>' +
            (external.receivesAuthorizedRuntimeKnowledge
              ? 'Receive authorized runtime context. ZUVYR does not claim to train their weights; teacher use is limited by contract or license.'
              : 'External runtime knowledge sharing is disabled.') +
          '</span></article>' +
        '</div>' +
      '</div>'
    );
  }

  function rightsHtml() {
    if (!state.rights.length) {
      return '<div class="zuvyr-pack094-empty">No active or historical training-rights records yet.</div>';
    }
    return state.rights.slice(0, 12).map(item => {
      const active = item.allowGlobalTraining === true && !item.revokedAt;
      return (
        '<article class="zuvyr-pack094-row">' +
          '<div class="zuvyr-pack094-row-main">' +
            '<strong>' + esc(item.rightsBasis || 'training right') + '</strong>' +
            '<span>Content ' + esc(truncateId(item.contentId)) +
              ' · Version ' + esc(truncateId(item.versionId)) + '</span>' +
            '<small>Privacy: ' + esc(item.privacyStatus || 'pending') +
              ' · Provenance: ' + esc(item.provenanceStatus || 'pending') +
              (item.revokedAt ? ' · Revoked ' + esc(dateText(item.revokedAt)) : '') +
            '</small>' +
          '</div>' +
          '<div class="zuvyr-pack094-row-actions">' +
            statusBadge(active ? 'TRAINING ALLOWED' : 'NOT ELIGIBLE', active) +
            (active
              ? '<button type="button" data-zuvyr-pack094-revoke-right="' + esc(item.id) + '">Revoke</button>'
              : '') +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function candidatesHtml() {
    if (!state.candidates.length) {
      return '<div class="zuvyr-pack094-empty">No training candidates have been admitted.</div>';
    }
    return state.candidates.slice(0, 12).map(item => {
      const eligible = item.status === 'candidate';
      return (
        '<article class="zuvyr-pack094-row">' +
          '<div class="zuvyr-pack094-row-main">' +
            '<strong>' + esc(item.domain || item.payloadKind || 'candidate') + '</strong>' +
            '<span>Content ' + esc(truncateId(item.contentId)) +
              ' · score ' + esc(item.learningValueScore) + '/10000</span>' +
            '<small>Consent v' + esc(item.consentVersion) +
              ' · ' + esc(item.status) +
              (item.exclusionReason ? ' · ' + esc(item.exclusionReason) : '') +
            '</small>' +
          '</div>' +
          '<div class="zuvyr-pack094-row-actions">' +
            statusBadge(eligible ? 'ELIGIBLE' : 'EXCLUDED', eligible) +
            (eligible
              ? '<button type="button" data-zuvyr-pack094-exclude-candidate="' + esc(item.id) + '">Exclude</button>'
              : '') +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  function exclusionsHtml() {
    if (!state.exclusions.length) {
      return '<div class="zuvyr-pack094-empty">No training exclusions recorded.</div>';
    }
    return state.exclusions.slice(0, 10).map(item => (
      '<article class="zuvyr-pack094-row is-compact">' +
        '<div class="zuvyr-pack094-row-main">' +
          '<strong>' + esc(item.reason || 'excluded') + '</strong>' +
          '<span>' + esc(item.source || 'data_rights') + ' · ' + esc(dateText(item.createdAt)) + '</span>' +
        '</div>' +
        statusBadge('EXCLUDED', false) +
      '</article>'
    )).join('');
  }

  function historyHtml() {
    if (!state.consentHistory.length) return '<span>No consent changes recorded yet.</span>';
    return state.consentHistory.slice(0, 5).map(item => (
      '<span>v' + esc(item.consentVersion) + ' · ' +
      (item.globalTrainingOptIn ? 'ON' : 'OFF') + ' · ' +
      esc(item.source || 'user') + ' · ' + esc(dateText(item.createdAt)) + '</span>'
    )).join('');
  }

  function render() {
    const root = panel();
    if (!root) return;

    if (state.loading) {
      root.innerHTML =
        '<div class="zuvyr-pack094-head"><div><span>PACK094 · DATA RIGHTS</span><h3>Training & Learning</h3></div></div>' +
        '<div class="zuvyr-pack094-loading">Loading your learning and data-rights state…</div>';
      return;
    }

    if (state.error) {
      root.innerHTML =
        '<div class="zuvyr-pack094-head"><div><span>PACK094 · DATA RIGHTS</span><h3>Training & Learning</h3></div>' +
        '<button type="button" data-zuvyr-pack094-refresh>Retry</button></div>' +
        '<div class="zuvyr-pack094-error">' + esc(state.error) + '</div>';
      bind();
      return;
    }

    const consentOn = state.summary?.consent?.globalTrainingOptIn === true;
    const memoryOn = state.memory?.memory_enabled === true;
    const s = state.summary || {};

    root.innerHTML =
      '<div class="zuvyr-pack094-head">' +
        '<div><span>PACK094 · DATA RIGHTS</span><h3>Training & Learning</h3>' +
          '<p>Memory and global-model training are separate permissions. You can keep Memory on while Training stays off.</p></div>' +
        '<button type="button" data-zuvyr-pack094-refresh>Refresh</button>' +
      '</div>' +

      '<div class="zuvyr-pack094-permission-grid">' +
        '<article class="zuvyr-pack094-permission">' +
          '<div class="zuvyr-pack094-card-head"><div><strong>Memory</strong><span>Personal context used for your own experience</span></div>' +
            statusBadge(memoryOn ? 'ON' : 'OFF', memoryOn) + '</div>' +
          '<p>Memory permission controls whether ZUVYR retrieves remembered context for you. It does not grant global-model training permission.</p>' +
          '<button type="button" data-zuvyr-pack094-open-memory>Open Memory</button>' +
        '</article>' +
        '<article class="zuvyr-pack094-permission">' +
          '<div class="zuvyr-pack094-card-head"><div><strong>Global model training</strong><span>Rights-approved contribution to ZUVYR-owned model learning</span></div>' +
            statusBadge(consentOn ? 'ON' : 'OFF', consentOn) + '</div>' +
          '<p>' + (consentOn
            ? 'Training is enabled, but content is still admitted only after rights, provenance, privacy/redaction, dedupe and exclusion checks.'
            : 'Training is off. Your content is blocked from global-model training. Privacy-safe non-content outcome signals may still improve routing and evaluations.') +
          '</p>' +
          '<button type="button" class="zuvyr-pack094-primary" data-zuvyr-pack094-training-toggle="' + (consentOn ? 'off' : 'on') + '">' +
            (consentOn ? 'Turn training off' : 'Turn training on') +
          '</button>' +
        '</article>' +
      '</div>' +

      sharedPlaneHtml() +

      '<div class="zuvyr-pack094-metrics">' +
        '<article><b>' + Number(s.nonContentLearningEvents || 0) + '</b><span>Outcome signals</span></article>' +
        '<article><b>' + Number(s.openFailureBankEntries || 0) + '</b><span>Open failure patterns</span></article>' +
        '<article><b>' + Number(s.activeTrainingRights || 0) + '</b><span>Active rights</span></article>' +
        '<article><b>' + Number(s.eligibleTrainingCandidates || 0) + '</b><span>Eligible candidates</span></article>' +
        '<article><b>' + Number(s.trainingExclusions || 0) + '</b><span>Exclusions</span></article>' +
      '</div>' +

      '<details class="zuvyr-pack094-details" open>' +
        '<summary>Training rights</summary><div class="zuvyr-pack094-list">' + rightsHtml() + '</div>' +
      '</details>' +
      '<details class="zuvyr-pack094-details">' +
        '<summary>Training candidates</summary><div class="zuvyr-pack094-list">' + candidatesHtml() + '</div>' +
      '</details>' +
      '<details class="zuvyr-pack094-details">' +
        '<summary>Exclusions & revocation effects</summary><div class="zuvyr-pack094-list">' + exclusionsHtml() + '</div>' +
      '</details>' +
      '<div class="zuvyr-pack094-consent-history"><strong>Consent history</strong>' + historyHtml() + '</div>' +
      '<div class="zuvyr-pack094-note">No raw prompt, response, task input/output, provider secret or raw provider error is shown or stored in the non-content learning event surface.</div>';

    bind();
  }

  async function refresh() {
    const root = panel();
    if (!root || state.loading) return;
    state.loading = true;
    state.error = '';
    render();
    try {
      const [policy, summary, memory, rights, candidates, exclusions, history] = await Promise.all([
        api('/api/learning/policy', { cache: 'no-store' }),
        api('/api/learning/summary', { cache: 'no-store' }),
        api('/api/workspace/memory/preferences', { cache: 'no-store' }),
        api('/api/learning/rights?limit=50', { cache: 'no-store' }),
        api('/api/learning/candidates?limit=50', { cache: 'no-store' }),
        api('/api/learning/exclusions?limit=50', { cache: 'no-store' }),
        api('/api/learning/consent/history?limit=20', { cache: 'no-store' })
      ]);
      state.policy = policy.policy || null;
      state.summary = summary.summary || null;
      state.memory = memory.preferences || null;
      state.rights = Array.isArray(rights.rights) ? rights.rights : [];
      state.candidates = Array.isArray(candidates.candidates) ? candidates.candidates : [];
      state.exclusions = Array.isArray(exclusions.exclusions) ? exclusions.exclusions : [];
      state.consentHistory = Array.isArray(history.events) ? history.events : [];
    } catch (error) {
      state.error =
        error?.code === 'auth_unavailable'
          ? 'Sign in to review Training & Learning data rights.'
          : 'Training & Learning data-rights status could not be loaded.';
    } finally {
      state.loading = false;
      render();
    }
  }

  async function setTraining(next) {
    if (next === true) {
      const approved = window.confirm
        ? window.confirm(
            'Turn on global-model training? Only content with active training rights, verified provenance, privacy/redaction processing and no exclusion can become a training candidate. Memory remains a separate permission.'
          )
        : false;
      if (!approved) return;
    }

    const button = panel()?.querySelector('[data-zuvyr-pack094-training-toggle]');
    if (button) button.disabled = true;
    try {
      await api('/api/learning/consent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          globalTrainingOptIn: next === true,
          policyVersion:
            state.policy?.consentPolicyVersion || 'pack094-v1'
        })
      });
      document.dispatchEvent(new CustomEvent('zuvyr:training-consent-changed', {
        detail: { enabled: next === true, source: 'pack094-data-rights' }
      }));
      await refresh();
    } catch (error) {
      state.error = 'Training consent could not be updated.';
      state.loading = false;
      render();
    }
  }

  async function revokeRight(id) {
    const approved = window.confirm
      ? window.confirm('Revoke this training right? Current eligible candidates linked to it will be excluded.')
      : false;
    if (!approved) return;
    try {
      await api('/api/learning/rights/' + encodeURIComponent(id) + '/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'user_revoked' })
      });
      await refresh();
    } catch (_) {
      state.error = 'Training right could not be revoked.';
      render();
    }
  }

  async function excludeCandidate(id) {
    const approved = window.confirm
      ? window.confirm('Exclude this candidate from model training?')
      : false;
    if (!approved) return;
    try {
      await api('/api/learning/candidates/' + encodeURIComponent(id) + '/exclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      await refresh();
    } catch (_) {
      state.error = 'Training candidate could not be excluded.';
      render();
    }
  }

  function openMemory() {
    const control =
      document.querySelector('[data-open="memory"]') ||
      document.querySelector('[data-tab="memory"]') ||
      document.querySelector('[data-zuvyr-memory-entry]');
    if (control) {
      control.click();
      return;
    }
    const memory = document.getElementById('feature-memory') ||
      document.getElementById('screen-memory');
    if (memory) memory.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function bind() {
    const root = panel();
    if (!root) return;
    root.querySelector('[data-zuvyr-pack094-refresh]')?.addEventListener('click', refresh);
    root.querySelector('[data-zuvyr-pack094-open-memory]')?.addEventListener('click', openMemory);
    root.querySelector('[data-zuvyr-pack094-training-toggle]')?.addEventListener('click', event => {
      setTraining(event.currentTarget.getAttribute('data-zuvyr-pack094-training-toggle') === 'on');
    });
    root.querySelectorAll('[data-zuvyr-pack094-revoke-right]').forEach(button => {
      button.addEventListener('click', () => revokeRight(button.dataset.zuvyrPack094RevokeRight));
    });
    root.querySelectorAll('[data-zuvyr-pack094-exclude-candidate]').forEach(button => {
      button.addEventListener('click', () => excludeCandidate(button.dataset.zuvyrPack094ExcludeCandidate));
    });
  }

  function ensureSettingsShortcut(root) {
    const hub = root?.querySelector('[data-zuvyr-pack050-settings-hub] .zuvyr-pack050-hub-grid');
    if (!hub || hub.querySelector('[data-zuvyr-pack094-open-data-rights]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-zuvyr-pack094-open-data-rights', '1');
    button.textContent = 'Training & Data Rights';
    button.addEventListener('click', () => {
      const target = panel();
      if (target) {
        target.open = true;
        target.scrollIntoView({ block: 'start', behavior: 'smooth' });
        refresh();
      }
    });
    hub.appendChild(button);
  }

  function ensurePanel() {
    const root = screen();
    if (!root) return;

    let section = panel();
    if (!section) {
      section = document.createElement('section');
      section.className = 'zuvyr-pack094-data-rights';
      section.setAttribute('data-zuvyr-pack094-data-rights', '1');
      section.setAttribute('aria-label', 'Training and Data Rights');

      const hub = root.querySelector('[data-zuvyr-pack050-settings-hub]');
      if (hub?.parentNode) hub.parentNode.insertBefore(section, hub.nextSibling);
      else {
        const anchor = root.querySelector('#settingsSummary') || root.querySelector('.placeholder-view');
        if (anchor?.parentNode) anchor.parentNode.insertBefore(section, anchor);
        else root.appendChild(section);
      }
      render();
      refresh();
    }

    ensureSettingsShortcut(root);
  }

  function boot() {
    ensurePanel();
    new MutationObserver(ensurePanel).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  document.addEventListener('zuvyr:training-consent-changed', () => {
    if (panel()) refresh();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
