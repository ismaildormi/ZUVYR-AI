// ROX AI ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Worker (hardened)
//
// Credits are now reserved by server.js BEFORE the job is even enqueued
// (see handleGenerationRequest), so this worker no longer charges
// anything on success ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â that already happened. What it's responsible
// for now: if a job exhausts every retry, refund the exact reservation
// tied to that job's requestId, so a failed generation never costs the
// user credits. That refund + a log-only 'error' entry is recorded
// through gatekeeper.js.
//
// Run as its own process, separate from server.js:
//   node worker.js

require('dotenv').config({ path: __dirname + '/.env' });
const {
  validateWorkerEnvironment,
  reportEnvironmentValidation,
} = require('./lib/envValidation');

reportEnvironmentValidation(
  validateWorkerEnvironment(process.env),
  { component: 'worker' }
);
const { Worker, UnrecoverableError } = require('bullmq');
const {
  generateImage,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_FAL_IMAGE_MODEL,
  DEFAULT_FAL_KONTEXT_MODEL,
  DEFAULT_FAL_EDIT_MODEL,
  DEFAULT_FAL_INPAINT_MODEL,
  DEFAULT_FAL_OUTPAINT_MODEL,
  DEFAULT_FAL_BACKGROUND_MODEL,
  DEFAULT_FAL_UPSCALE_MODEL,
  DEFAULT_FAL_RELIGHT_MODEL
} = require('./src/modules/ai/providers/imageProviders');
const { buildImageArtifact } = require('./lib/imageArtifactContract');
const { normalizeImageRequest } = require('./lib/imageRequestContract');
const { assertImageRequestAvailable } = require('./lib/imageOperationRegistry');
const { getDefaultImageGenerationRepository } = require('./lib/imageGenerationRepository');
const {
  executeLocalImageUtility
} = require('./lib/localImageUtilities');
const {
  getDefaultLocalImageUtilityRepository
} = require('./lib/localImageUtilityRepository');
const { createImageReferenceResolver } = require('./lib/imageReferenceResolver');
const { generateVideo, DEFAULT_VIDEO_MODEL } = require('./lib/videoProvider');
const { normalizeVideoRequest } = require('./lib/videoRequestContract');
const { assertVideoRequestAvailable } = require('./lib/videoOperationRegistry');
const { buildVideoArtifact } = require('./lib/videoArtifactContract');
const { getDefaultVideoGenerationRepository } = require('./lib/videoGenerationRepository');
const { connection } = require('./lib/queue');
const { startBrainKernelWorker } = require('./lib/brainKernelWorker');
const { supabaseAdmin } = require('./lib/supabaseAdmin');
const resolveImageReferences = createImageReferenceResolver({
  db: supabaseAdmin,
  storage: supabaseAdmin.storage
});
const { refundCredits, settleCredits, logCreditEvent, reportRefundFailure } = require('./gatekeeper');
const { recordRefund } = require('./lib/metrics');
const {
  isGenerationFailureExhausted
} = require('./lib/generationFailurePolicy');
const {
  completeGenerationConversation,
  failGenerationConversation
} = require('./lib/conversationGeneration');
const conversationMemory = require('./lib/conversationMemory');
const {
  createAttachmentJobProcessor
} = require('./lib/attachmentWorker');

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 2);
const ATTACHMENT_WORKER_CONCURRENCY = Math.max(
  1,
  Number(process.env.ATTACHMENT_WORKER_CONCURRENCY || 1)
);

async function markJob(jobId, patch) {
  await supabaseAdmin.from('generation_jobs').update(patch).eq('id', jobId);
}

const baseAttachmentJobProcessor =
  createAttachmentJobProcessor({
    store: conversationMemory,
    storage: supabaseAdmin.storage
  });

const NON_RETRYABLE_ATTACHMENT_ERRORS = new Set([
  'dangerous_attachment_content',
  'blocked_attachment_type',
  'attachment_password_protected',
  'attachment_size_mismatch',
  'invalid_attachment_path',
  'attachment_credit_settlement_failed'
]);

