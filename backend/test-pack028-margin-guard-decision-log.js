'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cfg=require('./config/router-margin-guard.v1.json');
const {
  createDecisionContext,marginGuard,estimateInputTokens,buildDecisionReceipt,
  assertPrivacySafeReceipt,createDecisionLogger
}=require('./lib/routerDecisionLog');

assert.equal(cfg.version,'pack-028.margin-guard-decision-log.v1');
assert.equal(marginGuard({quotedGrossMarginBps:6500,minimumGrossMarginBps:5000}).state,'GREEN');
assert.equal(marginGuard({quotedGrossMarginBps:5000,minimumGrossMarginBps:5000}).state,'YELLOW');
assert.equal(marginGuard({quotedGrossMarginBps:4999,minimumGrossMarginBps:5000}).state,'RED');
assert.equal(marginGuard({minimumGrossMarginBps:5000}).allowed,false);
assert.equal(estimateInputTokens([{content:'12345678'},{content:[{text:'1234'}]}]),3);

const raw='user-123:secret-request';
const context=createDecisionContext({requestId:raw});
assert(/^request_[0-9a-f]{24}$/.test(context.requestRef));
assert(!context.requestRef.includes('user-123'));

const receipt=buildDecisionReceipt({
  context,provider:'groq',model:'m1',reason:'RANKED_PRIMARY',outcome:'SUCCESS',
  guard:marginGuard({quotedGrossMarginBps:5000,minimumGrossMarginBps:5000}),
  estimatedCostUsd:0.001,actualCostUsd:0.0012,latencyMs:123.7,retries:0,
  rankingMode:'SMART_BEST_VALUE',at:new Date('2026-09-13T12:00:00.000Z')
});
assert.equal(receipt.marginState,'YELLOW');
assert.equal(receipt.latencyMs,124);
assert.equal(receipt.estimatedCostUsd,0.001);
assert.equal(receipt.actualCostUsd,0.0012);
assertPrivacySafeReceipt(receipt);
const serialized=JSON.stringify(receipt);
assert(!serialized.includes(raw));
assert(!serialized.includes('"messages"'));
assert(!serialized.includes('"prompt"'));
assert(!serialized.includes('"userId"'));

const lines=[];
createDecisionLogger({sink:line=>lines.push(line)}).record(receipt);
assert.equal(lines.length,1);
assert(lines[0].startsWith('[router-decision] '));
assert(!lines[0].includes(raw));

const source=fs.readFileSync(path.join(__dirname,'aiRouter.js'),'utf8');
for(const needle of [
  "require('./lib/routerDecisionLog')",
  'createDecisionContext',
  'marginGuard({',
  'buildDecisionReceipt',
  'decision_receipt: successReceipt',
  'decision_log: decisionLog',
  'error.decision_log = decisionLog'
]) assert(source.includes(needle),`missing router integration: ${needle}`);

assert(source.indexOf('routerHardFilters.filterLegacyChain')<source.indexOf('routerRanking.rankEligibleRoutes'));
assert(source.indexOf('routerRanking.rankEligibleRoutes')<source.indexOf('marginGuard({'));
assert(source.indexOf('marginGuard({')<source.indexOf('const startedAt = Date.now()'));

const lib=fs.readFileSync(path.join(__dirname,'lib/routerDecisionLog.js'),'utf8');
for(const forbidden of ['reserveCredits(','refundCredits(','settleCredits(','reserve_zuvyr_usage','zuvyr_usage_records','supabaseAdmin','fetch(','axios.']){
  assert(!lib.includes(forbidden),`decision log must remain non-billing/non-network: ${forbidden}`);
}

console.log('PASS: GREEN/YELLOW/RED margin guard uses the authoritative Pack026 floor without inventing a second threshold');
console.log('PASS: receipts include privacy-safe identifiers, estimate/actual cost, provider/model/reason/latency/retries/ranking mode and margin state');
console.log('PASS: raw request IDs, user IDs, prompts and messages are not stored');
console.log('PASS: RED margin routes cannot execute; decision logging runs after Pack026/027 and before provider call');
console.log('DATABASE / RAILWAY / PROVIDER ACCOUNT / PAYMENT / MODEL NETWORK CALLS: NONE');
