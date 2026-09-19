'use strict';

const crypto = require('node:crypto');
const { createContentRepository } = require('./contentRepository');
const { createAssetStorageKernel } = require('./assetStorageKernel');
const {
  CONFIG: ASSET_CONFIG,
  buildCanonicalObjectPath
} = require('./assetStorageContract');
const { config, browserError } = require('./cloudBrowserPolicy');

function artifactError(code, cause = null) {
  const error = browserError(code);
  if (cause) error.cause = cause;
  return error;
}

function digest(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function duplicateStorageError(error) {
  const text = String(error?.message || error?.error || '').toLowerCase();
  return (
    Number(error?.statusCode || error?.status) === 409 ||
    text.includes('duplicate') ||
    text.includes('already exists') ||
    text.includes('resource already exists')
  );
}

function contentKindForMime(mimeType, artifactKind) {
  const mime = String(mimeType || '').toLowerCase();
  if (artifactKind === 'screenshot' || mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    mime.includes('javascript')
  ) return 'document';
  return 'document';
}

function safeName(value, fallback = 'browser-artifact') {
  const name = String(value || fallback)
    .replace(/[\\/\0\r\n]/g, '_')
    .trim()
    .slice(0, 180);
  return name || fallback;
}

function createCloudBrowserArtifactRepository({
  db,
  storage,
  sessionRepository,
  contentRepository = null,
  assetKernel = null
} = {}) {
  if (!db || typeof db.rpc !== 'function' || typeof db.from !== 'function') {
    throw artifactError('cloud_browser_artifact_db_unavailable');
  }
  if (!storage || typeof storage.from !== 'function') {
    throw artifactError('cloud_browser_artifact_storage_unavailable');
  }
  if (!sessionRepository || typeof sessionRepository.recordArtifact !== 'function') {
    throw artifactError('cloud_browser_session_repository_required');
  }

  const contents =
    contentRepository ||
    createContentRepository({ client: db });

  const assets =
    assetKernel ||
    createAssetStorageKernel({ client: db, storage });

  async function ensureContent({
    ownerId,
    artifactKind,
    title,
    mimeType,
    sha256,
    payload = {},
    provenance = {}
  }) {
    const kind =
      artifactKind === 'dom'
        ? 'web'
        : contentKindForMime(mimeType, artifactKind);

    return contents.ensure({
      ownerId,
      projectId: null,
      kind,
      title: safeName(title, artifactKind),
      sourceKind: 'cloud_browser_artifact',
      sourceSystem: 'cloud_browser',
      sourceId: [mimeType || 'none', sha256].join(':'),
      sourceVersionKey: sha256,
      metadata: {
        cloudBrowser: true,
        artifactKind,
        pack: 81
      },
      version: {
        mimeType: mimeType || null,
        uri: null,
        text: artifactKind === 'dom' ? String(payload.html || '') : null,
        sha256,
        payload,
        provenance: {
          source: 'pack081_cloud_browser',
          ...provenance
        }
      }
    });
  }

  async function uploadCanonicalBytes({
    ownerId,
    contentId,
    versionId,
    buffer,
    mimeType,
    metadata
  }) {
    const sha256 = digest(buffer);
    const storagePath = buildCanonicalObjectPath({ ownerId, sha256 });

    const upload = await storage
      .from(ASSET_CONFIG.bucket)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false
      });

    if (upload.error && !duplicateStorageError(upload.error)) {
      throw artifactError('cloud_browser_asset_upload_failed', upload.error);
    }

    const registered = await assets.register({
      ownerId,
      canonicalContentId: contentId,
      canonicalVersionId: versionId,
      storagePath,
      mimeType,
      fileSizeBytes: buffer.length,
      sha256,
      retentionClass: 'standard',
      metadata
    });

    return Object.freeze({
      assetId: registered.assetId,
      storagePath: registered.storagePath || storagePath,
      sha256,
      fileSizeBytes: buffer.length,
      mimeType,
      replayed: registered.replayed === true
    });
  }

  async function persistBuffer({
    ownerId,
    sessionId,
    artifactKind,
    title,
    fileName,
    mimeType,
    buffer,
    providerArtifactId = null,
    metadata = {}
  } = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 1) {
      throw artifactError('cloud_browser_artifact_buffer_invalid');
    }

    const kind = String(artifactKind || '').trim().toLowerCase();
    if (!['screenshot', 'download'].includes(kind)) {
      throw artifactError('cloud_browser_binary_artifact_kind_invalid');
    }

    const max =
      kind === 'screenshot'
        ? config.observations.maxScreenshotBytes
        : config.files.maxDownloadBytes;

    if (buffer.length > max) {
      throw artifactError('cloud_browser_artifact_too_large');
    }

    const mime = String(mimeType || 'application/octet-stream')
      .trim()
      .toLowerCase()
      .slice(0, 255);

    const sha256 = digest(buffer);
    const canonical = await ensureContent({
      ownerId,
      artifactKind: kind,
      title: title || fileName || kind,
      mimeType: mime,
      sha256,
      payload: {
        fileName: safeName(fileName, kind),
        fileSizeBytes: buffer.length,
        artifactKind: kind
      },
      provenance: {
        sessionId,
        providerArtifactId
      }
    });

    const stored = await uploadCanonicalBytes({
      ownerId,
      contentId: canonical.contentId,
      versionId: canonical.versionId,
      buffer,
      mimeType: mime,
      metadata: {
        cloudBrowser: true,
        sessionId,
        artifactKind: kind,
        providerArtifactId,
        fileName: safeName(fileName, kind),
        pack: 81
      }
    });

    return sessionRepository.recordArtifact({
      ownerId,
      sessionId,
      artifactKind: kind,
      canonicalContentId: canonical.contentId,
      canonicalVersionId: canonical.versionId,
      assetId: stored.assetId,
      providerArtifactId,
      fileName: safeName(fileName, kind),
      mimeType: mime,
      fileSizeBytes: buffer.length,
      sha256,
      metadata
    });
  }

  async function persistDom({
    ownerId,
    sessionId,
    html,
    host = null,
    metadata = {}
  } = {}) {
    const text = String(html || '');
    const bytes = Buffer.byteLength(text, 'utf8');

    if (!text || bytes > config.observations.maxDomBytes) {
      throw artifactError('cloud_browser_dom_size_invalid');
    }

    const sha256 = digest(Buffer.from(text, 'utf8'));
    const canonical = await ensureContent({
      ownerId,
      artifactKind: 'dom',
      title: host ? 'DOM ' + String(host).slice(0, 180) : 'Browser DOM',
      mimeType: 'text/html',
      sha256,
      payload: {
        html: text,
        host: host || null,
        byteLength: bytes
      },
      provenance: {
        sessionId,
        host: host || null
      }
    });

    return sessionRepository.recordArtifact({
      ownerId,
      sessionId,
      artifactKind: 'dom',
      canonicalContentId: canonical.contentId,
      canonicalVersionId: canonical.versionId,
      assetId: null,
      fileName: null,
      mimeType: 'text/html',
      fileSizeBytes: bytes,
      sha256,
      metadata: {
        ...metadata,
        host: host || null,
        canonicalOnly: true
      }
    });
  }

  async function resolveOwnedUpload({
    ownerId,
    sessionId,
    assetId,
    fileName = null,
    metadata = {}
  } = {}) {
    const asset = await assets.resolveOwned({ ownerId, assetId });

    if (!asset?.assetId) {
      throw artifactError('cloud_browser_upload_asset_not_found');
    }
    if (Number(asset.fileSizeBytes || 0) > config.files.maxUploadBytes) {
      throw artifactError('cloud_browser_upload_asset_too_large');
    }

    const storagePath = String(asset.storagePath || '');
    const downloaded = await storage
      .from(asset.storageBucket || ASSET_CONFIG.bucket)
      .download(storagePath);

    if (downloaded.error || !downloaded.data) {
      throw artifactError(
        'cloud_browser_upload_asset_download_failed',
        downloaded.error
      );
    }

    const buffer = Buffer.from(await downloaded.data.arrayBuffer());

    if (
      buffer.length !== Number(asset.fileSizeBytes || buffer.length) ||
      buffer.length > config.files.maxUploadBytes
    ) {
      throw artifactError('cloud_browser_upload_asset_size_mismatch');
    }

    const actualSha = digest(buffer);
    if (String(asset.sha256 || '').toLowerCase() !== actualSha) {
      throw artifactError('cloud_browser_upload_asset_digest_mismatch');
    }

    const record = await sessionRepository.recordArtifact({
      ownerId,
      sessionId,
      artifactKind: 'upload',
      canonicalContentId: asset.contentId,
      canonicalVersionId: asset.versionId,
      assetId: asset.assetId,
      providerArtifactId: null,
      fileName: safeName(fileName, 'upload'),
      mimeType: asset.mimeType,
      fileSizeBytes: buffer.length,
      sha256: actualSha,
      metadata: {
        ...metadata,
        existingCanonicalAsset: true
      }
    });

    return Object.freeze({
      artifact: record,
      buffer,
      fileName: safeName(fileName, 'upload'),
      mimeType: asset.mimeType || 'application/octet-stream'
    });
  }

  return Object.freeze({
    persistBuffer,
    persistDom,
    resolveOwnedUpload
  });
}

module.exports = {
  createCloudBrowserArtifactRepository,
  duplicateStorageError,
  contentKindForMime
};
