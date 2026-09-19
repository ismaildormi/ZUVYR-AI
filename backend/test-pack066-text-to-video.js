'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const videoSystem = require('./config/video-system.v1.json');
const costRegistry = require('./config/cost-registry.v1.json');
const { normalizeVideoRequest } = require('./lib/videoRequestContract');
const { assertVideoRequestAvailable } = require('./lib/videoOperationRegistry');
const {
  DEFAULT_VIDEO_MODEL,
  buildWan22TextToVideoInput,
  generateVideo
} = require('./lib/videoProvider');
const { quoteGeneration } = require('./lib/dynamicPricing');
const {
  readMp4DurationSeconds,
  fetchVideoBytes
} = require('./lib/videoGenerationRepository');

function syntheticMp4(durationSeconds = 5) {
  const ftyp = Buffer.alloc(24);
  ftyp.writeUInt32BE(24, 0);
  ftyp.write('ftyp', 4, 'ascii');
  ftyp.write('isom', 8, 'ascii');

  const mvhd = Buffer.alloc(28);
  mvhd.writeUInt32BE(28, 0);
  mvhd.write('mvhd', 4, 'ascii');
  mvhd.writeUInt8(0, 8);
  mvhd.writeUInt32BE(1000, 20);
  mvhd.writeUInt32BE(durationSeconds * 1000, 24);

  const moov = Buffer.alloc(8 + mvhd.length);
  moov.writeUInt32BE(moov.length, 0);
  moov.write('moov', 4, 'ascii');
  mvhd.copy(moov, 8);
  return Buffer.concat([ftyp, moov]);
}

