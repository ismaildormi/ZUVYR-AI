'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const file of [
  'lib/audioOperationRegistry.js',
  'lib/audioRequestContract.js',
  'lib/audioJobContract.js',
  'lib/voiceSessionContract.js'
]) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  assert(!source.includes('fetch('), `${file} must not call providers`);
  assert(!source.includes('reserveCredits('), `${file} must not mutate credits`);
  assert(!source.includes("require('child_process')"), `${file} must not spawn processes`);
}

const routes = fs.readFileSync(path.join(__dirname, 'lib/audioStudioRoutes.js'), 'utf8');
const provider = fs.readFileSync(path.join(__dirname, 'lib/audioProvider.js'), 'utf8');
const cleanup = fs.readFileSync(path.join(__dirname, 'lib/localAudioCleanup.js'), 'utf8');

assert(!routes.includes('fetch('), 'authenticated audio routes must not directly call external providers');
assert(!routes.includes("require('child_process')"), 'audio routes must not spawn local tools');
assert(
  provider.indexOf('PACK071_STT_PAID_EXECUTION_ENABLED') <
  provider.indexOf('fetchImpl(buildDeepgramUrl(request)'),
  'paid STT gate must be checked before provider fetch'
);
assert(cleanup.includes('shell:false'), 'local FFmpeg execution must not use shell interpolation');

console.log('PASS: Pack07 contracts stay side-effect free; Pack071 provider/local execution is isolated behind verified runtime gates');
