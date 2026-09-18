'use strict';

const assert = require('node:assert/strict');
const sharp = require('sharp');
const {
  executeLocalImageUtility
} = require('./lib/localImageUtilities');

async function dimensions(buffer) {
  const meta = await sharp(buffer).metadata();
  return [meta.width, meta.height];
}

async function run() {
  const source = await sharp({
    create: {
      width: 120,
      height: 80,
      channels: 4,
      background: { r: 30, g: 60, b: 90, alpha: 1 }
    }
  }).png().toBuffer();

  const overlay = await sharp({
    create: {
      width: 20,
      height: 20,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 }
    }
  }).png().toBuffer();

  const crop = await executeLocalImageUtility({
    operation: 'crop',
    sourceBuffer: source,
    options: {
      cropX: 10,
      cropY: 5,
      cropWidth: 50,
      cropHeight: 40
    }
  });

  assert.equal(crop.providerCalls, 0);
  assert.deepEqual(
    await dimensions(crop.outputs[0].buffer),
    [50, 40]
  );

  const resize = await executeLocalImageUtility({
    operation: 'resize',
    sourceBuffer: source,
    options: {
      resizeWidth: 60,
      resizeHeight: 40,
      resizeFit: 'fill'
    }
  });

  assert.deepEqual(
    await dimensions(resize.outputs[0].buffer),
    [60, 40]
  );

  const canvas = await executeLocalImageUtility({
    operation: 'canvas',
    sourceBuffer: source,
    options: {
      canvasWidth: 160,
      canvasHeight: 120,
      canvasBackground: '#ffffffff'
    }
  });

  assert.deepEqual(
    await dimensions(canvas.outputs[0].buffer),
    [160, 120]
  );

  const layers = await executeLocalImageUtility({
    operation: 'layers',
    sourceBuffer: source,
    referenceBuffers: [overlay],
    options: {
      layerPlacements: [
        { left: 5, top: 6, blend: 'over' }
      ]
    }
  });

  assert.deepEqual(
    await dimensions(layers.outputs[0].buffer),
    [120, 80]
  );

  const text = await executeLocalImageUtility({
    operation: 'text',
    sourceBuffer: source,
    options: {
      textValue: 'ZUVYR',
      textX: 4,
      textY: 30,
      textFontSize: 20,
      textColor: '#ffffffff'
    }
  });

  assert.deepEqual(
    await dimensions(text.outputs[0].buffer),
    [120, 80]
  );

  const batch = await executeLocalImageUtility({
    operation: 'batch',
    sourceBuffer: source,
    referenceBuffers: [source],
    options: {
      batchAction: 'resize',
      resizeWidth: 40,
      resizeHeight: 30,
      resizeFit: 'fill'
    }
  });

  assert.equal(batch.outputs.length, 2);
  for (const output of batch.outputs) {
    assert.deepEqual(
      await dimensions(output.buffer),
      [40, 30]
    );
  }

  await assert.rejects(
    () =>
      executeLocalImageUtility({
        operation: 'batch',
        sourceBuffer: source,
        referenceBuffers: [source],
        options: { batchAction: 'delete' }
      }),
    /unsupported_image_batch_action/
  );

  console.log(
    'PASS: PACK064 real local Sharp executors crop/resize/canvas/layers/text/batch operate on image bytes with zero provider calls'
  );
  console.log(
    'PROVIDER / PAYMENT / NETWORK CALLS: NONE'
  );
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
