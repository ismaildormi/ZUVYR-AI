'use strict';

const crypto = require('node:crypto');

const {
  CONFIG,
  buildCanonicalObjectPath,
  assertOwnedStoragePath
} = require('./assetStorageContract');

const {
  createAssetStorageKernel
} = require('./assetStorageKernel');

const {
  createContentRepository
} = require('./contentRepository');

const LOCAL_IMAGE_UTILITY_OPERATIONS = new Set([
  'crop',
  'resize',
  'canvas',
  'layers',
  'text',
  'batch'
]);

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp'
]);

const MAX_BYTES = 25 * 1024 * 1024;

function repositoryError(code, status = 500, cause = null) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = status;
  error.retryable = false;
  error.cause = cause;
  return error;
}

function duplicateStorage(error) {
  const status = Number(
    error && (
      error.statusCode ||
      error.status ||
      error.code
    )
  );

  const message =
    String(error?.message || '').toLowerCase();

  return (
    status === 409 ||
    message.includes('already exists') ||
    message.includes('duplicate')
  );
}

async function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;

  if (
    value &&
    typeof value.arrayBuffer === 'function'
  ) {
    return Buffer.from(await value.arrayBuffer());
  }

  throw repositoryError(
    'image_utility_download_invalid',
    500
  );
}

