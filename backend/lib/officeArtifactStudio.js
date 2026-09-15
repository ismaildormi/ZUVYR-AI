'use strict';

const crypto = require('node:crypto');
const JSZip = require('jszip');

const MIME = Object.freeze({
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
});
const EXT = Object.freeze({ xlsx: 'xlsx', csv: 'csv', pptx: 'pptx' });
const MAX_TITLE = 120;
const MAX_SHEETS = 20;
const MAX_COLUMNS = 100;
const MAX_ROWS_PER_SHEET = 5000;
const MAX_TOTAL_CELLS = 100000;
const MAX_CELL_CHARS = 10000;
const MAX_SLIDES = 60;
const MAX_SLIDE_LINES = 24;
const MAX_SLIDE_LINE_CHARS = 1200;
const MAX_SOURCE_RECORDS = 30;
const FORMULA_PREFIX = /^[=+\-@]/;

function artifactError(code, status = 400, details = null) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function text(value, code, max = MAX_TITLE, optional = false) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw artifactError(code);
  }
  const normalized = String(value).trim();
  if (!normalized || normalized.length > max) throw artifactError(code);
  return normalized;
}

function uuid(value, code, optional = false) {
  if ((value === undefined || value === null || value === '') && optional) return null;
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw artifactError(code);
  }
  return normalized;
}

function normalizeSourceRecordIds(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_SOURCE_RECORDS) throw artifactError('invalid_office_source_records');
  const out = [];
  for (const item of value) {
    const id = uuid(item, 'invalid_office_source_record_id');
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function safeScalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw artifactError('invalid_spreadsheet_value');
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') throw artifactError('invalid_spreadsheet_value');
  if (value.length > MAX_CELL_CHARS) throw artifactError('invalid_spreadsheet_value');
  if (FORMULA_PREFIX.test(value.trim())) throw artifactError('spreadsheet_formula_execution_disabled');
  return value;
}

function normalizeSheetName(value, index, used) {
  let name = String(value || `Sheet ${index + 1}`).trim();
  if (!name || name.length > 31 || /[\[\]:*?/\\]/.test(name)) throw artifactError('invalid_spreadsheet_sheet_name');
  const key = name.toLowerCase();
  if (used.has(key)) throw artifactError('duplicate_spreadsheet_sheet_name');
  used.add(key);
  return name;
}

function normalizeSpreadsheetRequest(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw artifactError('invalid_spreadsheet_request');
  const title = text(input.title, 'invalid_spreadsheet_title');
  const rawSheets = Array.isArray(input.sheets) && input.sheets.length
    ? input.sheets
    : [{ name: input.sheetName || 'Sheet 1', columns: input.columns || [], rows: input.rows || [] }];
  if (!rawSheets.length || rawSheets.length > MAX_SHEETS) throw artifactError('invalid_spreadsheet_sheets');
  const used = new Set();
  let totalCells = 0;
  const sheets = rawSheets.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw artifactError('invalid_spreadsheet_sheet');
    const name = normalizeSheetName(raw.name, index, used);
    const columns = Array.isArray(raw.columns) ? raw.columns.map((v) => { const column = text(v, 'invalid_spreadsheet_column', 200); if (FORMULA_PREFIX.test(column.trim())) throw artifactError('spreadsheet_formula_execution_disabled'); return column; }) : [];
    if (columns.length > MAX_COLUMNS) throw artifactError('invalid_spreadsheet_columns');
    const rows = Array.isArray(raw.rows) ? raw.rows : [];
    if (rows.length > MAX_ROWS_PER_SHEET) throw artifactError('invalid_spreadsheet_rows');
    const width = Math.max(columns.length, ...rows.map(row => Array.isArray(row) ? row.length : 0), 0);
    if (width > MAX_COLUMNS) throw artifactError('invalid_spreadsheet_columns');
    const normalizedRows = rows.map(row => {
      if (!Array.isArray(row)) throw artifactError('invalid_spreadsheet_row');
      if (row.length > MAX_COLUMNS) throw artifactError('invalid_spreadsheet_columns');
      return row.map(safeScalar);
    });
    totalCells += (columns.length ? columns.length : width) + normalizedRows.reduce((n, row) => n + row.length, 0);
    if (totalCells > MAX_TOTAL_CELLS) throw artifactError('spreadsheet_cell_limit_exceeded');
    return Object.freeze({ name, columns, rows: normalizedRows });
  });
  let formats = input.formats == null ? ['xlsx', 'csv'] : (Array.isArray(input.formats) ? input.formats : [input.formats]);
  formats = [...new Set(formats.map(v => String(v || '').trim().toLowerCase()))];
  if (!formats.length || formats.some(format => !['xlsx', 'csv'].includes(format))) throw artifactError('invalid_spreadsheet_formats');
  if (formats.includes('csv') && sheets.length !== 1) throw artifactError('csv_requires_single_sheet');
  if (input.spreadsheetId != null && input.spreadsheetId !== '') throw artifactError('spreadsheet_custom_id_not_supported');
  if (totalCells === 0) throw artifactError('invalid_spreadsheet_content');
  return Object.freeze({
    title,
    sheets,
    formats,
    projectId: uuid(input.projectId, 'invalid_spreadsheet_project_id', true),
    sourceRecordIds: normalizeSourceRecordIds(input.sourceRecordIds)
  });
}

