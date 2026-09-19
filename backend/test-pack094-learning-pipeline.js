'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  redactTrainingText,
  sanitizeNonContentMetadata,
  candidateLearningValueScore
} = require('./lib/learningPrivacy');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

const migration = read('94_pack094_learning_pipeline.sql');
const migrationFix1 = read('94_pack094_learning_pipeline_fix1.sql');
const repository = read('lib/learningPipelineRepository.js');
const routes = read('lib/learningPipelineRoutes.js');
const server = read('server.js');
const memoryUi = read('../frontend/zuvyr-memory-v1.js');
const memoryCss = read('../frontend/zuvyr-memory-v1.css');
const unifiedUi = read('../frontend/zuvyr-unified-ux-v1.js');
const unifiedCss = read('../frontend/zuvyr-unified-ux-v1.css');
const config = require('./config/learning-pipeline.v1.json');

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

const tables = [
  'zuvyr_learning_events',
  'zuvyr_failure_bank',
  'zuvyr_training_consent_events',
  'zuvyr_training_rights',
  'zuvyr_training_candidates',
  'zuvyr_training_candidate_payloads',
  'zuvyr_training_exclusions'
];

for (const table of tables) {
  assert.equal(
    occurrences(migration, 'create table if not exists public.' + table + ' '),
    1,
    table + ' must be defined exactly once'
  );
  assert(
    migration.includes('alter table public.' + table + ' enable row level security'),
    table + ' must have RLS enabled'
  );
  assert(
    migration.includes('revoke all on public.' + table + ' from public,anon,authenticated'),
    table + ' must revoke direct browser roles'
  );
}

assert(
  !migration.includes('create table if not exists public.zuvyr_learning_consents'),
  'PACK094 must not create a second current-consent authority'
);
assert(
  migration.includes('public.zuvyr_user_preferences'),
  'canonical user preferences must remain the current-consent authority'
);
assert(
  migration.includes('new.training_consent'),
  'preference writes must drive consent history'
);
assert(
  migration.includes('trg_pack094_training_consent_history'),
  'training consent history trigger missing'
);
assert(
  migration.includes('revoke all on public.zuvyr_training_consent_events from service_role'),
  'consent history must explicitly clear Supabase default service_role grants'
);
assert(
  migration.includes('grant select,insert on public.zuvyr_training_consent_events to service_role'),
  'consent history should be append/read only'
);
assert(
  migrationFix1.includes('revoke all on public.zuvyr_training_consent_events from service_role'),
  'PACK094 FIX1 must revoke broad production service_role grants'
);
assert(
  /grant\s+select\s*,\s*insert\s+on\s+public\.zuvyr_training_consent_events\s+to\s+service_role/i.test(migrationFix1),
  'PACK094 FIX1 must restore only append/read service_role access'
);
assert(
  !/grant\s+[^;]*(?:update|delete|truncate)[^;]*on\s+public\.zuvyr_training_consent_events/i.test(migrationFix1),
  'PACK094 FIX1 must never grant mutation privileges to consent history'
);
assert(
  !migration.includes('grant select,insert,update,delete on public.zuvyr_training_consent_events'),
  'consent history must not be mutable through ordinary service-role table grants'
);

for (const functionName of [
  'pack094_learning_value_score',
  'pack094_safe_failure_category',
  'pack094_insert_exclusion_for_candidate',
  'capture_zuvyr_training_consent_history_pack094',
  'set_zuvyr_learning_consent_pack094',
  'upsert_zuvyr_training_rights_pack094',
  'revoke_zuvyr_training_rights_pack094',
  'mark_zuvyr_training_rights_privacy_pack094',
  'admit_zuvyr_training_candidate_pack094',
  'admit_zuvyr_redacted_text_candidate_pack094',
  'exclude_zuvyr_training_candidate_pack094',
  'capture_zuvyr_data_rights_training_exclusion_pack094',
  'record_zuvyr_repair_learning_pack094',
  'capture_zuvyr_usage_learning_pack094',
  'capture_zuvyr_task_run_learning_pack094',
  'capture_zuvyr_task_step_learning_pack094',
  'capture_zuvyr_feedback_learning_pack094',
  'capture_zuvyr_failure_bank_pack094'
]) {
  assert.equal(
    occurrences(
      migration,
      'create or replace function public.' + functionName + '('
    ),
    1,
    functionName + ' must be defined exactly once'
  );
}

