'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

const config = require('./config/code-sandbox.v1.json');
const flags = require('./config/feature-flags.json');
const {
  availability,
  createPreviewCredential,
  hashPreviewToken,
  safeResourceLimits,
  safeNetworkPolicy,
  buildProviderCreateBody,
  assertNoSecretInjection,
  publicSession
} = require('./lib/codeSandboxPolicy');
const {
  createVercelSandboxProvider
} = require('./lib/codeVercelSandboxProvider');
const {
  parseCookies,
  previewCookie,
  cspHeader,
  safeClientPath
} = require('./lib/codePreviewTransportRoutes');

const migration = read('76_pack076_secure_code_sandbox.sql');
const routes = read('lib/codeStudioRoutes.js');
const providerSource = read('lib/codeVercelSandboxProvider.js');
const policySource = read('lib/codeSandboxPolicy.js');
const previewSource = read('lib/codePreviewTransportRoutes.js');
const cleanupSource = read('lib/codeSandboxCleanup.js');
const maintenance = read('lib/maintenanceCoordinator.js');
const server = read('server.js');

function count(source, value) {
  return source.split(value).length - 1;
}

assert.equal(config.version, 'pack-076.code-sandbox.v1');
assert.equal(config.provider.id, 'vercel_sandbox');
assert.equal(config.provider.externalGate, 'M15');
assert.equal(config.provider.pricingVerificationStatus, 'unverified');
assert.equal(config.gates.canProvisionLive, false);
assert.equal(config.network.defaultMode, 'deny-all');
assert.equal(config.network.allowAllForbidden, true);
assert.equal(config.runtime.runtime, 'node24');
assert.equal(config.runtime.persistent, false);
assert.equal(config.preview.rawProviderRoutesReturnedToClient, false);
assert.equal(config.preview.rawPublicPortEnabledByDefault, false);

for (const marker of [
  'create table if not exists public.code_sandbox_sessions',
  'unique(owner_id, request_id)',
  'code_sandbox_sessions_one_active_project_idx',
  'sandbox_session_id uuid',
  'alter table public.code_sandbox_sessions enable row level security',
  'revoke all on public.code_sandbox_sessions',
  'from public, anon, authenticated',
  'to service_role',
  'reserve_zuvyr_code_sandbox_session_pack076',
  'transition_zuvyr_code_sandbox_session_pack076',
  'touch_zuvyr_code_sandbox_session_pack076',
  'rotate_zuvyr_code_sandbox_preview_token_pack076',
  'pack076_terminal_session',
  "status in ('stopped','failed','expired')",
  "coalesce(p_network_policy->>'mode','') <> 'deny-all'"
]) {
  assert(migration.includes(marker), marker);
}

for (const functionName of [
  'reserve_zuvyr_code_sandbox_session_pack076',
  'transition_zuvyr_code_sandbox_session_pack076',
  'touch_zuvyr_code_sandbox_session_pack076',
  'rotate_zuvyr_code_sandbox_preview_token_pack076'
]) {
  assert.equal(
    count(migration, 'create or replace function public.' + functionName + '('),
    1,
    functionName + ' must exist exactly once'
  );
}

assert(!/grant\s+(?:select|insert|update|delete)[^;]*\s+to\s+(?:anon|authenticated)/i.test(migration));
assert(!migration.includes('preview_url'));
assert(!migration.includes('provider_route'));
assert(!migration.includes('service_role_key'));

const emptyStatus = availability({});
assert.equal(emptyStatus.live, false);
assert(emptyStatus.blockers.includes('pack076_source_live_gate_closed'));
assert(emptyStatus.blockers.includes('pack076_m15_unverified'));
assert(emptyStatus.blockers.includes('pack076_sandbox_pricing_unverified'));
assert(emptyStatus.blockers.includes('pack076_pricing_operator_gate_closed'));
assert(emptyStatus.blockers.includes('pack076_missing_vercel_token'));
assert(emptyStatus.blockers.includes('pack076_missing_vercel_project_id'));
assert(emptyStatus.blockers.includes('pack076_missing_vercel_team_id'));

