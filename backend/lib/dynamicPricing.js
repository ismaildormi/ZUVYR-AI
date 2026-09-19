'use strict';

// Pack 015 compatibility shim.
// All pricing decisions use integer micro-USD + integer basis points.
// USD numbers below are display-only compatibility fields produced after the
// exact decision has already been made.
const {
  resolveLegacyGenerationCostEntry,
  resolveCostEntry,
  estimateProviderCostMicroUsd
} = require('./costRegistry');
const {
  BPS_SCALE,
  integer,
  ceilDiv
} = require('./exactMoney');
const { quoteTechnicalCost } = require('./technicalCostModel');

function pricingError(reason) {
  const error = new Error(reason);
  error.code = 'pricing_unconfigured';
  return error;
}

function decimalUsdToMicroUsd(raw, name, fallback, { allowZero = false } = {}) {
  const text = String(raw === undefined || raw === '' ? fallback : raw).trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(text)) {
    throw pricingError(`invalid_${name.toLowerCase()}`);
  }

  const [whole, fraction = ''] = text.split('.');
  const result =
    BigInt(whole) * 1000000n +
    BigInt((fraction + '000000').slice(0, 6));

  if (result < 0n || (!allowZero && result === 0n)) {
    throw pricingError(`invalid_${name.toLowerCase()}`);
  }
  return result;
}

function durationMilliseconds(raw, name) {
  const text = String(raw === undefined || raw === null ? '' : raw).trim();
  if (!/^(0|[1-9][0-9]*)(?:\.([0-9]{1,3}))?$/.test(text)) {
    throw pricingError('invalid_' + name);
  }
  const [whole, fraction = ''] = text.split('.');
  const milliseconds =
    BigInt(whole) * 1000n +
    BigInt((fraction + '000').slice(0, 3));
  if (milliseconds <= 0n) {
    throw pricingError('invalid_' + name);
  }
  return milliseconds;
}

function safeUsageInteger(value, name) {
  const amount = typeof value === 'bigint' ? value : BigInt(value);
  if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw pricingError('invalid_' + name);
  }
  return Number(amount);
}

function decimalRateToBps(raw, name, fallback) {
  const text = String(raw === undefined || raw === '' ? fallback : raw).trim();
  if (!/^(0|1)(\.[0-9]{1,4})?$/.test(text)) {
    throw pricingError(`invalid_${name.toLowerCase()}`);
  }

  const [whole, fraction = ''] = text.split('.');
  const bps =
    BigInt(whole) * BPS_SCALE +
    BigInt((fraction + '0000').slice(0, 4));

  if (bps < 0n || bps > BPS_SCALE) {
    throw pricingError(`invalid_${name.toLowerCase()}`);
  }
  return bps;
}

function economicsFromEnv(env = process.env) {
  const creditValue = decimalUsdToMicroUsd(
    env.CREDIT_PRICE_USD,
    'CREDIT_PRICE_USD',
    '0.01'
  );
  const targetNetMarginBps = decimalRateToBps(
    env.TARGET_NET_MARGIN,
    'TARGET_NET_MARGIN',
    '0.50'
  );
  const paymentFeeBps = decimalRateToBps(
    env.PAYMENT_FEE_RATE,
    'PAYMENT_FEE_RATE',
    '0.06'
  );
  const taxReserveBps = decimalRateToBps(
    env.TAX_RESERVE_RATE,
    'TAX_RESERVE_RATE',
    '0.10'
  );
  const riskReserveBps = decimalRateToBps(
    env.RISK_RESERVE_RATE,
    'RISK_RESERVE_RATE',
    '0.05'
  );
  const infrastructureReserve = decimalUsdToMicroUsd(
    env.INFRA_RESERVE_USD,
    'INFRA_RESERVE_USD',
    '0.002',
    { allowZero: true }
  );
  const combinedMargin =
    targetNetMarginBps + paymentFeeBps + taxReserveBps + riskReserveBps;

  if (combinedMargin >= BPS_SCALE) {
    throw pricingError('invalid_margin_configuration');
  }

  return Object.freeze({
    creditValueMicroUsd: creditValue.toString(),
    minimumChargeCredits: '1',
    targetGrossMarginBps: combinedMargin.toString(),
    providerCostReserveBps: '0',
    retryFailureReserveBps: '0',
    currencyChangeReserveBps: '0',
    infrastructureReserveMicroUsd: infrastructureReserve.toString(),
    targetNetMarginBps: targetNetMarginBps.toString(),
    paymentFeeBps: paymentFeeBps.toString(),
    taxReserveBps: taxReserveBps.toString(),
    riskReserveBps: riskReserveBps.toString()
  });
}

