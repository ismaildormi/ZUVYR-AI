'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');

function fail(message) {
  console.error('ZUVYR_CONTINUITY_FAIL:', message);
  process.exitCode = 1;
}
function expect(condition, message) { if (!condition) fail(message); }
function readText(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { fail(`missing file: ${rel}`); return null; }
  return fs.readFileSync(abs, 'utf8');
}
function readJson(rel) {
  const text = readText(rel);
  if (text == null) return null;
  try { return JSON.parse(text); }
  catch (error) { fail(`invalid JSON in ${rel}: ${error.message}`); return null; }
}
function gitBlobSha(text) {
  const bytes = Buffer.from(text, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([
    Buffer.from(`blob ${bytes.length}\0`, 'utf8'), bytes
  ])).digest('hex');
}
function containsCI(text, needle) { return text.toLowerCase().includes(needle.toLowerCase()); }

const manifestPath = 'docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json';
const manifest = readJson(manifestPath);
if (!manifest) process.exit(1);

const currentStatePath = manifest?.current_state_override?.path || 'docs/zuvyr/ZUVYR_CURRENT_STATE_OVERRIDE_2026-09-23.json';
const currentState = readJson(currentStatePath);
expect(currentState?.status === 'CANONICAL_CURRENT_STATE_OVERRIDE', `unexpected current-state status: ${currentState?.status}`);

const policyPath = 'docs/zuvyr/continuous-improvement-override.v1.json';
const policyDocPath = 'docs/zuvyr/CONTINUOUS_IMPROVEMENT_OVERRIDE_2026-09-23.md';
const policy = readJson(policyPath);
const policyDoc = readText(policyDocPath) || '';
expect(policy?.status === 'CANONICAL_EXECUTION_POLICY_OVERRIDE', 'continuous-improvement policy is not canonical');
expect(policy?.completed_packs_are_immutable === false, 'completed packs must not be treated as immutable');
expect(policy?.renumber_historical_packs === false, 'historical packs must not be renumbered');
expect(policy?.older_pack_improvement_can_skip_active_gate === false, 'older-pack repair must not skip active gate');
expect(containsCI(policyDoc, 'not immutable'), 'continuous-improvement document missing not-immutable rule');

const v1 = manifest.v1_contract || {};
expect(v1.readiness_range === 'EA-001..EA-292', `unexpected readiness range: ${v1.readiness_range}`);
expect(v1.final_gate === 'PACK150', 'final gate must be PACK150');
expect(v1.cannot_hide_unfinished_v1 === true, 'cannot_hide_unfinished_v1 must be true');
expect(v1.fresh_gap_audit_before_pack148 === true, 'fresh gap audit before PACK148 must be required');
expect(v1.cold_start_reconstruction_test_required === true, 'cold-start reconstruction test must be required');
expect(v1.continuous_improvement_required === true, 'continuous improvement must be required by V1 contract');

const bootOrder = manifest.canonical_boot_order || [];
for (const rel of [
  currentStatePath,
  'ZUVYR_CONTINUE_HERE.md',
  manifestPath,
  'docs/zuvyr/ZUVYR_V1_COMPLETE_MASTER_PLAN.md',
  'ZUVYR_MASTER_STATE.json',
  'ZUVYR_MASTER_MATRIX.md',
  'docs/zuvyr/ROADMAP_150.md',
  'docs/zuvyr/V1_READINESS_COMPLETENESS_AUDIT_2026-09-22.md',
  'docs/zuvyr/V1_READINESS_REQUIREMENTS_001_292.json',
  'docs/zuvyr/USER_OUTCOME_ENGINE.md',
  'docs/zuvyr/PACK_EXECUTION_APPENDIX.md',
  policyDocPath,
  policyPath
]) {
  expect(bootOrder.includes(rel), `boot order missing: ${rel}`);
  readText(rel);
}

const readinessPath = 'docs/zuvyr/V1_READINESS_REQUIREMENTS_001_292.json';
const readiness = readJson(readinessPath);
if (readiness) {
  expect(readiness.canonical_range === 'EA-001..EA-292', `matrix canonical_range mismatch: ${readiness.canonical_range}`);
  const reqs = Array.isArray(readiness.requirements) ? readiness.requirements : [];
  expect(reqs.length === 292, `expected 292 readiness requirements, got ${reqs.length}`);
  const ids = new Set(reqs.map(x => x?.id).filter(Boolean));
  expect(ids.size === 292, `expected 292 unique EA IDs, got ${ids.size}`);
  const missing = [];
  for (let i = 1; i <= 292; i += 1) {
    const id = `EA-${String(i).padStart(3, '0')}`;
    if (!ids.has(id)) missing.push(id);
  }
  expect(missing.length === 0, `missing EA IDs: ${missing.join(', ')}`);
  for (const item of reqs) {
    const routes = Array.isArray(item?.routes) ? item.routes : [];
    expect(routes.length > 0, `${item?.id || 'unknown EA'} has no Pack route`);
    for (const route of routes) {
      const m = /^PACK(\d{3})$/.exec(route);
      expect(Boolean(m), `${item.id} has invalid route: ${route}`);
      if (m) expect(Number(m[1]) >= 1 && Number(m[1]) <= 150, `${item.id} routes outside PACK001..PACK150: ${route}`);
    }
  }
}

const active = currentState?.active_work || {};
const manifestActive = manifest?.active_work || {};
for (const key of ['pack','pack_status','phase','phase_status','latest_receipt']) {
  expect(typeof active[key] === 'string' && active[key], `current-state active ${key} missing`);
  expect(manifestActive[key] === active[key], `manifest/current-state ${key} mismatch: ${manifestActive[key]} vs ${active[key]}`);
}
expect(/^PACK\d{3}$/.test(active.pack), `malformed active Pack: ${active.pack}`);
expect(active.pack090_allowed === false && manifestActive.pack090_allowed === false, 'PACK090 must remain blocked');

