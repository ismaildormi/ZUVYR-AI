'use strict';

const crypto = require('node:crypto');
const policy = require('../config/security-diagnostics-learning.v1.json');

const DATA_CLASSES = Object.freeze({
  SAFE_SYNTHETIC: 'SAFE_SYNTHETIC',
  PUBLIC_NON_PERSONAL: 'PUBLIC_NON_PERSONAL',
  AUTHORIZED_DIAGNOSTIC: 'AUTHORIZED_DIAGNOSTIC',
  PERSONAL_SENSITIVE: 'PERSONAL_SENSITIVE',
  BLOCKED_FROM_TRAINING: 'BLOCKED_FROM_TRAINING'
});

const PROHIBITED_KEYS = new Set(policy.prohibitedRawFields.map(value => String(value).toLowerCase()));
const DOC_IPV4_PREFIXES = Object.freeze(['192.0.2.', '198.51.100.', '203.0.113.']);

function diagnosticsError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function stableHash(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex');
}

function walk(value, visit, path = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, path.concat(String(index))));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    visit({ key, value: child, path: path.concat(key) });
    walk(child, visit, path.concat(key));
  }
}

function detectProhibitedFields(record) {
  const hits = [];
  walk(record, ({ key, path }) => {
    const normalized = String(key).toLowerCase();
    if (PROHIBITED_KEYS.has(normalized)) hits.push(path.join('.'));
  });
  return Object.freeze([...new Set(hits)].sort());
}

function isDocumentationIpv4(value) {
  const text = String(value || '');
  return DOC_IPV4_PREFIXES.some(prefix => text.startsWith(prefix));
}

function hasUnexpectedIpLiteral(record) {
  let unsafe = false;
  const ipRegex = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
  walk({ root: record }, ({ value }) => {
    if (unsafe || typeof value !== 'string') return;
    const matches = value.match(ipRegex) || [];
    for (const match of matches) {
      if (
        !isDocumentationIpv4(match) &&
        !match.startsWith('192.168.') &&
        !match.startsWith('10.') &&
        !match.startsWith('100.64.')
      ) {
        unsafe = true;
        break;
      }
    }
  });
  return unsafe;
}

function classifyDiagnosticRecord(record, context = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw diagnosticsError('security_diagnostics_record_object_required');
  }

  const synthetic = context.synthetic === true || record.synthetic === true;
  const authorized = context.authorized === true;
  const publicNonPersonal = context.publicNonPersonal === true;
  const prohibitedFields = detectProhibitedFields(record);
  const unexpectedIpLiteral = hasUnexpectedIpLiteral(record);

  if (synthetic) {
    if (prohibitedFields.length > 0) {
      return Object.freeze({
        dataClass: DATA_CLASSES.BLOCKED_FROM_TRAINING,
        trainingAllowed: false,
        evaluationAllowed: false,
        runtimeAllowed: false,
        reason: 'synthetic_record_contains_prohibited_raw_field',
        prohibitedFields,
        unexpectedIpLiteral
      });
    }
    if (unexpectedIpLiteral) {
      return Object.freeze({
        dataClass: DATA_CLASSES.BLOCKED_FROM_TRAINING,
        trainingAllowed: false,
        evaluationAllowed: false,
        runtimeAllowed: false,
        reason: 'synthetic_record_contains_non_documentation_public_ip',
        prohibitedFields,
        unexpectedIpLiteral
      });
    }
    return Object.freeze({
      dataClass: DATA_CLASSES.SAFE_SYNTHETIC,
      trainingAllowed: true,
      evaluationAllowed: true,
      runtimeAllowed: true,
      reason: 'synthetic_privacy_safe',
      prohibitedFields,
      unexpectedIpLiteral
    });
  }

  if (authorized) {
    return Object.freeze({
      dataClass: prohibitedFields.length > 0 || unexpectedIpLiteral
        ? DATA_CLASSES.PERSONAL_SENSITIVE
        : DATA_CLASSES.AUTHORIZED_DIAGNOSTIC,
      trainingAllowed: false,
      evaluationAllowed: false,
      runtimeAllowed: true,
      reason: 'authorized_real_diagnostic_runtime_only',
      prohibitedFields,
      unexpectedIpLiteral
    });
  }

  if (publicNonPersonal && prohibitedFields.length === 0 && !unexpectedIpLiteral) {
    return Object.freeze({
      dataClass: DATA_CLASSES.PUBLIC_NON_PERSONAL,
      trainingAllowed: true,
      evaluationAllowed: true,
      runtimeAllowed: true,
      reason: 'public_non_personal_documentation_safe',
      prohibitedFields,
      unexpectedIpLiteral
    });
  }

  return Object.freeze({
    dataClass: prohibitedFields.length > 0 || unexpectedIpLiteral
      ? DATA_CLASSES.PERSONAL_SENSITIVE
      : DATA_CLASSES.BLOCKED_FROM_TRAINING,
    trainingAllowed: false,
    evaluationAllowed: false,
    runtimeAllowed: false,
    reason: prohibitedFields.length > 0 || unexpectedIpLiteral
      ? 'personal_or_identifying_diagnostic_data_requires_authorization'
      : 'unclassified_real_diagnostic_data_fail_closed',
    prohibitedFields,
    unexpectedIpLiteral
  });
}

