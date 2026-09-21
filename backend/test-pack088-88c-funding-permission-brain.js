'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG = require('./config/automations.v1.json');
const {
  inferSurface,
  buildAutomationRequest,
  permissionDescriptors,
  authorizeOccurrence,
  createAutomationExecutionProcessor
} = require('./lib/automationExecutionProcessor');
const {
  executionWorkerEnabled
} = require('./lib/automationExecutionWorker');

const migration = fs.readFileSync(
  path.join(__dirname, '91_pack088_88c_funding_permission_brain.sql'),
  'utf8'
);
const brainSource = fs.readFileSync(
  path.join(__dirname, 'lib', 'brainKernelRuntime.js'),
  'utf8'
);
const brainWorkerSource = fs.readFileSync(
  path.join(__dirname, 'lib', 'brainKernelWorker.js'),
  'utf8'
);
const workerSource = fs.readFileSync(
  path.join(__dirname, 'worker.js'),
  'utf8'
);

assert.equal(CONFIG.version, 'pack-088.88c.automations.v1');
assert.equal(CONFIG.implementationPhase, '88C_FUNDING_PERMISSION_BRAIN_KERNEL');
assert.equal(CONFIG.executionEnabled, true);
assert.equal(CONFIG.schedulerEnabled, true);
assert.equal(CONFIG.providerCallsEnabled, true);
assert.equal(CONFIG.billingMutationsEnabled, true);
assert.equal(CONFIG.invariants.runtimePricingBeforeExecution, true);
assert.equal(CONFIG.invariants.creditCapCheckedAgainstSameReservedQuote, true);
assert.equal(CONFIG.invariants.oneBrainReservationPerOccurrence, true);
assert.equal(CONFIG.invariants.permissionAfterFundingBeforeTaskCreation, true);
assert.equal(CONFIG.invariants.permissionFailureRefundsReservation, true);
assert.equal(CONFIG.invariants.ipGrantFreshPerOccurrence, true);
assert.equal(CONFIG.invariants.brainTerminalReconcilesScheduleRun, true);

for (const marker of [
  'add column if not exists permission_receipt jsonb',
  'add column if not exists pricing_snapshot jsonb',
  'create or replace function public.claim_workspace_schedule_run_execution_pack088',
  "state='blocked_permission'",
  'v_required_caps <@ v_schedule.authorization_capabilities',
  'create or replace function public.consume_workspace_schedule_permission_pack088',
  'public.consume_zuvyr_permission_grant(',
  "v_existing=v_receipt #> array['generic',v_step]",
  'create or replace function public.grant_workspace_schedule_ip_mission_pack088',
  'public.grant_ip_full_control_pack087(',
  "extensions.digest(v_mission,'sha256')",
  'create or replace function public.bind_workspace_schedule_run_task_pack088',
  "v_usage.state <> 'reserved'",
  "state='running'",
  'create or replace function public.finalize_workspace_schedule_run_from_task_pack088',
  "p_task_state not in ('succeeded','failed','cancelled')",
  'to service_role'
]) {
  assert(migration.includes(marker), `missing PACK088 88C migration marker: ${marker}`);
}

for (const forbidden of [
  /grant\s+execute[\s\S]*to\s+authenticated/i,
  /grant\s+execute[\s\S]*to\s+anon/i,
  /drop\s+table/i,
  /truncate\s+/i
]) {
  assert(!forbidden.test(migration), `forbidden PACK088 88C migration marker: ${forbidden}`);
}

const capIndex = brainSource.indexOf("PACK040_CREDIT_CAP_EXCEEDED");
const reserveIndex = brainSource.indexOf("reservation = await usageApi.reserve");
const hookIndex = brainSource.indexOf("await afterReservation");
const taskIndex = brainSource.indexOf("task = await durable.createOrGetTask");
assert(capIndex >= 0 && capIndex < reserveIndex);
assert(reserveIndex >= 0 && reserveIndex < hookIndex);
assert(hookIndex >= 0 && hookIndex < taskIndex);
assert(brainSource.includes("if (reservation && !task)"));
assert(brainSource.includes("await usageApi.refund"));
assert(brainWorkerSource.includes("reconcileAutomation"));
assert(brainWorkerSource.includes("finalizeFromTask"));
assert(workerSource.includes("startAutomationExecutionWorker"));
assert(workerSource.includes("[pack088-execution] runtime"));

