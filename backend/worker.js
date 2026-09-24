// ZUVYR ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Worker (hardened)
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
const { createVideoReferenceResolver } = require('./lib/videoReferenceResolver');
const { createAudioInputResolver } = require('./lib/audioReferenceResolver');
const {
  generateVideo,
  DEFAULT_VIDEO_MODEL,
  defaultModelForOperation,
  providerForOperation,
  lipSyncBillingIncrements,
  roundedMinuteBillingUnits
} = require('./lib/videoProvider');
const { normalizeVideoRequest } = require('./lib/videoRequestContract');
const { assertVideoRequestAvailable } = require('./lib/videoOperationRegistry');
const { buildVideoArtifact } = require('./lib/videoArtifactContract');
const { getDefaultVideoGenerationRepository } = require('./lib/videoGenerationRepository');
const { getDefaultVideoDerivedRepository } = require('./lib/videoDerivedRepository');
const { executeLocalVideoExport } = require('./lib/localVideoExport');
const { buildSubtitleArtifacts } = require('./lib/videoSubtitleArtifacts');
const { normalizeAudioRequest } = require('./lib/audioRequestContract');
const { assertAudioOperationAvailable } = require('./lib/audioOperationRegistry');
const {
  transcribeAudio,
  synthesizeSpeech,
  serializeTtsProviderResult,
  restoreTtsProviderResult,
  DEEPGRAM_MODEL,
  TTS_DEFAULT_MODEL
} = require('./lib/audioProvider');
const { executeLocalAudioCleanup } = require('./lib/localAudioCleanup');
const {
  MODELS: PACK074_AUDIO_MODELS,
  generatePack074Audio,
  serializeProviderResult: serializePack074ProviderResult,
  restoreProviderResult: restorePack074ProviderResult
} = require('./lib/audioFalProvider');
const { getDefaultAudioResultRepository } = require('./lib/audioResultRepository');
const { normalizeModel3dRequest } = require('./lib/model3dRequestContract');
const { createModel3dInputResolver } = require('./lib/model3dInputResolver');
const {
  MODELS: MODEL3D_MODELS,
  submitModel3d,
  fetchModel3dResult,
  serializeProviderResult: serializeModel3dProviderResult,
  restoreProviderResult: restoreModel3dProviderResult
} = require('./lib/model3dProvider');
const {
  createModel3dGenerationRepository
} = require('./lib/model3dGenerationRepository');
const { assertModel3dLiveAvailable } = require('./lib/model3dPolicy');
const { connection } = require('./lib/queue');
const { startBrainKernelWorker } = require('./lib/brainKernelWorker');
const { startAutomationScheduler } = require('./lib/automationScheduler');
const { startAutomationExecutionWorker } = require('./lib/automationExecutionWorker');
const { supabaseAdmin } = require('./lib/supabaseAdmin');
const resolveImageReferences = createImageReferenceResolver({
  db: supabaseAdmin,
  storage: supabaseAdmin.storage
});
const resolveVideoReferences = createVideoReferenceResolver({
  db: supabaseAdmin,
  storage: supabaseAdmin.storage
});
const audioInputResolver = createAudioInputResolver({
  db: supabaseAdmin,
  storage: supabaseAdmin.storage
});
const model3dInputResolver = createModel3dInputResolver({
  db: supabaseAdmin,
  storage: supabaseAdmin.storage
});
const model3dRepository = createModel3dGenerationRepository({
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

async function videoJobRpc(name, args) {
  const result = await supabaseAdmin.rpc(name, args);
  if (result.error) {
    const error = new Error(name + '_failed');
    error.code = name + '_failed';
    error.cause = result.error;
    throw error;
  }
  return result.data && typeof result.data === 'object'
    ? result.data
    : {};
}

async function beginVideoJob({ ownerId, jobId }) {
  return videoJobRpc('begin_zuvyr_video_job', {
    p_owner_id: ownerId,
    p_job_id: jobId
  });
}

async function claimVideoExecution({ ownerId, jobId, stage }) {
  return videoJobRpc('claim_zuvyr_video_execution', {
    p_owner_id: ownerId,
    p_job_id: jobId,
    p_stage: stage
  });
}

async function videoJobState({ ownerId, jobId }) {
  const result = await supabaseAdmin
    .from('generation_jobs')
    .select('status,job_stage,cancel_requested,result_url,video_options,canonical_content_id')
    .eq('id', jobId)
    .eq('user_id', ownerId)
    .eq('feature', 'video')
    .maybeSingle();
  if (result.error) {
    const error = new Error('video_job_state_lookup_failed');
    error.code = 'video_job_state_lookup_failed';
    error.cause = result.error;
    throw error;
  }
  return result.data || null;
}

async function refundCancelledVideo({ requestId, userId }) {
  try {
    await refundCredits(requestId);
    recordRefund('video');
  } catch (refundErr) {
    await reportRefundFailure({
      requestId,
      userId,
      feature: 'video',
      error: refundErr
    });
  }
}

async function assertVideoCommitAllowed({ ownerId, jobId }) {
  const state = await videoJobState({ ownerId, jobId });
  if (
    !state ||
    state.cancel_requested === true ||
    state.status !== 'processing' ||
    !['provider','processing','preview','export'].includes(state.job_stage)
  ) {
    const error = new UnrecoverableError('video_late_result_ignored');
    error.code = 'video_late_result_ignored';
    error.preserveTerminalState = true;
    error.terminalState = state?.status || null;
    throw error;
  }
  return state;
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
    referenceImageAssetIds = [],
    sourceImageAssetId = null,
    sourceVideoAssetId = null,
    sourceAudioAssetId = null,
    startFrameAssetId = null,
    endFrameAssetId = null,
    videoOptions = {}
  } = job.data;

  const videoRequest = normalizeVideoRequest({
    prompt,
    videoOperation,
    referenceImageAssetIds,
    sourceImageAssetId,
    sourceVideoAssetId,
    sourceAudioAssetId,
    startFrameAssetId,
    endFrameAssetId,
    videoOptions
  });

  assertVideoRequestAvailable(videoRequest);

  const begin = await beginVideoJob({
    ownerId: userId,
    jobId: jobRowId
  });
  if (begin.claimed !== true) {
    if (begin.status === 'cancelled' || begin.cancelRequested === true) {
      await refundCancelledVideo({ requestId, userId });
      return { status: 'cancelled' };
    }
    if (begin.status === 'done') return { status: 'done', replayed: true };
    const error = new UnrecoverableError('video_job_not_executable');
    error.code = 'video_job_not_executable';
    error.preserveTerminalState = true;
    throw error;
  }

  const pack069 = ['subtitles','dub','enhance','export'].includes(
    videoRequest.operation
  );
  const repository = pack069
    ? getDefaultVideoDerivedRepository()
    : getDefaultVideoGenerationRepository();

  let persisted = await repository.getExisting({
    ownerId: userId,
    jobId: jobRowId,
    requestId
  });
  let providerResult = null;
  let resolvedInputs = null;
  let subtitleAssets = persisted?.subtitleAssets || [];

  if (!persisted) {
    if (videoRequest.operation !== 'text_to_video') {
      resolvedInputs = await resolveVideoReferences({
        ownerId: userId,
        request: videoRequest,
        requestId
      });
    }

    if (videoRequest.operation === 'export') {
      const claim = await claimVideoExecution({
        ownerId: userId,
        jobId: jobRowId,
        stage: 'processing'
      });
      if (claim.claimed !== true) {
        if (claim.status === 'cancelled' || claim.cancelRequested === true) {
          await refundCancelledVideo({ requestId, userId });
          return { status: 'cancelled' };
        }
        const error = new UnrecoverableError('video_job_not_executable');
        error.code = 'video_job_not_executable';
        error.preserveTerminalState = true;
        throw error;
      }

      const localResult = await executeLocalVideoExport({
        sourceUrl: resolvedInputs.source.url,
        sourceMimeType: resolvedInputs.source.mimeType,
        format: videoRequest.options.exportFormat
      });

      await assertVideoCommitAllowed({ ownerId: userId, jobId: jobRowId });
      await markJob(jobRowId, {
        progress_percent: 80,
        job_stage: 'preview'
      });

      persisted = await repository.persistBuffer({
        ownerId: userId,
        jobId: jobRowId,
        operation: 'export',
        format: videoRequest.options.exportFormat,
        buffer: localResult.buffer,
        provider: localResult.provider,
        model: localResult.model,
        providerUrl: null,
        options: {
          ...videoRequest.options,
          actualDurationSeconds: localResult.actualDurationSeconds,
          billing: {
            pricingVersion,
            quotedProviderCostMicroUsd,
            unitType: 'processing_operations',
            units: 1
          }
        },
        providerMetadata: { providerCalls: 0 },
        sourceLineage: resolvedInputs.lineage || {}
      });
    } else {
      const claim = await claimVideoExecution({
        ownerId: userId,
        jobId: jobRowId,
        stage: 'provider'
      });
      if (claim.claimed !== true) {
        if (claim.status === 'cancelled' || claim.cancelRequested === true) {
          await refundCancelledVideo({ requestId, userId });
          return { status: 'cancelled' };
        }
        const error = new UnrecoverableError('video_job_not_executable');
        error.code = 'video_job_not_executable';
        error.preserveTerminalState = true;
        throw error;
      }

      const recovery = pack069
        ? await videoJobState({ ownerId: userId, jobId: jobRowId })
        : null;
      const recoveryOptions =
        recovery?.video_options && typeof recovery.video_options === 'object'
          ? recovery.video_options
          : {};
      const recoverableProviderUrl =
        pack069 &&
        recovery?.result_url &&
        recoveryOptions.pack069ProviderOutputReady === true
          ? recovery.result_url
          : null;

      if (recoverableProviderUrl) {
        providerResult = {
          url: recoverableProviderUrl,
          provider:
            recoveryOptions.outputProvider ||
            providerForOperation(videoRequest.operation),
          model:
            recoveryOptions.outputModel ||
            defaultModelForOperation(videoRequest.operation),
          providerMetadata:
            recoveryOptions.pack069ProviderMetadata || {},
          billableUnits:
            recoveryOptions.pack069BillableUnits || null,
          numFrames: null,
          fps: null,
          recovered: true
        };
      } else {
        await markJob(jobRowId, {
          progress_percent: 35,
          job_stage: 'provider'
        });

        providerResult = await generateVideo(videoRequest, {
          env: { ...process.env, REPLICATE_VIDEO_MODEL: VIDEO_MODEL },
          resolvedInputs: resolvedInputs || {}
        });
      }

      const sourceDuration =
        Number(resolvedInputs?.source?.durationSeconds || 0);
      const expectedBilling = (() => {
        if (['text_to_video','image_to_video'].includes(videoRequest.operation)) {
          return { unitType: 'videos', units: 1 };
        }
        if (
          ['reference_to_video','edit','extend'].includes(videoRequest.operation)
        ) {
          return {
            unitType: 'video_seconds',
            units: Number(videoRequest.options.durationSeconds)
          };
        }
        if (
          ['object_remove','background_remove','relight','recamera','subtitles','enhance']
            .includes(videoRequest.operation)
        ) {
          return { unitType: 'video_seconds', units: sourceDuration };
        }
        if (videoRequest.operation === 'lip_sync') {
          return {
            unitType: 'processing_operations',
            units: lipSyncBillingIncrements(sourceDuration)
          };
        }
        if (videoRequest.operation === 'dub') {
          return {
            unitType: 'processing_operations',
            units: roundedMinuteBillingUnits(sourceDuration)
          };
        }
        return null;
      })();

      if (
        !expectedBilling ||
        providerResult.billableUnits?.unitType !== expectedBilling.unitType ||
        providerResult.billableUnits?.units !== expectedBilling.units
      ) {
        const error = new Error('video_billable_units_mismatch');
        error.code = 'video_billable_units_mismatch';
        throw error;
      }

      if (pack069 && !recoverableProviderUrl) {
        await markJob(jobRowId, {
          result_url: providerResult.url,
          progress_percent: 70,
          job_stage: 'preview',
          video_options: {
            ...videoRequest.options,
            outputProvider: providerResult.provider,
            outputModel: providerResult.model,
            pack069ProviderOutputReady: true,
            pack069ProviderMetadata: providerResult.providerMetadata || {},
            pack069BillableUnits: providerResult.billableUnits || null
          }
        });
      }

      await assertVideoCommitAllowed({ ownerId: userId, jobId: jobRowId });

      if (pack069) {
        persisted = await repository.persistRemote({
          ownerId: userId,
          jobId: jobRowId,
          operation: videoRequest.operation,
          format: videoRequest.options.exportFormat,
          providerUrl: providerResult.url,
          provider: providerResult.provider,
          model: providerResult.model,
          options: {
            ...videoRequest.options,
            billing: {
              pricingVersion,
              quotedProviderCostMicroUsd,
              unitType: providerResult.billableUnits.unitType,
              units: providerResult.billableUnits.units
            }
          },
          providerMetadata: providerResult.providerMetadata || {},
          sourceLineage: resolvedInputs?.lineage || {}
        });

        if (videoRequest.operation === 'subtitles') {
          const built = buildSubtitleArtifacts(
            {
              ...(providerResult.providerMetadata || {}),
              wordsPerSubtitle: videoRequest.options.wordsPerSubtitle
            },
            videoRequest.options.subtitleFormats
          );
          subtitleAssets = await repository.persistSubtitleArtifacts({
            ownerId: userId,
            jobId: jobRowId,
            video: persisted,
            artifacts: built.artifacts
          });
          await markJob(jobRowId, {
            video_options: {
              ...persisted.options,
              transcript: built.evidence.transcription,
              subtitleArtifacts: subtitleAssets.map(item => ({
                assetId: item.assetId,
                format: item.format,
                mimeType: item.mimeType,
                fileSizeBytes: item.fileSizeBytes
              }))
            }
          });
        }
      } else {
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
          },
          lineage: resolvedInputs?.lineage || {}
        });
      }
    }
  }

  const provider =
    providerResult?.provider ||
    persisted.options?.outputProvider ||
    providerForOperation(videoRequest.operation);
  const fallbackModel =
    videoRequest.operation === 'text_to_video'
      ? VIDEO_MODEL
      : defaultModelForOperation(videoRequest.operation);
  const model =
    providerResult?.model ||
    persisted.options?.outputModel ||
    fallbackModel;

  const artifactOptions = {
    ...videoRequest.options,
    actualDurationSeconds: persisted.actualDurationSeconds,
    outputProvider: provider,
    outputModel: model,
    billing: persisted.options?.billing || null,
    canonicalLineage: persisted.options?.canonicalLineage || null,
    ...(subtitleAssets.length ? {
      subtitleArtifacts: subtitleAssets.map(item => ({
        assetId: item.assetId,
        format: item.format,
        mimeType: item.mimeType,
        fileSizeBytes: item.fileSizeBytes
      }))
    } : {})
  };

  const artifact = buildVideoArtifact({
    url: persisted.downloadUrl || persisted.providerUrl,
    previewUrl: persisted.downloadUrl || persisted.providerUrl,
    exportUrl:
      videoRequest.operation === 'export'
        ? (persisted.downloadUrl || persisted.providerUrl)
        : null,
    operation: videoRequest.operation,
    provider,
    model,
    sourceImageAssetId: videoRequest.sourceImageAssetId,
    sourceVideoAssetId: videoRequest.sourceVideoAssetId,
    sourceAudioAssetId: videoRequest.sourceAudioAssetId,
    startFrameAssetId: videoRequest.startFrameAssetId,
    endFrameAssetId: videoRequest.endFrameAssetId,
    referenceImageAssetIds: videoRequest.referenceImageAssetIds,
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
        sourceAudioAssetId: artifact.lineage.sourceAudioAssetId,
        startFrameAssetId: artifact.lineage.startFrameAssetId,
        endFrameAssetId: artifact.lineage.endFrameAssetId,
        referenceImageAssetIds: artifact.lineage.referenceImageAssetIds,
        videoOptions: artifact.options,
        durationSeconds: persisted.actualDurationSeconds,
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
    ...(pack069 ? {} : { result_url: artifact.url }),
    canonical_content_id: persisted.contentId,
    preview_url: pack069 ? null : artifact.previewUrl,
    export_url: pack069 ? null : artifact.exportUrl,
    progress_percent: 100,
    job_stage: 'done',
    response_message_id:
      memoryResult?.assistantMessage?.id || null,
    completed_at: new Date().toISOString()
  });

  return {
    status: 'done',
    operation: videoRequest.operation,
    canonicalAssetId: persisted.assetId,
    subtitleAssetCount: subtitleAssets.length
  };
}

