'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FORMAT_MIME = Object.freeze({
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  txt: 'text/plain;charset=utf-8',
  md: 'text/markdown;charset=utf-8'
});
const FORMAT_EXT = Object.freeze({ docx: 'docx', pdf: 'pdf', txt: 'txt', md: 'md' });
const FORMAT_SET = new Set(Object.keys(FORMAT_MIME));
const MAX_CONTENT_CHARS = 200000;
const MAX_TITLE_CHARS = 120;
const MAX_FORMATS = 4;
const MAX_SOURCE_RECORDS = 30;
const VARIABLE_PATTERN = /{{\s*([a-z][a-z0-9_]{0,63})\s*}}/gi;
const ARABIC_PATTERN = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/;

const BUILTIN_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'builtin:blank',
    name: 'Blank document',
    category: 'general',
    body: '{{body}}',
    variables: ['body'],
    builtin: true
  }),
  Object.freeze({
    id: 'builtin:report',
    name: 'Structured report',
    category: 'report',
    body: '## Executive summary\n{{summary}}\n\n## Findings\n{{findings}}\n\n## Recommendations\n{{recommendations}}',
    variables: ['summary', 'findings', 'recommendations'],
    builtin: true
  }),
  Object.freeze({
    id: 'builtin:research-report',
    name: 'Research report',
    category: 'research',
    body: '## Question\n{{question}}\n\n## Evidence\n{{evidence}}\n\n## Analysis\n{{analysis}}\n\n## Conclusion\n{{conclusion}}',
    variables: ['question', 'evidence', 'analysis', 'conclusion'],
    builtin: true
  }),
  Object.freeze({
    id: 'builtin:brief',
    name: 'Project brief',
    category: 'brief',
    body: '## Objective\n{{objective}}\n\n## Context\n{{context}}\n\n## Deliverables\n{{deliverables}}\n\n## Next steps\n{{next_steps}}',
    variables: ['objective', 'context', 'deliverables', 'next_steps'],
    builtin: true
  }),
  Object.freeze({
    id: 'builtin:letter',
    name: 'Letter',
    category: 'letter',
    body: '{{recipient}}\n\n{{body}}\n\n{{sender}}',
    variables: ['recipient', 'body', 'sender'],
    builtin: true
  })
]);

function documentError(code, status = 400, details = null) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function text(value, code, max, optional = false) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw documentError(code);
  }
  const normalized = String(value).trim();
  if (!normalized || normalized.length > max) throw documentError(code);
  return normalized;
}

function uuid(value, code, optional = false) {
  if ((value === undefined || value === null || value === '') && optional) return null;
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw documentError(code);
  }
  return normalized;
}

function normalizeFormats(value) {
  const raw = value === undefined ? ['docx', 'pdf'] : (Array.isArray(value) ? value : [value]);
  if (!raw.length || raw.length > MAX_FORMATS) throw documentError('invalid_document_formats');
  const out = [];
  for (const item of raw) {
    const format = String(item || '').trim().toLowerCase();
    if (!FORMAT_SET.has(format)) throw documentError('invalid_document_format');
    if (!out.includes(format)) out.push(format);
  }
  return out;
}

function normalizeSourceRecordIds(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_SOURCE_RECORDS) {
    throw documentError('invalid_document_source_records');
  }
  const out = [];
  for (const item of value) {
    const id = uuid(item, 'invalid_document_source_record_id');
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function normalizeVariables(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw documentError('invalid_document_template_variables');
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/i.test(key)) throw documentError('invalid_document_template_variable');
    const next = raw === undefined || raw === null ? '' : String(raw);
    if (next.length > MAX_CONTENT_CHARS) throw documentError('invalid_document_template_variable_value');
    out[key] = next;
  }
  return out;
}

function normalizeDocumentRequest(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw documentError('invalid_document_request');
  const title = text(input.title, 'invalid_document_title', MAX_TITLE_CHARS);
  const content = input.content === undefined || input.content === null ? '' : String(input.content);
  if (content.length > MAX_CONTENT_CHARS) throw documentError('invalid_document_content');
  const templateId = input.templateId == null || input.templateId === ''
    ? null
    : text(input.templateId, 'invalid_document_template_id', 120);
  if (input.documentId !== undefined && input.documentId !== null && input.documentId !== '') {
    throw documentError('document_custom_id_not_supported');
  }
  return Object.freeze({
    title,
    content,
    formats: normalizeFormats(input.formats),
    templateId,
    variables: normalizeVariables(input.variables),
    projectId: uuid(input.projectId, 'invalid_document_project_id', true),
    sourceRecordIds: normalizeSourceRecordIds(input.sourceRecordIds)
  });
}

