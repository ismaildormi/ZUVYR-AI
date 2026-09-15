'use strict';

const crypto = require('node:crypto');
const {
  CONFIG: ASSET_CONFIG,
  buildCanonicalObjectPath
} = require('./assetStorageContract');
const { createAssetStorageKernel } = require('./assetStorageKernel');
const { createContentRepository } = require('./contentRepository');
const { normalizeTemplate } = require('./workspaceTemplateContract');
const {
  FORMAT_MIME,
  FORMAT_EXT,
  BUILTIN_TEMPLATES,
  documentError,
  normalizeDocumentRequest,
  applyTemplate,
  extractTemplateVariables,
  renderFormat,
  safeFileBase,
  signature
} = require('./documentStudio');

const TEMPLATE_SOURCE_SYSTEM = 'zuvyr_document_templates';
const DOCUMENT_SOURCE_SYSTEM = 'zuvyr_document_studio';
const DOCUMENT_SOURCE_KIND = 'document_studio';

function repositoryError(code, status = 500, cause = null) {
  const error = documentError(code, status);
  error.cause = cause;
  return error;
}

function isDuplicateStorageError(error) {
  const status = Number(error && (error.statusCode || error.status || error.code));
  const message = String(error && error.message || '').toLowerCase();
  return status === 409 || message.includes('already exists') || message.includes('duplicate');
}

function uuid(value, code) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw documentError(code);
  }
  return normalized;
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

