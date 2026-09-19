'use strict';

const sharp = require('sharp');
const config = require('../config/model3d-system.v1.json');
const { createVideoInputResolver } = require('./videoReferenceResolver');
const { createAssetStorageKernel } = require('./assetStorageKernel');
const { assertOwnedStoragePath } = require('./assetStorageContract');

function inputError(code, statusCode = 400, cause = null) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  error.retryable = false;
  if (cause) error.cause = cause;
  return error;
}

function createModel3dInputResolver({ db, storage } = {}) {
  if (!db || !storage) throw inputError('model3d_input_resolver_unavailable', 503);

  const media = createVideoInputResolver({ db, storage });
  const assets = createAssetStorageKernel({ client: db, storage });
  const allowedMime = new Set(config.input.imageMimeTypes);

  async function validateView(ownerId, conversationAssetId, role) {
    const inspected = await media.inspectConversationAsset(
      ownerId,
      conversationAssetId,
      'image'
    );

    if (
      !allowedMime.has(String(inspected.mimeType || '').toLowerCase()) ||
      inspected.fileSizeBytes < 1 ||
      inspected.fileSizeBytes > Number(config.input.maxImageBytes)
    ) {
      throw inputError('model3d_input_image_format_unsupported');
    }

    const canonical = await assets.resolveOwned({
      ownerId,
      assetId: inspected.assetId
    });
    if (!canonical || canonical.assetId !== inspected.assetId) {
      throw inputError('model3d_input_asset_not_owned', 404);
    }

    const storagePath = assertOwnedStoragePath({
      ownerId,
      storagePath: canonical.storagePath
    });
    const downloaded = await storage
      .from(canonical.storageBucket)
      .download(storagePath);

    if (downloaded.error || !downloaded.data) {
      throw inputError('model3d_input_image_download_failed', 503, downloaded.error);
    }

    const buffer = Buffer.from(await downloaded.data.arrayBuffer());
    if (
      buffer.length < 1 ||
      buffer.length > Number(config.input.maxImageBytes)
    ) {
      throw inputError('model3d_input_image_size_invalid');
    }

    let metadata;
    try {
      metadata = await sharp(buffer, { failOn: 'warning' }).metadata();
    } catch (cause) {
      throw inputError('model3d_input_image_invalid', 400, cause);
    }

    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < config.input.minImageDimension ||
      height < config.input.minImageDimension ||
      width > config.input.maxImageDimension ||
      height > config.input.maxImageDimension
    ) {
      throw inputError('model3d_input_image_dimensions_invalid');
    }

    return Object.freeze({
      role,
      conversationAssetId: inspected.conversationAssetId,
      assetId: inspected.assetId,
      contentId: inspected.contentId,
      versionId: inspected.versionId,
      mimeType: inspected.mimeType,
      fileSizeBytes: inspected.fileSizeBytes,
      sha256: inspected.sha256,
      width,
      height
    });
  }

  async function inspect({ ownerId, request } = {}) {
    const views = {};
    for (const role of config.input.viewRoles) {
      const id = request?.views?.[role];
      if (!id) continue;
      views[role] = await validateView(ownerId, id, role);
    }
    return Object.freeze({
      views: Object.freeze(views),
      lineage: Object.freeze(
        Object.fromEntries(
          Object.entries(views).map(([role, item]) => [
            role,
            Object.freeze({
              conversationAssetId: item.conversationAssetId,
              assetId: item.assetId,
              contentId: item.contentId,
              versionId: item.versionId,
              sha256: item.sha256,
              mimeType: item.mimeType,
              fileSizeBytes: item.fileSizeBytes,
              width: item.width,
              height: item.height
            })
          ])
        )
      )
    });
  }

  async function resolve({ ownerId, request, requestId } = {}) {
    const inspected = await inspect({ ownerId, request });
    const views = {};
    for (const [role, item] of Object.entries(inspected.views)) {
      const signed = await assets.createSignedDownload({
        ownerId,
        assetId: item.assetId,
        requestId: requestId + ':model3d:' + role,
        expiresIn: 600
      });
      views[role] = Object.freeze({
        ...item,
        url: signed.signedUrl
      });
    }
    return Object.freeze({
      views: Object.freeze(views),
      lineage: inspected.lineage
    });
  }

  return Object.freeze({ inspect, resolve });
}

module.exports = {
  createModel3dInputResolver
};
