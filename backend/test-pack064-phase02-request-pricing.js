'use strict';

const assert = require('node:assert/strict');

const {
  normalizeImageRequest
} = require('./lib/imageRequestContract');

const {
  assertImageRequestAvailable
} = require('./lib/imageOperationRegistry');

const {
  quoteGeneration
} = require('./lib/dynamicPricing');

const SOURCE =
  '11111111-1111-4111-8111-111111111111';

const REF =
  '22222222-2222-4222-8222-222222222222';

const economics = {
  CREDIT_PRICE_USD: '0.01',
  TARGET_NET_MARGIN: '0.50',
  PAYMENT_FEE_RATE: '0.06',
  TAX_RESERVE_RATE: '0.10',
  RISK_RESERVE_RATE: '0.05',
  INFRA_RESERVE_USD: '0.002'
};

function request(operation, imageOptions = {}, references = []) {
  return normalizeImageRequest({
    imageOperation: operation,
    sourceAssetId: SOURCE,
    referenceAssetIds: references,
    imageOptions
  });
}

function run() {
  const crop = request('crop', {
    cropX: 0,
    cropY: 0,
    cropWidth: 100,
    cropHeight: 80
  });

  assert.equal(
    assertImageRequestAvailable(crop).operation,
    'crop'
  );

  const resize = request('resize', {
    resizeWidth: 640,
    resizeHeight: 480,
    resizeFit: 'cover'
  });

  assert.equal(
    assertImageRequestAvailable(resize).operation,
    'resize'
  );

  const canvas = request('canvas', {
    canvasWidth: 1600,
    canvasHeight: 1000,
    canvasBackground: '#00000000'
  });

  assert.equal(
    assertImageRequestAvailable(canvas).operation,
    'canvas'
  );

  const layers = request(
    'layers',
    {
      layerPlacements: [
        {
          left: 10,
          top: 20,
          blend: 'over'
        }
      ]
    },
    [REF]
  );

  assert.equal(
    assertImageRequestAvailable(layers).operation,
    'layers'
  );

  const text = request('text', {
    textValue: 'ZUVYR',
    textX: 20,
    textY: 80,
    textFontSize: 48,
    textColor: '#ffffffff'
  });

  assert.equal(
    assertImageRequestAvailable(text).operation,
    'text'
  );

  const batch = request(
    'batch',
    {
      batchAction: 'resize',
      resizeWidth: 512,
      resizeHeight: 512,
      resizeFit: 'fill'
    },
    [REF]
  );

  assert.equal(
    assertImageRequestAvailable(batch).operation,
    'batch'
  );

  for (const localRequest of [
    crop,
    resize,
    canvas,
    layers,
    text,
    batch
  ]) {
    const quote = quoteGeneration('image', {
      imageRequest: localRequest,
      env: economics,
      now: Date.parse(
        '2026-09-18T12:00:00Z'
      )
    });

    assert.equal(
      quote.provider,
      'local-sharp'
    );
    assert.equal(
      quote.providerCostMicroUsd,
      '0'
    );
    assert(
      Number.isSafeInteger(quote.credits) &&
      quote.credits >= 1
    );
  }

  const removeBackground =
    request('remove_background');

  assert.equal(
    assertImageRequestAvailable(
      removeBackground
    ).operation,
    'remove_background'
  );

  assert.throws(
    () =>
      quoteGeneration('image', {
        imageRequest:
          removeBackground,
        env: {
          ...economics,
          FAL_KEY: 'configured'
        },
        now: Date.parse(
          '2026-09-18T12:00:00Z'
        )
      }),
    /pack064_external_execution_disabled/
  );

  const backgroundQuote =
    quoteGeneration('image', {
      imageRequest:
        removeBackground,
      env: {
        ...economics,
        FAL_KEY: 'configured',
        PACK064_EXTERNAL_EXECUTION_ENABLED:
          'true'
      },
      now: Date.parse(
        '2026-09-18T12:00:00Z'
      )
    });

  assert.equal(
    backgroundQuote.provider,
    'fal-background'
  );
  assert.equal(
    backgroundQuote.providerCostMicroUsd,
    '0'
  );

  const relight = request('relight', {
    ratio: '16:9',
    lightingStyle: 'golden_hour'
  });

  const relightQuote =
    quoteGeneration('image', {
      imageRequest: relight,
      env: {
        ...economics,
        FAL_KEY: 'configured',
        PACK064_EXTERNAL_EXECUTION_ENABLED:
          'true'
      },
      now: Date.parse(
        '2026-09-18T12:00:00Z'
      )
    });

  assert.equal(
    relightQuote.provider,
    'fal-relight'
  );
  assert.equal(
    relightQuote.providerCostMicroUsd,
    '40000'
  );

  assert.throws(
    () =>
      assertImageRequestAvailable(
        request('upscale', {
          upscaleFactor: 2,
          upscaleCreativity: 0.2
        })
      ),
    /image_operation_disabled|image_upscale_exact_precharge_pricing_unavailable/
  );

  assert.throws(
    () =>
      request('layers', {
        layerPlacements: []
      }, [REF]),
    /invalid_image_layer_placements/
  );

  console.log(
    'PASS: PACK064 request contract validates local utilities, external execution fails closed by default, local provider cost is zero, relight is quantity-priced and upscale stays blocked pending exact MP quote'
  );
  console.log(
    'AI PROVIDER / PAYMENT / NETWORK CALLS: NONE'
  );
}

run();
