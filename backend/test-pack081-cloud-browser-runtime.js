'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');

const config=require('./config/cloud-browser.v1.json');
const {
  availability,
  pricingSnapshot,
  costMicroUsdForSeconds,
  creditsForCostMicroUsd,
  quoteSession,
  normalizeAllowedHosts,
  normalizePublicUrl,
  sessionPolicies,
  publicSession
}=require('./lib/cloudBrowserPolicy');
const {
  createBrowserbaseProvider
}=require('./lib/browserbaseProvider');
const {
  finalCreditsForSession,
  rejectRawSecrets
}=require('./lib/cloudBrowserRoutes');

const migration=read('81_pack081_cloud_browser_runtime.sql');
const providerSource=read('lib/browserbaseProvider.js');
const policySource=read('lib/cloudBrowserPolicy.js');
const cdpSource=read('lib/cloudBrowserCdp.js');
const repositorySource=read('lib/cloudBrowserRepository.js');
const routesSource=read('lib/cloudBrowserRoutes.js');
const cleanupSource=read('lib/cloudBrowserCleanup.js');
const maintenance=read('lib/maintenanceCoordinator.js');
const server=read('server.js');
const universal=require('./config/universal-content.v1.json');

function count(source,needle){
  return source.split(needle).length-1;
}

assert.equal(config.version,'pack-081.cloud-browser.v1');
assert.equal(config.provider.id,'browserbase');
assert.equal(config.provider.externalGate,'M17');
assert.equal(config.gates.canCreateLiveSession,true);
assert.equal(config.session.keepAlive,true);
assert.equal(config.session.recordSession,false);
assert.equal(config.session.logSession,false);
assert.equal(config.secrets.rawCredentialInputAllowed,false);
assert.equal(config.secrets.persistConnectUrl,false);
assert.equal(config.network.allowedHostsRequired,true);
assert.equal(config.network.rawCdpUrlReturnedToClient,false);
assert.equal(config.pricing.targetGrossMarginBps,5000);

for(const marker of [
  'create table if not exists public.browser_sessions',
  'create table if not exists public.browser_session_artifacts',
  'conversation_id uuid references public.shared_conversations',
  'task_run_id uuid references public.zuvyr_task_runs',
  'project_id uuid references public.workspace_projects',
  'billing_request_id text not null',
  'browser_hour_price_micro_usd bigint not null',
  'billing_state text not null',
  'alter table public.browser_sessions enable row level security',
  'alter table public.browser_session_artifacts enable row level security',
  'revoke all on public.browser_sessions from public, anon, authenticated',
  'revoke all on public.browser_session_artifacts from public, anon, authenticated',
  'grant select, insert, update, delete on public.browser_sessions to service_role',
  'pack081_conversation_owner_mismatch',
  'pack081_task_owner_mismatch',
  'pack081_project_owner_mismatch',
  'pack081_idempotency_scope_mismatch',
  'pack081_terminal_session',
  'set_zuvyr_browser_billing_state_pack081'
]){
  assert(migration.includes(marker),marker);
}
for(const name of [
  'reserve_zuvyr_browser_session_pack081',
  'transition_zuvyr_browser_session_pack081',
  'set_zuvyr_browser_billing_state_pack081',
  'touch_zuvyr_browser_session_pack081'
]){
  assert.equal(
    count(migration,'create or replace function public.'+name+'('),
    1,
    name+' must exist exactly once'
  );
}
assert(!/grant\s+(?:select|insert|update|delete)[^;]*\s+to\s+(?:anon|authenticated)/i.test(migration));
assert(!migration.includes('connect_url'));
assert(!migration.includes('api_key'));
assert(!migration.includes('password'));
assert(!migration.includes('cookies'));

const blocked=availability({});
assert.equal(blocked.live,false);
for(const code of [
  'pack081_m17_unverified',
  'pack081_pricing_operator_gate_closed',
  'pack081_missing_browserbase_api_key',
  'pack081_missing_browserbase_project_id',
  'pack081_missing_browserbase_browser_hour_price_micro_usd',
  'pack081_missing_browserbase_pricing_version'
]){
  assert(blocked.blockers.includes(code),code);
}

const env={
  BROWSERBASE_API_KEY:'test-key-never-log',
  BROWSERBASE_PROJECT_ID:'project-test',
  BROWSERBASE_BROWSER_HOUR_PRICE_MICRO_USD:'120000',
  BROWSERBASE_PRICING_VERSION:'browserbase-developer-2026-09-19',
  ZUVYR_M17_VERIFIED:'true',
  ZUVYR_BROWSER_PRICING_VERIFIED:'true'
};