async function model3dRpc(name, args) {
  const result = await supabaseAdmin.rpc(name, args);
  if (result.error) {
    const error = new Error(name + '_failed');
    error.code = name + '_failed';
    error.cause = result.error;
    throw error;
  }
  return result.data && typeof result.data === 'object'
    ? result.data
    : {};
}

async function model3dJobState({ ownerId, jobId }) {
  const result = await supabaseAdmin
    .from('generation_jobs')
    .select(
      'id,status,job_stage,cancel_requested,canonical_content_id,' +
      'model3d_operation,model3d_options,model3d_input_views,' +
      'model3d_execution_claimed_at,model3d_submission_started_at,' +
      'model3d_provider_request_id,model3d_provider_result,model3d_output_manifest'
    )
    .eq('id', jobId)
    .eq('user_id', ownerId)
    .eq('feature', '3d')
    .maybeSingle();
  if (result.error) {
    const error = new Error('model3d_job_state_lookup_failed');
    error.code = 'model3d_job_state_lookup_failed';
    error.cause = result.error;
    throw error;
  }
  return result.data || null;
}

async function refundModel3d({ requestId, userId }) {
  try {
    await refundCredits(requestId);
    recordRefund('3d');
  } catch (refundErr) {
    await reportRefundFailure({
      requestId,
      userId,
      feature: '3d',
      error: refundErr
    });
  }
}

