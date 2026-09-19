'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

const config = require('./config/model-lab.v1.json');
const {
  isBlockedIpv4,
  isBlockedIpv6,
  assertPublicResolvedAddress,
  normalizeEndpointUrl,
  normalizeHealthPath,
  ownershipChallenge,
  hashChallenge,
  publicAttestation
} = require('./lib/modelLabComputeConnector');
const {
  publicConnector
} = require('./lib/modelLabRepository');

const migration = read('95_pack095_model_lab.sql');
const repository = read('lib/modelLabRepository.js');
const routes = read('lib/modelLabRoutes.js');
const server = read('server.js');
const ux = read('../frontend/zuvyr-unified-ux-v1.js');
const css = read('../frontend/zuvyr-unified-ux-v1.css');
const ownedPolicy = require('./config/zuvyr-owned-model-runtime-policy.v1.json');

function count(source, needle) {
  return source.split(needle).length - 1;
}

assert.equal(config.version, 'pack-095.model-lab.v1');
assert.equal(config.access.launchMode, 'owner_admin_only');
assert.equal(config.access.authority, 'profiles.is_admin');
assert.equal(config.access.multiTenantReady, true);
assert.equal(config.datasets.sourceAuthority, 'PACK094');
assert.equal(config.computeConnectors.credentialStorage, 'supabase_vault_reference');
assert.equal(config.computeConnectors.credentialReturnedToBrowser, false);
assert.equal(config.computeConnectors.directHttpsOnly, true);
assert.equal(config.computeConnectors.privateIpDirectFetch, false);
assert.equal(config.computeConnectors.redirectFollowing, false);
assert.equal(config.training.liveExecutionEnabled, false);
assert.equal(config.training.executionOwner, 'PACK096');
assert.equal(config.rollout.liveRouterActivationEnabled, false);
assert.equal(config.rollout.liveRouterActivationOwner, 'PACK096');
assert.deepEqual(
  config.rollout.stages,
  ['LAB','EVAL','SHADOW','CANARY','SECONDARY','PRIMARY']
);
assert.equal(config.economics.zuvyrOwnedModelApiFeeUsd, 0);
assert.equal(config.economics.zuvyrOwnedModelUsageFeeUsd, 0);
assert.equal(config.economics.inferenceMarkupUsd, 0);
assert.equal(config.economics.customerComputeBilledByZuvyr, false);

const tables = [
  'zuvyr_model_lab_datasets',
  'zuvyr_model_lab_dataset_versions',
  'zuvyr_model_lab_dataset_items',
  'zuvyr_model_lab_dataset_licenses',
  'zuvyr_model_lab_skills',
  'zuvyr_model_lab_curricula',
  'zuvyr_model_lab_curriculum_skills',
  'zuvyr_compute_connectors',
  'zuvyr_compute_connector_attestations',
  'zuvyr_model_lab_training_runs',
  'zuvyr_model_lab_benchmarks',
  'zuvyr_model_lab_checkpoints',
  'zuvyr_model_lab_evaluations',
  'zuvyr_model_lab_stage_events',
  'zuvyr_model_lab_synthetic_jobs'
];
for (const table of tables) {
  assert.equal(
    count(migration, 'create table if not exists public.' + table + ' ('),
    1,
    table + ' must be created exactly once'
  );
  assert(
    migration.includes('alter table public.' + table + ' enable row level security;'),
    table + ' must have RLS'
  );
  assert(
    migration.includes('revoke all on public.' + table + ' from public,anon,authenticated;'),
    table + ' must revoke browser roles'
  );
}

assert.equal((migration.match(/create table if not exists public\./g) || []).length, 15);
assert(!/create policy\s+/i.test(migration));
assert(!/grant\s+(?:select|insert|update|delete)[^;]*\s+to\s+(?:anon|authenticated)/i.test(migration));

for (const rpc of [
  'pack095_require_admin',
  'create_zuvyr_model_lab_dataset_pack095',
  'add_zuvyr_model_lab_candidate_pack095',
  'freeze_zuvyr_model_lab_dataset_pack095',
  'clone_zuvyr_model_lab_dataset_version_pack095',
  'set_zuvyr_compute_connector_secret_pack095',
  'get_zuvyr_compute_connector_secret_pack095',
  'clear_zuvyr_compute_connector_secret_pack095',
  'create_zuvyr_model_lab_training_run_pack095',
  'record_zuvyr_model_lab_checkpoint_pack095',
  'promote_zuvyr_model_lab_checkpoint_pack095',
  'rollback_zuvyr_model_lab_checkpoint_pack095'
]) {
  assert.equal(
    count(migration, 'create or replace function public.' + rpc + '('),
    1,
    rpc + ' must exist exactly once'
  );
}

