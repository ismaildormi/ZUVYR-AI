'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

const policy = require('./config/owned-model-runtime.v1.json');
const {
  liveAvailability,
  boundedWorkloadEligible,
  trafficSelected,
  createOwnedModelRuntime
} = require('./lib/ownedModelRuntime');
const {
  normalizeInferenceMessages
} = require('./lib/modelLabComputeConnector');

const migration = read('96_pack096_owned_model_runtime.sql');
const server = read('server.js');
const modelLabRoutes = read('lib/modelLabRoutes.js');
const connectorSource = read('lib/modelLabComputeConnector.js');
const runtimeSource = read('lib/ownedModelRuntime.js');
const repositorySource = read('lib/ownedModelRuntimeRepository.js');

function count(source,value){
  return source.split(value).length-1;
}

assert.equal(policy.version,'pack-096.owned-manager-operator.v1');
assert.equal(policy.modelFamily.productName,'ZUVYR 7 Manager / Operator');
assert.equal(policy.liveGate.externalGate,'M21');
assert.equal(policy.liveGate.enabledByDefault,false);
assert.equal(policy.liveGate.noSyntheticProof,true);
assert.deepEqual(policy.workloadPolicy.initialEligibleFeatures,['chat']);
assert.deepEqual(policy.workloadPolicy.initialInputModalities,['text']);
assert.equal(policy.workloadPolicy.attachmentsAllowed,false);
assert.equal(policy.workloadPolicy.codeAllowed,false);
assert.equal(policy.rollout.automaticRollback,true);
assert.equal(policy.rollout.externalFallbackRequired,true);
assert.equal(policy.serving.apiSoftwareFeeUsd,0);
assert.equal(policy.serving.ownedModelUsageFeeUsd,0);
assert.equal(policy.serving.inferenceMarkupUsd,0);
assert.equal(policy.serving.zuvyrPaidGpuRequired,false);
assert.equal(policy.accounting.ownedModelCreditsCharged,0);
assert.equal(policy.teacherGateway.requiresPack094Rights,true);
assert.equal(policy.teacherGateway.requiresTrainingConsent,true);
assert.equal(policy.teacherGateway.requiresPrivacyProcessed,true);
assert.equal(policy.teacherGateway.requiresVerifiedProvenance,true);
assert.equal(
  policy.teacherGateway.admissionAuthority,
  'admit_zuvyr_training_candidate_pack094'
);

for(const table of [
  'zuvyr_owned_model_deployments',
  'zuvyr_owned_model_route_receipts',
  'zuvyr_teacher_gateway_records'
]){
  assert.equal(
    count(migration,'create table if not exists public.'+table),
    1,
    table+' must exist exactly once'
  );
  assert(migration.includes('alter table public.'+table+' enable row level security'));
  assert(migration.includes('revoke all on public.'+table+' from public,anon,authenticated'));
}

for(const fn of [
  'register_zuvyr_owned_model_deployment_pack096',
  'activate_zuvyr_owned_model_deployment_pack096',
  'rollback_zuvyr_owned_model_deployment_pack096',
  'record_zuvyr_owned_model_route_pack096',
  'record_zuvyr_teacher_gateway_output_pack096'
]){
  assert.equal(
    count(migration,'create or replace function public.'+fn+'('),
    1,
    fn+' must exist exactly once'
  );
}

for(const marker of [
  "base_model_commercial_use_permitted",
  "pack096_base_model_commercial_permission_required",
  "baseline_checkpoint_id is null",
  "candidate_better_than_baseline",
  "pack096_candidate_not_better_than_baseline",
  "v_eval.independent is not true",
  "v_eval.regression_status<>'pass'",
  "event_status='planned'",
  "pack096_stage_plan_required",
  "qualification_status<>'qualified'",
  "health_status<>'healthy'",
  "last_health_at < now()-interval '1 hour'",
  "pack096_compute_connector_not_qualified",
  "pack096_canary_traffic_too_high",
  "pack096_secondary_traffic_too_high",
  "pack096_primary_requires_full_traffic",
  "owned_model_usage_fee_microusd numeric not null default 0",
  "check (owned_model_usage_fee_microusd=0)",
  "owned_model_credits_charged integer not null default 0",
  "check (owned_model_credits_charged=0)",
  "api_software_fee_microusd numeric not null default 0",
  "check (api_software_fee_microusd=0)",
  "inference_markup_microusd numeric not null default 0",
  "check (inference_markup_microusd=0)",
  "public.admit_zuvyr_training_candidate_pack094",
  "pack096_teacher_contract_or_license_required",
  "pack096_teacher_prohibited_source_material"
]){
  assert(migration.includes(marker),marker);
}

