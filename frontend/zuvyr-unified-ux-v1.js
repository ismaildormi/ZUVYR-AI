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