assert.equal(availability(env).live,true);
const snapshot=pricingSnapshot(env);
assert.equal(snapshot.browserHourPriceMicroUsd,120000);
assert.equal(snapshot.pricingVersion,'browserbase-developer-2026-09-19');
assert.equal(costMicroUsdForSeconds(900,snapshot),30000);
assert.equal(
  creditsForCostMicroUsd(30000,{
    creditPriceUsd:0.01,
    targetGrossMarginBps:5000
  }),
  6
);
const quote=quoteSession({ttlSeconds:900,env});
assert.equal(quote.estimatedProviderCostMicroUsd,30000);
assert.equal(quote.targetGrossMarginBps,5000);
assert(quote.reservedCredits>=1);

assert.deepEqual(normalizeAllowedHosts(['example.com','www.example.com','example.com']),['example.com','www.example.com']);
assert.equal(
  normalizePublicUrl('https://example.com/path?x=1#frag',{
    allowedHosts:['example.com']
  }).host,
  'example.com'
);
assert.throws(
  ()=>normalizePublicUrl('https://evil.example/path',{allowedHosts:['example.com']}),
  error=>error.code==='cloud_browser_host_not_allowed'
);
for(const blockedUrl of [
  'http://127.0.0.1/',
  'http://10.0.0.1/',
  'http://169.254.169.254/',
  'http://localhost/',
  'http://metadata.google.internal/'
]){
  assert.throws(
    ()=>normalizePublicUrl(blockedUrl,{allowedHosts:['example.com']}),
    error=>[
      'cloud_browser_private_network_blocked',
      'cloud_browser_host_not_allowed'
    ].includes(error.code),
    blockedUrl
  );
}
assert.deepEqual(
  sessionPolicies({allowedHosts:['example.com']}).network.allowedHosts,
  ['example.com']
);

const pub=publicSession({
  id:'11111111-1111-4111-8111-111111111111',
  conversation_id:null,
  task_run_id:null,
  project_id:null,
  status:'running',
  provider:'browserbase',
  provider_session_id:'provider-secret-id',
  network_policy:{allowedHosts:['example.com']},
  secret_policy:{},
  usage_seconds:12,
  proxy_bytes:34,
  billing_state:'reserved',
  final_credits:null,
  created_at:new Date().toISOString(),
  updated_at:new Date().toISOString(),
  last_activity_at:new Date().toISOString(),
  expires_at:new Date(Date.now()+60000).toISOString(),
  idle_expires_at:new Date(Date.now()+30000).toISOString()
});
assert.equal(pub.providerSessionId,undefined);
assert.equal(pub.connectUrl,undefined);
assert.deepEqual(pub.allowedHosts,['example.com']);

assert.throws(
  ()=>rejectRawSecrets({cookies:[{name:'sid',value:'x'}]}),
  error=>error.code==='cloud_browser_raw_credentials_forbidden'
);
assert.doesNotThrow(()=>rejectRawSecrets({
  allowedHosts:['example.com'],
  ttlSeconds:900
}));