async function settleAttachmentBilling(job, result) {
  const billing =
    result && result.billing && typeof result.billing === 'object'
      ? result.billing
      : null;

  if (!billing) return result;

  const requestId = String(
    billing.requestId || job.data.creditRequestId || ''
  ).trim();
  const finalCredits = Number(billing.finalCredits);

  if (
    !requestId ||
    !Number.isSafeInteger(finalCredits) ||
    finalCredits < 1
  ) {
    const error = new Error('attachment_credit_settlement_invalid');
    error.code = 'attachment_credit_settlement_failed';
    error.preserveProcessedAsset = true;
    throw error;
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const settlement =
        await settleCredits(requestId, finalCredits);

      if (
        result.asset &&
        result.asset.id &&
        result.asset.metadata &&
        typeof result.asset.metadata === 'object'
      ) {
        try {
          result.asset =
            await conversationMemory.updateAssetProcessing({
              assetId: result.asset.id,
              ownerId: job.data.ownerId,
              metadata: {
                ...result.asset.metadata,
                credit_settlement_status: 'settled',
                credit_settled_credits: finalCredits,
                credit_settlement_replayed:
                  Boolean(settlement?.replayed)
              }
            });
        } catch (metadataError) {
          console.error(
            '[attachment-worker] settlement metadata save failed:',
            metadataError.message
          );
        }
      }

      return {
        ...result,
        billing: {
          ...billing,
          settlement: {
            status: 'settled',
            finalCredits,
            replayed: Boolean(settlement?.replayed)
          }
        }
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise(resolve =>
          setTimeout(resolve, attempt * 250)
        );
      }
    }
  }

  const error = new Error('attachment_credit_settlement_failed');
  error.code = 'attachment_credit_settlement_failed';
  error.cause = lastError;
  error.preserveProcessedAsset = true;
  throw error;
}

async function processAttachmentJob(job) {
  try {
    const result = await baseAttachmentJobProcessor(job);
    return await settleAttachmentBilling(job, result);
  } catch (error) {
    if (
      NON_RETRYABLE_ATTACHMENT_ERRORS.has(
        String(error.code || error.message || '')
      )
    ) {
      const fatal =
        new UnrecoverableError(error.message);
      fatal.code = error.code;
      throw fatal;
    }

    throw error;
  }
}

// Deliberately NOT pinning a specific version hash here. A pinned hash
// (owner/model:64-hex-version) silently 404s the moment that exact
// version is retired/renamed on Replicate ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the previous version of
// this file had exactly that bug (a truncated SDXL hash and a
// video-model hash that didn't match any real version). Using the bare
// "owner/model" form always resolves to that model's current default
// version, which is what replicate.run()/the JS client recommends for
// anything long-running. If you need a pinned version for reproducible
// output, verify the exact hash on the model's Replicate page first.
const IMAGE_MODEL = DEFAULT_IMAGE_MODEL;
const VIDEO_MODEL = process.env.REPLICATE_VIDEO_MODEL || DEFAULT_VIDEO_MODEL;

