'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeModel3dRequest } = require('./lib/model3dRequestContract');
const {
  model3dAvailability,
  assertModel3dLiveAvailable
} = require('./lib/model3dPolicy');
const {
  buildInput,
  normalizeProviderResult,
  serializeProviderResult,
  restoreProviderResult,
  submitModel3d,
  fetchModel3dResult
} = require('./lib/model3dProvider');
const { quoteGeneration } = require('./lib/dynamicPricing');

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const migration = read('83_pack083_3d_generation.sql');
const server = read('server.js');
const worker = read('worker.js');
const queue = read('lib/queue.js');
const repository = read('lib/model3dGenerationRepository.js');
const resolver = read('lib/model3dInputResolver.js');
assert(resolver.includes("require('./assetStorageContract')"));
assert(!resolver.includes("require('./assetStoragePolicy')"));
const conversationMemory = read('lib/conversationMemory.js');
const plans = require('./config/plans.json');
const cfg = require('./config/model3d-system.v1.json');
const flags = require('./config/feature-flags.json');

const UUIDS = {
  front: '11111111-1111-4111-8111-111111111111',
  back: '22222222-2222-4222-8222-222222222222',
  left: '33333333-3333-4333-8333-333333333333'
};

const textRequest = normalizeModel3dRequest({
  prompt: 'a small product pedestal',
  model3dOperation: 'text_to_3d',
  model3dOptions: {}
});
assert.equal(textRequest.operation, 'text_to_3d');
assert.equal(textRequest.viewCount, 0);
assert.equal(textRequest.options.faceCount, 500000);

const imageRequest = normalizeModel3dRequest({
  model3dOperation: 'image_to_3d',
  model3dViews: { front: UUIDS.front },
  model3dOptions: { enablePbr: true }
});
assert.equal(imageRequest.viewCount, 1);
assert.equal(imageRequest.pricing.usesPbrAddon, true);

const multiRequest = normalizeModel3dRequest({
  model3dOperation: 'multiview_to_3d',
  model3dViews: {
    front: UUIDS.front,
    back: UUIDS.back,
    left: UUIDS.left
  },
  model3dOptions: {
    enablePbr: true,
    faceCount: 600000
  }
});
assert.equal(multiRequest.pricing.usesMultiviewAddon, true);
assert.equal(multiRequest.pricing.usesCustomFaceCountAddon, true);

assert.throws(
  () => normalizeModel3dRequest({
    model3dOperation: 'image_to_3d',
    model3dViews: {}
  }),
  error => error.code === 'model3d_image_front_view_required'
);
assert.throws(
  () => normalizeModel3dRequest({
    model3dOperation: 'multiview_to_3d',
    model3dViews: { front: UUIDS.front }
  }),
  error => error.code === 'model3d_multiview_requires_multiple_views'
);

const closed = model3dAvailability({});
assert.equal(closed.live, false);
for (const blocker of [
  'pack083_live_billing_disabled',
  'pack083_m18_unverified',
  'pack083_paid_execution_disabled',
  'pack083_fal_not_configured'
]) {
  assert(closed.blockers.includes(blocker), blocker);
}
assert.throws(
  () => assertModel3dLiveAvailable({}),
  error =>
    error.code === 'model3d_live_gate_closed' &&
    error.blockers.includes('pack083_m18_unverified')
);

const enabledEnv = {
  LIVE_BILLING_ALLOWED: 'true',
  ZUVYR_M18_VERIFIED: 'true',
  PACK083_3D_PAID_EXECUTION_ENABLED: 'true',
  FAL_KEY: 'test-only-fal-key'
};
assert.equal(model3dAvailability(enabledEnv).live, true);

const baseQuote = quoteGeneration('3d', {
  env: enabledEnv,
  now: Date.parse('2026-09-19T00:00:00Z'),
  model3dRequest: textRequest
});
assert.equal(baseQuote.provider, 'fal');
assert.equal(baseQuote.providerCostMicroUsd, '375000');
assert(Number.isSafeInteger(baseQuote.credits));
assert(baseQuote.credits >= 1);

