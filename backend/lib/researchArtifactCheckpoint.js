'use strict';

const OUTPUT_KINDS = new Set(['document', 'spreadsheet', 'presentation']);
const RESEARCH_MODES = new Set([
  'web_search',
  'deep_research',
  'shopping',
  'local_research',
  'connected_research'
]);
const MAX_TITLE = 120;
const MAX_RESEARCH_TEXT = 120000;
const MAX_SOURCE_RECORDS = 30;
const MAX_REQUEST_ID = 200;

function checkpointError(code, status = 400, details = null) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function text(value, code, max, optional = false) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw checkpointError(code);
  }
  const normalized = String(value).trim();
  if (!normalized || normalized.length > max) throw checkpointError(code);
  return normalized;
}

function uuid(value, code, optional = false) {
  if ((value === undefined || value === null || value === '') && optional) return null;
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw checkpointError(code);
  }
  return normalized;
}

function normalizeSourceRecordIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SOURCE_RECORDS) {
    throw checkpointError('research_checkpoint_sources_required');
  }
  const output = [];
  for (const item of value) {
    const id = uuid(item, 'invalid_research_checkpoint_source_id');
    if (!output.includes(id)) output.push(id);
  }
  return output;
}

function normalizeCheckpointRequest(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw checkpointError('invalid_research_checkpoint_request');
  }
  const outputKind = String(input.outputKind || '').trim().toLowerCase();
  if (!OUTPUT_KINDS.has(outputKind)) throw checkpointError('invalid_research_checkpoint_output_kind');

  const researchMode = String(input.researchMode || 'deep_research').trim().toLowerCase();
  if (!RESEARCH_MODES.has(researchMode)) throw checkpointError('invalid_research_checkpoint_mode');

  return Object.freeze({
    title: text(input.title, 'invalid_research_checkpoint_title', MAX_TITLE),
    researchText: text(input.researchText, 'invalid_research_checkpoint_text', MAX_RESEARCH_TEXT),
    outputKind,
    researchMode,
    projectId: uuid(input.projectId, 'invalid_research_checkpoint_project_id', true),
    sourceRecordIds: normalizeSourceRecordIds(input.sourceRecordIds),
    requestId: text(input.requestId, 'invalid_research_checkpoint_request_id', MAX_REQUEST_ID, true)
  });
}

function chunks(value, maxChars = 760) {
  const raw = String(value || '').replace(/\r/g, '').split(/\n{2,}|\n/).map(v => v.trim()).filter(Boolean);
  const output = [];
  for (const paragraph of raw) {
    let remaining = paragraph;
    while (remaining.length > maxChars) {
      let cut = remaining.lastIndexOf(' ', maxChars);
      if (cut < Math.floor(maxChars * 0.6)) cut = maxChars;
      output.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) output.push(remaining);
  }
  return output;
}

function spreadsheetRows(request) {
  const parts = chunks(request.researchText, 7600);
  const rows = [
    ['Research mode', request.researchMode],
    ['Research result', parts[0] || request.researchText]
  ];
  for (let index = 1; index < parts.length; index += 1) {
    rows.push([`Research result ${index + 1}`, parts[index]]);
  }
  return rows;
}

function presentationSlides(request) {
  const parts = chunks(request.researchText, 760);
  const slides = [{
    title: request.title,
    lines: [`Research mode: ${request.researchMode}`, 'Verified citations are included in the Sources slide.']
  }];
  for (let index = 0; index < parts.length; index += 8) {
    slides.push({
      title: index === 0 ? 'Research result' : `Research result ${Math.floor(index / 8) + 1}`,
      lines: parts.slice(index, index + 8)
    });
  }
  if (slides.length > 59) throw checkpointError('research_checkpoint_presentation_too_large');
  return slides;
}

function buildArtifactInput(request) {
  if (!request || !OUTPUT_KINDS.has(request.outputKind)) {
    throw checkpointError('invalid_research_checkpoint_request');
  }
  if (request.outputKind === 'document') {
    return Object.freeze({
      title: request.title,
      content: request.researchText,
      formats: ['docx', 'pdf'],
      projectId: request.projectId,
      sourceRecordIds: request.sourceRecordIds
    });
  }
  if (request.outputKind === 'spreadsheet') {
    return Object.freeze({
      title: request.title,
      sheets: [{
        name: 'Research',
        columns: ['Field', 'Value'],
        rows: spreadsheetRows(request)
      }],
      formats: ['xlsx', 'csv'],
      projectId: request.projectId,
      sourceRecordIds: request.sourceRecordIds
    });
  }
  return Object.freeze({
    title: request.title,
    slides: presentationSlides(request),
    projectId: request.projectId,
    sourceRecordIds: request.sourceRecordIds
  });
}

function billingReceipt(request) {
  return Object.freeze({
    schemaVersion: 'pack060.research-artifact-billing.v1',
    researchMode: request.researchMode,
    upstreamResearchBillingUnaffected: true,
    conversionProviderCalls: 0,
    conversionCreditsCharged: 0,
    duplicateCharge: false,
    liveBillingAllowed: false
  });
}

module.exports = {
  OUTPUT_KINDS,
  RESEARCH_MODES,
  checkpointError,
  normalizeCheckpointRequest,
  buildArtifactInput,
  billingReceipt,
  chunks,
  presentationSlides,
  spreadsheetRows
};
