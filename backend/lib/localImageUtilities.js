'use strict';

const sharp = require('sharp');

const MAX_DIMENSION = 8192;
const MAX_LAYERS = 4;
const FITS = new Set(['cover', 'contain', 'fill', 'inside', 'outside']);
const BLENDS = new Set([
  'over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten'
]);

function utilityError(code) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 400;
  error.retryable = false;
  return error;
}

function imageBuffer(value, code) {
  if (!Buffer.isBuffer(value) || value.length < 1) {
    throw utilityError(code);
  }
  return value;
}

function integer(value, code, { min = 0, max = MAX_DIMENSION } = {}) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw utilityError(code);
  }
  return number;
}

function dimension(value, code) {
  return integer(value, code, { min: 1, max: MAX_DIMENSION });
}

function color(value) {
  const text = String(value || '#00000000').trim();
  if (
    !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(text) &&
    !/^(?:black|white|transparent)$/i.test(text)
  ) {
    throw utilityError('invalid_image_utility_color');
  }
  return text;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function png(buffer) {
  const output = await sharp(buffer, { failOn: 'error' })
    .png()
    .toBuffer();

  return Object.freeze({
    buffer: output,
    mimeType: 'image/png'
  });
}

async function cropOne(sourceBuffer, options = {}) {
  const source = imageBuffer(sourceBuffer, 'image_utility_source_required');
  const metadata = await sharp(source).metadata();

  const width = dimension(options.cropWidth, 'invalid_image_crop_width');
  const height = dimension(options.cropHeight, 'invalid_image_crop_height');
  const left = integer(options.cropX || 0, 'invalid_image_crop_x');
  const top = integer(options.cropY || 0, 'invalid_image_crop_y');

  if (
    !metadata.width ||
    !metadata.height ||
    left + width > metadata.width ||
    top + height > metadata.height
  ) {
    throw utilityError('image_crop_out_of_bounds');
  }

  const output = await sharp(source)
    .extract({ left, top, width, height })
    .png()
    .toBuffer();

  return Object.freeze({
    buffer: output,
    mimeType: 'image/png',
    metadata: Object.freeze({ width, height, left, top })
  });
}

async function resizeOne(sourceBuffer, options = {}) {
  const source = imageBuffer(sourceBuffer, 'image_utility_source_required');
  const width = dimension(options.resizeWidth, 'invalid_image_resize_width');
  const height = dimension(options.resizeHeight, 'invalid_image_resize_height');
  const fit = String(options.resizeFit || 'inside').trim().toLowerCase();

  if (!FITS.has(fit)) {
    throw utilityError('invalid_image_resize_fit');
  }

  const output = await sharp(source)
    .resize({ width, height, fit })
    .png()
    .toBuffer();

  const metadata = await sharp(output).metadata();

  return Object.freeze({
    buffer: output,
    mimeType: 'image/png',
    metadata: Object.freeze({
      width: metadata.width,
      height: metadata.height,
      requestedWidth: width,
      requestedHeight: height,
      fit
    })
  });
}

async function canvasOne(sourceBuffer, options = {}) {
  const source = imageBuffer(sourceBuffer, 'image_utility_source_required');
  const metadata = await sharp(source).metadata();

  if (!metadata.width || !metadata.height) {
    throw utilityError('image_utility_metadata_unavailable');
  }

  const width = dimension(options.canvasWidth, 'invalid_image_canvas_width');
  const height = dimension(options.canvasHeight, 'invalid_image_canvas_height');

  if (width < metadata.width || height < metadata.height) {
    throw utilityError('image_canvas_smaller_than_source');
  }

  const horizontal = width - metadata.width;
  const vertical = height - metadata.height;
  const left = Math.floor(horizontal / 2);
  const right = horizontal - left;
  const top = Math.floor(vertical / 2);
  const bottom = vertical - top;

  const background = color(options.canvasBackground || '#00000000');

  const output = await sharp(source)
    .extend({ top, bottom, left, right, background })
    .png()
    .toBuffer();

  return Object.freeze({
    buffer: output,
    mimeType: 'image/png',
    metadata: Object.freeze({
      width,
      height,
      background,
      placement: 'center'
    })
  });
}

async function layersOne(sourceBuffer, referenceBuffers = [], options = {}) {
  const source = imageBuffer(sourceBuffer, 'image_utility_source_required');
  const layers = Array.isArray(referenceBuffers) ? referenceBuffers : [];

  if (layers.length < 1 || layers.length > MAX_LAYERS) {
    throw utilityError('invalid_image_layer_count');
  }

  const placements = Array.isArray(options.layerPlacements)
    ? options.layerPlacements
    : [];

  if (placements.length !== layers.length) {
    throw utilityError('image_layer_placement_count_mismatch');
  }

  const composite = layers.map((buffer, index) => {
    imageBuffer(buffer, 'invalid_image_layer_buffer');

    const placement = placements[index] || {};
    const left = integer(
      placement.left || 0,
      'invalid_image_layer_left'
    );
    const top = integer(
      placement.top || 0,
      'invalid_image_layer_top'
    );
    const blend = String(placement.blend || 'over').trim().toLowerCase();

    if (!BLENDS.has(blend)) {
      throw utilityError('invalid_image_layer_blend');
    }

    return {
      input: buffer,
      left,
      top,
      blend
    };
  });

  const output = await sharp(source)
    .composite(composite)
    .png()
    .toBuffer();

  return Object.freeze({
    buffer: output,
    mimeType: 'image/png',
    metadata: Object.freeze({
      layerCount: layers.length,
      placements: placements.map(item => ({ ...item }))
    })
  });
}

async function textOne(sourceBuffer, options = {}) {
  const source = imageBuffer(sourceBuffer, 'image_utility_source_required');
  const metadata = await sharp(source).metadata();

  if (!metadata.width || !metadata.height) {
    throw utilityError('image_utility_metadata_unavailable');
  }

  const text = String(options.textValue || '').trim();
  if (!text || text.length > 500) {
    throw utilityError('invalid_image_text_value');
  }

  const fontSize = integer(
    options.textFontSize || 48,
    'invalid_image_text_font_size',
    { min: 8, max: 512 }
  );
  const x = integer(options.textX || 0, 'invalid_image_text_x');
  const y = integer(options.textY || fontSize, 'invalid_image_text_y');
  const fill = color(options.textColor || '#ffffffff');

  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      metadata.width +
      '" height="' +
      metadata.height +
      '">' +
      '<text x="' +
      x +
      '" y="' +
      y +
      '" font-size="' +
      fontSize +
      '" font-family="sans-serif" fill="' +
      fill +
      '">' +
      escapeXml(text) +
      '</text></svg>'
  );

  const output = await sharp(source)
    .composite([{ input: svg, left: 0, top: 0 }])
    .png()
    .toBuffer();

  return Object.freeze({
    buffer: output,
    mimeType: 'image/png',
    metadata: Object.freeze({
      textLength: text.length,
      fontSize,
      x,
      y,
      fill
    })
  });
}