assert.equal(executionWorkerEnabled({ PACK088_AUTOMATION_EXECUTION_ENABLED: 'true' }), true);
assert.equal(executionWorkerEnabled({ PACK088_AUTOMATION_EXECUTION_ENABLED: 'false' }), false);

assert.equal(inferSurface(['code']), 'code');
assert.equal(inferSurface(['image']), 'create');
assert.equal(inferSurface(['research']), 'work');
assert.equal(inferSurface(['chat']), 'chat');

const RUN='11111111-1111-4111-8111-111111111111';
const OWNER='22222222-2222-4222-8222-222222222222';
const SCHEDULE='33333333-3333-4333-8333-333333333333';
const WORKFLOW='44444444-4444-4444-8444-444444444444';
const CLAIM='55555555-5555-4555-8555-555555555555';
const TASK='66666666-6666-4666-8666-666666666666';
const USAGE=77;

const baseClaim = Object.freeze({
  status:'claimed',
  runId:RUN,
  ownerId:OWNER,
  scheduleId:SCHEDULE,
  workflowId:WORKFLOW,
  workflowRevision:1,
  scheduleRevision:1,
  occurrenceKey:'occ-1',
  scheduledFor:'2026-09-21T14:00:00.000Z',
  claimToken:CLAIM,
  workflowName:'Daily research',
  requestTemplate:{ goal:'Research the approved topic' },
  runInput:{},
  steps:[{
    stepKey:'research',
    position:0,
    capability:'research',
    dependsOn:[],
    inputTemplate:{},
    executionEnabled:false
  }],
  maxCreditsPerRun:25,
  allowTopup:false,
  authorizationCapabilities:['research'],
  authorizationExternalWrites:false,
  authorizedDeviceId:null,
  authorizationExpiresAt:'2026-09-21T15:00:00.000Z',
  permissionReceipt:null,
  pricingSnapshot:null
});

const request=buildAutomationRequest(baseClaim);
assert.equal(request.requestId, `pack088:${RUN}`);
assert.equal(request.surface,'work');
assert.equal(request.goal,'Research the approved topic');
assert.equal(request.metadata.automationRunId,RUN);

assert.deepEqual(permissionDescriptors(baseClaim),[]);

assert.throws(
  () => permissionDescriptors({
    ...baseClaim,
    steps:[{
      stepKey:'bad',
      capability:'code',
      inputTemplate:{permission:{action:'not.real',resourceNamespace:'code_project',resourceId:WORKFLOW}}
    }]
  }),
  error => error.code === 'PACK088_PERMISSION_ACTION_INVALID'
);

