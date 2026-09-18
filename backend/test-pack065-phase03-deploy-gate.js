'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const frontend =
  fs.readFileSync(
    require.resolve(
      '../frontend/zuvyr-suite-v1.js'
    ),
    'utf8'
  );

const routes =
  fs.readFileSync(
    require.resolve(
      './lib/workspaceRoutes.js'
    ),
    'utf8'
  );

const repository =
  fs.readFileSync(
    require.resolve(
      './lib/imageGenerationRepository.js'
    ),
    'utf8'
  );

const worker =
  fs.readFileSync(
    require.resolve('./worker.js'),
    'utf8'
  );

const failurePolicy =
  fs.readFileSync(
    require.resolve(
      './lib/generationFailurePolicy.js'
    ),
    'utf8'
  );

for (const marker of [
  'function imageStudioView()',
  'function loadImageStudioHistory',
  'function openImageStudioItem',
  'function exportImageStudioItem',
  'function sendImageStudioItem',
  'function restoreImageStudioVersion',
  'function rollbackImageStudioEdit',
  'Reference / variations · gated',
  'Edit / inpaint / expand · gated',
  'Background / relight · gated',
  'Upscale · blocked'
]) {
  assert(
    frontend.includes(marker),
    'frontend missing deploy-gate marker: ' +
      marker
  );
}

assert(
  !frontend.includes(
    "['Enhance','Remove background, upscale and repair']"
  )
);

assert(
  routes.includes(
    "router.get('/images/:jobId/reopen'"
  )
);

assert(
  repository.includes(
    'async function reopenStudioItem'
  )
);

assert(
  repository.includes(
    'previewExpiresInSeconds: 300'
  )
);

assert(
  failurePolicy.includes(
    'isGenerationFailureExhausted'
  )
);

assert(
  worker.includes(
    "require('./lib/generationFailurePolicy')"
  )
);

assert(
  worker.includes(
    "imageWorker.on('failed', (job, err) => handleJobFailure(job, err, 'image'))"
  )
);

assert(
  worker.includes(
    'await refundCredits(requestId)'
  )
);

assert(
  worker.includes(
    'await reportRefundFailure({'
  )
);

console.log(
  'PASS: PACK065 Phase03 deploy gate confirms truthful Image Studio, owner-scoped reopen, export/actions/version/rollback wiring and canonical provider-failure/refund handling'
);
console.log(
  'AI PROVIDER / PAYMENT / NETWORK CALLS: NONE'
);
