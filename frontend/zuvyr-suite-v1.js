(function () {
  'use strict';
  if (window.__zuvyrSuiteV1Loaded) return;
  window.__zuvyrSuiteV1Loaded = true;

  var sections = [
    ['dashboard','⌂','Dashboard','ready'],['images','◇','Images','connect'],['video','▷','Video','connect'],
    ['code','</>','Code Studio','ready'],['voice','◉','Voice','connect'],['music','♫','Music','connect'],
    ['ip','✦','ZUVYR IP','plan'],['research','⌕','Research','connect'],['library','▦','Library','ready'],
    ['projects','▣','Projects','ready'],['documents','▤','Documents','ready'],['spreadsheets','▥','Spreadsheets','ready'],
    ['presentations','▧','Presentations','ready'],['scheduled','◷','Scheduled','blocked'],['plugins','⌘','Plugins','blocked'],
    ['usage','◫','Usage & Billing','ready'],['analytics','⌁','Analytics','validate'],['settings','⚙','Settings','ready']
  ];
  var copy = {
    dashboard:['Work','Continue projects, assets, research, code and history from one coordinated workspace.'],
    images:['Images','Generate, edit, upscale and organize visual assets after a verified provider is connected.'],
    video:['Video','Plan text-to-video, image-to-video, editing, subtitles and export in one job surface.'],
    code:['Code Studio','Build multi-file projects and request approved image or video assets when the experience needs them.'],
    voice:['Voice','Prepare transcription, speech and voice conversations with transparent minute usage.'],
    music:['Music & Audio','Create music, effects, cleanup and remix workflows after pricing is verified.'],
    ip:['ZUVYR IP','Plan work across every ZUVYR capability with exact permissions, audit and STOP controls.'],
    research:['Research','Plan web search, deep research and shopping with sources and handoffs.'],
    library:['Library','Find and organize images, documents, media and generated outputs.'],
    projects:['Projects','Keep chats, files, media, code and task context together.'],
    documents:['Documents','Draft, review and prepare export-ready documents with source awareness.'],
    spreadsheets:['Spreadsheets','Structure data, formulas, analysis and chart-ready results.'],
    presentations:['Presentations','Turn approved outlines, documents and media into coherent slides.'],
    scheduled:['Scheduled Tasks','Prepare one-time and recurring tasks. Execution remains disabled until notification safety is verified.'],
    plugins:['Plugins','Discover integrations and inspect required permissions before installation is enabled.'],
    usage:['Usage & Billing','Keep subscription allowance, weekly limits and persistent top-up credits visibly separate.'],
    analytics:['Analytics','Review product usage and financial signals after production data validation.'],
    settings:['Settings','Manage language, appearance, privacy, devices, billing and data controls.']
  };

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]; }); }
  function statusLabel(state) { return state === 'ready' ? 'Foundation ready' : state === 'plan' ? 'Planning only' : state === 'validate' ? 'Validate data' : state === 'blocked' ? 'Safety blocked' : 'Connect provider'; }
  function navHtml() {
    var groups = [['Workspace',sections.slice(0,10)],['Create & manage',sections.slice(10,15)],['Account',sections.slice(15)]];
    return groups.map(function (group) {
      return '<div class="zs-nav-title">'+group[0]+'</div><nav class="zs-nav">'+group[1].map(function (s) {
        return '<button type="button" data-zs-nav="'+s[0]+'"><span class="zs-nav-icon">'+s[1]+'</span><span>'+s[2]+'</span>'+(s[3] === 'connect' || s[3] === 'blocked' ? '<i class="zs-nav-badge" aria-hidden="true"></i>' : '')+'</button>';
      }).join('')+'</nav>';
    }).join('');
  }
  function heading(id) {
    var item = sections.find(function (s) { return s[0] === id; });
    var state = item ? item[3] : 'connect';
    return '<div class="zs-heading"><div><div class="zs-eyebrow">ZUVYR / '+esc(copy[id][0])+'</div><h1>'+esc(copy[id][0])+'</h1><p>'+esc(copy[id][1])+'</p></div><span class="zs-status '+(state === 'ready' ? 'ready' : '')+'">'+statusLabel(state)+'</span></div>';
  }
  function orchestrator(id) {
    var defaults = id === 'code' ? 'Create a premium website with animated video and original images' : 'Describe the result you want ZUVYR to coordinate';
    return '<div class="zs-card wide"><h2>Cross-feature project</h2><p>ZUVYR proposes an ordered workflow. Media creation requires your permission and execution stays blocked until provider pricing is verified.</p><form data-zs-plan-form><div class="zs-field"><label for="zs-goal-'+id+'">Goal</label><textarea id="zs-goal-'+id+'" name="goal" placeholder="'+esc(defaults)+'"></textarea></div><div class="zs-checks">'+
      ['research','images','video','audio','code','documents','presentations','project'].map(function (o) { return '<label class="zs-check"><input type="checkbox" name="outputs" value="'+o+'" '+(id === 'code' && ['research','images','video','code','project'].indexOf(o)>-1?'checked':'')+'> '+o.charAt(0).toUpperCase()+o.slice(1)+'</label>'; }).join('')+
      '</div><label class="zs-consent"><input type="checkbox" name="consent"> I explicitly allow ZUVYR to include any selected image, video or audio creation in this proposal. No credits are spent by planning.</label><div class="zs-actions"><button class="zs-primary" type="submit">Build safe plan</button><span class="zs-hint">Proposal only · No provider call · No credit charge</span></div></form><div class="zs-result" data-zs-plan-result></div></div>';
  }
  function toolCards(id) {
    var maps = {
      images:[['Generate','Prompt, reference, ratio and resolution'],['Edit','Variations, inpainting and expand'],['Enhance','Remove background, upscale and repair']],
      video:[['Generate','Text or image to video'],['Jobs','Queue, progress, preview and cancel'],['Edit & export','Extend, subtitles and enhance']],
      voice:[['Transcribe','Speech to text with minute tracking'],['Speak','Text to speech and voice selection'],['Voice chat','Transcript, waveform and STOP']],
      music:[['Music','Prompt, duration and variants'],['Audio tools','Cleanup, remix and stems'],['Audio to video','Scenes, subtitles and export']],
      research:[['Web Search','Live sources and citations'],['Deep Research','Multi-round plan and verification'],['Shopping','Products, prices and specs']],
      library:[['All assets','Search, filters and folders'],['Universal actions','Ask, Edit, Verify, Translate, Search and Save'],['Handoffs & versions','Send-To, compare, restore and Undo']],
  projects:[['Work context','Projects, linked content and task context'],['Cross-surface handoffs','Library, Research, Code and media references'],['History & versions','Decisions, affected files and reversible results']],
  documents:[['Editor','Write, edit and comment'],['Sources','Citations and linked files'],['Delivery','Review and export']],
      spreadsheets:[['Data','Tables, imports and cleanup'],['Analysis','Formulas and validation'],['Charts','Visual summaries and export']],
      presentations:[['Outline','Narrative and slide structure'],['Design','Templates, media and layouts'],['Export','Review and delivery']],
      scheduled:[['Schedule','Once or recurring'],['History','Runs and notifications'],['Controls','Pause and delete']],
      plugins:[['Discover','Search the marketplace'],['Permissions','Inspect requested access'],['Connections','Connect or disconnect']],
      analytics:[['Usage','7 and 30 day views'],['Cost','Provider and feature cost'],['Margin','Revenue, profit and risk reserve']],
      settings:[['Account & preferences','Profile, language and appearance'],['Plans, credits & usage','Allowance, top-up credits and billing visibility'],['Privacy & permissions','Permission Center, Memory and data controls']]
    };
    return '<div class="zs-tool-grid">'+(maps[id] || []).map(function (t) { return '<article class="zs-tool"><div class="zs-tool-top"><span class="zs-tool-icon">✦</span><span class="zs-tool-state">'+(sections.find(function(s){return s[0]===id;})[3] === 'ready' ? 'foundation' : 'connect')+'</span></div><h3>'+t[0]+'</h3><p>'+t[1]+'</p></article>'; }).join('')+'</div>';
  }
  function dashboard() {
    return heading('dashboard')+'<div class="zs-banner"><span>✦</span><div><b>One goal, connected capabilities.</b> ZUVYR passes approved research and assets into the next step instead of isolating every tool.</div></div><div class="zs-grid">'+
      orchestrator('dashboard')+
      '<div class="zs-card"><h2>5-hour allowance</h2><p>Subscription wallet</p><div class="zs-kpi"><strong>—</strong><span>Connect live usage</span></div><div class="zs-progress"><span style="width:0%"></span></div></div>'+
      '<div class="zs-card half"><h2>Capability network</h2><p>Approved results move between tools through explicit handoffs.</p><div class="zs-orbit"><div><div class="zs-orbit-core">ZUVYR</div><div class="zs-orbit-list"><span class="zs-chip">Research → Code</span><span class="zs-chip">Images → Code</span><span class="zs-chip">Audio → Video</span><span class="zs-chip">Library → Projects</span></div></div></div></div>'+
      '<div class="zs-card half"><h2>Launch safety</h2><p>These foundations are visible without pretending unavailable providers are live.</p><div class="zs-chip-row"><span class="zs-chip">Unknown price: blocked</span><span class="zs-chip">Extra media: consent</span><span class="zs-chip">Credits: reserve first</span><span class="zs-chip">IP device control: off</span></div></div></div>';
  }
  function ipView() {
    var scopes=['chat.read','images.propose','video.propose','audio.propose','code.propose','research.propose','library.read','projects.propose','documents.propose','spreadsheets.propose','presentations.propose','scheduled_tasks.propose','plugins.read'];
    return heading('ip')+'<div class="zs-grid"><div class="zs-card wide"><h2>Permission-scoped tool plan</h2><p>Select exactly what ZUVYR IP may include. Wildcards, shell, filesystem writes and device control are unavailable.</p><form data-zs-ip-form><div class="zs-field"><label for="zs-ip-goal">Goal</label><textarea id="zs-ip-goal" name="goal" placeholder="Plan a multi-step project across ZUVYR"></textarea></div><div class="zs-checks">'+scopes.map(function(s){return '<label class="zs-check"><input type="checkbox" name="scopes" value="'+s+'"> '+s+'</label>';}).join('')+'</div><label class="zs-consent"><input type="checkbox" name="consent"> I approve these exact planning scopes. This does not approve device control, provider calls or spending.</label><div class="zs-actions"><button class="zs-primary" type="submit">Create IP plan</button><span class="zs-hint">Audit + STOP required</span></div></form><div class="zs-result" data-zs-ip-result></div></div><div class="zs-card"><h2>Safety core</h2><div class="zs-chip-row"><span class="zs-chip">Exact scopes</span><span class="zs-chip">Confirmation</span><span class="zs-chip">Live audit</span><span class="zs-chip">STOP</span><span class="zs-chip">Undo plan</span></div><p class="zs-note">Computer control remains disabled until a trusted device agent and rollback evidence exist.</p></div></div>';
  }
  // Usage UI 18: the Usage/Billing surface shares the exact same account source as the sidebar.
  let usageState='idle', usageData=null, usageRequest=0, usageOwner=null;

  function usageView() {
    return suite.querySelector('[data-zs-view="usage"]');
  }

  function usageWindowLabel(windowValue) {
    if (!windowValue || windowValue.state === 'unavailable') return 'Unavailable';
    if (windowValue.state === 'unconfigured') return 'Not configured';
    if (windowValue.state === 'expired') return 'Renewing';
    if (windowValue.state === 'not_started') return 'Not started';
    if (
      windowValue.state === 'active' &&
      Number.isSafeInteger(windowValue.remaining) &&
      Number.isSafeInteger(windowValue.total)
    ) {
      return `${windowValue.remaining} / ${windowValue.total} remaining`;
    }
    return 'Unavailable';
  }

  function usagePlanLabel(data) {
    const plan = String(data?.plan || 'free').trim().toUpperCase();
    return plan || 'FREE';
  }

  function usageWarningLines(data) {
    const warnings = data?.warnings || {};
    const lines = [];

    if (
      Number.isSafeInteger(
        warnings.fiveHourRemainingPercentThreshold
      )
    ) {
      lines.push(
        `5H capacity is at or below ${warnings.fiveHourRemainingPercentThreshold}% remaining.`
      );
    }

    if (
      Number.isSafeInteger(
        warnings.weeklyRemainingPercentThreshold
      )
    ) {
      lines.push(
        `Weekly protection is at or below ${warnings.weeklyRemainingPercentThreshold}% remaining.`
      );
    }

    return lines;
  }

  function usageHistoryHtml(data) {
    const items = Array.isArray(data?.recentRequests)
      ? data.recentRequests
      : Array.isArray(data?.recentChat)
        ? data.recentChat
        : [];

    if (!items.length) {
      return '<div class="zs-muted">No recent metered requests.</div>';
    }

    return items.slice(0, 10).map(item => {
      const capability = esc(
        String(item.capability || 'request').toUpperCase()
      );
      const state = esc(
        String(item.state || 'unknown')
      );
      const funding = esc(
        String(item.fundingSource || '—')
      );
      const credits =
        Number.isSafeInteger(item.creditsCharged)
          ? `${item.creditsCharged} credits`
          : 'Pending';
      const created = item.createdAt
        ? new Date(item.createdAt).toLocaleString()
        : '—';

      return `
        <div style="display:grid;grid-template-columns:minmax(80px,1fr) minmax(70px,.8fr) minmax(80px,1fr);gap:8px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.08)">
          <span><strong>${capability}</strong><br><small>${esc(created)}</small></span>
          <span>${state}<br><small>${funding}</small></span>
          <span style="text-align:right">${esc(credits)}</span>
        </div>`;
    }).join('');
  }

  function bindUsageActions(box) {
    if (!box || typeof box.querySelector !== 'function') return;

    const upgrade = box.querySelector(
      '[data-zs-usage-upgrade]'
    );
    const topup = box.querySelector(
      '[data-zs-usage-topup]'
    );

    if (upgrade) {
      upgrade.onclick = () => {
        const button =
          document.getElementById?.('upgradeBtn') ||
          document.getElementById?.('settingsUpgradeBtn');
        button?.click?.();
      };
    }

    if (topup) {
      topup.onclick = () => {
        document.getElementById?.('topupBtn')?.click?.();
      };
    }
  }

  function renderUsage() {
    const view = usageView();
    if (!view) return;

    const box =
      view.querySelector('[data-zs-usage-content]');
    const refresh =
      view.querySelector('[data-zs-usage-refresh]');
    const title =
      view.querySelector('h1');
    const intro =
      view.querySelector('[data-zs-usage-intro]') ||
      view.querySelector('p');

    if (title) title.textContent = 'Usage & Billing';
    if (intro) {
      intro.textContent =
        'One live source for your plan, included capacity, purchased credits and metered request history.';
    }

    if (refresh) {
      refresh.onclick = () => loadUsage(true);
      refresh.disabled = usageState === 'loading';
    }

    if (!box) return;

    if (usageState === 'loading') {
      box.textContent = 'Loading current usage…';
      return;
    }

    if (usageState === 'error') {
      box.textContent =
        'Could not load usage. Retry to get current account values.';
      return;
    }

    if (usageState !== 'loaded' || !usageData) {
      box.textContent = 'Usage is not loaded yet.';
      return;
    }

    const warnings = usageWarningLines(usageData);
    const topup =
      Number.isSafeInteger(usageData.topupCredits)
        ? usageData.topupCredits
        : 'Unavailable';

    box.innerHTML = `
      <div data-zs-usage-source="zuvyr-usage-summary" style="display:grid;gap:14px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
          <div class="zs-card"><small>Plan</small><br><strong>${esc(usagePlanLabel(usageData))}</strong></div>
          <div class="zs-card"><small>5H capacity</small><br><strong>${esc(usageWindowLabel(usageData.fiveHour))}</strong></div>
          <div class="zs-card"><small>Weekly protection</small><br><strong>${esc(usageWindowLabel(usageData.weekly))}</strong></div>
          <div class="zs-card"><small>Top-up balance</small><br><strong>${esc(String(topup))}</strong></div>
        </div>
        ${
          warnings.length
            ? `<div role="status" style="padding:10px 12px;border:1px solid rgba(245,184,0,.35);border-radius:12px">${warnings.map(line => `<div>⚠ ${esc(line)}</div>`).join('')}</div>`
            : '<div class="zs-muted">No capacity warning right now.</div>'
        }
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button type="button" data-zs-usage-upgrade>Upgrade plan</button>
          <button type="button" data-zs-usage-topup>Buy top-up credits</button>
          <button type="button" data-zs-usage-refresh>Refresh</button>
        </div>
        <div>
          <strong>Recent requests</strong>
          <div style="margin-top:6px">${usageHistoryHtml(usageData)}</div>
        </div>
      </div>`;

    bindUsageActions(box);
  }

  async function fetchUnifiedUsage(force = false) {
    if (
      typeof window.getZuvyrUnifiedUsageSummary === 'function'
    ) {
      return window.getZuvyrUnifiedUsageSummary({ force });
    }

    const res = await window.authFetch(
      '/api/zuvyr-usage-summary',
      {
        method: 'GET',
        cache: 'no-store'
      }
    );
    const data = await res.json();

    if (!res.ok || data.status !== 'success') {
      throw new Error(
        data?.code || 'usage_unavailable'
      );
    }

    return data;
  }

  async function loadUsage(force = false) {
    const owner = session?.user?.id || null;
    const request = ++usageRequest;

    if (!owner) {
      clearUsage();
      renderUsage();
      return;
    }

    usageOwner = owner;
    usageState = 'loading';
    renderUsage();

    try {
      const data = await fetchUnifiedUsage(force);

      if (
        request !== usageRequest ||
        owner !== session?.user?.id
      ) {
        return;
      }

      usageData = data;
      usageState = 'loaded';
    } catch (_) {
      if (
        request !== usageRequest ||
        owner !== session?.user?.id
      ) {
        return;
      }

      usageData = null;
      usageState = 'error';
    }

    renderUsage();
  }

  function clearUsage() {
    usageRequest += 1;
    usageOwner = null;
    usageData = null;
    usageState = 'idle';
  }

  var documentState={templates:[],documents:[],loading:false};
  function documentsView(){
    return heading('documents')+
      '<div class="zs-banner" data-zs-document-banner><span>▤</span><div><b>Document Studio is live.</b> Generate local DOCX, PDF, Markdown and text files, keep canonical versions in Library, and link them to Projects without a model call.</div></div>'+
      '<div class="zs-grid">'+
        '<div class="zs-card wide zs-document-editor"><h2>Create document</h2><form data-zs-document-form>'+
          '<div class="zs-document-row"><div class="zs-field"><label>Title</label><input name="title" maxlength="120" required placeholder="Quarterly research brief"></div><div class="zs-field"><label>Template</label><select name="templateId" data-zs-document-template><option value="builtin:blank">Blank document</option></select></div></div>'+
          '<div class="zs-field"><label>Content</label><textarea name="content" maxlength="200000" placeholder="Write or paste the document body here"></textarea></div>'+
          '<div data-zs-document-variables></div>'+
          '<div class="zs-document-row"><div class="zs-field"><label>Project ID <span class="zs-hint">optional</span></label><input name="projectId" placeholder="UUID"></div><div class="zs-field"><label>Verified source record IDs <span class="zs-hint">optional · max 30</span></label><input name="sourceRecordIds" placeholder="UUIDs separated by commas"></div></div>'+
          '<div class="zs-field"><label>Formats</label><div class="zs-checks zs-document-formats">'+
            '<label class="zs-check"><input type="checkbox" name="documentFormats" value="docx" checked> DOCX</label>'+
            '<label class="zs-check"><input type="checkbox" name="documentFormats" value="pdf" checked> PDF</label>'+
            '<label class="zs-check"><input type="checkbox" name="documentFormats" value="md"> Markdown</label>'+
            '<label class="zs-check"><input type="checkbox" name="documentFormats" value="txt"> TXT</label>'+
          '</div></div>'+
          '<div class="zs-actions"><button class="zs-primary" type="submit" data-zs-document-generate>Generate document</button><button class="zs-secondary" type="button" data-zs-document-save-template>Save content as template</button><span class="zs-hint">Local rendering · provider calls 0 · generation credits 0</span></div>'+
        '</form><div class="zs-result" data-zs-document-result></div></div>'+
        '<div class="zs-card half"><h2>Recent documents</h2><div class="zs-document-list" data-zs-document-list><div class="zs-empty"><div><strong>No documents loaded</strong><span>Open Documents to refresh your Library.</span></div></div></div></div>'+
        '<div class="zs-card half"><h2>Templates</h2><p>Built-in and private saved templates are script-free. Placeholders use <code>{{variable}}</code>.</p><div class="zs-document-template-list" data-zs-document-template-list></div></div>'+
      '</div>';
  }
  function genericView(id) {
    var state=sections.find(function(s){return s[0]===id;})[3];
    var extra=id==='code'?orchestrator('code'):toolCards(id);
    return heading(id)+'<div class="zs-banner"><span>◎</span><div><b>'+(state==='ready'?'Interface foundation is ready.':'Ready to connect safely.')+'</b> '+(state==='ready'?'Use the existing backend foundation and connect verified data next.':'Provider execution stays off until pricing, limits and settlement pass verification.')+'</div></div>'+extra;
  }
  function viewHtml(id) { if(id==='dashboard')return dashboard(); if(id==='ip')return ipView(); if(id==='usage')return usageView(); if(id==='documents')return documentsView(); return genericView(id); }

  // Native navigation integration 01. Existing Chat, Images, Video, Code,
  // IP, Projects, History, Settings and payment handlers retain ownership.
  // Only sections without a native entry are added to the original shell.
  var nativeIds=['voice','music','research','library','documents','spreadsheets','presentations','scheduled','plugins','usage','analytics'];
  var home=document.getElementById('screen-home');
  var nativeNav=document.querySelector('.sidebar .nav-list');
  var more=document.querySelector('#screen-more .project-list');
  if(!home || !home.parentElement || (!nativeNav && !more)) {
    console.error('[ZUVYR navigation] Original navigation anchors are missing.');
    return;
  }
  var host=home.parentElement;
  var suite=document.createElement('section');
  suite.id='screen-zuvyr-tools';
  suite.className='screen zuvyr-suite zuvyr-suite-native';
  suite.hidden=true;
  suite.setAttribute('aria-hidden','true');
  suite.setAttribute('data-open','false');
  suite.innerHTML='<div class="zs-main"><div class="zs-content"><button type="button" class="zs-secondary" data-zs-close data-zuvyr-label="back">Back to Home</button>'+nativeIds.map(function(id){return '<section class="zs-view" data-zs-view="'+id+'">'+viewHtml(id)+'</section>';}).join('')+'</div></div><div class="zs-toast" role="status" aria-live="polite"></div>';
  host.appendChild(suite);

  var languageCopy={
    en:{more:'More tools',back:'Back',unavailable:'Not active yet',notice:'This section is not operational yet. Its tools still need to be connected; opening this page does not start a task or spend credits.'},
    ar:{more:'أدوات إضافية',back:'الرجوع',unavailable:'غير مفعّل بعد',notice:'هذا القسم غير جاهز للاستعمال بعد. أدواته ما زالت تحتاج الربط؛ فتح الصفحة لا يبدأ مهمة ولا يستهلك الرصيد.'},
    fr:{more:'Autres outils',back:'Retour',unavailable:'Pas encore actif',notice:'Cette section n’est pas encore opérationnelle. Les outils restent à connecter ; ouvrir cette page ne lance aucune tâche et ne consomme aucun crédit.'}
  };
  var sectionNames={
    ar:{voice:'الصوت',music:'الموسيقى',research:'البحث',library:'المكتبة',documents:'المستندات',spreadsheets:'الجداول',presentations:'العروض التقديمية',scheduled:'المهام المجدولة',plugins:'الإضافات',usage:'الاستخدام والفوترة',analytics:'التحليلات'},
    fr:{voice:'Voix',music:'Musique',research:'Recherche',library:'Bibliothèque',documents:'Documents',spreadsheets:'Tableurs',presentations:'Présentations',scheduled:'Tâches planifiées',plugins:'Extensions',usage:'Utilisation et facturation',analytics:'Statistiques'}
  };
  function language(){var lang=(document.documentElement.lang||'en').split('-')[0];return languageCopy[lang]?lang:'en';}
  function sectionLabel(id){var lang=language();var item=sections.find(function(s){return s[0]===id;});return sectionNames[lang]&&sectionNames[lang][id]||item[2];}
  function nativeIcon(id){
    var paths={voice:'M12 3v12M8 6v6a4 4 0 0 0 8 0V6M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8',music:'M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3h3M20 16a3 3 0 1 1-3-3h3',research:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6',library:'M4 3v18M8 3v18M12 3v18M16 4l5 16',documents:'M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8M8 16h8',spreadsheets:'M3 4h18v16H3ZM3 9h18M3 14h18M9 4v16',presentations:'M3 4h18v12H3ZM12 16v5M7 21l5-5 5 5',scheduled:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l4 2',plugins:'M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-12 0ZM12 17v4',usage:'M3 5h18v15H3ZM15 10h6v5h-6Z',analytics:'M4 20V10M10 20V4M16 20v-7M22 20H2'};
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="'+paths[id]+'"/></svg>';
  }
  function entry(id,className){
    var button=document.createElement('button');
    button.type='button';button.className=className;
    button.dataset.zuvyrSection=id;
    button.innerHTML='<span class="ic">'+nativeIcon(id)+'</span><span data-zuvyr-section-label="'+id+'">'+esc(sectionLabel(id))+'</span>';
    return button;
  }
  var homeTools=document.createElement('section');
  homeTools.className='zuvyr-native-tools';
  homeTools.innerHTML='<h2 data-zuvyr-label="more">More tools</h2><div class="zuvyr-native-tool-grid"></div>';
  nativeIds.forEach(function(id){
    homeTools.querySelector('.zuvyr-native-tool-grid').appendChild(entry(id,'zuvyr-native-tool'));
    if(nativeNav)nativeNav.appendChild(entry(id,'nav-item zuvyr-native-link'));
    if(more)more.appendChild(entry(id,'prow zuvyr-native-link'));
  });
  var featureGrid=home.querySelector('.feature-grid');
  if(featureGrid)featureGrid.insertAdjacentElement('afterend',homeTools);else home.appendChild(homeTools);
  document.body.dataset.zuvyrNativeNavigation='true';

  function translateNative(){
    var words=languageCopy[language()];
    document.querySelectorAll('[data-zuvyr-label]').forEach(function(el){el.textContent=words[el.dataset.zuvyrLabel];});
    document.querySelectorAll('[data-zuvyr-section-label]').forEach(function(el){el.textContent=sectionLabel(el.dataset.zuvyrSectionLabel);});
    suite.querySelectorAll('[data-zs-view]').forEach(function(view){
      var title=view.querySelector('h1');if(title)title.textContent=sectionLabel(view.dataset.zsView);
      if(view.dataset.zsView==='documents'){
        var documentStatus=view.querySelector('.zs-status');if(documentStatus){documentStatus.textContent=language()==='ar'?'مفعّل':language()==='fr'?'Actif':'Live';documentStatus.classList.add('ready');}
        return;
      }
      var status=view.querySelector('.zs-status');if(status){status.textContent=words.unavailable;status.classList.remove('ready');}
      view.querySelectorAll('.zs-tool-state').forEach(function(el){el.textContent=words.unavailable;});
      var banner=view.querySelector('.zs-banner');if(banner)banner.textContent=words.notice;
    });
    suite.dir=language()==='ar'?'rtl':'ltr';
    renderUsage();
  }
  translateNative();
  new MutationObserver(translateNative).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  var returnFocus=null;
  var previousScreens=[];
  var previousNav=[];

  var toastTimer;
  function toast(message){var el=suite.querySelector('.zs-toast');el.textContent=message;el.dataset.visible='true';clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.dataset.visible='false';},3400);}
  function open(id,trigger){
    if(nativeIds.indexOf(id)<0)return;
    if(suite.dataset.open!=='true'){
      previousScreens=Array.prototype.filter.call(host.children,function(el){return el!==suite&&el.classList.contains('screen')&&el.classList.contains('active');});
      previousNav=Array.prototype.slice.call(document.querySelectorAll('.sidebar .nav-item.active, .bottomnav .bn-item.active'));
      previousScreens.forEach(function(el){el.classList.remove('active');});
      previousNav.forEach(function(el){el.classList.remove('active');});
    }
    returnFocus=trigger||returnFocus;
    suite.hidden=false;suite.classList.add('active');suite.dataset.open='true';suite.setAttribute('aria-hidden','false');show(id);
    var title=suite.querySelector('[data-zs-view="'+id+'"] h1');
    if(title){title.tabIndex=-1;title.focus({preventScroll:true});}
    suite.scrollIntoView({block:'start'});
  }
  function close(restore,focus){
    clearUsage();
    suite.hidden=true;suite.classList.remove('active');suite.dataset.open='false';suite.setAttribute('aria-hidden','true');
    document.querySelectorAll('[data-zuvyr-section]').forEach(function(el){el.classList.remove('active');el.removeAttribute('aria-current');});
    if(restore){previousScreens.forEach(function(el){el.classList.add('active');});previousNav.forEach(function(el){el.classList.add('active');});}
    if(focus&&returnFocus&&returnFocus.isConnected)returnFocus.focus({preventScroll:true});
  }
  function show(id){
    if(id==='usage')loadUsage();else clearUsage();
    if(id==='documents')loadDocuments();
    suite.querySelectorAll('[data-zs-view]').forEach(function(v){v.dataset.active=String(v.dataset.zsView===id);});
    document.querySelectorAll('[data-zuvyr-section]').forEach(function(el){var active=el.dataset.zuvyrSection===id;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  }
  function request(path, options){if(typeof window.authFetch==='function')return window.authFetch(path,options);return fetch(path,options);}
  function checked(form,name){return Array.prototype.slice.call(form.querySelectorAll('input[name="'+name+'"]:checked')).map(function(i){return i.value;});}
  function documentView(){return suite.querySelector('[data-zs-view="documents"]');}
  function documentIds(value){return String(value||'').split(/[\s,]+/).map(function(v){return v.trim();}).filter(Boolean);}
  function documentTemplateById(id){return documentState.templates.find(function(item){return item.id===id;})||null;}
  function renderDocumentVariableFields(){
    var view=documentView(),form=view&&view.querySelector('[data-zs-document-form]'),host=view&&view.querySelector('[data-zs-document-variables]');
    if(!form||!host)return;
    var template=documentTemplateById(form.templateId.value),vars=template&&Array.isArray(template.variables)?template.variables.filter(function(name){return name!=='body';}):[];
    host.innerHTML=vars.length?'<div class="zs-field"><label>Template fields</label><div class="zs-document-variable-grid">'+vars.map(function(name){return '<label><span>'+esc(name.replace(/_/g,' '))+'</span><textarea data-zs-document-variable="'+esc(name)+'" maxlength="200000"></textarea></label>';}).join('')+'</div></div>':'';
  }
  function renderDocumentTemplates(){
    var view=documentView();if(!view)return;
    var select=view.querySelector('[data-zs-document-template]'),list=view.querySelector('[data-zs-document-template-list]');
    if(select){var current=select.value;select.innerHTML=documentState.templates.map(function(t){return '<option value="'+esc(t.id)+'">'+esc(t.name)+(t.builtin?' · built-in':' · saved')+'</option>';}).join('');if(documentState.templates.some(function(t){return t.id===current;}))select.value=current;}
    if(list)list.innerHTML=documentState.templates.length?documentState.templates.slice(0,8).map(function(t){return '<div class="zs-document-mini"><strong>'+esc(t.name)+'</strong><small>'+esc(t.category||'general')+' · '+(t.builtin?'built-in':'private saved')+'</small></div>';}).join(''):'<p class="zs-note">No templates available.</p>';
    renderDocumentVariableFields();
  }
  function renderDocumentList(){
    var view=documentView(),list=view&&view.querySelector('[data-zs-document-list]');if(!list)return;
    if(!documentState.documents.length){list.innerHTML='<div class="zs-empty"><div><strong>No generated documents yet</strong><span>Your canonical documents will appear here.</span></div></div>';return;}
    list.innerHTML=documentState.documents.slice(0,12).map(function(item){var assets=(item.assets||[]).filter(function(a){return a.status==='active';});return '<article class="zs-document-item"><div><strong>'+esc(item.title||'Document')+'</strong><small>'+assets.length+' file'+(assets.length===1?'':'s')+' · '+esc(item.updated_at||item.created_at||'')+'</small></div><div class="zs-document-assets">'+assets.map(function(a){return '<button type="button" class="zs-secondary" data-zs-document-download data-content-id="'+esc(item.id)+'" data-asset-id="'+esc(a.id)+'">'+esc((a.mime_type||'file').split('/').pop().replace('vnd.openxmlformats-officedocument.wordprocessingml.document','DOCX').replace('pdf','PDF').replace('markdown;charset=utf-8','MD').replace('plain;charset=utf-8','TXT'))+'</button>';}).join('')+'</div></article>';}).join('');
  }
  async function loadDocuments(){
    if(documentState.loading)return;documentState.loading=true;
    try{
      var responses=await Promise.all([request('/api/workspace/documents/templates'),request('/api/workspace/documents?limit=25')]);
      var templateData=await responses[0].json(),documentData=await responses[1].json();
      if(!responses[0].ok)throw new Error(templateData.code||'document_templates_failed');
      if(!responses[1].ok)throw new Error(documentData.code||'documents_failed');
      documentState.templates=templateData.templates||[];documentState.documents=documentData.items||[];renderDocumentTemplates();renderDocumentList();
    }catch(error){toast('Documents: '+error.message);}finally{documentState.loading=false;}
  }
  function documentVariables(form){var out={};form.querySelectorAll('[data-zs-document-variable]').forEach(function(el){out[el.dataset.zsDocumentVariable]=el.value;});return out;}
  async function documentSubmit(form){
    var result=documentView().querySelector('[data-zs-document-result]'),button=form.querySelector('[data-zs-document-generate]');
    var body={title:form.title.value,content:form.content.value,templateId:form.templateId.value||null,variables:documentVariables(form),formats:checked(form,'documentFormats'),projectId:form.projectId.value||null,sourceRecordIds:documentIds(form.sourceRecordIds.value)};
    if(!body.formats.length){toast('Choose at least one document format.');return;}
    button.disabled=true;result.dataset.visible='true';result.innerHTML='<div class="zs-result-title">Generating locally…</div><p>No model/provider call is required.</p>';
    try{var response=await request('/api/workspace/documents/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw new Error(data.code||'document_generation_failed');var doc=data.document||{};result.innerHTML='<div class="zs-result-title">Document ready</div><p>'+esc(doc.title||body.title)+' · '+esc((doc.formats||[]).join(', ').toUpperCase())+'</p><div class="zs-document-assets">'+(doc.assets||[]).map(function(a){return '<button type="button" class="zs-secondary" data-zs-document-download data-content-id="'+esc(doc.contentId)+'" data-asset-id="'+esc(a.assetId)+'">Download '+esc(String(a.format||'file').toUpperCase())+'</button>';}).join('')+'</div><p class="zs-note">Canonical content/version saved · provider calls '+Number(doc.providerCalls||0)+' · generation credits '+Number(doc.billedCredits||0)+'</p>';await loadDocuments();}catch(error){result.innerHTML='<div class="zs-result-title">Document needs attention</div><p>'+esc(error.message)+'</p>';}finally{button.disabled=false;}
  }
  async function saveDocumentTemplate(form){
    var name=(form.title.value||'Saved template').trim(),body=form.content.value||'{{body}}';
    try{var response=await request('/api/workspace/documents/templates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({template:{name:name,category:'custom',body:body}})}),data=await response.json();if(!response.ok)throw new Error(data.code||'document_template_save_failed');toast('Template saved privately.');await loadDocuments();}catch(error){toast('Template: '+error.message);}
  }
  async function downloadDocument(button){
    button.disabled=true;
    try{var response=await request('/api/workspace/library/items/'+encodeURIComponent(button.dataset.contentId)+'/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assetId:button.dataset.assetId})}),data=await response.json();if(!response.ok)throw new Error(data.code||'document_download_failed');var url=data.download&&data.download.signed_url;if(!url)throw new Error('document_download_url_missing');window.open(url,'_blank','noopener,noreferrer');}catch(error){toast('Download: '+error.message);}finally{button.disabled=false;}
  }
  function renderPlan(el,plan){el.dataset.visible='true';el.innerHTML='<div class="zs-result-title">✦ Safe proposal ready</div><p>No provider call or credit charge was made.</p><div class="zs-step-list">'+plan.steps.map(function(s,i){return '<div class="zs-step"><span class="zs-step-num">'+(i+1)+'</span><div><strong>'+esc(s.title)+'</strong><small>'+esc(s.capability)+' · proposed · execution off</small></div></div>';}).join('')+'</div>';}
  async function planSubmit(form){var result=form.parentNode.querySelector('[data-zs-plan-result]');var body={goal:form.goal.value,requestedOutputs:checked(form,'outputs'),additionalCreationConsent:form.consent.checked};try{var res=await request('/api/unified-product/orchestration/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});var data=await res.json();if(!res.ok)throw new Error(data.code||'plan_failed');renderPlan(result,data.plan);}catch(error){result.dataset.visible='true';result.innerHTML='<div class="zs-result-title">Planning needs attention</div><p>'+esc(error.message==='additional_creation_consent_required'?'Approve selected media creation to include it in the plan.':error.message)+'</p>';}}
  async function ipSubmit(form){var result=form.parentNode.querySelector('[data-zs-ip-result]');var body={goal:form.goal.value,scopes:checked(form,'scopes'),explicitConsent:form.consent.checked};try{var res=await request('/api/unified-product/ip/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});var data=await res.json();if(!res.ok)throw new Error(data.code||'ip_plan_failed');result.dataset.visible='true';result.innerHTML='<div class="zs-result-title">✦ IP tool plan ready</div><p>'+data.plan.scopes.map(esc).join(' · ')+'</p><div class="zs-chip-row"><span class="zs-chip">Execution off</span><span class="zs-chip">Device control off</span><span class="zs-chip">Audit required</span><span class="zs-chip">STOP available</span></div>';}catch(error){result.dataset.visible='true';result.innerHTML='<div class="zs-result-title">Permission check</div><p>'+esc(error.message)+'</p>';}}
  document.addEventListener('submit',function(e){
    var form=e.target;
    if(form&&form.matches&&form.matches('[data-zs-document-form]')){e.preventDefault();documentSubmit(form);return;}
    if(form&&form.matches&&form.matches('[data-zs-plan-form]')){e.preventDefault();planSubmit(form);return;}
    if(form&&form.matches&&form.matches('[data-zs-ip-form]')){e.preventDefault();ipSubmit(form);return;}
  });
  document.addEventListener('click',function(e){
    if(!e.target.closest)return;
    var docDownload=e.target.closest('[data-zs-document-download]');if(docDownload&&suite.contains(docDownload)){downloadDocument(docDownload);return;}
    var docSave=e.target.closest('[data-zs-document-save-template]');if(docSave&&suite.contains(docSave)){var docForm=docSave.closest('[data-zs-document-form]');if(docForm)saveDocumentTemplate(docForm);return;}
    if(e.target.closest('[data-zs-usage-refresh]')&&suite.contains(e.target)){loadUsage();return;}
    var entryButton=e.target.closest('[data-zuvyr-section]');
    if(entryButton){e.preventDefault();open(entryButton.dataset.zuvyrSection,entryButton);return;}
    if(e.target.closest('[data-zs-close]')&&suite.contains(e.target)){close(true,true);return;}
    // Restore the underlying native screen before its original click handler
    // runs. Never prevent or synthesize Chat, generation or payment actions.
    if(suite.dataset.open==='true'&&!suite.contains(e.target)&&e.target.closest('[data-tab], [data-open]'))close(true,false);
  },true);
  function refreshVisibleUsage(){if(suite.dataset.open==='true'&&suite.querySelector('[data-zs-view="usage"]').dataset.active==='true'&&!document.hidden)loadUsage();}
  suite.addEventListener('change',function(e){if(e.target&&e.target.matches('[data-zs-document-template]'))renderDocumentVariableFields();});
  window.addEventListener('focus',refreshVisibleUsage);
  document.addEventListener('visibilitychange',function(){if(document.hidden)clearUsage();else refreshVisibleUsage();});
  if(typeof supa!=='undefined'&&supa.auth&&supa.auth.onAuthStateChange)supa.auth.onAuthStateChange(function(event){clearUsage();if(event!=='SIGNED_OUT')setTimeout(refreshVisibleUsage,0);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&suite.dataset.open==='true'){e.preventDefault();close(true,true);}});
})();
