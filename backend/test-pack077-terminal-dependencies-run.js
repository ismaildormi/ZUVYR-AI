'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

const runtimeConfig = require('./config/code-runtime.v1.json');
const featureFlags = require('./config/feature-flags.json');
const pricing = require('./lib/codeRuntimePricing');
const {
  normalizeRuntimeRequest,
  dependencyCommand,
  inferRunCommand,
  terminalCommand,
  commandSpecForOperation,
  detectPreviewPort
} = require('./lib/codeRuntimeRequestContract');
const {
  safePath,
  buildProjectTarball
} = require('./lib/codeProjectSandboxArchive');
const {
  createVercelSandboxProvider
} = require('./lib/codeVercelSandboxProvider');
const {
  deterministicCommandId,
  permissionReplayAccepted,
  commandLogChunks,
  providerTimestamp
} = require('./lib/codeRuntimeExecutor');

const migration = read('77_pack077_terminal_dependencies_run.sql');
const providerSource = read('lib/codeVercelSandboxProvider.js');
const executorSource = read('lib/codeRuntimeExecutor.js');
const repositorySource = read('lib/codeRuntimeRepository.js');
const routesSource = read('lib/codeStudioRoutes.js');
const maintenanceSource = read('lib/maintenanceCoordinator.js');
const serverSource = read('server.js');
const sandboxPolicySource = read('lib/codeSandboxPolicy.js');

assert.equal(runtimeConfig.version, 'pack-077.code-runtime.v1');
assert.deepEqual(runtimeConfig.operations, ['terminal','dependencies','run']);
assert.equal(runtimeConfig.terminal.shell, false);
assert.equal(runtimeConfig.terminal.sudo, false);
assert.equal(runtimeConfig.dependencies.packageManager, 'npm');
assert.equal(runtimeConfig.dependencies.allowInstallScripts, false);
assert.deepEqual(
  runtimeConfig.dependencies.networkPolicy.allowedDomains,
  ['registry.npmjs.org']
);
assert.equal(runtimeConfig.dependencies.networkPolicy.mode, 'custom');
assert.equal(runtimeConfig.dependencies.restoreNetworkMode, 'deny-all');
assert.equal(runtimeConfig.preview.rawProviderRouteReturned, false);

for (const flag of [
  'code_terminal',
  'code_runtime',
  'code_dependencies',
  'code_build',
  'code_test',
  'code_deploy'
]) {
  assert.equal(
    featureFlags[flag].enabled,
    false,
    flag + ' must stay disabled while M15/pricing/live proof are deferred'
  );
}

for (const marker of [
  'code_runtime_jobs_one_active_session_idx',
  'code_sandbox_runtime_state',
  'code_runtime_log_chunks',
  'reserve_zuvyr_code_runtime_job_pack077',
  'claim_zuvyr_code_runtime_job_pack077',
  'append_zuvyr_code_runtime_log_pack077',
  'request_zuvyr_code_runtime_cancel_pack077',
  'finalize_zuvyr_code_runtime_job_pack077',
  'set_zuvyr_code_sandbox_preview_port_pack077',
  "p_sequence_no < 0 or p_sequence_no >= 256",
  "stage = 'cancel_requested'",
  'alter table public.code_sandbox_runtime_state enable row level security',
  'alter table public.code_runtime_log_chunks enable row level security',
  'from public, anon, authenticated',
  'to service_role'
]) {
  assert(migration.includes(marker), marker);
}
assert(!/grant\s+(?:select|insert|update|delete)[^;]*\s+to\s+(?:anon|authenticated)/i.test(migration));

const pricingStatus = pricing.runtimePricingStatus({ env: {} });
assert.equal(pricingStatus.live, false);
assert(pricingStatus.blockers.includes('pack077_runtime_paid_execution_disabled'));
assert(pricingStatus.blockers.includes('pack077_m15_unverified'));
assert.throws(
  () => pricing.quoteRuntimeReservation('terminal', { env: {} }),
  error => error.code === 'code_runtime_pricing_gate_closed'
);

const projectId = '11111111-1111-4111-8111-111111111111';
const sandboxSessionId = '22222222-2222-4222-8222-222222222222';
const terminalRequest = normalizeRuntimeRequest({
  operation: 'terminal',
  projectId,
  sandboxSessionId,
  command: 'node',
  args: ['--version'],
  requestId: 'req-terminal'
});
assert.equal(terminalRequest.command, 'node');
assert.deepEqual(terminalRequest.args, ['--version']);
assert.throws(
  () => normalizeRuntimeRequest({
    operation: 'terminal',
    projectId,
    sandboxSessionId,
    command: 'bash',
    args: ['-c','rm -rf /'],
    requestId: 'req-bad'
  }),
  error => error.code === 'pack077_terminal_command_invalid'
);
assert.throws(
  () => normalizeRuntimeRequest({
    operation: 'terminal',
    projectId,
    sandboxSessionId,
    command: 'docker',
    args: ['run','x'],
    requestId: 'req-docker'
  }),
  error => error.code === 'pack077_terminal_command_invalid'
);

