'use strict';

const assert = require('node:assert/strict');
const {
  DATA_CLASSES,
  policy,
  detectProhibitedFields,
  classifyDiagnosticRecord,
  trainingAdmissionDecision,
  evalAdmissionDecision,
  buildSyntheticCorpus,
  buildHoldoutEvalSuite,
  validateDiagnosticAdapterManifest,
  learningCandidateEnvelope,
  isDocumentationIpv4
} = require('./lib/securityDiagnosticsLearning');

assert.equal(policy.domain, 'security_diagnostics');
assert.equal(policy.training.rawRealDiagnosticCaptureAllowed, false);
assert.equal(policy.evaluation.realUserDiagnosticOutputAllowed, false);
assert.equal(policy.runtime.realDiagnostics, 'authorized_runtime_only');
assert.equal(policy.adapterContract.liveCaptureImplementationIncluded, false);
assert.equal(policy.integration.activePackMustNotChange, 'PACK089');
assert.equal(policy.integration.doesNotUnlockPack090, true);

const synthetic = {
  synthetic: true,
  network: {
    documentation_public_endpoint: '203.0.113.42:443',
    local_address_class: 'cgnat_rfc6598',
    exact_coordinates_present: false
  },
  identity: {
    platform: 'android',
    persistent_identifier_present: false
  }
};

const syntheticClass = classifyDiagnosticRecord(synthetic, { synthetic: true });
assert.equal(syntheticClass.dataClass, DATA_CLASSES.SAFE_SYNTHETIC);
assert.equal(syntheticClass.trainingAllowed, true);
assert.equal(syntheticClass.evaluationAllowed, true);
assert.equal(trainingAdmissionDecision(synthetic, { synthetic: true }).allowed, true);
assert.equal(evalAdmissionDecision(synthetic, { synthetic: true }).allowed, true);

const envelope = learningCandidateEnvelope(synthetic, { synthetic: true });
assert.equal(envelope.domain, 'security_diagnostics');
assert.equal(envelope.synthetic, true);
assert.equal(envelope.privacyProcessed, true);
assert.equal(envelope.provenanceVerified, true);
assert.match(envelope.payloadSha256, /^[a-f0-9]{64}$/);

const realAuthorized = {
  public_ip: '8.8.8.8',
  call_id: 'real-call-id',
  platform: 'iphone'
};
const realAuthorizedClass = classifyDiagnosticRecord(realAuthorized, { authorized: true });
assert.equal(realAuthorizedClass.dataClass, DATA_CLASSES.PERSONAL_SENSITIVE);
assert.equal(realAuthorizedClass.runtimeAllowed, true);
assert.equal(realAuthorizedClass.trainingAllowed, false);
assert.equal(realAuthorizedClass.evaluationAllowed, false);
assert.equal(trainingAdmissionDecision(realAuthorized, { authorized: true }).allowed, false);
assert.equal(evalAdmissionDecision(realAuthorized, { authorized: true }).allowed, false);
assert.deepEqual(
  detectProhibitedFields(realAuthorized),
  ['call_id', 'public_ip']
);

const unauthorizedReal = classifyDiagnosticRecord({ platform: 'android' });
assert.equal(unauthorizedReal.dataClass, DATA_CLASSES.BLOCKED_FROM_TRAINING);
assert.equal(unauthorizedReal.runtimeAllowed, false);
assert.equal(unauthorizedReal.trainingAllowed, false);

const publicDocumentation = classifyDiagnosticRecord(
  { topic: 'symmetric NAT', statement: 'documentation-only explanation' },
  { publicNonPersonal: true }
);
assert.equal(publicDocumentation.dataClass, DATA_CLASSES.PUBLIC_NON_PERSONAL);
assert.equal(publicDocumentation.trainingAllowed, true);