function configuredProviders(feature, env) {
  if (feature === 'image') {
    const providers = [];
    if (env.FAL_KEY) providers.push('fal');
    if (env.REPLICATE_API_TOKEN) providers.push('replicate');
    if (providers.length === 0) throw pricingError('no_configured_image_provider');
    return providers;
  }
  if (feature === 'video') {
    if (!env.REPLICATE_API_TOKEN) throw pricingError('no_configured_video_provider');
    return ['replicate'];
  }
  throw pricingError(`unsupported_dynamic_feature_${feature}`);
}

function providerQuote(feature, {
  env = process.env,
  now = Date.now(),
  imageRequest = null,
  videoRequest = null,
  videoPricingContext = null,
  audioRequest = null,
  audioPricingContext = null
} = {}) {
  if (feature === 'audio' && audioRequest) {
    if (audioRequest.operation === 'audio_cleanup') {
      const entry = resolveCostEntry({
        provider: 'local',
        modelToolId: 'ffmpeg-alpine',
        capability: 'audio_cleanup',
        operationType: 'audio_cleanup_processing'
      }, { env, now });
      return Object.freeze({
        provider: 'local-ffmpeg',
        providerCostMicroUsd: estimateProviderCostMicroUsd(entry),
        pricingVersion: entry.registryVersion,
        costEntryId: entry.id
      });
    }

    if (audioRequest.operation === 'transcription') {
      if (String(env.PACK071_STT_PAID_EXECUTION_ENABLED || '').toLowerCase() !== 'true') {
        throw pricingError('pack071_stt_paid_execution_disabled');
      }
      if (!env.DEEPGRAM_API_KEY) {
        throw pricingError('no_configured_pack071_stt_provider');
      }
      const durationMs = durationMilliseconds(
        audioPricingContext?.sourceDurationSeconds,
        'pack071_source_duration'
      );
      const multilingual = !audioRequest.language;
      const entry = resolveCostEntry({
        provider: 'deepgram',
        modelToolId: 'nova-3',
        capability: 'audio_transcription',
        operationType: multilingual
          ? 'speech_to_text_multilingual_diarization'
          : 'speech_to_text_monolingual_diarization'
      }, { env, now });
      return Object.freeze({
        provider: 'deepgram',
        providerCostMicroUsd: estimateProviderCostMicroUsd(entry, {
          inputUnits: safeUsageInteger(durationMs, 'pack071_audio_duration_ms')
        }),
        pricingVersion: entry.registryVersion,
        costEntryId: entry.id
      });
    }
  }

  if (
    feature === 'video' &&
    videoRequest &&
    ['subtitles','dub','enhance','export'].includes(videoRequest.operation)
  ) {
    const operation = videoRequest.operation;

    if (operation === 'export') {
      const entry = resolveCostEntry({
        provider: 'local',
        modelToolId: 'ffmpeg-alpine',
        capability: 'video_export',
        operationType: 'video_export_processing'
      }, { env, now });

      return Object.freeze({
        provider: 'local-ffmpeg',
        providerCostMicroUsd:
          estimateProviderCostMicroUsd(entry),
        pricingVersion: entry.registryVersion,
        costEntryId: entry.id
      });
    }

    const gate = {
      subtitles: 'PACK069_SUBTITLES_PAID_EXECUTION_ENABLED',
      dub: 'PACK069_DUB_PAID_EXECUTION_ENABLED',
      enhance: 'PACK069_ENHANCE_PAID_EXECUTION_ENABLED'
    }[operation];

    if (String(env[gate] || '').toLowerCase() !== 'true') {
      throw pricingError('pack069_' + operation + '_paid_execution_disabled');
    }
    if (!env.FAL_KEY) {
      throw pricingError('no_configured_pack069_video_provider');
    }

    const sourceDurationMs = durationMilliseconds(
      videoPricingContext?.sourceDurationSeconds,
      'pack069_source_duration'
    );

    if (operation === 'enhance' && sourceDurationMs >= 30000n) {
      throw pricingError('pack069_enhance_source_too_long');
    }

    const spec = {
      subtitles: {
        modelToolId: 'fal-ai/workflow-utilities/auto-subtitle',
        capability: 'video_subtitles',
        operationType: 'video_subtitles_input_duration',
        usage: {
          inputUnits:
            safeUsageInteger(sourceDurationMs, 'pack069_source_duration')
        }
      },
      dub: {
        modelToolId: 'fal-ai/elevenlabs/dubbing',
        capability: 'video_dub',
        operationType: 'video_dub_rounded_input_minutes',
        usage: {
          outputUnits:
            safeUsageInteger(
              ceilDiv(sourceDurationMs, 60000n),
              'pack069_dub_rounded_minutes'
            )
        }
      },
      enhance: {
        modelToolId: 'bria/video/increase-resolution',
        capability: 'video_enhance',
        operationType: 'video_enhance_source_seconds',
        usage: {
          inputUnits:
            safeUsageInteger(sourceDurationMs, 'pack069_source_duration')
        }
      }
    }[operation];

    const entry = resolveCostEntry({
      provider: 'fal',
      modelToolId: spec.modelToolId,
      capability: spec.capability,
      operationType: spec.operationType
    }, { env, now });

    return Object.freeze({
      provider: 'fal',
      providerCostMicroUsd:
        estimateProviderCostMicroUsd(entry, spec.usage),
      pricingVersion: entry.registryVersion,
      costEntryId: entry.id
    });
  }

  if (
    feature === 'video' &&
    videoRequest &&
    ['edit','extend','object_remove','background_remove','lip_sync'].includes(
      videoRequest.operation
    )
  ) {
    const operation = videoRequest.operation;
    const sourceDurationMs =
      ['edit','object_remove','background_remove','lip_sync'].includes(operation)
        ? durationMilliseconds(
            videoPricingContext?.sourceDurationSeconds,
            'pack068_source_duration'
          )
        : null;
    const generatedDurationMs =
      ['edit','extend'].includes(operation)
        ? durationMilliseconds(
            videoRequest.options?.durationSeconds,
            'pack068_generated_duration'
          )
        : null;

    const specs = {
      edit: {
        gate: 'PACK068_EDIT_PAID_EXECUTION_ENABLED',
        modelToolId: 'fal-ai/ltx-2.3/retake-video',
        capability: 'video_edit',
        operationType: 'video_retake_generated_seconds',
        usage: () => ({
          outputUnits:
            safeUsageInteger(generatedDurationMs, 'pack068_generated_duration')
        })
      },
      extend: {
        gate: 'PACK068_EXTEND_PAID_EXECUTION_ENABLED',
        modelToolId: 'fal-ai/ltx-2.3/extend-video',
        capability: 'video_extend',
        operationType: 'video_extend_generated_seconds',
        usage: () => ({
          outputUnits:
            safeUsageInteger(generatedDurationMs, 'pack068_generated_duration')
        })
      },
      object_remove: {
        gate: 'PACK068_OBJECT_REMOVE_PAID_EXECUTION_ENABLED',
        modelToolId: 'bria/video/erase/prompt',
        capability: 'video_object_remove',
        operationType: 'video_object_remove_source_seconds',
        usage: () => ({
          inputUnits:
            safeUsageInteger(sourceDurationMs, 'pack068_source_duration')
        })
      },
      background_remove: {
        gate: 'PACK068_BACKGROUND_PAID_EXECUTION_ENABLED',
        modelToolId: 'bria/video/background-removal/v3',
        capability: 'video_background_remove',
        operationType: 'video_background_remove_source_seconds',
        usage: () => ({
          inputUnits:
            safeUsageInteger(sourceDurationMs, 'pack068_source_duration')
        })
      },
      lip_sync: {
        gate: 'PACK068_LIPSYNC_PAID_EXECUTION_ENABLED',
        modelToolId: 'fal-ai/kling-video/lipsync/audio-to-video',
        capability: 'video_lip_sync',
        operationType: 'video_lipsync_5s_increment',
        usage: () => ({
          outputUnits:
            safeUsageInteger(
              ceilDiv(sourceDurationMs, 5000n),
              'pack068_lipsync_increments'
            )
        })
      }
    };
    const spec = specs[operation];

    if (String(env[spec.gate] || '').toLowerCase() !== 'true') {
      throw pricingError('pack068_' + operation + '_paid_execution_disabled');
    }
    if (!env.FAL_KEY) {
      throw pricingError('no_configured_pack068_video_provider');
    }

    if (operation === 'edit') {
      const startMs =
        videoRequest.options?.startTimeSeconds === 0
          ? 0n
          : durationMilliseconds(
              videoRequest.options?.startTimeSeconds,
              'pack068_edit_start_time'
            );
      if (startMs + generatedDurationMs > sourceDurationMs) {
        throw pricingError('pack068_edit_window_out_of_bounds');
      }
    }
    if (operation === 'object_remove' && sourceDurationMs >= 5000n) {
      throw pricingError('pack068_object_remove_source_too_long');
    }
    if (operation === 'lip_sync') {
      if (sourceDurationMs < 2000n || sourceDurationMs > 10000n) {
        throw pricingError('pack068_lipsync_video_duration_unsupported');
      }
      const audioDurationMs =
        durationMilliseconds(
          videoPricingContext?.audioDurationSeconds,
          'pack068_audio_duration'
        );
      if (audioDurationMs < 2000n || audioDurationMs > 60000n) {
        throw pricingError('pack068_lipsync_audio_duration_unsupported');
      }
      if (
        Number(videoPricingContext?.sourceFileSizeBytes) > 100 * 1024 * 1024 ||
        !['video/mp4','video/quicktime'].includes(
          String(videoPricingContext?.sourceMimeType || '').toLowerCase()
        )
      ) {
        throw pricingError('pack068_lipsync_video_format_unsupported');
      }
      if (
        Number(videoPricingContext?.audioFileSizeBytes) > 5 * 1024 * 1024 ||
        ![
          'audio/mpeg','audio/mp3','audio/ogg','audio/wav','audio/x-wav',
          'audio/mp4','audio/x-m4a','audio/aac','audio/x-aac'
        ].includes(
          String(videoPricingContext?.audioMimeType || '').toLowerCase()
        )
      ) {
        throw pricingError('pack068_lipsync_audio_format_unsupported');
      }
    }

    const entry = resolveCostEntry({
      provider: 'fal',
      modelToolId: spec.modelToolId,
      capability: spec.capability,
      operationType: spec.operationType
    }, { env, now });

    return Object.freeze({
      provider: 'fal',
      providerCostMicroUsd:
        estimateProviderCostMicroUsd(entry, spec.usage()),
      pricingVersion: entry.registryVersion,
      costEntryId: entry.id
    });
  }

  if (
    feature === 'video' &&
    videoRequest &&
    ['relight','recamera'].includes(videoRequest.operation)
  ) {
    throw pricingError(
      'pack068_output_duration_precharge_pricing_unavailable'
    );
  }

  if (feature === 'video' && videoRequest?.operation === 'image_to_video') {
    if (String(env.PACK067_I2V_PAID_EXECUTION_ENABLED || '').toLowerCase() !== 'true') {
      throw pricingError('pack067_i2v_paid_execution_disabled');
    }
    if (!env.REPLICATE_API_TOKEN) {
      throw pricingError('no_configured_video_provider');
    }
    const resolution = String(videoRequest.options?.resolution || '').toLowerCase();
    if (!['480p', '720p'].includes(resolution)) {
      throw pricingError('pack067_i2v_resolution_unpriced');
    }
    const entry = resolveCostEntry({
      provider: 'replicate',
      modelToolId: 'wan-video/wan-2.2-i2v-fast',
      capability: 'video',
      operationType: 'image_to_video_' + resolution
    }, { env, now });
    return Object.freeze({
      provider: 'replicate',
      providerCostMicroUsd: estimateProviderCostMicroUsd(entry),
      pricingVersion: entry.registryVersion,
      costEntryId: entry.id
    });
  }

  if (feature === 'video' && videoRequest?.operation === 'reference_to_video') {
    if (String(env.PACK067_R2V_PAID_EXECUTION_ENABLED || '').toLowerCase() !== 'true') {
      throw pricingError('pack067_r2v_paid_execution_disabled');
    }
    if (!env.REPLICATE_API_TOKEN) {
      throw pricingError('no_configured_video_provider');
    }
    const durationSeconds = Number(videoRequest.options?.durationSeconds);
    if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 2 || durationSeconds > 10) {
      throw pricingError('pack067_r2v_duration_unpriced');
    }
    const entry = resolveCostEntry({
      provider: 'replicate',
      modelToolId: 'wan-video/wan-2.7-r2v',
      capability: 'video',
      operationType: 'reference_to_video_seconds'
    }, { env, now });
    return Object.freeze({
      provider: 'replicate',
      providerCostMicroUsd: estimateProviderCostMicroUsd(entry, {
        outputUnits: durationSeconds
      }),
      pricingVersion: entry.registryVersion,
      costEntryId: entry.id
    });
  }

  if (feature === 'video' && videoRequest?.operation === 'text_to_video') {
    if (String(env.PACK066_PAID_EXECUTION_ENABLED || '').toLowerCase() !== 'true') {
      throw pricingError('pack066_paid_execution_disabled');
    }
    if (!env.REPLICATE_API_TOKEN) {
      throw pricingError('no_configured_video_provider');
    }
    const model = env.REPLICATE_VIDEO_MODEL || 'wan-video/wan-2.2-t2v-fast';
    if (model !== 'wan-video/wan-2.2-t2v-fast') {
      throw pricingError('replicate_video_model_unverified');
    }
    const resolution = String(videoRequest.options?.resolution || '').toLowerCase();
    if (!['480p', '720p'].includes(resolution)) {
      throw pricingError('pack066_video_resolution_unpriced');
    }
    const entry = resolveCostEntry({
      provider: 'replicate',
      modelToolId: 'wan-video/wan-2.2-t2v-fast',
      capability: 'video',
      operationType: `text_to_video_${resolution}`
    }, { env, now });
    return Object.freeze({
      provider: 'replicate',
      providerCostMicroUsd: estimateProviderCostMicroUsd(entry),
      pricingVersion: entry.registryVersion,
      costEntryId: entry.id
    });
  }
  if (
    feature === 'image' &&
    imageRequest &&
    ['crop', 'resize', 'canvas', 'layers', 'text', 'batch'].includes(
      imageRequest.operation
    )
  ) {
    const spec = {
      crop: ['image_crop', 'image_crop_processing'],
      resize: ['image_resize', 'image_resize_processing'],
      canvas: ['image_canvas', 'image_canvas_processing'],
      layers: ['image_layers', 'image_layer_composite'],
      text: ['image_text', 'image_text_overlay'],
      batch: ['image_batch', 'image_batch_processing']
    }[imageRequest.operation];

    const entry = resolveCostEntry({
      provider: 'local',
      modelToolId: 'sharp@0.34.4',
      capability: spec[0],
      operationType: spec[1]
    }, { env, now });

    return Object.freeze({
      provider: 'local-sharp',
      providerCostMicroUsd:
        estimateProviderCostMicroUsd(entry),
      pricingVersion: entry.registryVersion
    });
  }

  if (
    feature === 'image' &&
    imageRequest &&
    ['remove_background', 'relight'].includes(imageRequest.operation)
  ) {
    if (
      String(
        env.PACK064_EXTERNAL_EXECUTION_ENABLED || ''
      ).toLowerCase() !== 'true'
    ) {
      throw pricingError('pack064_external_execution_disabled');
    }

    if (!env.FAL_KEY) {
      throw pricingError('no_configured_pack064_image_provider');
    }

    const spec = {
      remove_background: {
        provider: 'fal-background',
        modelToolId: 'fal-ai/birefnet/v2',
        capability: 'image_remove_background',
        operationType: 'image_background_removal'
      },
      relight: {
        provider: 'fal-relight',
        modelToolId: 'fal-ai/image-apps-v2/relighting',
        capability: 'image_relight',
        operationType: 'image_relighting'
      }
    }[imageRequest.operation];

    const entry = resolveCostEntry({
      provider: 'fal',
      modelToolId: spec.modelToolId,
      capability: spec.capability,
      operationType: spec.operationType
    }, { env, now });

    return Object.freeze({
      provider: spec.provider,
      providerCostMicroUsd:
        estimateProviderCostMicroUsd(entry),
      pricingVersion: entry.registryVersion
    });
  }

  if (
    feature === 'image' &&
    imageRequest &&
    imageRequest.operation === 'upscale'
  ) {
    throw pricingError(
      'pack064_upscale_exact_precharge_pricing_unavailable'
    );
  }

  if (
    feature === 'image' &&
    imageRequest &&
    ['edit', 'inpaint', 'expand'].includes(imageRequest.operation)
  ) {
    if (String(env.PACK063_PAID_EXECUTION_ENABLED || '').toLowerCase() !== 'true') {
      throw pricingError('pack063_paid_execution_disabled');
    }
    if (!env.FAL_KEY) {
      throw pricingError('no_configured_pack063_image_provider');
    }

    const operation = imageRequest.operation;
    const spec = {
      edit: {
        provider: 'fal-edit',
        modelToolId: 'fal-ai/flux-pro/kontext',
        capability: 'image_edit',
        operationType: 'image_edit_generation'
      },
      inpaint: {
        provider: 'fal-inpaint',
        modelToolId: 'fal-ai/qwen-image-edit/inpaint',
        capability: 'image_inpaint',
        operationType: 'image_inpainting'
      },
      expand: {
        provider: 'fal-outpaint',
        modelToolId: 'fal-ai/image-apps-v2/outpaint',
        capability: 'image_outpaint',
        operationType: 'image_outpainting'
      }
    }[operation];

    const entry = resolveCostEntry({
      provider: 'fal',
      modelToolId: spec.modelToolId,
      capability: spec.capability,
      operationType: spec.operationType
    }, { env, now });

    const unitCost = BigInt(estimateProviderCostMicroUsd(entry));
    const quantity = BigInt(imageRequest.options?.quantity || 1);

    return Object.freeze({
      provider: spec.provider,
      providerCostMicroUsd: (unitCost * quantity).toString(),
      pricingVersion: entry.registryVersion
    });
  }

  if (
    feature === 'image' &&
    imageRequest &&
    ['reference_generate', 'variations'].includes(imageRequest.operation)
  ) {
    if (!env.FAL_KEY) {
      throw pricingError('no_configured_reference_image_provider');
    }

    const entry = resolveCostEntry({
      provider: 'fal',
      modelToolId: 'fal-ai/flux-pro/kontext/multi',
      capability: 'image_reference',
      operationType: 'image_reference_generation'
    }, { env, now });

    const unitCost = BigInt(estimateProviderCostMicroUsd(entry));
    const quantity = BigInt(imageRequest.options?.quantity || 1);

    return Object.freeze({
      provider: 'fal-kontext',
      providerCostMicroUsd: (unitCost * quantity).toString(),
      pricingVersion: entry.registryVersion
    });
  }

  const providers = configuredProviders(feature, env).map(provider => {
    const entry = resolveLegacyGenerationCostEntry(provider, feature, { env, now });
    const providerCostMicroUsd = estimateProviderCostMicroUsd(entry);
    return Object.freeze({
      provider,
      providerCostMicroUsd,
      pricingVersion: entry.registryVersion
    });
  });

  return providers.reduce((mostExpensive, current) =>
    BigInt(current.providerCostMicroUsd) >
    BigInt(mostExpensive.providerCostMicroUsd)
      ? current
      : mostExpensive
  );
}