async function processImageJob(job) {
  const {
    jobRowId,
    requestId,
    userId,
    prompt,
    creditsConsumed,
    conversationId = null,
    memoryRequestKey = null,
    imageOperation = 'generate',
    referenceAssetIds = [],
    sourceAssetId = null,
    maskAssetId = null,
    imageOptions = {}
  } = job.data;

  const imageRequest = normalizeImageRequest({
    imageOperation,
    referenceAssetIds,
    sourceAssetId,
    maskAssetId,
    imageOptions
  });
  // Defence in depth: even a manually injected queue job cannot reach a paid
  // image provider while the requested operation/options are unavailable.
  assertImageRequestAvailable(imageRequest);

  const imageRepository = getDefaultImageGenerationRepository();
  const localUtilityRepository =
    getDefaultLocalImageUtilityRepository();

  await markJob(jobRowId, {
    status: 'processing',
    started_at: new Date().toISOString()
  });

  // A settlement/database retry must not invoke the paid provider twice after
  // the canonical image already exists. Reuse the persisted job artifact.
  let persisted = await imageRepository.getExisting({ ownerId: userId, jobId: jobRowId });
  let providerResult = null;

  if (persisted && Number(imageRequest.options.quantity || 1) > 1) {
    const manifest = Array.isArray(persisted.options?.outputManifest)
      ? persisted.options.outputManifest
      : [];

    if (manifest.length !== Number(imageRequest.options.quantity)) {
      const terminal =
        new UnrecoverableError('image_output_manifest_incomplete');
      terminal.code = 'image_output_manifest_incomplete';
      throw terminal;
    }
  }

  if (!persisted) {
    const localUtilityOperations = new Set([
      'crop',
      'resize',
      'canvas',
      'layers',
      'text',
      'batch'
    ]);

    if (localUtilityOperations.has(imageRequest.operation)) {
      const inputs =
        await localUtilityRepository.loadOwnedInputs({
          ownerId: userId,
          request: imageRequest
        });

      const utilityResult =
        await executeLocalImageUtility({
          operation: imageRequest.operation,
          sourceBuffer: inputs.sourceBuffer,
          referenceBuffers: inputs.referenceBuffers,
          options: imageRequest.options
        });

      const persistedSet =
        await localUtilityRepository.persistOutputs({
          ownerId: userId,
          jobId: jobRowId,
          prompt,
          operation: imageRequest.operation,
          options: imageRequest.options,
          lineage: inputs.lineage,
          outputs: utilityResult.outputs
        });

      persisted = persistedSet.primary;

      providerResult = {
        url: persisted.providerUrl,
        urls: Object.freeze(
          persistedSet.outputs.map(
            item => item.providerUrl
          )
        ),
        provider: 'local-sharp',
        model: 'sharp@0.34.4',
        attempts: [],
        editLineage: inputs.lineage
      };
    } else {
      try {
        const executorByOperation = {
          reference_generate: 'fal-kontext',
          variations: 'fal-kontext',
          edit: 'fal-edit',
          inpaint: 'fal-inpaint',
          expand: 'fal-outpaint',
          remove_background: 'fal-background',
          relight: 'fal-relight'
        };

        const selectedExecutor =
          executorByOperation[imageRequest.operation] || null;

        const isPack063Operation =
          ['edit', 'inpaint', 'expand'].includes(
            imageRequest.operation
          );

        const isPack064ExternalOperation =
          ['remove_background', 'relight'].includes(
            imageRequest.operation
          );

        if (
          isPack063Operation &&
          String(
            process.env.PACK063_PAID_EXECUTION_ENABLED || ''
          ).toLowerCase() !== 'true'
        ) {
          const terminal =
            new UnrecoverableError(
              'pack063_paid_execution_disabled'
            );
          terminal.code =
            'pack063_paid_execution_disabled';
          throw terminal;
        }

        if (
          isPack064ExternalOperation &&
          String(
            process.env.PACK064_EXTERNAL_EXECUTION_ENABLED || ''
          ).toLowerCase() !== 'true'
        ) {
          const terminal =
            new UnrecoverableError(
              'pack064_external_execution_disabled'
            );
          terminal.code =
            'pack064_external_execution_disabled';
          throw terminal;
        }

        const resolvedImageInputs = selectedExecutor
          ? await resolveImageReferences({
              ownerId: userId,
              request: imageRequest,
              requestId: requestId || jobRowId
            })
          : null;

        const standardImageProviderOptions = Object.freeze({
          chain: ['fal', 'replicate']
        });

        providerResult = await generateImage(prompt, {
          imageRequest,
          resolvedImageInputs,
          chain: selectedExecutor
            ? [selectedExecutor]
            : standardImageProviderOptions.chain,
          models: {
            fal:
              process.env.FAL_IMAGE_MODEL ||
              DEFAULT_FAL_IMAGE_MODEL,
            'fal-kontext':
              process.env.FAL_KONTEXT_IMAGE_MODEL ||
              DEFAULT_FAL_KONTEXT_MODEL,
            'fal-edit':
              process.env.FAL_EDIT_IMAGE_MODEL ||
              DEFAULT_FAL_EDIT_MODEL,
            'fal-inpaint':
              process.env.FAL_INPAINT_IMAGE_MODEL ||
              DEFAULT_FAL_INPAINT_MODEL,
            'fal-outpaint':
              process.env.FAL_OUTPAINT_IMAGE_MODEL ||
              DEFAULT_FAL_OUTPAINT_MODEL,
            'fal-background':
              process.env.FAL_BACKGROUND_IMAGE_MODEL ||
              DEFAULT_FAL_BACKGROUND_MODEL,
            'fal-upscale':
              process.env.FAL_UPSCALE_IMAGE_MODEL ||
              DEFAULT_FAL_UPSCALE_MODEL,
            'fal-relight':
              process.env.FAL_RELIGHT_IMAGE_MODEL ||
              DEFAULT_FAL_RELIGHT_MODEL,
            replicate: IMAGE_MODEL
          },
          requestId: requestId || jobRowId
        });

        providerResult.editLineage =
          resolvedImageInputs
            ? {
                sourceAssetId:
                  resolvedImageInputs.source?.assetId || null,
                sourceContentId:
                  resolvedImageInputs.source?.contentId || null,
                sourceVersionId:
                  resolvedImageInputs.source?.versionId || null,
                maskAssetId:
                  resolvedImageInputs.mask?.assetId || null,
                maskContentId:
                  resolvedImageInputs.mask?.contentId || null,
                maskVersionId:
                  resolvedImageInputs.mask?.versionId || null
              }
            : {};
      } catch (providerError) {
        if (
          providerError &&
          providerError.retryable === false
        ) {
          const terminal =
            new UnrecoverableError(
              providerError.message
            );
          terminal.attempts =
            providerError.attempts;
          terminal.code =
            providerError.code;
          throw terminal;
        }
        throw providerError;
      }

      const providerUrls =
        providerResult.urls || [providerResult.url];

      if (providerUrls.length === 1) {
        persisted =
          await imageRepository.persistGenerated({
            ownerId: userId,
            jobId: jobRowId,
            prompt,
            providerUrl: providerUrls[0],
            provider: providerResult.provider,
            model: providerResult.model,
            operation: imageRequest.operation,
            options: imageRequest.options,
            lineage:
              providerResult.editLineage || {}
          });
      } else {
        const persistedSet =
          await imageRepository.persistGeneratedSet({
            ownerId: userId,
            jobId: jobRowId,
            prompt,
            providerUrls,
            provider: providerResult.provider,
            model: providerResult.model,
            operation: imageRequest.operation,
            options: imageRequest.options,
            lineage:
              providerResult.editLineage || {}
          });

        persisted = persistedSet.primary;
      }
    }
  }

  const provider =
    providerResult?.provider ||
    persisted?.options?.outputProvider ||
    ({
      reference_generate: 'fal-kontext',
      variations: 'fal-kontext',
      edit: 'fal-edit',
      inpaint: 'fal-inpaint',
      expand: 'fal-outpaint',
      remove_background: 'fal-background',
      relight: 'fal-relight',
      crop: 'local-sharp',
      resize: 'local-sharp',
      canvas: 'local-sharp',
      layers: 'local-sharp',
      text: 'local-sharp',
      batch: 'local-sharp'
    }[imageRequest.operation] || 'replicate');

  const model =
    providerResult?.model ||
    persisted?.options?.outputModel ||
    ({
      'fal-kontext':
        process.env.FAL_KONTEXT_IMAGE_MODEL ||
        DEFAULT_FAL_KONTEXT_MODEL,
      'fal-edit':
        process.env.FAL_EDIT_IMAGE_MODEL ||
        DEFAULT_FAL_EDIT_MODEL,
      'fal-inpaint':
        process.env.FAL_INPAINT_IMAGE_MODEL ||
        DEFAULT_FAL_INPAINT_MODEL,
      'fal-outpaint':
        process.env.FAL_OUTPAINT_IMAGE_MODEL ||
        DEFAULT_FAL_OUTPAINT_MODEL,
      'fal-background':
        process.env.FAL_BACKGROUND_IMAGE_MODEL ||
        DEFAULT_FAL_BACKGROUND_MODEL,
      'fal-upscale':
        process.env.FAL_UPSCALE_IMAGE_MODEL ||
        DEFAULT_FAL_UPSCALE_MODEL,
      'fal-relight':
        process.env.FAL_RELIGHT_IMAGE_MODEL ||
        DEFAULT_FAL_RELIGHT_MODEL,
      'local-sharp':
        'sharp@0.34.4'
    }[provider] || IMAGE_MODEL);
  const artifact = buildImageArtifact({
    url: persisted.providerUrl,
    operation: imageRequest.operation,
    provider,
    model,
    referenceAssetIds: imageRequest.referenceAssetIds,
    sourceAssetId: imageRequest.sourceAssetId,
    maskAssetId: imageRequest.maskAssetId,
    options: imageRequest.options
  });

  const finalCredits = Number(creditsConsumed);
  if (!Number.isSafeInteger(finalCredits) || finalCredits < 1) {
    const error = new Error('image_credit_settlement_invalid');
    error.code = 'image_credit_settlement_invalid';
    throw error;
  }
  await settleCredits(requestId, finalCredits);

  let memoryResult = null;
  if (conversationId) {
    try {
      memoryResult = await completeGenerationConversation({
        conversationId,
        ownerId: userId,
        feature: 'image',
        resultUrl: artifact.url,
        requestKey: memoryRequestKey || requestId || jobRowId,
        provider,
        model,
        operation: artifact.operation,
        referenceAssetIds: artifact.lineage.referenceAssetIds,
        sourceAssetId: artifact.lineage.sourceAssetId,
        maskAssetId: artifact.lineage.maskAssetId,
        imageOptions: artifact.options,
        canonicalContentId: persisted.contentId,
        canonicalAssetId: persisted.assetId
      });
    } catch (memoryError) {
      console.error('[worker-memory] image completion save failed:', memoryError.message);
    }
  }

  await markJob(jobRowId, {
    status: 'done',
    result_url: artifact.url,
    canonical_content_id: persisted.contentId,
    response_message_id: memoryResult?.assistantMessage?.id || null,
    completed_at: new Date().toISOString()
  });
}