assert(!/grant\s+(?:select|insert|update|delete)[^;]*\s+to\s+(?:anon|authenticated)/i.test(migration));
assert(!migration.includes('prompt_text'));
assert(!migration.includes('response_text'));
assert(!migration.includes('provider_system_prompt text'));
assert(!migration.includes('provider_weights bytea'));

assert(connectorSource.includes("method = 'GET'"));
assert(connectorSource.includes("!['GET','POST'].includes(requestMethod)"));
assert(connectorSource.includes("path: '/v1/chat/completions'"));
assert(connectorSource.includes("stream: false"));
assert(connectorSource.includes("rejectUnauthorized: true"));
assert(connectorSource.includes("model_lab_connector_redirect_blocked"));
assert(connectorSource.includes("owned_model_text_only_required"));
assert(connectorSource.includes("provider: 'zuvyr_owned_byoc'"));
assert(connectorSource.includes("providerCostUsd: 0"));
assert(connectorSource.includes("zuvyrOwnedModelUsageFeeUsd: 0"));
assert(connectorSource.includes("zuvyrApiSoftwareFeeUsd: 0"));
assert(connectorSource.includes("inferenceMarkupUsd: 0"));

assert.deepEqual(
  normalizeInferenceMessages([
    {role:'system',content:'system'},
    {role:'user',content:'hello'}
  ]),
  [
    {role:'system',content:'system'},
    {role:'user',content:'hello'}
  ]
);
assert.throws(
  () => normalizeInferenceMessages([{role:'user',content:[{type:'image_url'}]}]),
  error => error.code === 'owned_model_text_only_required'
);

assert.equal(liveAvailability({}).live,false);
assert(liveAvailability({}).blockers.includes('pack096_m21_unverified'));
assert.equal(
  liveAvailability({ZUVYR_M21_VERIFIED:'true'}).live,
  true
);

assert.equal(
  boundedWorkloadEligible({
    feature:'chat',
    chatMode:'chat',
    hasAttachments:false,
    messages:[{role:'user',content:'hello'}]
  }),
  true
);
assert.equal(
  boundedWorkloadEligible({
    feature:'chat',
    chatMode:'web_search',
    hasAttachments:false,
    messages:[{role:'user',content:'hello'}]
  }),
  false
);
assert.equal(
  boundedWorkloadEligible({
    feature:'chat',
    chatMode:'chat',
    hasAttachments:true,
    messages:[{role:'user',content:'hello'}]
  }),
  false
);
assert.equal(
  boundedWorkloadEligible({
    feature:'code',
    chatMode:'chat',
    hasAttachments:false,
    messages:[{role:'user',content:'hello'}]
  }),
  false
);

assert.equal(
  trafficSelected({id:'dep',trafficBps:10000},'req'),
  true
);
assert.equal(
  trafficSelected({id:'dep',trafficBps:0},'req'),
  false
);

const deployment = Object.freeze({
  id:'11111111-1111-4111-8111-111111111111',
  checkpointId:'22222222-2222-4222-8222-222222222222',
  computeConnectorId:'33333333-3333-4333-8333-333333333333',
  endpointModelId:'zuvyr-checkpoint-v1',
  modelAlias:'zuvyr-7-manager-v1',
  rolloutStage:'PRIMARY',
  trafficBps:10000,
  maxLatencyMs:30000
});

function makeRepository(active=deployment){
  const state={
    routeReceipts:[],
    rollbacks:[],
    runtimeConnectorCalls:0
  };
  return {
    state,
    async findActiveDeployment(){ return active; },
    async runtimeConnector(){
      state.runtimeConnectorCalls+=1;
      return {
        connector:{
          endpoint_url:'https://compute.example.com',
          last_health_at:new Date().toISOString()
        },
        credential:'server-secret'
      };
    },
    async recordRoute(_owner,body){
      state.routeReceipts.push(body);
      return {receipt_id:'44444444-4444-4444-8444-444444444444'};
    },
    async rollbackDeployment(_owner,id,reason){
      state.rollbacks.push({id,reason});
      return {...active,status:'rolled_back'};
    }
  };
}

function externalResult(text='external'){
  return {
    text,
    model:'external/model',
    provider:'external',
    fallback_triggered:false,
    usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2},
    attempts:[{provider:'external',model:'external/model',status:'success'}],
    cost_usd:0.01,
    chain_reordered:false,
    billing_scope:{external:true}
  };
}

