'use strict';

const crypto = require('node:crypto');
const {
  CONFIG: ASSET_CONFIG,
  buildCanonicalObjectPath
} = require('./assetStorageContract');
const { createAssetStorageKernel } = require('./assetStorageKernel');
const { createContentRepository } = require('./contentRepository');

const VIDEO_SOURCE_SYSTEM = 'generation_job';
const MAX_CANONICAL_VIDEO_BYTES = 250 * 1024 * 1024;

function repositoryError(code, status = 500, cause = null) {
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

function titleFromPrompt(prompt) {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Generated video';
  return text.length <= 120 ? text : text.slice(0, 117) + '…';
}

function isMp4(buffer) {
  return Buffer.isBuffer(buffer) &&
    buffer.length >= 12 &&
    buffer.toString('ascii', 4, 8) === 'ftyp';
}

function readMp4DurationSeconds(buffer) {
  if (!isMp4(buffer)) throw repositoryError('video_result_not_mp4', 502);
  const marker = Buffer.from('mvhd');
  const typeOffset = buffer.indexOf(marker);
  if (typeOffset < 4) throw repositoryError('video_duration_metadata_missing', 502);
  const boxStart = typeOffset - 4;
  const size = buffer.readUInt32BE(boxStart);
  if (size < 28 || boxStart + size > buffer.length) {
    throw repositoryError('video_duration_metadata_invalid', 502);
  }

  const version = buffer.readUInt8(typeOffset + 4);
  let timescale;
  let duration;
  if (version === 0) {
    if (typeOffset + 24 > buffer.length) {
      throw repositoryError('video_duration_metadata_invalid', 502);
    }
    timescale = buffer.readUInt32BE(typeOffset + 16);
    duration = BigInt(buffer.readUInt32BE(typeOffset + 20));
  } else if (version === 1) {
    if (typeOffset + 36 > buffer.length) {
      throw repositoryError('video_duration_metadata_invalid', 502);
    }
    timescale = buffer.readUInt32BE(typeOffset + 24);
    duration = buffer.readBigUInt64BE(typeOffset + 28);
  } else {
    throw repositoryError('video_duration_metadata_invalid', 502);
  }

  if (!timescale || duration <= 0n) {
    throw repositoryError('video_duration_metadata_invalid', 502);
  }
  const milliseconds = Number((duration * 1000n) / BigInt(timescale));
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw repositoryError('video_duration_metadata_invalid', 502);
  }
  return milliseconds / 1000;
}