for (const triggerName of [
  'trg_pack094_training_consent_history',
  'trg_pack094_data_rights_training_exclusion',
  'trg_pack094_usage_learning',
  'trg_pack094_task_run_learning',
  'trg_pack094_task_step_learning',
  'trg_pack094_feedback_learning',
  'trg_pack094_failure_bank'
]) {
  assert.equal(
    occurrences(migration, 'create trigger ' + triggerName),
    1,
    triggerName + ' must be created exactly once'
  );
}

for (const forbidden of [
  /\bnew\.intent\b/i,
  /\bnew\.plan\b/i,
  /\bnew\.final_result\b/i,
  /\bnew\.input\b/i,
  /\bnew\.output\b/i,
  /\braw_provider_error\b/i,
  /\berror_message\b/i
]) {
  assert.equal(
    forbidden.test(migration),
    false,
    'non-content trigger source must not copy ' + forbidden
  );
}

assert(migration.includes("contains_user_content boolean not null default false"));
assert(migration.includes("check (contains_user_content = false)"));
assert(migration.includes("new.plan_version"));
assert(migration.includes("'step_count',v_step_count"));
assert(migration.includes("'failed_step_count',v_failed_steps"));
assert(migration.includes("'usage_kind',left(coalesce(new.usage_kind,''),80)"));
assert(migration.includes("public.pack094_safe_failure_category(new.error_code,'task_failed')"));
assert(migration.includes("public.pack094_safe_failure_category(new.error_code,'tool_failed')"));

assert(
  migration.includes("new.request_type<>'delete' or not new.explicit_confirmation"),
  'confirmed data deletion requests must exclude current training candidates'
);
assert(migration.includes("'data_delete_requested','data_rights'"));
assert(migration.includes("'global_training_consent_revoked'"));
assert(migration.includes("'training_rights_revoked'"));
assert(migration.includes("'privacy_rejected'"));
assert(migration.includes("'provenance_rejected'"));

const candidateFunctionStart = migration.indexOf(
  'create or replace function public.admit_zuvyr_training_candidate_pack094('
);
const candidateFunctionEnd = migration.indexOf(
  '$pack094_candidate$;',
  candidateFunctionStart
);
const candidateFunction = migration.slice(
  candidateFunctionStart,
  candidateFunctionEnd
);
for (const required of [
  'zuvyr_user_preferences',
  'training_consent',
  'pack094_global_training_opt_in_required',
  'zuvyr_training_consent_events',
  'pack094_training_consent_evidence_required',
  'allow_global_training',
  'pack094_training_rights_inactive',
  "privacy_status<>'processed'",
  'pack094_privacy_processing_required',
  "provenance_status<>'verified'",
  'pack094_provenance_verification_required',
  'dedupe_sha256',
  'zuvyr_training_exclusions',
  'pack094_training_source_excluded'
]) {
  assert(candidateFunction.includes(required), 'candidate gate missing: ' + required);
}

