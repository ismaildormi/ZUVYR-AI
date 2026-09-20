'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  studioCapabilities,
  exportRoleForFormat,
  blockedExportReason
} = require('./lib/model3dStudioPolicy');
const {
  validateObj,
  validateFbx
} = require('./lib/model3dGenerationRepository');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const config = require('./config/model3d-studio.v1.json');
const server = read('server.js');
const frontend = read('../frontend/zuvyr-suite-v1.js');

assert.equal(config.pack, 84);
assert.equal(config.truthRules.exposeOnlyManifestBackedExports, true);
assert.equal(config.truthRules.unsupportedControlsHiddenOrBlocked, true);
assert.equal(config.truthRules.generationRemainsOwnedByPack083M18, true);

const blocked = studioCapabilities({
  live: false,
  externalGate: 'M18',
  provider: 'fal',
  blockers: ['pack083_m18_unverified']
});
assert.equal(blocked.pack, 84);
assert.equal(blocked.generation.liveExecution, false);
assert.equal(blocked.generation.externalGate, 'M18');
assert(blocked.generation.blockers.includes('pack083_m18_unverified'));
assert.equal(blocked.operations.remesh.status, 'blocked_no_verified_executor');
assert.equal(blocked.operations.retopo.status, 'blocked_no_verified_executor');
assert.equal(blocked.operations.rig.status, 'blocked_no_verified_executor');
assert.equal(blocked.operations.animation.status, 'blocked_no_verified_executor');
assert.equal(blocked.operations.retarget.status, 'blocked_no_verified_executor');
assert.equal(exportRoleForFormat('glb'), 'export_glb');
assert.equal(exportRoleForFormat('obj'), 'export_obj');
assert.equal(exportRoleForFormat('fbx'), 'export_fbx');
assert.equal(exportRoleForFormat('usdz'), 'export_usdz');
assert.equal(exportRoleForFormat('stl'), null);
assert.equal(blockedExportReason('gltf'), 'no_canonical_converter');
assert.equal(blockedExportReason('stl'), 'no_canonical_converter');
assert.equal(blockedExportReason('3mf'), 'no_canonical_converter');

validateObj(Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'));
assert.throws(
  () => validateObj(Buffer.from('this is not an obj mesh')),
  error => error.code === 'model3d_obj_structure_invalid'
);
validateFbx(Buffer.concat([
  Buffer.from('Kaydara FBX Binary'),
  Buffer.alloc(32)
]));
assert.throws(
  () => validateFbx(Buffer.from('not-an-fbx-file-with-padding-000000')),
  error => error.code === 'model3d_fbx_structure_invalid'
);

for (const marker of [
  "require('./lib/model3dStudioPolicy')",
  "app.get('/api/3d/studio-capabilities'",
  'studioCapabilities(availability)',
  "app.get('/api/3d/history'",
  "app.get('/api/3d-jobs/:jobId/download/:role'",
  "app.post('/api/3d-jobs/:jobId/cancel'"
]) {
  assert(server.includes(marker), marker);
}

for (const marker of [
  'ZUVYR PACK084 3D STUDIO',
  "data-zuvyr-section=\"3d\"",
  'data-zs-3d-form',
  'data-zs-3d-history',
  'data-zs-3d-download',
  'data-zs-3d-cancel',
  '/api/3d/studio-capabilities',
  '/api/3d/history',
  '/api/generate-3d',
  '/api/job-status/',
  '/api/3d-jobs/'
]) {
  assert(frontend.includes(marker), marker);
}

for (const prohibitedLiveControl of [
  'data-zs-3d-remesh-live',
  'data-zs-3d-retopo-live',
  'data-zs-3d-rig-live',
  'data-zs-3d-animation-live',
  'data-zs-3d-retarget-live'
]) {
  assert.equal(frontend.includes(prohibitedLiveControl), false, prohibitedLiveControl);
}

console.log('PASS: PACK084 Studio inherits PACK083 generation gates and exposes no fake post-processing executor');
console.log('PASS: PACK084 export policy is manifest-backed; unsupported GLTF/STL/3MF remain blocked');
console.log('PASS: PACK084 OBJ/FBX structural validation guards persisted export artifacts');
console.log('PASS: PACK084 frontend wiring covers capabilities/history/generate/status/cancel/download with blocked unsupported operations');
console.log('LIVE 3D PROVIDER / PAYMENT / PRODUCTION MUTATION CALLS: NONE');
