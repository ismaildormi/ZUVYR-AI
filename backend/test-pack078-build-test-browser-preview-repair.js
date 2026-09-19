'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

const runtimeConfig = require('./config/code-runtime.v1.json');
const codeStudioConfig = require('./config/code-studio.v1.json');
const featureFlags = require('./config/feature-flags.json');

const {
  packageScriptCommand,
  commandSpecForOperation,
  detectPreviewPort
} = require('./lib/codeRuntimeRequestContract');
const {
  structuredDiagnostic
} = require('./lib/codeRuntimeDiagnostics');
const {
  assertRepairableJob,
  repairTargets,
  repairInstruction,
  retestOperation,
  repairStatusFromJob
} = require('./lib/codeRepairPolicy');

const migration = read('78_pack078_build_test_preview_repair.sql');
const routes = read('lib/codeStudioRoutes.js');
const runtimeExecutor = read('lib/codeRuntimeExecutor.js');
const runtimeRepository = read('lib/codeRuntimeRepository.js');
const repairRepository = read('lib/codeRepairRepository.js');
const suite = read('../frontend/zuvyr-suite-v1.js');
const css = read('../frontend/zuvyr-suite-v1.css');

function count(source, needle) {
  return source.split(needle).length - 1;
}

assert.equal(runtimeConfig.version, 'pack-078.code-runtime.v1');
assert.equal(runtimeConfig.live.enabledByDefault, false);
assert.equal(runtimeConfig.live.environmentGate, 'PACK077_RUNTIME_PAID_EXECUTION_ENABLED');
assert.equal(runtimeConfig.live.requiresSandboxGate, 'M15');
assert.equal(runtimeConfig.live.requiresVerifiedRuntimePricing, true);
assert.deepEqual(runtimeConfig.preview.states, [
  'unavailable',
  'starting',
  'building',
  'ready',
  'updating',
  'build_failed',
  'runtime_error'
]);
assert.equal(runtimeConfig.preview.rawProviderRouteAllowed, false);
assert.equal(runtimeConfig.preview.providerPortProtectionStatus, 'unverified');
assert.equal(runtimeConfig.preview.authenticatedProxyRequired, true);
assert.equal(runtimeConfig.repair.maxAttempts, 2);
assert.equal(runtimeConfig.repair.autoApply, false);
assert.equal(runtimeConfig.repair.everyAttemptMetered, true);
assert.equal(runtimeConfig.repair.stopOnRepeatedFingerprint, true);

assert.equal(featureFlags.code_runtime.enabled, false);
assert.equal(featureFlags.code_terminal.enabled, false);
assert.equal(featureFlags.code_dependencies.enabled, false);
assert.equal(featureFlags.code_build.enabled, false);
assert.equal(featureFlags.code_test.enabled, false);
assert.equal(featureFlags.code_deploy.enabled, false);
assert.equal(featureFlags.code_preview.enabled, true);
assert.equal(featureFlags.code_preview.status, 'pack078_product_layer_live_deferred');
assert.equal(codeStudioConfig.capabilities.preview.status, 'pack078_product_layer_live_deferred');

for (const marker of [
  'code_repair_runs',
  'code_repair_attempts',
  'preview_state',
  'preview_candidate_port',
  'preview_transport_status',
  'last_diagnostic',
  'last_build_job_id',
  'last_test_job_id',
  'reserve_zuvyr_code_repair_run_pack078',
  'claim_zuvyr_code_repair_attempt_pack078',
  'complete_zuvyr_code_repair_attempt_pack078',
  'source_job_id',
  'max_attempts',
  'last_failure_fingerprint',
  'enable row level security',
  'from public, anon, authenticated',
  'to service_role'
]) {
  assert(migration.toLowerCase().includes(marker.toLowerCase()), marker);
}

for (const fn of [
  'reserve_zuvyr_code_repair_run_pack078',
  'claim_zuvyr_code_repair_attempt_pack078',
  'complete_zuvyr_code_repair_attempt_pack078'
]) {
  assert.equal(
    count(migration, 'create or replace function public.' + fn + '('),
    1,
    fn + ' must exist exactly once'
  );
}

assert(!/grant\s+(?:select|insert|update|delete)[^;]*\s+to\s+(?:anon|authenticated)/i.test(migration));

const project = {
  entryFile: 'src/main.js',
  files: [
    {
      path: 'package.json',
      content: JSON.stringify({
        scripts: {
          build: 'vite build',
          test: 'node --test',
          dev: 'vite'
        },
        devDependencies: { vite: '^7.0.0' }
      })
    },
    { path: 'src/main.js', content: 'console.log("ok")' }
  ],
  editorState: { activeFile: 'src/main.js' }
};

const build = packageScriptCommand(project, 'build');
assert.equal(build.command, 'npm');
assert.deepEqual(build.args, ['run', 'build']);
assert.equal(build.wait, true);
assert.equal(build.logs, true);
assert.equal(build.sudo, false);
assert.equal(build.env.CI, '1');

const testCommand = packageScriptCommand(project, 'test');
assert.deepEqual(testCommand.args, ['run', 'test']);
assert.equal(
  commandSpecForOperation({ operation:'build' }, project).script,
  'build'
);
assert.equal(
  commandSpecForOperation({ operation:'test' }, project).script,
  'test'
);
assert.equal(
  detectPreviewPort('Local: http://localhost:5173/', null),
  5173
);
assert.equal(
  detectPreviewPort('server ready on port 4321', null),
  4321
);