function microUsdDisplayNumber(value) {
  const amount = integer(value, 'display_micro_usd');
  const whole = amount / 1000000n;
  const fraction = String(amount % 1000000n).padStart(6, '0');
  return Number(`${whole}.${fraction}`);
}

function marginDisplayNumber(bps) {
  return Number(integer(bps, 'display_margin_bps')) / 10000;
}

function quoteGeneration(feature, options = {}) {
  const env = options.env || process.env;
  const economics = economicsFromEnv(env);
  const provider = providerQuote(feature, { ...options, env });
  const technical = quoteTechnicalCost({
    providerCostMicroUsd: provider.providerCostMicroUsd,
    components: [],
    pricingVersion: provider.pricingVersion,
    basis: 'estimate',
    economics
  });

  const creditValue = BigInt(economics.creditValueMicroUsd);
  const targetNetMargin = BigInt(economics.targetNetMarginBps);
  const variableReserveBps =
    BigInt(economics.paymentFeeBps) +
    BigInt(economics.taxReserveBps) +
    BigInt(economics.riskReserveBps);
  const fixedTechnicalCost = BigInt(
    technical.trace.allInTechnicalCostMicroUsd
  );

  let credits = BigInt(technical.charge.chargedCredits);
  let revenue;
  let variableReserves;
  let estimatedNetProfit;
  let estimatedNetMarginBps;

  for (let attempts = 0; attempts < 4; attempts += 1) {
    revenue = credits * creditValue;
    variableReserves = ceilDiv(
      revenue * variableReserveBps,
      BPS_SCALE
    );
    estimatedNetProfit =
      revenue - fixedTechnicalCost - variableReserves;
    estimatedNetMarginBps = revenue === 0n
      ? 0n
      : (estimatedNetProfit * BPS_SCALE) / revenue;

    if (estimatedNetMarginBps >= targetNetMargin) break;
    credits += 1n;
  }

  if (estimatedNetMarginBps < targetNetMargin) {
    throw pricingError('margin_floor_not_met');
  }
  if (credits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw pricingError('credit_quote_too_large');
  }

  // Exact fields are authoritative. Numeric USD fields are display/API
  // compatibility only and are never read back into pricing decisions.
  return Object.freeze({
    feature,
    credits: Number(credits),
    revenueUsd: microUsdDisplayNumber(revenue),
    provider: provider.provider,
    providerCostUsd: microUsdDisplayNumber(provider.providerCostMicroUsd),
    providerCostMicroUsd: provider.providerCostMicroUsd,
    pricingVersion: provider.pricingVersion,
    estimatedNetProfitUsd: microUsdDisplayNumber(estimatedNetProfit),
    estimatedNetMargin: marginDisplayNumber(estimatedNetMarginBps),
    revenueMicroUsd: revenue.toString(),
    infrastructureCostMicroUsd:
      technical.trace.infrastructureCostMicroUsd,
    technicalCostMicroUsd:
      technical.trace.allInTechnicalCostMicroUsd,
    variableReservesMicroUsd: variableReserves.toString(),
    estimatedNetProfitMicroUsd: estimatedNetProfit.toString(),
    estimatedNetMarginBps: estimatedNetMarginBps.toString(),
    targetNetMarginBps: economics.targetNetMarginBps,
    pricingDecisionMode: 'exact_integer_micro_usd',
    technicalCostTrace: technical.trace,
    settlementAudit: Object.freeze({
      ...technical.settlementAudit,
      revenueMicroUsd: revenue.toString(),
      estimatedNetProfitMicroUsd: estimatedNetProfit.toString(),
      estimatedNetMarginBps: estimatedNetMarginBps.toString(),
      variableReservesMicroUsd: variableReserves.toString()
    })
  });
}

module.exports = {
  quoteGeneration,
  economicsFromEnv
};
