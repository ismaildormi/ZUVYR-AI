'use strict';

const {createCloudBrowserRepository}=require('./cloudBrowserRepository');
const {createBrowserbaseProvider}=require('./browserbaseProvider');
const {
  costMicroUsdForSeconds,
  creditsForCostMicroUsd
}=require('./cloudBrowserPolicy');

async function cleanupExpiredCloudBrowsers({
  db,storage,creditApi,provider=null,env=process.env,nowMs=Date.now(),limit=50,logger=console
}={}) {
  if (!db || !storage) throw Object.assign(new Error('cloud_browser_cleanup_dependencies_missing'),{code:'cloud_browser_cleanup_dependencies_missing'});
  const repository=createCloudBrowserRepository({db,storage});
  const browserbase=provider || createBrowserbaseProvider({env});
  const rows=await repository.stale({limit});
  const receipt={scanned:rows.length,closed:0,settled:0,refunded:0,deferred:0,failures:[]};

  async function refund(row) {
    let current=await repository.internal({ownerId:row.owner_id,sessionId:row.id});
    if (current.billing_state==='reserved') {
      await repository.billing({
        ownerId:current.owner_id,sessionId:current.id,
        expectedState:'reserved',nextState:'refund_pending'
      });
      current=await repository.internal({ownerId:current.owner_id,sessionId:current.id});
    }
    if (current.billing_state==='refund_pending') {
      await creditApi.refundCredits(current.billing_request_id);
      await repository.billing({
        ownerId:current.owner_id,sessionId:current.id,
        expectedState:'refund_pending',nextState:'refunded',finalCredits:0
      });
      receipt.refunded+=1;
    }
  }

  async function settle(row,remote) {
    let current=await repository.internal({ownerId:row.owner_id,sessionId:row.id});
    const usageSeconds=Math.max(Number(current.usage_seconds||0),Number(remote?.usageSeconds||0));
    if (!Number.isFinite(usageSeconds) || usageSeconds < 0) {
      throw Object.assign(new Error('cloud_browser_cleanup_usage_invalid'),{code:'cloud_browser_cleanup_usage_invalid'});
    }

    if (current.billing_state==='reserved') {
      await repository.billing({
        ownerId:current.owner_id,sessionId:current.id,
        expectedState:'reserved',nextState:'settling'
      });
      current=await repository.internal({ownerId:current.owner_id,sessionId:current.id});
    }
    if (current.billing_state==='settling') {
      const cost=costMicroUsdForSeconds(usageSeconds,{
        browserHourPriceMicroUsd:Number(current.browser_hour_price_micro_usd)
      });
      const finalCredits=creditsForCostMicroUsd(cost);
      await creditApi.settleCredits(current.billing_request_id,finalCredits);
      await repository.billing({
        ownerId:current.owner_id,sessionId:current.id,
        expectedState:'settling',nextState:'settled',finalCredits
      });
      receipt.settled+=1;
    }
  }

  for (const candidate of rows) {
    try {
      let current=await repository.internal({
        ownerId:candidate.owner_id,sessionId:candidate.id
      });
      if (['closed','failed','expired'].includes(current.status)) continue;

      const hardExpired=new Date(current.expires_at).getTime()<=nowMs;
      const idleExpired=new Date(current.idle_expires_at).getTime()<=nowMs;
      if (!hardExpired && !idleExpired) continue;

      if (!current.provider_session_id) {
        await refund(current);
        await repository.transition({
          ownerId:current.owner_id,sessionId:current.id,
          status:'expired',failureCode:'pack081_expired_before_provider_create'
        });
        receipt.closed+=1;
        continue;
      }

      if (current.status!=='closing') {
        await repository.transition({
          ownerId:current.owner_id,sessionId:current.id,status:'closing',
          providerSessionId:current.provider_session_id
        });
        current=await repository.internal({ownerId:current.owner_id,sessionId:current.id});
      }

      let remote=null;
      try {
        remote=await browserbase.releaseSession(current.provider_session_id);
        try {
          remote=await browserbase.getSession(current.provider_session_id);
        } catch (lookupError) {
          if (![404,410].includes(Number(lookupError?.providerStatus))) throw lookupError;
        }
      } catch (error) {
        if (![404,409,410].includes(Number(error?.providerStatus))) {
          receipt.deferred+=1;
          receipt.failures.push({
            sessionId:current.id,
            code:String(error?.code || 'cloud_browser_cleanup_release_failed')
          });
          continue;
        }
      }

      if (!remote && Number(current.usage_seconds||0)===0) {
        // Provider is already gone and exact usage was never observed.
        // Refund rather than inventing a provider cost.
        await refund(current);
      } else {
        await settle(current,remote);
      }

      await repository.transition({
        ownerId:current.owner_id,sessionId:current.id,status:'expired',
        providerSessionId:current.provider_session_id,
        region:remote?.region || current.region,
        usageSeconds:Math.max(Number(current.usage_seconds||0),Number(remote?.usageSeconds||0)),
        proxyBytes:Math.max(Number(current.proxy_bytes||0),Number(remote?.proxyBytes||0)),
        failureCode:idleExpired?'pack081_idle_expired':'pack081_ttl_expired'
      });
      receipt.closed+=1;
    } catch (error) {
      receipt.failures.push({
        sessionId:candidate.id,
        code:String(error?.code || 'cloud_browser_cleanup_failed')
      });
      logger.error('[cloud-browser-cleanup] deferred',candidate.id,String(error?.code || error?.message || error));
    }
  }

  return Object.freeze(receipt);
}

module.exports={cleanupExpiredCloudBrowsers};
