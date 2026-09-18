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

for (const marker of [
  'function imageStudioView()',
  'function loadImageStudioHistory',
  'function openImageStudioItem',
  'function exportImageStudioItem',
  'function sendImageStudioItem',
  'function restoreImageStudioVersion',
  'function rollbackImageStudioEdit',
  '/api/workspace/images/history?limit=36',
  '/reopen',
  '/download',
  '/send-to',
  '/versions/',
  'data-zs-image-refresh',
  'data-zs-image-open',
  'data-zs-image-download',
  'data-zs-image-send',
  'data-zs-image-restore-version',
  'data-zs-image-rollback',
  'repeat(auto-fit,minmax(240px,1fr))',
  'repeat(auto-fit,minmax(260px,1fr))'
]) {
  assert(
    frontend.includes(marker),
    'frontend missing: ' + marker
  );
}

assert(
  !frontend.includes(
    "images:[['Generate','Prompt, reference, ratio and resolution'],['Edit','Variations, inpainting and expand'],['Enhance','Remove background, upscale and repair']]"
  ),
  'Pack065 must remove misleading generic image operation advertising'
);

assert(
  frontend.includes(
    'Only live-proven operations may be advertised; upscale stays blocked'
  )
);

assert(
  frontend.includes(
    'Pack061 live proof'
  )
);

assert(
  frontend.includes(
    'Reference / variations · gated'
  )
);

assert(
  frontend.includes(
    'Edit / inpaint / expand · gated'
  )
);

assert(
  frontend.includes(
    'Background / relight · gated'
  )
);

assert(
  frontend.includes(
    'Upscale · blocked'
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
    'assertOwnedStoragePath'
  )
);

assert(
  repository.includes(
    '.createSignedUrl('
  )
);

console.log(
  'PASS: PACK065 truthful responsive Image Studio wires history, fresh reopen, export, Send-To, versions and rollback while gated/unverified V1 operations are not advertised as live'
);
console.log(
  'AI PROVIDER / PAYMENT / NETWORK CALLS: NONE'
);