async function executeSingle(operation, sourceBuffer, referenceBuffers, options) {
  switch (operation) {
    case 'crop':
      return cropOne(sourceBuffer, options);
    case 'resize':
      return resizeOne(sourceBuffer, options);
    case 'canvas':
      return canvasOne(sourceBuffer, options);
    case 'layers':
      return layersOne(sourceBuffer, referenceBuffers, options);
    case 'text':
      return textOne(sourceBuffer, options);
    default:
      throw utilityError('unsupported_local_image_utility');
  }
}

async function executeLocalImageUtility({
  operation,
  sourceBuffer,
  referenceBuffers = [],
  options = {}
} = {}) {
  const normalized = String(operation || '').trim().toLowerCase();

  if (normalized === 'batch') {
    const action = String(options.batchAction || '').trim().toLowerCase();

    if (!['crop', 'resize'].includes(action)) {
      throw utilityError('unsupported_image_batch_action');
    }

    const inputs = [
      imageBuffer(sourceBuffer, 'image_utility_source_required'),
      ...(Array.isArray(referenceBuffers) ? referenceBuffers : [])
    ];

    if (inputs.length < 2 || inputs.length > 5) {
      throw utilityError('invalid_image_batch_size');
    }

    const outputs = [];
    for (const input of inputs) {
      outputs.push(
        await executeSingle(action, input, [], options)
      );
    }

    return Object.freeze({
      provider: 'local-sharp',
      model: 'sharp@0.34.4',
      providerCalls: 0,
      operation: 'batch',
      batchAction: action,
      outputs: Object.freeze(outputs)
    });
  }

  const output = await executeSingle(
    normalized,
    imageBuffer(sourceBuffer, 'image_utility_source_required'),
    referenceBuffers,
    options
  );

  return Object.freeze({
    provider: 'local-sharp',
    model: 'sharp@0.34.4',
    providerCalls: 0,
    operation: normalized,
    outputs: Object.freeze([output])
  });
}

module.exports = {
  MAX_DIMENSION,
  MAX_LAYERS,
  executeLocalImageUtility
};
