'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));
const fail = (msg) => { throw new Error('[ZUVYR continuity] ' + msg); };

const manifestPath = 'docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json';
const matrixPath = 'docs/zuvyr/V1_READINESS_REQUIREMENTS_001_292.json';
const roadmapPath = 'docs/zuvyr/ROADMAP_150.md';
const auditPath = 'docs/zuvyr/V1_READINESS_COMPLETENESS_AUDIT_2026-09-22.md';
const continuePath = 'ZUVYR_CONTINUE_HERE.md';
const masterStatePath = 'ZUVYR_MASTER_STATE.json';
const masterMatrixPath = 'ZUVYR_MASTER_MATRIX.md';
const appendixPath = 'docs/zuvyr/PACK_EXECUTION_APPENDIX.md';

for (const p of [manifestPath, matrixPath, roadmapPath, auditPath, continuePath, masterStatePath, masterMatrixPath, appendixPath]) {
  if (!fs.existsSync(path.join(root, p))) fail('missing canonical file: ' + p);
}

const manifest = readJson(manifestPath);
const matrix = readJson(matrixPath);
const masterState = readJson(masterStatePath);
const roadmap = read(roadmapPath);
const audit = read(auditPath);
const cont = read(continuePath);
const masterMatrix = read(masterMatrixPath);
const appendix = read(appendixPath);

if (manifest.v1_contract?.readiness_range !== 'EA-001..EA-292') fail('manifest readiness range is not EA-001..EA-292');
if (!/^PACK\\d{3}$/.test(manifest.active_work?.pack || '')) fail('manifest active Pack is missing or malformed');
if (!manifest.active_work?.phase) fail('manifest active phase is missing');
if (!manifest.active_work?.latest_receipt) fail('manifest latest receipt is missing');
if (!fs.existsSync(path.join(root, manifest.active_work.latest_receipt))) fail('manifest latest receipt does not exist: ' + manifest.active_work.latest_receipt);

const reqs = Array.isArray(matrix.requirements) ? matrix.requirements : [];
if (reqs.length !== 292) fail('readiness requirement count must be 292, got ' + reqs.length);
const ids = reqs.map((r) => r.id);
const unique = new Set(ids);
if (unique.size !== 292) fail('duplicate EA requirement IDs detected');
for (let i = 1; i <= 292; i += 1) {
  const id = 'EA-' + String(i).padStart(3, '0');
  if (!unique.has(id)) fail('missing readiness requirement ' + id);
}
for (const req of reqs) {
  if (!Array.isArray(req.routes) || req.routes.length === 0) fail(req.id + ' has no owning Pack route');
  for (const route of req.routes) {
    if (!/^PACK\d{3}$/.test(route)) fail(req.id + ' has malformed route ' + route);
  }
}

if (matrix.canonical_range !== 'EA-001..EA-292') fail('matrix canonical range drift');
if (matrix.final_v1_rule?.pack150_only_v1_ready !== true) fail('PACK150-only V1_READY rule missing');
if (matrix.final_v1_rule?.fresh_gap_audit_before_pack148 !== true) fail('fresh pre-PACK148 gap audit rule missing');
if (matrix.final_v1_rule?.cold_start_reconstruction_test !== true) fail('cold-start reconstruction test rule missing');

const requiredText = [
  [roadmap, 'EA-292', 'roadmap missing EA-292'],
  [roadmap, 'V1_READINESS_REQUIREMENTS_001_292.json', 'roadmap not bound to EA292 matrix'],
  [audit, 'EA-292', 'readiness audit missing EA-292'],
  [cont, 'docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json', 'continue file does not load continuity manifest'],
  [cont, 'V1_READINESS_REQUIREMENTS_001_292.json', 'continue file does not load EA292 matrix'],
  [appendix, 'Mandatory continuity reconstruction gate', 'pack appendix missing continuity gate'],
  [appendix, 'V1_READINESS_REQUIREMENTS_001_292.json', 'pack appendix not bound to EA292 matrix'],
  [masterMatrix, 'LATEST CANONICAL CONTINUITY OVERRIDE', 'master matrix missing latest continuity override'],
  [masterMatrix, manifest.active_work.pack, 'master matrix current Pack override does not match manifest active Pack']
];
for (const [haystack, needle, msg] of requiredText) if (!haystack.includes(needle)) fail(msg);

if (masterState.continuity_capsule?.active_pack !== manifest.active_work.pack) fail('MASTER_STATE continuity capsule active Pack does not match manifest');
if (masterState.continuity_capsule?.readiness_range !== 'EA-001..EA-292') fail('MASTER_STATE continuity capsule readiness range drift');
if (masterState.continuity_capsule?.manifest !== manifestPath) fail('MASTER_STATE continuity capsule manifest path drift');

const blocked = new Set(matrix.final_v1_rule?.blocked_final_states || []);
for (const state of ['KNOWN_GAP','UNKNOWN','DEFERRED','NOT_TESTED','PARTIAL','SOURCE_ONLY','MOCK_ONLY','ENGINEERING_ONLY','BLOCKED_BUT_ADVERTISED']) {
  if (!blocked.has(state)) fail('final blocked state missing: ' + state);
}

console.log('[ZUVYR continuity] PASS: canonical files present, EA-001..EA-292 contiguous/routed, anti-loss boot and PACK150 gates intact.');
