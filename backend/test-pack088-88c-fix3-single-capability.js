'use strict';

const assert = require('node:assert/strict');
const {
  buildCheckpointDQuotes
} = require('./lib/liveCapabilityExecutors');
const {
  verifySucceededSnapshot
} = require('./lib/brainKernelWorker');

function singleChatPlan() {
  return {
    version:'pack-035.brain-plan.v1',
    requestId:'pack088-fix3-single-chat',
    surface:'chat',
    goal:'Return PACK088_FIX3_OK',
    steps:[{
      id:'step_01_chat_respond',
      capability:'chat.respond',
      dependsOn:[],
      metadata:{}
    }]
  };
}

function legacyPlan() {
  return {
    version:'pack-035.brain-plan.v1',
    requestId:'pack088-fix3-legacy',
    surface:'work',
    goal:'Return PACK088_FIX3_LEGACY_OK',
    steps:[
      {
        id:'step_01_chat_respond',
        capability:'chat.respond',
        dependsOn:[],
        metadata:{}
      },
      {
        id:'step_02_project_collect',
        capability:'project.collect',
        dependsOn:['step_01_chat_respond'],
        metadata:{}
      }
    ]
  };
}

const singleQuote=buildCheckpointDQuotes(
  singleChatPlan(),
  {now:Date.parse('2026-09-21T15:40:00Z')}
);
assert.equal(singleQuote.stepQuotes.length,1);
assert.equal(singleQuote.stepQuotes[0].capability,'chat.respond');
assert(Number(singleQuote.stepQuotes[0].estimatedCredits)>0);
assert(singleQuote.providerQuotes.step_01_chat_respond);

const legacyQuote=buildCheckpointDQuotes(
  legacyPlan(),
  {now:Date.parse('2026-09-21T15:40:00Z')}
);
assert.equal(legacyQuote.stepQuotes.length,2);
assert.equal(legacyQuote.stepQuotes[0].capability,'chat.respond');
assert.equal(legacyQuote.stepQuotes[1].capability,'project.collect');
assert.equal(legacyQuote.stepQuotes[1].estimatedCredits,'0');

const singleVerification=verifySucceededSnapshot({
  run:{id:'11111111-1111-4111-8111-111111111111',state:'succeeded'},
  steps:[{
    capability:'chat.respond',
    state:'succeeded',
    output:{
      kind:'chat_response',
      text:'PACK088_FIX3_OK',
      billing:{
        credits:1,
        providerCostMicroUsd:'1',
        creditValueMicroUsd:'1000',
        usage:{}
      }
    }
  }]
});
assert.deepEqual(singleVerification.capabilities,['chat.respond']);
assert.equal(singleVerification.durableSaveVerified,true);

const legacyVerification=verifySucceededSnapshot({
  run:{id:'22222222-2222-4222-8222-222222222222',state:'succeeded'},
  steps:[
    {
      capability:'chat.respond',
      state:'succeeded',
      output:{
        kind:'chat_response',
        text:'PACK088_FIX3_LEGACY_OK',
        billing:{
          credits:1,
          providerCostMicroUsd:'1',
          creditValueMicroUsd:'1000',
          usage:{}
        }
      }
    },
    {
      capability:'project.collect',
      state:'succeeded',
      output:{
        kind:'project_collection',
        items:[{
          sourceStepKey:'step_01_chat_respond',
          kind:'chat_response',
          text:'PACK088_FIX3_LEGACY_OK'
        }]
      }
    }
  ]
});
assert.deepEqual(
  legacyVerification.capabilities,
  ['chat.respond','project.collect']
);

assert.throws(
  ()=>buildCheckpointDQuotes({
    ...singleChatPlan(),
    steps:[{
      id:'step_01_research',
      capability:'research.run',
      dependsOn:[],
      metadata:{}
    }]
  }),
  error=>error && error.code==='PACK040_TWO_CAPABILITY_PLAN_REQUIRED'
);

assert.throws(
  ()=>verifySucceededSnapshot({
    run:{state:'succeeded'},
    steps:[{
      capability:'research.run',
      state:'succeeded',
      output:{kind:'research_result'}
    }]
  }),
  error=>error && error.code==='PACK040_TWO_CAPABILITY_RESULT_INVALID'
);

console.log('PASS: PACK088 88C FIX3 supports single chat Brain quote');
console.log('PASS: PACK088 88C FIX3 supports single chat terminal verification');
console.log('PASS: PACK040 legacy chat-to-project proof remains supported');
console.log('PASS: unsupported live plan shapes still fail closed');