function createDocumentStudioRepository({
  db,
  storage,
  contentRepository = null,
  assetKernel = null,
  projectStore = null
} = {}) {
  if (!db || typeof db.from !== 'function' || typeof db.rpc !== 'function') {
    throw new TypeError('Document Studio requires a Supabase-compatible database client.');
  }
  if (!storage || typeof storage.from !== 'function') {
    throw new TypeError('Document Studio requires a Supabase-compatible storage client.');
  }
  const contentRepo = contentRepository || createContentRepository({ client: db });
  const assets = assetKernel || createAssetStorageKernel({ client: db, storage });

  async function loadOwnedSources(ownerId, ids) {
    if (!ids.length) return [];
    const result = await db
      .from('conversation_sources')
      .select(
        'id,owner_id,source_type,citation_key,title,url,snippet,' +
        'canonical_asset_id,canonical_content_id,project_id,metadata,verified_at'
      )
      .eq('owner_id', ownerId)
      .in('id', ids);
    if (result.error) throw repositoryError('document_sources_lookup_failed', 500, result.error);
    const rows = result.data || [];
    const byId = new Map(rows.map(row => [String(row.id), row]));
    const missing = ids.filter(id => !byId.has(id));
    if (missing.length) throw documentError('document_source_record_not_found', 404, { missing });
    return ids.map(id => publicSource(byId.get(id)));
  }

  async function listSavedTemplates(ownerId) {
    const result = await db
      .from('zuvyr_content_objects')
      .select('id,title,source_id,current_version_id,metadata,created_at,updated_at')
      .eq('owner_id', ownerId)
      .eq('source_system', TEMPLATE_SOURCE_SYSTEM)
      .eq('kind', 'document')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(100);
    if (result.error) throw repositoryError('document_templates_list_failed', 500, result.error);
    const rows = result.data || [];
    const versionIds = rows.map(row => row.current_version_id).filter(Boolean);
    let versionMap = new Map();
    if (versionIds.length) {
      const versions = await db
        .from('zuvyr_content_versions')
        .select('id,payload,text_content,created_at')
        .eq('owner_id', ownerId)
        .in('id', versionIds);
      if (versions.error) throw repositoryError('document_templates_versions_failed', 500, versions.error);
      versionMap = new Map((versions.data || []).map(row => [row.id, row]));
    }
    return rows.map(row => {
      const version = versionMap.get(row.current_version_id) || {};
      const payload = version.payload && typeof version.payload === 'object' ? version.payload : {};
      return {
        id: row.source_id,
        contentId: row.id,
        name: row.title || payload.name || 'Template',
        category: payload.category || row.metadata?.category || 'custom',
        body: version.text_content || payload.body || '',
        variables: Array.isArray(payload.variables) ? payload.variables : [],
        builtin: false,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    });
  }

  async function listTemplates(ownerId) {
    const saved = await listSavedTemplates(ownerId);
    return [...BUILTIN_TEMPLATES.map(item => ({ ...item })), ...saved];
  }

  async function getTemplate(ownerId, templateId) {
    const builtin = BUILTIN_TEMPLATES.find(item => item.id === templateId);
    if (builtin) return { ...builtin };
    const result = await db
      .from('zuvyr_content_objects')
      .select('id,title,source_id,current_version_id,metadata')
      .eq('owner_id', ownerId)
      .eq('source_system', TEMPLATE_SOURCE_SYSTEM)
      .eq('source_id', templateId)
      .eq('kind', 'document')
      .eq('status', 'active')
      .maybeSingle();
    if (result.error) throw repositoryError('document_template_lookup_failed', 500, result.error);
    if (!result.data || !result.data.current_version_id) throw documentError('document_template_not_found', 404);
    const version = await db
      .from('zuvyr_content_versions')
      .select('payload,text_content')
      .eq('owner_id', ownerId)
      .eq('id', result.data.current_version_id)
      .maybeSingle();
    if (version.error) throw repositoryError('document_template_version_failed', 500, version.error);
    if (!version.data) throw documentError('document_template_not_found', 404);
    const payload = version.data.payload && typeof version.data.payload === 'object' ? version.data.payload : {};
    return {
      id: result.data.source_id,
      contentId: result.data.id,
      name: result.data.title || payload.name || 'Template',
      category: payload.category || result.data.metadata?.category || 'custom',
      body: version.data.text_content || payload.body || '',
      variables: Array.isArray(payload.variables) ? payload.variables : [],
      builtin: false
    };
  }

  async function saveTemplate({ ownerId, input }) {
    const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const templateInput = { ...(raw.template || raw) };
    if (templateInput.variables === undefined) {
      templateInput.variables = extractTemplateVariables(templateInput.body || '');
    }
    const normalized = normalizeTemplate(templateInput);
    const templateId = raw.templateId ? uuid(raw.templateId, 'invalid_document_template_id') : crypto.randomUUID();
    const versionKey = signature(JSON.stringify({
      name: normalized.name,
      category: normalized.category,
      body: normalized.body,
      variables: normalized.variables
    }));
    const record = await contentRepo.ensure({
      ownerId,
      projectId: null,
      kind: 'document',
      title: normalized.name,
      sourceKind: 'workspace_template',
      sourceSystem: TEMPLATE_SOURCE_SYSTEM,
      sourceId: templateId,
      sourceVersionKey: versionKey,
      metadata: {
        documentTemplate: true,
        category: normalized.category,
        scriptsAllowed: false,
        communityPublished: false,
        pack: 58
      },
      version: {
        mimeType: 'text/markdown;charset=utf-8',
        uri: null,
        text: normalized.body,
        sha256: versionKey,
        payload: {
          name: normalized.name,
          category: normalized.category,
          body: normalized.body,
          variables: normalized.variables
        },
        provenance: {
          source: 'pack058_document_template',
          scriptsAllowed: false
        }
      }
    });
    return {
      id: templateId,
      contentId: record.contentId,
      versionId: record.versionId,
      name: normalized.name,
      category: normalized.category,
      body: normalized.body,
      variables: normalized.variables,
      builtin: false,
      replayed: record.replayed
    };
  }

  async function uploadAsset({ ownerId, contentId, versionId, format, buffer, documentId, title }) {
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    const storagePath = buildCanonicalObjectPath({ ownerId, sha256: digest });
    const upload = await storage
      .from(ASSET_CONFIG.bucket)
      .upload(storagePath, buffer, {
        contentType: FORMAT_MIME[format],
        cacheControl: '3600',
        upsert: false
      });
    if (upload.error && !isDuplicateStorageError(upload.error)) {
      throw repositoryError('document_asset_upload_failed', 500, upload.error);
    }
    const registered = await assets.register({
      ownerId,
      canonicalContentId: contentId,
      canonicalVersionId: versionId,
      storagePath,
      mimeType: FORMAT_MIME[format],
      fileSizeBytes: buffer.length,
      sha256: digest,
      retentionClass: 'standard',
      metadata: {
        documentStudio: true,
        format,
        documentId,
        title,
        pack: 58
      }
    });
    return {
      format,
      assetId: registered.assetId,
      storagePath: registered.storagePath || storagePath,
      mimeType: FORMAT_MIME[format],
      fileSizeBytes: buffer.length,
      sha256: digest,
      fileName: `${safeFileBase(title)}.${FORMAT_EXT[format]}`,
      replayed: registered.replayed === true
    };
  }

  async function renderDocument({ ownerId, input }) {
    const request = normalizeDocumentRequest(input);
    const template = request.templateId ? await getTemplate(ownerId, request.templateId) : null;
    const body = template
      ? applyTemplate(template, request.variables, request.content)
      : request.content;
    if (!String(body || '').trim()) throw documentError('invalid_document_content');

    const sources = await loadOwnedSources(ownerId, request.sourceRecordIds);
    const semanticHash = signature(JSON.stringify({
      title: request.title,
      body,
      sourceRecordIds: request.sourceRecordIds,
      templateId: request.templateId || null
    }));
    const documentId = `doc:${semanticHash}`;
    const existingIdentity = await contentRepo.resolveBySource({
      ownerId,
      sourceSystem: DOCUMENT_SOURCE_SYSTEM,
      sourceId: documentId
    });
    const canonicalProjectId = existingIdentity?.projectId || request.projectId || null;

    // Render every requested format before the first persistent write so a
    // missing local renderer cannot leave a half-created document.
    const rendered = [];
    for (const format of request.formats) {
      rendered.push({
        format,
        buffer: await renderFormat(format, {
          title: request.title,
          body,
          sources,
          documentId
        })
      });
    }

    const record = await contentRepo.ensure({
      ownerId,
      projectId: canonicalProjectId,
      kind: 'document',
      title: request.title,
      sourceKind: DOCUMENT_SOURCE_KIND,
      sourceSystem: DOCUMENT_SOURCE_SYSTEM,
      sourceId: documentId,
      sourceVersionKey: semanticHash,
      metadata: {
        documentStudio: true,
        documentId,
        formats: request.formats,
        templateId: request.templateId || null,
        sourceRecordIds: request.sourceRecordIds,
        pack: 58
      },
      version: {
        mimeType: 'application/vnd.zuvyr.document+json',
        uri: null,
        text: body,
        sha256: semanticHash,
        payload: {
          title: request.title,
          content: body,
          formats: request.formats,
          templateId: request.templateId || null,
          sourceRecordIds: request.sourceRecordIds
        },
        provenance: {
          source: 'pack058_document_studio',
          sourceRecordIds: request.sourceRecordIds,
          projectId: request.projectId || null
        }
      }
    });

    const artifactAssets = [];
    for (const item of rendered) {
      artifactAssets.push(await uploadAsset({
        ownerId,
        contentId: record.contentId,
        versionId: record.versionId,
        format: item.format,
        buffer: item.buffer,
        documentId,
        title: request.title
      }));
    }

    let project = null;
    if (request.projectId && projectStore && typeof projectStore.linkResource === 'function') {
      project = await projectStore.linkResource({
        ownerId,
        projectId: request.projectId,
        resourceType: 'content',
        resourceId: record.contentId
      });
    }

    return {
      documentId,
      contentId: record.contentId,
      versionId: record.versionId,
      versionNumber: record.versionNumber,
      replayed: record.replayed,
      title: request.title,
      content: body,
      formats: request.formats,
      template: template ? { id: template.id, name: template.name, builtin: template.builtin === true } : null,
      sources,
      assets: artifactAssets,
      projectId: request.projectId,
      projectLinked: Boolean(project),
      providerCalls: 0,
      billedCredits: 0,
      liveBillingAllowed: false
    };
  }

  return Object.freeze({
    listTemplates,
    getTemplate,
    saveTemplate,
    renderDocument,
    loadOwnedSources
  });
}

function getDefaultDocumentStudioRepository({ projectStore = null } = {}) {
  const { supabaseAdmin } = require('./supabaseAdmin');
  return createDocumentStudioRepository({
    db: supabaseAdmin,
    storage: supabaseAdmin.storage,
    projectStore
  });
}

module.exports = {
  TEMPLATE_SOURCE_SYSTEM,
  DOCUMENT_SOURCE_SYSTEM,
  DOCUMENT_SOURCE_KIND,
  publicSource,
  createDocumentStudioRepository,
  getDefaultDocumentStudioRepository
};