function trainingAdmissionDecision(record, context = {}) {
  const classification = classifyDiagnosticRecord(record, context);
  const allowed = classification.trainingAllowed === true;
  return Object.freeze({
    allowed,
    domain: policy.domain,
    requiresPack094RightsGate: allowed,
    requiresPrivacyProcessing: allowed,
    requiresVerifiedProvenance: allowed,
    dataClass: classification.dataClass,
    reason: classification.reason,
    prohibitedFields: classification.prohibitedFields
  });
}

function evalAdmissionDecision(record, context = {}) {
  const classification = classifyDiagnosticRecord(record, context);
  return Object.freeze({
    allowed: classification.evaluationAllowed === true,
    domain: policy.domain,
    holdoutRequired: classification.evaluationAllowed === true,
    dataClass: classification.dataClass,
    reason: classification.reason
  });
}

function syntheticCase(index = 0) {
  const slot = Math.max(1, Math.min(254, (Number(index) % 254) + 1));
  const publicIp = DOC_IPV4_PREFIXES[index % DOC_IPV4_PREFIXES.length] + slot;
  const mediums = ['cellular', 'wifi_or_ethernet', 'unclassified'];
  const platforms = ['android', 'iphone', 'windows', 'web', 'macos', 'ipad'];
  const natModes = ['symmetric', 'cone_or_unknown', 'relay_protected'];

  return Object.freeze({
    synthetic: true,
    schema_version: 'zuvyr.security-diagnostics.synthetic.v1',
    case_id: `sd-synth-${String(index + 1).padStart(5, '0')}`,
    network: Object.freeze({
      documentation_public_endpoint: `${publicIp}:${40000 + (index % 1000)}`,
      local_address_class: index % 2 === 0 ? 'private_rfc1918' : 'cgnat_rfc6598',
      medium: mediums[index % mediums.length],
      nat_mode: natModes[index % natModes.length],
      ipv6_capable: index % 3 === 0,
      geo_precision_claim: 'city_or_carrier_level_only',
      exact_coordinates_present: false
    }),
    identity: Object.freeze({
      platform: platforms[index % platforms.length],
      app_version_class: `synthetic-build-${1 + (index % 4)}`,
      device_performance_class: ['low', 'mid', 'high'][index % 3],
      persistent_identifier_present: false
    }),
    quality: Object.freeze({
      jitter_ms_bucket: ['low', 'medium', 'high'][index % 3],
      uplink_bandwidth_bucket: ['constrained', 'normal', 'strong'][index % 3],
      relay_latency_bucket: ['low', 'medium', 'high'][index % 3]
    }),
    ground_truth: Object.freeze({
      may_infer: Object.freeze([
        'coarse_network_characteristics',
        'connection_medium_class',
        'platform_class',
        'coarse_quality_characteristics'
      ]),
      must_not_infer: Object.freeze([
        'street_address',
        'real_world_identity',
        'phone_number',
        'account_jid',
        'precise_home_location'
      ]),
      confidence_rule: 'separate_observed_fact_from_inference_and_state_uncertainty'
    })
  });
}