function createLocalImageUtilityRepository({
  db,
  storage,
  contentRepository = null,
  assetKernel = null
} = {}) {
  if (!db || typeof db.from !== 'function') {
    throw new TypeError(
      'Local image utility repository requires a database client.'
    );
  }

  if (!storage || typeof storage.from !== 'function') {
    throw new TypeError(
      'Local image utility repository requires storage.'
    );
  }

  const contentRepo =
    contentRepository ||
    createContentRepository({ client: db });

  const assets =
    assetKernel ||
    createAssetStorageKernel({
      client: db,
      storage
    });

  async function loadOwnedAsset({
    ownerId,
    assetId
  }) {
    const asset =
      await assets.resolveOwned({
        ownerId,
        assetId
      });

    if (
      !asset ||
      asset.assetId !== assetId ||
      asset.status !== 'active'
    ) {
      throw repositoryError(
        'image_utility_asset_not_found',
        404
      );
    }

    if (
      asset.storageBucket !== CONFIG.bucket ||
      !ALLOWED_MIME.has(asset.mimeType) ||
      !Number.isSafeInteger(
        Number(asset.fileSizeBytes)
      ) ||
      Number(asset.fileSizeBytes) < 1 ||
      Number(asset.fileSizeBytes) > MAX_BYTES
    ) {
      throw repositoryError(
        'image_utility_asset_unsupported',
        400
      );
    }

    const storagePath =
      assertOwnedStoragePath({
        ownerId,
        storagePath: asset.storagePath
      });

    const result =
      await storage
        .from(asset.storageBucket)
        .download(storagePath);

    if (result.error || !result.data) {
      throw repositoryError(
        'image_utility_asset_download_failed',
        500,
        result.error
      );
    }

    const buffer =
      await toBuffer(result.data);

    if (
      buffer.length < 1 ||
      buffer.length > MAX_BYTES
    ) {
      throw repositoryError(
        'image_utility_asset_size_invalid',
        400
      );
    }

    const sha256 =
      crypto
        .createHash('sha256')
        .update(buffer)
        .digest('hex');

    if (
      asset.sha256 &&
      String(asset.sha256).toLowerCase() !==
        sha256.toLowerCase()
    ) {
      throw repositoryError(
        'image_utility_asset_hash_mismatch',
        409
      );
    }

    return Object.freeze({
      assetId: asset.assetId,
      contentId: asset.contentId,
      versionId: asset.versionId,
      mimeType: asset.mimeType,
      fileSizeBytes: buffer.length,
      sha256,
      buffer
    });
  }

  async function loadOwnedInputs({
    ownerId,
    request
  }) {
    if (
      !request ||
      !LOCAL_IMAGE_UTILITY_OPERATIONS.has(
        request.operation
      )
    ) {
      throw repositoryError(
        'unsupported_local_image_utility',
        400
      );
    }

    if (!request.sourceAssetId) {
      throw repositoryError(
        'image_utility_source_required',
        400
      );
    }

    const source =
      await loadOwnedAsset({
        ownerId,
        assetId: request.sourceAssetId
      });

    const references = [];

    for (
      const assetId of
      request.referenceAssetIds || []
    ) {
      references.push(
        await loadOwnedAsset({
          ownerId,
          assetId
        })
      );
    }

    return Object.freeze({
      sourceBuffer: source.buffer,
      referenceBuffers:
        Object.freeze(
          references.map(item => item.buffer)
        ),
      lineage: Object.freeze({
        sourceAssetId: source.assetId,
        sourceContentId: source.contentId,
        sourceVersionId: source.versionId,
        referenceAssets: Object.freeze(
          references.map(item =>
            Object.freeze({
              assetId: item.assetId,
              contentId: item.contentId,
              versionId: item.versionId
            })
          )
        )
      })
    });
  }

  async function persistOutputs({
    ownerId,
    jobId,
    prompt,
    operation,
    options,
    lineage,
    outputs
  }) {
    if (
      !LOCAL_IMAGE_UTILITY_OPERATIONS.has(
        operation
      )
    ) {
      throw repositoryError(
        'unsupported_local_image_utility',
        400
      );
    }

    if (
      !Array.isArray(outputs) ||
      outputs.length < 1 ||
      outputs.length > 5
    ) {
      throw repositoryError(
        'image_utility_output_count_invalid',
        500
      );
    }

    const persisted = [];

    for (
      let index = 0;
      index < outputs.length;
      index += 1
    ) {
      const output = outputs[index] || {};
      const buffer = output.buffer;
      const mimeType =
        String(output.mimeType || '').trim().toLowerCase();

      if (
        !Buffer.isBuffer(buffer) ||
        buffer.length < 1 ||
        buffer.length > MAX_BYTES ||
        !ALLOWED_MIME.has(mimeType)
      ) {
        throw repositoryError(
          'image_utility_output_invalid',
          500
        );
      }

      const sha256 =
        crypto
          .createHash('sha256')
          .update(buffer)
          .digest('hex');

      const record =
        await contentRepo.ensure({
          ownerId,
          projectId: null,
          kind: 'image',
          title:
            'Image utility: ' +
            operation,
          sourceKind:
            'image_utility',
          sourceSystem:
            'generation_job',
          sourceId:
            'image-job:' +
            jobId +
            ':utility:' +
            index,
          sourceVersionKey:
            sha256,
          metadata: {
            imageGeneration: true,
            pack: 64,
            jobId,
            outputIndex: index,
            provider: 'local-sharp',
            model: 'sharp@0.34.4',
            operation,
            options,
            lineage,
            utilityMetadata:
              output.metadata || {}
          },
          version: {
            mimeType,
            uri: null,
            text: null,
            sha256,
            payload: {
              prompt:
                String(prompt || ''),
              provider:
                'local-sharp',
              model:
                'sharp@0.34.4',
              operation,
              outputIndex: index,
              options,
              lineage,
              utilityMetadata:
                output.metadata || {}
            },
            provenance: {
              source:
                'pack064_local_image_utility',
              jobId,
              outputIndex: index,
              operation,
              lineage
            }
          }
        });

      const storagePath =
        buildCanonicalObjectPath({
          ownerId,
          sha256
        });

      const upload =
        await storage
          .from(CONFIG.bucket)
          .upload(
            storagePath,
            buffer,
            {
              contentType: mimeType,
              cacheControl: '3600',
              upsert: false
            }
          );

      if (
        upload.error &&
        !duplicateStorage(upload.error)
      ) {
        throw repositoryError(
          'image_utility_output_upload_failed',
          500,
          upload.error
        );
      }

      const registered =
        await assets.register({
          ownerId,
          canonicalContentId:
            record.contentId,
          canonicalVersionId:
            record.versionId,
          storagePath,
          mimeType,
          fileSizeBytes:
            buffer.length,
          sha256,
          retentionClass:
            'standard',
          metadata: {
            imageGeneration: true,
            pack: 64,
            jobId,
            outputIndex: index,
            provider:
              'local-sharp',
            model:
              'sharp@0.34.4',
            operation,
            lineage,
            utilityMetadata:
              output.metadata || {}
          }
        });

      const signed =
        await storage
          .from(CONFIG.bucket)
          .createSignedUrl(
            storagePath,
            300
          );

      if (
        signed.error ||
        !signed.data?.signedUrl
      ) {
        throw repositoryError(
          'image_utility_output_sign_failed',
          500,
          signed.error
        );
      }

      persisted.push(
        Object.freeze({
          outputIndex: index,
          providerUrl:
            signed.data.signedUrl,
          contentId:
            record.contentId,
          versionId:
            record.versionId,
          assetId:
            registered.assetId,
          mimeType,
          fileSizeBytes:
            buffer.length,
          sha256,
          utilityMetadata:
            output.metadata || {}
        })
      );
    }

    const manifest =
      persisted.map(item => ({
        outputIndex:
          item.outputIndex,
        contentId:
          item.contentId,
        versionId:
          item.versionId,
        assetId:
          item.assetId,
        mimeType:
          item.mimeType,
        fileSizeBytes:
          item.fileSizeBytes,
        sha256:
          item.sha256,
        utilityMetadata:
          item.utilityMetadata
      }));

    const primary = persisted[0];

    const update =
      await db
        .from('generation_jobs')
        .update({
          canonical_content_id:
            primary.contentId,
          result_url:
            primary.providerUrl,
          image_options: {
            ...options,
            outputManifest:
              manifest,
            outputProvider:
              'local-sharp',
            outputModel:
              'sharp@0.34.4',
            utilityLineage:
              lineage,
            pack064:
              true
          }
        })
        .eq('id', jobId)
        .eq('user_id', ownerId)
        .eq('feature', 'image');

    if (update.error) {
      throw repositoryError(
        'image_utility_job_link_failed',
        500,
        update.error
      );
    }

    return Object.freeze({
      primary,
      outputs:
        Object.freeze(persisted)
    });
  }

  return Object.freeze({
    loadOwnedAsset,
    loadOwnedInputs,
    persistOutputs
  });
}

function getDefaultLocalImageUtilityRepository() {
  const {
    supabaseAdmin
  } = require('./supabaseAdmin');

  return createLocalImageUtilityRepository({
    db: supabaseAdmin,
    storage: supabaseAdmin.storage
  });
}

module.exports = {
  LOCAL_IMAGE_UTILITY_OPERATIONS,
  createLocalImageUtilityRepository,
  getDefaultLocalImageUtilityRepository
};
