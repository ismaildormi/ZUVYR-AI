'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const policy = require('./config/zuvyr-owned-model-runtime-policy.v1.json');
const roadmap = require('../docs/zuvyr/roadmap-150.json');
const state = require('../ZUVYR_MASTER_STATE.json');
const roadmapMd = fs.readFileSync(
  path.join(__dirname, '..', 'docs', 'zuvyr', 'ROADMAP_150.md'),
  'utf8'
);
const continueHere = fs.readFileSync(
  path.join(__dirname, '..', 'ZUVYR_CONTINUE_HERE.md'),
  'utf8'
);

assert.equal(policy.status, 'CANONICAL_MODEL_FIRST_PRIORITY');
assert.equal(policy.execution_priority.completed_inflight_pack, '083');
assert.equal(policy.execution_priority.active_priority_pack, null);
assert.deepEqual(policy.execution_priority.immediate_sequence, ['094','095','096']);
assert.equal(policy.commercial_model.zuvyr_api_software_fee_usd, 0);
assert.equal(policy.commercial_model.zuvyr_owned_model_usage_fee_usd, 0);
assert.equal(policy.commercial_model.zuvyr_inference_markup_usd, 0);
assert.equal(policy.commercial_model.default_compute_payer, 'user_or_organization');
assert.equal(policy.commercial_model.zuvyr_paid_inference_gpu_default, false);
assert.equal(policy.commercial_model.target_zuvyr_variable_inference_cost_usd_per_owned_model_request, 0);
assert.equal(policy.serving_architecture.mode, 'bring_your_own_compute');
assert.equal(policy.serving_architecture.endpoint_registration_required, true);
assert.equal(policy.serving_architecture.user_compute_credentials_must_not_be_exposed_to_browser, true);
assert.equal(policy.learning_flywheel.global_training_content_default, 'opt_in_off');
assert.equal(policy.learning_flywheel.memory_permission_separate_from_training_permission, true);
assert.equal(policy.owned_model_rollout.automatic_rollback_required, true);

assert.equal(roadmap.active_pack, '084');

const expectedPackIds = Array.from(
  { length: 150 },
  (_, index) => String(index + 1).padStart(3, '0')
);
const roadmapPackIds = roadmap.packs.map(item => item.id);
assert.equal(roadmap.total_packs, 150);
assert.equal(roadmap.packs.length, 150);
assert.equal(new Set(roadmapPackIds).size, 150);
assert.deepEqual(roadmapPackIds, expectedPackIds);

const markdownPackIds = [
  ...roadmapMd.matchAll(/^## PACK(\d{3})\b/gm)
].map(match => match[1]);
assert.equal(markdownPackIds.length, 150);
assert.equal(new Set(markdownPackIds).size, 150);
assert.deepEqual(markdownPackIds, expectedPackIds);

assert.equal(roadmap.priority_override.completed_inflight_pack, '083');
assert.equal(roadmap.priority_override.active_priority_pack, null);
assert.deepEqual(
  roadmap.priority_override.execute_next,
  ['094', '095', '096']
);
assert.equal(roadmap.priority_override.resume_original_sequence_at, '084');
assert.deepEqual(
  roadmap.priority_override.deferred_not_cancelled,
  ['085','086','087','088','089','090','091','092','093']
);
assert.equal(roadmap.priority_override.do_not_renumber_existing_packs, true);
assert.match(String(roadmap.preservation || ''), /001.*099.*retain numbering/i);
assert.equal(roadmap.priority_override.owned_model_api_software_fee_usd, 0);
assert.equal(roadmap.priority_override.owned_model_usage_fee_usd, 0);
assert.equal(roadmap.priority_override.default_serving_mode, 'bring_your_own_compute');

const pack = id => roadmap.packs.find(item => item.id === id);
assert.match(pack('100').acceptance, /not V1_READY/i);
assert.match(pack('100').acceptance, /PACK150 owns final release/i);
assert.match(pack('150').acceptance, /All 001.*150 gates/i);
assert.equal(pack('150').title, 'V1 final release and recovery gate');
assert.deepEqual(pack('094').dependencies, ['045', '047']);
for (const removed of ['091', '092', '093']) {
  assert(!pack('094').dependencies.includes(removed));
}
assert(pack('095').scope.includes('Compute Connector'));
assert(pack('096').scope.includes('BYOC'));
assert(pack('096').scope.includes('usage fee $0'));
assert(pack('096').acceptance.includes('user/org-funded BYOC'));

assert.equal(state.active_pack, '084');
assert.equal(state.model_first_priority_override.status, 'CANONICAL');
assert.equal(state.model_first_priority_override.current_inflight_pack, null);
assert.equal(state.model_first_priority_override.current_inflight_may_finish, false);
assert.equal(state.model_first_priority_override.completed_inflight_pack, '083');
assert.equal(state.model_first_priority_override.active_priority_pack, null);
assert.equal(
  state.model_first_priority_override.next_pack_after_current_inflight,
  '096'
);
assert.equal(
  state.model_first_priority_override.resume_original_sequence_at,
  '084'
);
assert(state.model_first_priority_override.completed_priority_packs.includes('094'));
assert(state.model_first_priority_override.completed_priority_packs.includes('095'));
assert(state.model_first_priority_override.completed_priority_packs.includes('096'));
assert.equal(state.pack094.status, 'LOCKED_ENGINEERING_VERIFIED');
assert.equal(state.pack094.canonical_locked_verified, false);
assert.equal(state.pack094.next_pack, '095');
assert.equal(state.pack095.status, 'LOCKED_ENGINEERING_VERIFIED');
assert.equal(state.pack095.canonical_locked_verified, false);
assert.equal(state.pack095.next_pack, '096');
assert.equal(state.pack096.status, 'LOCKED_ENGINEERING_VERIFIED');
assert.equal(state.pack096.canonical_locked_verified, false);
assert.equal(state.pack096.next_pack, '084');

assert.equal(
  state.model_first_priority_override.economics.zuvyr_owned_model_usage_fee_usd,
  0
);
assert.equal(
  state.model_first_priority_override.serving.default_mode,
  'bring_your_own_compute'
);
assert.equal(
  state.model_first_priority_override.learning.global_training_content_opt_in_default,
  false
);

assert(roadmapMd.includes('MODEL-FIRST PRIORITY OVERRIDE — 2026-09-19'));
assert(roadmapMd.includes('PACK094 → PACK095 → PACK096 before PACK084–PACK093'));
assert(roadmapMd.includes('ZUVYR-owned model usage fee: $0'));
assert(continueHere.includes('LATEST CANONICAL OVERRIDE — MODEL-FIRST + BYO COMPUTE — 2026-09-19'));
assert(continueHere.includes('PACK084 — 3D Studio is now the active Pack'));
assert(continueHere.includes('PACK096 engineering is finalized and M21 remains deferred'));
assert(continueHere.includes('PACK150 is the final V1 release/recovery gate'));

console.log('PASS: Model-First priority is canonical across policy, roadmap, state and continuation files');
console.log('PASS: ZUVYR-owned model API/software fee = $0 and model usage fee = $0');
console.log('PASS: BYOC user/org-funded compute is the default serving model');
console.log('PASS: PACK096 is engineering-finalized and PACK084 resumes the original sequence');
console.log('PASS: PACK094 → PACK095 → PACK096 precede PACK084–PACK093');
console.log('PASS: V1 coverage guard preserves every canonical PACK001–PACK150 in Markdown + JSON');
console.log('PASS: PACK084–PACK093 are deferred, never cancelled; PACK150 remains the final V1 release gate');