function normalizePresentationRequest(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw artifactError('invalid_presentation_request');
  const title = text(input.title, 'invalid_presentation_title');
  if (!Array.isArray(input.slides) || !input.slides.length || input.slides.length > MAX_SLIDES) throw artifactError('invalid_presentation_slides');
  let totalChars = 0;
  const slides = input.slides.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw artifactError('invalid_presentation_slide');
    const slideTitle = text(raw.title || `Slide ${index + 1}`, 'invalid_presentation_slide_title', 240);
    const lines = Array.isArray(raw.lines)
      ? raw.lines
      : Array.isArray(raw.bullets)
        ? raw.bullets
        : String(raw.body || '').split(/\r?\n/).filter(Boolean);
    if (lines.length > MAX_SLIDE_LINES) throw artifactError('invalid_presentation_slide_lines');
    const normalizedLines = lines.map(line => {
      const value = String(line == null ? '' : line).trim();
      if (value.length > MAX_SLIDE_LINE_CHARS) throw artifactError('invalid_presentation_slide_line');
      totalChars += value.length;
      return value;
    });
    totalChars += slideTitle.length;
    if (totalChars > 100000) throw artifactError('presentation_content_limit_exceeded');
    return Object.freeze({ title: slideTitle, lines: normalizedLines });
  });
  if (input.presentationId != null && input.presentationId !== '') throw artifactError('presentation_custom_id_not_supported');
  return Object.freeze({
    title,
    slides,
    projectId: uuid(input.projectId, 'invalid_presentation_project_id', true),
    sourceRecordIds: normalizeSourceRecordIds(input.sourceRecordIds)
  });
}