const diagnostic = structuredDiagnostic({
  operation:'build',
  exitCode:1,
  chunks:[
    { stream:'stderr', message:'src/main.js:7:12: error: Unexpected token' }
  ],
  fallbackCode:'pack078_build_failed'
});
assert.equal(diagnostic.kind, 'build_error');
assert.equal(diagnostic.file, 'src/main.js');
assert.equal(diagnostic.line, 7);
assert.equal(diagnostic.column, 12);
assert.match(diagnostic.fingerprint, /^[0-9a-f]{64}$/);

const failedJob = {
  id:'11111111-1111-4111-8111-111111111111',
  operation:'build',
  status:'failed',
  result:{ diagnostic }
};
assert.equal(assertRepairableJob(failedJob).fingerprint, diagnostic.fingerprint);
assert.deepEqual(repairTargets(project, diagnostic), ['src/main.js']);
assert(repairInstruction(diagnostic, 1).includes('Repair attempt 1 of 2.'));
assert(repairInstruction(diagnostic, 2).includes('Repair attempt 2 of 2.'));
assert.throws(
  () => repairInstruction(diagnostic, 3),
  error => error.code === 'pack078_repair_attempt_invalid'
);
assert.equal(retestOperation(project, 'build'), 'build');
assert.equal(retestOperation(project, 'test'), 'test');
assert.equal(repairStatusFromJob({status:'running'}), 'retesting');
assert.equal(repairStatusFromJob({status:'succeeded'}), 'succeeded');

for (const marker of [
  "router.get('/projects/:projectId/preview/state'",
  "router.post('/projects/:projectId/repair'",
  "router.get('/repair/:repairRunId'",
  "router.post('/repair/:repairRunId/continue'",
  'repairSourceJobId',
  'progressRepair',
  'assertRepairableJob',
  'repairInstruction',
  'executeAiEdit',
  'pack078',
  'previewTransportVerified: false',
  "previewStatus:\n            'deferred_raw_provider_port_protection_unverified'"
]) {
  assert(routes.includes(marker), marker);
}

assert(routes.includes("['build','test','run'].includes(job?.operation)"));
assert(routes.includes('state?.previewTransportStatus === \'verified\''));
assert(routes.includes('state?.previewState === \'ready\''));
assert(runtimeExecutor.includes("previewState: 'building'"));
assert(runtimeExecutor.includes("previewState: 'unavailable'"));
assert(runtimeExecutor.includes("previewTransportStatus: 'blocked'"));
assert(runtimeExecutor.includes('structuredDiagnostic'));
assert(runtimeRepository.includes('previewCandidatePort'));
assert(runtimeRepository.includes('lastDiagnostic'));
assert(repairRepository.includes('sourceJobId'));
assert(repairRepository.includes('maxAttempts'));
assert(repairRepository.includes('lastFailureFingerprint'));

for (const marker of [
  'ZUVYR PACK078 BUILD TEST BROWSER PREVIEW REPAIR',
  'data-zs-pack078-refresh',
  'data-zs-pack078-viewport="desktop"',
  'data-zs-pack078-viewport="tablet"',
  'data-zs-pack078-viewport="mobile"',
  'data-zs-pack078-viewport="fit"',
  'data-zs-pack078-open',
  'data-zs-pack078-fullscreen',
  'data-zs-pack078-run',
  'data-zs-pack078-build',
  'data-zs-pack078-test',
  'data-zs-pack078-repair',
  'Build failed',
  'Runtime error',
  'Preview unavailable',
  'ticketAvailable === true',
  'preview.ticketAvailable === true',
  'window.__zuvyrPack078OnProjectSaved',
  'scheduleSavedProjectValidation'
]) {
  assert(suite.includes(marker), marker);
}

const iframeIndex = suite.indexOf('data-zs-pack078-preview-frame');
const secureGateIndex = suite.lastIndexOf('preview.ticketAvailable === true', iframeIndex);
const urlGateIndex = suite.lastIndexOf('runtime.previewUrl', iframeIndex);
assert(iframeIndex > 0);
assert(secureGateIndex > 0 && secureGateIndex < iframeIndex);
assert(urlGateIndex > 0 && urlGateIndex < iframeIndex);

assert(suite.includes("sandbox=\"allow-scripts allow-forms allow-modals allow-popups\""));
assert(!suite.includes('sandbox="allow-same-origin'));
assert(suite.includes("if (runtime.preview.ticketAvailable !== true) runtime.previewUrl = null;"));
assert(suite.includes("if (!runtimeEnabled())"));
assert(suite.includes("runtime.sessionId &&\n        runtimeEnabled()"));
assert(suite.includes("startRuntime('build', { createSession:false })"));

assert(css.includes('ZUVYR PACK078 BUILD TEST BROWSER PREVIEW REPAIR'));
assert(css.includes('.zs-code-pack078-frame-stage'));
assert(css.includes('.zs-code-pack078-diagnostic'));
assert(css.includes('.zs-code-pack078-runtime'));
assert(css.includes('@media (max-width:820px)'));

console.log('PASS: PACK078 deterministic build/test commands and structured diagnostics are wired');
console.log('PASS: PACK078 repair is source-job scoped, bounded to two attempts and reuses metered AI edits');
console.log('PASS: PACK078 Preview exposes canonical states and viewport controls without fake readiness');
console.log('PASS: PACK078 iframe creation is gated by verified authenticated transport only');
console.log('PASS: PACK078 live sandbox/runtime gates remain off pending M15, pricing and secure port proof');
console.log('LIVE SANDBOX / PAYMENT / PROVIDER CALLS: NONE');