async function fetchVideoBytes(url, {
  fetchImpl = globalThis.fetch,
  maxBytes = MAX_CANONICAL_VIDEO_BYTES
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw repositoryError('video_fetch_unavailable', 500);
  }

  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch (_) {
    throw repositoryError('invalid_video_result_url', 502);
  }
  if (parsed.protocol !== 'https:') {
    throw repositoryError('invalid_video_result_protocol', 502);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  let response;
  try {
    response = await fetchImpl(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { accept: 'video/mp4' }
    });
  } catch (error) {
    throw repositoryError('video_result_download_failed', 502, error);
  } finally {
    clearTimeout(timeout);
  }

  if (!response || !response.ok) {
    throw repositoryError('video_result_download_failed', 502);
  }

  const declared = Number(response.headers?.get?.('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw repositoryError('video_result_too_large', 502);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > maxBytes) {
    throw repositoryError('video_result_size_invalid', 502);
  }
  if (!isMp4(buffer)) {
    throw repositoryError('video_result_not_mp4', 502);
  }

  return Object.freeze({
    buffer,
    mimeType: 'video/mp4',
    actualDurationSeconds: readMp4DurationSeconds(buffer)
  });
}

function createVideoGenerationRepository({
  db,
  storage,
  contentRepository = null,
  assetKernel = null,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!db || typeof db.from !== 'function') {
    throw new TypeError('Video Generation repository requires a Supabase-compatible database client.');
  }
  if (!storage || typeof storage.from !== 'function') {
    throw new TypeError('Video Generation repository requires a Supabase-compatible storage client.');
  }

  const contentRepo = contentRepository || createContentRepository({ client: db });
  const assets = assetKernel || createAssetStorageKernel({ client: db, storage });

  async function ownedJob(ownerId, jobId) {
    const result = await db.from('generation_jobs')
      .select('id,user_id,feature,prompt,result_url,canonical_content_id,video_operation,video_options,created_at,completed_at,error_message')
      .eq('id', jobId)
      .eq('user_id', ownerId)
      .eq('feature', 'video')
      .maybeSingle();
    if (result.error) throw repositoryError('video_job_lookup_failed', 500, result.error);
    return result.data || null;
  }

  async function newestAsset(ownerId, contentId) {
    if (!contentId) return null;
    const result = await db.from('zuvyr_assets')
      .select('id,canonical_content_id,canonical_version_id,mime_type,file_size_bytes,sha256,status,created_at')
      .eq('owner_id', ownerId)
      .eq('canonical_content_id', contentId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw repositoryError('video_asset_lookup_failed', 500, result.error);
    return result.data || null;
  }

  async function getExisting({ ownerId, jobId }) {
    const job = await ownedJob(ownerId, jobId);
    if (!job || !job.canonical_content_id) return null;
    const asset = await newestAsset(ownerId, job.canonical_content_id);
    if (!asset) return null;
    const options = job.video_options && typeof job.video_options === 'object'
      ? job.video_options
      : {};

    return Object.freeze({
      jobId: job.id,
      providerUrl: job.result_url || null,
      contentId: job.canonical_content_id,
      versionId: asset.canonical_version_id || null,
      assetId: asset.id,
      mimeType: asset.mime_type,
      fileSizeBytes: Number(asset.file_size_bytes || 0),
      sha256: asset.sha256 || null,
      actualDurationSeconds: Number(options.actualDurationSeconds || 0) || null,
      options,
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
    operation = 'text_to_video',
    options = {},
    billing = {},
    lineage = {}
  }) {
    const existing = await getExisting({ ownerId, jobId });
    if (existing) return existing;

    const downloaded = await fetchVideoBytes(providerUrl, { fetchImpl });
    const sha256 = crypto.createHash('sha256').update(downloaded.buffer).digest('hex');
    const promptHash = crypto.createHash('sha256').update(String(prompt || '')).digest('hex');
    const persistedOptions = {
      ...options,
      actualDurationSeconds: downloaded.actualDurationSeconds,
      outputProvider: provider,
      outputModel: model,
      billing: {
        ...billing
      },
      canonicalLineage:
        lineage && typeof lineage === 'object'
          ? lineage
          : {}
    };

    const record = await contentRepo.ensure({
      ownerId,
      projectId: null,
      kind: 'video',
      title: titleFromPrompt(prompt),
      sourceKind: 'video_generation',
      sourceSystem: VIDEO_SOURCE_SYSTEM,
      sourceId: `video-job:${jobId}`,
      sourceVersionKey: sha256,
      metadata: {
        videoGeneration: true,
        pack: operation === 'text_to_video' ? 66 : 67,
        jobId,
        provider,
        model,
        operation,
        promptHash,
        options: persistedOptions
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
          options: persistedOptions
        },
        provenance: {
          source:
            operation === 'text_to_video'
              ? 'pack066_text_to_video'
              : 'pack067_image_reference_to_video',
          jobId,
          provider,
          model
        }
      }
    });

    const storagePath = buildCanonicalObjectPath({ ownerId, sha256 });
    const upload = await storage.from(ASSET_CONFIG.bucket).upload(
      storagePath,
      downloaded.buffer,
      {
        contentType: downloaded.mimeType,
        cacheControl: '3600',
        upsert: false
      }
    );
    if (upload.error && !isDuplicateStorageError(upload.error)) {
      throw repositoryError('video_asset_upload_failed', 500, upload.error);
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
        videoGeneration: true,
        pack: operation === 'text_to_video' ? 66 : 67,
        jobId,
        provider,
        model,
        operation,
        promptHash,
        options: persistedOptions
      }
    });

    const update = await db.from('generation_jobs')
      .update({
        canonical_content_id: record.contentId,
        result_url: String(providerUrl),
        video_options: persistedOptions
      })
      .eq('id', jobId)
      .eq('user_id', ownerId)
      .eq('feature', 'video');
    if (update.error) {
      throw repositoryError('video_job_canonical_link_failed', 500, update.error);
    }

    return Object.freeze({
      jobId,
      providerUrl: String(providerUrl),
      contentId: record.contentId,
      versionId: record.versionId,
      assetId: registered.assetId,
      mimeType: downloaded.mimeType,
      fileSizeBytes: downloaded.buffer.length,
      sha256,
      actualDurationSeconds: downloaded.actualDurationSeconds,
      options: persistedOptions,
      replayed: record.replayed === true || registered.replayed === true
    });
  }

  return Object.freeze({ persistGenerated, getExisting });
}

function getDefaultVideoGenerationRepository() {
  const { supabaseAdmin } = require('./supabaseAdmin');
  return createVideoGenerationRepository({
    db: supabaseAdmin,
    storage: supabaseAdmin.storage
  });
}

module.exports = {
  VIDEO_SOURCE_SYSTEM,
  MAX_CANONICAL_VIDEO_BYTES,
  isMp4,
  readMp4DurationSeconds,
  fetchVideoBytes,
  createVideoGenerationRepository,
  getDefaultVideoGenerationRepository
};