const credential = createPreviewCredential({ now: 1_700_000_000_000, ttlSeconds: 60 });
assert.equal(typeof credential.token, 'string');
assert(credential.token.length >= 32);
assert.match(credential.hash, /^[0-9a-f]{64}$/);
assert.equal(hashPreviewToken(credential.token), credential.hash);
assert.equal(new Date(credential.expiresAt).getTime(), 1_700_000_060_000);

assert.deepEqual(safeNetworkPolicy().allowedDomains, []);
assert.equal(safeNetworkPolicy().mode, 'deny-all');
assert.equal(safeResourceLimits().runtime, 'node24');

const env = {
  VERCEL_TOKEN: 'test-token',
  VERCEL_PROJECT_ID: 'prj_test',
  VERCEL_TEAM_ID: 'team_test',
  ZUVYR_M15_VERIFIED: 'true',
  ZUVYR_SANDBOX_PRICING_VERIFIED: 'true'
};

const localSessionId = '11111111-1111-4111-8111-111111111111';
const body = buildProviderCreateBody({ localSessionId, env });
assert.equal(body.runtime, 'node24');
assert.equal(body.persistent, false);
assert.deepEqual(body.networkPolicy, { mode: 'deny-all' });
assert.deepEqual(body.ports, []);
assert.deepEqual(Object.keys(body.env), ['ZUVYR_SANDBOX_SESSION_ID']);
assert.equal(body.env.ZUVYR_SANDBOX_SESSION_ID, localSessionId);
assert.equal(assertNoSecretInjection(body), true);
assert(!JSON.stringify(body).includes('test-token'));

assert.throws(
  () => assertNoSecretInjection({
    ...body,
    env: { ...body.env, STRIPE_SECRET_KEY: 'x' }
  }),
  error => error.code === 'code_sandbox_secret_injection_blocked'
);

const publicRow = publicSession({
  id: localSessionId,
  project_id: '22222222-2222-4222-8222-222222222222',
  status: 'running',
  runtime: 'node24',
  resource_limits: {},
  network_policy: { mode: 'deny-all' },
  provider_session_id: 'sbx_should_never_escape',
  preview_port: null,
  preview_expires_at: null,
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  idle_expires_at: new Date(Date.now() + 30_000).toISOString(),
  last_activity_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  stopped_at: null,
  failure_code: null
});
assert.equal(publicRow.providerSessionId, undefined);
assert.equal(publicRow.provider_session_id, undefined);