(async()=>{
  {
    const repository=makeRepository();
    let ownedCalls=0;
    let externalCalls=0;
    const runtime=createOwnedModelRuntime({
      repository,
      env:{},
      externalRoute:async()=>{
        externalCalls+=1;
        return externalResult('gate-external');
      },
      invokeOwned:async()=>{
        ownedCalls+=1;
        throw new Error('must_not_run');
      },
      logger:{error(){}}
    });
    const result=await runtime.route(
      'chat',
      [{role:'user',content:'hello'}],
      {
        ownerId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        requestId:'req-gate',
        chatMode:'chat',
        hasAttachments:false,
        routerOptions:{requestId:'req-gate'}
      }
    );
    assert.equal(result.text,'gate-external');
    assert.equal(ownedCalls,0,'M21 false must produce zero owned-provider calls');
    assert.equal(externalCalls,1);
    assert.equal(repository.state.runtimeConnectorCalls,0);
    assert.equal(repository.state.routeReceipts[0].routeMode,'external_only');
    assert.equal(repository.state.routeReceipts[0].ownedAttempted,false);
  }

  {
    const repository=makeRepository();
    let externalCalls=0;
    const runtime=createOwnedModelRuntime({
      repository,
      env:{ZUVYR_M21_VERIFIED:'true'},
      externalRoute:async()=>{
        externalCalls+=1;
        return externalResult();
      },
      invokeOwned:async()=>({
        text:'owned-success',
        model:'zuvyr-checkpoint-v1',
        provider:'zuvyr_owned_byoc',
        usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15},
        latencyMs:20,
        providerCostUsd:0,
        zuvyrOwnedModelUsageFeeUsd:0,
        zuvyrApiSoftwareFeeUsd:0,
        inferenceMarkupUsd:0,
        customerComputeCostMicrousd:123
      }),
      logger:{error(){}}
    });
    const result=await runtime.route(
      'chat',
      [{role:'user',content:'hello'}],
      {
        ownerId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        requestId:'req-owned',
        chatMode:'chat',
        hasAttachments:false,
        routerOptions:{requestId:'req-owned'}
      }
    );
    assert.equal(result.text,'owned-success');
    assert.equal(result.provider,'zuvyr_owned_byoc');
    assert.equal(result.cost_usd,0);
    assert.equal(result.billing_scope.owned_model_usage_fee_usd,0);
    assert.equal(result.billing_scope.api_software_fee_usd,0);
    assert.equal(result.billing_scope.inference_markup_usd,0);
    assert.equal(result.billing_scope.credits_charged_for_owned_model,0);
    assert.equal(result.owned_model.customerComputeCostMicrousd,123);
    assert.equal(externalCalls,0);
    assert.equal(repository.state.rollbacks.length,0);
    assert.equal(repository.state.routeReceipts[0].routeMode,'owned');
    assert.equal(repository.state.routeReceipts[0].ownedSucceeded,true);
  }

  {
    const shadowDeployment={...deployment,rolloutStage:'SHADOW'};
    const repository=makeRepository(shadowDeployment);
    let ownedCalls=0;
    let externalCalls=0;
    const runtime=createOwnedModelRuntime({
      repository,
      env:{ZUVYR_M21_VERIFIED:'true'},
      externalRoute:async()=>{
        externalCalls+=1;
        return externalResult('shadow-external');
      },
      invokeOwned:async()=>{
        ownedCalls+=1;
        return {
          text:'shadow-owned-hidden',
          usage:{total_tokens:3},
          latencyMs:25,
          customerComputeCostMicrousd:5
        };
      },
      logger:{error(){}}
    });
    const result=await runtime.route(
      'chat',
      [{role:'user',content:'hello'}],
      {
        ownerId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        requestId:'req-shadow',
        chatMode:'chat',
        hasAttachments:false,
        routerOptions:{requestId:'req-shadow'}
      }
    );
    assert.equal(result.text,'shadow-external');
    assert.equal(result.owned_model.shadow,true);
    assert.equal(result.owned_model.shadowSucceeded,true);
    assert.equal(ownedCalls,1);
    assert.equal(externalCalls,1);
    assert.equal(repository.state.routeReceipts[0].routeMode,'shadow');
  }

  {
    const repository=makeRepository();
    let externalCalls=0;
    const failure=new Error('provider failed');
    failure.code='owned_model_provider_failed';
    const runtime=createOwnedModelRuntime({
      repository,
      env:{ZUVYR_M21_VERIFIED:'true'},
      externalRoute:async()=>{
        externalCalls+=1;
        return externalResult('fallback-external');
      },
      invokeOwned:async()=>{throw failure;},
      logger:{error(){}}
    });
    const result=await runtime.route(
      'chat',
      [{role:'user',content:'hello'}],
      {
        ownerId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        requestId:'req-fallback',
        chatMode:'chat',
        hasAttachments:false,
        routerOptions:{requestId:'req-fallback'}
      }
    );
    assert.equal(result.text,'fallback-external');
    assert.equal(result.fallback_triggered,true);
    assert.equal(result.owned_model.fallbackReason,'owned_model_provider_failed');
    assert.equal(externalCalls,1);
    assert.equal(repository.state.rollbacks.length,1);
    assert.equal(repository.state.routeReceipts[0].routeMode,'fallback');
    assert.equal(repository.state.routeReceipts[0].externalFallbackTriggered,true);
  }

  {
    const repository=makeRepository();
    let ownedCalls=0;
    let externalCalls=0;
    const runtime=createOwnedModelRuntime({
      repository,
      env:{ZUVYR_M21_VERIFIED:'true'},
      externalRoute:async()=>{
        externalCalls+=1;
        return externalResult('not-bounded');
      },
      invokeOwned:async()=>{
        ownedCalls+=1;
        return {text:'should-not-run'};
      },
      logger:{error(){}}
    });
    const result=await runtime.route(
      'chat',
      [{role:'user',content:'hello'}],
      {
        ownerId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        requestId:'req-web',
        chatMode:'web_search',
        hasAttachments:false,
        routerOptions:{requestId:'req-web'}
      }
    );
    assert.equal(result.text,'not-bounded');
    assert.equal(ownedCalls,0);
    assert.equal(externalCalls,1);
  }

  for(const marker of [
    "const { routeRequest: externalRouteRequest } = require('./aiRouter');",
    "const { createOwnedModelRuntime } = require('./lib/ownedModelRuntime');",
    "const routeRequest = (feature, messages, options = {}) =>",
    "externalRoute: externalRouteRequest",
    "ownerId: userId",
    "chatMode,",
    "hasAttachments: hasDurableAttachments",
    "owned_model: result.owned_model || null",
    "ownedModel: result.owned_model || undefined",
    "routeRequestImpl: routeRequest"
  ]){
    assert(server.includes(marker),marker);
  }

  for(const marker of [
    "router.get('/owned-runtime/capabilities'",
    "router.get('/owned-runtime/deployments'",
    "router.post('/owned-runtime/deployments'",
    "router.post('/owned-runtime/deployments/:deploymentId/activate'",
    "router.post('/owned-runtime/deployments/:deploymentId/rollback'",
    "router.get('/owned-runtime/route-receipts'",
    "router.get('/teacher-gateway/records'",
    "router.post('/teacher-gateway/records'",
    "if(!m21Verified())",
    "labError('pack096_m21_unverified',503)"
  ]){
    assert(modelLabRoutes.includes(marker),marker);
  }

  const activateIndex=modelLabRoutes.indexOf(
    "router.post('/owned-runtime/deployments/:deploymentId/activate'"
  );
  const activateSegment=modelLabRoutes.slice(activateIndex,activateIndex+1800);
  assert(
    activateSegment.indexOf("if(!m21Verified())") >= 0 &&
    activateSegment.indexOf("if(!m21Verified())") <
      activateSegment.indexOf("owned.activateDeployment"),
    'M21 must be checked before activation RPC'
  );

  assert(repositorySource.includes('getConnectorSecret'));
  assert(repositorySource.includes("connector_kind !== 'openai_compatible_https'"));
  assert(repositorySource.includes("qualification_status !== 'qualified'"));
  assert(repositorySource.includes("health_status !== 'healthy'"));
  assert(runtimeSource.includes('automaticRollback'));
  assert(runtimeSource.includes("deployment.rolloutStage === 'SHADOW'"));
  assert(runtimeSource.includes("routeMode: 'fallback'"));
  assert(runtimeSource.includes("cost_usd: 0"));

  console.log('PASS: PACK096 policy and DB authority enforce B>A, commercial rights, rollout and zero-fee invariants');
  console.log('PASS: PACK096 M21=false makes zero owned provider calls while external fallback remains available');
  console.log('PASS: PACK096 owned success, shadow, rollback and fallback behavior are deterministic');
  console.log('PASS: PACK096 Teacher Gateway delegates training admission to PACK094 rights/consent/privacy/provenance');
  console.log('PASS: PACK096 server wiring preserves legacy routeRequest call shape for existing callers');
  console.log('LIVE TRAINING / OWNED BYOC / PAID PROVIDER CALLS: NONE');
})().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