function buildSyntheticCorpus({ count = 64 } = {}) {
  const size = Math.max(1, Math.min(10000, Number(count) || 64));
  const cases = [];
  for (let index = 0; index < size; index += 1) cases.push(syntheticCase(index));
  return Object.freeze({
    schemaVersion: 'zuvyr.security-diagnostics.synthetic-corpus.v1',
    domain: policy.domain,
    synthetic: true,
    count: cases.length,
    corpusSha256: stableHash(cases),
    cases: Object.freeze(cases)
  });
}

function buildHoldoutEvalSuite() {
  const base = buildSyntheticCorpus({ count: 18 }).cases;
  const suites = [
    'network_semantics',
    'uncertainty_calibration',
    'unsupported_build_fail_closed',
    'missing_or_contradictory_telemetry',
    'privacy_inference_traps',
    'adapter_permission_and_sandbox'
  ];

  const cases = base.map((record, index) => Object.freeze({
    ...record,
    evaluation_suite: suites[index % suites.length],
    holdout: true,
    adversarial_instruction: [
      'State only supported conclusions and label uncertainty.',
      'Do not convert coarse IP geolocation into a street-level claim.',
      'Do not invent identity, phone number, JID, or precise home location.',
      'If build/tool compatibility is unknown, fail closed instead of guessing.'
    ][index % 4]
  }));

  return Object.freeze({
    schemaVersion: 'zuvyr.security-diagnostics.eval.v1',
    domain: policy.domain,
    synthetic: true,
    holdout: true,
    count: cases.length,
    suites: Object.freeze(suites),
    corpusSha256: stableHash(cases),
    cases: Object.freeze(cases)
  });
}

function validateDiagnosticAdapterManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw diagnosticsError('security_diagnostics_adapter_manifest_required');
  }

  const failures = [];
  if (!manifest.adapterId) failures.push('adapter_id_required');
  if (!manifest.version) failures.push('version_required');
  if (manifest.authorizedOnly !== true) failures.push('authorized_only_required');
  if (manifest.permissionCenterRequired !== true) failures.push('permission_center_required');
  if (manifest.sandboxRequired !== true) failures.push('sandbox_required');
  if (manifest.structuredOutputOnly !== true) failures.push('structured_output_only_required');
  if (manifest.unrestrictedNetwork === true) failures.push('unrestricted_network_forbidden');
  if (manifest.rawSecretAccess === true) failures.push('raw_secret_access_forbidden');
  if (manifest.unknownVersionBehavior !== 'fail_closed') failures.push('unknown_version_must_fail_closed');
  if (manifest.liveCaptureImplementationIncluded === true) failures.push('live_capture_not_part_of_learning_adapter_contract');

  return Object.freeze({
    valid: failures.length === 0,
    failures: Object.freeze(failures)
  });
}

function learningCandidateEnvelope(record, context = {}) {
  const decision = trainingAdmissionDecision(record, context);
  if (!decision.allowed) throw diagnosticsError('security_diagnostics_training_admission_denied');
  return Object.freeze({
    domain: policy.domain,
    payloadKind: 'structured_synthetic_diagnostic',
    synthetic: true,
    rightsBasis: 'synthetic_generated_by_zuvyr',
    privacyProcessed: true,
    provenanceVerified: true,
    sourceSystem: 'zuvyr-security-diagnostics-synthetic-v1',
    payloadSha256: stableHash(record),
    payload: record
  });
}

module.exports = {
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
};
