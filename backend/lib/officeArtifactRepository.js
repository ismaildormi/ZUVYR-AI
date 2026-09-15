'use strict';

const crypto = require('node:crypto');
const { CONFIG: ASSET_CONFIG, buildCanonicalObjectPath } = require('./assetStorageContract');
const { createAssetStorageKernel } = require('./assetStorageKernel');
const { createContentRepository } = require('./contentRepository');
const {
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
} = require('./officeArtifactStudio');

const SPREADSHEET_SOURCE_SYSTEM = 'zuvyr_spreadsheet_studio';
const PRESENTATION_SOURCE_SYSTEM = 'zuvyr_presentation_studio';

function repositoryError(code, status = 500, cause = null) {
  const error = artifactError(code, status);
  error.cause = cause;
  return error;
}
function duplicate(error) {
  const status = Number(error && (error.statusCode || error.status || error.code));
  const message = String(error && error.message || '').toLowerCase();
  return status === 409 || message.includes('already exists') || message.includes('duplicate');
}
function publicSource(row) {
  return Object.freeze({
    id: row.id,
    citation_key: row.citation_key,
    source_type: row.source_type,
    title: row.title,
    url: row.url || null,
    snippet: row.snippet || '',
    canonical_asset_id: row.canonical_asset_id || null,
    canonical_content_id: row.canonical_content_id || null,
    project_id: row.project_id || null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    verified_at: row.verified_at || null
  });
}

