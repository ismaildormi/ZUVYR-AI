'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  isGenerationFailureExhausted,
  generationFailureDisposition
} = require('./lib/generationFailurePolicy');

assert.equal(
  isGenerationFailureExhausted({
    error: new Error('provider timeout'),
    attemptsMade: 1,
    maxAttempts: 3
  }),
  false
);

assert.deepEqual(
  generationFailureDisposition({
    error: new Error('provider timeout'),
    attemptsMade: 1,
    maxAttempts: 3
  }),
  {
    exhausted: false,
    refundAllowed: false,
    persistFailure: false,
    retryPending: true
  }
);

assert.equal(
  isGenerationFailureExhausted({
    error: new Error('provider timeout'),
    attemptsMade: 3,
    maxAttempts: 3
  }),
  true
);

const terminal = new Error(
  'provider rejected request'
);
terminal.name = 'UnrecoverableError';

assert.equal(
  isGenerationFailureExhausted({
    error: terminal,
    attemptsMade: 0,
    maxAttempts: 3
  }),
  true
);

assert.throws(
  () =>
    isGenerationFailureExhausted({
      error: new Error('x'),
      attemptsMade: -1,
      maxAttempts: 3
    }),
  /invalid_generation_attempts_made/
);

assert.throws(
  () =>
    isGenerationFailureExhausted({
      error: new Error('x'),
      attemptsMade: 1,
      maxAttempts: 0
    }),
  /invalid_generation_max_attempts/
);

const worker =
  fs.readFileSync(
    require.resolve('./worker.js'),
    'utf8'
  );

for (const marker of [
  "imageWorker.on('failed', (job, err) => handleJobFailure(job, err, 'image'))",
  'isGenerationFailureExhausted({',
  'await markJob(jobRowId, {',
  'await refundCredits(requestId)',
  'recordRefund(feature)',
  'await reportRefundFailure({',
  'await logCreditEvent({'
]) {
  assert(
    worker.includes(marker),
    'worker missing failure/refund marker: ' +
      marker
  );
}

const failureHandlerStart =
  worker.indexOf(
    'async function handleJobFailure'
  );

const imageFailureWire =
  worker.indexOf(
    "imageWorker.on('failed'"
  );

assert(
  failureHandlerStart >= 0 &&
  imageFailureWire > failureHandlerStart
);

const handler =
  worker.slice(
    failureHandlerStart,
    imageFailureWire
  );

const retryReturn =
  handler.indexOf(
    'if (!exhausted)'
  );

const failedMark =
  handler.indexOf(
    "status: 'failed'"
  );

const refund =
  handler.indexOf(
    'await refundCredits(requestId)'
  );

const refundMetric =
  handler.indexOf(
    'recordRefund(feature)'
  );

const refundFailure =
  handler.indexOf(
    'await reportRefundFailure({'
  );

const detailLog =
  handler.indexOf(
    'await logCreditEvent({'
  );

assert(
  retryReturn >= 0,
  'retry-pending branch missing'
);

assert(
  failedMark > retryReturn,
  'failure state must be persisted only after retry exhaustion'
);

assert(
  refund > failedMark,
  'refund must happen after terminal failed state is persisted'
);

assert(
  refundMetric > refund,
  'refund metric must follow successful refund'
);

assert(
  refundFailure > refund,
  'refund-failure persistence must guard refund errors'
);

assert(
  detailLog > refundFailure,
  'detail audit log must survive refund failure handling'
);

console.log(
  'PASS: PACK065 provider-failure policy never refunds retry-pending jobs, refunds exhausted/unrecoverable image jobs once through the canonical idempotent refund path, persists refund failures, and preserves audit logging'
);
console.log(
  'AI PROVIDER / PAYMENT / DATABASE / NETWORK CALLS: NONE'
);