assert(migration.includes('where id=p_admin_id and is_admin=true'));
assert(migration.includes('vault.create_secret('));
assert(migration.includes('vault.update_secret('));
assert(migration.includes('vault.decrypted_secrets'));
assert(migration.includes('delete from vault.secrets'));
assert(migration.includes('credential_secret_id uuid'));
assert(!/credential_(?:plaintext|value|token|api_key)\s+text/i.test(migration));

for (const marker of [
  "c.status <> 'candidate'",
  'r.allow_global_training is not true',
  'r.revoked_at is not null',
  "r.privacy_status <> 'processed'",
  "r.provenance_status <> 'verified'",
  'coalesce(v_training_consent,false) is not true',
  'coalesce(p.training_consent,false) is not true'
]) {
  assert(
    migration.toLowerCase().includes(marker.toLowerCase()),
    'rights/consent revalidation marker missing: ' + marker
  );
}

assert(migration.includes('dataset_sha256'));
assert(migration.includes('rights_snapshot_sha256'));
assert(migration.includes('artifact_sha256'));
assert(migration.includes('base_model_license_reference'));
assert(migration.includes('license_reference'));
assert(migration.includes('task_success_bps'));
assert(migration.includes('total_cost_per_successful_task_microusd'));

assert(migration.includes("current_stage in ('LAB','EVAL','SHADOW','CANARY','SECONDARY','PRIMARY')"));
assert(migration.includes('pack095_independent_eval_required'));
assert(migration.includes('pack095_independent_eval_not_passed'));
assert(migration.includes("'production_routing_enabled',false"));
assert(migration.includes('rollback_zuvyr_model_lab_checkpoint_pack095'));
assert(migration.includes('pack095_live_stage_rollback_owned_by_pack096'));
assert(migration.includes("'cancelled_planned_stage'"));

assert(migration.includes('customer_compute_cost_model'));
assert(migration.includes('zuvyr_control_plane_cost_model'));
assert(migration.includes('customer_compute_cost_microusd'));
assert(migration.includes('zuvyr_control_plane_cost_microusd'));
assert(!migration.includes('combined_compute_cost'));

assert.equal(isBlockedIpv4('127.0.0.1'), true);
assert.equal(isBlockedIpv4('10.1.2.3'), true);
assert.equal(isBlockedIpv4('192.168.1.2'), true);
assert.equal(isBlockedIpv4('169.254.169.254'), true);
assert.equal(isBlockedIpv4('8.8.8.8'), false);
assert.equal(isBlockedIpv6('::1'), true);
assert.equal(isBlockedIpv6('fc00::1'), true);
assert.equal(isBlockedIpv6('fe80::1'), true);
assert.throws(
  () => assertPublicResolvedAddress('127.0.0.1'),
  error => error.code === 'model_lab_connector_private_address_blocked'
);
assert.doesNotThrow(() => assertPublicResolvedAddress('8.8.8.8'));

assert.equal(
  normalizeEndpointUrl('https://gpu.example.com/path'),
  'https://gpu.example.com/path'
);
assert.throws(
  () => normalizeEndpointUrl('https://gpu.example.com/path?secret=no#x'),
  error => error.code === 'model_lab_connector_endpoint_credentials_forbidden'
);
assert.throws(
  () => normalizeEndpointUrl('http://gpu.example.com'),
  error => error.code === 'model_lab_connector_https_required'
);
assert.throws(
  () => normalizeEndpointUrl('https://127.0.0.1'),
  error => error.code === 'model_lab_connector_dns_hostname_required'
);
assert.throws(
  () => normalizeEndpointUrl('https://localhost'),
  error => error.code === 'model_lab_connector_private_hostname_blocked'
);
assert.equal(normalizeHealthPath('', 'openai_compatible_https'), '/v1/models');
assert.equal(normalizeHealthPath('', 'custom_https'), '/health');
assert.throws(
  () => normalizeHealthPath('/../../secret', 'custom_https'),
  error => error.code === 'model_lab_connector_health_path_invalid'
);

const challenge = ownershipChallenge();
assert.match(challenge.hash, /^[0-9a-f]{64}$/);
assert.equal(hashChallenge(challenge.token), challenge.hash);
assert.equal(challenge.path, '/.well-known/zuvyr-compute-verification');

const attestation = publicAttestation(
  'openai_compatible_https',
  {
    status: 200,
    body: JSON.stringify({ data: [{ id:'owned-model-a' }, { id:'owned-model-b' }] })
  },
  42
);
assert.equal(attestation.healthStatus, 'healthy');
assert.equal(attestation.capabilities.openaiCompatible, true);
assert.equal(attestation.capabilities.training, false);
assert.deepEqual(attestation.capabilities.models, ['owned-model-a','owned-model-b']);
assert.equal(attestation.customerComputeCostMicrousd, null);
assert.equal(attestation.zuvyrControlPlaneCostMicrousd, 0);
assert.equal(attestation.costKnown, false);