function createOfficeArtifactRepository({ db, storage, contentRepository = null, assetKernel = null, projectStore = null } = {}) {
  if (!db || typeof db.from !== 'function' || typeof db.rpc !== 'function') throw new TypeError('Office Artifact Studio requires a Supabase-compatible database client.');
  if (!storage || typeof storage.from !== 'function') throw new TypeError('Office Artifact Studio requires a Supabase-compatible storage client.');
  const contentRepo = contentRepository || createContentRepository({ client: db });
  const assets = assetKernel || createAssetStorageKernel({ client: db, storage });

  async function loadOwnedSources(ownerId, ids) {
    if (!ids.length) return [];
    const result = await db.from('conversation_sources').select('id,owner_id,source_type,citation_key,title,url,snippet,canonical_asset_id,canonical_content_id,project_id,metadata,verified_at').eq('owner_id', ownerId).in('id', ids);
    if (result.error) throw repositoryError('office_sources_lookup_failed', 500, result.error);
    const rows = result.data || [];
    const byId = new Map(rows.map(row => [String(row.id), row]));
    const missing = ids.filter(id => !byId.has(id));
    if (missing.length) throw artifactError('office_source_record_not_found', 404, { missing });
    return ids.map(id => publicSource(byId.get(id)));
  }

  async function uploadAsset({ ownerId, contentId, versionId, format, buffer, artifactId, title, artifactKind }) {
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    const storagePath = buildCanonicalObjectPath({ ownerId, sha256: digest });
    const upload = await storage.from(ASSET_CONFIG.bucket).upload(storagePath, buffer, { contentType: MIME[format], cacheControl: '3600', upsert: false });
    if (upload.error && !duplicate(upload.error)) throw repositoryError('office_asset_upload_failed', 500, upload.error);
    const registered = await assets.register({
      ownerId,
      canonicalContentId: contentId,
      canonicalVersionId: versionId,
      storagePath,
      mimeType: MIME[format],
      fileSizeBytes: buffer.length,
      sha256: digest,
      retentionClass: 'standard',
      metadata: { officeArtifactStudio: true, artifactKind, format, artifactId, title, pack: 59 }
    });
    return Object.freeze({
      format,
      assetId: registered.assetId,
      storagePath: registered.storagePath || storagePath,
      mimeType: MIME[format],
      fileSizeBytes: buffer.length,
      sha256: digest,
      fileName: `${safeFileBase(title, artifactKind)}.${EXT[format]}`,
      replayed: registered.replayed === true
    });
  }

  async function persist({ ownerId, artifactKind, title, projectId, sourceRecordIds, payload, rendered, sources = null }) {
    const verifiedSources = Array.isArray(sources) ? sources : await loadOwnedSources(ownerId, sourceRecordIds);
    const semanticHash = signature(JSON.stringify({ artifactKind, title, payload, sourceRecordIds }));
    const sourceSystem = artifactKind === 'spreadsheet' ? SPREADSHEET_SOURCE_SYSTEM : PRESENTATION_SOURCE_SYSTEM;
    const artifactId = `${artifactKind === 'spreadsheet' ? 'sheet' : 'deck'}:${semanticHash}`;
    const existing = await contentRepo.resolveBySource({ ownerId, sourceSystem, sourceId: artifactId });
    const canonicalProjectId = existing?.projectId || projectId || null;
    const record = await contentRepo.ensure({
      ownerId,
      projectId: canonicalProjectId,
      kind: 'document',
      title,
      sourceKind: `${artifactKind}_studio`,
      sourceSystem,
      sourceId: artifactId,
      sourceVersionKey: semanticHash,
      metadata: { officeArtifactStudio: true, officeArtifactKind: artifactKind, artifactId, sourceRecordIds, formats: rendered.map(item => item.format), pack: 59 },
      version: {
        mimeType: `application/vnd.zuvyr.${artifactKind}+json`,
        uri: null,
        text: null,
        sha256: semanticHash,
        payload: { title, ...payload, sourceRecordIds },
        provenance: { source: `pack059_${artifactKind}_studio`, sourceRecordIds, projectId: projectId || null }
      }
    });
    const artifactAssets = [];
    for (const item of rendered) artifactAssets.push(await uploadAsset({ ownerId, contentId: record.contentId, versionId: record.versionId, format: item.format, buffer: item.buffer, artifactId, title, artifactKind }));
    let project = null;
    if (projectId && projectStore && typeof projectStore.linkResource === 'function') project = await projectStore.linkResource({ ownerId, projectId, resourceType: 'content', resourceId: record.contentId });
    return { artifactId, contentId: record.contentId, versionId: record.versionId, versionNumber: record.versionNumber, replayed: record.replayed, title, artifactKind, sources: verifiedSources, assets: artifactAssets, projectId, projectLinked: Boolean(project), providerCalls: 0, billedCredits: 0, liveBillingAllowed: false };
  }

  async function renderSpreadsheet({ ownerId, input }) {
    const request = normalizeSpreadsheetRequest(input);
    const sources = await loadOwnedSources(ownerId, request.sourceRecordIds);
    const rendered = [];
    for (const format of request.formats) {
      rendered.push({ format, buffer: format === 'xlsx' ? await renderXlsx(request, sources) : renderCsv(request, sources) });
    }
    return persist({ ownerId, artifactKind: 'spreadsheet', title: request.title, projectId: request.projectId, sourceRecordIds: request.sourceRecordIds, payload: { sheets: request.sheets, formats: request.formats }, rendered, sources });
  }

  async function renderPresentation({ ownerId, input }) {
    const request = normalizePresentationRequest(input);
    const sources = await loadOwnedSources(ownerId, request.sourceRecordIds);
    const rendered = [{ format: 'pptx', buffer: await renderPptx(request, sources) }];
    return persist({ ownerId, artifactKind: 'presentation', title: request.title, projectId: request.projectId, sourceRecordIds: request.sourceRecordIds, payload: { slides: request.slides, formats: ['pptx'] }, rendered, sources });
  }

  return Object.freeze({ renderSpreadsheet, renderPresentation, loadOwnedSources });
}

function getDefaultOfficeArtifactRepository({ projectStore = null } = {}) {
  const { supabaseAdmin } = require('./supabaseAdmin');
  return createOfficeArtifactRepository({ db: supabaseAdmin, storage: supabaseAdmin.storage, projectStore });
}

module.exports = {
  SPREADSHEET_SOURCE_SYSTEM,
  PRESENTATION_SOURCE_SYSTEM,
  createOfficeArtifactRepository,
  getDefaultOfficeArtifactRepository
};
