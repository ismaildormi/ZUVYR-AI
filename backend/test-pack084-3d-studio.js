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
const viewerRuntime = read('../frontend/zuvyr-model3d-viewer.js');
const css = read('../frontend/zuvyr-suite-v1.css');
const packageJson = JSON.parse(read('package.json'));

assert.equal(config.pack, 84);
assert.equal(config.truthRules.exposeOnlyManifestBackedExports, true);
assert.equal(config.truthRules.unsupportedControlsHiddenOrBlocked, true);
assert.equal(config.truthRules.generationRemainsOwnedByPack083M18, true);
assert.equal(config.viewer.engine, 'zuvyr-local-webgl-glb');
assert.equal(config.viewer.scriptUrl, '/zuvyr-model3d-viewer.js?v=pack084-1');
assert.equal(config.truthRules.thirdPartyViewerRuntime, false);
assert.equal(config.truthRules.viewerFetchCredentials, 'omit');
assert.equal(config.truthRules.viewerReferrerPolicy, 'no-referrer');

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
assert.equal(blocked.generation.options.defaultFaceCount, 500000);
assert.equal(blocked.generation.options.minFaceCount, 40000);
assert.equal(blocked.generation.options.maxFaceCount, 1500000);
assert.equal(config.viewer.version, 'pack084-v1');
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
  "['3d','⬡','3D Studio','ready']",
  "var nativeIds=['3d'",
  'data-zs-3d-form',
  'data-zs-3d-history',
  'data-zs-3d-download',
  'data-zs-3d-cancel',
  '/api/3d/studio-capabilities',
  '/api/3d/history',
  '/api/generate-3d',
  '/api/job-status/',
  '/api/3d-jobs/',
  'data-zs-3d-model-viewer',
  'data-zs-3d-camera-reset',
  'data-zs-3d-exposure',
  '/zuvyr-model3d-viewer.js?v=pack084-1'
]) {
  assert(frontend.includes(marker), marker);
}

assert.equal(
  frontend.includes('ajax.googleapis.com/ajax/libs/model-viewer/model-viewer.min.js'),
  false,
  'unversioned model-viewer CDN is forbidden'
);
for (const marker of [
  '/* ZUVYR PACK084 3D STUDIO */',
  '.zs-3d-model-viewer',
  '.zs-3d-history-item',
  '.zs-3d-detail-grid'
]) {
  assert(css.includes(marker), marker);
}
assert(
  String(packageJson.scripts['test:media-checkpoint'] || '')
    .includes('node test-pack084-3d-studio.js'),
  'PACK084 must remain in the media checkpoint'
);


assert(frontend.includes('<zuvyr-model3d-viewer'));
assert(frontend.includes('/zuvyr-model3d-viewer.js?v=pack084-1'));
assert.equal(frontend.includes('ajax.googleapis.com'), false);
assert.equal(frontend.includes('<model-viewer'), false);

for (const marker of [
  "customElements.define('zuvyr-model3d-viewer'",
  "credentials:'omit'",
  "referrerPolicy:'no-referrer'",
  "GLB_MAGIC = 0x46546c67",
  "getContext('webgl2'",
  "viewer_model_too_large",
  "resetCamera()"
]) {
  assert(viewerRuntime.includes(marker), marker);
}
assert.equal(/https:\/\//i.test(viewerRuntime), false, 'viewer runtime must not embed third-party https origins');

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
console.log('PASS: PACK084 viewer is self-hosted and does not execute third-party runtime code');
console.log('PASS: PACK084 pins the self-hosted WebGL viewer runtime and ships responsive Studio CSS');
console.log('LIVE 3D PROVIDER / PAYMENT / PRODUCTION MUTATION CALLS: NONE');
