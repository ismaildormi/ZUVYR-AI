'use strict';

function capabilityError(code, detail = null) {
  const error = new Error(code);
  error.code = code;
  error.status = 400;
  if (detail) error.detail = detail;
  return error;
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function requestShape(request = {}) {
  const options =
    request.options &&
    typeof request.options === 'object' &&
    !Array.isArray(request.options)
      ? request.options
      : {};

  return {
    operation: text(request.operation) || 'generate',

    referenceAssetIds: Array.isArray(request.referenceAssetIds)
      ? request.referenceAssetIds.map(text).filter(Boolean)
      : [],

    sourceAssetId: text(request.sourceAssetId) || null,
    maskAssetId: text(request.maskAssetId) || null,

    options: {
      ...options,
      quantity:
        options.quantity === undefined
          ? 1
          : Number(options.quantity),

      seed:
        options.seed === undefined ||
        options.seed === null ||
        options.seed === ''
          ? null
          : Number(options.seed)
    }
  };
}

function capabilitySet(capabilities = {}) {
  return {
    operations: new Set(
      Array.isArray(capabilities.operations)
        ? capabilities.operations.map(text).filter(Boolean)
        : ['generate']
    ),

    referenceAssets: capabilities.referenceAssets === true,
    sourceAsset: capabilities.sourceAsset === true,
    maskAsset: capabilities.maskAsset === true,
    seed: capabilities.seed === true,
    quantity: capabilities.quantity === true,

    maxQuantity:
      Number.isSafeInteger(Number(capabilities.maxQuantity)) &&
      Number(capabilities.maxQuantity) > 0
        ? Number(capabilities.maxQuantity)
        : null
  };
}

function assertImageProviderCapabilities(request, capabilities) {
  const normalized = requestShape(request);
  const supported = capabilitySet(capabilities);

  if (!supported.operations.has(normalized.operation)) {
    throw capabilityError(
      'unsupported_image_operation_for_provider',
      normalized.operation
    );
  }

  if (
    normalized.referenceAssetIds.length > 0 &&
    !supported.referenceAssets
  ) {
    throw capabilityError(
      'unsupported_image_reference_assets_for_provider'
    );
  }

  if (
    normalized.sourceAssetId &&
    !supported.sourceAsset
  ) {
    throw capabilityError(
      'unsupported_image_source_asset_for_provider'
    );
  }

  if (
    normalized.maskAssetId &&
    !supported.maskAsset
  ) {
    throw capabilityError(
      'unsupported_image_mask_asset_for_provider'
    );
  }

  if (
    normalized.options.seed !== null &&
    !supported.seed
  ) {
    throw capabilityError(
      'unsupported_image_seed_for_provider'
    );
  }

  if (
    normalized.options.quantity > 1 &&
    !supported.quantity
  ) {
    throw capabilityError(
      'unsupported_image_quantity_for_provider'
    );
  }

  if (
    supported.maxQuantity !== null &&
    normalized.options.quantity > supported.maxQuantity
  ) {
    throw capabilityError(
      'image_quantity_exceeds_provider_limit',
      String(supported.maxQuantity)
    );
  }

  /*
   * Preserve exact user order.
   * Provider adapters may transform IDs into URLs later,
   * but they may not silently reorder or drop references.
   */
  return Object.freeze({
    operation: normalized.operation,

    referenceAssetIds:
      Object.freeze([...normalized.referenceAssetIds]),

    sourceAssetId: normalized.sourceAssetId,
    maskAssetId: normalized.maskAssetId,

    options:
      Object.freeze({
        ...normalized.options
      })
  });
}

module.exports = {
  assertImageProviderCapabilities,
  capabilityError
};