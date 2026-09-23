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

const currentStatePath = manifest?.current_state_override?.path || 'docs/zuvyr/ZUVYR_CURRENT_STATE_OVERRIDE_2026-09-23.json';
const currentState = readJson(currentStatePath);
expect(Boolean(currentState), `current-state override unreadable: ${currentStatePath}`);
expect(currentState?.status === 'CANONICAL_CURRENT_STATE_OVERRIDE', `unexpected current-state status: ${currentState?.status}`);

const continuousPolicyPath = 'docs/zuvyr/continuous-improvement-override.v1.json';
const continuousPolicyDocPath = 'docs/zuvyr/CONTINUOUS_IMPROVEMENT_OVERRIDE_2026-09-23.md';
const continuousPolicy = readJson(continuousPolicyPath);
const continuousPolicyDoc = readText(continuousPolicyDocPath) || '';
expect(continuousPolicy?.status === 'CANONICAL_EXECUTION_POLICY_OVERRIDE', 'continuous-improvement policy is not canonical');
expect(continuousPolicy?.completed_packs_are_immutable === false, 'completed packs must not be treated as immutable');
expect(continuousPolicy?.renumber_historical_packs === false, 'continuous improvement must not renumber historical packs');
expect(continuousPolicy?.older_pack_improvement_can_skip_active_gate === false, 'older-pack improvement must not skip active gate');
expect(continuousPolicyDoc.includes('not immutable'), 'continuous-improvement policy document missing not-immutable rule');

const expectedRange = manifest?.v1_contract?.readiness_range;
expect(expectedRange === 'EA-001..EA-292', `unexpected readiness range: ${expectedRange}`);
expect(manifest?.v1_contract?.final_gate === 'PACK150', 'final gate must be PACK150');
expect(manifest?.v1_contract?.cannot_hide_unfinished_v1 === true, 'cannot_hide_unfinished_v1 must be true');
expect(manifest?.v1_contract?.fresh_gap_audit_before_pack148 === true, 'fresh gap audit before PACK148 must be required');
expect(manifest?.v1_contract?.cold_start_reconstruction_test_required === true, 'cold-start reconstruction test must be required');
expect(manifest?.v1_contract?.continuous_improvement_required === true, 'continuous improvement must be required by V1 contract');

const bootOrder = manifest.canonical_boot_order || [];
for (const required of [
  currentStatePath,
  'ZUVYR_CONTINUE_HERE.md',
  'docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json',
  'docs/zuvyr/ZUVYR_V1_COMPLETE_MASTER_PLAN.md',
  'ZUVYR_MASTER_STATE.json',
  'ZUVYR_MASTER_MATRIX.md',
  'docs/zuvyr/ROADMAP_150.md',
  'docs/zuvyr/V1_READINESS_COMPLETENESS_AUDIT_2026-09-22.md',
  'docs/zuvyr/V1_READINESS_REQUIREMENTS_001_292.json',
  'docs/zuvyr/USER_OUTCOME_ENGINE.md',
  'docs/zuvyr/PACK_EXECUTION_APPENDIX.md',
  continuousPolicyDocPath,
  continuousPolicyPath
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
      const match = /^PACK(\d{3})$/.exec(route);
      expect(Boolean(match), `${item.id} has invalid route: ${route}`);
      if (match) {
        const n = Number(match[1]);
        expect(n >= 1 && n <= 150, `${item.id} routes outside PACK001..PACK150: ${route}`);
      }
    }
  }
}

const active = currentState?.active_work || {};
const manifestActive = manifest?.active_work || {};
for (const key of ['pack', 'pack_status', 'phase', 'phase_status', 'latest_receipt']) {
  expect(typeof active[key] === 'string' && active[key].length > 0, `current-state active ${key} missing`);
  expect(manifestActive[key] === active[key], `manifest/current-state ${key} mismatch: ${manifestActive[key]} vs ${active[key]}`);
}
expect(/^PACK\d{3}$/.test(active.pack), `current-state active Pack malformed: ${active.pack}`);
expect(active.pack090_allowed === false, 'current-state unexpectedly allows PACK090');
expect(manifestActive.pack090_allowed === false, 'manifest unexpectedly allows PACK090');