assert.equal(config.version, 'pack-094.learning-pipeline.v1');
assert.equal(config.training.globalTrainingDefault, 'opt_in_off');
assert.equal(
  config.training.currentConsentAuthority,
  'zuvyr_user_preferences.training_consent'
);
assert.equal(config.training.memoryPermissionSeparate, true);
assert.equal(config.telemetry.nonContentAggregateLearning, true);
assert.equal(config.telemetry.trainingOptInRequiredForNonContentTelemetry, false);
assert.equal(config.privacy.rawSourceDuplicatedIntoLearningEvents, false);
assert.equal(
  config.evaluation.primaryObjective,
  'task_success_and_total_cost_per_successful_task'
);
assert.equal(config.externalGate, null);
assert.equal(config.training.consentPolicyVersion, 'pack094-v1');
assert.equal(config.sharedLearningPlane.version, 'pack094-shared-learning-plane-v1');
assert.deepEqual(
  config.sharedLearningPlane.runtimeKnowledge.appliesTo,
  ['zuvyr_owned_model','external_provider_model']
);
assert.equal(
  config.sharedLearningPlane.runtimeKnowledge.ownerAndResourceScoped,
  true
);
assert.equal(
  config.sharedLearningPlane.runtimeKnowledge.permissionGoverned,
  true
);
assert.equal(
  config.sharedLearningPlane.runtimeKnowledge.memoryPermissionIndependentFromTrainingConsent,
  true
);
assert.equal(
  config.sharedLearningPlane.ownedModelLearning.enabledByDesign,
  true
);
assert.equal(
  config.sharedLearningPlane.ownedModelLearning.admissionOwner,
  'PACK095'
);
assert.equal(
  config.sharedLearningPlane.ownedModelLearning.productionOwnedCheckpointOwner,
  'PACK096'
);
assert.equal(
  config.sharedLearningPlane.externalModelPolicy.receivesAuthorizedRuntimeKnowledge,
  true
);
assert.equal(
  config.sharedLearningPlane.externalModelPolicy.directWeightTrainingByZuvyr,
  false
);
assert.equal(
  config.sharedLearningPlane.externalModelPolicy.teacherUseRequiresContractOrLicensePermission,
  true
);
assert.equal(
  config.sharedLearningPlane.externalModelPolicy.prohibitProviderSystemPromptCollection,
  true
);
assert.equal(
  config.sharedLearningPlane.externalModelPolicy.prohibitProviderWeightCopying,
  true
);
assert.equal(
  config.sharedLearningPlane.externalModelPolicy.prohibitCustomerPrivateTrainingWithoutRights,
  true
);

const secretText = [
  'Contact me at person@example.com',
  'call +212 612 345 678',
  'Bearer abcdefghijklmnopqrstuvwxyz123456',
  'card 4242 4242 4242 4242'
].join('\n');
const redacted = redactTrainingText(secretText);
assert(!redacted.redactedText.includes('person@example.com'));
assert(!redacted.redactedText.includes('+212 612 345 678'));
assert(!redacted.redactedText.includes('abcdefghijklmnopqrstuvwxyz123456'));
assert(!redacted.redactedText.includes('4242 4242 4242 4242'));
assert.match(redacted.sha256, /^[0-9a-f]{64}$/);
assert(redacted.summary.redactionCount >= 4);

const sanitized = sanitizeNonContentMetadata({
  usage_kind: 'image_generation',
  retry_count: 9,
  secret: 'never-copy-me',
  prompt: 'never-copy-me-either',
  step_key: 'render'
});
assert.equal(sanitized.usage_kind, 'image_generation');
assert.equal(sanitized.step_key, 'render');
assert.equal('secret' in sanitized, false);
assert.equal('prompt' in sanitized, false);

const easy = candidateLearningValueScore({
  qualityScore: 5000,
  difficulty: 1,
  redactionCount: 0,
  sourceLearningValue: 1000
});
const hard = candidateLearningValueScore({
  qualityScore: 5000,
  difficulty: 5,
  redactionCount: 0,
  sourceLearningValue: 4000
});
assert(Number.isInteger(easy) && easy >= 0 && easy <= 10000);
assert(Number.isInteger(hard) && hard >= 0 && hard <= 10000);
assert(hard > easy);

assert(repository.includes("from('zuvyr_user_preferences')"));
assert(repository.includes("'owner_id,training_consent,updated_at'"));
assert(repository.includes("from('zuvyr_training_consent_events')"));
assert(!repository.includes("from('zuvyr_learning_consents')"));
assert(repository.includes('listConsentHistory'));
assert(repository.includes('listExclusions'));
assert(repository.includes('excludeCandidate'));
assert(repository.includes("currentConsentAuthority: 'zuvyr_user_preferences.training_consent'"));

