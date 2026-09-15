'use strict';
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeSpreadsheetRequest,
  normalizePresentationRequest,
  renderXlsx,
  renderCsv,
  renderPptx
} = require('./lib/officeArtifactStudio');

async function run() {
  const spreadsheet = normalizeSpreadsheetRequest({
    title: 'Budget متعدد اللغات',
    columns: ['Item', 'Quantity', 'Cost'],
    rows: [['Hébergement', 1, 20], ['تخزين', 2, 8]],
    formats: ['xlsx', 'csv']
  });
  assert.equal(spreadsheet.sheets.length, 1);
  assert.equal(spreadsheet.formats.join(','), 'xlsx,csv');
  assert.throws(() => normalizeSpreadsheetRequest({ title: 'unsafe', rows: [['=IMPORTXML("https://example.test")']] }), /spreadsheet_formula_execution_disabled/);
  assert.throws(() => normalizeSpreadsheetRequest({ title: 'empty', columns: [], rows: [] }), /invalid_spreadsheet_content/);
  assert.throws(() => normalizeSpreadsheetRequest({ title: 'bad csv', sheets: [{name:'A',columns:['x'],rows:[[1]]},{name:'B',columns:['x'],rows:[[2]]}], formats:['csv'] }), /csv_requires_single_sheet/);

  const sources = [{ citation_key: 'S1', title: 'Verified Source', url: 'https://example.test/source', snippet: 'Evidence' }];
  const xlsx = await renderXlsx(spreadsheet, sources);
  assert.ok(Buffer.isBuffer(xlsx) && xlsx.length > 1000);
  const workbook = await JSZip.loadAsync(xlsx);
  for (const entry of ['[Content_Types].xml','xl/workbook.xml','xl/styles.xml','xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml']) assert.ok(workbook.file(entry), `missing ${entry}`);
  const workbookXml = await workbook.file('xl/workbook.xml').async('string');
  assert.match(workbookXml, /Sheet 1/);
  assert.match(workbookXml, /Sources/);
  const sheetXml = await workbook.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(sheetXml, /Hébergement/);
  assert.match(sheetXml, /تخزين/);
  assert.doesNotMatch(sheetXml, /<f>/);

  const csv = renderCsv(spreadsheet, sources);
  const csvText = csv.toString('utf8');
  assert.ok(csvText.startsWith('\ufeff'));
  assert.match(csvText, /Hébergement/);
  assert.match(csvText, /تخزين/);
  assert.match(csvText, /Verified Source/);

  const presentation = normalizePresentationRequest({
    title: 'Launch Présentation',
    slides: [
      { title: 'Résumé', lines: ['Connected research', 'مخرجات موثقة'] },
      { title: 'Next steps', bullets: ['Ship safely', 'Verify production'] }
    ]
  });
  assert.equal(presentation.slides.length, 2);
  const pptx = await renderPptx(presentation, sources);
  assert.ok(Buffer.isBuffer(pptx) && pptx.length > 1500);
  const deck = await JSZip.loadAsync(pptx);
  for (const entry of ['[Content_Types].xml','ppt/presentation.xml','ppt/slideMasters/slideMaster1.xml','ppt/slideLayouts/slideLayout1.xml','ppt/theme/theme1.xml','ppt/slides/slide1.xml','ppt/slides/slide2.xml','ppt/slides/slide3.xml']) assert.ok(deck.file(entry), `missing ${entry}`);
  const slide1 = await deck.file('ppt/slides/slide1.xml').async('string');
  assert.match(slide1, /Résumé/);
  assert.match(slide1, /مخرجات موثقة/);
  const slide3 = await deck.file('ppt/slides/slide3.xml').async('string');
  assert.match(slide3, /Sources/);
  assert.match(slide3, /Verified Source/);

  const repositorySource = fs.readFileSync(path.join(__dirname, 'lib/officeArtifactRepository.js'), 'utf8');
  assert.match(repositorySource, /kind: 'document'/);
  assert.match(repositorySource, /officeArtifactKind: artifactKind/);
  assert.match(repositorySource, /providerCalls: 0/);
  assert.match(repositorySource, /billedCredits: 0/);
  assert.doesNotMatch(repositorySource, /openrouter|anthropic|groq|stripe/i);

  const config = require('./config/workspace-system.v1.json');
  assert.equal(config.pack, 59);
  assert.deepEqual(config.spreadsheetFormats, ['xlsx','csv']);
  assert.deepEqual(config.presentationFormats, ['pptx']);
  assert.equal(config.security.spreadsheetFormulaExecutionAllowed, false);
  const flags = require('./config/feature-flags.json');
  assert.equal(flags.spreadsheets.status, 'implemented_pending_visual_e2e');
  assert.equal(flags.presentations.status, 'implemented_pending_visual_e2e');

  const ui = fs.readFileSync(path.join(__dirname, '../frontend/zuvyr-suite-v1.js'), 'utf8');
  for (const needle of ['/api/workspace/spreadsheets/render','/api/workspace/presentations/render','data-zs-spreadsheet-form','data-zs-presentation-form']) assert.ok(ui.includes(needle), needle);

  console.log('PASS: Pack059 local Spreadsheet/Presentation Studio renders XLSX/CSV/PPTX, blocks formulas, appends verified sources, persists canonical office artifacts and makes zero provider/model calls');
}
run().catch(error => { console.error(error); process.exit(1); });