const redacted = publicConnector({
  id:'c1',
  ownership_kind:'user',
  ownership_subject:'my gpu',
  ownership_evidence_reference:null,
  ownership_verified_at:null,
  connector_kind:'custom_https',
  endpoint_url:'https://gpu.example.com',
  health_path:'/health',
  credential_secret_id:'vault-secret-id-must-not-leak',
  capability_claims:{training:true},
  attested_capabilities:{},
  customer_compute_cost_model:{hourly:1},
  zuvyr_control_plane_cost_model:{hourly:0},
  cost_known:true,
  health_status:'healthy',
  qualification_status:'qualified',
  last_health_at:null,
  last_health_latency_ms:10,
  last_error_code:null,
  created_at:'now',
  updated_at:'now'
});
assert.equal(redacted.credentialConfigured, true);
assert.equal(redacted.credentialSecretId, undefined);
assert.equal(redacted.credential_secret_id, undefined);
assert(!JSON.stringify(redacted).includes('vault-secret-id-must-not-leak'));

for (const marker of [
  "router.get('/capabilities'",
  "router.get('/summary'",
  "router.post('/datasets'",
  "router.post('/connectors'",
  "/credential'",
  "/verify-ownership'",
  "/health-check'",
  "router.post('/training-runs'",
  "router.post('/benchmarks'",
  "router.post('/evaluations'",
  "/checkpoint'",
  "/promote'",
  "/rollback'",
  "router.post('/synthetic-jobs'",
  'verifyOwnershipImpl',
  'healthCheckImpl',
  'liveExecutionEnabled:false',
  "executionOwner:'PACK096'"
]) {
  assert(routes.includes(marker), marker);
}

assert(repository.includes('publicConnector'));
assert(repository.includes('credentialConfigured'));
assert(!repository.includes('credential: row.credential_secret_id'));
assert(repository.includes('getConnectorSecret'));
assert(repository.includes('recordAttestation'));
assert(repository.includes('customer_compute_cost_microusd'));
assert(repository.includes('zuvyr_control_plane_cost_microusd'));

const modelMount = server.indexOf("'/api/model-lab'");
assert(modelMount >= 0);
const mountSegment = server.slice(Math.max(0,modelMount-450),modelMount+800);
assert(mountSegment.includes('requireAuth'));
assert(mountSegment.includes('requireAdmin'));
assert(mountSegment.includes("rateLimit('workspace')"));
assert(mountSegment.includes('createModelLabRouter({ db: supabaseAdmin })'));

for (const marker of [
  'ZUVYR PACK095 MODEL LAB',
  'data-zuvyr-pack095-model-lab',
  '/api/model-lab/summary',
  '/api/model-lab/connectors',
  '/verify-ownership',
  '/health-check',
  '/credential',
  '/api/model-lab/training-runs',
  'LIVE EXECUTION OFF',
  'PACK096'
]) {
  assert(ux.includes(marker), marker);
}
assert(ux.includes("if (error.status === 403 || error.code === 'admin_required')"));
assert(ux.includes('root.remove()'));
assert(!/credentialSecretId|credential_secret_id|vault-secret/i.test(
  ux.slice(ux.indexOf('ZUVYR PACK095 MODEL LAB'))
));
assert(css.includes('ZUVYR PACK095 MODEL LAB'));
assert(css.includes('@media (max-width:700px)'));
assert(css.includes('html[dir="rtl"]'));

assert.equal(ownedPolicy.modelFirstPriority.activePriorityPack, '095');
assert.deepEqual(ownedPolicy.modelFirstPriority.completedPriorityPacks, ['094']);
assert.deepEqual(ownedPolicy.modelFirstPriority.immediateSequence, ['094','095','096']);

console.log('PASS: PACK095 Model Lab schema is admin/service-role only with 15 durable control-plane tables');
console.log('PASS: PACK095 dataset admission revalidates PACK094 consent/rights/privacy/provenance');
console.log('PASS: PACK095 Compute Connector blocks private SSRF targets and separates customer/control-plane cost');
console.log('PASS: PACK095 credentials remain Vault-backed and browser responses expose only configured/not-configured state');
console.log('PASS: PACK095 checkpoint/eval/rollback lineage is present while live Router activation remains owned by PACK096');
console.log('PASS: PACK095 owner/admin UI is responsive, secret-redacted and disappears for non-admin users');
console.log('NETWORK / PROVIDER / TRAINING / PAYMENT CALLS: NONE');
