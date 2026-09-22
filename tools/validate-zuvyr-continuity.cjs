'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

function fail(message) {
  console.error('ZUVYR_CONTINUITY_FAIL:', message);
  process.exitCode = 1;
}

function readText(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    fail(`missing file: ${rel}`);
    return null;
  }
  return fs.readFileSync(abs, 'utf8');
}

function readJson(rel) {
  const text = readText(rel);
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`invalid JSON in ${rel}: ${error.message}`);
    return null;
  }
}

function gitBlobSha(text) {
  const bytes = Buffer.from(text, 'utf8');
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, bytes])).digest('hex');
}

function expect(condition, message) {
  if (!condition) fail(message);
}

const manifestPath = 'docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json';
const manifest = readJson(manifestPath);
if (!manifest) process.exit(1);

const expectedRange = manifest?.v1_contract?.readiness_range;
expect(expectedRange === 'EA-001..EA-292', `unexpected readiness range: ${expectedRange}`);
expect(manifest?.v1_contract?.final_gate === 'PACK150', 'final gate must be PACK150');
expect(manifest?.v1_contract?.cannot_hide_unfinished_v1 === true, 'cannot_hide_unfinished_v1 must be true');
expect(manifest?.v1_contract?.fresh_gap_audit_before_pack148 === true, 'fresh gap audit before PACK148 must be required');
expect(manifest?.v1_contract?.cold_start_reconstruction_test_required === true, 'cold-start reconstruction test must be required');

const bootOrder = manifest.canonical_boot_order || [];
for (const required of [
  'ZUVYR_CONTINUE_HERE.md',
  'docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json',
  'ZUVYR_MASTER_STATE.json',
  'ZUVYR_MASTER_MATRIX.md',
  'docs/zuvyr/ROADMAP_150.md',
  'docs/zuvyr/V1_READINESS_COMPLETENESS_AUDIT_2026-09-22.md',
  'docs/zuvyr/V1_READINESS_REQUIREMENTS_001_292.json',
  'docs/zuvyr/USER_OUTCOME_ENGINE.md',
  'docs/zuvyr/PACK_EXECUTION_APPENDIX.md'
]) {
  expect(bootOrder.includes(required), `boot order missing: ${required}`);
  readText(required);
}

const readinessPath = 'docs/zuvyr/V1_READINESS_REQUIREMENTS_001_292.json';
const readiness = readJson(readinessPath);
if (readiness) {
  expect(readiness.canonical_range === 'EA-001..EA-292', `matrix canonical_range mismatch: ${readiness.canonical_range}`);
  const requirements = Array.isArray(readiness.requirements) ? readiness.requirements : [];
  expect(requirements.length === 292, `expected 292 readiness requirements, got ${requirements.length}`);

  const ids = requirements.map((item) => item && item.id).filter(Boolean);
  const unique = new Set(ids);
  expect(unique.size === 292, `expected 292 unique EA IDs, got ${unique.size}`);

  const missing = [];
  for (let i = 1; i <= 292; i += 1) {
    const id = `EA-${String(i).padStart(3, '0')}`;
    if (!unique.has(id)) missing.push(id);
  }
  expect(missing.length === 0, `missing EA IDs: ${missing.join(', ')}`);

  for (const item of requirements) {
    const routes = Array.isArray(item?.routes) ? item.routes : [];
    expect(routes.length > 0, `${item?.id || 'unknown EA'} has no Pack route`);
    for (const route of routes) {
      const m = /^PACK(\d{3})$/.exec(route);
      expect(Boolean(m), `${item.id} has invalid route: ${route}`);
      if (m) {
        const n = Number(m[1]);
        expect(n >= 1 && n <= 150, `${item.id} routes outside PACK001..PACK150: ${route}`);
      }
    }
  }
}

const active = manifest.active_work || {};
expect(/^PACK\d{3}$/.test(active.pack || ''), `manifest active Pack is missing/malformed: ${active.pack}`);
expect(typeof active.pack_status === 'string' && active.pack_status.length > 0, 'manifest active pack_status missing');
expect(typeof active.phase === 'string' && active.phase.length > 0, 'manifest active phase missing');
expect(typeof active.phase_status === 'string' && active.phase_status.length > 0, 'manifest active phase_status missing');
expect(typeof active.latest_receipt === 'string' && active.latest_receipt.length > 0, 'manifest latest_receipt missing');

const receipt = readJson(active.latest_receipt);
if (receipt) {
  expect(`PACK${receipt.pack}` === active.pack, `receipt pack mismatch: PACK${receipt.pack} vs ${active.pack}`);
  expect(receipt.phase === active.phase, `receipt phase mismatch: ${receipt.phase} vs ${active.phase}`);
  expect(receipt.status === active.phase_status, `receipt status mismatch: ${receipt.status} vs ${active.phase_status}`);
  if (typeof active.pack090_allowed === 'boolean' && typeof receipt?.next?.pack090_allowed === 'boolean') {
    expect(receipt.next.pack090_allowed === active.pack090_allowed, `receipt/manifest PACK090 gate mismatch: ${receipt.next.pack090_allowed} vs ${active.pack090_allowed}`);
  }
}

