'use strict';

const crypto = require('node:crypto');
const {
  CONFIG: ASSET_CONFIG,
  buildCanonicalObjectPath,
  assertOwnedStoragePath
} = require('./assetStorageContract');
const { createAssetStorageKernel } = require('./assetStorageKernel');
const { createContentRepository } = require('./contentRepository');

const IMAGE_SOURCE_SYSTEM = 'generation_job';
const MAX_CANONICAL_IMAGE_BYTES = 25 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set(['image/webp', 'image/png', 'image/jpeg']);

const PACK063_IMAGE_OPERATIONS = new Set([
  'edit',
  'inpaint',
  'expand'
]);

const PACK064_IMAGE_OPERATIONS = new Set([
  'remove_background',
  'relight',
  'crop',
  'resize',
  'canvas',
  'layers',
  'text',
  'batch'
]);

const PACK064_LOCAL_OPERATIONS = new Set([
  'crop',
  'resize',
  'canvas',
  'layers',
  'text',
  'batch'
]);

function packForOperation(operation, additional = false) {
  if (PACK064_IMAGE_OPERATIONS.has(operation)) return 64;
  if (PACK063_IMAGE_OPERATIONS.has(operation)) return 63;
  return additional ? 62 : 61;
}

function provenanceForOperation(operation, additional = false) {
  if (PACK064_IMAGE_OPERATIONS.has(operation)) {
    return 'pack064_image_utility';
  }
  if (PACK063_IMAGE_OPERATIONS.has(operation)) {
    return 'pack063_image_edit';
  }
  return additional
    ? 'pack062_image_reference_variation'
    : 'pack061_image_generate';
}

function imageRepositoryError(code, status = 500, cause = null) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.cause = cause;
  return error;
}

function isDuplicateStorageError(error) {
  const status = Number(error && (error.statusCode || error.status || error.code));
  const message = String(error && error.message || '').toLowerCase();
  return status === 409 || message.includes('already exists') || message.includes('duplicate');
}

function normalizeMime(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function titleFromPrompt(prompt) {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Generated image';
  return text.length <= 120 ? text : text.slice(0, 117) + '…';
}

async function fetchImageBytes(url, { fetchImpl = globalThis.fetch, maxBytes = MAX_CANONICAL_IMAGE_BYTES } = {}) {
  if (typeof fetchImpl !== 'function') throw imageRepositoryError('image_fetch_unavailable', 500);

  let parsed;
  try { parsed = new URL(String(url || '')); } catch (_) { throw imageRepositoryError('invalid_image_result_url', 502); }
  if (parsed.protocol !== 'https:') throw imageRepositoryError('invalid_image_result_protocol', 502);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response;
  try {
    response = await fetchImpl(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { accept: 'image/webp,image/png,image/jpeg' }
    });
  } catch (error) {
    throw imageRepositoryError('image_result_download_failed', 502, error);
  } finally {
    clearTimeout(timeout);
  }

  if (!response || !response.ok) throw imageRepositoryError('image_result_download_failed', 502);
  const mimeType = normalizeMime(response.headers && response.headers.get ? response.headers.get('content-type') : '');
  if (!ALLOWED_IMAGE_MIME.has(mimeType)) throw imageRepositoryError('image_result_mime_unsupported', 502);

  const declared = Number(response.headers && response.headers.get ? response.headers.get('content-length') : 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw imageRepositoryError('image_result_too_large', 502);

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maxBytes) throw imageRepositoryError('image_result_size_invalid', 502);
  return Object.freeze({ buffer: bytes, mimeType });
}

