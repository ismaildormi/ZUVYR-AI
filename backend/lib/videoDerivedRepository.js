'use strict';

const crypto = require('node:crypto');
const {
  CONFIG: ASSET_CONFIG,
  buildCanonicalObjectPath
} = require('./assetStorageContract');
const { createAssetStorageKernel } = require('./assetStorageKernel');
const { createContentRepository } = require('./contentRepository');
const {
  isMp4,
  readMp4DurationSeconds
} = require('./videoGenerationRepository');

const MAX_DERIVED_VIDEO_BYTES = 600 * 1024 * 1024;
const MIME = Object.freeze({
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime'
});

function derivedError(code, status = 500, cause = null) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.cause = cause;
  return error;
}

function duplicate(error) {
  const status = Number(error && (error.statusCode || error.status || error.code));
  const message = String(error && error.message || '').toLowerCase();
  return status === 409 || message.includes('already exists') || message.includes('duplicate');
}

function isWebm(buffer) {
  return Buffer.isBuffer(buffer) &&
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3;
}

function validateContainer(buffer, format) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw derivedError('video_derived_buffer_invalid', 502);
  }
  if (format === 'webm') {
    if (!isWebm(buffer)) throw derivedError('video_derived_container_mismatch', 502);
    return;
  }
  if (format === 'mp4' || format === 'mov') {
    if (!isMp4(buffer)) throw derivedError('video_derived_container_mismatch', 502);
    return;
  }
  throw derivedError('invalid_video_export_format', 400);
}

function durationFromContainer(buffer, format) {
  if (!['mp4','mov'].includes(format)) return null;
  try {
    return readMp4DurationSeconds(buffer);
  } catch (_) {
    return null;
  }
}

async function fetchDerivedVideo(url, format, {
  fetchImpl = globalThis.fetch,
  maxBytes = MAX_DERIVED_VIDEO_BYTES
} = {}) {
  if (typeof fetchImpl !== 'function') throw derivedError('video_derived_fetch_unavailable');
  let parsed;
  try { parsed = new URL(String(url || '')); } catch (_) {
    throw derivedError('invalid_video_derived_url', 502);
  }
  if (parsed.protocol !== 'https:') throw derivedError('invalid_video_derived_protocol', 502);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  let response;
  try {
    response = await fetchImpl(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal
    });
  } catch (error) {
    throw derivedError('video_derived_download_failed', 502, error);
  } finally {
    clearTimeout(timeout);
  }
  if (!response || !response.ok) throw derivedError('video_derived_download_failed', 502);

  const declared = Number(response.headers?.get?.('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw derivedError('video_derived_too_large', 502);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > maxBytes) {
    throw derivedError('video_derived_size_invalid', 502);
  }
  validateContainer(buffer, format);
  return Object.freeze({
    buffer,
    mimeType: MIME[format],
    actualDurationSeconds: durationFromContainer(buffer, format)
  });
}

function operationTitle(operation) {
  return ({
    subtitles: 'Subtitled video',
    dub: 'Dubbed video',
    enhance: 'Enhanced video',
    export: 'Exported video'
  })[operation] || 'Derived video';
}

function relationForOperation(operation) {
  return operation === 'export' ? 'transcoded_from' : 'edited_from';
}