const masterState = readJson('ZUVYR_MASTER_STATE.json');
if (masterState) {
  const capsule = masterState.continuity_capsule || {};
  expect(capsule.manifest === manifestPath, `MASTER_STATE manifest mismatch: ${capsule.manifest}`);
  expect(capsule.readiness_matrix === readinessPath, `MASTER_STATE readiness matrix mismatch: ${capsule.readiness_matrix}`);
  expect(capsule.readiness_range === 'EA-001..EA-292', `MASTER_STATE readiness range mismatch: ${capsule.readiness_range}`);
  expect(capsule.active_pack === active.pack, `MASTER_STATE active pack mismatch: ${capsule.active_pack} vs ${active.pack}`);
  expect(capsule.active_phase === active.phase, `MASTER_STATE active phase mismatch: ${capsule.active_phase} vs ${active.phase}`);
  expect(capsule.active_status === active.phase_status, `MASTER_STATE active status mismatch: ${capsule.active_status} vs ${active.phase_status}`);
  expect(capsule.latest_receipt === active.latest_receipt, 'MASTER_STATE latest receipt mismatch');
  expect(capsule.pack090_allowed === false, 'MASTER_STATE unexpectedly allows PACK090');
}

const continueText = readText('ZUVYR_CONTINUE_HERE.md') || '';
const continueHead = continueText.slice(0, 14000);
for (const needle of [
  'docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json',
  'docs/zuvyr/V1_READINESS_REQUIREMENTS_001_292.json',
  'EA-001…EA-292',
  'CURRENT CANONICAL EXECUTION CAPSULE',
  active.pack,
  active.phase,
  active.latest_receipt,
  'HISTORICAL CONTENT BOUNDARY',
  'tools/validate-zuvyr-continuity.cjs',
  '.github/workflows/zuvyr-continuity.yml'
]) {
  expect(continueHead.includes(needle), `CONTINUE_HERE top section missing: ${needle}`);
}

const matrixText = readText('ZUVYR_MASTER_MATRIX.md') || '';
const matrixHead = matrixText.slice(0, 9000);
for (const needle of [
  'LATEST CANONICAL CONTINUITY OVERRIDE',
  'docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json',
  'V1_READINESS_REQUIREMENTS_001_292.json',
  'EA-001…EA-292',
  'PACK089',
  '89E_PRODUCTION_ACCEPTANCE',
  active.latest_receipt
]) {
  expect(matrixHead.includes(needle), `MASTER_MATRIX canonical header missing: ${needle}`);
}

const roadmap = readText('docs/zuvyr/ROADMAP_150.md') || '';
if (readiness) {
  expect(
    readiness.generated_from_blob_sha === gitBlobSha(roadmap),
    `matrix generated_from_blob_sha does not match current ROADMAP_150 blob: matrix=${readiness.generated_from_blob_sha} actual=${gitBlobSha(roadmap)}`
  );
}
for (const needle of [
  'EA-001…EA-292',
  'V1_READINESS_REQUIREMENTS_001_292.json',
  'PACK150 — V1 final release and recovery gate',
  'V1_READY=true'
]) {
  expect(roadmap.includes(needle), `ROADMAP_150 missing readiness marker: ${needle}`);
}
expect(roadmap.includes('EA-292'), 'ROADMAP_150 missing EA-292');

const audit = readText('docs/zuvyr/V1_READINESS_COMPLETENESS_AUDIT_2026-09-22.md') || '';
expect(audit.includes('EA-001…EA-292'), 'readiness audit does not declare EA-001…EA-292');
expect(audit.includes('EA-292'), 'readiness audit missing EA-292');

const appendix = readText('docs/zuvyr/PACK_EXECUTION_APPENDIX.md') || '';
expect(appendix.includes('EA-001…EA-292'), 'PACK execution appendix does not enforce EA-001…EA-292');
expect(appendix.includes('ZUVYR_CONTINUITY_MANIFEST.json'), 'PACK execution appendix missing continuity manifest gate');
expect(appendix.includes('V1_READINESS_REQUIREMENTS_001_292.json'), 'PACK execution appendix missing EA292 matrix reference');

const snapshots = manifest.canonical_files_snapshot || {};
for (const [rel, expectedSha] of Object.entries(snapshots)) {
  const text = readText(rel);
  if (text == null) continue;
  const actualSha = gitBlobSha(text);
  expect(actualSha === expectedSha, `canonical snapshot drift for ${rel}: manifest=${expectedSha} actual=${actualSha}. Update/reconcile continuity atomically; do not ignore this failure.`);
}

const guardSnapshots = manifest.integrity_guard_files || {};
for (const [rel, expectedSha] of Object.entries(guardSnapshots)) {
  const text = readText(rel);
  if (text == null) continue;
  const actualSha = gitBlobSha(text);
  expect(actualSha === expectedSha, `continuity guard drift for ${rel}: manifest=${expectedSha} actual=${actualSha}`);
}

if (!process.exitCode) {
  console.log('ZUVYR_CONTINUITY_PASS');
  console.log(JSON.stringify({
    active_pack: active.pack,
    active_phase: active.phase,
    phase_status: active.phase_status,
    latest_receipt: active.latest_receipt,
    readiness_range: expectedRange,
    readiness_count: readiness?.requirements?.length,
    next_gate_flag_pack090_allowed: active.pack090_allowed
  }, null, 2));
}