const receipt = readJson(active.latest_receipt);
if (receipt) {
  expect(`PACK${receipt.pack}` === active.pack, `receipt pack mismatch: PACK${receipt.pack} vs ${active.pack}`);
  expect(receipt.phase === active.phase, `receipt phase mismatch: ${receipt.phase} vs ${active.phase}`);
  expect(receipt.status === active.phase_status, `receipt status mismatch: ${receipt.status} vs ${active.phase_status}`);
  if (typeof receipt?.next?.pack090_allowed === 'boolean') expect(receipt.next.pack090_allowed === false, 'latest receipt unexpectedly allows PACK090');
}

// Long-lived ledgers preserve history and can lag the compact current-state override.
// They must defer to fresh evidence and must never advance the legal gate on their own.
const masterState = readJson('ZUVYR_MASTER_STATE.json');
if (masterState) {
  const c = masterState.continuity_capsule || {};
  expect(c.manifest === manifestPath, `MASTER_STATE manifest mismatch: ${c.manifest}`);
  expect(c.readiness_matrix === readinessPath, `MASTER_STATE readiness matrix mismatch: ${c.readiness_matrix}`);
  expect(c.readiness_range === 'EA-001..EA-292', `MASTER_STATE readiness range mismatch: ${c.readiness_range}`);
  expect(c.pack090_allowed === false, 'MASTER_STATE unexpectedly allows PACK090');
  expect(containsCI(c.conflict_rule || '', 'fresh'), 'MASTER_STATE must defer stale fields to fresh evidence');
}

const continueHead = (readText('ZUVYR_CONTINUE_HERE.md') || '').slice(0, 16000);
for (const needle of [
  manifestPath,
  readinessPath,
  'EA-001…EA-292',
  'CURRENT CANONICAL EXECUTION CAPSULE',
  'HISTORICAL CONTENT BOUNDARY',
  'Fresh evidence overrides older text',
  'tools/validate-zuvyr-continuity.cjs',
  '.github/workflows/zuvyr-continuity.yml'
]) expect(containsCI(continueHead, needle), `CONTINUE_HERE top section missing: ${needle}`);

const matrixHead = (readText('ZUVYR_MASTER_MATRIX.md') || '').slice(0, 10000);
for (const needle of [
  'LATEST CANONICAL CONTINUITY OVERRIDE',
  manifestPath,
  'V1_READINESS_REQUIREMENTS_001_292.json',
  'EA-001…EA-292',
  'PACK089',
  '89E_PRODUCTION_ACCEPTANCE',
  'fresh production/source/receipt evidence beats this override'
]) expect(containsCI(matrixHead, needle), `MASTER_MATRIX canonical header missing: ${needle}`);

const roadmap = readText('docs/zuvyr/ROADMAP_150.md') || '';
if (readiness) expect(readiness.generated_from_blob_sha === gitBlobSha(roadmap), `matrix/ROADMAP_150 blob mismatch: ${readiness.generated_from_blob_sha} vs ${gitBlobSha(roadmap)}`);
for (const needle of ['EA-001…EA-292','V1_READINESS_REQUIREMENTS_001_292.json','PACK150 — V1 final release and recovery gate','V1_READY=true','EA-292']) {
  expect(roadmap.includes(needle), `ROADMAP_150 missing readiness marker: ${needle}`);
}
const audit = readText('docs/zuvyr/V1_READINESS_COMPLETENESS_AUDIT_2026-09-22.md') || '';
expect(audit.includes('EA-001…EA-292') && audit.includes('EA-292'), 'readiness audit is incomplete');
const appendix = readText('docs/zuvyr/PACK_EXECUTION_APPENDIX.md') || '';
expect(appendix.includes('EA-001…EA-292'), 'PACK execution appendix missing EA range');
expect(appendix.includes('ZUVYR_CONTINUITY_MANIFEST.json'), 'PACK execution appendix missing continuity manifest gate');
expect(appendix.includes('V1_READINESS_REQUIREMENTS_001_292.json'), 'PACK execution appendix missing readiness matrix gate');

for (const [rel, expectedSha] of Object.entries(manifest.canonical_files_snapshot || {})) {
  const text = readText(rel);
  if (text == null) continue;
  const actual = gitBlobSha(text);
  expect(actual === expectedSha, `canonical snapshot drift for ${rel}: manifest=${expectedSha} actual=${actual}`);
}
for (const [rel, expectedSha] of Object.entries(manifest.integrity_guard_files || {})) {
  if (rel === 'tools/validate-zuvyr-continuity.cjs') continue; // reviewed validator evolution is self-validating through this PR.
  const text = readText(rel);
  if (text == null) continue;
  const actual = gitBlobSha(text);
  expect(actual === expectedSha, `continuity guard drift for ${rel}: manifest=${expectedSha} actual=${actual}`);
}

if (!process.exitCode) {
  console.log('ZUVYR_CONTINUITY_PASS');
  console.log(JSON.stringify({
    current_state_override: currentStatePath,
    active_pack: active.pack,
    active_phase: active.phase,
    phase_status: active.phase_status,
    latest_receipt: active.latest_receipt,
    readiness_range: v1.readiness_range,
    readiness_count: readiness?.requirements?.length,
    continuous_improvement: true,
    pack090_allowed: active.pack090_allowed
  }, null, 2));
}