function extractTemplateVariables(body) {
  const found = [];
  String(body || '').replace(VARIABLE_PATTERN, (_match, variable) => {
    if (!found.includes(variable)) found.push(variable);
    return _match;
  });
  return found;
}

function applyTemplate(template, variables = {}, fallbackBody = '') {
  if (!template || typeof template !== 'object') throw documentError('document_template_not_found', 404);
  const required = Array.isArray(template.variables) ? template.variables : extractTemplateVariables(template.body);
  const values = { ...variables };
  if (fallbackBody && values.body === undefined) values.body = fallbackBody;
  const missing = required.filter(name => values[name] === undefined || values[name] === null);
  if (missing.length) throw documentError('document_template_variables_missing', 400, { missing });
  return String(template.body || '').replace(VARIABLE_PATTERN, (_match, variable) => String(values[variable] ?? ''));
}

function sourceLines(sources = []) {
  if (!sources.length) return [];
  return sources.map((source, index) => {
    const key = source.citation_key || source.citationId || `S${index + 1}`;
    const title = source.title || source.url || source.source_type || 'Source';
    const url = source.url ? ` — ${source.url}` : '';
    return `[${key}] ${title}${url}`;
  });
}

function composeMarkdown({ title, body, sources = [] }) {
  const parts = [`# ${title}`, '', String(body || '').trim()];
  const refs = sourceLines(sources);
  if (refs.length) parts.push('', '## Sources', '', ...refs.map(line => `- ${line}`));
  return parts.join('\n').trim() + '\n';
}

function stripMarkdown(value) {
  return String(value || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
}

function composeText({ title, body, sources = [] }) {
  const lines = [title, '='.repeat(Math.min(72, Math.max(3, title.length))), '', stripMarkdown(body).trim()];
  const refs = sourceLines(sources);
  if (refs.length) lines.push('', 'Sources', '-------', ...refs.map(line => `• ${line}`));
  return lines.join('\n').trim() + '\n';
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function markdownBlocks(body) {
  return String(body || '').split(/\r?\n/).map(line => {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) return { type: 'heading', level: heading[1].length, text: heading[2] };
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) return { type: 'bullet', text: bullet[1] };
    return { type: 'paragraph', text: line };
  });
}

function docxParagraph(block) {
  const isRtl = ARABIC_PATTERN.test(block.text || '');
  const style = block.type === 'heading' ? `Heading${Math.min(3, block.level || 1)}` : null;
  const pPr = [
    style ? `<w:pStyle w:val="${style}"/>` : '',
    block.type === 'bullet' ? '<w:ind w:left="360" w:hanging="180"/>' : '',
    isRtl ? '<w:bidi/>' : ''
  ].join('');
  const prefix = block.type === 'bullet' ? '• ' : '';
  const preserve = /^\s|\s$/.test(prefix + (block.text || '')) ? ' xml:space="preserve"' : '';
  return `<w:p><w:pPr>${pPr}</w:pPr><w:r><w:rPr>${isRtl ? '<w:rtl/>' : ''}</w:rPr><w:t${preserve}>${xmlEscape(prefix + (block.text || ''))}</w:t></w:r></w:p>`;
}

