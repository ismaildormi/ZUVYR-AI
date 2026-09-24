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
      await api('/api/workspace/memory/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainingConsent: next === true
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

  async function rollbackCheckpoint(id) {
    const reason=String(window.prompt?.(
      'Rollback reason (recorded in immutable rollout lineage):',
      'Manual Model Lab rollback'
    )||'').trim();
    if(!reason) return;
    await api('/api/model-lab/checkpoints/'+encodeURIComponent(id)+'/rollback',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({targetStage:'LAB',reason})
    });
    state.notice='Checkpoint rolled back to LAB; planned later stages were cancelled in lineage.';
    await refresh();
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


/* ZUVYR PACK095 MODEL LAB */
(() => {
  'use strict';

  const PACK = '095';
  const state = {
    installed: false,
    loading: false,
    denied: false,
    error: '',
    summary: null,
    datasets: [],
    connectors: [],
    trainingRuns: [],
    checkpoints: [],
    benchmarks: [],
    evaluations: [],
    syntheticJobs: [],
    candidates: [],
    failures: [],
    skills: [],
    curricula: [],
    selectedDataset: '',
    selectedConnector: '',
    notice: ''
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
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
      const error = new Error(data.message || data.code || 'Model Lab request failed.');
      error.code = data.code || 'model_lab_ui_request_failed';
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function settingsScreen() {
    return document.querySelector('#feature-settings .feature-screen');
  }

  function panel() {
    return document.querySelector('[data-zuvyr-pack095-model-lab]');
  }

  function dateText(value) {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  function shortId(value) {
    const text = String(value || '');
    return text.length > 20 ? text.slice(0,8) + '…' + text.slice(-6) : text;
  }

  function badge(label, tone = 'neutral') {
    return '<span class="zuvyr-pack095-badge" data-tone="' +
      esc(tone) + '">' + esc(label) + '</span>';
  }

  function count(key) {
    const value = state.summary?.counts?.[key];
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function notice(message) {
    state.notice = String(message || '');
    const node = panel()?.querySelector('[data-zuvyr-pack095-notice]');
    if (node) node.textContent = state.notice;
  }

  function candidateRows() {
    if (!state.candidates.length) {
      return '<div class="zuvyr-pack095-empty">No eligible PACK094 training candidates.</div>';
    }
    return state.candidates.slice(0,30).map(item => (
      '<article class="zuvyr-pack095-row">' +
        '<div class="zuvyr-pack095-row-main">' +
          '<strong>' + esc(item.domain || item.payloadKind || 'Candidate') + '</strong>' +
          '<span>Candidate ' + esc(shortId(item.id)) +
          ' · content ' + esc(shortId(item.contentId)) +
          ' · rights ' + esc(shortId(item.rightsId)) + '</span>' +
          '<small>Consent v' + esc(item.consentVersion) +
          ' · quality ' + esc(item.qualityScore == null ? '—' : item.qualityScore) +
          ' · learning value ' + esc(item.learningValueScore || 0) +
          ' · source owner ' + esc(shortId(item.sourceOwnerId)) + '</small>' +
        '</div>' +
        badge('ELIGIBLE METADATA','good') +
      '</article>'
    )).join('');
  }

  function failureRows() {
    if (!state.failures.length) {
      return '<div class="zuvyr-pack095-empty">Failure Bank has no open patterns.</div>';
    }
    return state.failures.slice(0,30).map(item => (
      '<article class="zuvyr-pack095-row">' +
        '<div class="zuvyr-pack095-row-main">' +
          '<strong>' + esc(item.failureCategory || 'Failure pattern') + '</strong>' +
          '<span>' + esc(item.capability || 'unknown capability') +
          ' · ' + esc(item.provider || item.modelTool || 'unassigned') + '</span>' +
          '<small>' + esc(item.occurrences || 0) + ' occurrences · domain ' +
          esc(item.domain || '—') + ' · last seen ' + esc(dateText(item.lastSeenAt)) + '</small>' +
        '</div>' +
        badge('OPEN','warn') +
      '</article>'
    )).join('');
  }

  function skillRows() {
    if (!state.skills.length) {
      return '<div class="zuvyr-pack095-empty">No Model Lab skills defined.</div>';
    }
    return state.skills.slice(0,30).map(item => (
      '<article class="zuvyr-pack095-row">' +
        '<div class="zuvyr-pack095-row-main">' +
          '<strong>' + esc(item.name || 'Skill') + '</strong>' +
          '<span>' + esc(item.capability || 'No capability label') + '</span>' +
          '<small>' + esc(item.description || 'No description') + '</small>' +
        '</div>' +
        badge(String(item.status || 'active').toUpperCase(), 'neutral') +
      '</article>'
    )).join('');
  }

  function curriculumRows() {
    if (!state.curricula.length) {
      return '<div class="zuvyr-pack095-empty">No curricula defined.</div>';
    }
    return state.curricula.slice(0,30).map(item => (
      '<article class="zuvyr-pack095-row">' +
        '<div class="zuvyr-pack095-row-main">' +
          '<strong>' + esc(item.name || 'Curriculum') + '</strong>' +
          '<span>' + esc(item.description || 'No description') + '</span>' +
          '<small>Curriculum ' + esc(shortId(item.id)) + '</small>' +
        '</div>' +
        badge(String(item.status || 'active').toUpperCase(), 'neutral') +
      '</article>'
    )).join('');
  }

  function benchmarkRows() {
    if (!state.benchmarks.length) {
      return '<div class="zuvyr-pack095-empty">No independent benchmarks defined.</div>';
    }
    return state.benchmarks.slice(0,30).map(item => (
      '<article class="zuvyr-pack095-row">' +
        '<div class="zuvyr-pack095-row-main">' +
          '<strong>' + esc(item.name || 'Benchmark') + ' · ' + esc(item.version || '') + '</strong>' +
          '<span>Dataset version ' + esc(shortId(item.dataset_version_id)) + '</span>' +
          '<small>Benchmark ' + esc(shortId(item.id)) + '</small>' +
        '</div>' +
        badge(String(item.status || 'active').toUpperCase(), 'neutral') +
      '</article>'
    )).join('');
  }

  function evaluationRows() {
    if (!state.evaluations.length) {
      return '<div class="zuvyr-pack095-empty">No independent evaluations recorded.</div>';
    }
    return state.evaluations.slice(0,30).map(item => (
      '<article class="zuvyr-pack095-row">' +
        '<div class="zuvyr-pack095-row-main">' +
          '<strong>Checkpoint ' + esc(shortId(item.checkpoint_id)) + '</strong>' +
          '<span>Benchmark ' + esc(shortId(item.benchmark_id)) +
          ' · regression ' + esc(item.regression_status || 'unknown') + '</span>' +
          '<small>Task success ' +
          esc(item.task_success_bps == null ? '—' : (Number(item.task_success_bps) / 100).toFixed(2) + '%') +
          ' · cost/success ' +
          esc(item.total_cost_per_successful_task_microusd == null ? 'unknown' : item.total_cost_per_successful_task_microusd + ' µUSD') +
          ' · independent ' + (item.independent === false ? 'no' : 'yes') + '</small>' +
        '</div>' +
        badge(String(item.status || 'planned').toUpperCase(), item.status === 'passed' ? 'good' : 'neutral') +
      '</article>'
    )).join('');
  }

  function syntheticRows() {
    if (!state.syntheticJobs.length) {
      return '<div class="zuvyr-pack095-empty">No synthetic-data plans recorded.</div>';
    }
    return state.syntheticJobs.slice(0,30).map(item => (
      '<article class="zuvyr-pack095-row">' +
        '<div class="zuvyr-pack095-row-main">' +
          '<strong>Synthetic plan ' + esc(shortId(item.id)) + '</strong>' +
          '<span>Dataset ' + esc(shortId(item.target_dataset_id)) +
          ' · skill ' + esc(shortId(item.skill_id)) + '</span>' +
          '<small>Teacher source ' + esc(item.teacher_source || 'owner-created / unspecified') +
          ' · rights basis ' + esc(item.rights_basis || 'owner_created') + '</small>' +
        '</div>' +
        badge(String(item.status || 'planned').toUpperCase(), 'neutral') +
      '</article>'
    )).join('');
  }

  function selectOptions(items, valueKey, labeler, selected, emptyLabel) {
    const rows = [
      '<option value="">' + esc(emptyLabel) + '</option>'
    ];
    for (const item of items) {
      const value = item?.[valueKey] || '';
      rows.push(
        '<option value="' + esc(value) + '"' +
        (String(value) === String(selected || '') ? ' selected' : '') +
        '>' + esc(labeler(item)) + '</option>'
      );
    }
    return rows.join('');
  }

  function datasetRows() {
    if (!state.datasets.length) {
      return '<div class="zuvyr-pack095-empty">No Model Lab datasets yet.</div>';
    }
    return state.datasets.slice(0,20).map(item => {
      const active = item.status === 'active';
      return '<article class="zuvyr-pack095-row">' +
        '<div class="zuvyr-pack095-row-main">' +
          '<strong>' + esc(item.name || 'Dataset') + '</strong>' +
          '<span>' + esc(item.purpose || 'No purpose set') + '</span>' +
          '<small>Current version ' + esc(shortId(item.currentVersionId)) +
          ' · ' + esc(dateText(item.updatedAt || item.updated_at)) + '</small>' +
        '</div>' +
        '<div class="zuvyr-pack095-row-actions">' +
          badge(active ? 'ACTIVE' : String(item.status || 'unknown').toUpperCase(), active ? 'good' : 'neutral') +
          '<button type="button" data-zuvyr-pack095-select-dataset="' + esc(item.id) + '">Open</button>' +
          '<button type="button" data-zuvyr-pack095-clone-dataset="' + esc(item.id) + '">New version</button>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function connectorRows() {
    if (!state.connectors.length) {
      return '<div class="zuvyr-pack095-empty">No BYOC compute connector registered.</div>';
    }
    return state.connectors.slice(0,20).map(item => {
      const qualified = item.qualificationStatus === 'qualified';
      const ownership = Boolean(item.ownershipVerifiedAt);
      return '<article class="zuvyr-pack095-row">' +
        '<div class="zuvyr-pack095-row-main">' +
          '<strong>' + esc(item.ownershipSubject || item.connectorKind || 'Compute target') + '</strong>' +
          '<span>' + esc(item.connectorKind || '') + ' · ' +
          esc(item.endpointUrl || 'Relay target') + '</span>' +
          '<small>Ownership ' + (ownership ? 'verified' : 'pending') +
          ' · health ' + esc(item.healthStatus || 'unknown') +
          ' · credential ' + (item.credentialConfigured ? 'configured' : 'not configured') +
          ' · customer compute cost ' + (item.costKnown ? 'known' : 'unknown') + '</small>' +
        '</div>' +
        '<div class="zuvyr-pack095-row-actions">' +
          badge(qualified ? 'QUALIFIED' : String(item.qualificationStatus || 'REGISTERED').toUpperCase(), qualified ? 'good' : 'warn') +
          '<button type="button" data-zuvyr-pack095-connector-secret="' + esc(item.id) + '">Credential</button>' +
          '<button type="button" data-zuvyr-pack095-verify-connector="' + esc(item.id) + '"' +
            (ownership ? ' disabled' : '') + '>Verify</button>' +
          '<button type="button" data-zuvyr-pack095-health-connector="' + esc(item.id) + '"' +
            (!ownership ? ' disabled' : '') + '>Health</button>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function runRows() {
    if (!state.trainingRuns.length) {
      return '<div class="zuvyr-pack095-empty">No training/R&D run plans yet.</div>';
    }
    return state.trainingRuns.slice(0,20).map(item => (
      '<article class="zuvyr-pack095-row">' +
        '<div class="zuvyr-pack095-row-main">' +
          '<strong>' + esc(item.base_model_ref || 'Training run') + '</strong>' +
          '<span>Dataset ' + esc(shortId(item.dataset_version_id)) +
          ' · connector ' + esc(shortId(item.compute_connector_id)) + '</span>' +
          '<small>Customer compute: ' +
          (item.customer_compute_cost_microusd == null ? 'unknown' : esc(item.customer_compute_cost_microusd) + ' µUSD') +
          ' · ZUVYR control-plane: ' + esc(item.zuvyr_control_plane_cost_microusd || 0) + ' µUSD</small>' +
        '</div>' +
        badge(String(item.status || 'planned').toUpperCase(), item.status === 'succeeded' ? 'good' : 'neutral') +
      '</article>'
    )).join('');
  }

  function checkpointRows() {
    if (!state.checkpoints.length) {
      return '<div class="zuvyr-pack095-empty">No owned-model checkpoints recorded yet.</div>';
    }
    return state.checkpoints.slice(0,20).map(item => (
      '<article class="zuvyr-pack095-row">' +
        '<div class="zuvyr-pack095-row-main">' +
          '<strong>' + esc(item.name || 'Checkpoint') + '</strong>' +
          '<span>' + esc(item.base_model_ref || '') + ' · artifact ' + esc(shortId(item.artifact_sha256)) + '</span>' +
          '<small>Exact training run ' + esc(shortId(item.training_run_id)) +
          ' · stage ' + esc(item.current_stage || 'LAB') + '</small>' +
        '</div>' +
        '<div class="zuvyr-pack095-row-actions">' +
          badge(String(item.current_stage || 'LAB'), item.current_stage === 'PRIMARY' ? 'good' : 'neutral') +
          '<button type="button" data-zuvyr-pack095-promote="' + esc(item.id) + '">Stage</button>' +
          ((item.current_stage === 'EVAL' || item.current_stage === 'LAB')
            ? '<button type="button" data-zuvyr-pack095-rollback="' + esc(item.id) + '">Rollback</button>'
            : '') +
        '</div>' +
      '</article>'
    )).join('');
  }

  function render() {
    const root = panel();
    if (!root) return;

    if (state.loading) {
      root.innerHTML =
        '<div class="zuvyr-pack095-head"><div><span>PACK095 · MODEL LAB</span><h3>ZUVYR Model Lab</h3></div></div>' +
        '<div class="zuvyr-pack095-loading">Loading Model Lab control-plane…</div>';
      return;
    }

    if (state.error) {
      root.innerHTML =
        '<div class="zuvyr-pack095-head"><div><span>PACK095 · MODEL LAB</span><h3>ZUVYR Model Lab</h3></div>' +
        '<button type="button" data-zuvyr-pack095-refresh>Retry</button></div>' +
        '<div class="zuvyr-pack095-error">' + esc(state.error) + '</div>';
      bind();
      return;
    }

    root.innerHTML =
      '<div class="zuvyr-pack095-head">' +
        '<div><span>PACK095 · OWNER / ADMIN</span><h3>ZUVYR Model Lab</h3>' +
        '<p>Govern datasets, licenses, skills, curricula, BYOC compute, training plans, evaluations, checkpoints and rollout lineage. Credentials never return to the browser.</p></div>' +
        '<button type="button" data-zuvyr-pack095-refresh>Refresh</button>' +
      '</div>' +

      '<div class="zuvyr-pack095-lock-banner">' +
        '<div><strong>PACK096 execution boundary</strong>' +
        '<span>Live training and Router activation are intentionally OFF here. PACK095 prepares and qualifies the control-plane only.</span></div>' +
        badge('LIVE EXECUTION OFF','warn') +
      '</div>' +

      '<div class="zuvyr-pack095-metrics">' +
        [
          ['datasets','Datasets'],
          ['datasetVersions','Dataset versions'],
          ['qualifiedConnectors','Qualified compute'],
          ['trainingRuns','Training plans'],
          ['checkpoints','Checkpoints'],
          ['evaluations','Evaluations']
        ].map(([key,label]) =>
          '<article><b>' + esc(count(key)) + '</b><span>' + esc(label) + '</span></article>'
        ).join('') +
      '</div>' +

      '<details class="zuvyr-pack095-section" open>' +
        '<summary>Datasets & lineage</summary>' +
        '<form class="zuvyr-pack095-form" data-zuvyr-pack095-dataset-form>' +
          '<input name="name" maxlength="160" required placeholder="Dataset name">' +
          '<input name="purpose" maxlength="500" placeholder="Purpose">' +
          '<button class="zuvyr-pack095-primary" type="submit">Create dataset</button>' +
        '</form>' +
        '<div class="zuvyr-pack095-list">' + datasetRows() + '</div>' +
        '<div class="zuvyr-pack095-inline-tool">' +
          '<input data-zuvyr-pack095-candidate-id placeholder="PACK094 candidate UUID">' +
          '<button type="button" data-zuvyr-pack095-add-candidate>Add candidate to current version</button>' +
          '<button type="button" data-zuvyr-pack095-freeze-dataset>Freeze selected version</button>' +
        '</div>' +
      '</details>' +

      '<details class="zuvyr-pack095-section" open>' +
        '<summary>BYOC Compute Connectors</summary>' +
        '<form class="zuvyr-pack095-form is-grid" data-zuvyr-pack095-connector-form>' +
          '<select name="ownershipKind" aria-label="Compute ownership"><option value="user">User-owned</option><option value="organization">Organization-owned</option></select>' +
          '<input name="ownershipSubject" maxlength="240" required placeholder="Owner / organization label">' +
          '<select name="connectorKind" aria-label="Connector type"><option value="openai_compatible_https">OpenAI-compatible HTTPS</option><option value="custom_https">Custom HTTPS</option><option value="zuvyr_compute_relay">ZUVYR Compute Relay (PACK096)</option></select>' +
          '<input name="endpointUrl" placeholder="https://gpu.example.com">' +
          '<input name="healthPath" placeholder="/v1/models or /health">' +
          '<button class="zuvyr-pack095-primary" type="submit">Register connector</button>' +
        '</form>' +
        '<div class="zuvyr-pack095-list">' + connectorRows() + '</div>' +
      '</details>' +

      '<details class="zuvyr-pack095-section">' +
        '<summary>Training plans & checkpoints</summary>' +
        '<form class="zuvyr-pack095-form is-grid" data-zuvyr-pack095-training-form>' +
          '<select name="datasetVersionId" required>' +
            selectOptions(state.datasets, 'currentVersionId', x => x.name + ' · current version', '', 'Dataset version') +
          '</select>' +
          '<select name="computeConnectorId" required>' +
            selectOptions(state.connectors.filter(x => x.qualificationStatus === 'qualified'), 'id', x => x.ownershipSubject + ' · ' + x.connectorKind, '', 'Qualified compute') +
          '</select>' +
          '<input name="baseModelRef" required maxlength="400" placeholder="Base model reference">' +
          '<input name="baseModelLicenseReference" required maxlength="600" placeholder="Base-model license reference">' +
          '<button class="zuvyr-pack095-primary" type="submit">Create run plan</button>' +
        '</form>' +
        '<div class="zuvyr-pack095-list">' + runRows() + '</div>' +
        '<div class="zuvyr-pack095-list">' + checkpointRows() + '</div>' +
      '</details>' +

      '<details class="zuvyr-pack095-section">' +
        '<summary>Learning inputs · Candidate Pool & Failure Bank</summary>' +
        '<div class="zuvyr-pack095-note">Metadata only. Training payload content is not rendered here; PACK094 rights, consent, privacy and provenance remain the admission authority.</div>' +
        '<div class="zuvyr-pack095-two-col">' +
          '<div><h4>Eligible candidates</h4><div class="zuvyr-pack095-list">' + candidateRows() + '</div></div>' +
          '<div><h4>Failure Bank</h4><div class="zuvyr-pack095-list">' + failureRows() + '</div></div>' +
        '</div>' +
      '</details>' +

      '<details class="zuvyr-pack095-section">' +
        '<summary>Skills & curricula</summary>' +
        '<div class="zuvyr-pack095-two-col">' +
          '<div>' +
            '<form class="zuvyr-pack095-form" data-zuvyr-pack095-skill-form>' +
              '<input name="name" maxlength="120" required placeholder="Skill name">' +
              '<input name="capability" maxlength="160" placeholder="Capability">' +
              '<input name="description" maxlength="4000" placeholder="Description">' +
              '<button class="zuvyr-pack095-primary" type="submit">Create skill</button>' +
              '<button type="reset">Cancel</button>' +
            '</form>' +
            '<div class="zuvyr-pack095-list">' + skillRows() + '</div>' +
          '</div>' +
          '<div>' +
            '<form class="zuvyr-pack095-form" data-zuvyr-pack095-curriculum-form>' +
              '<input name="name" maxlength="160" required placeholder="Curriculum name">' +
              '<input name="description" maxlength="4000" placeholder="Description">' +
              '<button class="zuvyr-pack095-primary" type="submit">Create curriculum</button>' +
              '<button type="reset">Cancel</button>' +
            '</form>' +
            '<div class="zuvyr-pack095-list">' + curriculumRows() + '</div>' +
          '</div>' +
        '</div>' +
        '<form class="zuvyr-pack095-form is-grid" data-zuvyr-pack095-curriculum-link-form>' +
          '<select name="curriculumId" required>' +
            selectOptions(state.curricula, 'id', x => x.name, '', 'Curriculum') +
          '</select>' +
          '<select name="skillId" required>' +
            selectOptions(state.skills, 'id', x => x.name, '', 'Skill') +
          '</select>' +
          '<select name="datasetVersionId" required>' +
            selectOptions(state.datasets, 'currentVersionId', x => x.name + ' · current version (must be frozen)', '', 'Frozen dataset version') +
          '</select>' +
          '<input name="weightBps" type="number" min="1" max="10000" value="10000" aria-label="Weight basis points">' +
          '<input name="sequenceNo" type="number" min="1" value="1" aria-label="Sequence number">' +
          '<button class="zuvyr-pack095-primary" type="submit">Link skill</button>' +
          '<button type="reset">Cancel</button>' +
        '</form>' +
      '</details>' +

      '<details class="zuvyr-pack095-section">' +
        '<summary>Benchmarks & independent evaluations</summary>' +
        '<div class="zuvyr-pack095-two-col">' +
          '<div>' +
            '<form class="zuvyr-pack095-form" data-zuvyr-pack095-benchmark-form>' +
              '<input name="name" maxlength="160" required placeholder="Benchmark name">' +
              '<input name="version" maxlength="80" required placeholder="Version">' +
              '<select name="datasetVersionId">' +
                selectOptions(state.datasets, 'currentVersionId', x => x.name + ' · current version', '', 'Optional dataset version') +
              '</select>' +
              '<button class="zuvyr-pack095-primary" type="submit">Create benchmark</button>' +
              '<button type="reset">Cancel</button>' +
            '</form>' +
            '<div class="zuvyr-pack095-list">' + benchmarkRows() + '</div>' +
          '</div>' +
          '<div>' +
            '<form class="zuvyr-pack095-form" data-zuvyr-pack095-evaluation-form>' +
              '<select name="checkpointId" required>' +
                selectOptions(state.checkpoints, 'id', x => (x.name || 'Checkpoint') + ' · ' + (x.current_stage || 'LAB'), '', 'Checkpoint') +
              '</select>' +
              '<select name="benchmarkId" required>' +
                selectOptions(state.benchmarks, 'id', x => (x.name || 'Benchmark') + ' · ' + (x.version || ''), '', 'Benchmark') +
              '</select>' +
              '<select name="status"><option value="planned">Planned</option><option value="running">Running</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select>' +
              '<select name="regressionStatus"><option value="unknown">Regression unknown</option><option value="pass">Regression pass</option><option value="fail">Regression fail</option></select>' +
              '<input name="taskSuccessBps" type="number" min="0" max="10000" placeholder="Task success bps">' +
              '<input name="totalCostPerSuccessfulTaskMicrousd" type="number" min="0" placeholder="Cost / successful task µUSD">' +
              '<button class="zuvyr-pack095-primary" type="submit">Record evaluation</button>' +
              '<button type="reset">Cancel</button>' +
            '</form>' +
            '<div class="zuvyr-pack095-list">' + evaluationRows() + '</div>' +
          '</div>' +
        '</div>' +
      '</details>' +

      '<details class="zuvyr-pack095-section">' +
        '<summary>Synthetic-data plans</summary>' +
        '<form class="zuvyr-pack095-form is-grid" data-zuvyr-pack095-synthetic-form>' +
          '<select name="targetDatasetId" required>' +
            selectOptions(state.datasets, 'id', x => x.name, '', 'Target dataset') +
          '</select>' +
          '<select name="skillId">' +
            selectOptions(state.skills, 'id', x => x.name, '', 'Optional skill') +
          '</select>' +
          '<input name="teacherSource" maxlength="240" placeholder="Teacher source / policy reference">' +
          '<button class="zuvyr-pack095-primary" type="submit">Create planned job</button>' +
          '<button type="reset">Cancel</button>' +
        '</form>' +
        '<div class="zuvyr-pack095-note">Planning only. Synthetic generation and live model training remain disabled until the owning packs activate verified execution.</div>' +
        '<div class="zuvyr-pack095-list">' + syntheticRows() + '</div>' +
      '</details>' +

      '<div class="zuvyr-pack095-notice" data-zuvyr-pack095-notice role="status" aria-live="polite">' +
        esc(state.notice) +
      '</div>';

    bind();
  }

  async function refresh() {
    const root = panel();
    if (!root || state.loading) return;
    state.loading = true;
    state.error = '';
    render();
    try {
      const [
        summary,datasets,connectors,runs,checkpoints,benchmarks,evaluations,
        syntheticJobs,candidates,failures,skills,curricula
      ] = await Promise.all([
        api('/api/model-lab/summary'),
        api('/api/model-lab/datasets'),
        api('/api/model-lab/connectors'),
        api('/api/model-lab/training-runs'),
        api('/api/model-lab/checkpoints'),
        api('/api/model-lab/benchmarks'),
        api('/api/model-lab/evaluations'),
        api('/api/model-lab/synthetic-jobs'),
        api('/api/model-lab/candidate-pool?limit=50'),
        api('/api/model-lab/failure-bank?limit=50'),
        api('/api/model-lab/skills'),
        api('/api/model-lab/curricula')
      ]);
      state.summary = summary.summary || {};
      state.datasets = Array.isArray(datasets.datasets) ? datasets.datasets : [];
      state.connectors = Array.isArray(connectors.connectors) ? connectors.connectors : [];
      state.trainingRuns = Array.isArray(runs.trainingRuns) ? runs.trainingRuns : [];
      state.checkpoints = Array.isArray(checkpoints.checkpoints) ? checkpoints.checkpoints : [];
      state.benchmarks = Array.isArray(benchmarks.benchmarks) ? benchmarks.benchmarks : [];
      state.evaluations = Array.isArray(evaluations.evaluations) ? evaluations.evaluations : [];
      state.syntheticJobs = Array.isArray(syntheticJobs.syntheticJobs) ? syntheticJobs.syntheticJobs : [];
      state.candidates = Array.isArray(candidates.candidates) ? candidates.candidates : [];
      state.failures = Array.isArray(failures.failures) ? failures.failures : [];
      state.skills = Array.isArray(skills.skills) ? skills.skills : [];
      state.curricula = Array.isArray(curricula.curricula) ? curricula.curricula : [];
      if (!state.selectedDataset && state.datasets[0]) state.selectedDataset = state.datasets[0].id;
      state.notice = 'Model Lab state refreshed.';
    } catch (error) {
      if (error.status === 403 || error.code === 'admin_required') {
        state.denied = true;
        root.remove();
        return;
      }
      state.error = error.message || error.code || 'Model Lab could not load.';
    } finally {
      state.loading = false;
      if (!state.denied && panel()) render();
    }
  }

  async function currentDatasetDetail() {
    if (!state.selectedDataset) throw new Error('Select a dataset first.');
    const data = await api('/api/model-lab/datasets/' + encodeURIComponent(state.selectedDataset));
    return data.dataset;
  }

  async function submitDataset(form) {
    const fd = new FormData(form);
    await api('/api/model-lab/datasets', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        name:String(fd.get('name') || '').trim(),
        purpose:String(fd.get('purpose') || '').trim() || null
      })
    });
    state.notice='Dataset created.';
    await refresh();
  }

  async function submitConnector(form) {
    const fd = new FormData(form);
    const connectorKind=String(fd.get('connectorKind') || '');
    const payload={
      ownershipKind:String(fd.get('ownershipKind') || ''),
      ownershipSubject:String(fd.get('ownershipSubject') || '').trim(),
      connectorKind,
      endpointUrl:String(fd.get('endpointUrl') || '').trim() || null,
      healthPath:String(fd.get('healthPath') || '').trim() || undefined
    };
    const data=await api('/api/model-lab/connectors',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const c=data.ownershipChallenge;
    if(c?.token){
      window.prompt?.(
        'One-time ownership challenge. Publish this exact token at ' + c.path +
        ' before it expires. It will not be shown again.',
        c.token
      );
    }
    state.notice='Compute connector registered.';
    await refresh();
  }

  async function submitTraining(form) {
    const fd=new FormData(form);
    await api('/api/model-lab/training-runs',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        datasetVersionId:String(fd.get('datasetVersionId')||''),
        computeConnectorId:String(fd.get('computeConnectorId')||''),
        baseModelRef:String(fd.get('baseModelRef')||'').trim(),
        baseModelLicenseReference:String(fd.get('baseModelLicenseReference')||'').trim(),
        trainingConfig:{}
      })
    });
    state.notice='Training plan recorded. Live execution remains owned by PACK096.';
    await refresh();
  }

  async function submitSkill(form) {
    const fd=new FormData(form);
    await api('/api/model-lab/skills',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        name:String(fd.get('name')||'').trim(),
        capability:String(fd.get('capability')||'').trim()||null,
        description:String(fd.get('description')||'').trim()||null
      })
    });
    form.reset();
    state.notice='Skill created.';
    await refresh();
  }

  async function submitCurriculum(form) {
    const fd=new FormData(form);
    await api('/api/model-lab/curricula',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        name:String(fd.get('name')||'').trim(),
        description:String(fd.get('description')||'').trim()||null
      })
    });
    form.reset();
    state.notice='Curriculum created.';
    await refresh();
  }

  async function linkCurriculumSkill(form) {
    const fd=new FormData(form);
    const curriculumId=String(fd.get('curriculumId')||'').trim();
    if(!curriculumId) throw new Error('Select a curriculum.');
    await api('/api/model-lab/curricula/'+encodeURIComponent(curriculumId)+'/skills',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        skillId:String(fd.get('skillId')||'').trim(),
        datasetVersionId:String(fd.get('datasetVersionId')||'').trim(),
        weightBps:Number(fd.get('weightBps')||10000),
        sequenceNo:Number(fd.get('sequenceNo')||1)
      })
    });
    state.notice='Skill linked to frozen dataset lineage.';
    await refresh();
  }

  async function submitBenchmark(form) {
    const fd=new FormData(form);
    await api('/api/model-lab/benchmarks',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        name:String(fd.get('name')||'').trim(),
        version:String(fd.get('version')||'').trim(),
        datasetVersionId:String(fd.get('datasetVersionId')||'').trim()||null,
        definition:{source:'pack095_admin_ui'}
      })
    });
    form.reset();
    state.notice='Benchmark recorded.';
    await refresh();
  }

  async function submitEvaluation(form) {
    const fd=new FormData(form);
    const taskSuccessRaw=String(fd.get('taskSuccessBps')||'').trim();
    const costRaw=String(fd.get('totalCostPerSuccessfulTaskMicrousd')||'').trim();
    await api('/api/model-lab/evaluations',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        checkpointId:String(fd.get('checkpointId')||'').trim(),
        benchmarkId:String(fd.get('benchmarkId')||'').trim(),
        independent:true,
        status:String(fd.get('status')||'planned'),
        regressionStatus:String(fd.get('regressionStatus')||'unknown'),
        taskSuccessBps:taskSuccessRaw===''?null:Number(taskSuccessRaw),
        totalCostPerSuccessfulTaskMicrousd:costRaw===''?null:Number(costRaw),
        metrics:{source:'pack095_admin_ui'}
      })
    });
    state.notice='Independent evaluation record saved.';
    await refresh();
  }

  async function submitSynthetic(form) {
    const fd=new FormData(form);
    await api('/api/model-lab/synthetic-jobs',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        targetDatasetId:String(fd.get('targetDatasetId')||'').trim(),
        skillId:String(fd.get('skillId')||'').trim()||null,
        teacherSource:String(fd.get('teacherSource')||'').trim()||null,
        generationPolicy:{executionOwner:'PACK096',liveExecution:false}
      })
    });
    form.reset();
    state.notice='Synthetic-data job planned. No generation executed.';
    await refresh();
  }

  async function addCandidate() {
    const dataset=await currentDatasetDetail();
    const versionId=dataset?.currentVersionId || dataset?.versions?.[0]?.id;
    if(!versionId) throw new Error('Current dataset version is unavailable.');
    const candidateId=String(panel()?.querySelector('[data-zuvyr-pack095-candidate-id]')?.value||'').trim();
    if(!candidateId) throw new Error('Enter a PACK094 candidate UUID.');
    await api('/api/model-lab/dataset-versions/'+encodeURIComponent(versionId)+'/candidates',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({candidateId})
    });
    state.notice='Eligible PACK094 candidate added.';
    await refresh();
  }

  async function freezeSelected() {
    const dataset=await currentDatasetDetail();
    const versionId=dataset?.currentVersionId || dataset?.versions?.[0]?.id;
    if(!versionId) throw new Error('Current dataset version is unavailable.');
    await api('/api/model-lab/dataset-versions/'+encodeURIComponent(versionId)+'/freeze',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:'{}'
    });
    state.notice='Dataset version frozen with exact rights/license lineage.';
    await refresh();
  }

  async function connectorSecret(id) {
    const credential=window.prompt?.('Compute credential. It is stored server-side in Supabase Vault and is never returned to the browser.','');
    if(!credential) return;
    await api('/api/model-lab/connectors/'+encodeURIComponent(id)+'/credential',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({credential})
    });
    state.notice='Credential stored in server-side Vault.';
    await refresh();
  }

  async function verifyConnector(id) {
    const challengeToken=window.prompt?.('Paste the one-time ownership challenge that is currently published by the compute endpoint.','');
    if(!challengeToken) return;
    await api('/api/model-lab/connectors/'+encodeURIComponent(id)+'/verify-ownership',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({challengeToken})
    });
    state.notice='Compute endpoint ownership verified.';
    await refresh();
  }

  async function healthConnector(id) {
    await api('/api/model-lab/connectors/'+encodeURIComponent(id)+'/health-check',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:'{}'
    });
    state.notice='Health/capability attestation recorded.';
    await refresh();
  }

  async function cloneDataset(id) {
    await api('/api/model-lab/datasets/'+encodeURIComponent(id)+'/versions',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:'{}'
    });
    state.selectedDataset=id;
    state.notice='New draft dataset version created.';
    await refresh();
  }

  async function promoteCheckpoint(id) {
    const stage=String(window.prompt?.(
      'Target adjacent stage: LAB, EVAL, SHADOW, CANARY, SECONDARY, PRIMARY',
      'EVAL'
    )||'').trim().toUpperCase();
    if(!stage) return;
    let evaluationId=null;
    if(!['LAB','EVAL'].includes(stage)){
      evaluationId=String(window.prompt?.('Independent passing evaluation UUID required for this stage.','')||'').trim()||null;
    }
    await api('/api/model-lab/checkpoints/'+encodeURIComponent(id)+'/promote',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({targetStage:stage,evaluationId})
    });
    state.notice='Checkpoint stage updated with audit evidence.';
    await refresh();
  }

  function bind() {
    const root=panel();
    if(!root) return;
    root.querySelector('[data-zuvyr-pack095-refresh]')?.addEventListener('click',()=>void refresh());

    root.querySelector('[data-zuvyr-pack095-dataset-form]')?.addEventListener('submit',event=>{
      event.preventDefault();
      void submitDataset(event.currentTarget).catch(error=>notice(error.message));
    });
    root.querySelector('[data-zuvyr-pack095-connector-form]')?.addEventListener('submit',event=>{
      event.preventDefault();
      void submitConnector(event.currentTarget).catch(error=>notice(error.message));
    });
    root.querySelector('[data-zuvyr-pack095-training-form]')?.addEventListener('submit',event=>{
      event.preventDefault();
      void submitTraining(event.currentTarget).catch(error=>notice(error.message));
    });

    root.querySelector('[data-zuvyr-pack095-skill-form]')?.addEventListener('submit',event=>{
      event.preventDefault();
      void submitSkill(event.currentTarget).catch(error=>notice(error.message));
    });
    root.querySelector('[data-zuvyr-pack095-curriculum-form]')?.addEventListener('submit',event=>{
      event.preventDefault();
      void submitCurriculum(event.currentTarget).catch(error=>notice(error.message));
    });
    root.querySelector('[data-zuvyr-pack095-curriculum-link-form]')?.addEventListener('submit',event=>{
      event.preventDefault();
      void linkCurriculumSkill(event.currentTarget).catch(error=>notice(error.message));
    });
    root.querySelector('[data-zuvyr-pack095-benchmark-form]')?.addEventListener('submit',event=>{
      event.preventDefault();
      void submitBenchmark(event.currentTarget).catch(error=>notice(error.message));
    });
    root.querySelector('[data-zuvyr-pack095-evaluation-form]')?.addEventListener('submit',event=>{
      event.preventDefault();
      void submitEvaluation(event.currentTarget).catch(error=>notice(error.message));
    });
    root.querySelector('[data-zuvyr-pack095-synthetic-form]')?.addEventListener('submit',event=>{
      event.preventDefault();
      void submitSynthetic(event.currentTarget).catch(error=>notice(error.message));
    });

    root.querySelectorAll('[data-zuvyr-pack095-select-dataset]').forEach(button=>{
      button.addEventListener('click',()=>{
        state.selectedDataset=button.dataset.zuvyrPack095SelectDataset;
        notice('Dataset selected.');
      });
    });
    root.querySelectorAll('[data-zuvyr-pack095-clone-dataset]').forEach(button=>{
      button.addEventListener('click',()=>void cloneDataset(button.dataset.zuvyrPack095CloneDataset).catch(error=>notice(error.message)));
    });
    root.querySelector('[data-zuvyr-pack095-add-candidate]')?.addEventListener('click',()=>void addCandidate().catch(error=>notice(error.message)));
    root.querySelector('[data-zuvyr-pack095-freeze-dataset]')?.addEventListener('click',()=>void freezeSelected().catch(error=>notice(error.message)));

    root.querySelectorAll('[data-zuvyr-pack095-connector-secret]').forEach(button=>{
      button.addEventListener('click',()=>void connectorSecret(button.dataset.zuvyrPack095ConnectorSecret).catch(error=>notice(error.message)));
    });
    root.querySelectorAll('[data-zuvyr-pack095-verify-connector]').forEach(button=>{
      button.addEventListener('click',()=>void verifyConnector(button.dataset.zuvyrPack095VerifyConnector).catch(error=>notice(error.message)));
    });
    root.querySelectorAll('[data-zuvyr-pack095-health-connector]').forEach(button=>{
      button.addEventListener('click',()=>void healthConnector(button.dataset.zuvyrPack095HealthConnector).catch(error=>notice(error.message)));
    });
    root.querySelectorAll('[data-zuvyr-pack095-promote]').forEach(button=>{
      button.addEventListener('click',()=>void promoteCheckpoint(button.dataset.zuvyrPack095Promote).catch(error=>notice(error.message)));
    });
    root.querySelectorAll('[data-zuvyr-pack095-rollback]').forEach(button=>{
      button.addEventListener('click',()=>void rollbackCheckpoint(button.dataset.zuvyrPack095Rollback).catch(error=>notice(error.message)));
    });
  }

  function install() {
    if(state.installed || state.denied) return;
    const screen=settingsScreen();
    if(!screen) return;
    if(panel()){state.installed=true;return;}

    const root=document.createElement('section');
    root.className='zuvyr-pack095-model-lab';
    root.setAttribute('data-zuvyr-pack095-model-lab','true');
    root.innerHTML='<div class="zuvyr-pack095-loading">Loading Model Lab…</div>';

    const pack094=screen.querySelector('[data-zuvyr-pack094-data-rights]');
    if(pack094?.nextSibling){
      pack094.parentNode.insertBefore(root,pack094.nextSibling);
    }else{
      screen.appendChild(root);
    }
    state.installed=true;
    void refresh();
  }

  const observer=new MutationObserver(()=>install());
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{
      install();
      observer.observe(document.documentElement,{childList:true,subtree:true});
    },{once:true});
  }else{
    install();
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
})();