const project = {
  id: projectId,
  revision: 7,
  files: [
    {
      path: 'package.json',
      content: JSON.stringify({
        scripts: { dev: 'vite --host 0.0.0.0' },
        dependencies: { vite: '^7.0.0' }
      })
    },
    {
      path: 'index.js',
      content: 'console.log("ok")'
    }
  ]
};
const dep = dependencyCommand(project);
assert.equal(dep.command, 'npm');
assert(dep.args.includes('--ignore-scripts'));
assert(dep.args.includes('--no-audit'));
assert(dep.args.includes('--no-fund'));
assert.equal(dep.sudo, false);
const run = inferRunCommand(project);
assert.equal(run.command, 'npm');
assert.deepEqual(run.args, ['run','dev']);
assert.equal(run.previewPort, 5173);
assert.equal(run.env.HOST, '0.0.0.0');
assert.equal(terminalCommand(terminalRequest).sudo, false);
assert.equal(
  commandSpecForOperation(terminalRequest, project).command,
  'node'
);
assert.equal(detectPreviewPort('Local: http://localhost:5173/'), 5173);

assert.equal(safePath('src/app.js'), 'src/app.js');
for (const bad of ['../secret','.env','.git/config','node_modules/x','/etc/passwd']) {
  assert.throws(() => safePath(bad));
}
const archive = buildProjectTarball(project);
assert(Buffer.isBuffer(archive.archive));
assert.match(archive.digest, /^[0-9a-f]{64}$/);
assert(archive.archiveBytes > 0);
assert.equal(archive.fileCount, 2);

const jobId = '33333333-3333-4333-8333-333333333333';
const deterministic = deterministicCommandId(jobId);
assert.equal(deterministic, 'cmd_zuvyr_33333333333343338333333333333333');
assert.equal(permissionReplayAccepted({
  success:true,allowed:true,grant_id:'x'
}), true);
assert.equal(permissionReplayAccepted({
  success:true,allowed:false,replayed:true,
  error:'permission_request_replayed',grant_id:'x'
}), true);
assert.equal(permissionReplayAccepted({
  success:true,allowed:false,error:'permission_required'
}), false);

const chunks = commandLogChunks(
  ['{"stream":"stderr","message":"bad"}','plain output',''].join('\n')
);
assert.equal(chunks[0].stream, 'stderr');
assert.equal(chunks[0].message, 'bad');
assert.equal(chunks[1].stream, 'stdout');
assert.match(providerTimestamp('2026-09-19T00:00:00Z'), /^2026-09-19T00:00:00\.000Z$/);