async function processModel3dJob(job) {
  const {
    jobRowId,
    requestId,
    userId,
    originalPrompt = '',
    creditsConsumed,
    pricingVersion = null,
    quotedProviderCostMicroUsd = null,
    model3dOperation = 'text_to_3d',
    model3dViews = {},
    model3dOptions = {}
  } = job.data;

  const request = normalizeModel3dRequest({
    prompt: originalPrompt,
    model3dOperation,
    model3dViews,
    model3dOptions
  });

  let state = await model3dJobState({
    ownerId: userId,
    jobId: jobRowId
  });
  if (!state) {
    const error = new UnrecoverableError('pack083_model3d_job_not_found');
    error.code = 'pack083_model3d_job_not_found';
    throw error;
  }
  if (state.status === 'done') {
    return { status: 'done', replayed: true };
  }
  if (state.status === 'cancelled') {
    await refundModel3d({ requestId, userId });
    return { status: 'cancelled', replayed: true };
  }

  const claim = await model3dRpc(
    'claim_zuvyr_model3d_execution_pack083',
    { p_job_id: jobRowId, p_owner_id: userId }
  );
  if (claim.terminal === true) {
    if (claim.status === 'cancelled') {
      await refundModel3d({ requestId, userId });
      return { status: 'cancelled' };
    }
    if (claim.status === 'done') {
      return { status: 'done', replayed: true };
    }
    const error = new UnrecoverableError(
      'pack083_model3d_job_terminal_' + String(claim.status || 'unknown')
    );
    error.code = 'pack083_model3d_job_terminal';
    throw error;
  }

  state = await model3dJobState({
    ownerId: userId,
    jobId: jobRowId
  });

  // If canonical persistence completed on a previous attempt, only billing and
  // the final job state remain. Never call the provider again.
  const existing = await model3dRepository.getExisting({
    ownerId: userId,
    jobId: jobRowId
  });
  if (existing) {
    const finalCredits = Number(creditsConsumed);
    if (!Number.isSafeInteger(finalCredits) || finalCredits < 1) {
      const error = new UnrecoverableError('model3d_credit_settlement_invalid');
      error.code = 'model3d_credit_settlement_invalid';
      throw error;
    }
    await settleCredits(requestId, finalCredits);
    await markJob(jobRowId, {
      status: 'done',
      job_stage: 'done',
      progress_percent: 100,
      result_url: null,
      preview_url: null,
      export_url: null,
      completed_at: new Date().toISOString()
    });
    return {
      status: 'done',
      replayed: true,
      canonicalContentId: existing.contentId
    };
  }

  const inspected =
    request.operation === 'text_to_3d'
      ? { views: {}, lineage: {} }
      : await model3dInputResolver.inspect({
          ownerId: userId,
          request
        });

  let providerResult =
    restoreModel3dProviderResult(state?.model3d_provider_result);

  if (!providerResult) {
    let providerRequestId =
      String(state?.model3d_provider_request_id || '').trim();

    if (!providerRequestId) {
      if (state?.model3d_submission_started_at) {
        // We cannot prove whether the paid provider accepted the previous
        // request. Never resubmit blindly; fail/refund and reconcile provider
        // evidence out-of-band instead of risking a duplicate charge.
        const error = new UnrecoverableError(
          'pack083_model3d_submission_outcome_uncertain'
        );
        error.code = 'pack083_model3d_submission_outcome_uncertain';
        throw error;
      }

      // Defence in depth for manually injected queue jobs.
      assertModel3dLiveAvailable(process.env);

      await model3dRpc(
        'mark_zuvyr_model3d_submission_started_pack083',
        { p_job_id: jobRowId, p_owner_id: userId }
      );

      const resolved =
        request.operation === 'text_to_3d'
          ? { views: {}, lineage: {} }
          : await model3dInputResolver.resolve({
              ownerId: userId,
              request,
              requestId
            });

      const submitted = await submitModel3d(request, {
        resolvedInputs: resolved
      });
      providerRequestId = submitted.providerRequestId;

      await model3dRpc(
        'record_zuvyr_model3d_provider_request_pack083',
        {
          p_job_id: jobRowId,
          p_owner_id: userId,
          p_provider_request_id: providerRequestId
        }
      );
    }

    providerResult = await fetchModel3dResult({
      operation: request.operation,
      providerRequestId
    });

    await model3dRpc(
      'record_zuvyr_model3d_provider_result_pack083',
      {
        p_job_id: jobRowId,
        p_owner_id: userId,
        p_result: serializeModel3dProviderResult(providerResult)
      }
    );
  }

  state = await model3dJobState({
    ownerId: userId,
    jobId: jobRowId
  });
  if (!state || state.status !== 'processing') {
    const error = new UnrecoverableError('model3d_late_result_ignored');
    error.code = 'model3d_late_result_ignored';
    error.preserveTerminalState = true;
    error.terminalState = state?.status || null;
    throw error;
  }

  await markJob(jobRowId, {
    job_stage: 'processing',
    progress_percent: 70
  });

  const model =
    providerResult.model ||
    MODEL3D_MODELS[request.operation];
  const persisted = await model3dRepository.persistProviderResult({
    ownerId: userId,
    jobId: jobRowId,
    providerResult,
    provider: providerResult.provider || 'fal',
    model,
    request,
    lineage: inspected.lineage || {}
  });

  const finalCredits = Number(creditsConsumed);
  if (!Number.isSafeInteger(finalCredits) || finalCredits < 1) {
    const error = new UnrecoverableError('model3d_credit_settlement_invalid');
    error.code = 'model3d_credit_settlement_invalid';
    throw error;
  }

  await markJob(jobRowId, {
    job_stage: 'processing',
    progress_percent: 90
  });
  await settleCredits(requestId, finalCredits);

  await markJob(jobRowId, {
    status: 'done',
    job_stage: 'done',
    progress_percent: 100,
    canonical_content_id: persisted.contentId,
    result_url: null,
    preview_url: null,
    export_url: null,
    completed_at: new Date().toISOString()
  });

  await logCreditEvent({
    userId,
    feature: '3d',
    status: 'success',
    requestId: requestId + ':detail',
    modelUsed: model,
    metadata: {
      operation: request.operation,
      provider: providerResult.provider || 'fal',
      pricingVersion,
      quotedProviderCostMicroUsd,
      canonicalContentId: persisted.contentId,
      outputRoles: persisted.manifest.map(item => item.role)
    }
  }).catch(() => null);

  return {
    status: 'done',
    operation: request.operation,
    canonicalContentId: persisted.contentId,
    outputCount: persisted.manifest.length
  };
}

