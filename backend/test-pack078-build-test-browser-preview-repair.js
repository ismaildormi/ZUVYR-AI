'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

const runtimeConfig = require('./config/code-runtime.v1.json');
const studioConfig = require('./config/code-studio.v1.json');
const featureFlags = require('./config/feature-flags.json');
const {
  packageScriptCommand,
  commandSpecForOperation
} = require('./lib/codeRuntimeRequestContract');
const {
  redact,
  safePath,
  fingerprint,
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
const securityFix = read('78_pack078_security_fix1.sql');
const routes = read('lib/codeStudioRoutes.js');
const executor = read('lib/codeRuntimeExecutor.js');
const repository = read('lib/codeRuntimeRepository.js');
const repairRepository = read('lib/codeRepairRepository.js');
const previewTransport = read('lib/codePreviewTransportRoutes.js');
const suite = read('../frontend/zuvyr-suite-v1.js');
const css = read('../frontend/zuvyr-suite-v1.css');

assert.equal(runtimeConfig.version, 'pack-078.code-runtime.v1');
assert.equal(runtimeConfig.status, 'engineering_implemented_live_preview_deferred');
for (const operation of ['terminal','dependencies','run','build','test']) {
  assert(runtimeConfig.operations.includes(operation), operation);
}
assert.equal(runtimeConfig.build.script, 'build');
assert.equal(runtimeConfig.test.script, 'test');
assert.equal(runtimeConfig.build.wait, true);
assert.equal(runtimeConfig.test.wait, true);
assert.equal(runtimeConfig.preview.rawProviderRouteAllowed, false);
assert.equal(runtimeConfig.preview.providerPortProtectionStatus, 'unverified');
assert.equal(runtimeConfig.preview.authenticatedProxyRequired, true);
assert.deepEqual(runtimeConfig.preview.states, [
  'unavailable','starting','building','ready','updating',
  'build_failed','runtime_error'
]);
assert.equal(runtimeConfig.repair.maxAttempts, 2);
assert.equal(runtimeConfig.repair.autoApply, false);
assert.equal(runtimeConfig.repair.everyAttemptMetered, true);
assert.equal(runtimeConfig.repair.stopOnRepeatedFingerprint, true);

assert.equal(studioConfig.version, 'pack-079.code-studio.v1');
assert.equal(studioConfig.capabilities.preview.enabledByDefault, true);
assert.equal(studioConfig.capabilities.preview.status, 'pack078_product_layer_live_deferred');
assert.equal(featureFlags.code_preview.enabled, true);
assert.equal(featureFlags.code_preview.status, 'pack078_product_layer_live_deferred');
assert.equal(featureFlags.code_build.enabled, false);
assert.equal(featureFlags.code_test.enabled, false);
assert.equal(featureFlags.code_build.status, 'pack078_implemented_live_deferred');
assert.equal(featureFlags.code_test.status, 'pack078_implemented_live_deferred');

const project = {
  name: 'Pack078',
  entryFile: 'src/index.js',
  files: [
    {
      path: 'package.json',
      content: JSON.stringify({
        scripts: {
          build: 'vite build',
          test: 'vitest run'
        }
      }),
      language: 'json'
    },
    {
      path: 'src/index.js',
      content: 'export const value = 1;',
      language: 'javascript'
    }
  ],
  editorState: {
    activeFile: 'src/index.js'
  }
};

const buildSpec = packageScriptCommand(project, 'build');
assert.equal(buildSpec.command, 'npm');
assert.deepEqual(buildSpec.args, ['run','build']);
assert.equal(buildSpec.wait, true);
assert.equal(buildSpec.sudo, false);
assert.equal(buildSpec.env.CI, '1');

const testSpec = packageScriptCommand(project, 'test');
assert.equal(testSpec.command, 'npm');
assert.deepEqual(testSpec.args, ['run','test']);
assert.equal(testSpec.wait, true);
assert.equal(testSpec.sudo, false);

assert.throws(
  () => packageScriptCommand({
    ...project,
    files: project.files.map(file =>
      file.path === 'package.json'
        ? { ...file, content: JSON.stringify({ scripts: {} }) }
        : file
    )
  }, 'build'),
  error => error.code === 'pack078_build_script_unavailable'
);

const buildCommand = commandSpecForOperation(
  { operation: 'build' },
  project
);
assert.equal(buildCommand.command, 'npm');
assert.deepEqual(buildCommand.args, ['run','build']);

const redacted = redact(
  'Authorization: Bearer abcdefghijklmnopqrstuvwxyz token=verysecretvalue error'
);
assert(!redacted.includes('abcdefghijklmnopqrstuvwxyz'));
assert(!redacted.includes('verysecretvalue'));
assert(redacted.includes('[redacted]'));

const redactionCases = [
  'Error\nAuthorization: Bearer actualnewlineauthorizationsecret',
  'Error\\nAuthorization: Bearer escapednewlineauthorizationsecret',
  'Error\\rBearer escapedcarriagebearersecretvalue',
  'Error\\ntoken=escaped-token-secret-value',
  'Error\\napi_key=escaped-api-key-secret-value',
  'Error\\napi-key=escaped-api-dash-key-secret-value',
  'Error\\nsecret=escaped-secret-value',
  'Error\\npassword=escaped-password-value',
  'prefixAuthorization: Bearer conservativeboundarysecret',
  'prefixtoken=conservative-token-value',
  'provider failed sk_abcdefghijklmnopqrstuvwxyz',
  'provider failed pk_abcdefghijklmnopqrstuvwxyz',
  'provider failed vcp_abcdefghijklmnopqrstuvwxyz',
  'provider failed sbp_abcdefghijklmnopqrstuvwxyz'
];

for (const sample of redactionCases) {
  const safe = redact(sample);
  assert(
    !/actualnewlineauthorizationsecret|escapednewlineauthorizationsecret|escapedcarriagebearersecretvalue|escaped-token-secret-value|escaped-api-key-secret-value|escaped-api-dash-key-secret-value|escaped-secret-value|escaped-password-value|conservativeboundarysecret|conservative-token-value|(?:sk|pk|vcp|sbp)_abcdefghijklmnopqrstuvwxyz/i.test(safe),
    'redaction leaked a secret for sample: ' + sample
  );
  assert(
    safe.includes('[redacted]'),
    'redaction marker missing for sample: ' + sample
  );
}

const chained = redact(
  'x\\nAuthorization: Bearer chainedauthorizationsecret\\n' +
  'token=chained-token-secret\\n' +
  'password=chained-password-secret'
);
assert(!chained.includes('chainedauthorizationsecret'));
assert(!chained.includes('chained-token-secret'));
assert(!chained.includes('chained-password-secret'));

assert.equal(
  safePath('/vercel/sandbox/src/index.js'),
  'src/index.js'
);
assert.equal(safePath('../../etc/passwd'), null);
assert.match(fingerprint('stable'), /^[0-9a-f]{64}$/);

const diagnostic = structuredDiagnostic({
  operation: 'build',
  exitCode: 1,
  chunks: [
    {
      stream: 'stderr',
      message:
        'Error: failed to compile\\n' +
        '    at /vercel/sandbox/src/index.js:12:7\\n' +
        'token=super-secret-token-value'
    }
  ],
  fallbackCode: 'pack078_build_failed'
});
assert.equal(diagnostic.kind, 'build_error');
assert.equal(diagnostic.file, 'src/index.js');
assert.equal(diagnostic.line, 12);
assert.equal(diagnostic.column, 7);
assert.match(diagnostic.fingerprint, /^[0-9a-f]{64}$/);
assert(!diagnostic.message.includes('super-secret-token-value'));
assert(!diagnostic.stack.join('\\n').includes('super-secret-token-value'));

const failedJob = {
  id: '33333333-3333-4333-8333-333333333333',
  projectId: '11111111-1111-4111-8111-111111111111',
  sandboxSessionId: '22222222-2222-4222-8222-222222222222',
  operation: 'build',
  status: 'failed',
  result: { diagnostic }
};
assert.equal(assertRepairableJob(failedJob), diagnostic);
assert.deepEqual(repairTargets(project, diagnostic), ['src/index.js']);
assert(repairInstruction(diagnostic, 1).includes('Repair attempt 1 of 2'));
assert.equal(retestOperation(project, 'build'), 'build');
assert.equal(retestOperation(project, 'test'), 'test');
assert.equal(repairStatusFromJob({ status: 'succeeded' }), 'succeeded');
assert.equal(repairStatusFromJob({ status: 'running' }), 'retesting');

for (const marker of [
  'preview_state text not null default',
  'preview_candidate_port integer',
  'preview_transport_status text not null default',
  'last_diagnostic jsonb',
  'create table if not exists public.code_repair_runs',
  'source_job_id uuid not null references public.code_runtime_jobs',
  'max_attempts integer not null default 2 check (max_attempts between 1 and 2)',
  'attempts_used integer not null default 0 check (attempts_used between 0 and 2)',
  'create table if not exists public.code_repair_attempts',
  'attempt_no integer not null check (attempt_no between 1 and 2)',
  'pack078_repair_repeated_failure',
  'alter table public.code_repair_runs enable row level security',
  'alter table public.code_repair_attempts enable row level security',
  'from public,anon,authenticated',
  'to service_role'
]) {
  assert(migration.includes(marker), marker);
}
assert(!/grant\s+(?:select|insert|update|delete)[^;]*\s+to\s+(?:anon|authenticated)/i.test(migration));

for (const functionName of [
  'reserve_zuvyr_code_repair_run_pack078',
  'claim_zuvyr_code_repair_attempt_pack078',
  'complete_zuvyr_code_repair_attempt_pack078'
]) {
  const count =
    migration.split('create or replace function public.' + functionName + '(').length - 1;
  assert.equal(count, 1, functionName + ' must exist exactly once');
}

assert.equal(
  migration.split(
    'create or replace function public.reserve_zuvyr_code_runtime_job_pack077('
  ).length - 1,
  0,
  'PACK078 must not redefine the canonical PACK077 reserve RPC'
);
assert(
  /drop function if exists public\.reserve_zuvyr_code_runtime_job_pack077\(\s*uuid,\s*uuid,\s*uuid,\s*uuid,\s*text,\s*text,\s*jsonb,\s*integer,\s*text,\s*text\s*\)/m
    .test(securityFix),
  'PACK078 SECURITY FIX1 must remove only the dead source-job overload'
);
assert(
  securityFix.includes(
    'comment on function public.reserve_zuvyr_code_runtime_job_pack077('
  ),
  'PACK078 SECURITY FIX1 must preserve/document the canonical PACK077 RPC'
);
assert(
  /reserve_zuvyr_code_repair_run_pack078\(\s*p_owner_id uuid,\s*p_project_id uuid,\s*p_sandbox_session_id uuid,\s*p_source_job_id uuid,/m
    .test(migration)
);

const lineageMigration = read('78a_pack078_runtime_lineage_cleanup.sql');
assert(repository.includes('sourceJobId: row.source_job_id || null'));
assert(repository.includes('p_source_job_id: sourceJobId'));
assert(repository.includes('sourceJobId = null'));
assert(executor.includes('sourceJobId = null'));
assert(executor.includes('sourceJobId,\n      requestId: request.requestId'));
assert(routes.includes('sourceJobId: attempt.sourceJobId'));
assert(!/body:\s*\{[\s\S]{0,220}sourceJobId/.test(routes));
assert(lineageMigration.includes('source_job_id uuid'));
assert(lineageMigration.includes(
  'drop function if exists public.reserve_zuvyr_code_runtime_job_pack077'
));
assert(lineageMigration.includes(
  'v_existing.source_job_id is distinct from p_source_job_id'
));
assert(lineageMigration.includes(
  'sandbox_session_id,\n    source_job_id,\n    request_id'
));

for (const marker of [
  'previewState: row.preview_state',
  'previewCandidatePort:',
  'previewTransportStatus:',
  'lastDiagnostic:',
  'lastBuildJobId:',
  'lastTestJobId:',
  'previewState = undefined',
  'if (previewState !== undefined)'
]) {
  assert(repository.includes(marker), marker);
}

for (const marker of [
  'structuredDiagnostic',
  'detectPreviewPort',
  "request.operation === 'build'",
  "request.operation === 'run'",
  "previewTransportStatus: 'blocked'",
  "previewState: 'unavailable'",
  "'build_failed'",
  "'runtime_error'",
  'async function runtimeState'
]) {
  assert(executor.includes(marker), marker);
}

assert(
  /previewState:\s*[\s\S]{0,220}?request\.operation === 'build'[\s\S]{0,120}?\? 'building'/.test(executor),
  'build must persist the canonical building preview state'
);
assert(
  /request\.operation === 'run'[\s\S]{0,120}?\? 'starting'/.test(executor),
  'run must persist the canonical starting preview state'
);
assert(!executor.includes("previewState: 'ready'"));

for (const marker of [
  'function executeAiEdit',
  "router.post('/projects/:projectId/ai-edit'",
  'executeAiEdit({',
  'assertRepairRuntimeAvailable();',
  "router.post('/projects/:projectId/repair'",
  "router.post('/repair/:repairRunId/continue'",
  "router.get('/projects/:projectId/preview/state'",
  'previewTransportVerified: false',
  'fakePreviewFallback: false',
  'repairPhaseRequestId',
  'progressRepair'
]) {
  assert(routes.includes(marker), marker);
}

const repairRouteStart = routes.indexOf("router.post('/projects/:projectId/repair'");
const repairRouteEnd = routes.indexOf("router.get('/repair/:repairRunId'", repairRouteStart);
const repairRoute = routes.slice(repairRouteStart, repairRouteEnd);
assert(repairRouteStart >= 0 && repairRouteEnd > repairRouteStart);
assert(
  repairRoute.indexOf('assertRepairRuntimeAvailable();') >= 0 &&
  repairRoute.indexOf('assertRepairRuntimeAvailable();') <
    repairRoute.indexOf('repairRepository().reserve') &&
  repairRoute.indexOf('assertRepairRuntimeAvailable();') <
    repairRoute.indexOf('progressRepair'),
  'Repair live gate must execute before durable/AI repair mutation'
);

for (const marker of [
  "db.rpc('reserve_zuvyr_code_repair_run_pack078'",
  "db.rpc('claim_zuvyr_code_repair_attempt_pack078'",
  "db.rpc('complete_zuvyr_code_repair_attempt_pack078'",
  'publicBundle'
]) {
  assert(repairRepository.includes(marker), marker);
}

assert(previewTransport.includes('SameSite=None'));
assert(previewTransport.includes('Partitioned'));
assert(previewTransport.includes('HttpOnly'));
assert(previewTransport.includes('Secure'));
assert(previewTransport.includes("connect-src 'none'"));
assert(previewTransport.includes("redirect: 'manual'"));

const pack078Ui = suite.slice(
  suite.indexOf('/* ZUVYR PACK075 CODE STUDIO */')
);
for (const marker of [
  "previewState: 'unavailable'",
  'data-zs-code-runtime="build"',
  'data-zs-code-runtime="test"',
  'data-zs-code-runtime="run"',
  'data-zs-code-viewport="',
  'data-zs-code-preview-refresh',
  'data-zs-code-preview-open',
  'data-zs-code-preview-fullscreen',
  'data-zs-code-repair',
  'No runtime logs yet',
  "state.previewState === 'ready' && !!state.previewUrl",
  'data-zs-code-preview-frame',
  'sandbox="allow-scripts"',
  'schedulePostSaveValidation',
  'pollRepair'
]) {
  assert(pack078Ui.includes(marker), marker);
}
assert(!/srcdoc\s*=/i.test(pack078Ui));
assert(!/screenshot|fake preview/i.test(
  pack078Ui
    .replace('No fake preview is shown.', '')
    .replace('fakePreviewFallback', '')
));

assert(css.includes('ZUVYR PACK078 BUILD TEST PREVIEW REPAIR'));
assert(css.includes('.zs-code-runtime-toolbar'));
assert(css.includes('.zs-code-preview-stage iframe'));
assert(css.includes('.zs-code-diagnostic'));
assert(css.includes('.zs-code-live-logs'));

console.log('PASS: PACK078 deterministic Build/Test commands are wired without shell execution');
console.log('PASS: PACK078 diagnostics redact secrets and provide bounded file/line fingerprints');
console.log('PASS: PACK078 repair authority is durable, idempotent and hard-capped at two attempts');
console.log('PASS: PACK078 live gate precedes repair AI/runtime mutation');
console.log('PASS: PACK078 Preview UI renders a real iframe only with a secure preview ticket');
console.log('PASS: PACK078 raw provider preview remains fail-closed; no fake preview fallback exists');
console.log('LIVE SANDBOX / PAYMENT / PROVIDER NETWORK CALLS: NONE');