function cleanXml(value) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}
function xml(value) {
  return cleanXml(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function csvCell(value) {
  if (value == null) return '';
  let string = String(value);
  if (FORMULA_PREFIX.test(string.trim())) string = `'${string}`;
  return /[",\r\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}
function columnName(index) {
  let value = index + 1;
  let out = '';
  while (value > 0) {
    value -= 1;
    out = String.fromCharCode(65 + (value % 26)) + out;
    value = Math.floor(value / 26);
  }
  return out;
}
function xlsxCell(value, address, style = 0) {
  if (value == null) return `<c r="${address}" s="${style}"/>`;
  if (typeof value === 'number') return `<c r="${address}" s="${style}"><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${address}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
function sheetXml(sheet) {
  const rows = [];
  let rowNo = 1;
  if (sheet.columns.length) {
    rows.push(`<row r="${rowNo}">${sheet.columns.map((value, i) => xlsxCell(value, `${columnName(i)}${rowNo}`, 1)).join('')}</row>`);
    rowNo += 1;
  }
  for (const row of sheet.rows) {
    rows.push(`<row r="${rowNo}">${row.map((value, i) => xlsxCell(value, `${columnName(i)}${rowNo}`)).join('')}</row>`);
    rowNo += 1;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`;
}

function sourceRows(sources) {
  return sources.map((source, index) => [source.citation_key || `S${index + 1}`, source.title || 'Source', source.url || '', source.snippet || '']);
}

async function renderXlsx(request, sources = []) {
  const zip = new JSZip();
  const sheets = [...request.sheets];
  if (sources.length) {
    const names = new Set(sheets.map(sheet => String(sheet.name).toLowerCase()));
    let sourceName = 'Sources';
    if (names.has(sourceName.toLowerCase())) sourceName = 'ZUVYR Sources';
    if (names.has(sourceName.toLowerCase())) sourceName = '_Sources';
    sheets.push({ name: sourceName, columns: ['Citation', 'Title', 'URL', 'Snippet'], rows: sourceRows(sources) });
  }
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(request.title)}</dc:title><dc:creator>ZUVYR</dc:creator></cp:coreProperties>`);
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>ZUVYR</Application></Properties>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, i) => `<sheet name="${xml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`);
  sheets.forEach((sheet, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet)));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function renderCsv(request, sources = []) {
  const sheet = request.sheets[0];
  const lines = [];
  if (sheet.columns.length) lines.push(sheet.columns.map(csvCell).join(','));
  for (const row of sheet.rows) lines.push(row.map(csvCell).join(','));
  if (sources.length) {
    lines.push('', 'Sources');
    lines.push(['Citation', 'Title', 'URL', 'Snippet'].map(csvCell).join(','));
    for (const row of sourceRows(sources)) lines.push(row.map(csvCell).join(','));
  }
  return Buffer.from('\ufeff' + lines.join('\r\n') + '\r\n', 'utf8');
}

function themeXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="ZUVYR"><a:themeElements><a:clrScheme name="ZUVYR"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:lt2><a:srgbClr val="F3F3F3"/></a:lt2><a:accent1><a:srgbClr val="5B5BD6"/></a:accent1><a:accent2><a:srgbClr val="3A7AFE"/></a:accent2><a:accent3><a:srgbClr val="00A67E"/></a:accent3><a:accent4><a:srgbClr val="C06CDE"/></a:accent4><a:accent5><a:srgbClr val="F59E0B"/></a:accent5><a:accent6><a:srgbClr val="EF4444"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="ZUVYR"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="ZUVYR"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>`;
}

function textShape(id, name, x, y, cx, cy, value, size, bold = false) {
  const paragraphs = String(value || '').split(/\r?\n/).map(line => `<a:p><a:r><a:rPr lang="en-US" sz="${size}"${bold ? ' b="1"' : ''}/><a:t>${xml(line)}</a:t></a:r><a:endParaRPr lang="en-US" sz="${size}"/></a:p>`).join('');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

function slideXml(slide) {
  const title = textShape(2, 'Title', 609600, 457200, 10972800, 914400, slide.title, 2800, true);
  const bodyText = slide.lines.map(line => `• ${line}`).join('\n');
  const body = textShape(3, 'Body', 762000, 1524000, 10668000, 4267200, bodyText, 1800, false);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${title}${body}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

async function renderPptx(request, sources = []) {
  const zip = new JSZip();
  const slides = request.slides.map(slide => ({ ...slide }));
  if (sources.length) {
    slides.push({ title: 'Sources', lines: sources.slice(0, 20).map((source, i) => `[${source.citation_key || `S${i + 1}`}] ${source.title || source.url || 'Source'}${source.url ? ` — ${source.url}` : ''}`) });
  }
  const slideOverrides = slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideOverrides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(request.title)}</dc:title><dc:creator>ZUVYR</dc:creator></cp:coreProperties>`);
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>ZUVYR</Application><Slides>${slides.length}</Slides></Properties>`);
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`);
  zip.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="ZUVYR"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
  zip.file('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
  zip.file('ppt/theme/theme1.xml', themeXml());
  slides.forEach((slide, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(slide));
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
  });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function signature(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function safeFileBase(title, fallback = 'artifact') {
  const base = String(title || fallback).normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100);
  return base || fallback;
}

module.exports = {
  MIME,
  EXT,
  artifactError,
  normalizeSpreadsheetRequest,
  normalizePresentationRequest,
  renderXlsx,
  renderCsv,
  renderPptx,
  safeFileBase,
  signature
};