async function processVideoJob(job) {
  const {
    jobRowId,
    requestId,
    userId,
    prompt,
    creditsConsumed,
    pricingVersion = null,
    quotedProviderCostMicroUsd = null,
    conversationId = null,
    memoryRequestKey = null,
    videoOperation = 'text_to_video',
    sourceImageAssetId = null,
    sourceVideoAssetId = null,
    startFrameAssetId = null,
    endFrameAssetId = null,
    videoOptions = {}
  } = job.data;

  const videoRequest = normalizeVideoRequest({
    prompt,
    videoOperation,
    sourceImageAssetId,
    sourceVideoAssetId,
    startFrameAssetId,
    endFrameAssetId,
    videoOptions
  });

  assertVideoRequestAvailable(videoRequest);

  await markJob(jobRowId, {
    status: 'processing',
    progress_percent: 5,
    job_stage: 'validating',
    started_at: new Date().toISOString()
  });

  const repository = getDefaultVideoGenerationRepository();
  let persisted = await repository.getExisting({
    ownerId: userId,
    jobId: jobRowId
  });
  let providerResult = null;

  if (!persisted) {
    await markJob(jobRowId, {
      progress_percent: 15,
      job_stage: 'provider'
    });
    await markJob(jobRowId, {
      progress_percent: 35,
      job_stage: 'processing'
    });

    providerResult = await generateVideo(videoRequest, {
      env: { ...process.env, REPLICATE_VIDEO_MODEL: VIDEO_MODEL }
    });

    if (
      providerResult.billableUnits?.unitType !== 'videos' ||
      providerResult.billableUnits?.units !== 1 ||
      providerResult.billableUnits?.resolution !== videoRequest.options.resolution
    ) {
      const error = new Error('video_billable_units_mismatch');
      error.code = 'video_billable_units_mismatch';
      throw error;
    }

    persisted = await repository.persistGenerated({
      ownerId: userId,
      jobId: jobRowId,
      prompt,
      providerUrl: providerResult.url,
      provider: providerResult.provider,
      model: providerResult.model,
      operation: videoRequest.operation,
      options: videoRequest.options,
      billing: {
        pricingVersion,
        quotedProviderCostMicroUsd,
        unitType: providerResult.billableUnits.unitType,
        units: providerResult.billableUnits.units,
        resolution: providerResult.billableUnits.resolution,
        providerFrames: providerResult.numFrames,
        providerFps: providerResult.fps
      }
    });
  }

  const provider =
    providerResult?.provider ||
    persisted.options?.outputProvider ||
    'replicate';
  const model =
    providerResult?.model ||
    persisted.options?.outputModel ||
    VIDEO_MODEL;

  const artifactOptions = {
    ...videoRequest.options,
    actualDurationSeconds: persisted.actualDurationSeconds,
    outputProvider: provider,
    outputModel: model,
    billing: persisted.options?.billing || null
  };

  const artifact = buildVideoArtifact({
    url: persisted.providerUrl,
    operation: videoRequest.operation,
    provider,
    model,
    sourceImageAssetId: videoRequest.sourceImageAssetId,
    sourceVideoAssetId: videoRequest.sourceVideoAssetId,
    startFrameAssetId: videoRequest.startFrameAssetId,
    endFrameAssetId: videoRequest.endFrameAssetId,
    options: artifactOptions
  });

  await markJob(jobRowId, {
    progress_percent: 90,
    job_stage: 'preview'
  });

  const finalCredits = Number(creditsConsumed);
  if (!Number.isSafeInteger(finalCredits) || finalCredits < 1) {
    const error = new Error('video_credit_settlement_invalid');
    error.code = 'video_credit_settlement_invalid';
    throw error;
  }
  await settleCredits(requestId, finalCredits);

  let memoryResult = null;
  if (conversationId) {
    try {
      memoryResult = await completeGenerationConversation({
        conversationId,
        ownerId: userId,
        feature: 'video',
        resultUrl: artifact.url,
        requestKey: memoryRequestKey || requestId || jobRowId,
        provider,
        model,
        operation: artifact.operation,
        sourceImageAssetId: artifact.lineage.sourceImageAssetId,
        sourceVideoAssetId: artifact.lineage.sourceVideoAssetId,
        startFrameAssetId: artifact.lineage.startFrameAssetId,
        endFrameAssetId: artifact.lineage.endFrameAssetId,
        videoOptions: artifact.options,
        canonicalContentId: persisted.contentId,
        canonicalAssetId: persisted.assetId
      });
    } catch (memoryError) {
      console.error(
        '[worker-memory] video completion save failed:',
        memoryError.message
      );
    }
  }

  await markJob(jobRowId, {
    status: 'done',
    result_url: artifact.url,
    canonical_content_id: persisted.contentId,
    preview_url: artifact.previewUrl,
    export_url: artifact.exportUrl,
    progress_percent: 100,
    job_stage: 'done',
    response_message_id:
      memoryResult?.assistantMessage?.id || null,
    completed_at: new Date().toISOString()
  });
}

