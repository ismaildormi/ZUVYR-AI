'use strict';

const crypto = require('crypto');
const CONFIG = require('../config/router-margin-guard.v1.json');
const { modelCostUsd } = require('./modelPricingAuthority');

const MARGIN_STATES = Object.freeze({ GREEN:'GREEN', YELLOW:'YELLOW', RED:'RED' });

function text(v){ if(v==null)return null; const s=String(v).trim(); return s||null; }
function integer(v){ if(v==null||v==='')return null; const n=Number(v); return Number.isSafeInteger(n)?n:null; }
function finite(v){ if(v==null||v==='')return null; const n=Number(v); return Number.isFinite(n)?n:null; }

function safeRef(kind, value){
  const s=text(value); if(!s)return null;
  return `${kind}_${crypto.createHash('sha256').update(s,'utf8').digest('hex').slice(0,24)}`;
}

function createDecisionContext({requestId=null}={}){
  const seed=text(requestId)||crypto.randomUUID();
  return Object.freeze({
    groupId:safeRef('decision',`${seed}:${crypto.randomUUID()}`),
    requestRef:safeRef('request',seed)
  });
}

function marginGuard({quotedGrossMarginBps,minimumGrossMarginBps=CONFIG.marginGuard.minimumGrossMarginBpsDefault}={}){
  const floor=integer(minimumGrossMarginBps);
  const quoted=integer(quotedGrossMarginBps);
  if(floor==null||floor<0)throw new Error('router_margin_floor_invalid');
  if(quoted==null)return Object.freeze({state:'RED',allowed:false,reason:'MARGIN_UNKNOWN',quotedGrossMarginBps:null,minimumGrossMarginBps:floor});
  if(quoted>floor)return Object.freeze({state:'GREEN',allowed:true,reason:'MARGIN_ABOVE_FLOOR',quotedGrossMarginBps:quoted,minimumGrossMarginBps:floor});
  if(quoted===floor)return Object.freeze({state:'YELLOW',allowed:true,reason:'MARGIN_AT_FLOOR',quotedGrossMarginBps:quoted,minimumGrossMarginBps:floor});
  return Object.freeze({state:'RED',allowed:false,reason:'MARGIN_BELOW_FLOOR',quotedGrossMarginBps:quoted,minimumGrossMarginBps:floor});
}

function estimateInputTokens(messages){
  if(!Array.isArray(messages))return 0;
  let chars=0;
  for(const m of messages){
    const c=m&&m.content;
    if(typeof c==='string')chars+=c.length;
    else if(Array.isArray(c)){
      for(const p of c){
        if(typeof p==='string')chars+=p.length;
        else if(p&&typeof p.text==='string')chars+=p.text.length;
      }
    }
  }
  return chars>0?Math.max(1,Math.ceil(chars/4)):0;
}

function estimatePreCallCostUsd({provider,model,capability='chat',messages}={}){
  if(!text(provider)||!text(model)||!text(capability))return null;
  try{
    const value=Number(modelCostUsd({
      provider,
      model,
      capability,
      usage:{
        input_tokens:estimateInputTokens(messages),
        output_tokens:0
      },
      requireMeasuredUsage:false
    }));
    return Number.isFinite(value)&&value>=0?value:null;
  }catch(_){ return null; }
}

function actualCostUsd({provider,model,capability='chat',usage}={}){
  try{
    const value=Number(modelCostUsd({
      provider,
      model,
      capability,
      usage:usage||{},
      requireMeasuredUsage:true
    }));
    return Number.isFinite(value)&&value>=0?value:null;
  }catch(_){ return null; }
}

function buildDecisionReceipt({
  context,provider,model,reason,outcome,guard,estimatedCostUsd=null,actualCostUsd:actual=null,
  latencyMs=0,retries=0,rankingMode=null,errorCategory=null,at=new Date()
}={}){
  if(!context||!context.groupId||!context.requestRef)throw new Error('router_decision_context_required');
  if(!text(provider)||!text(model))throw new Error('router_decision_provider_model_required');
  if(!guard||!Object.values(MARGIN_STATES).includes(guard.state))throw new Error('router_decision_margin_guard_required');
  const retryCount=integer(retries); if(retryCount==null||retryCount<0)throw new Error('router_decision_retries_invalid');
  const latency=finite(latencyMs); if(latency==null||latency<0)throw new Error('router_decision_latency_invalid');
  const estimated=finite(estimatedCostUsd), actualValue=finite(actual);
  const stamp=at.toISOString();
  return Object.freeze({
    version:CONFIG.version,
    decisionId:safeRef('route',`${context.groupId}:${provider}:${model}:${reason}:${outcome}:${retryCount}:${stamp}`),
    requestRef:context.requestRef,
    timestamp:stamp,
    provider:String(provider),
    model:String(model),
    reason:text(reason)||'UNSPECIFIED',
    outcome:text(outcome)||'UNKNOWN',
    marginState:guard.state,
    quotedGrossMarginBps:guard.quotedGrossMarginBps,
    minimumGrossMarginBps:guard.minimumGrossMarginBps,
    estimatedCostUsd:estimated!=null&&estimated>=0?estimated:null,
    actualCostUsd:actualValue!=null&&actualValue>=0?actualValue:null,
    latencyMs:Math.round(latency),
    retries:retryCount,
    rankingMode:text(rankingMode),
    errorCategory:text(errorCategory)
  });
}

function assertPrivacySafeReceipt(receipt){
  for(const k of ['messages','prompt','userId','rawRequestId']){
    if(Object.prototype.hasOwnProperty.call(receipt,k))throw new Error(`router_decision_privacy_field_forbidden:${k}`);
  }
  if(!/^request_[0-9a-f]{24}$/.test(receipt.requestRef||''))throw new Error('router_decision_request_ref_not_privacy_safe');
  if(!/^route_[0-9a-f]{24}$/.test(receipt.decisionId||''))throw new Error('router_decision_id_not_privacy_safe');
  if(JSON.stringify(receipt).length>8192)throw new Error('router_decision_receipt_too_large');
  return true;
}

function createDecisionLogger({sink=console.info}={}){
  if(typeof sink!=='function')throw new Error('router_decision_sink_required');
  return Object.freeze({
    record(receipt){
      assertPrivacySafeReceipt(receipt);
      sink(`${CONFIG.logging.prefix} ${JSON.stringify(receipt)}`);
      return receipt;
    }
  });
}

const routerDecisionLogger=createDecisionLogger();

module.exports={
  MARGIN_STATES,safeRef,createDecisionContext,marginGuard,estimateInputTokens,
  estimatePreCallCostUsd,actualCostUsd,buildDecisionReceipt,assertPrivacySafeReceipt,
  createDecisionLogger,routerDecisionLogger
};