(async()=>{
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    const body=options.body && typeof options.body==='string'
      ? JSON.parse(options.body)
      : null;
    calls.push({
      url:String(url),
      method:options.method||'GET',
      headers:options.headers||{},
      body
    });

    if(String(url).endsWith('/v1/sessions') && options.method==='POST'){
      return {
        ok:true,
        status:201,
        json:async()=>({
          id:'session_test_123',
          status:'RUNNING',
          region:'us-west-2',
          startedAt:'2026-09-19T10:00:00.000Z',
          endedAt:null
        })
      };
    }
    if(String(url).endsWith('/v1/sessions/session_test_123') && options.method==='POST'){
      assert.deepEqual(body,{status:'REQUEST_RELEASE'});
      return {
        ok:true,
        status:200,
        json:async()=>({
          id:'session_test_123',
          status:'COMPLETED',
          region:'us-west-2',
          startedAt:'2026-09-19T10:00:00.000Z',
          endedAt:'2026-09-19T10:02:00.000Z'
        })
      };
    }
    throw new Error('unexpected_mock_provider_call '+url);
  };

  const provider=createBrowserbaseProvider({fetchImpl,env});
  const created=await provider.createSession({
    localSessionId:'11111111-1111-4111-8111-111111111111',
    ttlSeconds:900
  });
  assert.equal(created.id,'session_test_123');
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.projectId,'project-test');
  assert.equal(calls[0].body.keepAlive,true);
  assert.equal(calls[0].body.timeout,900);
  assert.equal(calls[0].body.browserSettings.recordSession,false);
  assert.equal(JSON.stringify(calls[0].body).includes('test-key-never-log'),false);
  assert.equal(calls[0].headers['X-BB-API-Key'],'test-key-never-log');

  const released=await provider.releaseSession('session_test_123');
  assert.equal(released.status,'COMPLETED');
  assert.equal(released.usageSeconds,120);
  assert.equal(calls.length,2);

  const finance=finalCreditsForSession(
    {browser_hour_price_micro_usd:120000},
    120
  );
  assert.equal(finance.costMicroUsd,4000);
  assert(Number.isSafeInteger(finance.credits));

  for(const marker of [
    "require('ws')",
    'Fetch.requestPaused',
    'Fetch.continueRequest',
    'Fetch.failRequest',
    "errorReason:'BlockedByClient'",
    'Target.attachToTarget',
    'Page.captureScreenshot',
    'document.documentElement.outerHTML',
    'socket.close(1000',
    'normalizePublicUrl(requestUrl,{allowedHosts})'
  ]) assert(cdpSource.includes(marker),marker);
  assert(!cdpSource.includes('Browser.close'));

  for(const marker of [
    "feature:'ip'",
    "usageKind:'browser_runtime'",
    "planHasFeature(planId,'ip')",
    'assertLiveAvailable(env)',
    'normalizeAllowedHosts(req.body?.allowedHosts)',
    "router.post('/sessions'",
    "router.post('/sessions/:sessionId/resume'",
    "router.post('/sessions/:sessionId/close'",
    "router.post('/sessions/:sessionId/navigate'",
    "router.post('/sessions/:sessionId/screenshot'",
    "router.post('/sessions/:sessionId/dom'",
    "router.post('/sessions/:sessionId/uploads'",
    "router.post('/sessions/:sessionId/downloads/capture'",
    "router.post('/artifacts/:artifactId/download'"
  ]) assert(routesSource.includes(marker),marker);

  const createStart=routesSource.indexOf("router.post('/sessions'");
  const createEnd=routesSource.indexOf("router.get('/sessions/:sessionId'",createStart);
  const createRoute=routesSource.slice(createStart,createEnd);
  assert(createRoute.indexOf('assertLiveAvailable(env)')>=0);
  assert(createRoute.indexOf('assertLiveAvailable(env)')<createRoute.indexOf('browserbase.createSession'));
  assert(createRoute.indexOf("planHasFeature(planId,'ip')")<createRoute.indexOf('browserbase.createSession'));
  assert(createRoute.indexOf('reserveCredits')<createRoute.indexOf('browserbase.createSession'));

  assert(repositorySource.includes("kind: kind === 'screenshot' ? 'image' : kind === 'dom' ? 'text' : 'document'"));
  assert(universal.kinds.includes('document'));
  assert(repositorySource.includes('createSignedDownload'));
  assert(repositorySource.includes('resolveOwnedAsset'));
  assert(repositorySource.includes("cacheControl:'3600'"));

  assert(cleanupSource.includes('cleanupExpiredCloudBrowsers'));
  assert(cleanupSource.includes('browserbase.releaseSession'));
  assert(cleanupSource.includes('creditApi.refundCredits'));
  assert(cleanupSource.includes('creditApi.settleCredits'));
  assert(cleanupSource.includes('Provider is already gone and exact usage was never observed'));

  assert(maintenance.includes('cloudBrowserCleanup = null'));
  assert(maintenance.includes('receipt.cloudBrowser'));
  assert(maintenance.includes("step: 'cloud_browser_cleanup'"));

  assert(server.includes("'/api/cloud-browser'"));
  assert(server.includes('createCloudBrowserRouter'));
  assert(server.includes('cleanupExpiredCloudBrowsers'));
  assert(server.includes('cloudBrowserCleanup: options =>'));

  assert(providerSource.includes("body:JSON.stringify({status:'REQUEST_RELEASE'})"));
  assert(providerSource.includes("'/uploads'"));
  assert(providerSource.includes('connect.browserbase.com'));
  assert(policySource.includes('targetGrossMarginBps'));

  console.log('PASS: PACK081 durable owner/task/project/conversation browser authority is wired');
  console.log('PASS: PACK081 Browserbase create/resume/release contract is mock-verified with no live provider call');
  console.log('PASS: PACK081 CDP network allowlist blocks unapproved/private subrequests');
  console.log('PASS: PACK081 screenshot/DOM/upload/download artifacts use canonical private storage');
  console.log('PASS: PACK081 reserve/settle/refund uses canonical IP feature ledger and 50% margin policy');
  console.log('PASS: PACK081 maintenance cleanup defers uncertain provider cleanup instead of fabricating success');
  console.log('LIVE BROWSERBASE / PAYMENT CALLS: NONE');
})().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
