(function () {
  'use strict';
  if (window.__zuvyrSuiteV1Loaded) return;
  window.__zuvyrSuiteV1Loaded = true;

  var sections = [
    ['dashboard','⌂','Dashboard','ready'],['images','◇','Images','ready'],['video','▷','Video','connect'],
    ['3d','⬡','3D Studio','ready'],['code','</>','Code Studio','ready'],['voice','◉','Voice','connect'],['music','♫','Music','connect'],
    ['ip','✦','ZUVYR IP','plan'],['research','⌕','Research','ready'],['library','▦','Library','ready'],
    ['projects','▣','Projects','ready'],['documents','▤','Documents','ready'],['spreadsheets','▥','Spreadsheets','ready'],
    ['presentations','▧','Presentations','ready'],['scheduled','◷','Scheduled','blocked'],['plugins','⌘','Plugins','blocked'],
    ['usage','◫','Usage & Billing','ready'],['analytics','⌁','Analytics','validate'],['settings','⚙','Settings','ready']
  ];
  var copy = {
    dashboard:['Work','Continue projects, assets, research, code and history from one coordinated workspace.'],
    images:['Image Studio','Reopen canonical image history, export owned assets, inspect versions and Send-To without pretending blocked image operations are live.'],
    video:['Video','Plan text-to-video, image-to-video, editing, subtitles and export in one job surface.'],
    '3d':['3D Studio','Reopen canonical 3D assets, inspect them with a signed GLB viewer, and export only formats that passed validation.'],
    code:['Code Studio','Build multi-file projects and request approved image or video assets when the experience needs them.'],
    voice:['Voice','Prepare transcription, speech and voice conversations with transparent minute usage.'],
    music:['Music & Audio','Create music, effects, cleanup and remix workflows after pricing is verified.'],
    ip:['ZUVYR IP','Plan work across every ZUVYR capability with exact permissions, audit and STOP controls.'],
    research:['Research','Turn verified cited research into reusable Documents, Spreadsheets or Presentations without a second provider charge.'],
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
    var groups = [['Workspace',sections.slice(0,11)],['Create & manage',sections.slice(11,16)],['Account',sections.slice(16)]];
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
      images:[['History & reopen','Canonical image jobs with fresh owner-scoped previews'],['Actions & export','Download, Send-To, versions and reversible edit rollback'],['Creation gates','Only live-proven operations may be advertised; upscale stays blocked']],
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

  var officeState={spreadsheets:[],presentations:[],loading:{spreadsheets:false,presentations:false}};
  function researchView(){
    return heading('research')+
      '<div class="zs-banner"><span>⌕</span><div><b>Cited research → reusable artifact.</b> Run Web Search, Deep Research, Shopping, Local or Connected Research in Chat, then hand the verified result and source-record IDs here. Conversion is local: no second model/provider call and no duplicate generation credit.</div></div>'+
      '<div class="zs-grid"><div class="zs-card wide"><h2>Research artifact checkpoint</h2>'+
        '<form data-zs-research-artifact-form>'+
          '<div class="zs-document-row"><div class="zs-field"><label>Title</label><input name="title" maxlength="120" required placeholder="Market research brief"></div><div class="zs-field"><label>Output</label><select name="outputKind"><option value="document">Document · DOCX + PDF</option><option value="spreadsheet">Spreadsheet · XLSX + CSV</option><option value="presentation">Presentation · PPTX</option></select></div></div>'+
          '<div class="zs-document-row"><div class="zs-field"><label>Research mode</label><select name="researchMode"><option value="deep_research">Deep Research</option><option value="web_search">Web Search</option><option value="shopping">Shopping</option><option value="local_research">Local Research</option><option value="connected_research">Connected Research</option></select></div><div class="zs-field"><label>Project ID <span class="zs-hint">optional</span></label><input name="projectId" placeholder="UUID"></div></div>'+
          '<div class="zs-field"><label>Verified source record IDs <span class="zs-hint">required · 1–30</span></label><input name="sourceRecordIds" required placeholder="UUIDs separated by commas"></div>'+
          '<div class="zs-field"><label>Cited research result</label><textarea name="researchText" required maxlength="120000" placeholder="Paste the completed cited result here. The verified source IDs above remain attached to the artifact."></textarea></div>'+
          '<div class="zs-actions"><button class="zs-primary" type="submit" data-zs-research-artifact-generate>Create artifact</button><span class="zs-hint">Conversion: 0 provider calls · 0 credits · upstream research billing unchanged</span></div>'+
        '</form><div class="zs-result" data-zs-research-artifact-result></div></div>'+
        '<div class="zs-card half"><h2>Checkpoint guarantees</h2><div class="zs-chip-row"><span class="zs-chip">Verified source IDs required</span><span class="zs-chip">Canonical Library content</span><span class="zs-chip">Project link preserved</span><span class="zs-chip">Signed download through Library</span></div></div>'+
        '<div class="zs-card half"><h2>Failure & cancel</h2><p>Cancellation is honored before persistence begins. Artifact conversion itself is local and does not reserve or settle a second provider charge. Replays reuse canonical artifact identity.</p></div>'+
      '</div>';
  }
  function spreadsheetsView(){
    return heading('spreadsheets')+
      '<div class="zs-banner"><span>▥</span><div><b>Spreadsheet Studio is live.</b> Build local XLSX/CSV files from bounded tables, persist them canonically, attach verified sources, and keep formulas/macros disabled.</div></div>'+
      '<div class="zs-grid"><div class="zs-card wide"><h2>Create spreadsheet</h2><form data-zs-spreadsheet-form>'+
        '<div class="zs-document-row"><div class="zs-field"><label>Title</label><input name="title" maxlength="120" required placeholder="Budget model"></div><div class="zs-field"><label>Sheet name</label><input name="sheetName" maxlength="31" value="Sheet 1"></div></div>'+
        '<div class="zs-field"><label>Columns <span class="zs-hint">comma separated · max 100</span></label><input name="columns" placeholder="Item, Quantity, Cost"></div>'+
        '<div class="zs-field"><label>Rows <span class="zs-hint">one CSV-like row per line · no formulas</span></label><textarea name="rows" placeholder="Hosting,1,20&#10;Storage,2,8"></textarea></div>'+
        '<div class="zs-document-row"><div class="zs-field"><label>Project ID <span class="zs-hint">optional</span></label><input name="projectId" placeholder="UUID"></div><div class="zs-field"><label>Verified source record IDs <span class="zs-hint">optional</span></label><input name="sourceRecordIds" placeholder="UUIDs separated by commas"></div></div>'+
        '<div class="zs-field"><label>Formats</label><div class="zs-checks"><label class="zs-check"><input type="checkbox" name="spreadsheetFormats" value="xlsx" checked> XLSX</label><label class="zs-check"><input type="checkbox" name="spreadsheetFormats" value="csv" checked> CSV</label></div></div>'+
        '<div class="zs-actions"><button class="zs-primary" type="submit" data-zs-spreadsheet-generate>Generate spreadsheet</button><span class="zs-hint">Local rendering · formulas/macros off · provider calls 0</span></div>'+
      '</form><div class="zs-result" data-zs-spreadsheet-result></div></div><div class="zs-card wide"><h2>Recent spreadsheets</h2><div class="zs-document-list" data-zs-spreadsheet-list></div></div></div>';
  }
  function presentationsView(){
    return heading('presentations')+
      '<div class="zs-banner"><span>▧</span><div><b>Presentation Studio is live.</b> Turn an approved outline into a local 16:9 PPTX, keep it in Library, link it to a Project, and append verified sources without a model call.</div></div>'+
      '<div class="zs-grid"><div class="zs-card wide"><h2>Create presentation</h2><form data-zs-presentation-form>'+
        '<div class="zs-field"><label>Title</label><input name="title" maxlength="120" required placeholder="Launch strategy"></div>'+
        '<div class="zs-field"><label>Slides <span class="zs-hint">separate slides with ---; first line is the slide title</span></label><textarea name="slides" placeholder="Problem&#10;Current workflow is fragmented&#10;Research is disconnected&#10;---&#10;Solution&#10;One ZUVYR workspace&#10;Canonical artifacts and handoffs"></textarea></div>'+
        '<div class="zs-document-row"><div class="zs-field"><label>Project ID <span class="zs-hint">optional</span></label><input name="projectId" placeholder="UUID"></div><div class="zs-field"><label>Verified source record IDs <span class="zs-hint">optional</span></label><input name="sourceRecordIds" placeholder="UUIDs separated by commas"></div></div>'+
        '<div class="zs-actions"><button class="zs-primary" type="submit" data-zs-presentation-generate>Generate PPTX</button><span class="zs-hint">Local rendering · 16:9 · provider calls 0</span></div>'+
      '</form><div class="zs-result" data-zs-presentation-result></div></div><div class="zs-card wide"><h2>Recent presentations</h2><div class="zs-document-list" data-zs-presentation-list></div></div></div>';
  }
  var imageStudioState={
    history:[],
    loading:false,
    error:null,
    selected:null,
    libraryItem:null
  };

  function imageStudioView(){
    return heading('images')+
      '<div class="zs-banner"><span>◇</span><div><b>Image Studio checkpoint.</b> This surface exposes canonical history and zero-provider actions only. Reference/edit/background/relight remain gated until live proof; upscale stays blocked.</div></div>'+
      '<div class="zs-grid">'+
        '<div class="zs-card wide"><div class="zs-actions" style="justify-content:space-between;align-items:center"><div><h2 style="margin:0">Image history</h2><p style="margin:.35rem 0 0">Owner-scoped canonical jobs. Reopen uses a fresh signed preview and never reruns the model.</p></div><button type="button" class="zs-secondary" data-zs-image-refresh>Refresh</button></div><div data-zs-image-history style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:14px"><div class="zs-muted">Open Images to load history.</div></div></div>'+
        '<div class="zs-card wide"><h2>Selected image</h2><div data-zs-image-detail><div class="zs-empty"><div><strong>No image selected</strong><span>Choose an item from history to reopen it safely.</span></div></div></div></div>'+
        '<div class="zs-card half"><h2>V1 operation truth</h2><div class="zs-chip-row"><span class="zs-chip">Generate · Pack061 live proof</span><span class="zs-chip">Reference / variations · gated</span><span class="zs-chip">Edit / inpaint / expand · gated</span><span class="zs-chip">Background / relight · gated</span><span class="zs-chip">Crop / resize / canvas / layers / text / batch · backend verified</span><span class="zs-chip">Upscale · blocked</span></div></div>'+
        '<div class="zs-card half"><h2>Checkpoint rule</h2><p>Pack065 will not present an operation as live until production evidence exists. Unsupported or unpriced controls stay absent instead of silently doing something else.</p></div>'+
      '</div>';
  }

  function imageStudioNode(){
    return suite.querySelector(
      '[data-zs-view="images"]'
    );
  }

  async function imageStudioRequest(path,options){
    if(typeof window.authFetch!=='function'){
      throw new Error(
        'Authenticated workspace is unavailable.'
      );
    }

    var response=
      await window.authFetch(
        path,
        options||{
          method:'GET',
          cache:'no-store'
        }
      );

    var data={};
    try{
      data=await response.json();
    }catch(_){}

    if(!response.ok||data.status==='error'){
      throw new Error(
        data.message||
        data.code||
        'Image Studio request failed.'
      );
    }

    return data;
  }

  function imageStudioDate(value){
    if(!value)return '';
    var date=new Date(value);
    return Number.isFinite(date.getTime())
      ?date.toLocaleString()
      :'';
  }

  function imageStudioOperation(value){
    return String(value||'generate')
      .replace(/_/g,' ');
  }

  function renderImageStudioHistory(){
    var view=imageStudioNode();
    if(!view)return;

    var list=
      view.querySelector(
        '[data-zs-image-history]'
      );

    if(!list)return;

    if(imageStudioState.loading){
      list.innerHTML=
        '<div class="zs-muted">Loading image history…</div>';
      return;
    }

    if(imageStudioState.error){
      list.innerHTML=
        '<div class="zs-empty"><div><strong>History needs attention</strong><span>'+
        esc(imageStudioState.error)+
        '</span></div></div>';
      return;
    }

    if(!imageStudioState.history.length){
      list.innerHTML=
        '<div class="zs-empty"><div><strong>No canonical image jobs yet</strong><span>Only persisted owner-scoped image results appear here.</span></div></div>';
      return;
    }

    list.innerHTML=
      imageStudioState.history
        .map(function(item){
          var ready=
            item.status==='completed'&&
            item.contentId&&
            item.assetId;

          return '<article class="zs-tool" style="min-width:0">'+
            '<div class="zs-tool-top"><span class="zs-tool-icon">◇</span><span class="zs-tool-state">'+
            esc(imageStudioOperation(item.operation))+
            '</span></div>'+
            '<h3 style="overflow-wrap:anywhere">'+
            esc(
              item.prompt||
              imageStudioOperation(item.operation)
            )+
            '</h3>'+
            '<p>'+
            esc(item.status||'unknown')+
            (item.createdAt
              ?' · '+esc(imageStudioDate(item.createdAt))
              :'')+
            '</p>'+
            (item.error
              ?'<p class="zs-note">'+esc(item.error)+'</p>'
              :'')+
            '<div class="zs-actions">'+
              '<button type="button" class="zs-secondary" data-zs-image-open="'+
              esc(item.jobId)+
              '" '+(ready?'':'disabled')+'>Open</button>'+
            '</div>'+
          '</article>';
        })
        .join('');
  }

  function imageStudioVersionsHtml(item){
    var versions=
      Array.isArray(item?.versions)
        ?item.versions
        :[];

    if(!versions.length){
      return '<div class="zs-muted">No version records available.</div>';
    }

    return '<div style="display:grid;gap:8px">'+
      versions.slice(0,12).map(function(version){
        var current=
          version.id===item.current_version_id;

        return '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)">'+
          '<span><strong>Version '+esc(version.version_number||'—')+'</strong> '+
          (current?'<span class="zs-chip">current</span>':'')+
          '<br><small>'+esc(version.mime_type||'image')+
          (version.created_at?' · '+esc(imageStudioDate(version.created_at)):'')+
          '</small></span>'+
          (current
            ?''
            :'<button type="button" class="zs-secondary" data-zs-image-restore-version="'+
              esc(version.id)+
              '">Restore</button>')+
        '</div>';
      }).join('')+
    '</div>';
  }

  function renderImageStudioDetail(){
    var view=imageStudioNode();
    if(!view)return;

    var box=
      view.querySelector(
        '[data-zs-image-detail]'
      );

    if(!box)return;

    var selected=imageStudioState.selected;

    if(!selected){
      box.innerHTML=
        '<div class="zs-empty"><div><strong>No image selected</strong><span>Choose an item from history to reopen it safely.</span></div></div>';
      return;
    }

    var library=
      imageStudioState.libraryItem;

    var destinations=[
      ['chat','Chat'],
      ['projects','Projects'],
      ['code','Code Studio'],
      ['video','Video']
    ];

    box.innerHTML=
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">'+
        '<div>'+
          '<img src="'+esc(selected.previewUrl)+'" alt="Selected canonical image preview" style="display:block;width:100%;max-height:520px;object-fit:contain;border-radius:14px;background:rgba(255,255,255,.04)">'+
          '<p class="zs-note">Fresh signed preview · expires in '+esc(selected.previewExpiresInSeconds||300)+'s · provider calls 0</p>'+
        '</div>'+
        '<div style="min-width:0">'+
          '<h3>'+esc(imageStudioOperation(selected.operation))+'</h3>'+
          '<p style="overflow-wrap:anywhere">'+esc(selected.prompt||'No prompt recorded')+'</p>'+
          '<div class="zs-chip-row">'+
            '<span class="zs-chip">'+esc(selected.status||'unknown')+'</span>'+
            '<span class="zs-chip">'+esc(selected.mimeType||'image')+'</span>'+
            '<span class="zs-chip">'+esc(String(selected.fileSizeBytes||0))+' bytes</span>'+
            (selected.reversible?'<span class="zs-chip">rollback available</span>':'')+
          '</div>'+
          '<div class="zs-actions" style="margin-top:12px;flex-wrap:wrap">'+
            '<button type="button" class="zs-primary" data-zs-image-download="'+esc(selected.contentId)+'" data-asset-id="'+esc(selected.assetId)+'">Download / export</button>'+
            '<select data-zs-image-send-destination aria-label="Send image to">'+
              destinations.map(function(entry){return '<option value="'+entry[0]+'">'+entry[1]+'</option>';}).join('')+
            '</select>'+
            '<button type="button" class="zs-secondary" data-zs-image-send="'+esc(selected.contentId)+'">Send-To</button>'+
            (selected.reversible
              ?'<button type="button" class="zs-secondary" data-zs-image-rollback="'+esc(selected.jobId)+'">Rollback to source</button>'
              :'')+
          '</div>'+
          '<div style="margin-top:18px"><h3>Versions</h3>'+
          imageStudioVersionsHtml(library)+
          '</div>'+
        '</div>'+
      '</div>';
  }

  async function loadImageStudioHistory(force){
    if(imageStudioState.loading&&!force)return;

    imageStudioState.loading=true;
    imageStudioState.error=null;
    renderImageStudioHistory();

    try{
      var data=
        await imageStudioRequest(
          '/api/workspace/images/history?limit=36'
        );

      imageStudioState.history=
        Array.isArray(data.history)
          ?data.history
          :[];
    }catch(error){
      imageStudioState.history=[];
      imageStudioState.error=
        error.message;
    }finally{
      imageStudioState.loading=false;
      renderImageStudioHistory();
    }
  }

  async function openImageStudioItem(jobId){
    imageStudioState.error=null;

    try{
      var data=
        await imageStudioRequest(
          '/api/workspace/images/'+
          encodeURIComponent(jobId)+
          '/reopen'
        );

      imageStudioState.selected=
        data.item||null;
      imageStudioState.libraryItem=null;

      if(
        imageStudioState.selected&&
        imageStudioState.selected.contentId
      ){
        var library=
          await imageStudioRequest(
            '/api/workspace/library/items/'+
            encodeURIComponent(
              imageStudioState.selected.contentId
            )
          );

        imageStudioState.libraryItem=
          library.item||null;
      }

      renderImageStudioDetail();
    }catch(error){
      toast(error.message);
    }
  }

  async function exportImageStudioItem(contentId,assetId){
    try{
      var data=
        await imageStudioRequest(
          '/api/workspace/library/items/'+
          encodeURIComponent(contentId)+
          '/download',
          {
            method:'POST',
            headers:{
              'Content-Type':'application/json'
            },
            body:JSON.stringify({
              assetId:assetId
            })
          }
        );

      var url=
        data.download&&
        data.download.signed_url;

      if(!url){
        throw new Error(
          'Download URL was not returned.'
        );
      }

      var anchor=
        document.createElement('a');
      anchor.href=url;
      anchor.rel='noopener';
      anchor.download='';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      toast('Image export prepared.');
    }catch(error){
      toast(error.message);
    }
  }

  async function sendImageStudioItem(contentId,destination){
    try{
      var data=
        await imageStudioRequest(
          '/api/workspace/library/items/'+
          encodeURIComponent(contentId)+
          '/send-to',
          {
            method:'POST',
            headers:{
              'Content-Type':'application/json'
            },
            body:JSON.stringify({
              destination:destination,
              metadata:{
                source:'pack065_image_studio'
              }
            })
          }
        );

      var handoff=
        data.handoff||{};

      if(
        handoff.persisted===false&&
        destination==='code'
      ){
        toast(
          'Code Studio requires a target code project before the canonical handoff can be persisted.'
        );
        return;
      }

      toast(
        'Sent canonical image to '+
        destination+
        ' without re-upload.'
      );
    }catch(error){
      toast(error.message);
    }
  }

  async function restoreImageStudioVersion(versionId){
    var selected=
      imageStudioState.selected;

    if(
      !selected||
      !selected.contentId
    )return;

    if(
      typeof window.confirm==='function'&&
      !window.confirm(
        'Restore this canonical image version?'
      )
    )return;

    try{
      await imageStudioRequest(
        '/api/workspace/library/items/'+
        encodeURIComponent(selected.contentId)+
        '/versions/'+
        encodeURIComponent(versionId)+
        '/restore',
        {
          method:'POST',
          headers:{
            'Content-Type':'application/json'
          },
          body:JSON.stringify({
            metadata:{
              source:'pack065_image_studio'
            }
          })
        }
      );

      toast('Image version restored.');
      await openImageStudioItem(
        selected.jobId
      );
      await loadImageStudioHistory(true);
    }catch(error){
      toast(error.message);
    }
  }

  async function rollbackImageStudioEdit(jobId){
    if(
      typeof window.confirm==='function'&&
      !window.confirm(
        'Reopen the immutable source version for this edit?'
      )
    )return;

    try{
      var data=
        await imageStudioRequest(
          '/api/workspace/images/'+
          encodeURIComponent(jobId)+
          '/rollback',
          {
            method:'POST',
            headers:{
              'Content-Type':'application/json'
            },
            body:'{}'
          }
        );

      var rollback=
        data.rollback||{};

      toast(
        'Source preserved: '+
        String(
          rollback.sourceVersionId||
          rollback.sourceAssetId||
          'verified'
        )
      );
    }catch(error){
      toast(error.message);
    }
  }

  function bindImageStudio(){
    var view=imageStudioNode();

    if(
      !view||
      view.dataset.imageStudioBound==='true'
    )return;

    view.dataset.imageStudioBound='true';

    view.addEventListener(
      'click',
      function(event){
        var target=
          event.target&&
          event.target.closest
            ?event.target.closest(
              '[data-zs-image-refresh],[data-zs-image-open],[data-zs-image-download],[data-zs-image-send],[data-zs-image-restore-version],[data-zs-image-rollback]'
            )
            :null;

        if(!target)return;

        if(target.hasAttribute('data-zs-image-refresh')){
          loadImageStudioHistory(true);
          return;
        }

        if(target.hasAttribute('data-zs-image-open')){
          openImageStudioItem(
            target.getAttribute(
              'data-zs-image-open'
            )
          );
          return;
        }

        if(target.hasAttribute('data-zs-image-download')){
          exportImageStudioItem(
            target.getAttribute(
              'data-zs-image-download'
            ),
            target.getAttribute(
              'data-asset-id'
            )
          );
          return;
        }

        if(target.hasAttribute('data-zs-image-send')){
          var select=
            view.querySelector(
              '[data-zs-image-send-destination]'
            );

          sendImageStudioItem(
            target.getAttribute(
              'data-zs-image-send'
            ),
            select?select.value:'chat'
          );
          return;
        }

        if(target.hasAttribute('data-zs-image-restore-version')){
          restoreImageStudioVersion(
            target.getAttribute(
              'data-zs-image-restore-version'
            )
          );
          return;
        }

        if(target.hasAttribute('data-zs-image-rollback')){
          rollbackImageStudioEdit(
            target.getAttribute(
              'data-zs-image-rollback'
            )
          );
        }
      }
    );
  }


  /* ZUVYR PACK084 3D STUDIO */
  var model3dStudioState={
    capabilities:null,
    history:[],
    selected:null,
    loading:false,
    error:null,
    modelUrl:null,
    thumbnailUrl:null,
    viewerLoad:null,
    pollTimer:null
  };

  function model3dStudioView(){
    return heading('3d')+
      '<div class="zs-banner" data-zs-3d-banner><span>⬡</span><div><b>3D Studio is loading verified capabilities.</b> Paid generation remains owned by the PACK083/M18 gate.</div></div>'+
      '<div class="zs-grid">'+
        '<div class="zs-card half"><h2>Create 3D</h2><form data-zs-3d-form>'+
          '<div class="zs-field"><label>Prompt</label><textarea name="prompt" maxlength="1024" required placeholder="A clean stylized ceramic robot with rounded edges"></textarea></div>'+
          '<div class="zs-field"><label>Geometry mode</label><select name="generateType"><option value="Normal">Normal + texture</option><option value="Geometry">Geometry only</option></select></div>'+
          '<div class="zs-field"><label>Face count</label><input name="faceCount" type="number" min="40000" max="1500000" step="10000" value="500000"></div>'+
          '<label class="zs-consent"><input name="enablePbr" type="checkbox" checked> Generate PBR material when supported by the selected geometry mode.</label>'+
          '<div class="zs-actions"><button type="submit" class="zs-primary" data-zs-3d-generate disabled>Generate 3D</button><span class="zs-hint" data-zs-3d-generate-hint>Checking M18 and PACK083 execution gates.</span></div>'+
        '</form></div>'+
        '<div class="zs-card half"><h2>Generation policy</h2><p>Text-to-3D uses the existing PACK083 executor, exact pricing and canonical reserve/settle/refund path. Image and multiview inputs remain outside this Studio until the canonical asset picker is bound.</p><p class="zs-note">Opening the Studio performs zero AI-provider calls and spends zero credits.</p></div>'+
        '<div class="zs-card wide"><div class="zs-actions" style="justify-content:space-between;align-items:center"><div><h2 style="margin:0">Canonical 3D history</h2><p style="margin:.35rem 0 0">Owner-scoped models. Reopen and export never rerun the provider.</p></div><button type="button" class="zs-secondary" data-zs-3d-refresh>Refresh</button></div><div class="zs-3d-history" data-zs-3d-history><div class="zs-muted">Open 3D Studio to load history.</div></div></div>'+
        '<div class="zs-card wide"><h2>Viewer & exports</h2><div data-zs-3d-detail><div class="zs-empty"><div><strong>No model selected</strong><span>Choose an existing canonical 3D job to reopen it.</span></div></div></div></div>'+
        '<div class="zs-card half"><h2>Operation truth</h2><div class="zs-chip-row" data-zs-3d-operations><span class="zs-chip">Loading…</span></div><p class="zs-note">Post-generation remesh, retopo, rig, animation and retarget controls stay blocked until a verified executor exists.</p></div>'+
        '<div class="zs-card half"><h2>Export policy</h2><div class="zs-chip-row" data-zs-3d-export-policy><span class="zs-chip">Loading…</span></div><p class="zs-note">A format appears as a download only when that exact canonical artifact exists and passed server-side validation.</p></div>'+
      '</div>';
  }

  function model3dStudioNode(){
    return suite.querySelector('[data-zs-view="3d"]');
  }

  async function model3dStudioRequest(path,options){
    if(typeof window.authFetch!=='function'){
      throw new Error('Authenticated workspace is unavailable.');
    }
    var response=await window.authFetch(path,options||{method:'GET',cache:'no-store'});
    var data={};
    try{data=await response.json();}catch(_){}
    if(!response.ok||data.status==='error'){
      var error=new Error(data.message||data.code||'3D Studio request failed.');
      error.code=data.code||'model3d_studio_request_failed';
      throw error;
    }
    return data;
  }

  function model3dStudioDate(value){
    if(!value)return '';
    var date=new Date(value);
    return Number.isFinite(date.getTime())?date.toLocaleString():'';
  }

  function model3dFormatRole(role){
    var value=String(role||'').toLowerCase();
    if(value==='model_glb'||value==='export_glb')return 'GLB';
    if(value==='export_obj')return 'OBJ';
    if(value==='export_fbx')return 'FBX';
    if(value==='export_usdz')return 'USDZ';
    if(value==='thumbnail')return 'Preview';
    return value.replace(/^export_/,'').toUpperCase();
  }

  function model3dHumanOperation(value){
    return String(value||'3d').replace(/_/g,' ');
  }

  function model3dViewerScript(){
    var capabilities=model3dStudioState.capabilities||{};
    var viewer=capabilities.viewer||{};
    return String(viewer.scriptUrl||'');
  }

  function ensureModel3dViewer(){
    if(window.customElements&&window.customElements.get('zuvyr-model3d-viewer')){
      return Promise.resolve(true);
    }
    if(model3dStudioState.viewerLoad)return model3dStudioState.viewerLoad;
    var url=model3dViewerScript();
    if(url!=='/zuvyr-model3d-viewer.js?v=pack084-1'){
      return Promise.reject(new Error('Pinned local 3D viewer runtime is unavailable.'));
    }
    model3dStudioState.viewerLoad=new Promise(function(resolve,reject){
      var existing=document.querySelector('script[data-zuvyr-model3d-viewer="pack084-v1"]');
      if(existing){
        if(window.customElements&&window.customElements.get('zuvyr-model3d-viewer')){resolve(true);return;}
        existing.addEventListener('load',function(){
          if(window.customElements&&window.customElements.get('zuvyr-model3d-viewer'))resolve(true);
          else reject(new Error('Local 3D viewer did not initialize.'));
        },{once:true});
        existing.addEventListener('error',function(){reject(new Error('Local 3D viewer failed to load.'));},{once:true});
        return;
      }
      var script=document.createElement('script');
      script.src=url;
      script.referrerPolicy='no-referrer';
      script.dataset.zuvyrModel3dViewer='pack084-v1';
      script.addEventListener('load',function(){
        if(window.customElements&&window.customElements.whenDefined){
          window.customElements.whenDefined('zuvyr-model3d-viewer').then(function(){resolve(true);}).catch(reject);
        }else if(window.customElements&&window.customElements.get('zuvyr-model3d-viewer'))resolve(true);
        else reject(new Error('Local 3D viewer did not initialize.'));
      },{once:true});
      script.addEventListener('error',function(){reject(new Error('Local 3D viewer failed to load.'));},{once:true});
      document.head.appendChild(script);
    }).catch(function(error){
      model3dStudioState.viewerLoad=null;
      throw error;
    });
    return model3dStudioState.viewerLoad;
  }

  function renderModel3dStudioTruth(){
    var view=model3dStudioNode();
    if(!view)return;
    var caps=model3dStudioState.capabilities||{};
    var generation=caps.generation||{};
    var banner=view.querySelector('[data-zs-3d-banner]');
    var status=view.querySelector('.zs-status');
    if(status){
      status.classList.add('ready');
      status.textContent=generation.liveExecution===true?'Studio ready · Generation live':'Studio ready · Generation gated';
    }
    var form=view.querySelector('[data-zs-3d-form]');
    var generateButton=view.querySelector('[data-zs-3d-generate]');
    var generateHint=view.querySelector('[data-zs-3d-generate-hint]');
    if(form&&generation.options){
      var options=generation.options;
      if(form.elements.faceCount){
        form.elements.faceCount.min=String(options.minFaceCount||40000);
        form.elements.faceCount.max=String(options.maxFaceCount||1500000);
        if(!form.elements.faceCount.dataset.pack084Init){
          form.elements.faceCount.value=String(options.defaultFaceCount||500000);
          form.elements.faceCount.dataset.pack084Init='true';
        }
      }
      if(form.elements.generateType&&Array.isArray(options.generateTypes)){
        var currentType=form.elements.generateType.value;
        form.elements.generateType.innerHTML=options.generateTypes.map(function(value){
          return '<option value="'+esc(value)+'">'+esc(value==='Geometry'?'Geometry only':'Normal + texture')+'</option>';
        }).join('');
        if(options.generateTypes.indexOf(currentType)>-1)form.elements.generateType.value=currentType;
      }
      if(form.elements.enablePbr&&!form.elements.enablePbr.dataset.pack084Init){
        form.elements.enablePbr.checked=options.defaultEnablePbr===true;
        form.elements.enablePbr.dataset.pack084Init='true';
      }
    }
    if(generateButton)generateButton.disabled=generation.liveExecution!==true;
    if(generateHint){
      generateHint.textContent=generation.liveExecution===true
        ?'Generation is live through PACK083 exact pricing; submitting can reserve credits.'
        :'Generation is disabled before request creation, so this control cannot call the provider or reserve credits.';
    }
    if(banner){
      var blockers=Array.isArray(generation.blockers)?generation.blockers:[];
      banner.innerHTML='<span>⬡</span><div><b>PACK084 Studio controls are zero-provider.</b> '+
        (generation.liveExecution===true
          ?'PACK083 generation gate is currently open; generation remains separately metered.'
          :'PACK083 paid generation remains fail-closed'+(blockers.length?' ('+esc(blockers.join(', '))+')':'')+'.')+
        ' Viewer, history and signed downloads do not create a provider call.</div>';
    }
    var ops=view.querySelector('[data-zs-3d-operations]');
    if(ops){
      var operations=caps.operations||{};
      var labels={
        mesh_polycount:'Mesh / polycount',
        pbr_texture:'PBR texture',
        remesh:'Remesh',
        retopo:'Retopo',
        rig:'Rig',
        animation:'Animation',
        retarget:'Retarget'
      };
      ops.innerHTML=Object.keys(labels).map(function(key){
        var spec=operations[key]||{};
        var state=String(spec.status||'blocked');
        var human=state==='generation_time_only'?'generation-time only':'blocked';
        return '<span class="zs-chip">'+esc(labels[key])+' · '+esc(human)+'</span>';
      }).join('');
    }
    var policy=view.querySelector('[data-zs-3d-export-policy]');
    if(policy){
      var exports=caps.exports||{};
      var verified=exports.verifiedWhenPresent||{};
      var blocked=exports.blocked||{};
      var live=Object.keys(verified).map(function(format){
        return '<span class="zs-chip">'+esc(format.toUpperCase())+' · validated when present</span>';
      });
      var unavailable=Object.keys(blocked).map(function(format){
        return '<span class="zs-chip">'+esc(format.toUpperCase())+' · blocked</span>';
      });
      policy.innerHTML=live.concat(unavailable).join('');
    }
  }

  function renderModel3dStudioHistory(){
    var view=model3dStudioNode();
    if(!view)return;
    var list=view.querySelector('[data-zs-3d-history]');
    if(!list)return;
    if(model3dStudioState.loading){
      list.innerHTML='<div class="zs-muted">Loading 3D history…</div>';
      return;
    }
    if(model3dStudioState.error){
      list.innerHTML='<div class="zs-empty"><div><strong>3D history needs attention</strong><span>'+esc(model3dStudioState.error)+'</span></div></div>';
      return;
    }
    if(!model3dStudioState.history.length){
      list.innerHTML='<div class="zs-empty"><div><strong>No canonical 3D results yet</strong><span>Generation stays fail-closed until M18 and PACK083 execution gates are verified.</span></div></div>';
      return;
    }
    list.innerHTML=model3dStudioState.history.map(function(item){
      var manifest=Array.isArray(item.manifest)?item.manifest:[];
      var downloads=manifest.filter(function(entry){
        return /^model_glb$|^export_(glb|obj|fbx|usdz)$/.test(String(entry.role||''))&&entry.assetId;
      });
      var formats=downloads.map(function(entry){return model3dFormatRole(entry.role);});
      var status=String(item.status||'unknown').toLowerCase();
      var canOpen=status==='done'&&manifest.some(function(entry){return entry.role==='model_glb'&&entry.assetId;});
      var canCancel=['queued','processing','running'].indexOf(status)>-1;
      return '<article class="zs-3d-history-item" data-zs-3d-job="'+esc(item.jobId)+'">'+
        '<div><strong>'+esc(model3dHumanOperation(item.operation))+'</strong><small>'+esc(item.prompt||'Generated 3D model')+'</small></div>'+
        '<div><small>'+esc(status)+' · '+esc(model3dStudioDate(item.completedAt||item.createdAt))+'</small><small>'+esc(formats.join(' · ')||'No validated export')+'</small></div>'+
        '<div class="zs-actions">'+
          (canOpen?'<button type="button" class="zs-primary" data-zs-3d-open="'+esc(item.jobId)+'">Open</button>':'')+
          downloads.map(function(entry){return '<button type="button" class="zs-secondary" data-zs-3d-download="'+esc(item.jobId)+'" data-role="'+esc(entry.role)+'">'+esc(model3dFormatRole(entry.role))+'</button>';}).join('')+
          (canCancel?'<button type="button" class="zs-secondary" data-zs-3d-cancel="'+esc(item.jobId)+'">Cancel</button>':'')+
        '</div>'+
      '</article>';
    }).join('');
  }

  async function signModel3dRole(jobId,role){
    return model3dStudioRequest('/api/3d-jobs/'+encodeURIComponent(jobId)+'/download/'+encodeURIComponent(role));
  }

  function renderModel3dStudioDetail(){
    var view=model3dStudioNode();
    if(!view)return;
    var box=view.querySelector('[data-zs-3d-detail]');
    if(!box)return;
    var item=model3dStudioState.selected;
    if(!item){
      box.innerHTML='<div class="zs-empty"><div><strong>No model selected</strong><span>Choose an item from history to reopen it.</span></div></div>';
      return;
    }
    var manifest=Array.isArray(item.manifest)?item.manifest:[];
    var downloadRoles=manifest.filter(function(entry){
      return /^model_glb$|^export_(glb|obj|fbx|usdz)$/.test(String(entry.role||''))&&entry.assetId;
    });
    var viewer=model3dStudioState.modelUrl
      ?'<zuvyr-model3d-viewer class="zs-3d-model-viewer" data-zs-3d-model-viewer src="'+esc(model3dStudioState.modelUrl)+'" exposure="1" aria-label="Interactive canonical 3D model"></zuvyr-model3d-viewer>'
      :(model3dStudioState.thumbnailUrl
        ?'<img class="zs-3d-poster" src="'+esc(model3dStudioState.thumbnailUrl)+'" alt="Canonical 3D thumbnail">'
        :'<div class="zs-empty"><div><strong>Viewer unavailable</strong><span>A fresh signed GLB is required.</span></div></div>');
    box.innerHTML='<div class="zs-3d-detail-grid">'+
      '<div>'+viewer+
        '<div class="zs-3d-view-controls">'+
          '<label>Lighting <input type="range" min="0.5" max="2" step="0.1" value="1" data-zs-3d-exposure></label>'+
          '<button type="button" class="zs-secondary" data-zs-3d-camera-reset>Reset camera</button>'+
        '</div>'+
        '<p class="zs-note">Interactive viewer uses a fresh owner-scoped signed GLB. Viewer controls create 0 provider calls.</p>'+
      '</div>'+
      '<div><h3>'+esc(item.prompt||'Generated 3D model')+'</h3>'+
        '<p>'+esc(model3dHumanOperation(item.operation))+' · '+esc(String(item.status||'unknown'))+'</p>'+
        '<div class="zs-chip-row">'+
          '<span class="zs-chip">Content '+esc(item.contentId||'pending')+'</span>'+
          '<span class="zs-chip">Face target '+esc(String(item.options&&item.options.faceCount||'default'))+'</span>'+
          '<span class="zs-chip">PBR '+esc(item.options&&item.options.enablePbr===true?'on':'off')+'</span>'+
        '</div>'+
        '<div class="zs-actions zs-3d-downloads">'+
          downloadRoles.map(function(entry){return '<button type="button" class="zs-secondary" data-zs-3d-download="'+esc(item.jobId)+'" data-role="'+esc(entry.role)+'">Download '+esc(model3dFormatRole(entry.role))+'</button>';}).join('')+
        '</div>'+
        '<p class="zs-note">GLTF / STL / 3MF remain unavailable because no canonical converter is verified. Remesh / retopo / rig / animation / retarget are not exposed.</p>'+
      '</div>'+
    '</div>';
    if(model3dStudioState.modelUrl){
      ensureModel3dViewer().catch(function(error){
        var viewerNode=view.querySelector('[data-zs-3d-model-viewer]');
        if(viewerNode){
          viewerNode.replaceWith(Object.assign(document.createElement('div'),{className:'zs-empty',textContent:error.message}));
        }
      });
    }
  }

  async function openModel3dStudioItem(jobId){
    var item=model3dStudioState.history.find(function(entry){return entry.jobId===jobId;});
    if(!item)return;
    model3dStudioState.selected=item;
    model3dStudioState.modelUrl=null;
    model3dStudioState.thumbnailUrl=null;
    renderModel3dStudioDetail();
    if(String(item.status||'')!=='done')return;
    var roles=Array.isArray(item.manifest)?item.manifest.map(function(entry){return entry.role;}):[];
    var jobs=[];
    if(roles.indexOf('model_glb')>-1){
      jobs.push(signModel3dRole(item.jobId,'model_glb').then(function(data){model3dStudioState.modelUrl=data.signedUrl||null;}));
    }
    if(roles.indexOf('thumbnail')>-1){
      jobs.push(signModel3dRole(item.jobId,'thumbnail').then(function(data){model3dStudioState.thumbnailUrl=data.signedUrl||null;}));
    }
    try{await Promise.all(jobs);}catch(error){toast(error.message);}
    renderModel3dStudioDetail();
  }

  async function downloadModel3dStudioRole(jobId,role){
    try{
      var data=await signModel3dRole(jobId,role);
      if(!data.signedUrl)throw new Error('Signed 3D download is unavailable.');
      window.open(data.signedUrl,'_blank','noopener,noreferrer');
    }catch(error){toast(error.message);}
  }


  function model3dTerminal(status){
    return ['done','failed','cancelled'].indexOf(String(status||'').toLowerCase())>-1;
  }

  function clearModel3dPoll(){
    if(model3dStudioState.pollTimer){
      clearTimeout(model3dStudioState.pollTimer);
      model3dStudioState.pollTimer=null;
    }
  }

  async function cancelModel3dStudioJob(jobId){
    try{
      await model3dStudioRequest(
        '/api/3d-jobs/'+encodeURIComponent(jobId)+'/cancel',
        {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}
      );
      toast('3D job cancellation recorded.');
      await loadModel3dStudio(true);
    }catch(error){toast(error.message);}
  }

  async function pollModel3dStudioJob(jobId,attempt){
    attempt=Number(attempt)||0;
    var view=model3dStudioNode();
    if(!view||view.dataset.active!=='true'||attempt>90)return;
    try{
      var data=await model3dStudioRequest('/api/job-status/'+encodeURIComponent(jobId));
      if(model3dTerminal(data.status)){
        clearModel3dPoll();
        await loadModel3dStudio(true);
        if(String(data.status).toLowerCase()==='done')await openModel3dStudioItem(jobId);
        return;
      }
    }catch(_){}
    clearModel3dPoll();
    model3dStudioState.pollTimer=setTimeout(function(){
      pollModel3dStudioJob(jobId,attempt+1);
    },2000);
  }

  function model3dPromptUtf8Bytes(value){
    var text=String(value||'');
    if(typeof TextEncoder==='function')return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }

  async function submitModel3dStudio(form){
    var caps=model3dStudioState.capabilities||{};
    var generation=caps.generation||{};
    if(generation.liveExecution!==true){
      toast('3D generation is fail-closed until M18 and PACK083 paid-execution gates are live.');
      return;
    }
    var prompt=String(form.elements.prompt.value||'').trim();
    var promptBytes=model3dPromptUtf8Bytes(prompt);
    if(!promptBytes||promptBytes>1024){
      toast('3D prompt must be between 1 and 1024 UTF-8 bytes.');
      return;
    }
    var button=form.querySelector('[data-zs-3d-generate]');
    if(button)button.disabled=true;
    try{
      var generateType=String(form.elements.generateType.value||'Normal');
      var data=await model3dStudioRequest('/api/generate-3d',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          prompt:prompt,
          model3dOperation:'text_to_3d',
          model3dViews:{},
          model3dOptions:{
            generateType:generateType,
            enablePbr:generateType==='Geometry'?false:form.elements.enablePbr.checked===true,
            faceCount:Number(form.elements.faceCount.value)
          }
        })
      });
      toast('3D job queued through the canonical ledger.');
      await loadModel3dStudio(true);
      if(data.jobId)pollModel3dStudioJob(data.jobId,0);
    }catch(error){toast(error.message);}
    finally{renderModel3dStudioTruth();}
  }

  async function loadModel3dStudio(force){
    var view=model3dStudioNode();
    if(!view)return;
    if(model3dStudioState.loading&&!force)return;
    model3dStudioState.loading=true;
    model3dStudioState.error=null;
    renderModel3dStudioHistory();
    try{
      var results=await Promise.all([
        model3dStudioRequest('/api/3d/studio-capabilities'),
        model3dStudioRequest('/api/3d/history?limit=50')
      ]);
      model3dStudioState.capabilities=results[0];
      model3dStudioState.history=Array.isArray(results[1].history)?results[1].history:[];
      if(model3dStudioState.selected){
        model3dStudioState.selected=model3dStudioState.history.find(function(item){return item.jobId===model3dStudioState.selected.jobId;})||null;
      }
    }catch(error){
      model3dStudioState.error=error.message;
    }finally{
      model3dStudioState.loading=false;
      renderModel3dStudioTruth();
      renderModel3dStudioHistory();
      renderModel3dStudioDetail();
    }
  }

  function bindModel3dStudio(){
    var view=model3dStudioNode();
    if(!view||view.dataset.model3dStudioBound==='true')return;
    view.dataset.model3dStudioBound='true';
    var form=view.querySelector('[data-zs-3d-form]');
    if(form){
      form.addEventListener('submit',function(event){
        event.preventDefault();
        submitModel3dStudio(form);
      });
      form.addEventListener('change',function(event){
        if(!event.target||event.target.name!=='generateType')return;
        var pbr=form.elements.enablePbr;
        if(!pbr)return;
        var geometry=event.target.value==='Geometry';
        pbr.disabled=geometry;
        if(geometry)pbr.checked=false;
      });
    }
    view.addEventListener('click',function(event){
      var target=event.target&&event.target.closest?event.target.closest('[data-zs-3d-refresh],[data-zs-3d-open],[data-zs-3d-download],[data-zs-3d-cancel],[data-zs-3d-camera-reset]'):null;
      if(!target)return;
      if(target.hasAttribute('data-zs-3d-refresh')){loadModel3dStudio();return;}
      if(target.hasAttribute('data-zs-3d-open')){openModel3dStudioItem(target.getAttribute('data-zs-3d-open'));return;}
      if(target.hasAttribute('data-zs-3d-download')){downloadModel3dStudioRole(target.getAttribute('data-zs-3d-download'),target.getAttribute('data-role'));return;}
      if(target.hasAttribute('data-zs-3d-cancel')){cancelModel3dStudioJob(target.getAttribute('data-zs-3d-cancel'));return;}
      if(target.hasAttribute('data-zs-3d-camera-reset')){
        var viewer=view.querySelector('[data-zs-3d-model-viewer]');
        if(viewer){
          viewer.setAttribute('camera-orbit','0deg 75deg 105%');
          if(typeof viewer.resetCamera==='function')viewer.resetCamera();
        }
      }
    });
    view.addEventListener('input',function(event){
      if(!event.target||!event.target.matches('[data-zs-3d-exposure]'))return;
      var viewer=view.querySelector('[data-zs-3d-model-viewer]');
      if(viewer)viewer.setAttribute('exposure',String(event.target.value||1));
    });
  }

  function genericView(id) {
    var state=sections.find(function(s){return s[0]===id;})[3];
    var extra=id==='code'?orchestrator('code'):toolCards(id);
    return heading(id)+'<div class="zs-banner"><span>◎</span><div><b>'+(state==='ready'?'Interface foundation is ready.':'Ready to connect safely.')+'</b> '+(state==='ready'?'Use the existing backend foundation and connect verified data next.':'Provider execution stays off until pricing, limits and settlement pass verification.')+'</div></div>'+extra;
  }
  function viewHtml(id) { if(id==='dashboard')return dashboard(); if(id==='images')return imageStudioView(); if(id==='3d')return model3dStudioView(); if(id==='ip')return ipView(); if(id==='usage')return usageView(); if(id==='research')return researchView(); if(id==='documents')return documentsView(); if(id==='spreadsheets')return spreadsheetsView(); if(id==='presentations')return presentationsView(); return genericView(id); }

  // Native navigation integration 01. Existing Chat, Images, Video, Code,
  // IP, Projects, History, Settings and payment handlers retain ownership.
  // Only sections without a native entry are added to the original shell.
  var nativeIds=['3d','voice','music','research','library','documents','spreadsheets','presentations','scheduled','plugins','usage','analytics'];
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
    ar:{'3d':'استوديو 3D',voice:'الصوت',music:'الموسيقى',research:'البحث',library:'المكتبة',documents:'المستندات',spreadsheets:'الجداول',presentations:'العروض التقديمية',scheduled:'المهام المجدولة',plugins:'الإضافات',usage:'الاستخدام والفوترة',analytics:'التحليلات'},
    fr:{'3d':'Studio 3D',voice:'Voix',music:'Musique',research:'Recherche',library:'Bibliothèque',documents:'Documents',spreadsheets:'Tableurs',presentations:'Présentations',scheduled:'Tâches planifiées',plugins:'Extensions',usage:'Utilisation et facturation',analytics:'Statistiques'}
  };
  function language(){var lang=(document.documentElement.lang||'en').split('-')[0];return languageCopy[lang]?lang:'en';}
  function sectionLabel(id){var lang=language();var item=sections.find(function(s){return s[0]===id;});return sectionNames[lang]&&sectionNames[lang][id]||item[2];}
  function nativeIcon(id){
    var paths={'3d':'M12 2 21 7v10l-9 5-9-5V7ZM3 7l9 5 9-5M12 12v10',voice:'M12 3v12M8 6v6a4 4 0 0 0 8 0V6M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8',music:'M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3h3M20 16a3 3 0 1 1-3-3h3',research:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6',library:'M4 3v18M8 3v18M12 3v18M16 4l5 16',documents:'M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8M8 16h8',spreadsheets:'M3 4h18v16H3ZM3 9h18M3 14h18M9 4v16',presentations:'M3 4h18v12H3ZM12 16v5M7 21l5-5 5 5',scheduled:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l4 2',plugins:'M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-12 0ZM12 17v4',usage:'M3 5h18v15H3ZM15 10h6v5h-6Z',analytics:'M4 20V10M10 20V4M16 20v-7M22 20H2'};
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
      if(view.dataset.zsView==='3d'){renderModel3dStudioTruth();return;}
      if(view.dataset.zsView==='3d')return;
      if(['documents','spreadsheets','presentations'].indexOf(view.dataset.zsView)>-1){
        var liveStatus=view.querySelector('.zs-status');if(liveStatus){liveStatus.textContent=language()==='ar'?'مفعّل':language()==='fr'?'Actif':'Live';liveStatus.classList.add('ready');}
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
    if(id==='images'){
      bindImageStudio();
      loadImageStudioHistory();
    }
    if(id==='3d'){
      bindModel3dStudio();
      loadModel3dStudio();
    }
    if(id==='spreadsheets'||id==='presentations')loadOfficeItems(id);
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

  function officeView(id){return suite.querySelector('[data-zs-view="'+id+'"]');}
  function parseCsvLine(line){var out=[],cur='',quoted=false;for(var i=0;i<line.length;i++){var ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){out.push(cur.trim());cur='';}else cur+=ch;}out.push(cur.trim());return out;}
  function spreadsheetValue(value){var v=String(value==null?'':value).trim();if(/^-?(?:\d+|\d*\.\d+)$/.test(v)&&v!=='')return Number(v);if(v.toLowerCase()==='true')return true;if(v.toLowerCase()==='false')return false;return v;}
  function spreadsheetRows(value){return String(value||'').split(/\r?\n/).map(function(line){return line.trim();}).filter(Boolean).map(function(line){return parseCsvLine(line).map(spreadsheetValue);});}
  function presentationSlides(value){return String(value||'').split(/\n\s*---\s*\n/).map(function(block){var lines=block.split(/\r?\n/).map(function(v){return v.trim();}).filter(Boolean);return lines.length?{title:lines[0],lines:lines.slice(1)}:null;}).filter(Boolean);}
  function officeAssetButtons(item){var assets=(item.assets||[]).filter(function(a){return a.status==='active';});return assets.map(function(a){var mime=a.mime_type||'';var label=mime.indexOf('spreadsheetml')>-1?'XLSX':mime.indexOf('presentationml')>-1?'PPTX':mime.indexOf('csv')>-1?'CSV':'FILE';return '<button type="button" class="zs-secondary" data-zs-office-download data-content-id="'+esc(item.id||item.contentId)+'" data-asset-id="'+esc(a.id||a.assetId)+'">'+label+'</button>';}).join('');}
  function renderOfficeList(id){var view=officeView(id),list=view&&view.querySelector(id==='spreadsheets'?'[data-zs-spreadsheet-list]':'[data-zs-presentation-list]');if(!list)return;var items=officeState[id]||[];if(!items.length){list.innerHTML='<div class="zs-empty"><div><strong>No '+esc(id)+' yet</strong><span>Generated artifacts will appear here.</span></div></div>';return;}list.innerHTML=items.slice(0,16).map(function(item){return '<article class="zs-document-item"><div><strong>'+esc(item.title||'Artifact')+'</strong><small>'+esc(item.updated_at||item.created_at||'')+'</small></div><div class="zs-document-assets">'+officeAssetButtons(item)+'</div></article>';}).join('');}
  async function loadOfficeItems(id){if(officeState.loading[id])return;officeState.loading[id]=true;try{var response=await request('/api/workspace/'+id+'?limit=30'),data=await response.json();if(!response.ok)throw new Error(data.code||id+'_load_failed');officeState[id]=data.items||[];renderOfficeList(id);}catch(error){toast(sectionLabel(id)+': '+error.message);}finally{officeState.loading[id]=false;}}
  async function officeDownload(button){button.disabled=true;try{var response=await request('/api/workspace/library/items/'+encodeURIComponent(button.dataset.contentId)+'/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assetId:button.dataset.assetId})}),data=await response.json();if(!response.ok)throw new Error(data.code||'office_download_failed');var url=data.download&&data.download.signed_url;if(!url)throw new Error('office_download_url_missing');window.open(url,'_blank','noopener,noreferrer');}catch(error){toast('Download: '+error.message);}finally{button.disabled=false;}}
  async function spreadsheetSubmit(form){var result=officeView('spreadsheets').querySelector('[data-zs-spreadsheet-result]'),button=form.querySelector('[data-zs-spreadsheet-generate]');var columns=parseCsvLine(form.columns.value||'').filter(Boolean),rows=spreadsheetRows(form.rows.value);var body={title:form.title.value,sheetName:form.sheetName.value||'Sheet 1',columns:columns,rows:rows,formats:checked(form,'spreadsheetFormats'),projectId:form.projectId.value||null,sourceRecordIds:documentIds(form.sourceRecordIds.value)};if(!body.formats.length){toast('Choose XLSX and/or CSV.');return;}button.disabled=true;result.dataset.visible='true';result.innerHTML='<div class="zs-result-title">Generating locally…</div><p>Formula execution and provider calls are disabled.</p>';try{var response=await request('/api/workspace/spreadsheets/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw new Error(data.code||'spreadsheet_generation_failed');var item=data.spreadsheet||{};result.innerHTML='<div class="zs-result-title">Spreadsheet ready</div><p>'+esc(item.title||body.title)+'</p><div class="zs-document-assets">'+(item.assets||[]).map(function(a){return '<button type="button" class="zs-secondary" data-zs-office-download data-content-id="'+esc(item.contentId)+'" data-asset-id="'+esc(a.assetId)+'">Download '+esc(String(a.format||'file').toUpperCase())+'</button>';}).join('')+'</div><p class="zs-note">Canonical Library artifact · provider calls '+Number(item.providerCalls||0)+' · generation credits '+Number(item.billedCredits||0)+'</p>';await loadOfficeItems('spreadsheets');}catch(error){result.innerHTML='<div class="zs-result-title">Spreadsheet needs attention</div><p>'+esc(error.message)+'</p>';}finally{button.disabled=false;}}
  async function presentationSubmit(form){var result=officeView('presentations').querySelector('[data-zs-presentation-result]'),button=form.querySelector('[data-zs-presentation-generate]');var body={title:form.title.value,slides:presentationSlides(form.slides.value),projectId:form.projectId.value||null,sourceRecordIds:documentIds(form.sourceRecordIds.value)};if(!body.slides.length){toast('Add at least one slide.');return;}button.disabled=true;result.dataset.visible='true';result.innerHTML='<div class="zs-result-title">Generating locally…</div><p>Building a 16:9 PPTX without a provider call.</p>';try{var response=await request('/api/workspace/presentations/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw new Error(data.code||'presentation_generation_failed');var item=data.presentation||{};result.innerHTML='<div class="zs-result-title">Presentation ready</div><p>'+esc(item.title||body.title)+' · '+Number((body.slides||[]).length)+' slides</p><div class="zs-document-assets">'+(item.assets||[]).map(function(a){return '<button type="button" class="zs-secondary" data-zs-office-download data-content-id="'+esc(item.contentId)+'" data-asset-id="'+esc(a.assetId)+'">Download PPTX</button>';}).join('')+'</div><p class="zs-note">Canonical Library artifact · provider calls '+Number(item.providerCalls||0)+' · generation credits '+Number(item.billedCredits||0)+'</p>';await loadOfficeItems('presentations');}catch(error){result.innerHTML='<div class="zs-result-title">Presentation needs attention</div><p>'+esc(error.message)+'</p>';}finally{button.disabled=false;}}
  async function researchArtifactSubmit(form){
    var view=suite.querySelector('[data-zs-view="research"]'),result=view&&view.querySelector('[data-zs-research-artifact-result]'),button=form.querySelector('[data-zs-research-artifact-generate]');
    var body={title:form.title.value,researchText:form.researchText.value,outputKind:form.outputKind.value,researchMode:form.researchMode.value,projectId:form.projectId.value||null,sourceRecordIds:documentIds(form.sourceRecordIds.value)};
    if(!body.sourceRecordIds.length){toast('Add at least one verified source record ID.');return;}
    button.disabled=true;result.dataset.visible='true';result.innerHTML='<div class="zs-result-title">Creating locally…</div><p>Verified citations are preserved. No second provider/model charge is created.</p>';
    try{
      var response=await request('/api/workspace/research/artifacts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();
      if(!response.ok)throw new Error(data.code||'research_artifact_checkpoint_failed');
      var checkpoint=data.checkpoint||{},artifact=checkpoint.artifact||{},assets=artifact.assets||[];
      result.innerHTML='<div class="zs-result-title">Research artifact ready</div><p>'+esc(artifact.title||body.title)+' · '+esc(checkpoint.outputKind||body.outputKind)+'</p><div class="zs-document-assets">'+assets.map(function(a){return '<button type="button" class="zs-secondary" data-zs-office-download data-content-id="'+esc(checkpoint.contentId)+'" data-asset-id="'+esc(a.assetId)+'">Download '+esc(String(a.format||'file').toUpperCase())+'</button>';}).join('')+'</div><p class="zs-note">Library reload '+(checkpoint.reload&&checkpoint.reload.verified?'verified':'pending')+' · conversion provider calls '+Number(checkpoint.billing&&checkpoint.billing.conversionProviderCalls||0)+' · conversion credits '+Number(checkpoint.billing&&checkpoint.billing.conversionCreditsCharged||0)+' · duplicate charge '+(checkpoint.billing&&checkpoint.billing.duplicateCharge?'yes':'no')+'</p>';
    }catch(error){result.innerHTML='<div class="zs-result-title">Research handoff needs attention</div><p>'+esc(error.message)+'</p>';}
    finally{button.disabled=false;}
  }
  function renderPlan(el,plan){el.dataset.visible='true';el.innerHTML='<div class="zs-result-title">✦ Safe proposal ready</div><p>No provider call or credit charge was made.</p><div class="zs-step-list">'+plan.steps.map(function(s,i){return '<div class="zs-step"><span class="zs-step-num">'+(i+1)+'</span><div><strong>'+esc(s.title)+'</strong><small>'+esc(s.capability)+' · proposed · execution off</small></div></div>';}).join('')+'</div>';}
  async function planSubmit(form){var result=form.parentNode.querySelector('[data-zs-plan-result]');var body={goal:form.goal.value,requestedOutputs:checked(form,'outputs'),additionalCreationConsent:form.consent.checked};try{var res=await request('/api/unified-product/orchestration/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});var data=await res.json();if(!res.ok)throw new Error(data.code||'plan_failed');renderPlan(result,data.plan);}catch(error){result.dataset.visible='true';result.innerHTML='<div class="zs-result-title">Planning needs attention</div><p>'+esc(error.message==='additional_creation_consent_required'?'Approve selected media creation to include it in the plan.':error.message)+'</p>';}}
  async function ipSubmit(form){var result=form.parentNode.querySelector('[data-zs-ip-result]');var body={goal:form.goal.value,scopes:checked(form,'scopes'),explicitConsent:form.consent.checked};try{var res=await request('/api/unified-product/ip/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});var data=await res.json();if(!res.ok)throw new Error(data.code||'ip_plan_failed');result.dataset.visible='true';result.innerHTML='<div class="zs-result-title">✦ IP tool plan ready</div><p>'+data.plan.scopes.map(esc).join(' · ')+'</p><div class="zs-chip-row"><span class="zs-chip">Execution off</span><span class="zs-chip">Device control off</span><span class="zs-chip">Audit required</span><span class="zs-chip">STOP available</span></div>';}catch(error){result.dataset.visible='true';result.innerHTML='<div class="zs-result-title">Permission check</div><p>'+esc(error.message)+'</p>';}}
  document.addEventListener('submit',function(e){
    var form=e.target;
    if(form&&form.matches&&form.matches('[data-zs-research-artifact-form]')){e.preventDefault();researchArtifactSubmit(form);return;}
    if(form&&form.matches&&form.matches('[data-zs-document-form]')){e.preventDefault();documentSubmit(form);return;}
    if(form&&form.matches&&form.matches('[data-zs-spreadsheet-form]')){e.preventDefault();spreadsheetSubmit(form);return;}
    if(form&&form.matches&&form.matches('[data-zs-presentation-form]')){e.preventDefault();presentationSubmit(form);return;}
    if(form&&form.matches&&form.matches('[data-zs-plan-form]')){e.preventDefault();planSubmit(form);return;}
    if(form&&form.matches&&form.matches('[data-zs-ip-form]')){e.preventDefault();ipSubmit(form);return;}
  });
  document.addEventListener('click',function(e){
    if(!e.target.closest)return;
    var docDownload=e.target.closest('[data-zs-document-download]');if(docDownload&&suite.contains(docDownload)){downloadDocument(docDownload);return;}
    var officeDownloadButton=e.target.closest('[data-zs-office-download]');if(officeDownloadButton&&suite.contains(officeDownloadButton)){officeDownload(officeDownloadButton);return;}
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


/* ZUVYR PACK075 CODE STUDIO */
(function () {
  'use strict';
  if (window.__zuvyrPack075CodeStudio) return;
  window.__zuvyrPack075CodeStudio = true;

  var state = {
    projects: [],
    project: null,
    openFiles: [],
    activeFile: null,
    dividerBasisPoints: 6000,
    previewVisible: true,
    mobilePane: 'code',
    logsVisible: false,
    expanded: false,
    dirty: false,
    loading: false,
    status: '',
    editorTimer: 0,
    validationTimer: 0,
    capabilities: null,
    sandboxSessionId: null,
    previewState: 'unavailable',
    previewTransportPath: null,
    previewUrl: null,
    previewViewport: 'fit',
    previewFrameKey: 0,
    previewTicketExpiresAt: null,
    previewError: '',
    currentRuntimeJob: null,
    runtimeLogs: [],
    runtimePollTimer: 0,
    repairPollTimer: 0,
    repairRunId: null,
    runtimeBusy: false,
    lastDiagnostic: null,
    liveRuntimeAvailable: false,
    livePreviewSupported: false
  };

  function codeApi(path, options) {
    if (typeof window.authFetch !== 'function') {
      return Promise.reject(new Error('Code Studio authentication unavailable.'));
    }
    return window.authFetch(path, options || {}).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok || data.status !== 'success') {
          var error = new Error(data.message || data.code || ('HTTP ' + response.status));
          error.code = data.code || 'code_studio_request_failed';
          error.status = response.status;
          throw error;
        }
        return data;
      });
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char];
    });
  }

  function codeScreen() {
    return document.getElementById('feature-code');
  }

  function shell() {
    return codeScreen() && codeScreen().querySelector('[data-zuvyr-code-studio-pack075]');
  }

  function currentFile() {
    if (!state.project || !state.activeFile) return null;
    return state.project.files.find(function (file) {
      return file.path === state.activeFile;
    }) || null;
  }

  function setStatus(message) {
    state.status = String(message || '');
    var node = shell() && shell().querySelector('[data-zs-code-status]');
    if (node) node.textContent = state.status;
  }

  function requestId(prefix) {
    var id =
      window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : Date.now() + '-' + Math.random().toString(36).slice(2);
    return String(prefix || 'code') + '-' + id;
  }

  function codeApiBase() {
    try {
      if (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.API_BASE) {
        return String(CONFIG.API_BASE).replace(/\/$/, '');
      }
    } catch (_) {}
    var runtimeBase = window.ROX_RUNTIME_CONFIG && window.ROX_RUNTIME_CONFIG.API_BASE;
    return runtimeBase ? String(runtimeBase).replace(/\/$/, '') : '';
  }

  function clearRuntimeTimers() {
    if (state.runtimePollTimer) clearTimeout(state.runtimePollTimer);
    if (state.repairPollTimer) clearTimeout(state.repairPollTimer);
    state.runtimePollTimer = 0;
    state.repairPollTimer = 0;
  }

  function resetRuntimeProductState() {
    clearRuntimeTimers();
    state.sandboxSessionId = null;
    state.previewState = 'unavailable';
    state.previewTransportPath = null;
    state.previewUrl = null;
    state.previewTicketExpiresAt = null;
    state.previewError = '';
    state.currentRuntimeJob = null;
    state.runtimeLogs = [];
    state.repairRunId = null;
    state.runtimeBusy = false;
    state.lastDiagnostic = null;
  }

  function runtimeBlockers() {
    var pack076 = state.capabilities && state.capabilities.pack076;
    var pack077 = state.capabilities && state.capabilities.pack077;
    var pack078 = state.capabilities && state.capabilities.pack078;
    var blockers = [];
    [pack076, pack077, pack078].forEach(function (pack) {
      if (pack && Array.isArray(pack.blockers)) blockers.push.apply(blockers, pack.blockers);
    });
    if (pack078 && pack078.previewTransportVerified === false) {
      blockers.push('secure_preview_transport_not_verified');
    }
    return Array.from(new Set(blockers.filter(Boolean)));
  }

  function loadCapabilities() {
    return codeApi('/api/code-studio/capabilities')
      .then(function (data) {
        state.capabilities = data;
        state.liveRuntimeAvailable = !!(
          data.pack076 &&
          data.pack076.liveProvisioning === true &&
          data.pack077 &&
          data.pack077.liveExecution === true
        );
        state.livePreviewSupported = !!(
          state.liveRuntimeAvailable &&
          data.pack078 &&
          data.pack078.livePreview === true &&
          data.pack078.previewTransportVerified === true
        );
        return data;
      });
  }

  function listProjectSandboxes() {
    if (!state.project) return Promise.resolve([]);
    return codeApi(
      '/api/code-studio/sandbox/sessions?projectId=' +
      encodeURIComponent(state.project.id) +
      '&limit=20'
    ).then(function (data) {
      return Array.isArray(data.sessions) ? data.sessions : [];
    });
  }

  function refreshPreviewState() {
    if (!state.project || !state.sandboxSessionId) {
      state.previewState = 'unavailable';
      return Promise.resolve(null);
    }
    return codeApi(
      '/api/code-studio/projects/' + encodeURIComponent(state.project.id) +
      '/preview/state?sandboxSessionId=' +
      encodeURIComponent(state.sandboxSessionId)
    ).then(function (data) {
      var preview = data.preview || {};
      state.previewState = preview.state || 'unavailable';
      state.lastDiagnostic =
        preview.diagnostic && Object.keys(preview.diagnostic).length
          ? preview.diagnostic
          : state.lastDiagnostic;
      if (preview.ticketAvailable === true) {
        return requestPreviewTicket().then(function () { return preview; });
      }
      state.previewTransportPath = null;
      state.previewUrl = null;
      return preview;
    }).catch(function (error) {
      state.previewState = 'unavailable';
      state.previewError = error.message || error.code || 'Preview unavailable.';
      return null;
    });
  }

  function hydrateRuntimeForProject() {
    resetRuntimeProductState();
    if (!state.project) {
      render();
      return Promise.resolve();
    }
    return loadCapabilities()
      .then(function () { return listProjectSandboxes(); })
      .then(function (sessions) {
        var running = sessions.find(function (session) {
          return session && session.status === 'running';
        });
        state.sandboxSessionId = running ? running.id : null;
        return state.sandboxSessionId ? refreshPreviewState() : null;
      })
      .catch(function (error) {
        state.previewError = error.message || error.code || 'Runtime unavailable.';
      })
      .finally(function () {
        render();
      });
  }

  function ensureSandboxSession() {
    if (!state.project) return Promise.reject(new Error('No Code Project is open.'));
    var capabilitiesPromise = state.capabilities
      ? Promise.resolve(state.capabilities)
      : loadCapabilities();

    return capabilitiesPromise
      .then(function () {
        if (state.sandboxSessionId) return state.sandboxSessionId;
        return listProjectSandboxes().then(function (sessions) {
          var running = sessions.find(function (session) {
            return session && session.status === 'running';
          });
          if (running) {
            state.sandboxSessionId = running.id;
            return running.id;
          }

          if (!state.liveRuntimeAvailable) {
            var blockers = runtimeBlockers();
            var blocked = new Error(
              'Runtime unavailable' +
              (blockers.length ? ': ' + blockers.join(', ') : '.')
            );
            blocked.code = 'pack078_repair_runtime_unavailable';
            throw blocked;
          }

          return codeApi('/api/code-studio/sandbox/sessions', {
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'Idempotency-Key':requestId('sandbox')
            },
            body:JSON.stringify({ projectId: state.project.id })
          }).then(function (data) {
            state.sandboxSessionId = data.session && data.session.id;
            if (!state.sandboxSessionId) throw new Error('Sandbox session unavailable.');
            return state.sandboxSessionId;
          });
        });
      });
  }

  function requestPreviewTicket() {
    if (!state.sandboxSessionId) {
      return Promise.reject(new Error('Preview session unavailable.'));
    }
    return codeApi(
      '/api/code-studio/sandbox/sessions/' +
      encodeURIComponent(state.sandboxSessionId) +
      '/preview-ticket',
      {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ ttlSeconds: 300 })
      }
    ).then(function (data) {
      var preview = data.preview || {};
      var base = codeApiBase();
      if (!preview.transportPath || !base) {
        throw new Error('Preview API origin unavailable.');
      }
      state.previewTransportPath = preview.transportPath;
      state.previewUrl = base + preview.transportPath;
      state.previewTicketExpiresAt = preview.expiresAt || null;
      state.previewError = '';
      state.previewState = 'ready';
      return state.previewUrl;
    });
  }

  function loadRuntimeLogs(jobId) {
    if (!jobId) return Promise.resolve([]);
    return codeApi(
      '/api/code-studio/runtime/jobs/' + encodeURIComponent(jobId) +
      '/logs?limit=200'
    ).then(function (data) {
      state.runtimeLogs = Array.isArray(data.logs) ? data.logs : [];
      return state.runtimeLogs;
    }).catch(function () {
      return state.runtimeLogs;
    });
  }

  function applyRuntimeJob(job) {
    if (!job) return;
    state.currentRuntimeJob = job;
    if (job.result && job.result.diagnostic) {
      state.lastDiagnostic = job.result.diagnostic;
    }
    if (job.status === 'failed') {
      if (job.operation === 'build') state.previewState = 'build_failed';
      if (job.operation === 'run') state.previewState = 'runtime_error';
    }
  }

  function pollRuntimeJob(jobId, operation, attempt) {
    var count = Number(attempt || 0);
    if (!jobId || count >= 240) {
      state.runtimeBusy = false;
      setStatus('Runtime polling stopped at its bounded limit.');
      render();
      return;
    }
    codeApi('/api/code-studio/runtime/jobs/' + encodeURIComponent(jobId))
      .then(function (data) {
        var job = data.job;
        applyRuntimeJob(job);
        return loadRuntimeLogs(jobId).then(function () {
          return refreshPreviewState().then(function () { return job; });
        });
      })
      .then(function (job) {
        render();
        if (!job) return;

        if (['succeeded','failed','cancelled'].indexOf(job.status) >= 0) {
          state.runtimeBusy = false;
          setStatus(
            job.status === 'succeeded'
              ? (operation === 'build'
                  ? 'Build passed.'
                  : operation === 'test'
                    ? 'Tests passed.'
                    : 'Runtime finished.')
              : (job.result && job.result.diagnostic && job.result.diagnostic.message) ||
                (operation + ' failed.')
          );
          render();
          return;
        }

        if (operation === 'run' && count >= 40) {
          state.runtimeBusy = false;
          setStatus(
            state.previewUrl
              ? 'Preview process is running.'
              : 'Runtime is running; secure preview transport is not ready.'
          );
          render();
          return;
        }

        state.runtimePollTimer = setTimeout(function () {
          pollRuntimeJob(jobId, operation, count + 1);
        }, 1500);
      })
      .catch(function (error) {
        state.runtimeBusy = false;
        state.previewError = error.message || error.code || 'Runtime polling failed.';
        setStatus(state.previewError);
        render();
      });
  }

  function runRuntimeOperation(operation) {
    if (!state.project || state.runtimeBusy) return;
    state.runtimeBusy = true;
    state.previewError = '';
    if (operation === 'build') state.previewState = 'building';
    if (operation === 'run') state.previewState = 'starting';
    setStatus(
      operation === 'build'
        ? 'Building project…'
        : operation === 'test'
          ? 'Running tests…'
          : 'Starting preview runtime…'
    );
    render();

    var save = state.dirty ? saveProject() : Promise.resolve(state.project);
    save
      .then(function () { return ensureSandboxSession(); })
      .then(function (sandboxSessionId) {
        return codeApi('/api/code-studio/runtime/request', {
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            'Idempotency-Key':requestId(operation)
          },
          body:JSON.stringify({
            operation:operation,
            projectId:state.project.id,
            sandboxSessionId:sandboxSessionId
          })
        });
      })
      .then(function (data) {
        applyRuntimeJob(data.job);
        render();
        pollRuntimeJob(data.job.id, operation, 0);
      })
      .catch(function (error) {
        state.runtimeBusy = false;
        state.previewState =
          operation === 'build' ? 'build_failed' : 'unavailable';
        state.previewError = error.message || error.code || 'Runtime unavailable.';
        setStatus(state.previewError);
        render();
      });
  }

  function schedulePostSaveValidation() {
    clearTimeout(state.validationTimer);
    state.validationTimer = setTimeout(function () {
      if (
        state.project &&
        state.liveRuntimeAvailable &&
        state.sandboxSessionId &&
        !state.runtimeBusy
      ) {
        state.previewState = 'updating';
        render();
        runRuntimeOperation('build');
      }
    }, 650);
  }

  function pollRepair(repairRunId, attempt) {
    var count = Number(attempt || 0);
    if (!repairRunId || count >= 240) {
      state.runtimeBusy = false;
      setStatus('Repair polling stopped at its bounded limit.');
      render();
      return;
    }
    codeApi(
      '/api/code-studio/repair/' + encodeURIComponent(repairRunId) + '/continue',
      { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' }
    )
      .then(function (data) {
        var repair = data.repair || {};
        var run = repair.run || {};
        state.repairRunId = run.id || repairRunId;
        if (repair.retestJob) applyRuntimeJob(repair.retestJob);

        if (['succeeded','failed','exhausted','cancelled'].indexOf(run.status) >= 0) {
          state.runtimeBusy = false;
          if (run.status === 'succeeded') {
            setStatus('Repair succeeded and retest passed.');
            return loadProject(state.project.id);
          }
          setStatus(
            run.status === 'exhausted'
              ? 'Repair stopped after the bounded two attempts.'
              : 'Repair stopped: ' + run.status
          );
          render();
          return null;
        }

        setStatus('Repair attempt ' + (run.attemptsUsed || 0) + ' of ' + (run.maxAttempts || 2) + '…');
        render();
        state.repairPollTimer = setTimeout(function () {
          pollRepair(repairRunId, count + 1);
        }, 1500);
        return null;
      })
      .catch(function (error) {
        state.runtimeBusy = false;
        setStatus(error.message || error.code || 'Repair unavailable.');
        render();
      });
  }

  function startRepair() {
    var job = state.currentRuntimeJob;
    if (
      !state.project ||
      !state.sandboxSessionId ||
      !job ||
      job.status !== 'failed' ||
      !state.lastDiagnostic
    ) {
      setStatus('A verified failed build, test, or runtime job is required for Repair.');
      return;
    }
    if (state.runtimeBusy) return;
    state.runtimeBusy = true;
    setStatus('Starting bounded AI repair…');
    render();

    codeApi(
      '/api/code-studio/projects/' + encodeURIComponent(state.project.id) + '/repair',
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Idempotency-Key':requestId('repair')
        },
        body:JSON.stringify({
          sandboxSessionId:state.sandboxSessionId,
          sourceJobId:job.id
        })
      }
    )
      .then(function (data) {
        var repair = data.repair || {};
        var run = repair.run || {};
        if (!run.id) throw new Error('Repair receipt unavailable.');
        state.repairRunId = run.id;
        render();
        pollRepair(run.id, 0);
      })
      .catch(function (error) {
        state.runtimeBusy = false;
        setStatus(error.message || error.code || 'Repair unavailable.');
        render();
      });
  }

  function refreshPreviewFrame() {
    if (!state.previewUrl) {
      refreshPreviewState().then(render);
      return;
    }
    state.previewFrameKey += 1;
    render();
  }

  function openPreview() {
    if (!state.previewUrl) {
      setStatus('Secure preview URL is unavailable.');
      return;
    }
    window.open(state.previewUrl, '_blank', 'noopener,noreferrer');
  }

  function fullscreenPreview() {
    var frame = shell() && shell().querySelector('[data-zs-code-preview-frame]');
    if (!frame) {
      setStatus('Preview is not ready.');
      return;
    }
    if (frame.requestFullscreen) {
      frame.requestFullscreen().catch(function () {});
    }
  }

  function diagnosticHtml() {
    var d = state.lastDiagnostic;
    if (!d || !d.kind || d.kind === 'none') return '';
    var location =
      d.file
        ? escapeHtml(d.file) +
          (d.line ? ':' + escapeHtml(d.line) : '') +
          (d.column ? ':' + escapeHtml(d.column) : '')
        : 'No source location';
    var repairable =
      state.currentRuntimeJob &&
      state.currentRuntimeJob.status === 'failed' &&
      ['build','test','run'].indexOf(state.currentRuntimeJob.operation) >= 0;
    return (
      '<div class="zs-code-diagnostic">' +
        '<div><strong>' + escapeHtml(d.kind) + '</strong><span>' + location + '</span></div>' +
        '<p>' + escapeHtml(d.message || 'Runtime command failed.') + '</p>' +
        (repairable
          ? '<button type="button" data-zs-code-repair' +
            (state.runtimeBusy ? ' disabled' : '') +
            '>Repair with AI</button>'
          : '') +
      '</div>'
    );
  }

  function viewportWidth() {
    if (state.previewViewport === 'desktop') return 1440;
    if (state.previewViewport === 'tablet') return 834;
    if (state.previewViewport === 'mobile') return 390;
    return null;
  }

  function previewPanelHtml() {
    var ready = state.previewState === 'ready' && !!state.previewUrl;
    var width = viewportWidth();
    var frameStyle = width
      ? 'width:min(100%,' + width + 'px);'
      : 'width:100%;';
    var statusLabel =
      state.previewState === 'build_failed' ? 'Build failed' :
      state.previewState === 'runtime_error' ? 'Runtime error' :
      state.previewState === 'building' ? 'Building' :
      state.previewState === 'starting' ? 'Starting' :
      state.previewState === 'updating' ? 'Updating' :
      ready ? 'Ready' : 'Preview unavailable';

    var body;
    if (ready) {
      body =
        '<div class="zs-code-preview-stage">' +
          '<iframe data-zs-code-preview-frame title="ZUVYR Code Preview" ' +
            'sandbox="allow-scripts" referrerpolicy="no-referrer" ' +
            'style="' + frameStyle + '" ' +
            'src="' + escapeHtml(state.previewUrl) +
            (state.previewUrl.indexOf('?') >= 0 ? '&' : '?') +
            'zuvyr_refresh=' + state.previewFrameKey + '">' +
          '</iframe>' +
        '</div>';
    } else {
      var blockers = runtimeBlockers();
      body =
        '<div class="zs-code-preview-unavailable" data-zs-code-preview-unavailable>' +
          '<strong>' + escapeHtml(statusLabel) + '</strong>' +
          '<span>' +
            escapeHtml(
              state.previewError ||
              (blockers.length
                ? 'Secure live preview is gated: ' + blockers.join(', ')
                : 'No fake preview is shown. A verified isolated runtime and protected preview route are required.')
            ) +
          '</span>' +
        '</div>';
    }

    var viewports = ['fit','desktop','tablet','mobile'].map(function (name) {
      return '<button type="button" data-zs-code-viewport="' + name + '"' +
        (state.previewViewport === name ? ' class="is-active"' : '') +
        '>' + name.charAt(0).toUpperCase() + name.slice(1) + '</button>';
    }).join('');

    return (
      '<div class="zs-code-preview-toolbar zs-code-preview-toolbar-pack078">' +
        '<div class="zs-code-preview-title"><strong>Preview</strong>' +
          '<span class="zs-code-preview-state state-' + escapeHtml(state.previewState) + '">' +
            escapeHtml(statusLabel) +
          '</span></div>' +
        '<div class="zs-code-preview-actions">' +
          viewports +
          '<button type="button" data-zs-code-preview-refresh>Refresh</button>' +
          '<button type="button" data-zs-code-preview-open' + (ready ? '' : ' disabled') + '>Open Preview</button>' +
          '<button type="button" data-zs-code-preview-fullscreen' + (ready ? '' : ' disabled') + '>Fullscreen</button>' +
          '<button type="button" data-zs-code-toggle-preview>' +
            (state.previewVisible ? 'Hide preview' : 'Show preview') + '</button>' +
          '<button type="button" data-zs-code-expand>' +
            (state.expanded ? 'Restore layout' : 'Expand editor') + '</button>' +
        '</div>' +
      '</div>' +
      body +
      diagnosticHtml()
    );
  }

  function runtimeLogsHtml() {
    if (!state.runtimeLogs.length) {
      return '<div class="zs-code-logs"><strong>No runtime logs yet</strong>' +
        '<span>Build, Test, and Run Preview logs will appear here when a verified sandbox runtime is available.</span></div>';
    }
    return '<div class="zs-code-logs zs-code-live-logs">' +
      state.runtimeLogs.map(function (row) {
        return '<div class="stream-' + escapeHtml(row.stream || 'stdout') + '">' +
          '<span>' + escapeHtml(row.stream || 'stdout') + '</span>' +
          '<code>' + escapeHtml(row.message || '') + '</code>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function projectPayload() {
    return {
      name: state.project.name,
      entryFile: state.project.entryFile,
      files: state.project.files.map(function (file) {
        return {
          path: file.path,
          content: file.content,
          language: file.language || null
        };
      })
    };
  }

  function ensureOpenFile(path) {
    if (!path) return;
    if (state.openFiles.indexOf(path) < 0) state.openFiles.push(path);
    state.openFiles = state.openFiles.filter(function (value) {
      return state.project.files.some(function (file) { return file.path === value; });
    }).slice(-20);
    state.activeFile = path;
  }

  function applyProject(project) {
    state.project = project || null;
    state.dirty = false;
    if (!project) {
      state.openFiles = [];
      state.activeFile = null;
      return;
    }

    var editor = project.editorState || {};
    state.openFiles = Array.isArray(editor.openFiles)
      ? editor.openFiles.filter(function (path) {
          return project.files.some(function (file) { return file.path === path; });
        })
      : [];
    state.activeFile =
      editor.activeFile &&
      project.files.some(function (file) { return file.path === editor.activeFile; })
        ? editor.activeFile
        : null;
    state.dividerBasisPoints = Number(editor.dividerBasisPoints || 6000);
    state.previewVisible = editor.previewVisible !== false;
    state.mobilePane = editor.mobilePane === 'preview' ? 'preview' : 'code';
    state.logsVisible = editor.logsVisible === true;

    if (!state.activeFile) {
      ensureOpenFile(project.entryFile || (project.files[0] && project.files[0].path));
    } else {
      ensureOpenFile(state.activeFile);
    }
  }

  function projectOptions() {
    if (!state.projects.length) return '<option value="">No projects yet</option>';
    return state.projects.map(function (project) {
      return '<option value="' + escapeHtml(project.id) + '"' +
        (state.project && state.project.id === project.id ? ' selected' : '') +
        '>' + escapeHtml(project.name) + '</option>';
    }).join('');
  }

  function fileTreeHtml() {
    if (!state.project) return '';
    return state.project.files.map(function (file) {
      var active = file.path === state.activeFile;
      return '<button type="button" class="zs-code-file' + (active ? ' is-active' : '') +
        '" data-zs-code-open-file="' + escapeHtml(file.path) + '">' +
        '<span>⌁</span><span>' + escapeHtml(file.path) + '</span></button>';
    }).join('');
  }

  function tabsHtml() {
    if (!state.project) return '';
    return state.openFiles.map(function (path) {
      var active = path === state.activeFile;
      return '<button type="button" class="zs-code-tab' + (active ? ' is-active' : '') +
        '" data-zs-code-open-file="' + escapeHtml(path) + '">' +
        '<span>' + escapeHtml(path) + '</span>' +
        '<i data-zs-code-close-tab="' + escapeHtml(path) + '" aria-label="Close tab">×</i>' +
        '</button>';
    }).join('');
  }

  function branchesHtml() {
    if (!state.project || !Array.isArray(state.project.branches)) return '';
    return state.project.branches.map(function (branch) {
      return '<option value="' + escapeHtml(branch.name) + '"' +
        (branch.name === state.project.currentBranch ? ' selected' : '') +
        '>' + escapeHtml(branch.name) + '</option>';
    }).join('');
  }

  function render() {
    var root = shell();
    if (!root) return;

    if (!state.project) {
      root.innerHTML =
        '<div class="zs-code-pack075-toolbar">' +
          '<div><strong>Code Projects</strong><span>Durable multi-file workspace</span></div>' +
          '<div class="zs-code-pack075-actions">' +
            '<select data-zs-code-project-select>' + projectOptions() + '</select>' +
            '<button type="button" data-zs-code-new-project>New project</button>' +
          '</div>' +
        '</div>' +
        '<div class="zs-code-empty">' +
          '<strong>' + (state.loading ? 'Loading projects…' : 'No Code Project open') + '</strong>' +
          '<span>Create a real multi-file project. Build/Test/Preview activate only through the verified isolated runtime.</span>' +
        '</div>' +
        '<div class="zs-code-status" data-zs-code-status>' + escapeHtml(state.status) + '</div>';
      return;
    }

    var file = currentFile();
    var versionCount = Array.isArray(state.project.versions) ? state.project.versions.length : 0;
    var assetCount = Array.isArray(state.project.assetBindings) ? state.project.assetBindings.length : 0;
    var splitStyle = '--zs-code-editor-width:' + (state.dividerBasisPoints / 100).toFixed(2) + '%;';
    var rootClasses = [
      'zs-code-pack075',
      'zs-code-pack078',
      state.previewVisible ? 'has-preview' : 'no-preview',
      state.logsVisible ? 'has-logs' : '',
      state.expanded ? 'is-editor-expanded' : '',
      state.mobilePane === 'preview' ? 'mobile-preview' : 'mobile-code'
    ].filter(Boolean).join(' ');
    var runtimeDisabled = state.runtimeBusy || !state.liveRuntimeAvailable;

    root.className = rootClasses;
    root.innerHTML =
      '<div class="zs-code-pack075-toolbar">' +
        '<div class="zs-code-pack075-project-meta">' +
          '<strong>' + escapeHtml(state.project.name) + '</strong>' +
          '<span>' + escapeHtml(state.project.currentBranch) + ' · revision ' +
            escapeHtml(state.project.revision) + ' · ' + versionCount + ' versions · ' +
            assetCount + ' linked assets</span>' +
        '</div>' +
        '<div class="zs-code-pack075-actions">' +
          '<select data-zs-code-project-select aria-label="Code project">' + projectOptions() + '</select>' +
          '<select data-zs-code-branch-select aria-label="Code branch">' + branchesHtml() + '</select>' +
          '<button type="button" data-zs-code-new-branch>New branch</button>' +
          '<button type="button" data-zs-code-new-project>New project</button>' +
          '<button type="button" class="is-primary" data-zs-code-save>' +
            (state.dirty ? 'Save changes *' : 'Save') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="zs-code-runtime-toolbar">' +
        '<div><strong>Runtime</strong><span>' +
          (state.liveRuntimeAvailable
            ? 'Verified sandbox runtime'
            : 'Runtime gated — engineering layer ready, live provider acceptance deferred') +
        '</span></div>' +
        '<div>' +
          '<button type="button" data-zs-code-runtime="build"' + (runtimeDisabled ? ' disabled' : '') + '>Build</button>' +
          '<button type="button" data-zs-code-runtime="test"' + (runtimeDisabled ? ' disabled' : '') + '>Test</button>' +
          '<button type="button" class="is-primary" data-zs-code-runtime="run"' + (runtimeDisabled ? ' disabled' : '') + '>Run Preview</button>' +
        '</div>' +
      '</div>' +
      '<div class="zs-code-mobile-switch">' +
        '<button type="button" data-zs-code-mobile-pane="code"' +
          (state.mobilePane === 'code' ? ' class="is-active"' : '') + '>Code</button>' +
        '<button type="button" data-zs-code-mobile-pane="preview"' +
          (state.mobilePane === 'preview' ? ' class="is-active"' : '') + '>Preview</button>' +
      '</div>' +
      '<div class="zs-code-workspace">' +
        '<aside class="zs-code-files">' +
          '<div class="zs-code-pane-head"><strong>Files</strong><button type="button" data-zs-code-add-file>＋</button></div>' +
          '<div class="zs-code-file-list">' + fileTreeHtml() + '</div>' +
          '<div class="zs-code-file-actions">' +
            '<button type="button" data-zs-code-rename-file>Rename</button>' +
            '<button type="button" data-zs-code-delete-file>Delete</button>' +
          '</div>' +
        '</aside>' +
        '<div class="zs-code-split" style="' + splitStyle + '">' +
          '<section class="zs-code-editor-pane">' +
            '<div class="zs-code-tabs">' + tabsHtml() + '</div>' +
            '<textarea data-zs-code-editor spellcheck="false" aria-label="Code editor"' +
              (file ? '' : ' disabled') + '>' + escapeHtml(file ? file.content : '') + '</textarea>' +
          '</section>' +
          '<div class="zs-code-divider" data-zs-code-divider role="separator" aria-orientation="vertical" tabindex="0"></div>' +
          '<section class="zs-code-preview-pane">' +
            previewPanelHtml() +
          '</section>' +
        '</div>' +
      '</div>' +
      '<div class="zs-code-ai-edit">' +
        '<div><strong>AI edit</strong><span>Edits are scoped, versioned and metered through the ZUVYR Router.</span></div>' +
        '<textarea data-zs-code-ai-instruction maxlength="8000" placeholder="Describe the exact change for ' +
          escapeHtml(state.activeFile || 'the active file') + '"></textarea>' +
        '<button type="button" class="is-primary" data-zs-code-ai-apply' +
          (!file ? ' disabled' : '') + '>Apply to active file</button>' +
      '</div>' +
      '<div class="zs-code-runtime-reserved">' +
        '<button type="button" data-zs-code-toggle-logs>' +
          (state.logsVisible ? 'Hide logs / terminal' : 'Show logs / terminal') + '</button>' +
        (state.logsVisible ? runtimeLogsHtml() : '') +
      '</div>' +
      '<div class="zs-code-status" data-zs-code-status>' + escapeHtml(state.status) + '</div>';
  }

  function saveEditorStateSoon() {
    clearTimeout(state.editorTimer);
    state.editorTimer = setTimeout(function () {
      if (!state.project) return;
      codeApi(
        '/api/code-studio/projects/' + encodeURIComponent(state.project.id) + '/editor-state',
        {
          method: 'PATCH',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            openFiles: state.openFiles,
            activeFile: state.activeFile,
            dividerBasisPoints: state.dividerBasisPoints,
            previewVisible: state.previewVisible,
            mobilePane: state.mobilePane,
            logsVisible: state.logsVisible
          })
        }
      ).catch(function () {});
    }, 350);
  }

  function loadProject(projectId) {
    if (!projectId) {
      applyProject(null);
      render();
      return Promise.resolve();
    }
    state.loading = true;
    setStatus('Loading project…');
    return codeApi('/api/code-studio/projects/' + encodeURIComponent(projectId))
      .then(function (data) {
        applyProject(data.project);
        setStatus('Project loaded.');
        render();
        return hydrateRuntimeForProject();
      })
      .catch(function (error) {
        setStatus(error.message);
        render();
      })
      .finally(function () {
        state.loading = false;
      });
  }

  function loadProjects(force) {
    if (state.loading && !force) return Promise.resolve();
    state.loading = true;
    render();
    return codeApi('/api/code-studio/projects?limit=100')
      .then(function (data) {
        state.projects = Array.isArray(data.projects) ? data.projects : [];
        var preferred =
          state.project && state.projects.some(function (item) { return item.id === state.project.id; })
            ? state.project.id
            : (state.projects[0] && state.projects[0].id);
        if (preferred) return loadProject(preferred);
        applyProject(null);
        setStatus('Create your first Code Project.');
        render();
      })
      .catch(function (error) {
        setStatus(error.message);
        render();
      })
      .finally(function () {
        state.loading = false;
      });
  }

  function createProject() {
    var name = window.prompt ? window.prompt('Project name', 'New Code Project') : 'New Code Project';
    if (!name || !String(name).trim()) return;
    setStatus('Creating project…');
    codeApi('/api/code-studio/projects', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        project: {
          name: String(name).trim(),
          entryFile: 'index.js',
          files: [{
            path: 'index.js',
            language: 'javascript',
            content: '// ' + String(name).trim() + '\n'
          }]
        }
      })
    }).then(function (data) {
      applyProject(data.project);
      return codeApi('/api/code-studio/projects?limit=100');
    }).then(function (data) {
      state.projects = Array.isArray(data.projects) ? data.projects : [];
      setStatus('Project created.');
      render();
      return hydrateRuntimeForProject();
    }).catch(function (error) {
      setStatus(error.message);
    });
  }

  function saveProject() {
    if (!state.project || !state.dirty) {
      saveEditorStateSoon();
      setStatus('Project is already saved.');
      return Promise.resolve(state.project);
    }
    setStatus('Saving version…');
    return codeApi(
      '/api/code-studio/projects/' + encodeURIComponent(state.project.id),
      {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          project: projectPayload(),
          expectedRevision: state.project.revision,
          branchName: state.project.currentBranch,
          reason: 'manual_save'
        })
      }
    ).then(function (data) {
      applyProject(data.project);
      setStatus('Saved as a new immutable version.');
      render();
      saveEditorStateSoon();
      schedulePostSaveValidation();
      return state.project;
    }).catch(function (error) {
      setStatus(error.code === 'pack075_revision_conflict'
        ? 'Project changed elsewhere. Reload before saving.'
        : error.message);
      throw error;
    });
  }

  function addFile() {
    if (!state.project) return;
    var path = window.prompt ? window.prompt('New file path', 'src/new-file.js') : '';
    path = String(path || '').trim().replace(/\\/g, '/');
    if (!path) return;
    if (state.project.files.some(function (file) { return file.path.toLowerCase() === path.toLowerCase(); })) {
      setStatus('A file with that path already exists.');
      return;
    }
    state.project.files.push({path:path,content:'',language:null,sha256:''});
    ensureOpenFile(path);
    state.dirty = true;
    setStatus('New file added locally. Save to create a version.');
    render();
    saveEditorStateSoon();
  }

  function renameFile() {
    var file = currentFile();
    if (!file) return;
    var next = window.prompt ? window.prompt('Rename file', file.path) : file.path;
    next = String(next || '').trim().replace(/\\/g, '/');
    if (!next || next === file.path) return;
    if (state.project.files.some(function (item) {
      return item !== file && item.path.toLowerCase() === next.toLowerCase();
    })) {
      setStatus('A file with that path already exists.');
      return;
    }
    var old = file.path;
    file.path = next;
    if (state.project.entryFile === old) state.project.entryFile = next;
    state.openFiles = state.openFiles.map(function (value) { return value === old ? next : value; });
    state.activeFile = next;
    state.dirty = true;
    setStatus('File renamed locally. Save to create a version.');
    render();
    saveEditorStateSoon();
  }

  function deleteFile() {
    var file = currentFile();
    if (!file || !state.project) return;
    if (state.project.files.length <= 1) {
      setStatus('A project must keep at least one file.');
      return;
    }
    if (window.confirm && !window.confirm('Delete ' + file.path + '?')) return;
    state.project.files = state.project.files.filter(function (item) { return item.path !== file.path; });
    state.openFiles = state.openFiles.filter(function (path) { return path !== file.path; });
    if (state.project.entryFile === file.path) {
      state.project.entryFile = state.project.files[0].path;
    }
    state.activeFile = state.openFiles[state.openFiles.length - 1] || state.project.entryFile || state.project.files[0].path;
    ensureOpenFile(state.activeFile);
    state.dirty = true;
    setStatus('File deleted locally. Save to create a version.');
    render();
    saveEditorStateSoon();
  }

  function createBranch() {
    if (!state.project) return;
    var name = window.prompt ? window.prompt('New branch name', 'feature') : '';
    name = String(name || '').trim();
    if (!name) return;
    setStatus('Creating branch…');
    codeApi('/api/code-studio/projects/' + encodeURIComponent(state.project.id) + '/branches', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({name:name})
    }).then(function (data) {
      applyProject(data.project);
      setStatus('Branch created at the current version.');
      render();
    }).catch(function (error) {
      setStatus(error.message);
    });
  }

  function switchBranch(name) {
    if (!state.project || !name || name === state.project.currentBranch) return;
    if (state.dirty) {
      setStatus('Save or discard local edits before switching branch.');
      render();
      return;
    }
    setStatus('Switching branch…');
    codeApi(
      '/api/code-studio/projects/' + encodeURIComponent(state.project.id) +
      '/branches/' + encodeURIComponent(name) + '/switch',
      {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({expectedRevision:state.project.revision})
      }
    ).then(function (data) {
      applyProject(data.project);
      setStatus('Switched to ' + name + '.');
      render();
      saveEditorStateSoon();
      return hydrateRuntimeForProject();
    }).catch(function (error) {
      setStatus(error.message);
    });
  }

  function applyAiEdit() {
    var root = shell();
    var field = root && root.querySelector('[data-zs-code-ai-instruction]');
    var instruction = String(field && field.value || '').trim();
    var file = currentFile();
    if (!state.project || !file || !instruction) {
      setStatus('Describe the edit first.');
      return;
    }

    var run = state.dirty ? saveProject() : Promise.resolve(state.project);
    run.then(function () {
      setStatus('AI edit is running through the ZUVYR Router…');
      var requestId =
        window.crypto && typeof window.crypto.randomUUID === 'function'
          ? window.crypto.randomUUID()
          : 'code-edit-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      return codeApi(
        '/api/code-studio/projects/' + encodeURIComponent(state.project.id) + '/ai-edit',
        {
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            'Idempotency-Key':requestId
          },
          body:JSON.stringify({
            instruction:instruction,
            targetPaths:[state.activeFile],
            expectedRevision:state.project.revision
          })
        }
      );
    }).then(function (data) {
      if (data.project) applyProject(data.project);
      return data.project ? Promise.resolve() : loadProject(state.project.id);
    }).then(function () {
      if (field) field.value = '';
      setStatus('AI edit applied, metered and saved as a version.');
      render();
    }).catch(function (error) {
      setStatus(error.message);
    });
  }

  function bindShell(root) {
    if (!root || root.dataset.bound === 'true') return;
    root.dataset.bound = 'true';

    root.addEventListener('click', function (event) {
      var close = event.target.closest('[data-zs-code-close-tab]');
      if (close) {
        event.preventDefault();
        event.stopPropagation();
        var path = close.getAttribute('data-zs-code-close-tab');
        state.openFiles = state.openFiles.filter(function (value) { return value !== path; });
        if (state.activeFile === path) {
          state.activeFile = state.openFiles[state.openFiles.length - 1] || null;
        }
        if (!state.activeFile && state.project && state.project.files.length) {
          ensureOpenFile(state.project.entryFile || state.project.files[0].path);
        }
        render();
        saveEditorStateSoon();
        return;
      }

      var open = event.target.closest('[data-zs-code-open-file]');
      if (open) {
        ensureOpenFile(open.getAttribute('data-zs-code-open-file'));
        render();
        saveEditorStateSoon();
        return;
      }

      var pane = event.target.closest('[data-zs-code-mobile-pane]');
      if (pane) {
        state.mobilePane = pane.getAttribute('data-zs-code-mobile-pane') === 'preview' ? 'preview' : 'code';
        render();
        saveEditorStateSoon();
        return;
      }

      if (event.target.closest('[data-zs-code-new-project]')) return createProject();
      if (event.target.closest('[data-zs-code-save]')) return void saveProject();
      if (event.target.closest('[data-zs-code-add-file]')) return addFile();
      if (event.target.closest('[data-zs-code-rename-file]')) return renameFile();
      if (event.target.closest('[data-zs-code-delete-file]')) return deleteFile();
      if (event.target.closest('[data-zs-code-new-branch]')) return createBranch();
      if (event.target.closest('[data-zs-code-ai-apply]')) return applyAiEdit();

      var runtimeButton = event.target.closest('[data-zs-code-runtime]');
      if (runtimeButton) {
        return runRuntimeOperation(
          runtimeButton.getAttribute('data-zs-code-runtime')
        );
      }

      if (event.target.closest('[data-zs-code-repair]')) {
        return startRepair();
      }

      if (event.target.closest('[data-zs-code-preview-refresh]')) {
        return refreshPreviewFrame();
      }

      if (event.target.closest('[data-zs-code-preview-open]')) {
        return openPreview();
      }

      if (event.target.closest('[data-zs-code-preview-fullscreen]')) {
        return fullscreenPreview();
      }

      var viewportButton = event.target.closest('[data-zs-code-viewport]');
      if (viewportButton) {
        state.previewViewport =
          viewportButton.getAttribute('data-zs-code-viewport') || 'fit';
        render();
        return;
      }

      if (event.target.closest('[data-zs-code-toggle-preview]')) {
        state.previewVisible = !state.previewVisible;
        render();
        saveEditorStateSoon();
        return;
      }

      if (event.target.closest('[data-zs-code-expand]')) {
        state.expanded = !state.expanded;
        render();
        return;
      }

      if (event.target.closest('[data-zs-code-toggle-logs]')) {
        state.logsVisible = !state.logsVisible;
        render();
        saveEditorStateSoon();
      }
    });

    root.addEventListener('change', function (event) {
      if (event.target.matches('[data-zs-code-project-select]')) {
        if (state.dirty) {
          setStatus('Save local edits before opening another project.');
          render();
          return;
        }
        clearRuntimeTimers();
        loadProject(event.target.value);
      }
      if (event.target.matches('[data-zs-code-branch-select]')) {
        switchBranch(event.target.value);
      }
    });

    root.addEventListener('input', function (event) {
      if (!event.target.matches('[data-zs-code-editor]')) return;
      var file = currentFile();
      if (!file) return;
      file.content = event.target.value;
      state.dirty = true;
      var button = root.querySelector('[data-zs-code-save]');
      if (button) button.textContent = 'Save changes *';
      setStatus('Unsaved local edits.');
    });

    root.addEventListener('pointerdown', function (event) {
      var divider = event.target.closest('[data-zs-code-divider]');
      if (!divider || window.matchMedia('(max-width: 820px)').matches) return;
      event.preventDefault();
      var split = divider.closest('.zs-code-split');
      if (!split) return;

      function move(moveEvent) {
        var rect = split.getBoundingClientRect();
        if (!rect.width) return;
        var ratio = (moveEvent.clientX - rect.left) / rect.width;
        state.dividerBasisPoints = Math.round(Math.max(0.25, Math.min(0.80, ratio)) * 10000);
        split.style.setProperty('--zs-code-editor-width', (state.dividerBasisPoints / 100).toFixed(2) + '%');
      }

      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        saveEditorStateSoon();
      }

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  function ensureCodeStudio() {
    var screen = codeScreen();
    if (!screen) return;

    var root = screen.querySelector('[data-zuvyr-code-studio-pack075]');
    if (!root) {
      root = document.createElement('section');
      root.setAttribute('data-zuvyr-code-studio-pack075', 'true');
      root.className = 'zs-code-pack075';
      var messages = screen.querySelector('#msgs-code');
      if (messages) {
        messages.parentNode.insertBefore(root, messages);
        messages.classList.add('zs-code-assistant-history');
      } else {
        screen.appendChild(root);
      }
      bindShell(root);
      render();
    }

    if (screen.classList.contains('active') && !root.dataset.loaded) {
      root.dataset.loaded = 'true';
      loadCapabilities()
        .catch(function () { return null; })
        .finally(function () {
          loadProjects(false);
        });
    }
  }

  function boot() {
    ensureCodeStudio();
    var screen = codeScreen();
    if (screen) {
      new MutationObserver(ensureCodeStudio).observe(screen, {
        attributes:true,
        attributeFilter:['class'],
        childList:true,
        subtree:false
      });
    }
    new MutationObserver(ensureCodeStudio).observe(document.documentElement, {
      childList:true,
      subtree:true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();
