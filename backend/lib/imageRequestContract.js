'use strict';

const { config, normalizeImageOperation } = require('./imageOperationRegistry');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestError(code) { const error = new Error(code); error.code = code; return error; }

function normalizeImageRequest(body = {}) {
  const operation = normalizeImageOperation(body.imageOperation);
  const definition = config.operations[operation];
  const ids = body.referenceAssetIds === undefined ? [] : body.referenceAssetIds;
  if (!Array.isArray(ids) || ids.length > config.requestLimits.maxReferenceAssets || ids.some(id => typeof id !== 'string' || !UUID.test(id))) throw requestError('invalid_image_reference_assets');
  const referenceAssetIds = [...new Set(ids)];
  const sourceAssetId = body.sourceAssetId == null ? null : String(body.sourceAssetId);
  const maskAssetId = body.maskAssetId == null ? null : String(body.maskAssetId);
  if (sourceAssetId && !UUID.test(sourceAssetId)) throw requestError('invalid_image_source_asset');
  if (maskAssetId && !UUID.test(maskAssetId)) throw requestError('invalid_image_mask_asset');
  if (definition.sourceMustBeExplicit && !sourceAssetId) throw requestError('image_source_required');
  if (!definition.sourceMustBeExplicit && definition.requiresSource && !sourceAssetId && referenceAssetIds.length === 0) throw requestError('image_source_required');
  if (definition.requiresMask && !maskAssetId) throw requestError('image_mask_required');
  const raw = body.imageOptions && typeof body.imageOptions === 'object' && !Array.isArray(body.imageOptions) ? body.imageOptions : {};
  const allowed = new Set([
    'ratio',
    'resolution',
    'quantity',
    'style',
    'seed',
    'strength',
    'expandLeft',
    'expandRight',
    'expandTop',
    'expandBottom',
    'zoomOutPercentage',
    'upscaleFactor',
    'upscaleCreativity',
    'lightingStyle',
    'cropX',
    'cropY',
    'cropWidth',
    'cropHeight',
    'resizeWidth',
    'resizeHeight',
    'resizeFit',
    'canvasWidth',
    'canvasHeight',
    'canvasBackground',
    'layerPlacements',
    'textValue',
    'textX',
    'textY',
    'textFontSize',
    'textColor',
    'batchAction'
  ]);
  if (Object.keys(raw).some(key => !allowed.has(key))) throw requestError('unsupported_image_option');
  const ratio = raw.ratio || '1:1';
  const resolution = String(raw.resolution || '1024');
  const quantity = raw.quantity === undefined ? 1 : Number(raw.quantity);
  if (!config.requestLimits.allowedRatios.includes(ratio)) throw requestError('invalid_image_ratio');
  if (!config.requestLimits.allowedResolutions.includes(resolution)) throw requestError('invalid_image_resolution');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > config.requestLimits.maxQuantity) throw requestError('invalid_image_quantity');
  const style = String(raw.style || '').trim().slice(0, 80) || null;
  const seed = raw.seed == null ? null : Number(raw.seed);
  if (seed !== null && (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647)) throw requestError('invalid_image_seed');

  const extra = {};
  if (raw.strength !== undefined) {
    const strength = Number(raw.strength);
    if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
      throw requestError('invalid_image_strength');
    }
    extra.strength = strength;
  }

  for (const [inputKey, outputKey] of [
    ['expandLeft', 'expandLeft'],
    ['expandRight', 'expandRight'],
    ['expandTop', 'expandTop'],
    ['expandBottom', 'expandBottom']
  ]) {
    if (raw[inputKey] !== undefined) {
      const pixels = Number(raw[inputKey]);
      if (!Number.isSafeInteger(pixels) || pixels < 0 || pixels > 700) {
        throw requestError('invalid_image_expand_pixels');
      }
      extra[outputKey] = pixels;
    }
  }

  if (raw.zoomOutPercentage !== undefined) {
    const zoom = Number(raw.zoomOutPercentage);
    if (!Number.isFinite(zoom) || zoom < 0 || zoom > 100) {
      throw requestError('invalid_image_zoom_out_percentage');
    }
    extra.zoomOutPercentage = zoom;
  }

  if (raw.upscaleFactor !== undefined) {
    const value = Number(raw.upscaleFactor);
    if (!Number.isFinite(value) || value < 1 || value > 4) {
      throw requestError('invalid_image_upscale_factor');
    }
    extra.upscaleFactor = value;
  }

  if (raw.upscaleCreativity !== undefined) {
    const value = Number(raw.upscaleCreativity);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw requestError('invalid_image_upscale_creativity');
    }
    extra.upscaleCreativity = value;
  }

  if (raw.lightingStyle !== undefined) {
    const value = String(raw.lightingStyle || '').trim().toLowerCase();
    const allowedLighting = new Set([
      'natural',
      'studio',
      'golden_hour',
      'blue_hour',
      'dramatic',
      'soft',
      'hard',
      'backlight',
      'side_light',
      'front_light',
      'rim_light',
      'sunset',
      'sunrise',
      'neon',
      'candlelight',
      'moonlight',
      'spotlight',
      'ambient'
    ]);
    if (!allowedLighting.has(value)) {
      throw requestError('invalid_image_lighting_style');
    }
    extra.lightingStyle = value;
  }

  const optionalInteger = (key, code, min = 0, max = 8192) => {
    if (raw[key] === undefined) return;
    const value = Number(raw[key]);
    if (
      !Number.isSafeInteger(value) ||
      value < min ||
      value > max
    ) {
      throw requestError(code);
    }
    extra[key] = value;
  };

  optionalInteger('cropX', 'invalid_image_crop_x');
  optionalInteger('cropY', 'invalid_image_crop_y');
  optionalInteger('cropWidth', 'invalid_image_crop_width', 1);
  optionalInteger('cropHeight', 'invalid_image_crop_height', 1);
  optionalInteger('resizeWidth', 'invalid_image_resize_width', 1);
  optionalInteger('resizeHeight', 'invalid_image_resize_height', 1);
  optionalInteger('canvasWidth', 'invalid_image_canvas_width', 1);
  optionalInteger('canvasHeight', 'invalid_image_canvas_height', 1);
  optionalInteger('textX', 'invalid_image_text_x');
  optionalInteger('textY', 'invalid_image_text_y');
  optionalInteger(
    'textFontSize',
    'invalid_image_text_font_size',
    8,
    512
  );

  if (raw.resizeFit !== undefined) {
    const value = String(raw.resizeFit || '').trim().toLowerCase();
    if (!['cover', 'contain', 'fill', 'inside', 'outside'].includes(value)) {
      throw requestError('invalid_image_resize_fit');
    }
    extra.resizeFit = value;
  }

  for (const key of ['canvasBackground', 'textColor']) {
    if (raw[key] === undefined) continue;
    const value = String(raw[key] || '').trim();
    if (
      !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value) &&
      !/^(?:black|white|transparent)$/i.test(value)
    ) {
      throw requestError('invalid_image_utility_color');
    }
    extra[key] = value;
  }

  if (raw.textValue !== undefined) {
    const value = String(raw.textValue || '').trim();
    if (!value || value.length > 500) {
      throw requestError('invalid_image_text_value');
    }
    extra.textValue = value;
  }

  if (raw.batchAction !== undefined) {
    const value = String(raw.batchAction || '').trim().toLowerCase();
    if (!['crop', 'resize'].includes(value)) {
      throw requestError('unsupported_image_batch_action');
    }
    extra.batchAction = value;
  }

  if (raw.layerPlacements !== undefined) {
    if (
      !Array.isArray(raw.layerPlacements) ||
      raw.layerPlacements.length < 1 ||
      raw.layerPlacements.length > 4
    ) {
      throw requestError('invalid_image_layer_placements');
    }

    const allowedBlend = new Set([
      'over',
      'multiply',
      'screen',
      'overlay',
      'darken',
      'lighten'
    ]);

    extra.layerPlacements = raw.layerPlacements.map(item => {
      if (
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item)
      ) {
        throw requestError('invalid_image_layer_placement');
      }

      const keys = Object.keys(item);
      if (keys.some(key => !['left', 'top', 'blend'].includes(key))) {
        throw requestError('unsupported_image_layer_option');
      }

      const left = Number(item.left || 0);
      const top = Number(item.top || 0);
      const blend = String(item.blend || 'over').trim().toLowerCase();

      if (
        !Number.isSafeInteger(left) ||
        left < 0 ||
        left > 8192 ||
        !Number.isSafeInteger(top) ||
        top < 0 ||
        top > 8192 ||
        !allowedBlend.has(blend)
      ) {
        throw requestError('invalid_image_layer_placement');
      }

      return Object.freeze({ left, top, blend });
    });
  }

  return Object.freeze({
    operation,
    referenceAssetIds: Object.freeze(referenceAssetIds),
    sourceAssetId,
    maskAssetId,
    options: Object.freeze({
      ratio,
      resolution,
      quantity,
      style,
      seed,
      ...extra
    })
  });
}

module.exports = { normalizeImageRequest };