(async () => {
  let calls = [];
  const env = {
    VERCEL_TOKEN: 'test-token',
    VERCEL_PROJECT_ID: 'prj_test',
    VERCEL_TEAM_ID: 'team_test'
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({
      url: String(url),
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body
    });

    if (
      String(url).includes('/cmd?cmdId=' + encodeURIComponent(deterministic)) &&
      options.method === 'POST'
    ) {
      return {
        ok:false,
        status:409,
        json:async()=>({error:'already_exists'})
      };
    }
    if (
      String(url).includes('/cmd/' + deterministic) &&
      !String(url).includes('/logs') &&
      !String(url).includes('/kill')
    ) {
      return {
        ok:true,
        status:200,
        json:async()=>({
          command:{
            id:deterministic,
            name:'node',
            exitCode:null,
            startedAt:'1758240000000',
            durationMs:'0'
          }
        })
      };
    }
    if (String(url).includes('/network-policy')) {
      const parsed = JSON.parse(String(options.body || '{}'));
      return {
        ok:true,
        status:200,
        json:async()=>({
          session:{
            networkPolicy:{
              mode:parsed.mode,
              allowedDomains:parsed.allowedDomains || []
            }
          }
        })
      };
    }
    if (String(url).includes('/fs/write')) {
      return {
        ok:true,
        status:200,
        json:async()=>({})
      };
    }
    throw new Error('unexpected_mock_call:' + String(url));
  };

  const provider = createVercelSandboxProvider({ fetchImpl, env });
  const started = await provider.startCommand(
    'sbx_abcdef123456',
    {
      command:'node',
      args:['--version'],
      cwd:'/vercel/sandbox',
      env:{},
      timeout:30000
    },
    deterministic
  );
  assert.equal(started.replayed, true);
  assert.equal(started.providerCommandId, deterministic);
  assert.equal(calls.length, 2);
  assert(calls[0].url.includes('cmdId=' + deterministic));

  await assert.rejects(
    () => provider.updateNetworkPolicy(
      'sbx_abcdef123456',
      {mode:'allow-all',allowedDomains:['*']}
    ),
    error => error.code === 'code_sandbox_network_policy_invalid'
  );
  assert.equal(calls.length, 2, 'allow-all must fail before network');

  const network = await provider.updateNetworkPolicy(
    'sbx_abcdef123456',
    {mode:'custom',allowedDomains:['registry.npmjs.org']}
  );
  assert.equal(network.networkPolicy.mode, 'custom');
  assert.deepEqual(
    network.networkPolicy.allowedDomains,
    ['registry.npmjs.org']
  );

  const write = await provider.writeArchive(
    'sbx_abcdef123456',
    archive.archive,
    {cwd:'/vercel/sandbox'}
  );
  assert.equal(write.archiveBytes, archive.archive.length);
  const writeCall = calls.find(item => item.url.includes('/fs/write'));
  assert.equal(writeCall.headers['Content-Type'], 'application/gzip');

  const startFunctionBegin = executorSource.indexOf('  async function start({');
  const startFunctionEnd = executorSource.indexOf(
    '\n  async function refresh(',
    startFunctionBegin
  );
  assert(startFunctionBegin >= 0 && startFunctionEnd > startFunctionBegin);
  const startFunctionSource = executorSource.slice(
    startFunctionBegin,
    startFunctionEnd
  );
  const order = [
    'pricing.quoteRuntimeReservation',
    'projects.get',
    'runtime.reserve',
    'authorize(request)',
    'reserveCreditsForJob',
    'syncProject',
    'runtime.claim',
    'sandbox.startCommand'
  ].map(value => startFunctionSource.indexOf(value));
  assert(order.every(index => index >= 0), 'executor lifecycle markers missing');
  for (let i = 1; i < order.length; i += 1) {
    assert(order[i] > order[i - 1], 'executor lifecycle order invalid: ' + i);
  }

  assert(executorSource.includes("action: 'network.egress'"));
  assert(executorSource.includes("'registry.npmjs.org'"));
  assert(executorSource.includes("{ mode: 'deny-all', allowedDomains: [] }"));
  assert(executorSource.includes('quoteRuntimeFinalAgainstReservation'));
  assert(executorSource.includes('reconcileActive'));
  assert(executorSource.includes('dependencyCacheHit'));
  assert(!executorSource.includes("require('child_process')"));
  assert(!executorSource.includes("require('node:vm')"));
  assert(!providerSource.includes("require('child_process')"));
  assert(!providerSource.includes("require('node:vm')"));

  assert(repositorySource.includes('activeJobs'));
  assert(repositorySource.includes('set_zuvyr_code_sandbox_preview_port_pack077'));
  assert(routesSource.includes("router.post('/runtime/request'"));
  assert(routesSource.includes("router.get('/runtime/jobs/:jobId'"));
  assert(routesSource.includes("router.get('/runtime/jobs/:jobId/logs'"));
  assert(routesSource.includes("router.post('/runtime/jobs/:jobId/cancel'"));
  assert(routesSource.includes('pack077_raw_preview_port_protection_unverified'));
  assert(routesSource.includes('previewActivation: false'));

  assert(maintenanceSource.includes('codeRuntimeReconcile'));
  assert(serverSource.includes('reconcileActiveCodeRuntimeJobs'));
  assert(serverSource.includes('codeRuntimeReconcile:'));

  // Pack076 sandbox creation must still not publish raw runtime ports.
  assert(sandboxPolicySource.includes('ports: Object.freeze([])'));

  console.log('PASS: PACK077 terminal/dependency/run request contracts are shell-free and bounded');
  console.log('PASS: PACK077 provider command IDs are deterministic and 409 replay-safe');
  console.log('PASS: PACK077 dependency egress is npm-only and restores deny-all');
  console.log('PASS: PACK077 runtime jobs are owner-scoped, reconciled and settlement-snapshot bound');
  console.log('PASS: PACK077 raw preview port activation remains fail-closed pending protection proof');
  console.log('LIVE SANDBOX / PAYMENT / PROVIDER NETWORK CALLS: NONE');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
