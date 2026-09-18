'use strict';

const config = require('../config/image-system.v1.json');

function imageOperationError(code, operation) {
  const error = new Error(code);
  error.code = code;
  error.operation = operation;
  error.statusCode = 400;
  error.retryable = false;
  return error;
}

function normalizeImageOperation(value) {
  const operation = String(value || 'generate').trim().toLowerCase();
  if (!Object.hasOwn(config.operations, operation)) {
    throw imageOperationError('unknown_image_operation', operation);
  }
  return operation;
}

function assertImageOperationAvailable(value) {
  const operation = normalizeImageOperation(value);
  const definition = config.operations[operation];
  if (definition.status === 'blocked_unpriced') {
    throw imageOperationError('image_operation_unpriced', operation);
  }
  if (definition.enabledByDefault !== true) {
    throw imageOperationError('image_operation_disabled', operation);
  }
  return Object.freeze({ operation, ...definition });
}

function assertImageRequestAvailable(request) {
  const definition = assertImageOperationAvailable(request?.operation);
  const options = request?.options || {};

  if (definition.operation === 'generate') {
    const unsupported =
      (request?.referenceAssetIds || []).length > 0 ||
      Boolean(request?.sourceAssetId) ||
      Boolean(request?.maskAssetId) ||
      options.ratio !== '1:1' ||
      options.resolution !== '1024' ||
      options.quantity !== 1 ||
      Boolean(options.style) ||
      options.seed !== null;

    if (unsupported) {
      throw imageOperationError(
        'image_generation_configuration_unavailable',
        definition.operation
      );
    }
    return definition;
  }

  if (['reference_generate', 'variations'].includes(definition.operation)) {
    const ratios =
      config.providers?.['fal-kontext']?.capabilities?.ratios ||
      ['1:1', '16:9', '9:16', '4:3', '3:4'];

    const uniqueInputs = new Set([
      ...(request?.referenceAssetIds || []),
      request?.sourceAssetId || null
    ].filter(Boolean));

    if (uniqueInputs.size > 4) {
      throw imageOperationError(
        'image_reference_input_limit_exceeded',
        definition.operation
      );
    }

    if (request?.maskAssetId) {
      throw imageOperationError(
        'image_reference_mask_unsupported',
        definition.operation
      );
    }
    if (options.resolution !== '1024') {
      throw imageOperationError(
        'image_reference_resolution_unsupported',
        definition.operation
      );
    }
    if (options.style) {
      throw imageOperationError(
        'image_reference_style_unsupported',
        definition.operation
      );
    }
    if (!ratios.includes(options.ratio)) {
      throw imageOperationError(
        'image_reference_ratio_unsupported',
        definition.operation
      );
    }
    return definition;
  }


  if (definition.operation === 'edit') {
    const ratios =
      config.providers?.['fal-edit']?.capabilities?.ratios || ['1:1'];

    if ((request?.referenceAssetIds || []).length > 0) {
      throw imageOperationError('image_edit_references_unsupported', definition.operation);
    }
    if (request?.maskAssetId) {
      throw imageOperationError('image_edit_mask_unsupported', definition.operation);
    }
    if (options.resolution !== '1024') {
      throw imageOperationError('image_edit_resolution_unsupported', definition.operation);
    }
    if (options.style) {
      throw imageOperationError('image_edit_style_unsupported', definition.operation);
    }
    if (!ratios.includes(options.ratio)) {
      throw imageOperationError('image_edit_ratio_unsupported', definition.operation);
    }
    if (
      options.strength !== undefined ||
      options.expandLeft !== undefined ||
      options.expandRight !== undefined ||
      options.expandTop !== undefined ||
      options.expandBottom !== undefined ||
      options.zoomOutPercentage !== undefined
    ) {
      throw imageOperationError('image_edit_option_unsupported', definition.operation);
    }
    return definition;
  }

  if (definition.operation === 'inpaint') {
    const ratios =
      config.providers?.['fal-inpaint']?.capabilities?.ratios || ['1:1'];

    if ((request?.referenceAssetIds || []).length > 0) {
      throw imageOperationError('image_inpaint_references_unsupported', definition.operation);
    }
    if (!request?.sourceAssetId || !request?.maskAssetId) {
      throw imageOperationError('image_inpaint_source_mask_required', definition.operation);
    }
    if (options.resolution !== '1024') {
      throw imageOperationError('image_inpaint_resolution_unsupported', definition.operation);
    }
    if (options.style) {
      throw imageOperationError('image_inpaint_style_unsupported', definition.operation);
    }
    if (!ratios.includes(options.ratio)) {
      throw imageOperationError('image_inpaint_ratio_unsupported', definition.operation);
    }
    if (
      options.expandLeft !== undefined ||
      options.expandRight !== undefined ||
      options.expandTop !== undefined ||
      options.expandBottom !== undefined ||
      options.zoomOutPercentage !== undefined
    ) {
      throw imageOperationError('image_inpaint_expand_option_unsupported', definition.operation);
    }
    return definition;
  }

  if (definition.operation === 'expand') {
    if ((request?.referenceAssetIds || []).length > 0) {
      throw imageOperationError('image_outpaint_references_unsupported', definition.operation);
    }
    if (request?.maskAssetId) {
      throw imageOperationError('image_outpaint_mask_unsupported', definition.operation);
    }
    if (options.ratio !== '1:1' || options.resolution !== '1024') {
      throw imageOperationError('image_outpaint_fixed_canvas_contract', definition.operation);
    }
    if (options.style || options.strength !== undefined) {
      throw imageOperationError('image_outpaint_option_unsupported', definition.operation);
    }

    const expansion =
      Number(options.expandLeft || 0) +
      Number(options.expandRight || 0) +
      Number(options.expandTop || 0) +
      Number(options.expandBottom || 0);

    const zoom = Number(options.zoomOutPercentage || 0);
    if (expansion <= 0 && zoom <= 0) {
      throw imageOperationError('image_outpaint_change_required', definition.operation);
    }
    return definition;
  }

  return definition;
}

function providerSupports(provider, operation) {
  const item = config.providers[provider];
  return Boolean(
    item &&
    item.implementedOperations.includes(normalizeImageOperation(operation))
  );
}

function inventory() {
  return Object.freeze({
    version: config.version,
    operations: { ...config.operations },
    providers: { ...config.providers }
  });
}

module.exports = {
  config,
  normalizeImageOperation,
  assertImageOperationAvailable,
  assertImageRequestAvailable,
  providerSupports,
  inventory
};