async function audioJobRpc(name, args) {
  const result = await supabaseAdmin.rpc(name, args);
  if (result.error) {
    const error = new Error(name + '_failed');
    error.code = name + '_failed';
    error.cause = result.error;
    throw error;
  }
  return result.data && typeof result.data === 'object' ? result.data : {};
}

async function markAudioJob(jobId, ownerId, patch) {
  const result = await supabaseAdmin
    .from('audio_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('owner_id', ownerId);
  if (result.error) {
    const error = new Error('audio_job_update_failed');
    error.code = 'audio_job_update_failed';
    error.cause = result.error;
    throw error;
  }
}

async function refundAudio({ requestId, userId }) {
  try {
    await refundCredits(requestId);
    recordRefund('audio');
  } catch (error) {
    await reportRefundFailure({
      requestId,
      userId,
      feature: 'audio',
      error
    });
  }
}

async function audioJobState({ ownerId, jobId }) {
  const result = await supabaseAdmin
    .from('audio_jobs')
    .select('status,stage,cancel_requested,provider_result,canonical_content_id,canonical_asset_id')
    .eq('id', jobId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (result.error) {
    const error = new Error('audio_job_state_lookup_failed');
    error.code = 'audio_job_state_lookup_failed';
    error.cause = result.error;
    throw error;
  }
  return result.data || null;
}

async function assertAudioCommitAllowed({ ownerId, jobId }) {
  const state = await audioJobState({ ownerId, jobId });
  if (
    !state ||
    state.cancel_requested === true ||
    state.status !== 'processing' ||
    !['provider','processing'].includes(state.stage)
  ) {
    const error = new UnrecoverableError('audio_late_result_ignored');
    error.code = 'audio_late_result_ignored';
    error.preserveTerminalState = true;
    error.terminalState = state?.status || null;
    throw error;
  }
  return state;
}

async function processAudioJob(job) {
  const {
    jobRowId,
    requestId,
    userId,
    request: rawRequest,
    creditsConsumed
  } = job.data;

  const request = normalizeAudioRequest(rawRequest);
  assertAudioOperationAvailable(request.operation);

  const begin = await audioJobRpc('begin_zuvyr_audio_job', {
    p_owner_id: userId,
    p_job_id: jobRowId
  });

  if (begin.claimed !== true) {
    if (begin.status === 'cancelled' || begin.cancelRequested === true) {
      await refundAudio({ requestId, userId });
      return { status: 'cancelled' };
    }
    if (begin.status === 'done') return { status: 'done', replayed: true };
    const error = new UnrecoverableError('audio_job_not_executable');
    error.code = 'audio_job_not_executable';
    throw error;
  }

  const noSourceOperation = ['text_to_speech','music_generation','sound_effects'].includes(request.operation);
  const resolved = noSourceOperation
    ? { source: null, lineage: {} }
    : request.operation === 'audio_to_video'
      ? await resolveVideoReferences({
          ownerId:userId,
          request:{
            operation:'lip_sync',
            sourceVideoAssetId:request.sourceVideoAssetId,
            sourceAudioAssetId:request.sourceAudioAssetId
          },
          requestId
        })
      : await audioInputResolver.resolve({
          ownerId: userId,
          request,
          requestId
        });
  const source = request.operation === 'audio_to_video'
    ? resolved.audio
    : resolved.source;
  const repository = getDefaultAudioResultRepository();
  const existing = await repository.getExisting({
    ownerId: userId,
    jobId: jobRowId
  });

  let persisted;
  let provider;
  let model;

  if (existing?.canonical === true) {
    const claim = await audioJobRpc('claim_zuvyr_audio_execution', {
      p_owner_id: userId,
      p_job_id: jobRowId,
      p_stage: 'processing'
    });
    if (claim.claimed !== true) {
      if (claim.status === 'cancelled' || claim.cancelRequested === true) {
        await refundAudio({ requestId, userId });
        return { status: 'cancelled' };
      }
      throw new UnrecoverableError('audio_job_not_executable');
    }
    persisted = existing;
    provider = existing.provider || (
      ['transcription','text_to_speech'].includes(request.operation)
        ? 'deepgram'
        : ['music_generation','sound_effects','remix','stem_separation','translate_dub','audio_to_video'].includes(request.operation)
          ? 'fal'
          : 'local'
    );
    model = existing.model || (
      request.operation === 'transcription'
        ? DEEPGRAM_MODEL
        : request.operation === 'text_to_speech'
          ? TTS_DEFAULT_MODEL
          : PACK074_AUDIO_MODELS[request.operation] || 'ffmpeg-alpine'
    );
  } else if (request.operation === 'transcription') {
    const claim = await audioJobRpc('claim_zuvyr_audio_execution', {
      p_owner_id: userId,
      p_job_id: jobRowId,
      p_stage: 'provider'
    });
    if (claim.claimed !== true) {
      if (claim.status === 'cancelled' || claim.cancelRequested === true) {
        await refundAudio({ requestId, userId });
        return { status: 'cancelled' };
      }
      throw new UnrecoverableError('audio_job_not_executable');
    }

    await markAudioJob(jobRowId, userId, {
      progress_percent: 35,
      stage: 'provider',
      provider: 'deepgram',
      model: DEEPGRAM_MODEL
    });

    const result = existing?.providerResult || await transcribeAudio(request, { source });
    if (!existing?.providerResult) {
      await markAudioJob(jobRowId, userId, {
        provider_result: result,
        progress_percent: 60
      });
    }
    persisted = await repository.persistTranscript({
      ownerId: userId,
      jobId: jobRowId,
      result,
      source,
      provider: 'deepgram',
      model: DEEPGRAM_MODEL
    });
    provider = 'deepgram';
    model = DEEPGRAM_MODEL;
  } else if (request.operation === 'text_to_speech') {
    const claim = await audioJobRpc('claim_zuvyr_audio_execution', {
      p_owner_id: userId,
      p_job_id: jobRowId,
      p_stage: 'provider'
    });
    if (claim.claimed !== true) {
      if (claim.status === 'cancelled' || claim.cancelRequested === true) {
        await refundAudio({ requestId, userId });
        return { status: 'cancelled' };
      }
      throw new UnrecoverableError('audio_job_not_executable');
    }

    await markAudioJob(jobRowId, userId, {
      progress_percent: 35,
      stage: 'provider',
      provider: 'deepgram',
      model: request.voiceId || TTS_DEFAULT_MODEL
    });

    let result = restoreTtsProviderResult(existing?.providerResult);
    if (!result) {
      result = await synthesizeSpeech(request);
      await markAudioJob(jobRowId, userId, {
        provider_result: serializeTtsProviderResult(result),
        progress_percent: 60,
        provider: result.provider,
        model: result.model
      });
    }

    persisted = await repository.persistSynthesizedAudio({
      ownerId: userId,
      jobId: jobRowId,
      text: request.text,
      buffer: result.buffer,
      mimeType: result.mimeType,
      format: result.format,
      provider: result.provider,
      model: result.model,
      characterCount: result.characterCount,
      providerMetadata: result.metadata
    });
    provider = result.provider;
    model = result.model;
  } else if (request.operation === 'audio_cleanup') {
    const claim = await audioJobRpc('claim_zuvyr_audio_execution', {
      p_owner_id: userId,
      p_job_id: jobRowId,
      p_stage: 'processing'
    });
    if (claim.claimed !== true) {
      if (claim.status === 'cancelled' || claim.cancelRequested === true) {
        await refundAudio({ requestId, userId });
        return { status: 'cancelled' };
      }
      throw new UnrecoverableError('audio_job_not_executable');
    }

    await markAudioJob(jobRowId, userId, {
      progress_percent: 40,
      stage: 'processing',
      provider: 'local',
      model: 'ffmpeg-alpine'
    });

    const cleaned = await executeLocalAudioCleanup({
      sourceUrl: source.url,
      format: request.options.cleanupFormat,
      strength: request.options.cleanupStrength
    });
    persisted = await repository.persistCleanedAudio({
      ownerId: userId,
      jobId: jobRowId,
      buffer: cleaned.buffer,
      mimeType: cleaned.mimeType,
      format: cleaned.format,
      strength: request.options.cleanupStrength,
      source
    });
    provider = 'local';
    model = 'ffmpeg-alpine';
  } else if (['music_generation','sound_effects','remix','stem_separation','audio_to_video'].includes(request.operation)) {
    const claim = await audioJobRpc('claim_zuvyr_audio_execution', {
      p_owner_id:userId,
      p_job_id:jobRowId,
      p_stage:'provider'
    });
    if (claim.claimed !== true) {
      if (claim.status === 'cancelled' || claim.cancelRequested === true) {
        await refundAudio({ requestId, userId });
        return { status:'cancelled' };
      }
      const error = new UnrecoverableError('audio_job_not_executable');
      error.code = 'audio_job_not_executable';
      throw error;
    }

    const expectedModel = PACK074_AUDIO_MODELS[request.operation];
    await markAudioJob(jobRowId,userId,{
      progress_percent:35,
      stage:'provider',
      provider:'fal',
      model:expectedModel
    });

    let result = restorePack074ProviderResult(existing?.providerResult);
    if (!result) {
      result = await generatePack074Audio(request,{ resolvedInputs:resolved });
      await assertAudioCommitAllowed({ ownerId:userId, jobId:jobRowId });
      await markAudioJob(jobRowId,userId,{
        provider_result:serializePack074ProviderResult(result),
        progress_percent:60,
        provider:result.provider,
        model:result.model
      });
    } else {
      await assertAudioCommitAllowed({ ownerId:userId, jobId:jobRowId });
    }

    const sources = request.operation === 'audio_to_video'
      ? [resolved.source,resolved.audio].filter(Boolean)
      : resolved.source
        ? [resolved.source]
        : [];

    persisted = await repository.persistPack074Artifacts({
      ownerId:userId,
      jobId:jobRowId,
      operation:request.operation,
      request,
      outputs:result.outputs,
      provider:result.provider,
      model:result.model,
      providerMetadata:result.providerMetadata,
      sources
    });
    provider=result.provider;
    model=result.model;
  } else {
    const error = new UnrecoverableError('audio_operation_not_implemented');
    error.code = 'audio_operation_not_implemented';
    throw error;
  }

  const finalCredits = Number(creditsConsumed);
  if (!Number.isSafeInteger(finalCredits) || finalCredits < 1) {
    const error = new UnrecoverableError('audio_credit_settlement_invalid');
    error.code = 'audio_credit_settlement_invalid';
    throw error;
  }

  await markAudioJob(jobRowId, userId, {
    progress_percent: 90,
    stage: 'settling'
  });
  await settleCredits(requestId, finalCredits);

  await markAudioJob(jobRowId, userId, {
    status: 'done',
    stage: 'done',
    progress_percent: 100,
    final_credits: finalCredits,
    provider,
    model,
    canonical_content_id: persisted.contentId,
    canonical_asset_id: persisted.assetId,
    completed_at: new Date().toISOString()
  });

  return {
    status: 'done',
    operation: request.operation,
    canonicalContentId: persisted.contentId,
    canonicalAssetId: persisted.assetId
  };
}

async function handleAudioFailure(job, error) {
  const attempts = Number(job.opts.attempts || 1);
  const exhausted =
    error.name === 'UnrecoverableError' ||
    job.attemptsMade >= attempts;
  if (!exhausted) return;

  const { jobRowId, requestId, userId } = job.data;

  if (error.preserveTerminalState === true) {
    const state = await audioJobState({ ownerId:userId, jobId:jobRowId }).catch(() => null);
    if (state?.status === 'cancelled') {
      await refundAudio({ requestId, userId });
    }
    console.warn(
      '[audio-worker] ignored late/terminal provider result:',
      job.id,
      error.code || error.message,
      state?.status || 'unknown'
    );
    return;
  }
  await markAudioJob(jobRowId, userId, {
    status: 'failed',
    stage: 'failed',
    progress_percent: 0,
    error_code: String(error.code || error.message || 'audio_job_failed').slice(0, 300),
    completed_at: new Date().toISOString()
  }).catch(() => null);

  await refundAudio({ requestId, userId });
  await logCreditEvent({
    userId,
    feature: 'audio',
    status: 'error',
    requestId: requestId + ':detail',
    errorMessage: error.message
  }).catch(() => null);

  console.error(
    '[audio-worker] job failed and reservation reconciled:',
    job.id,
    error.code || error.message
  );
}

const imageWorker = new Worker('rox-image-generation', processImageJob, {
  connection,
  concurrency: CONCURRENCY,
});

const videoWorker = new Worker('rox-video-generation', processVideoJob, {
  connection,
  concurrency: Math.max(1, Math.floor(CONCURRENCY / 2)), // video is heavier ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â fewer parallel jobs
});

const model3dWorker = new Worker(
  'zuvyr-3d-generation',
  processModel3dJob,
  {
    connection,
    concurrency: 1
  }
);

const audioWorker = new Worker('zuvyr-audio-processing', processAudioJob, {
  connection,
  concurrency: 1
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

  if (feature === '3d' && err.preserveTerminalState === true) {
    const state = await model3dJobState({
      ownerId: userId,
      jobId: jobRowId
    }).catch(() => null);
    if (state?.status === 'cancelled') {
      await refundModel3d({ requestId, userId });
    }
    console.warn(
      '[worker] ignored late/terminal 3D result:',
      job.id,
      err.code || err.message,
      state?.status || 'unknown'
    );
    return;
  }

  if (feature === 'video' && err.preserveTerminalState === true) {
    const state = await videoJobState({
      ownerId: userId,
      jobId: jobRowId
    }).catch(() => null);
    if (state?.status === 'cancelled') {
      await refundCancelledVideo({ requestId, userId });
    }
    console.warn(
      '[worker] ignored late/terminal video result:',
      job.id,
      err.code || err.message,
      state?.status || 'unknown'
    );
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
    ...(['video','3d'].includes(feature) ? {
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
model3dWorker.on('failed', (job, err) => handleJobFailure(job, err, '3d'));
audioWorker.on('failed', (job, err) => handleAudioFailure(job, err));
attachmentWorker.on('failed', (job, err) =>
  handleAttachmentFailure(job, err)
);

const brainKernelWorkerEnabled =
  String(process.env.ZUVYR_BRAIN_KERNEL_WORKER_ENABLED || 'true').toLowerCase() !== 'false';

const brainKernelWorker = brainKernelWorkerEnabled
  ? startBrainKernelWorker({
      connection,
      concurrency: 1
    })
  : null;

if (brainKernelWorker) {
  brainKernelWorker.on('failed', (job, error) => {
    console.error(
      '[brain-kernel-worker] failed:',
      job && job.id,
      error && (error.code || error.message)
    );
  });
}

console.log(
  '[brain-kernel-worker] runtime',
  JSON.stringify({ enabled: brainKernelWorkerEnabled })
);

const automationScheduler = startAutomationScheduler({
  connection,
  env: process.env,
  logger: console
});

const automationExecutionWorker = startAutomationExecutionWorker({
  connection,
  env: process.env
});

if (automationExecutionWorker.enabled) {
  automationExecutionWorker.on('failed', (job, error) => {
    console.error(
      '[pack088-execution] failed:',
      job && job.id,
      error && (error.code || error.message)
    );
  });
}

console.log(
  '[pack088-execution] runtime',
  JSON.stringify({ enabled: automationExecutionWorker.enabled })
);

console.log(
  '[pack088-scheduler] runtime',
  JSON.stringify({
    enabled: automationScheduler.enabled,
    intervalMs: automationScheduler.intervalMs,
    batchSize: automationScheduler.batchSize
  })
);

console.log(`ZUVYR worker running (concurrency: image=${CONCURRENCY}, video=${Math.max(1, Math.floor(CONCURRENCY / 2))}, model3d=1, audio=1, attachment=${ATTACHMENT_WORKER_CONCURRENCY})`);
