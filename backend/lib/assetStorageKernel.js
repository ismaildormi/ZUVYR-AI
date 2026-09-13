'use strict';

const {
  CONFIG,
  assetError,
  buildCanonicalObjectPath,
  assertOwnedStoragePath,
  normalizeRegistration
} = require('./assetStorageContract');

function createAssetStorageKernel({ client, storage } = {}) {
  if (!client || typeof client.rpc !== 'function') {
    throw assetError('ASSET_DB_CLIENT_REQUIRED');
  }
  if (!storage || typeof storage.from !== 'function') {
    throw assetError('ASSET_STORAGE_CLIENT_REQUIRED');
  }

  async function rpc(name, args) {
    const result = await client.rpc(name, args);
    if (result.error) {
      throw assetError('ASSET_RPC_FAILED', {
        name,
        code: result.error.code || null
      });
    }
    return result.data;
  }

  return Object.freeze({
    async createSignedUpload({
      ownerId,
      sha256,
      expiresIn = CONFIG.uploadUrlTtlSeconds
    }) {
      const storagePath = buildCanonicalObjectPath({ ownerId, sha256 });
      const result = await storage
        .from(CONFIG.bucket)
        .createSignedUploadUrl(storagePath, { upsert: false });

      if (
        result.error ||
        !result.data ||
        (!result.data.signedUrl && !result.data.token)
      ) {
        throw assetError('ASSET_SIGNED_UPLOAD_FAILED');
      }

      return Object.freeze({
        bucket: CONFIG.bucket,
        storagePath,
        expiresIn,
        signedUrl: result.data.signedUrl || null,
        token: result.data.token || null
      });
    },

    async register(input) {
      const normalized = normalizeRegistration(input);
      return rpc('register_zuvyr_asset', {
        p_owner_id: normalized.ownerId,
        p_canonical_content_id: normalized.canonicalContentId,
        p_canonical_version_id: normalized.canonicalVersionId,
        p_storage_bucket: normalized.storageBucket,
        p_storage_path: normalized.storagePath,
        p_mime_type: normalized.mimeType,
        p_file_size_bytes: normalized.fileSizeBytes,
        p_sha256: normalized.sha256,
        p_retention_class: normalized.retentionClass,
        p_retain_until: normalized.retainUntil,
        p_metadata: normalized.metadata
      });
    },

    async resolveOwned({ ownerId, assetId }) {
      return rpc('resolve_zuvyr_asset_for_owner', {
        p_owner_id: ownerId,
        p_asset_id: assetId
      });
    },

    async createSignedDownload({
      ownerId,
      assetId,
      requestId,
      expiresIn = CONFIG.downloadUrlTtlSeconds
    }) {
      const asset = await this.resolveOwned({ ownerId, assetId });
      if (!asset || !asset.assetId) {
        throw assetError('ASSET_NOT_FOUND');
      }

      const storagePath = assertOwnedStoragePath({
        ownerId,
        storagePath: asset.storagePath
      });

      const signed = await storage
        .from(asset.storageBucket || CONFIG.bucket)
        .createSignedUrl(storagePath, expiresIn);

      if (
        signed.error ||
        !signed.data ||
        !signed.data.signedUrl
      ) {
        throw assetError('ASSET_SIGNED_DOWNLOAD_FAILED');
      }

      await rpc('record_zuvyr_asset_egress', {
        p_owner_id: ownerId,
        p_asset_id: asset.assetId,
        p_request_id: requestId,
        p_bytes: Number(asset.fileSizeBytes || 0),
        p_purpose: 'signed_download_issued',
        p_metadata: {
          actualTransferKnown: false,
          meteringBasis: 'signed_download_max_bytes',
          pricingState: CONFIG.egress.pricingState
        }
      });

      return Object.freeze({
        assetId: asset.assetId,
        signedUrl: signed.data.signedUrl,
        expiresIn,
        billedCredits: 0,
        pricingState: CONFIG.egress.pricingState
      });
    }
  });
}

module.exports = {
  createAssetStorageKernel
};