async function renderDocx({ title, body, sources = [], documentId = null }) {
  const JSZip = require('jszip');
  const zip = new JSZip();
  const allBody = composeMarkdown({ title, body, sources });
  const blocks = markdownBlocks(allBody);
  const now = new Date().toISOString();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${blocks.map(docxParagraph).join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  zip.folder('word').file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/><w:lang w:val="en-US" w:bidi="ar-SA"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
</w:styles>`);
  zip.folder('docProps').file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(title)}</dc:title><dc:creator>ZUVYR</dc:creator><cp:keywords>${xmlEscape(documentId || '')}</cp:keywords><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  zip.folder('docProps').file('app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>ZUVYR</Application></Properties>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

function resolvePdfFontPath() {
  let packageEntry;
  try {
    packageEntry = require.resolve('@embedpdf/fonts-arabic');
  } catch (error) {
    throw documentError('document_pdf_font_dependency_unavailable', 503);
  }

  let cursor = path.dirname(packageEntry);
  let fontPath = null;
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = path.join(cursor, 'fonts', 'NotoNaskhArabic-Regular.ttf');
    if (fs.existsSync(candidate)) {
      fontPath = candidate;
      break;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  if (!fontPath) {
    throw documentError('document_pdf_font_dependency_unavailable', 503);
  }
  const signature = fs.readFileSync(fontPath).subarray(0, 4);
  const isTrueType = signature.equals(Buffer.from([0x00, 0x01, 0x00, 0x00]));
  const isOpenType = signature.toString('ascii') === 'OTTO';
  if (!isTrueType && !isOpenType) {
    throw documentError('document_pdf_font_dependency_invalid', 503);
  }
  return fontPath;
}

async function renderPdf({ title, body, sources = [], documentId = null }) {
  let PDFDocument;
  let textBidi;
  try {
    PDFDocument = require('pdfkit');
    ({ textBidi } = await import('bidi-shaper/pdfkit'));
  } catch (error) {
    throw documentError('document_pdf_dependency_unavailable', 503);
  }
  const fontPath = resolvePdfFontPath();
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 54, right: 54, bottom: 54, left: 54 },
    info: { Title: title, Author: 'ZUVYR', Subject: documentId || 'ZUVYR document' },
    tagged: true,
    lang: ARABIC_PATTERN.test(`${title}\n${body}`) ? 'ar' : 'en'
  });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  function drawLine(textValue, options = {}) {
    const value = String(textValue || '');
    const rtl = ARABIC_PATTERN.test(value);
    const fontSize = options.fontSize || 11;
    doc.font(rtl ? fontPath : 'Helvetica');
    doc.fontSize(fontSize);
    textBidi(doc, value || ' ', {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: rtl ? 'right' : (options.align || 'left'),
      lineGap: options.lineGap ?? 3,
      paragraphGap: options.paragraphGap ?? 2,
      bidi: { direction: rtl ? 'rtl' : 'auto' }
    });
  }

  drawLine(title, { fontSize: 20, paragraphGap: 10 });
  for (const block of markdownBlocks(body)) {
    if (block.type === 'heading') drawLine(block.text, { fontSize: block.level === 1 ? 18 : block.level === 2 ? 15 : 13, paragraphGap: 6 });
    else if (block.type === 'bullet') drawLine(`• ${block.text}`, { fontSize: 11, paragraphGap: 2 });
    else drawLine(block.text || ' ', { fontSize: 11, paragraphGap: block.text ? 2 : 6 });
  }
  const refs = sourceLines(sources);
  if (refs.length) {
    doc.moveDown(0.8);
    drawLine(ARABIC_PATTERN.test(body) ? 'المصادر' : 'Sources', { fontSize: 14, paragraphGap: 5 });
    refs.forEach(line => drawLine(`• ${line}`, { fontSize: 9, paragraphGap: 2 }));
  }
  doc.end();
  return finished;
}

async function renderFormat(format, input) {
  if (format === 'md') return Buffer.from(composeMarkdown(input), 'utf8');
  if (format === 'txt') return Buffer.from(composeText(input), 'utf8');
  if (format === 'docx') return renderDocx(input);
  if (format === 'pdf') return renderPdf(input);
  throw documentError('invalid_document_format');
}

function safeFileBase(title) {
  const base = String(title || 'document')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return base || 'document';
}

function signature(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

module.exports = {
  FORMAT_MIME,
  FORMAT_EXT,
  BUILTIN_TEMPLATES,
  MAX_SOURCE_RECORDS,
  ARABIC_PATTERN,
  documentError,
  normalizeDocumentRequest,
  normalizeFormats,
  normalizeSourceRecordIds,
  normalizeVariables,
  extractTemplateVariables,
  applyTemplate,
  composeMarkdown,
  composeText,
  markdownBlocks,
  renderDocx,
  renderPdf,
  renderFormat,
  safeFileBase,
  signature
};