async function run() {
  assert.equal(videoSystem.operations.text_to_video.enabledByDefault, true);
  assert.equal(
    videoSystem.operations.text_to_video.status,
    'implemented_pack066_paid_live_deferred'
  );
  assert.equal(videoSystem.pack066.paidExecutionDefault, false);
  assert.equal(videoSystem.pack066.model, DEFAULT_VIDEO_MODEL);

  assert.throws(
    () => assertVideoRequestAvailable(
      { operation: 'text_to_video' },
      { env: {} }
    ),
    /video_operation_paid_execution_disabled/
  );

  const enabledEnv = {
    PACK066_PAID_EXECUTION_ENABLED: 'true',
    REPLICATE_API_TOKEN: 'synthetic'
  };
  assert.equal(
    assertVideoRequestAvailable(
      { operation: 'text_to_video' },
      { env: enabledEnv }
    ).operation,
    'text_to_video'
  );

  const base = normalizeVideoRequest({ prompt: 'Ocean sunrise' });
  assert.deepEqual(base.options, {
    durationSeconds: 5,
    ratio: '16:9',
    resolution: '480p',
    fps: 16,
    audio: false,
    seed: null,
    subtitleLanguage: 'auto',
    targetLanguage: 'auto',
    exportFormat: 'mp4'
  });

  for (const [videoOptions, code] of [
    [{ durationSeconds: 8 }, 'invalid_video_duration'],
    [{ ratio: '1:1' }, 'invalid_video_ratio'],
    [{ resolution: '1080p' }, 'invalid_video_resolution'],
    [{ fps: 24 }, 'invalid_video_fps'],
    [{ audio: true }, 'video_audio_unsupported'],
    [{ exportFormat: 'webm' }, 'invalid_video_export_format'],
    [{ subtitleLanguage: 'en' }, 'unsupported_video_option']
  ]) {
    assert.throws(
      () => normalizeVideoRequest({ prompt: 'x', videoOptions }),
      error => error.code === code,
      code
    );
  }

  for (const [seconds, frames] of [[5, 81], [6, 97], [7, 113]]) {
    const request = normalizeVideoRequest({
      prompt: 'cinematic coast',
      videoOptions: {
        durationSeconds: seconds,
        ratio: '9:16',
        resolution: '720p',
        fps: 16,
        seed: 66
      }
    });
    const input = buildWan22TextToVideoInput(request);
    assert.equal(input.num_frames, frames);
    assert.equal(input.frames_per_second, 16);
    assert.equal(input.aspect_ratio, '9:16');
    assert.equal(input.resolution, '720p');
    assert.equal(input.interpolate_output, false);
    assert.equal(input.optimize_prompt, false);
    assert.equal(input.seed, 66);
  }

  let calls = 0;
  await assert.rejects(
    generateVideo(base, {
      env: { REPLICATE_API_TOKEN: 'synthetic' },
      createClient: () => ({ run: async () => { calls += 1; } })
    }),
    /pack066_paid_execution_disabled/
  );
  assert.equal(calls, 0);

  const provider = await generateVideo(base, {
    env: enabledEnv,
    createClient: token => ({
      async run(model, { input }) {
        calls += 1;
        assert.equal(token, 'synthetic');
        assert.equal(model, DEFAULT_VIDEO_MODEL);
        assert.equal(input.num_frames, 81);
        return 'https://replicate.delivery/output.mp4';
      }
    })
  });
  assert.equal(calls, 1);
  assert.equal(provider.billableUnits.unitType, 'videos');
  assert.equal(provider.billableUnits.units, 1);
  assert.equal(provider.billableUnits.resolution, '480p');

  await assert.rejects(
    generateVideo(base, {
      env: {
        ...enabledEnv,
        REPLICATE_VIDEO_MODEL: 'another/model'
      },
      createClient: () => ({ run: async () => { calls += 1; } })
    }),
    /replicate_video_model_unverified/
  );
  assert.equal(calls, 1);

  const q480 = quoteGeneration('video', {
    videoRequest: base,
    env: enabledEnv,
    now: Date.parse('2026-09-19T01:00:00Z')
  });
  assert.equal(q480.providerCostMicroUsd, '50000');
  assert.equal(q480.credits, 18);

  const req720 = normalizeVideoRequest({
    prompt: 'Ocean sunrise',
    videoOptions: { resolution: '720p' }
  });
  const q720 = quoteGeneration('video', {
    videoRequest: req720,
    env: enabledEnv,
    now: Date.parse('2026-09-19T01:00:00Z')
  });
  assert.equal(q720.providerCostMicroUsd, '100000');
  assert.equal(q720.credits, 36);

  for (const [id, price] of [
    ['replicate-wan-2.2-t2v-fast-480p', '50000'],
    ['replicate-wan-2.2-t2v-fast-720p', '100000']
  ]) {
    const entry = costRegistry.entries.find(item => item.id === id);
    assert(entry, 'missing cost entry ' + id);
    assert.equal(entry.unitType, 'videos');
    assert.equal(entry.fixedOperationPriceMicroUsd, price);
    assert.equal(entry.enabledState, 'conditional');
    assert.deepEqual(entry.requiredEnvironment, {
      name: 'PACK066_PAID_EXECUTION_ENABLED',
      value: 'true'
    });
  }

  const mp4 = syntheticMp4(5);
  assert.equal(readMp4DurationSeconds(mp4), 5);
  const fetched = await fetchVideoBytes(
    'https://fixture.invalid/video.mp4',
    {
      fetchImpl: async () => ({
        ok: true,
        headers: {
          get(name) {
            if (name.toLowerCase() === 'content-length') return String(mp4.length);
            return name.toLowerCase() === 'content-type' ? 'video/mp4' : null;
          }
        },
        async arrayBuffer() {
          return mp4.buffer.slice(mp4.byteOffset, mp4.byteOffset + mp4.byteLength);
        }
      })
    }
  );
  assert.equal(fetched.actualDurationSeconds, 5);
  assert.equal(fetched.mimeType, 'video/mp4');

  const server = fs.readFileSync(require.resolve('./server.js'), 'utf8');
  const worker = fs.readFileSync(require.resolve('./worker.js'), 'utf8');

  for (const marker of [
    'videoRequest',
    'pricingVersion: pricing.pricingVersion',
    'quotedProviderCostMicroUsd: pricing.providerCostMicroUsd'
  ]) assert(server.includes(marker), 'server missing ' + marker);

  for (const marker of [
    "require('./lib/videoGenerationRepository')",
    'providerResult = await generateVideo',
    'await settleCredits(requestId, finalCredits)',
    'canonicalContentId: persisted.contentId',
    'canonicalAssetId: persisted.assetId',
    'canonical_content_id: persisted.contentId'
  ]) assert(worker.includes(marker), 'worker missing ' + marker);

  console.log(
    'PASS: PACK066 exact Wan 2.2 T2V option mapping, verified fixed-per-video pricing, paid gate, canonical MP4 duration measurement, settlement wiring and canonical persistence contract'
  );
  console.log('PROVIDER / PAYMENT / DATABASE / NETWORK CALLS: NONE');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