const imageWorker = new Worker('rox-image-generation', processImageJob, {
  connection,
  concurrency: CONCURRENCY,
});

const videoWorker = new Worker('rox-video-generation', processVideoJob, {
  connection,
  concurrency: Math.max(1, Math.floor(CONCURRENCY / 2)), // video is heavier ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â fewer parallel jobs
});

const attachmentWorker = new Worker(
  'zuvyr-attachment-processing',
  processAttachmentJob,
  {
    connection,
    concurrency: ATTACHMENT_WORKER_CONCURRENCY
  }
);

async function handleAttachmentFailure(job, err) {
  const attempts = Number(job.opts.attempts || 1);
  const exhausted =
    err.name === 'UnrecoverableError' ||
    job.attemptsMade >= attempts;

  if (!exhausted) return;

  const {
    assetId,
    ownerId,
    storageBucket,
    storagePath,
    creditRequestId
  } = job.data;
  const code = String(err.code || err.message || '');
  const rejected =
    code === 'dangerous_attachment_content' ||
    code === 'blocked_attachment_type';
  const preserveProcessedAsset =
    code === 'attachment_credit_settlement_failed' ||
    err.preserveProcessedAsset === true;

  if (!preserveProcessedAsset) {
    try {
      await conversationMemory.updateAssetProcessing({
        assetId,
        ownerId,
        scanStatus: rejected ? 'rejected' : 'failed',
        extractionStatus: 'failed'
      });
    } catch (stateError) {
      console.error(
        '[attachment-worker] failure state save failed:',
        stateError.message
      );
    }
  }

  if (
    !preserveProcessedAsset &&
    rejected &&
    storageBucket &&
    storagePath
  ) {
    await supabaseAdmin.storage
      .from(storageBucket)
      .remove([storagePath])
      .catch(() => null);
  }

  try {
    await refundCredits(creditRequestId);
    recordRefund('chat');
  } catch (refundErr) {
    await reportRefundFailure({
      requestId: creditRequestId,
      userId: ownerId,
      feature: 'chat',
      error: refundErr
    });
  }

  await logCreditEvent({
    userId: ownerId,
    feature: 'chat',
    status: 'error',
    requestId: creditRequestId + ':detail',
    errorMessage: err.message
  });
}