const badSynthetic = classifyDiagnosticRecord({
  synthetic: true,
  public_ip: '203.0.113.9'
}, { synthetic: true });
assert.equal(badSynthetic.dataClass, DATA_CLASSES.BLOCKED_FROM_TRAINING);
assert.equal(badSynthetic.trainingAllowed, false);
assert.equal(badSynthetic.reason, 'synthetic_record_contains_prohibited_raw_field');

const badSyntheticRealIp = classifyDiagnosticRecord({
  synthetic: true,
  note: 'peer endpoint 8.8.8.8'
}, { synthetic: true });
assert.equal(badSyntheticRealIp.trainingAllowed, false);
assert.equal(badSyntheticRealIp.reason, 'synthetic_record_contains_non_documentation_public_ip');

for (const ip of ['192.0.2.1', '198.51.100.254', '203.0.113.8']) {
  assert.equal(isDocumentationIpv4(ip), true);
}
assert.equal(isDocumentationIpv4('8.8.8.8'), false);

const corpus = buildSyntheticCorpus({ count: 96 });
assert.equal(corpus.synthetic, true);
assert.equal(corpus.domain, 'security_diagnostics');
assert.equal(corpus.count, 96);
assert.match(corpus.corpusSha256, /^[a-f0-9]{64}$/);
for (const record of corpus.cases) {
  assert.equal(record.synthetic, true);
  assert.equal(record.network.exact_coordinates_present, false);
  assert.equal(record.identity.persistent_identifier_present, false);
  assert.equal(detectProhibitedFields(record).length, 0);
  assert.equal(classifyDiagnosticRecord(record, { synthetic: true }).trainingAllowed, true);
  assert(record.ground_truth.must_not_infer.includes('street_address'));
  assert(record.ground_truth.must_not_infer.includes('real_world_identity'));
  assert(record.ground_truth.must_not_infer.includes('phone_number'));
}

const evalSuite = buildHoldoutEvalSuite();
assert.equal(evalSuite.synthetic, true);
assert.equal(evalSuite.holdout, true);
assert.equal(evalSuite.count, 18);
assert.equal(new Set(evalSuite.suites).size, 6);
assert(evalSuite.suites.includes('privacy_inference_traps'));
assert(evalSuite.suites.includes('unsupported_build_fail_closed'));
for (const record of evalSuite.cases) {
  assert.equal(record.holdout, true);
  assert.equal(record.synthetic, true);
  assert.equal(classifyDiagnosticRecord(record, { synthetic: true }).evaluationAllowed, true);
}

const goodAdapter = validateDiagnosticAdapterManifest({
  adapterId: 'authorized-diagnostics-example',
  version: '1.0.0',
  authorizedOnly: true,
  permissionCenterRequired: true,
  sandboxRequired: true,
  structuredOutputOnly: true,
  unrestrictedNetwork: false,
  rawSecretAccess: false,
  unknownVersionBehavior: 'fail_closed',
  liveCaptureImplementationIncluded: false
});
assert.equal(goodAdapter.valid, true);
assert.deepEqual(goodAdapter.failures, []);

const unsafeAdapter = validateDiagnosticAdapterManifest({
  adapterId: 'unsafe',
  version: '1',
  authorizedOnly: false,
  permissionCenterRequired: false,
  sandboxRequired: false,
  structuredOutputOnly: false,
  unrestrictedNetwork: true,
  rawSecretAccess: true,
  unknownVersionBehavior: 'best_effort',
  liveCaptureImplementationIncluded: true
});
assert.equal(unsafeAdapter.valid, false);
for (const expected of [
  'authorized_only_required',
  'permission_center_required',
  'sandbox_required',
  'structured_output_only_required',
  'unrestricted_network_forbidden',
  'raw_secret_access_forbidden',
  'unknown_version_must_fail_closed',
  'live_capture_not_part_of_learning_adapter_contract'
]) {
  assert(unsafeAdapter.failures.includes(expected));
}

assert.throws(
  () => learningCandidateEnvelope(realAuthorized, { authorized: true }),
  /security_diagnostics_training_admission_denied/
);

console.log('PASS security diagnostics learning/privacy/eval foundation');