const fullQuote = quoteGeneration('3d', {
  env: enabledEnv,
  now: Date.parse('2026-09-19T00:00:00Z'),
  model3dRequest: multiRequest
});
assert.equal(fullQuote.providerCostMicroUsd, '825000');
assert(fullQuote.credits >= baseQuote.credits);

const providerInput = buildInput(multiRequest, {
  views: {
    front: { url: 'https://example.com/front.png' },
    back: { url: 'https://example.com/back.png' },
    left: { url: 'https://example.com/left.png' }
  }
});
assert.equal(providerInput.input_image_url, 'https://example.com/front.png');
assert.equal(providerInput.back_image_url, 'https://example.com/back.png');
assert.equal(providerInput.left_image_url, 'https://example.com/left.png');
assert.equal(providerInput.enable_pbr, true);
assert.equal(providerInput.face_count, 600000);

const normalizedProvider = normalizeProviderResult({
  data: {
    model_glb: {
      url: 'https://example.com/model.glb',
      content_type: 'model/gltf-binary',
      file_name: 'model.glb',
      file_size: 1000
    },
    thumbnail: {
      url: 'https://example.com/thumb.png',
      content_type: 'image/png',
      file_name: 'thumb.png',
      file_size: 100
    },
    model_urls: {
      obj: {
        url: 'https://example.com/model.obj',
        content_type: 'text/plain',
        file_name: 'model.obj',
        file_size: 200
      }
    },
    seed: 7
  }
});
assert(normalizedProvider.artifacts.some(x => x.role === 'model_glb'));
assert(normalizedProvider.artifacts.some(x => x.role === 'thumbnail'));
assert(normalizedProvider.artifacts.some(x => x.role === 'export_obj'));
const restored = restoreProviderResult(serializeProviderResult(normalizedProvider));
assert(restored);
assert.equal(restored.artifacts[0].role, 'model_glb');

