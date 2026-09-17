const fs = require('node:fs');

const path = 'docs/zuvyr/user-outcome-pack-overlay.v1.json';
const overlay = JSON.parse(fs.readFileSync(path, 'utf8'));

const expectedIds = Array.from({ length: 150 }, (_, i) => String(i + 1).padStart(3, '0'));
const rows = Array.isArray(overlay.pack_matrix) ? overlay.pack_matrix : [];
const ids = rows.map((row) => row.pack_id);

function fail(message) {
  throw new Error(`USER_OUTCOME_OVERLAY_INVALID: ${message}`);
}

if (overlay.status !== 'CANONICAL_GLOBAL_OVERLAY') fail('status');
if (overlay.applies_to?.from !== '001' || overlay.applies_to?.to !== '150') fail('range');
if (rows.length !== 150) fail(`expected 150 pack rows; found ${rows.length}`);
if (new Set(ids).size !== 150) fail('duplicate pack id');
if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) fail('pack ids must be contiguous 001-150 in order');
if (overlay.global_pack_requirements?.mandatory_before_lock !== true) fail('mandatory_before_lock');

const requiredFields = [
  'user_value',
  'executable_user_actions',
  'money_opportunity_relevance',
  'money_opportunity_notes',
  'next_best_action',
  'suggestion_chips',
  'provenance_behavior',
  'personalization_behavior',
  'hard_stop_impact',
  'outcome_tests'
];

const actualRequired = overlay.global_pack_requirements?.required_fields || [];
for (const field of requiredFields) {
  if (!actualRequired.includes(field)) fail(`missing required field ${field}`);
}

const classes = overlay.classes || {};
for (const row of rows) {
  if (row.inherits !== 'global_pack_requirements') fail(`PACK${row.pack_id} inheritance`);
  if (!classes[row.overlay_class]) fail(`PACK${row.pack_id} overlay class ${row.overlay_class}`);
}

const loop = overlay.global_pack_requirements?.suggestion_loop || {};
if (loop.required_when_user_facing !== true) fail('suggestion loop must be required for user-facing packs');
if (loop.tap_must_rehydrate_current_context !== true) fail('suggestion tap context rehydration');
if (loop.static_generic_chips_forbidden !== true) fail('static generic chips must be forbidden');

if (overlay.global_pack_requirements?.fabrication_forbidden !== true) fail('fabrication_forbidden');
if (overlay.global_pack_requirements?.formal_documentation_required_for_mention !== false) fail('formal documentation rule');

for (const linked of [overlay.canonical_contract, overlay.execution_appendix]) {
  if (!linked || !fs.existsSync(linked)) fail(`missing linked contract ${linked}`);
}

console.log('PASS: ZUVYR User Outcome Engine overlay covers PACK001-PACK150 with mandatory contextual Next Best Action contract.');