(async () => {
  let networkCalls = 0;
  const fetchImpl = async (url, options = {}) => {
    networkCalls += 1;
    if (String(url).includes('/stop')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          session: {
            id: 'sbx_abcdef123456',
            status: 'stopped',
            activeCpuDurationMs: '42',
            networkTransfer: { ingress: '1', egress: '2' }
          }
        })
      };
    }
    if (options.method === 'GET' && String(url).includes('/v2/sandboxes/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          session: { id: 'sbx_abcdef123456', status: 'running' },
          routes: [{ port: '3000', url: 'https://127.0.0.1:3000' }]
        })
      };
    }
    throw new Error('unexpected_mock_network_call');
  };

  const provider = createVercelSandboxProvider({ fetchImpl, env });

  await assert.rejects(
    () => provider.createSession({ localSessionId }),
    error =>
      error.code === 'code_sandbox_live_gate_closed' &&
      Array.isArray(error.blockers)
  );
  assert.equal(
    networkCalls,
    0,
    'Create must fail before a provider call while M15/source/pricing gate is closed'
  );

  const stopped = await provider.stopSession('sbx_abcdef123456');
  assert.equal(stopped.status, 'stopped');
  assert.equal(networkCalls, 1, 'Teardown must remain callable with credentials');

  await assert.rejects(
    () => provider.resolvePreviewRoute({
      localSessionId,
      providerSessionId: 'sbx_abcdef123456',
      port: 3000
    }),
    error => error.code === 'code_preview_provider_route_private'
  );
  assert.equal(networkCalls, 2);

  const routeStart = routes.indexOf("router.post('/sandbox/sessions'");
  const routeEnd = routes.indexOf("router.get('/sandbox/sessions/:sessionId'", routeStart);
  const createRoute = routes.slice(routeStart, routeEnd);
  assert(routeStart >= 0 && routeEnd > routeStart);
  assert(
    createRoute.indexOf('assertSandboxLiveAvailable(sandboxEnv)') >= 0 &&
    createRoute.indexOf('assertSandboxLiveAvailable(sandboxEnv)') <
      createRoute.indexOf('sandboxRepository().reserve') &&
    createRoute.indexOf('assertSandboxLiveAvailable(sandboxEnv)') <
      createRoute.indexOf('sandbox.createSession'),
    'Live gate must execute before reserve/provider work'
  );

  for (const marker of [
    "router.get('/sandbox/capabilities'",
    "router.get('/sandbox/sessions'",
    "router.post('/sandbox/sessions'",
    "router.get('/sandbox/sessions/:sessionId'",
    "router.post('/sandbox/sessions/:sessionId/stop'",
    "router.post('/sandbox/sessions/:sessionId/preview-ticket'",
    'code_sandbox_stop_pending',
    'transportPath'
  ]) {
    assert(routes.includes(marker), marker);
  }

  assert(routes.includes("router.post('/runtime/request'"));
  assert(routes.includes("router.post('/deploy/request'"));
  assert(routes.includes('assertRuntimeRequestAllowed'));

  for (const flag of [
    'code_terminal',
    'code_runtime',
    'code_dependencies',
    'code_build',
    'code_test',
    'code_deploy'
  ]) {
    assert.equal(flags[flag].enabled, false, flag + ' must remain disabled in Pack076');
  }

  assert(providerSource.includes("'/v3/sandboxes'"));
  assert(providerSource.includes("'/v2/sandboxes/sessions/'"));
  assert(providerSource.includes("'/stop'"));
  assert(providerSource.includes('routes/public URLs are intentionally discarded'));
  assert(providerSource.includes("net.isIP(host) !== 0"));
  assert(!providerSource.includes("require('child_process')"));
  assert(!providerSource.includes("require('node:vm')"));
  assert(!policySource.includes("require('child_process')"));
  assert(!policySource.includes("require('node:vm')"));

  assert(previewSource.includes("'Set-Cookie'"));
  assert(previewSource.includes('HttpOnly'));
  assert(previewSource.includes('Secure'));
  assert(previewSource.includes("connect-src 'none'"));
  assert(previewSource.includes("redirect: 'manual'"));
  assert(previewSource.includes('code_preview_upstream_redirect_blocked'));
  assert(!previewSource.includes('Authorization:'));
  assert(!policySource.includes('providerSessionId: row.provider_session_id'));

  assert.deepEqual(parseCookies('a=1; b=two'), { a: '1', b: 'two' });
  assert(previewCookie('token', localSessionId, new Date(Date.now() + 60_000).toISOString()).includes('HttpOnly'));
  assert(cspHeader().includes("connect-src 'none'"));
  assert.equal(
    safeClientPath(
      { path: '/' + localSessionId + '/assets/app.js' },
      localSessionId
    ),
    '/assets/app.js'
  );

  assert(cleanupSource.includes('cleanupExpiredCodeSandboxes'));
  assert(cleanupSource.includes("status: 'stopping'"));
  assert(cleanupSource.includes("status: 'expired'"));
  assert(cleanupSource.includes('provider.stopSession'));
  assert(maintenance.includes('codeSandboxCleanup'));
  assert(server.includes("'/api/code-preview'"));
  assert(server.includes('createCodePreviewTransportRouter'));
  assert(server.includes('sandboxProvider: codeSandboxProvider'));
  assert(server.includes('codeSandboxCleanup: cleanupExpiredCodeSandboxes'));

  const previewMount = server.indexOf("app.use(\n  '/api/code-preview'");
  const codeMount = server.indexOf("app.use(\n  '/api/code-studio'", previewMount);
  assert(previewMount >= 0 && codeMount > previewMount);
  const previewMountSegment = server.slice(previewMount, codeMount);
  assert(!previewMountSegment.includes('requireAuth'));

  console.log('PASS: PACK076 sandbox create stays fail-closed before all provider/network work');
  console.log('PASS: PACK076 provider teardown remains available independently of the create gate');
  console.log('PASS: PACK076 deny-all, no-secret, no-raw-route and preview proxy boundaries are wired');
  console.log('PASS: PACK076 durable session authority, terminal cleanup and RLS contracts are present');
  console.log('LIVE SANDBOX / PAYMENT / PROVIDER NETWORK CALLS: NONE');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