(async () => {
  let clientCreations = 0;
  let submits = 0;
  let results = 0;
  const mockClient = {
    queue: {
      submit: async () => {
        submits += 1;
        return { request_id: 'falreq_123456789' };
      },
      result: async () => {
        results += 1;
        return {
          data: {
            model_glb: {
              url: 'https://example.com/model.glb',
              content_type: 'model/gltf-binary',
              file_name: 'model.glb',
              file_size: 1000
            }
          }
        };
      }
    }
  };
  const factory = () => {
    clientCreations += 1;
    return mockClient;
  };

  await assert.rejects(
    () => submitModel3d(textRequest, {
      env: {},
      createFalClient: factory
    }),
    error => error.code === 'model3d_live_gate_closed'
  );
  assert.equal(clientCreations, 0);
  assert.equal(submits, 0);

  const submitted = await submitModel3d(textRequest, {
    env: enabledEnv,
    createFalClient: factory
  });
  assert.equal(submitted.providerRequestId, 'falreq_123456789');
  assert.equal(submits, 1);

  const result = await fetchModel3dResult({
    operation: textRequest.operation,
    providerRequestId: submitted.providerRequestId
  }, {
    env: { FAL_KEY: 'test-only-fal-key' },
    createFalClient: factory
  });
  assert.equal(results, 1);
  assert(result.artifacts.some(x => x.role === 'model_glb'));

  for (const marker of [
    'model3d_operation text',
    'model3d_submission_started_at',
    'model3d_provider_request_id',
    'model3d_provider_result',
    'model3d_output_manifest',
    'model3d_execution_claimed_at',
    'claim_zuvyr_model3d_execution_pack083',
    'mark_zuvyr_model3d_submission_started_pack083',
    'record_zuvyr_model3d_provider_request_pack083',
    'record_zuvyr_model3d_provider_result_pack083',
    'request_zuvyr_model3d_job_cancel_pack083',
    'for update',
    'to service_role'
  ]) assert(migration.toLowerCase().includes(marker.toLowerCase()), marker);
  assert(!migration.includes("'completed'"));
  assert(migration.includes("'done'"));
  assert(!/grant\s+(?:select|insert|update|delete)[^;]*\s+to\s+(?:anon|authenticated)/i.test(migration));

  for (const marker of [
    "app.post(\n  '/api/generate-3d'",
    "rateLimit('3d')",
    "requirePlanFeature('3d')",
    "usageKind: feature === '3d' ? 'generation' : null",
    "app.get('/api/3d/history'",
    "app.get('/api/3d-jobs/:jobId/download/:role'",
    "app.post('/api/3d-jobs/:jobId/cancel'",
    "request_zuvyr_model3d_job_cancel_pack083",
    "model3dQueue.getJob",
    "role: 'model_glb'",
    "role: 'thumbnail'"
  ]) assert(server.includes(marker), marker);

  const handlerStart = server.indexOf('async function handleGenerationRequest');
  const handlerEnd = server.indexOf('\nfunction requirePlanFeature', handlerStart);
  const generationHandler = server.slice(
    handlerStart,
    handlerEnd > handlerStart ? handlerEnd : server.length
  );
  const quoteIndex = generationHandler.indexOf("pricing = quoteGeneration(");
  const reserveIndex = generationHandler.indexOf("reservation = await reserveCredits");
  assert(
    quoteIndex >= 0 && reserveIndex > quoteIndex,
    '3D pricing gate must run before credit reservation inside handleGenerationRequest'
  );
  assert(generationHandler.includes("feature !== 'code' && feature !== '3d'"));
  assert(generationHandler.includes("prompt: model3dRequest?.prompt ?? videoRequest?.prompt ?? prompt"));
  assert(generationHandler.includes("originalPrompt: model3dRequest?.prompt ?? videoRequest?.prompt ?? prompt"));

  for (const marker of [
    'async function processModel3dJob',
    'claim_zuvyr_model3d_execution_pack083',
    'mark_zuvyr_model3d_submission_started_pack083',
    'record_zuvyr_model3d_provider_request_pack083',
    'record_zuvyr_model3d_provider_result_pack083',
    'pack083_model3d_submission_outcome_uncertain',
    'restoreModel3dProviderResult',
    'model3dRepository.persistProviderResult',
    "await settleCredits(requestId, finalCredits)",
    "status: 'done'",
    "new Worker(\n  'zuvyr-3d-generation'",
    "handleJobFailure(job, err, '3d')"
  ]) assert(worker.includes(marker), marker);

  const markStartedIndex = worker.indexOf("'mark_zuvyr_model3d_submission_started_pack083'");
  const submitIndex = worker.indexOf('await submitModel3d');
  const recordRequestIndex = worker.indexOf("'record_zuvyr_model3d_provider_request_pack083'");
  assert(markStartedIndex >= 0 && submitIndex > markStartedIndex && recordRequestIndex > submitIndex);

  assert(queue.includes("new Queue('zuvyr-3d-generation'"));
  assert.equal(plans.rateLimitsPerMinute['3d'], plans.rateLimitsPerMinute.video);
  assert.equal(plans.tiers.pro.features['3d'], true);
  assert.equal(plans.tiers.plus.features['3d'], false);
  assert.equal(flags.model3d_generation.enabled, false);

  assert(repository.includes('createModel3dGenerationRepository'));
  assert(repository.includes('canonical_content_id'));
  assert(repository.includes('model3d_output_manifest'));
  assert(repository.includes('createSignedDownload'));
  assert(repository.includes("asset_type:'model3d'"));
  assert(resolver.includes('assertOwnedStoragePath'));
  assert(resolver.includes('createSignedDownload'));
  assert(conversationMemory.includes("'model3d'"));

  console.log('PASS: PACK083 request/provider/pricing contracts are exact and fail-closed');
  console.log('PASS: PACK083 provider submission is checkpointed before canonical persistence');
  console.log('PASS: PACK083 API/worker/queue/cancel/history/download lifecycle is wired');
  console.log('PASS: PACK083 canonical storage and owner-scoped input/output lineage are wired');
  console.log('LIVE PROVIDER/PAYMENT CALLS: 0 (mock-only provider verification)');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
