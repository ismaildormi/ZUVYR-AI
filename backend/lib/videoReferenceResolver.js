'use strict';

const { createAssetStorageKernel } = require('./assetStorageKernel');
const { assertOwnedStoragePath, CONFIG } = require('./assetStorageContract');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_MIME = new Set(['image/png','image/jpeg','image/webp','image/bmp']);
const VIDEO_MIME = new Set([
  'video/mp4','video/quicktime','video/webm','video/x-m4v','image/gif'
]);
const AUDIO_MIME = new Set([
  'audio/mpeg','audio/mp3','audio/ogg','audio/wav','audio/x-wav',
  'audio/mp4','audio/x-m4a','audio/aac','audio/x-aac'
]);
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

function resolverError(code, retryable = false) {
  const error = new Error(code);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function optionalDuration(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function canonicalId(row, field) {
  const direct = row && row[field];
  if (direct) return String(direct);
  const metadata = row && row.metadata && typeof row.metadata === 'object'
    ? row.metadata
    : {};
  const fallback = metadata[field];
  return fallback ? String(fallback) : null;
}

function compactLineage(item) {
  if (!item) return null;
  return Object.freeze({
    conversationAssetId: item.conversationAssetId,
    assetId: item.assetId,
    contentId: item.contentId,
    versionId: item.versionId,
    assetType: item.assetType,
    mimeType: item.mimeType,
    fileSizeBytes: item.fileSizeBytes,
    sha256: item.sha256,
    durationSeconds: item.durationSeconds
  });
}

function mediaPolicy(assetType) {
  if (assetType === 'image') {
    return { mime: IMAGE_MIME, maxBytes: MAX_IMAGE_BYTES };
  }
  if (assetType === 'video') {
    return { mime: VIDEO_MIME, maxBytes: MAX_VIDEO_BYTES };
  }
  if (assetType === 'audio') {
    return { mime: AUDIO_MIME, maxBytes: MAX_AUDIO_BYTES };
  }
  throw resolverError('video_reference_type_unsupported');
}

function createVideoInputResolver({ db, storage }) {
  if (!db || typeof db.from !== 'function' || typeof db.rpc !== 'function') {
    throw new TypeError('Video input resolver requires a Supabase-compatible database client.');
  }
  if (!storage || typeof storage.from !== 'function') {
    throw new TypeError('Video input resolver requires a Supabase-compatible storage client.');
  }

  const kernel = createAssetStorageKernel({ client: db, storage });

  async function inspectConversationAsset(ownerId, conversationAssetId, expectedType) {
    if (!UUID.test(String(ownerId || '')) || !UUID.test(String(conversationAssetId || ''))) {
      throw resolverError('invalid_video_reference_asset');
    }

    const result = await db.from('conversation_assets')
      .select(
        'id,owner_id,asset_type,mime_type,file_size_bytes,duration_seconds,' +
        'sha256,scan_status,canonical_content_id,canonical_asset_id,metadata'
      )
      .eq('id', conversationAssetId)
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (result.error) throw resolverError('video_reference_lookup_failed', true);
    const row = result.data;
    const assetType = String(row?.asset_type || '').toLowerCase();

    if (
      !row ||
      assetType !== expectedType ||
      String(row.scan_status || '').toLowerCase() !== 'clean'
    ) {
      throw resolverError('video_reference_not_ready');
    }

    const assetId = canonicalId(row, 'canonical_asset_id');
    const contentId = canonicalId(row, 'canonical_content_id');
    if (!assetId || !contentId || !UUID.test(assetId) || !UUID.test(contentId)) {
      throw resolverError('video_reference_not_canonical');
    }

    const canonical = await kernel.resolveOwned({ ownerId, assetId });
    if (!canonical || canonical.assetId !== assetId || canonical.status !== 'active') {
      throw resolverError('video_reference_not_owned');
    }

    assertOwnedStoragePath({ ownerId, storagePath: canonical.storagePath });

    const policy = mediaPolicy(expectedType);
    const mimeType = String(canonical.mimeType || row.mime_type || '').toLowerCase();
    const fileSizeBytes = Number(canonical.fileSizeBytes ?? row.file_size_bytes ?? 0);

    if (
      canonical.storageBucket !== CONFIG.bucket ||
      !policy.mime.has(mimeType) ||
      !Number.isSafeInteger(fileSizeBytes) ||
      fileSizeBytes < 1 ||
      fileSizeBytes > policy.maxBytes
    ) {
      throw resolverError('video_reference_format_unsupported');
    }

    return Object.freeze({
      conversationAssetId: row.id,
      assetId: canonical.assetId,
      contentId: canonical.contentId || contentId,
      versionId: canonical.versionId,
      assetType,
      mimeType,
      fileSizeBytes,
      sha256: canonical.sha256 || row.sha256 || null,
      durationSeconds: optionalDuration(row.duration_seconds)
    });
  }

  async function inspect({ ownerId, request }) {
    const operation = request && request.operation;
    let source = null;
    let last = null;
    let audio = null;
    let references = [];

    if (operation === 'image_to_video') {
      const sourceId = request.startFrameAssetId || request.sourceImageAssetId;
      source = await inspectConversationAsset(ownerId, sourceId, 'image');
      if (request.endFrameAssetId) {
        last = await inspectConversationAsset(ownerId, request.endFrameAssetId, 'image');
      }
    } else if (operation === 'reference_to_video') {
      references = [];
      for (const id of request.referenceImageAssetIds || []) {
        references.push(await inspectConversationAsset(ownerId, id, 'image'));
      }
    } else if (
      ['edit','extend','object_remove','background_remove','relight','recamera','lip_sync']
        .includes(operation)
    ) {
      source = await inspectConversationAsset(ownerId, request.sourceVideoAssetId, 'video');
      if (operation === 'lip_sync') {
        audio = await inspectConversationAsset(ownerId, request.sourceAudioAssetId, 'audio');
      }
    }

    const sourceInputField =
      operation === 'image_to_video'
        ? (request.startFrameAssetId ? 'startFrameAssetId' : 'sourceImageAssetId')
        : source
          ? 'sourceVideoAssetId'
          : null;

    return Object.freeze({
      source,
      last,
      audio,
      references: Object.freeze(references),
      lineage: Object.freeze({
        sourceInputField,
        sourceImage: source?.assetType === 'image' ? compactLineage(source) : null,
        sourceVideo: source?.assetType === 'video' ? compactLineage(source) : null,
        sourceAudio: compactLineage(audio),
        lastImage: compactLineage(last),
        referenceImages: Object.freeze(references.map(compactLineage))
      })
    });
  }

  async function signInspected(ownerId, item, requestId) {
    if (!item) return null;
    const signed = await kernel.createSignedDownload({
      ownerId,
      assetId: item.assetId,
      requestId,
      expiresIn: 300
    });
    return Object.freeze({ ...item, url: signed.signedUrl });
  }

  async function resolve({ ownerId, request, requestId }) {
    const inspected = await inspect({ ownerId, request });
    const source = await signInspected(ownerId, inspected.source, requestId);
    const last = await signInspected(ownerId, inspected.last, requestId);
    const audio = await signInspected(ownerId, inspected.audio, requestId);
    const references = [];
    for (const item of inspected.references) {
      references.push(await signInspected(ownerId, item, requestId));
    }
    return Object.freeze({
      source,
      last,
      audio,
      references: Object.freeze(references),
      lineage: inspected.lineage
    });
  }

  return Object.freeze({ inspect, resolve, inspectConversationAsset });
}

function createVideoReferenceResolver(options) {
  const resolver = createVideoInputResolver(options);
  const legacy = async args => resolver.resolve(args);
  legacy.inspect = args => resolver.inspect(args);
  return legacy;
}

module.exports = {
  createVideoInputResolver,
  createVideoReferenceResolver
};
