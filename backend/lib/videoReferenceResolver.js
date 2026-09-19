'use strict';

const { createAssetStorageKernel } = require('./assetStorageKernel');
const { assertOwnedStoragePath, CONFIG } = require('./assetStorageContract');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_MIME = new Set(['image/png','image/jpeg','image/webp','image/bmp']);
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function resolverError(code, retryable = false) {
  const error = new Error(code);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function compactLineage(item) {
  if (!item) return null;
  return Object.freeze({
    conversationAssetId: item.conversationAssetId,
    assetId: item.assetId,
    contentId: item.contentId,
    versionId: item.versionId,
    mimeType: item.mimeType,
    sha256: item.sha256
  });
}

function createVideoReferenceResolver({ db, storage }) {
  if (!db || typeof db.from !== 'function' || typeof db.rpc !== 'function') {
    throw new TypeError('Video reference resolver requires a Supabase-compatible database client.');
  }
  if (!storage || typeof storage.from !== 'function') {
    throw new TypeError('Video reference resolver requires a Supabase-compatible storage client.');
  }

  const kernel = createAssetStorageKernel({ client: db, storage });

  async function inspectConversationAsset(ownerId, conversationAssetId) {
    if (!UUID.test(String(ownerId || '')) || !UUID.test(String(conversationAssetId || ''))) {
      throw resolverError('invalid_video_reference_asset');
    }
    const result = await db.from('conversation_assets')
      .select('id,owner_id,asset_type,mime_type,file_size_bytes,sha256,scan_status,canonical_content_id,canonical_asset_id')
      .eq('id', conversationAssetId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (result.error) throw resolverError('video_reference_lookup_failed', true);
    const row = result.data;
    if (
      !row ||
      String(row.asset_type || '').toLowerCase() !== 'image' ||
      String(row.scan_status || '').toLowerCase() !== 'clean' ||
      !row.canonical_asset_id ||
      !row.canonical_content_id
    ) {
      throw resolverError('video_reference_not_ready');
    }
    const canonical = await kernel.resolveOwned({
      ownerId,
      assetId: row.canonical_asset_id
    });
    if (
      !canonical ||
      canonical.assetId !== row.canonical_asset_id ||
      canonical.status !== 'active'
    ) {
      throw resolverError('video_reference_not_owned');
    }
    assertOwnedStoragePath({ ownerId, storagePath: canonical.storagePath });
    if (
      canonical.storageBucket !== CONFIG.bucket ||
      !IMAGE_MIME.has(String(canonical.mimeType || '').toLowerCase()) ||
      !Number.isSafeInteger(Number(canonical.fileSizeBytes)) ||
      Number(canonical.fileSizeBytes) < 1 ||
      Number(canonical.fileSizeBytes) > MAX_IMAGE_BYTES
    ) {
      throw resolverError('video_reference_format_unsupported');
    }
    return Object.freeze({
      conversationAssetId: row.id,
      assetId: canonical.assetId,
      contentId: canonical.contentId,
      versionId: canonical.versionId,
      mimeType: canonical.mimeType,
      sha256: canonical.sha256
    });
  }

  async function resolve({ ownerId, request, requestId }) {
    const operation = request && request.operation;
    let orderedIds = [];
    let sourceId = null;
    let lastId = null;

    if (operation === 'image_to_video') {
      sourceId = request.startFrameAssetId || request.sourceImageAssetId;
      lastId = request.endFrameAssetId || null;
      orderedIds = [sourceId, lastId].filter(Boolean);
    } else if (operation === 'reference_to_video') {
      orderedIds = [...(request.referenceImageAssetIds || [])];
    } else {
      return Object.freeze({
        source: null,
        last: null,
        references: Object.freeze([]),
        lineage: Object.freeze({
          sourceInputField: null,
          sourceImage: null,
          lastImage: null,
          referenceImages: Object.freeze([])
        })
      });
    }

    const ids = [...new Set(orderedIds)];
    const inspected = new Map();
    for (const id of ids) {
      inspected.set(id, await inspectConversationAsset(ownerId, id));
    }

    const resolved = new Map();
    for (const id of ids) {
      const item = inspected.get(id);
      const signed = await kernel.createSignedDownload({
        ownerId,
        assetId: item.assetId,
        requestId,
        expiresIn: 300
      });
      resolved.set(id, Object.freeze({ ...item, url: signed.signedUrl }));
    }

    const source = sourceId ? resolved.get(sourceId) : null;
    const last = lastId ? resolved.get(lastId) : null;
    const references = operation === 'reference_to_video'
      ? request.referenceImageAssetIds.map(id => resolved.get(id))
      : [];

    return Object.freeze({
      source,
      last,
      references: Object.freeze(references),
      lineage: Object.freeze({
        sourceInputField:
          operation === 'image_to_video'
            ? (request.startFrameAssetId ? 'startFrameAssetId' : 'sourceImageAssetId')
            : null,
        sourceImage: compactLineage(source),
        lastImage: compactLineage(last),
        referenceImages: Object.freeze(references.map(compactLineage))
      })
    });
  }

  return resolve;
}

module.exports = { createVideoReferenceResolver };