function createImageGenerationRepository({ db, storage, contentRepository = null, assetKernel = null, fetchImpl = globalThis.fetch } = {}) {
  if (!db || typeof db.from !== 'function' || typeof db.rpc !== 'function') throw new TypeError('Image Generation repository requires a Supabase-compatible database client.');
  if (!storage || typeof storage.from !== 'function') throw new TypeError('Image Generation repository requires a Supabase-compatible storage client.');

  const contentRepo = contentRepository || createContentRepository({ client: db });
  const assets = assetKernel || createAssetStorageKernel({ client: db, storage });

  async function ownedJob(ownerId, jobId) {
    const result = await db.from('generation_jobs')
      .select('id,user_id,feature,status,prompt,result_url,canonical_content_id,image_operation,image_options,created_at,completed_at,error_message')
      .eq('id', jobId)
      .eq('user_id', ownerId)
      .eq('feature', 'image')
      .maybeSingle();
    if (result.error) throw imageRepositoryError('image_job_lookup_failed', 500, result.error);
    return result.data || null;
  }

  async function newestAsset(ownerId, contentId) {
    if (!contentId) return null;
    const result = await db.from('zuvyr_assets')
      .select('id,canonical_content_id,mime_type,file_size_bytes,sha256,status,created_at')
      .eq('owner_id', ownerId)
      .eq('canonical_content_id', contentId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw imageRepositoryError('image_asset_lookup_failed', 500, result.error);
    return result.data || null;
  }

  async function getExisting({ ownerId, jobId }) {
    const job = await ownedJob(ownerId, jobId);
    if (!job || !job.canonical_content_id) return null;
    const asset = await newestAsset(ownerId, job.canonical_content_id);
    if (!asset) return null;

    let providerUrl = job.result_url || null;

    if (PACK064_LOCAL_OPERATIONS.has(job.image_operation)) {
      const resolved = await assets.resolveOwned({
        ownerId,
        assetId: asset.id
      });

      if (!resolved || resolved.assetId !== asset.id) {
        throw imageRepositoryError(
          'image_local_replay_asset_not_found',
          404
        );
      }

      const storagePath = assertOwnedStoragePath({
        ownerId,
        storagePath: resolved.storagePath
      });

      const signed = await storage
        .from(resolved.storageBucket || ASSET_CONFIG.bucket)
        .createSignedUrl(storagePath, 300);

      if (
        signed.error ||
        !signed.data ||
        !signed.data.signedUrl
      ) {
        throw imageRepositoryError(
          'image_local_replay_sign_failed',
          500,
          signed.error
        );
      }

      providerUrl = signed.data.signedUrl;
    }

    return Object.freeze({
      jobId: job.id,
      providerUrl,
      contentId: job.canonical_content_id,
      assetId: asset.id,
      mimeType: asset.mime_type,
      fileSizeBytes: Number(asset.file_size_bytes || 0),
      sha256: asset.sha256 || null,
      options: job.image_options || {},
      replayed: true
    });
  }

  async function persistGenerated({
    ownerId,
    jobId,
    prompt,
    providerUrl,
    provider,
    model,
    operation = 'generate',
    options = {},
    lineage = {}
  }) {
    const existing = await getExisting({ ownerId, jobId });
    if (existing) return existing;

    const downloaded = await fetchImageBytes(providerUrl, { fetchImpl });
    const sha256 = crypto.createHash('sha256').update(downloaded.buffer).digest('hex');
    const promptHash = crypto.createHash('sha256').update(String(prompt || '')).digest('hex');
    const title = titleFromPrompt(prompt);

    const record = await contentRepo.ensure({
      ownerId,
      projectId: null,
      kind: 'image',
      title,
      sourceKind: 'image_generation',
      sourceSystem: IMAGE_SOURCE_SYSTEM,
      sourceId: `image-job:${jobId}`,
      sourceVersionKey: sha256,
      metadata: {
        imageGeneration: true,
        pack: packForOperation(operation, false),
        jobId,
        provider,
        model,
        operation,
        promptHash,
        options,
        lineage
      },
      version: {
        mimeType: downloaded.mimeType,
        uri: providerUrl,
        text: null,
        sha256,
        payload: {
          prompt: String(prompt || ''),
          provider,
          model,
          operation,
          options,
          lineage
        },
        provenance: {
          source: provenanceForOperation(operation, false),
          jobId,
          provider,
          model,
          lineage
        }
      }
    });

    const storagePath = buildCanonicalObjectPath({ ownerId, sha256 });
    const upload = await storage.from(ASSET_CONFIG.bucket).upload(storagePath, downloaded.buffer, {
      contentType: downloaded.mimeType,
      cacheControl: '3600',
      upsert: false
    });
    if (upload.error && !isDuplicateStorageError(upload.error)) throw imageRepositoryError('image_asset_upload_failed', 500, upload.error);

    const registered = await assets.register({
      ownerId,
      canonicalContentId: record.contentId,
      canonicalVersionId: record.versionId,
      storagePath,
      mimeType: downloaded.mimeType,
      fileSizeBytes: downloaded.buffer.length,
      sha256,
      retentionClass: 'standard',
      metadata: {
        imageGeneration: true,
        pack: ['edit', 'inpaint', 'expand'].includes(operation) ? 63 : 61,
        jobId,
        provider,
        model,
        operation,
        promptHash,
        lineage
      }
    });

    const update = await db.from('generation_jobs')
      .update({
        canonical_content_id: record.contentId,
        result_url: String(providerUrl),
        image_options: {
          ...options,
          outputProvider: provider,
          outputModel: model,
          editLineage: lineage
        }
      })
      .eq('id', jobId)
      .eq('user_id', ownerId)
      .eq('feature', 'image');
    if (update.error) throw imageRepositoryError('image_job_canonical_link_failed', 500, update.error);

    return Object.freeze({
      jobId,
      providerUrl: String(providerUrl),
      contentId: record.contentId,
      versionId: record.versionId,
      assetId: registered.assetId,
      mimeType: downloaded.mimeType,
      fileSizeBytes: downloaded.buffer.length,
      sha256,
      replayed: record.replayed === true || registered.replayed === true
    });
  }

  async function persistAdditionalGenerated({
    ownerId,
    jobId,
    outputIndex,
    prompt,
    providerUrl,
    provider,
    model,
    operation,
    options,
    lineage = {}
  }) {
    const downloaded = await fetchImageBytes(providerUrl, { fetchImpl });
    const sha256 = crypto
      .createHash('sha256')
      .update(downloaded.buffer)
      .digest('hex');
    const promptHash = crypto
      .createHash('sha256')
      .update(String(prompt || ''))
      .digest('hex');
    const title = titleFromPrompt(prompt);

    const record = await contentRepo.ensure({
      ownerId,
      projectId: null,
      kind: 'image',
      title,
      sourceKind: 'image_generation',
      sourceSystem: IMAGE_SOURCE_SYSTEM,
      sourceId: `image-job:${jobId}:output:${outputIndex}`,
      sourceVersionKey: sha256,
      metadata: {
        imageGeneration: true,
        pack: packForOperation(operation, true),
        jobId,
        outputIndex,
        provider,
        model,
        operation,
        promptHash,
        options,
        lineage
      },
      version: {
        mimeType: downloaded.mimeType,
        uri: providerUrl,
        text: null,
        sha256,
        payload: {
          prompt: String(prompt || ''),
          provider,
          model,
          operation,
          outputIndex,
          options,
          lineage
        },
        provenance: {
          source: provenanceForOperation(operation, true),
          jobId,
          outputIndex,
          provider,
          model,
          lineage
        }
      }
    });

    const storagePath = buildCanonicalObjectPath({ ownerId, sha256 });
    const upload = await storage
      .from(ASSET_CONFIG.bucket)
      .upload(storagePath, downloaded.buffer, {
        contentType: downloaded.mimeType,
        cacheControl: '3600',
        upsert: false
      });

    if (upload.error && !isDuplicateStorageError(upload.error)) {
      throw imageRepositoryError(
        'image_asset_upload_failed',
        500,
        upload.error
      );
    }

    const registered = await assets.register({
      ownerId,
      canonicalContentId: record.contentId,
      canonicalVersionId: record.versionId,
      storagePath,
      mimeType: downloaded.mimeType,
      fileSizeBytes: downloaded.buffer.length,
      sha256,
      retentionClass: 'standard',
      metadata: {
        imageGeneration: true,
        pack: packForOperation(operation, true),
        jobId,
        outputIndex,
        provider,
        model,
        operation,
        promptHash,
        lineage
      }
    });

    return Object.freeze({
      outputIndex,
      providerUrl: String(providerUrl),
      contentId: record.contentId,
      versionId: record.versionId,
      assetId: registered.assetId,
      mimeType: downloaded.mimeType,
      fileSizeBytes: downloaded.buffer.length,
      sha256
    });
  }

  async function persistGeneratedSet({
    ownerId,
    jobId,
    prompt,
    providerUrls,
    provider,
    model,
    operation = 'generate',
    options = {},
    lineage = {}
  }) {
    const urls = Array.isArray(providerUrls)
      ? providerUrls.map(String).filter(Boolean)
      : [];

    const quantity = Number(options.quantity || 1);
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 4 ||
      urls.length !== quantity
    ) {
      throw imageRepositoryError(
        'image_output_quantity_mismatch',
        502
      );
    }

    const existing = await getExisting({ ownerId, jobId });
    if (existing) {
      const manifest = Array.isArray(existing.options?.outputManifest)
        ? existing.options.outputManifest
        : [];

      if (quantity === 1) {
        return Object.freeze({
          primary: existing,
          outputs: Object.freeze([existing]),
          replayed: true
        });
      }

      if (manifest.length === quantity) {
        return Object.freeze({
          primary: existing,
          outputs: Object.freeze([...manifest]),
          replayed: true
        });
      }

      throw imageRepositoryError(
        'image_output_manifest_incomplete',
        500
      );
    }

    const primary = await persistGenerated({
      ownerId,
      jobId,
      prompt,
      providerUrl: urls[0],
      provider,
      model,
      operation,
      options,
      lineage
    });

    const outputs = [primary];
    for (let index = 1; index < urls.length; index += 1) {
      outputs.push(
        await persistAdditionalGenerated({
          ownerId,
          jobId,
          outputIndex: index,
          prompt,
          providerUrl: urls[index],
          provider,
          model,
          operation,
          options,
          lineage
        })
      );
    }

    const outputManifest = outputs.map((item, index) => ({
      outputIndex: index,
      contentId: item.contentId,
      assetId: item.assetId,
      mimeType: item.mimeType,
      fileSizeBytes: item.fileSizeBytes,
      sha256: item.sha256
    }));

    const update = await db
      .from('generation_jobs')
      .update({
        image_options: {
          ...options,
          outputManifest,
          outputProvider: provider,
          outputModel: model,
          editLineage: lineage
        }
      })
      .eq('id', jobId)
      .eq('user_id', ownerId)
      .eq('feature', 'image');

    if (update.error) {
      throw imageRepositoryError(
        'image_output_manifest_save_failed',
        500,
        update.error
      );
    }

    return Object.freeze({
      primary,
      outputs: Object.freeze(outputs),
      replayed: false
    });
  }

  async function listHistory({ ownerId, limit = 24 } = {}) {
    const bounded = Math.max(1, Math.min(50, Number(limit) || 24));
    const result = await db.from('generation_jobs')
      .select('id,status,prompt,result_url,canonical_content_id,image_operation,image_options,created_at,completed_at,error_message')
      .eq('user_id', ownerId)
      .eq('feature', 'image')
      .order('created_at', { ascending: false })
      .limit(bounded);
    if (result.error) throw imageRepositoryError('image_history_lookup_failed', 500, result.error);

    const jobs = result.data || [];
    const contentIds = [...new Set(jobs.map(row => row.canonical_content_id).filter(Boolean))];
    const assetByContent = new Map();
    if (contentIds.length) {
      const assetResult = await db.from('zuvyr_assets')
        .select('id,canonical_content_id,mime_type,file_size_bytes,status,created_at')
        .eq('owner_id', ownerId)
        .in('canonical_content_id', contentIds)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (assetResult.error) throw imageRepositoryError('image_history_asset_lookup_failed', 500, assetResult.error);
      for (const asset of assetResult.data || []) if (!assetByContent.has(asset.canonical_content_id)) assetByContent.set(asset.canonical_content_id, asset);
    }

    return jobs.map(row => {
      const asset = row.canonical_content_id ? assetByContent.get(row.canonical_content_id) : null;
      return Object.freeze({
        jobId: row.id,
        status: row.status,
        prompt: row.prompt,
        previewUrl: row.result_url || null,
        contentId: row.canonical_content_id || null,
        assetId: asset?.id || null,
        mimeType: asset?.mime_type || null,
        fileSizeBytes: Number(asset?.file_size_bytes || 0),
        operation: row.image_operation || 'generate',
        options: row.image_options || {},
        createdAt: row.created_at,
        completedAt: row.completed_at || null,
        error: row.error_message || null,
        downloadable: Boolean(row.canonical_content_id && asset?.id)
      });
    });
  }


  async function rollbackEdit({ ownerId, jobId }) {
    const job = await ownedJob(ownerId, jobId);
    if (!job) {
      throw imageRepositoryError('image_job_not_found', 404);
    }

    if (!['edit', 'inpaint', 'expand'].includes(job.image_operation)) {
      throw imageRepositoryError('image_rollback_not_available', 409);
    }

    const lineage =
      job.image_options &&
      typeof job.image_options === 'object'
        ? job.image_options.editLineage || {}
        : {};

    const sourceAssetId =
      lineage.sourceAssetId || null;

    if (!sourceAssetId) {
      throw imageRepositoryError('image_rollback_source_missing', 409);
    }

    const assetResult = await db
      .from('zuvyr_assets')
      .select(
        'id,owner_id,canonical_content_id,canonical_version_id,status,mime_type,file_size_bytes'
      )
      .eq('id', sourceAssetId)
      .eq('owner_id', ownerId)
      .eq('status', 'active')
      .maybeSingle();

    if (assetResult.error) {
      throw imageRepositoryError(
        'image_rollback_source_lookup_failed',
        500,
        assetResult.error
      );
    }

    if (!assetResult.data) {
      throw imageRepositoryError(
        'image_rollback_source_not_found',
        404
      );
    }

    return Object.freeze({
      jobId: job.id,
      operation: job.image_operation,
      rolledBack: true,
      providerCalls: 0,
      sourceAssetId: assetResult.data.id,
      sourceContentId:
        assetResult.data.canonical_content_id,
      sourceVersionId:
        assetResult.data.canonical_version_id,
      mimeType: assetResult.data.mime_type,
      fileSizeBytes:
        Number(assetResult.data.file_size_bytes || 0)
    });
  }

  return Object.freeze({
    persistGenerated,
    persistGeneratedSet,
    getExisting,
    listHistory,
    rollbackEdit
  });
}

function getDefaultImageGenerationRepository() {
  const { supabaseAdmin } = require('./supabaseAdmin');
  return createImageGenerationRepository({ db: supabaseAdmin, storage: supabaseAdmin.storage });
}

module.exports = {
  IMAGE_SOURCE_SYSTEM,
  MAX_CANONICAL_IMAGE_BYTES,
  ALLOWED_IMAGE_MIME,
  fetchImageBytes,
  createImageGenerationRepository,
  getDefaultImageGenerationRepository
};