(async () => {
  const noWriteReceipt=await authorizeOccurrence({
    claim:baseClaim,
    request,
    repository:{
      consumePermission:async()=>{throw new Error('unexpected');},
      grantIpMission:async()=>{throw new Error('unexpected');}
    },
    now:new Date('2026-09-21T14:00:00.000Z')
  });
  assert.equal(noWriteReceipt.scheduleAuthorization,true);

  await assert.rejects(
    () => authorizeOccurrence({
      claim:{...baseClaim,authorizationExternalWrites:true},
      request,
      repository:{},
      now:new Date('2026-09-21T14:00:00.000Z')
    }),
    error => error.code === 'PACK088_PERMISSION_BINDING_REQUIRED'
  );

  const permissionClaim={
    ...baseClaim,
    authorizationCapabilities:['code'],
    authorizationExternalWrites:true,
    steps:[{
      stepKey:'run',
      capability:'code',
      inputTemplate:{
        permission:{
          action:'runtime.execute',
          resourceNamespace:'code_project',
          resourceId:WORKFLOW,
          sessionId:'session-1'
        }
      }
    }]
  };
  let consumed=0;
  const permissionReceipt=await authorizeOccurrence({
    claim:permissionClaim,
    request:buildAutomationRequest({...permissionClaim,requestTemplate:{goal:'Run approved code'}}),
    repository:{
      consumePermission:async input=>{
        consumed+=1;
        assert.equal(input.requestId,`pack088-permission:${RUN}:run`);
        return {success:true,allowed:true,receipt:{grant_id:'g1'}};
      },
      grantIpMission:async()=>{throw new Error('unexpected');}
    },
    now:new Date('2026-09-21T14:00:00.000Z')
  });
  assert.equal(consumed,1);
  assert.equal(permissionReceipt.generic.run.grant_id,'g1');

  const ipClaim={
    ...baseClaim,
    authorizationCapabilities:['ip'],
    authorizedDeviceId:'77777777-7777-4777-8777-777777777777',
    runInput:{ipSessionId:'88888888-8888-4888-8888-888888888888'},
    steps:[{
      stepKey:'computer',
      capability:'ip',
      inputTemplate:{}
    }]
  };
  let ipCall=null;
  const ipRequest=buildAutomationRequest({...ipClaim,requestTemplate:{goal:'Open the approved application'}});
  const ipReceipt=await authorizeOccurrence({
    claim:ipClaim,
    request:ipRequest,
    repository:{
      consumePermission:async()=>{throw new Error('unexpected');},
      grantIpMission:async input=>{
        ipCall=input;
        return {success:true,receipt:{grant_id:'ipg1',expires_at:input.expiresAt}};
      }
    },
    now:new Date('2026-09-21T14:00:00.000Z')
  });
  assert.equal(ipCall.sessionId,'88888888-8888-4888-8888-888888888888');
  assert.equal(ipCall.mission,'Open the approved application');
  assert(Date.parse(ipCall.expiresAt)-Date.parse('2026-09-21T14:00:00.000Z') <= 600000);
  assert.equal(ipReceipt.ipMission.grant_id,'ipg1');

  const pricingQuote={
    planVersion:'a'.repeat(64),
    quoteFingerprint:'b'.repeat(64),
    aggregate:{
      estimatedCredits:5,
      estimatedCostMicroUsd:'1000'
    }
  };

  const fundingBlocks=[];
  const fundingRepo={
    claimExecution:async()=>baseClaim,
    findBrainTask:async()=>null,
    block:async input=>{fundingBlocks.push(input);return input;}
  };
  const fundingProcessor=createAutomationExecutionProcessor({
    client:{},
    repository:fundingRepo,
    brain:{
      start:async()=>{
        const error=new Error('PACK040_CREDIT_CAP_EXCEEDED');
        error.code='PACK040_CREDIT_CAP_EXCEEDED';
        error.details={
          estimatedCredits:30,
          estimatedCostMicroUsd:'2000',
          maxEstimatedCredits:25,
          planVersion:'a'.repeat(64),
          quoteFingerprint:'b'.repeat(64)
        };
        throw error;
      }
    },
    durable:{bindQueueJob:async()=>{}},
    durableQueue:{},
    enqueue:async()=>{throw new Error('must not enqueue');},
    nowFactory:()=>new Date('2026-09-21T14:00:00.000Z')
  });
  const fundingResult=await fundingProcessor.process({
    runId:RUN,
    queueJobId:`pack088-${RUN}`
  });
  assert.equal(fundingResult.status,'blocked_funding');
  assert.equal(fundingBlocks[0].state,'blocked_funding');

  const permissionBlocks=[];
  const deniedClaim={
    ...permissionClaim,
    maxCreditsPerRun:100,
    requestTemplate:{goal:'Run approved code'}
  };
  const deniedRepo={
    claimExecution:async()=>deniedClaim,
    findBrainTask:async()=>null,
    consumePermission:async()=>({success:true,allowed:false,error:'permission_required'}),
    block:async input=>{permissionBlocks.push(input);return input;}
  };
  const deniedProcessor=createAutomationExecutionProcessor({
    client:{},
    repository:deniedRepo,
    brain:{
      start:async options=>{
        await options.afterReservation({
          quote:pricingQuote,
          liveQuote:{pricingVersion:'p1',modelTool:'m1'}
        });
        throw new Error('unexpected');
      }
    },
    durable:{bindQueueJob:async()=>{}},
    durableQueue:{},
    enqueue:async()=>{throw new Error('must not enqueue');},
    nowFactory:()=>new Date('2026-09-21T14:00:00.000Z')
  });
  const denied=await deniedProcessor.process({
    runId:RUN,
    queueJobId:`pack088-${RUN}`
  });
  assert.equal(denied.status,'blocked_permission');
  assert.equal(permissionBlocks[0].state,'blocked_permission');

  let lookupCount=0;
  let bound=null;
  let queueBound=null;
  const successRepo={
    claimExecution:async()=>baseClaim,
    findBrainTask:async()=>{
      lookupCount+=1;
      if(lookupCount===1) return null;
      return {
        id:TASK,
        user_id:OWNER,
        plan_version:'a'.repeat(64),
        queue_job_id:null,
        usage_record_id:USAGE,
        state:'pending',
        checkpoint_d_quote:{
          planVersion:'a'.repeat(64),
          quoteFingerprint:'b'.repeat(64),
          aggregate:{estimatedCredits:5,estimatedCostMicroUsd:'1000'},
          pack040:{pricingVersion:'p1',modelTool:'m1'}
        }
      };
    },
    bindTask:async input=>{bound=input;return input;},
    block:async()=>{throw new Error('unexpected block');}
  };
  const successProcessor=createAutomationExecutionProcessor({
    client:{},
    repository:successRepo,
    brain:{
      start:async options=>{
        assert.equal(options.maxEstimatedCredits,25);
        assert.equal(options.enqueueTask,false);
        await options.afterReservation({
          quote:pricingQuote,
          liveQuote:{pricingVersion:'p1',modelTool:'m1'}
        });
        return {
          replayed:false,
          reservationPerformed:true,
          taskRunId:TASK,
          reservedCredits:5
        };
      }
    },
    durable:{
      bindQueueJob:async input=>{queueBound=input;return input;}
    },
    durableQueue:{},
    enqueue:async input=>({
      jobId:`pack037-${input.taskRunId}`
    }),
    nowFactory:()=>new Date('2026-09-21T14:00:00.000Z')
  });
  const success=await successProcessor.process({
    runId:RUN,
    queueJobId:`pack088-${RUN}`
  });
  assert.equal(success.status,'running');
  assert.equal(success.taskRunId,TASK);
  assert.equal(bound.taskRunId,TASK);
  assert.equal(bound.pricingSnapshot.estimatedCredits,5);
  assert.equal(bound.permissionReceipt.scheduleAuthorization,true);
  assert.equal(queueBound.taskRunId,TASK);

  let replayBrainStarts=0;
  const replayProcessor=createAutomationExecutionProcessor({
    client:{},
    repository:{
      claimExecution:async()=>({
        status:'replay',
        runId:RUN,
        ownerId:OWNER,
        taskRunId:TASK
      }),
      findBrainTask:async()=>({
        id:TASK,
        plan_version:'a'.repeat(64),
        queue_job_id:`pack037-${TASK}`,
        usage_record_id:USAGE,
        state:'queued'
      })
    },
    brain:{start:async()=>{replayBrainStarts+=1;}},
    durable:{bindQueueJob:async()=>{throw new Error('unexpected');}},
    durableQueue:{},
    enqueue:async()=>{throw new Error('unexpected');}
  });
  const replay=await replayProcessor.process({
    runId:RUN,
    queueJobId:`pack088-${RUN}`
  });
  assert.equal(replay.replayed,true);
  assert.equal(replayBrainStarts,0);

  console.log('PASS: PACK088 88C cap is enforced before reserve/provider execution');
  console.log('PASS: PACK088 88C permission binding occurs after funding and before task creation');
  console.log('PASS: generic and IP permissions are occurrence-bound and crash-persisted by DB RPCs');
  console.log('PASS: funding and permission denial terminate without durable Brain enqueue');
  console.log('PASS: successful occurrence binds one Brain task and one stable durable queue identity');
  console.log('PASS: replay recovers the existing Brain task without re-reserve or re-permission');
  console.log('PASS: Brain terminal reconciliation is wired back to workspace_schedule_runs');
})().catch(error=>{
  console.error(error && error.stack ? error.stack : error);
  process.exitCode=1;
});
