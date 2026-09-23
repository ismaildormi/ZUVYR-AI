'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const policyPath = path.join(root, 'docs', 'zuvyr', 'continuous-improvement-override.v1.json');
const docPath = path.join(root, 'docs', 'zuvyr', 'CONTINUOUS_IMPROVEMENT_OVERRIDE_2026-09-23.md');
const agentsPath = path.join(root, 'AGENTS.md');

const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const doc = fs.readFileSync(docPath, 'utf8');
const agents = fs.readFileSync(agentsPath, 'utf8');

assert.equal(policy.status, 'CANONICAL_EXECUTION_POLICY_OVERRIDE');
assert.equal(policy.completed_packs_are_immutable, false);
assert.equal(policy.renumber_historical_packs, false);
assert.equal(policy.delete_or_rewrite_prior_receipts, false);
assert.equal(policy.redo_unchanged_work_for_ceremony, false);
assert.equal(policy.older_pack_improvement_can_skip_active_gate, false);
assert.equal(policy.clean_claim_requires_zero_known_actionable_internal_findings, true);
assert.equal(policy.adjacent_discovered_actionable_findings_must_be_resolved, true);
assert.equal(policy.external_blockers_must_be_explicit_and_evidenced, true);
assert.equal(policy.informational_findings_may_be_accepted_only_with_documented_rationale, true);
assert.match(policy.clean_claim_rule, /never claim clean/i);
assert.match(policy.clean_claim_rule, /known actionable internal finding/i);
assert.match(policy.clean_claim_rule, /adjacent to the task/i);
assert.match(policy.clean_claim_rule, /external blockers/i);

for (const required of [
  'security_or_authorization_defect',
  'privacy_billing_reliability_data_integrity_accessibility_performance_recovery_defect',
  'missing_commit_push_deploy_or_production_verification',
  'new_additive_v1_requirement',
  'new_product_idea_materially_improves_existing_pack',
  'deferred_gate_now_truthfully_executable',
  'stale_receipt_or_state'
]) {
  assert(policy.revisit_allowed_when.includes(required), `missing revisit rule: ${required}`);
}

for (const step of ['focused_test','regression','commit','push','production_verify','new_dated_receipt','reconcile_canonical_state']) {
  assert(policy.required_loop.includes(step), `missing completion step: ${step}`);
}

assert(doc.includes('A previously completed or `LOCKED_VERIFIED` Pack is **not immutable**.'));
assert(doc.includes('Never renumber historical Packs.'));
assert(doc.includes('Never redo unchanged work only for ceremony.'));
assert(doc.includes('It does **not** automatically change the active Pack number.'));
assert(doc.includes('## No false CLEAN / LOCKED_VERIFIED claims'));
assert(doc.includes('known actionable internal finding'));
assert(doc.includes('discovered in or adjacent to the task'));
assert(doc.includes('Every such blocker must be named explicitly with fresh evidence'));
assert(agents.includes('docs/zuvyr/CONTINUOUS_IMPROVEMENT_OVERRIDE_2026-09-23.md'));
assert(agents.includes('A previously completed or `LOCKED_VERIFIED` Pack is not immutable.'));
assert(agents.includes('### Truthful completion / adjacent-findings rule'));
assert(agents.includes('Never claim `CLEAN`, `LOCKED_VERIFIED`, final, finished, complete, or all-green while any known actionable internal finding remains unresolved.'));

console.log('PASS ZUVYR continuous-improvement override');
