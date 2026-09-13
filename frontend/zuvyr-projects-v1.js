(function () {
  'use strict';

  const state = {
    projects: [],
    selectedId: null,
    loading: false
  };

  function screen() {
    return document.getElementById('screen-projects');
  }

  async function api(path, options) {
    if (typeof window.authFetch !== 'function') {
      throw new Error('auth_unavailable');
    }
    const response = await window.authFetch(
      '/api/workspace' + path,
      options || {}
    );
    let body = {};
    try { body = await response.json(); } catch (_) {}
    if (!response.ok || body.status !== 'success') {
      const error = new Error(body.code || 'workspace_project_request_failed');
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function fmtDate(value) {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(value));
    } catch (_) {
      return '';
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setNotice(root, message, type) {
    const notice = root.querySelector('.zuvyr-projects-notice');
    if (!notice) return;
    notice.textContent = message || '';
    notice.dataset.type = type || '';
    notice.hidden = !message;
  }

  async function loadProjects(force) {
    if (state.loading && !force) return;
    const root = screen();
    if (!root) return;

    state.loading = true;
    root.classList.add('zuvyr-projects-loading');

    try {
      const body = await api('/projects?archived=false&limit=100', {
        method: 'GET',
        cache: 'no-store'
      });
      state.projects = Array.isArray(body.projects) ? body.projects : [];
      render(root);
      renderRecent();
      setNotice(root, '', '');
    } catch (error) {
      setNotice(
        root,
        error.message === 'auth_unavailable'
          ? 'Sign in to load your projects.'
          : 'Projects could not be loaded.',
        'error'
      );
    } finally {
      state.loading = false;
      root.classList.remove('zuvyr-projects-loading');
    }
  }

  async function createProject(root, form) {
    const name = String(form.elements.name.value || '').trim();
    const description =
      String(form.elements.description.value || '').trim();

    if (!name) {
      setNotice(root, 'Project name is required.', 'error');
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;

    try {
      const body = await api('/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project: {
            name,
            description: description || null,
            sharedContextEnabled:
              Boolean(form.elements.sharedContextEnabled.checked)
          }
        })
      });
      form.reset();
      state.selectedId = body.project && body.project.id || null;
      await loadProjects(true);
      if (state.selectedId) await openProject(state.selectedId);
      setNotice(root, 'Project created.', 'success');
    } catch (_) {
      setNotice(root, 'Project could not be created.', 'error');
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function archiveProject(projectId) {
    const root = screen();
    if (!root) return;
    try {
      await api('/projects/' + encodeURIComponent(projectId), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: true })
      });
      state.selectedId = null;
      await loadProjects(true);
      setNotice(root, 'Project archived.', 'success');
    } catch (_) {
      setNotice(root, 'Project could not be archived.', 'error');
    }
  }

  async function renameProject(projectId, name, description, shared) {
    const root = screen();
    if (!root) return;
    try {
      await api('/projects/' + encodeURIComponent(projectId), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || null,
          sharedContextEnabled: Boolean(shared)
        })
      });
      await loadProjects(true);
      await openProject(projectId);
      setNotice(root, 'Project updated.', 'success');
    } catch (_) {
      setNotice(root, 'Project could not be updated.', 'error');
    }
  }

  function renderProjectDetail(root, project) {
    const host = root.querySelector('.zuvyr-project-detail');
    if (!host) return;
    host.replaceChildren();

    const top = el('div', 'zuvyr-project-detail-top');
    const title = el('div');
    title.append(
      el('span', 'zuvyr-project-eyebrow', 'PROJECT'),
      el('h3', '', project.name || 'Project')
    );
    const close = el('button', 'zuvyr-project-icon-btn', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close project details');
    close.addEventListener('click', () => {
      state.selectedId = null;
      host.replaceChildren();
      host.hidden = true;
    });
    top.append(title, close);

    const form = el('form', 'zuvyr-project-edit-form');
    const name = el('input', 'zuvyr-project-input');
    name.name = 'name';
    name.maxLength = 120;
    name.required = true;
    name.value = project.name || '';

    const description = el('textarea', 'zuvyr-project-input');
    description.name = 'description';
    description.maxLength = 2000;
    description.rows = 3;
    description.value = project.description || '';

    const contextLabel = el('label', 'zuvyr-project-check');
    const shared = document.createElement('input');
    shared.type = 'checkbox';
    shared.checked = Boolean(project.shared_context_enabled);
    contextLabel.append(
      shared,
      el('span', '', 'Use linked project context')
    );

    const actions = el('div', 'zuvyr-project-edit-actions');
    const save = el('button', 'zuvyr-project-primary', 'Save');
    save.type = 'submit';
    const archive = el('button', 'zuvyr-project-danger', 'Archive');
    archive.type = 'button';
    archive.addEventListener('click', () => archiveProject(project.id));
    actions.append(save, archive);

    form.append(name, description, contextLabel, actions);
    form.addEventListener('submit', event => {
      event.preventDefault();
      renameProject(
        project.id,
        name.value.trim(),
        description.value.trim(),
        shared.checked
      );
    });

    const resources = el('div', 'zuvyr-project-resources');
    resources.append(
      el(
        'div',
        'zuvyr-project-resource-heading',
        `Linked items · ${Number(project.item_count || 0)}`
      )
    );

    const items = Array.isArray(project.items) ? project.items : [];
    if (!items.length) {
      resources.append(
        el(
          'p',
          'zuvyr-project-empty-small',
          'No linked conversations, content, tasks, or deployments yet.'
        )
      );
    } else {
      items.forEach(item => {
        const row = el('div', 'zuvyr-project-resource');
        const copy = el('div');
        copy.append(
          el('strong', '', item.name || 'Project item'),
          el(
            'span',
            '',
            item.resource_type ||
              item.metadata?.resourceType ||
              item.kind ||
              'item'
          )
        );
        row.append(copy);
        resources.append(row);
      });
    }

    host.append(top, form, resources);
    host.hidden = false;
  }

  async function openProject(projectId) {
    const root = screen();
    if (!root) return;
    state.selectedId = projectId;
    try {
      const body = await api(
        '/projects/' + encodeURIComponent(projectId),
        { method: 'GET', cache: 'no-store' }
      );
      renderProjectDetail(root, body.project);
    } catch (_) {
      setNotice(root, 'Project details could not be loaded.', 'error');
    }
  }

  function render(root) {
    let shell = root.querySelector('.zuvyr-projects-shell');
    if (!shell) {
      root
        .querySelectorAll(':scope > .section-title, :scope > .placeholder-view')
        .forEach(node => {
          node.hidden = true;
        });

      shell = el('div', 'zuvyr-projects-shell');

      const hero = el('div', 'zuvyr-projects-hero');
      const copy = el('div');
      copy.append(
        el('span', 'zuvyr-project-eyebrow', 'ZUVYR WORKSPACE'),
        el('h2', '', 'Projects'),
        el(
          'p',
          '',
          'Keep conversations, content, tasks, deployments, and project context together.'
        )
      );

      const refresh = el('button', 'zuvyr-project-secondary', 'Refresh');
      refresh.type = 'button';
      refresh.addEventListener('click', () => loadProjects(true));
      hero.append(copy, refresh);

      const notice = el('div', 'zuvyr-projects-notice');
      notice.hidden = true;

      const create = el('form', 'zuvyr-project-create');
      const name = el('input', 'zuvyr-project-input');
      name.name = 'name';
      name.placeholder = 'Project name';
      name.maxLength = 120;
      name.required = true;

      const description = el('input', 'zuvyr-project-input');
      description.name = 'description';
      description.placeholder = 'Description (optional)';
      description.maxLength = 2000;

      const contextLabel = el('label', 'zuvyr-project-check');
      const context = document.createElement('input');
      context.type = 'checkbox';
      context.name = 'sharedContextEnabled';
      contextLabel.append(
        context,
        el('span', '', 'Shared project context')
      );

      const createButton = el(
        'button',
        'zuvyr-project-primary',
        'Create project'
      );
      createButton.type = 'submit';

      create.append(name, description, contextLabel, createButton);
      create.addEventListener('submit', event => {
        event.preventDefault();
        createProject(root, create);
      });

      const layout = el('div', 'zuvyr-projects-layout');
      const list = el('div', 'zuvyr-projects-list');
      const detail = el('aside', 'zuvyr-project-detail');
      detail.hidden = true;
      layout.append(list, detail);

      shell.append(hero, notice, create, layout);
      root.append(shell);
    }

    const list = shell.querySelector('.zuvyr-projects-list');
    list.replaceChildren();

    if (!state.projects.length) {
      const empty = el('div', 'zuvyr-projects-empty');
      empty.append(
        el('strong', '', 'No projects yet'),
        el('span', '', 'Create your first real persisted project above.')
      );
      list.append(empty);
      return;
    }

    state.projects.forEach(project => {
      const card = el('button', 'zuvyr-project-card');
      card.type = 'button';
      card.dataset.projectId = project.id;

      const top = el('div', 'zuvyr-project-card-top');
      top.append(
        el('strong', '', project.name || 'Untitled project'),
        el(
          'span',
          'zuvyr-project-context-badge',
          project.shared_context_enabled ? 'Context on' : 'Context off'
        )
      );

      const description = el(
        'p',
        '',
        project.description || 'No description'
      );
      const meta = el(
        'span',
        'zuvyr-project-card-meta',
        project.updated_at ? 'Updated ' + fmtDate(project.updated_at) : ''
      );

      card.append(top, description, meta);
      card.addEventListener('click', () => openProject(project.id));
      list.append(card);
    });
  }

  function recentSection() {
    const title = document.querySelector(
      '[data-i18n="common.recentProjects"]'
    );
    if (!title) return null;
    const header = title.closest('.section-title');
    return header && header.parentElement
      ? { header, host: header.parentElement }
      : null;
  }

  function renderRecent() {
    const found = recentSection();
    if (!found) return;

    found.host
      .querySelectorAll(':scope > .prow')
      .forEach(row => row.remove());
    found.host
      .querySelectorAll(':scope > [data-zuvyr-real-project]')
      .forEach(row => row.remove());

    state.projects.slice(0, 4).forEach(project => {
      const row = el('button', 'prow zuvyr-real-project');
      row.type = 'button';
      row.dataset.zuvyrRealProject = '1';

      const thumb = el('span', 'thumb zuvyr-project-thumb');
      const copy = el('span');
      copy.append(
        el('span', 't', project.name || 'Project'),
        el(
          'span',
          's',
          project.updated_at ? 'Updated ' + fmtDate(project.updated_at) : ''
        )
      );
      const chev = el('span', 'chev', '›');

      row.append(thumb, copy, chev);
      row.addEventListener('click', () => {
        const nav = document.querySelector('[data-tab="projects"]');
        if (nav) nav.click();
        setTimeout(() => openProject(project.id), 0);
      });

      found.host.append(row);
    });
  }

  function setup() {
    const root = screen();
    if (!root || root.dataset.zuvyrProjectsV1 === '1') return;
    root.dataset.zuvyrProjectsV1 = '1';

    // Remove production-looking demo rows before any API request completes.
    const found = recentSection();
    if (found) {
      found.host
        .querySelectorAll(':scope > .prow')
        .forEach(row => row.remove());
    }

    render(root);

    document.addEventListener('click', event => {
      const projectNav = event.target.closest(
        '[data-tab="projects"], [data-open="projects"]'
      );
      if (projectNav) {
        setTimeout(() => loadProjects(false), 0);
      }
    });

    window.addEventListener('rox:auth-changed', () => {
      state.projects = [];
      state.selectedId = null;
      loadProjects(true);
    });

    // Auth may already be ready by the time this enhancement loads.
    setTimeout(() => loadProjects(false), 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
})();