// ---------- Failure handling: refund only once retries are exhausted ----------
async function handleJobFailure(job, err, feature) {
  const {
    jobRowId,
    userId,
    requestId,
    conversationId = null,
    memoryRequestKey = null
  } = job.data;

  const attemptsMade = job.attemptsMade;
  const maxAttempts = job.opts.attempts;

  const exhausted =
    isGenerationFailureExhausted({
      error: err,
      attemptsMade,
      maxAttempts
    });

  if (!exhausted) {
    // BullMQ will retry automatically. Do not save failure or refund yet.
    return;
  }

  let failureMessage = null;

  if (conversationId) {
    try {
      failureMessage = await failGenerationConversation({
        conversationId,
        ownerId: userId,
        feature,
        errorMessage: err.message,
        requestKey: memoryRequestKey || requestId || jobRowId
      });
    } catch (memoryError) {
      console.error(
        `[worker-memory] ${feature} failure save failed:`,
        memoryError.message
      );
    }
  }

  await markJob(jobRowId, {
    status: 'failed',
    ...(feature === 'video' ? {
      progress_percent: 0,
      job_stage: 'failed'
    } : {}),
    error_message: err.message,
    response_message_id: failureMessage?.id || null,
    completed_at: new Date().toISOString()
  });

  try {
    await refundCredits(requestId);
    recordRefund(feature);
  } catch (refundErr) {
    await reportRefundFailure({
      requestId,
      userId,
      feature,
      error: refundErr
    });
  }

  await logCreditEvent({
    userId,
    feature,
    status: 'error',
    requestId: `${requestId}:detail`,
    errorMessage: err.message
  });

  console.error(
    `[worker] job ${job.id} (${feature}) exhausted retries, refunded:`,
    err.message,
    err.attempts ? JSON.stringify(err.attempts) : ''
  );
}

imageWorker.on('failed', (job, err) => handleJobFailure(job, err, 'image'));
videoWorker.on('failed', (job, err) => handleJobFailure(job, err, 'video'));
attachmentWorker.on('failed', (job, err) =>
  handleAttachmentFailure(job, err)
);

const brainKernelWorker =
  startBrainKernelWorker({
    connection,
    concurrency: 1
  });

brainKernelWorker.on('failed', (job, error) => {
  console.error(
    '[brain-kernel-worker] failed:',
    job && job.id,
    error && (error.code || error.message)
  );
});

console.log(`ROX AI worker running (concurrency: image=${CONCURRENCY}, video=${Math.max(1, Math.floor(CONCURRENCY / 2))}, attachment=${ATTACHMENT_WORKER_CONCURRENCY})`);