function createVideoDerivedRepository({
  db,
  storage,
  contentRepository = null,
  assetKernel = null,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!db || typeof db.from !== 'function' || typeof db.rpc !== 'function') {
    throw new TypeError('Video Derived repository requires a Supabase-compatible database client.');
  }
  if (!storage || typeof storage.from !== 'function') {
    throw new TypeError('Video Derived repository requires a Supabase-compatible storage client.');
  }
  const contentRepo = contentRepository || createContentRepository({ client: db });
  const assets = assetKernel || createAssetStorageKernel({ client: db, storage });

  async function uploadAsset({
    ownerId,
    contentId,
    versionId,
    buffer,
    mimeType,
    metadata
  }) {
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const storagePath = buildCanonicalObjectPath({ ownerId, sha256 });
    const upload = await storage.from(ASSET_CONFIG.bucket).upload(
      storagePath,
      buffer,
      { contentType: mimeType, cacheControl: '3600', upsert: false }
    );
    if (upload.error && !duplicate(upload.error)) {
      throw derivedError('video_derived_asset_upload_failed', 500, upload.error);
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
      contentId,
      versionId,
      storagePath: registered.storagePath || storagePath,
      mimeType,
      fileSizeBytes: buffer.length,
      sha256,
      replayed: registered.replayed === true
    });
  }

  async function linkLineage({
    ownerId,
    derivedAssetId,
    sourceAssetId,
    sourceVersionId,
    relationType,
    metadata
  }) {
    if (!sourceAssetId || !sourceVersionId) return null;
    const result = await db.rpc('link_zuvyr_asset_lineage', {
      p_owner_id: ownerId,
      p_derived_asset_id: derivedAssetId,
      p_source_asset_id: sourceAssetId,
      p_source_content_version_id: sourceVersionId,
      p_relation_type: relationType,
      p_task_run_id: null,
      p_step_id: null,
      p_metadata: metadata || {}
    });
    if (result.error) throw derivedError('video_derived_lineage_failed', 500, result.error);
    return result.data || null;
  }

  async function ownedJob(ownerId, jobId) {
    const result = await db.from('generation_jobs')
      .select('id,user_id,feature,result_url,canonical_content_id,video_operation,video_options,status,job_stage,cancel_requested')
      .eq('id', jobId)
      .eq('user_id', ownerId)
      .eq('feature', 'video')
      .maybeSingle();
    if (result.error) throw derivedError('video_derived_job_lookup_failed', 500, result.error);
    return result.data || null;
  }

  async function getExisting({ ownerId, jobId, requestId = jobId }) {
    const job = await ownedJob(ownerId, jobId);
    if (!job || !job.canonical_content_id) return null;
    const result = await db.from('zuvyr_assets')
      .select('id,canonical_content_id,canonical_version_id,mime_type,file_size_bytes,sha256,metadata,status,created_at')
      .eq('owner_id', ownerId)
      .eq('canonical_content_id', job.canonical_content_id)
      .eq('status', 'active')
      .order('created_at', { ascending: true });
    if (result.error) throw derivedError('video_derived_assets_lookup_failed', 500, result.error);
    const rows = result.data || [];
    const video = rows.find(row => String(row.mime_type || '').startsWith('video/'));
    if (!video) return null;
    const signed = await assets.createSignedDownload({
      ownerId,
      assetId: video.id,
      requestId: String(requestId) + ':derived-video',
      expiresIn: 3600
    });
    const options = job.video_options && typeof job.video_options === 'object'
      ? job.video_options
      : {};
    return Object.freeze({
      jobId: job.id,
      providerUrl: job.result_url || null,
      downloadUrl: signed.signedUrl,
      contentId: job.canonical_content_id,
      versionId: video.canonical_version_id,
      assetId: video.id,
      mimeType: video.mime_type,
      fileSizeBytes: Number(video.file_size_bytes || 0),
      sha256: video.sha256 || null,
      actualDurationSeconds: Number(options.actualDurationSeconds || 0) || null,
      options,
      subtitleAssets: Object.freeze(
        rows.filter(row =>
          ['application/x-subrip','text/vtt'].includes(String(row.mime_type || '').toLowerCase())
        ).map(row => Object.freeze({
          assetId: row.id,
          mimeType: row.mime_type,
          format: row.mime_type === 'text/vtt' ? 'vtt' : 'srt',
          fileSizeBytes: Number(row.file_size_bytes || 0),
          sha256: row.sha256 || null
        }))
      ),
      replayed: true
    });
  }

  async function persistBuffer({
    ownerId,
    jobId,
    operation,
    format,
    buffer,
    provider,
    model,
    providerUrl = null,
    options = {},
    providerMetadata = {},
    sourceLineage = {}
  }) {
    validateContainer(buffer, format);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const actualDurationSeconds =
      Number(options.actualDurationSeconds || 0) ||
      durationFromContainer(buffer, format) ||
      null;
    const persistedOptions = {
      ...options,
      actualDurationSeconds,
      outputProvider: provider,
      outputModel: model,
      pack069ProviderMetadata:
        providerMetadata && typeof providerMetadata === 'object'
          ? providerMetadata
          : {},
      canonicalLineage:
        sourceLineage && typeof sourceLineage === 'object'
          ? sourceLineage
          : {}
    };
    const record = await contentRepo.ensure({
      ownerId,
      projectId: null,
      kind: 'video',
      title: operationTitle(operation),
      sourceKind: 'video_derived',
      sourceSystem: 'zuvyr_video_pack069',
      sourceId: 'video-job:' + jobId,
      sourceVersionKey: sha256,
      metadata: {
        videoDerived: true,
        pack: 69,
        jobId,
        operation,
        provider,
        model,
        format,
        options: persistedOptions
      },
      version: {
        mimeType: MIME[format],
        uri: providerUrl,
        text: null,
        sha256,
        payload: {
          operation,
          provider,
          model,
          format,
          options: persistedOptions
        },
        provenance: {
          source: 'pack069_' + operation,
          jobId,
          provider,
          model,
          sourceLineage
        }
      }
    });
    const videoAsset = await uploadAsset({
      ownerId,
      contentId: record.contentId,
      versionId: record.versionId,
      buffer,
      mimeType: MIME[format],
      metadata: {
        videoDerived: true,
        pack: 69,
        jobId,
        operation,
        provider,
        model,
        format
      }
    });
    const source = sourceLineage?.sourceVideo || null;
    await linkLineage({
      ownerId,
      derivedAssetId: videoAsset.assetId,
      sourceAssetId: source?.assetId || null,
      sourceVersionId: source?.versionId || null,
      relationType: relationForOperation(operation),
      metadata: { pack: 69, operation, jobId }
    });

    const update = await db.from('generation_jobs')
      .update({
        canonical_content_id: record.contentId,
        result_url: providerUrl || null,
        video_options: persistedOptions
      })
      .eq('id', jobId)
      .eq('user_id', ownerId)
      .eq('feature', 'video');
    if (update.error) throw derivedError('video_derived_job_link_failed', 500, update.error);

    const signed = await assets.createSignedDownload({
      ownerId,
      assetId: videoAsset.assetId,
      requestId: String(jobId) + ':derived-video',
      expiresIn: 3600
    });

    return Object.freeze({
      jobId,
      providerUrl,
      downloadUrl: signed.signedUrl,
      contentId: record.contentId,
      versionId: record.versionId,
      assetId: videoAsset.assetId,
      mimeType: MIME[format],
      fileSizeBytes: videoAsset.fileSizeBytes,
      sha256,
      actualDurationSeconds,
      options: persistedOptions,
      subtitleAssets: Object.freeze([]),
      replayed: record.replayed === true || videoAsset.replayed === true
    });
  }

  async function persistRemote({
    ownerId,
    jobId,
    operation,
    format,
    providerUrl,
    provider,
    model,
    options = {},
    providerMetadata = {},
    sourceLineage = {}
  }) {
    const existing = await getExisting({ ownerId, jobId, requestId: jobId });
    if (existing) return existing;
    const downloaded = await fetchDerivedVideo(providerUrl, format, { fetchImpl });
    return persistBuffer({
      ownerId,
      jobId,
      operation,
      format,
      buffer: downloaded.buffer,
      provider,
      model,
      providerUrl,
      options: {
        ...options,
        actualDurationSeconds: downloaded.actualDurationSeconds
      },
      providerMetadata,
      sourceLineage
    });
  }

  async function persistSubtitleArtifacts({
    ownerId,
    jobId,
    video,
    artifacts
  }) {
    if (!video?.assetId || !video?.contentId || !video?.versionId) {
      throw derivedError('video_subtitle_parent_invalid', 500);
    }
    const out = [];
    for (const item of artifacts || []) {
      const asset = await uploadAsset({
        ownerId,
        contentId: video.contentId,
        versionId: video.versionId,
        buffer: item.buffer,
        mimeType: item.mimeType,
        metadata: {
          videoSubtitleArtifact: true,
          pack: 69,
          jobId,
          format: item.format
        }
      });
      await linkLineage({
        ownerId,
        derivedAssetId: asset.assetId,
        sourceAssetId: video.assetId,
        sourceVersionId: video.versionId,
        relationType: 'extracted_from',
        metadata: { pack: 69, operation: 'subtitles', format: item.format, jobId }
      });
      const signed = await assets.createSignedDownload({
        ownerId,
        assetId: asset.assetId,
        requestId: String(jobId) + ':subtitle:' + item.format,
        expiresIn: 3600
      });
      out.push(Object.freeze({
        ...asset,
        format: item.format,
        downloadUrl: signed.signedUrl
      }));
    }
    return Object.freeze(out);
  }

  return Object.freeze({
    ownedJob,
    getExisting,
    persistBuffer,
    persistRemote,
    persistSubtitleArtifacts
  });
}

function getDefaultVideoDerivedRepository() {
  const { supabaseAdmin } = require('./supabaseAdmin');
  return createVideoDerivedRepository({
    db: supabaseAdmin,
    storage: supabaseAdmin.storage
  });
}

module.exports = {
  MIME,
  MAX_DERIVED_VIDEO_BYTES,
  isWebm,
  validateContainer,
  fetchDerivedVideo,
  createVideoDerivedRepository,
  getDefaultVideoDerivedRepository
};
