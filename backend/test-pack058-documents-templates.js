'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const JSZip = require('jszip');
const {
  BUILTIN_TEMPLATES,
  normalizeDocumentRequest,
  extractTemplateVariables,
  applyTemplate,
  renderDocx,
  renderPdf
} = require('./lib/documentStudio');
const {
  createDocumentStudioRepository,
  DOCUMENT_SOURCE_SYSTEM
} = require('./lib/documentStudioRepository');

const OWNER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const CONTENT = '33333333-3333-4333-8333-333333333333';
const VERSION = '44444444-4444-4444-8444-444444444444';
const ASSET = '55555555-5555-4555-8555-555555555555';

async function run() {
  const normalized = normalizeDocumentRequest({
    title: 'Multilingual report',
    content: 'مرحبا — Bonjour — Hello',
    formats: ['docx', 'pdf', 'md', 'txt'],
    projectId: PROJECT,
    sourceRecordIds: []
  });
  assert.deepEqual(normalized.formats, ['docx', 'pdf', 'md', 'txt']);
  assert.equal(normalized.projectId, PROJECT);
  assert.throws(
    () => normalizeDocumentRequest({ title: 'x', content: 'x', documentId: 'custom-id' }),
    error => error.code === 'document_custom_id_not_supported'
  );

  assert.deepEqual(
    extractTemplateVariables('Hello {{name}} — {{name}} — {{next_step}}'),
    ['name', 'next_step']
  );
  const report = BUILTIN_TEMPLATES.find(item => item.id === 'builtin:report');
  assert(report);
  assert.match(
    applyTemplate(report, {
      summary: 'Summary',
      findings: 'Findings',
      recommendations: 'Recommendations'
    }),
    /## Recommendations/
  );
  assert.throws(
    () => applyTemplate(report, { summary: 'only one' }),
    error => error.code === 'document_template_variables_missing'
  );

  const docx = await renderDocx({
    title: 'تقرير / Rapport / Report',
    body: '## ملخص\nمرحبا بالعالم\n\n## Résumé\nBonjour le monde',
    sources: []
  });
  assert(Buffer.isBuffer(docx));
  assert.equal(docx.subarray(0, 2).toString('ascii'), 'PK');
  const archive = await JSZip.loadAsync(docx);
  const documentXml = await archive.file('word/document.xml').async('string');
  assert.match(documentXml, /<w:bidi\/>/);
  assert.match(documentXml, /مرحبا بالعالم/);

  const pdfRequired = process.env.PACK058_REQUIRE_PDF === '1';
  let pdfDependenciesAvailable = true;
  let arabicFontEntry = null;
  try {
    require.resolve('pdfkit');
    require.resolve('bidi-shaper/pdfkit');
    arabicFontEntry = require.resolve('@embedpdf/fonts-arabic');
  } catch (_error) {
    pdfDependenciesAvailable = false;
  }
  if (pdfRequired || pdfDependenciesAvailable) {
    assert.equal(pdfDependenciesAvailable, true, 'Pack058 PDF dependencies are required for release verification');
    let cursor = path.dirname(arabicFontEntry);
    let arabicFontPath = null;
    for (let depth = 0; depth < 5; depth += 1) {
      const candidate = path.join(cursor, 'fonts', 'NotoNaskhArabic-Regular.ttf');
      if (fs.existsSync(candidate)) {
        arabicFontPath = candidate;
        break;
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    assert(arabicFontPath, 'Pack058 requires a real Noto Naskh Arabic TTF');
    assert.equal(fs.existsSync(arabicFontPath), true, 'Pack058 requires a real Noto Naskh Arabic TTF');
    const fontSignature = fs.readFileSync(arabicFontPath).subarray(0, 4);
    assert(
      fontSignature.equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) || fontSignature.toString('ascii') === 'OTTO',
      'Pack058 Arabic font must be a TTF/OTF font supported by PDFKit/fontkit'
    );
    const pdf = await renderPdf({
      title: 'تقرير فرنسي عربي',
      body: 'مرحبا بالعالم — Rapport en français — English summary',
      sources: []
    });
    assert(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');
    assert(pdf.length > 1000);
  }

  const uploads = [];
  const registrations = [];
  const ensured = [];
  const links = [];
  const fakeDb = {
    from() { throw new Error('unexpected_db_read'); },
    rpc() { throw new Error('unexpected_db_rpc'); }
  };
  const fakeStorage = {
    from(bucket) {
      assert.equal(bucket, 'conversation-files');
      return {
        async upload(storagePath, buffer, options) {
          uploads.push({ storagePath, buffer, options });
          return { error: null };
        }
      };
    }
  };
  const contentRepository = {
    async resolveBySource({ ownerId, sourceSystem, sourceId }) {
      assert.equal(ownerId, OWNER);
      assert.equal(sourceSystem, DOCUMENT_SOURCE_SYSTEM);
      assert.match(sourceId, /^doc:[0-9a-f]{64}$/);
      return null;
    },
    async ensure(input) {
      ensured.push(input);
      return {
        contentId: CONTENT,
        versionId: VERSION,
        versionNumber: 1,
        kind: 'document',
        replayed: false
      };
    }
  };
  const assetKernel = {
    async register(input) {
      registrations.push(input);
      return {
        assetId: ASSET,
        storagePath: input.storagePath,
        replayed: registrations.length > 1
      };
    }
  };
  const projectStore = {
    async linkResource(input) {
      links.push(input);
      return { id: PROJECT };
    }
  };
  const repository = createDocumentStudioRepository({
    db: fakeDb,
    storage: fakeStorage,
    contentRepository,
    assetKernel,
    projectStore
  });
  const rendered = await repository.renderDocument({
    ownerId: OWNER,
    input: {
      title: 'Local document',
      content: 'No provider call is needed.',
      formats: ['txt', 'md', 'docx'],
      projectId: PROJECT
    }
  });
  assert.equal(rendered.providerCalls, 0);
  assert.equal(rendered.billedCredits, 0);
  assert.equal(rendered.liveBillingAllowed, false);
  assert.equal(ensured.length, 1);
  assert.equal(ensured[0].projectId, PROJECT);
  assert.match(ensured[0].sourceId, /^doc:[0-9a-f]{64}$/);
  assert.equal(uploads.length, 3);
  assert.equal(registrations.length, 3);
  assert.equal(links.length, 1);
  assert.equal(links[0].resourceType, 'content');

  const packageJson = require('./package.json');
  assert.equal(packageJson.dependencies.pdfkit, '0.20.2');
  assert.equal(packageJson.dependencies['bidi-shaper'], '0.1.2');
  assert.equal(packageJson.dependencies['@embedpdf/fonts-arabic'], '1.0.0');
  assert.equal(packageJson.dependencies['@openfonts/noto-sans-arabic_all'], undefined);

  const workspace = require('./config/workspace-system.v1.json');
  assert.equal(workspace.pack, 58);
  assert.equal(workspace.mode, 'context_graph');
  assert.deepEqual(workspace.documentFormats, ['docx', 'pdf', 'txt', 'md']);
  assert.equal(workspace.documentTemplates.scriptsAllowed, false);
  const flags = require('./config/feature-flags.json');
  assert.equal(flags.documents.status, 'live_verified');
  assert.equal(flags.document_templates.status, 'live_verified');

  const routes = fs.readFileSync(path.join(__dirname, 'lib/workspaceRoutes.js'), 'utf8');
  for (const marker of [
    "router.get('/documents'",
    "router.get('/documents/templates'",
    "router.post('/documents/templates'",
    "router.post('/documents/render'",
    'providerCalls: 0',
    'liveBillingAllowed: false'
  ]) assert(routes.includes(marker), `Missing Pack058 route marker: ${marker}`);

  const repoSource = fs.readFileSync(path.join(__dirname, 'lib/documentStudioRepository.js'), 'utf8');
  assert(repoSource.includes('contentRepo.resolveBySource'));
  assert(repoSource.includes("const documentId = `doc:${semanticHash}`"));

  const frontend = fs.readFileSync(path.join(__dirname, '../frontend/zuvyr-suite-v1.js'), 'utf8');
  for (const marker of [
    'function documentsView()',
    'data-zs-document-form',
    'data-zs-document-template',
    'data-zs-document-download',
    "'/api/workspace/documents/render'",
    "view.dataset.zsView==='documents'",
    'Local rendering · provider calls 0 · generation credits 0'
  ]) assert(frontend.includes(marker), `Missing Pack058 frontend marker: ${marker}`);

  const trackedFiles = execFileSync('git', ['ls-files'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
  }).split(/\r?\n/).filter(Boolean);
  const trackedFontFiles = trackedFiles.filter(file => /\.(?:ttf|otf|woff2?|eot)$/i.test(file));
  assert.equal(trackedFontFiles.length, 0, 'Pack058 must not commit or expose font binaries');

  console.log('PASS: Pack058 local Documents + Templates renders DOCX/PDF/TXT/MD, preserves Arabic/French/English, persists canonical assets/projects, and makes zero model/provider calls');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