for (const marker of [
  "router.get('/policy'",
  "router.get('/consent'",
  "router.get('/consent/history'",
  "router.put('/consent'",
  "router.get('/summary'",
  "router.get('/events'",
  "router.get('/failures'",
  "router.get('/rights'",
  "router.post('/rights'",
  "router.post('/rights/:rightsId/revoke'",
  "router.get('/candidates'",
  "router.post('/candidates/:candidateId/exclude'",
  "router.post('/candidates/prepare'",
  "router.get('/exclusions'"
]) {
  assert(routes.includes(marker), marker);
}
assert(routes.includes('currentConsentAuthority: learningConfig.training.currentConsentAuthority'));
assert.equal(
  config.training.currentConsentAuthority,
  'zuvyr_user_preferences.training_consent'
);
assert(routes.includes('optOutExcludesExistingCandidates:'));
assert(routes.includes('learningConfig.training.optOutBehavior'));
assert.equal(
  config.training.optOutBehavior,
  'exclude_existing_candidates_and_block_future_admission'
);
assert(routes.includes('dataDeleteRequestExcludesExistingCandidates:'));
assert(routes.includes('learningConfig.training.dataDeleteBehavior'));
assert.equal(
  config.training.dataDeleteBehavior,
  'exclude_existing_training_candidates_immediately'
);
assert(routes.includes('consentPolicyVersion: learningConfig.training.consentPolicyVersion'));
assert(routes.includes('sharedLearningPlane: learningConfig.sharedLearningPlane'));

assert(server.includes("createLearningPipelineRouter"));
const mount = server.indexOf("'/api/learning'");
assert(mount >= 0);
const mountSegment = server.slice(Math.max(0, mount - 180), mount + 420);
assert(mountSegment.includes('requireAuth'));
assert(mountSegment.includes("rateLimit('workspace')"));
assert(mountSegment.includes('createLearningPipelineRouter({ db: supabaseAdmin })'));

for (const marker of [
  'Allow model training',
  'Memory and model-training permissions are independent',
  'Training is OFF by default',
  '/api/learning',
  'Non-content outcome events',
  'Open failure patterns',
  'Eligible candidates',
  'Training exclusions',
  'Your content is excluded from global-model training.'
]) {
  assert(memoryUi.includes(marker), marker);
}
assert(memoryCss.includes('ZUVYR PACK094 LEARNING STATUS'));
assert(memoryCss.includes('.zuvyr-learning-status'));
assert(memoryCss.includes('.zuvyr-learning-grid'));

for (const marker of [
  'ZUVYR PACK094 DATA RIGHTS + SHARED LEARNING PLANE',
  'Training & Learning',
  'Memory and global-model training are separate permissions',
  'Shared model knowledge',
  'All routed models receive the same authorized ZUVYR runtime knowledge envelope',
  'ZUVYR-owned models',
  'External provider models',
  '/api/learning/consent',
  '/api/learning/rights?limit=50',
  '/api/learning/candidates?limit=50',
  '/api/learning/exclusions?limit=50',
  '/api/learning/consent/history?limit=20',
  'data-zuvyr-pack094-revoke-right',
  'data-zuvyr-pack094-exclude-candidate',
  'data-zuvyr-pack094-training-toggle'
]) {
  assert(unifiedUi.includes(marker), marker);
}
assert(!unifiedUi.includes('redactedText'));
assert(!unifiedUi.includes('providerSystemPrompt'));
assert.doesNotThrow(() => new Function(unifiedUi));
assert(unifiedCss.includes('ZUVYR PACK094 DATA RIGHTS + SHARED LEARNING PLANE'));
assert(unifiedCss.includes('.zuvyr-pack094-data-rights'));
assert(unifiedCss.includes('.zuvyr-pack094-model-grid'));
assert(unifiedCss.includes('@media (max-width:700px)'));

console.log('PASS: PACK094 uses one canonical training-consent authority and immutable consent history');
console.log('PASS: PACK094 non-content telemetry excludes prompts/responses/task content');
console.log('PASS: PACK094 candidate admission requires opt-in, rights, provenance, privacy and dedupe');
console.log('PASS: PACK094 revocation/data-rights exclusions and Failure Bank authority are wired');
console.log('PASS: PACK094 learning status is authenticated and user-visible');
console.log('PASS: PACK094 shared learning plane keeps routed-model knowledge consistent without claiming external weight training');
console.log('PASS: PACK094 Data Rights UI exposes consent, rights, candidates, exclusions and Memory/Training separation');
console.log('LIVE PROVIDER / PAYMENT CALLS: NONE');