const receipt = readJson(active.latest_receipt);
if (receipt) {
  expect(`PACK${receipt.pack}` === active.pack, `receipt pack mismatch: PACK${receipt.pack} vs ${active.pack}`);
  expect(receipt.phase === active.phase, `receipt phase mismatch: ${receipt.phase} vs ${active.phase}`);
  expect(receipt.status === active.phase_status, `receipt status mismatch: ${receipt.status} vs ${active.phase_status}`);
  if (typeof receipt?.next?.pack090_allowed === 'boolean') {
    expect(receipt.next.pack090_allowed === false, 'latest receipt unexpectedly allows PACK090');
  }
}

// Older long-form state files are historical ledgers as well as continuity aids. They are
// no longer required to duplicate the freshest volatile status byte-for-byte. Instead,
// they must explicitly defer to fresh evidence/current overrides and must never advance
// beyond the current legal gate.
const masterState = readJson('ZUVYR_MASTER_STATE.json');
if (masterState) {
  const capsule = masterState.continuity_capsule || {};
  expect(capsule.manifest === manifestPath, `MASTER_STATE manifest mismatch: ${capsule.manifest}`);
  expect(capsule.readiness_matrix === readinessPath, `MASTER_STATE readiness matrix mismatch: ${capsule.readiness_matrix}`);
  expect(capsule.readiness_range === 'EA-001..EA-292', `MASTER_STATE readiness range mismatch: ${capsule.readiness_range}`);
  expect(capsule.pack090_allowed === false, 'MASTER_STATE unexpectedly allows PACK090');
  expect(typeof capsule.conflict_rule === 'string' && capsule.conflict_rule.toLowerCase().includes('fresh'), 'MASTER_STATE must defer stale fields to fresh evidence');
}

const continueText = readText('ZUVYR_CONTINUE_HERE.md') || '';
const continueHead = continueText.slice(0, 16000);
for (const needle of [
  'docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json',
  'docs/zuvyr/V1_READINESS_REQUIREMENTS_001_292.json',
  'EA-001…EA-292',
  'CURRENT CANONICAL EXECUTION CAPSULE',
  'HISTORICAL CONTENT BOUNDARY',
  'Fresh evidence overrides older text',
  'tools/validate-zuvyr-continuity.cjs',
  '.github/workflows/zuvyr-continuity.yml'
]) {
  expect(continueHead.includes(needle), `CONTINUE_HERE top section missing: ${needle}`);
}

const matrixText = readText('ZUVYR_MASTER_MATRIX.md') || '';
const matrixHead = matrixText.slice(0, 10000);
for (const needle of [
  'LATEST CANONICAL CONTINUITY OVERRIDE',
  'docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json',
  'V1_READINESS_REQUIREMENTS_001_292.json',
  'EA-001…EA-292',
  'PACK089',
  '89E_PRODUCTION_ACCEPTANCE',
  'Fresh production/source/receipt evidence beats this override'
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
  expect(actualSha === expectedSha, `canonical snapshot drift for ${rel}: manifest=${expectedSha} actual=${actualSha}. Reconcile atomically; do not ignore this failure.`);
}

const guardSnapshots = manifest.integrity_guard_files || {};
for (const [rel, expectedSha] of Object.entries(guardSnapshots)) {
  // The continuity validator itself is intentionally allowed to evolve through a reviewed
  // continuity PR; other guard files remain snapshot-enforced.
  if (rel === 'tools/validate-zuvyr-continuity.cjs') continue;
  const text = readText(rel);
  if (text == null) continue;
  const actualSha = gitBlobSha(text);
  expect(actualSha === expectedSha, `continuity guard drift for ${rel}: manifest=${expectedSha} actual=${actualSha}`);
}

if (!process.exitCode) {
  console.log('ZUVYR_CONTINUITY_PASS');
  console.log(JSON.stringify({
    current_state_override: currentStatePath,
    active_pack: active.pack,
    active_phase: active.phase,
    phase_status: active.phase_status,
    latest_receipt: active.latest_receipt,
    readiness_range: expectedRange,
    readiness_count: readiness?.requirements?.length,
    continuous_improvement: true,
    pack090_allowed: active.pack090_allowed
  }, null, 2));
}
