'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const registry = require('./config/cost-registry.v1.json');
const {
  mediaTypeForMime,
  maxBytesForMediaType,
  canAnalyzeWithGemini,
  analyzeGeminiAttachment
} = require('./lib/geminiFileAnalysis');
const {
  quoteAttachmentAnalysisReservation,
  quoteAttachmentAnalysisActual
} = require('./lib/attachmentAnalysisPricing');

async function run() {
  const pricedModels = registry.entries.filter(entry =>
    entry.provider === 'google-gemini' &&
    entry.capability === 'attachment_analysis' &&
    entry.enabledState === 'enabled'
  );
  assert.deepStrictEqual(
    pricedModels.map(entry => entry.modelToolId).sort(),
    ['gemini-3.7-flash', 'gemini-3.8-flash']
  );
  for (const entry of pricedModels) {
    assert.strictEqual(entry.inputUnitPriceMicroUsd, '750000');
    assert.strictEqual(entry.outputUnitPriceMicroUsd, '3750000');
    assert.strictEqual(entry.cachedUnitPriceMicroUsd, '75000');
    assert.strictEqual(entry.pricingReviewBefore, '2027-01-01T00:00:00Z');
  }

  assert.strictEqual(mediaTypeForMime('image/png'), 'image');
  assert.strictEqual(mediaTypeForMime('audio/mpeg'), 'audio');
  assert.strictEqual(mediaTypeForMime('video/mp4'), 'video');
  assert.strictEqual(mediaTypeForMime('application/pdf'), 'document');
  assert.strictEqual(mediaTypeForMime('application/octet-stream'), null);
  assert.ok(maxBytesForMediaType('image') < maxBytesForMediaType('audio'));
  assert.strictEqual(
    canAnalyzeWithGemini({
      mimeType: 'image/png',
      sizeBytes: 1024,
      result: { status: 'provider_required' }
    }),
    true
  );
  assert.strictEqual(
    canAnalyzeWithGemini({
      mimeType: 'image/png',
      sizeBytes: maxBytesForMediaType('image') + 1,
      result: { status: 'provider_required' }
    }),
    false
  );

  const reservation = quoteAttachmentAnalysisReservation({
    now: Date.parse('2026-09-15T12:00:00Z')
  });
  const actual = quoteAttachmentAnalysisActual({
    now: Date.parse('2026-09-15T12:00:00Z'),
    usage: {
      total_input_tokens: 1000,
      total_cached_tokens: 200,
      total_output_tokens: 250,
      total_thought_tokens: 50,
      total_tool_use_tokens: 10
    }
  });
  assert.ok(Number.isSafeInteger(reservation.chargedCredits));
  assert.ok(Number.isSafeInteger(actual.chargedCredits));
  assert.ok(reservation.chargedCredits >= actual.chargedCredits);
  assert.deepStrictEqual(actual.providerUsage, {
    total_input_tokens: 1000,
    total_cached_tokens: 200,
    total_output_tokens: 250,
    total_thought_tokens: 50,
    total_tool_use_tokens: 10
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zuvyr-pack053-'));
  const filePath = path.join(tempDir, 'arabic.png');
  fs.writeFileSync(filePath, Buffer.from('fake-image-bytes'));
  const calls = [];

  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const normalized = String(url);
    if (normalized.endsWith('/upload/v1beta/files')) {
      return new Response(null, {
        status: 200,
        headers: { 'x-goog-upload-url': 'https://upload.example/session' }
      });
    }
    if (normalized === 'https://upload.example/session') {
      if (options.body && typeof options.body[Symbol.asyncIterator] === 'function') {
        for await (const _chunk of options.body) {
          // Consume the upload stream before the temporary file is removed.
        }
      }
      return Response.json({
        file: {
          name: 'files/zuvyr-pack053-test',
          uri: 'https://files.example/zuvyr-pack053-test',
          state: 'ACTIVE'
        }
      });
    }
    if (normalized.endsWith('/v1beta/interactions')) {
      const request = JSON.parse(options.body);
      assert.strictEqual(request.store, false);
      assert.strictEqual(request.model, 'gemini-3.8-flash');
      assert.strictEqual(request.input[0].type, 'image');
      assert.strictEqual(request.input[0].mime_type, 'image/png');
      assert.ok(request.input[1].text.includes('original language and script'));
      assert.ok(request.input[1].text.includes('never invent'));
      return Response.json({
        status: 'completed',
        steps: [{
          type: 'model_output',
          content: [{
            type: 'text',
            text: 'Languages: Arabic\nVisible text: مرحبا\nUncertainties: none.'
          }]
        }],
        usage: {
          total_input_tokens: 120,
          total_cached_tokens: 20,
          total_output_tokens: 40,
          total_thought_tokens: 10,
          total_tool_use_tokens: 0
        }
      });
    }
    if (
      normalized.endsWith('/v1beta/files/zuvyr-pack053-test') &&
      options.method === 'DELETE'
    ) {
      return new Response(null, { status: 204 });
    }
    throw new Error('unexpected_fake_fetch:' + normalized);
  };

  try {
    const result = await analyzeGeminiAttachment({
      filePath,
      fileName: 'arabic.png',
      mimeType: 'image/png',
      sizeBytes: fs.statSync(filePath).size,
      fetchImpl,
      apiKey: 'test-only-key',
      model: 'gemini-3.8-flash',
      pollIntervalMs: 1,
      processingTimeoutMs: 1000
    });
    assert.strictEqual(result.status, 'ready');
    assert.strictEqual(result.mode, 'gemini_image');
    assert.strictEqual(result.languagePolicy, 'preserve_source_language_and_script');
    assert.ok(result.text.includes('مرحبا'));
    assert.ok(result.billing.chargedCredits >= 1);
    assert.strictEqual(result.billing.costEntryId, 'google-gemini-3-8-flash-attachment-analysis');
    assert.deepStrictEqual(result.providerFileDeletion(), {
      attempted: true,
      succeeded: true
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  assert.strictEqual(
    calls.filter(call => call.options.method === 'DELETE').length,
    1
  );

  const routeSource = fs.readFileSync(
    require.resolve('./lib/conversationRoutes'),
    'utf8'
  );
  [
    'attachmentProcessingReservation',
    'quoteAttachmentAnalysisReservation',
    "extractionResult.status === 'provider_required'",
    'creditsReserved: reservedCredits',
    'baseIngestCredits: credits'
  ].forEach(marker => assert.ok(routeSource.includes(marker), marker));

  const workerSource = fs.readFileSync(
    require.resolve('./worker'),
    'utf8'
  );
  [
    'settleAttachmentBilling',
    'settleCredits(requestId, finalCredits)',
    'attachment_credit_settlement_failed',
    'preserveProcessedAsset'
  ].forEach(marker => assert.ok(workerSource.includes(marker), marker));

  console.log(
    'PASS: Pack053 multimodal/document provider bounds, language policy, exact pricing, stored-analysis queue and settlement guards'
  );
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
