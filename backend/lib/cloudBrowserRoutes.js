'use strict';

const crypto=require('node:crypto');
const express=require('express');
const {createCloudBrowserRepository}=require('./cloudBrowserRepository');
const {createBrowserbaseProvider}=require('./browserbaseProvider');
const {createCdpConnection}=require('./cloudBrowserCdp');
const {
  config,
  browserError,
  assertLiveAvailable,
  quoteSession,
  normalizeAllowedHosts,
  normalizePublicUrl,
  costMicroUsdForSeconds,
  creditsForCostMicroUsd,
  publicSession,
  sanitizeProviderError
}=require('./cloudBrowserPolicy');
const {
  canonicalPlanIdFromProfile,
  planHasFeature,
  minimumPlanForFeature
}=require('./planEntitlements');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function routeError(code,status=400) {
  const error=browserError(code);
  error.status=status;
  return error;
}

function statusFor(error) {
  const code=String(error?.code || '');
  if (code==='pack081_session_not_found') return 404;
  if (code==='cloud_browser_requires_plan') return 403;
  if (code==='insufficient_credits' || code==='out_of_credits') return 402;
  if (
    code==='cloud_browser_live_gate_closed' ||
    code==='cloud_browser_provider_credentials_unavailable' ||
    code==='cloud_browser_pricing_unverified'
  ) return 503;
  if (
    code==='pack081_active_session_exists' ||
    code==='pack081_idempotency_scope_mismatch' ||
    code==='cloud_browser_session_in_progress' ||
    code==='cloud_browser_billing_state_conflict'
  ) return 409;
  if (code.startsWith('cloud_browser_provider_') || code.startsWith('cloud_browser_cdp_')) return 502;
  return Number(error?.status) || 400;
}

function fail(res,error,fallback='cloud_browser_request_failed') {
  return res.status(statusFor(error)).json({
    status:'error',
    code:String(error?.code || fallback),
    message:'Cloud Browser request failed.'
  });
}

function optionalUuid(value,code) {
  if (value==null || value==='') return null;
  const text=String(value).trim();
  if (!UUID.test(text)) throw routeError(code,422);
  return text.toLowerCase();
}

function requestId(req) {
  const value=String(req.headers['idempotency-key'] || '').trim() || crypto.randomUUID();
  if (value.length < 8 || value.length > 200) throw routeError('pack081_request_id_invalid',422);
  return value;
}

function rejectRawSecrets(body) {
  const forbidden=[
    'credentials','password','passwords','cookies','cookie','authorization',
    'headers','storageState','storage_state','apiKey','api_key','token','secret'
  ];
  for (const key of forbidden) {
    if (body && Object.prototype.hasOwnProperty.call(body,key)) {
      throw routeError('cloud_browser_raw_credentials_forbidden',422);
    }
  }
}

async function ownerPlan(db,ownerId) {
  const result=await db.from('profiles')
    .select('subscription_status')
    .eq('id',ownerId)
    .maybeSingle();
  if (result.error || !result.data) throw routeError('cloud_browser_plan_lookup_failed',503);
  return canonicalPlanIdFromProfile(result.data);
}

function billingRequestId(id) {
  return ('browser:'+String(id)).slice(0,220);
}

function finalCreditsForSession(row,usageSeconds) {
  const costMicro=costMicroUsdForSeconds(
    usageSeconds,
    {browserHourPriceMicroUsd:Number(row.browser_hour_price_micro_usd)}
  );
  return Object.freeze({
    costMicroUsd:costMicro,
    credits:creditsForCostMicroUsd(costMicro)
  });
}

function createCloudBrowserRouter({
  db,
  storage,
  creditApi,
  provider=null,
  env=process.env,
  WebSocketImpl=null
}={}) {
  if (!db || !storage) throw routeError('cloud_browser_repository_unavailable',503);
  const router=express.Router();
  const repository=createCloudBrowserRepository({db,storage});
  const browserbase=provider || createBrowserbaseProvider({env});

  async function withCdp(internal,work) {
    const connectUrl=browserbase.connectUrl(internal.provider_session_id);
    const connection=createCdpConnection({
      connectUrl,
      allowedHosts:Array.isArray(internal.network_policy?.allowedHosts)
        ? internal.network_policy.allowedHosts
        : [],
      ...(WebSocketImpl ? {WebSocketImpl} : {})
    });
    await connection.connect();
    try {
      return await work(connection);
    } finally {
      await connection.disconnect().catch(()=>null);
    }
  }

  async function refundSession(internal,error) {
    if (!internal) return;
    let current=await repository.internal({ownerId:internal.owner_id,sessionId:internal.id}).catch(()=>internal);
    if (current.billing_state==='reserved') {
      await repository.billing({
        ownerId:current.owner_id,
        sessionId:current.id,
        expectedState:'reserved',
        nextState:'refund_pending'
      }).catch(()=>null);
      current=await repository.internal({ownerId:current.owner_id,sessionId:current.id}).catch(()=>current);
    }
    if (current.billing_state==='refund_pending' && typeof creditApi?.refundCredits==='function') {
      try {
        await creditApi.refundCredits(current.billing_request_id);
        await repository.billing({
          ownerId:current.owner_id,
          sessionId:current.id,
          expectedState:'refund_pending',
          nextState:'refunded',
          finalCredits:0
        });
      } catch (refundError) {
        if (typeof creditApi?.reportRefundFailure==='function') {
          await creditApi.reportRefundFailure({
            requestId:current.billing_request_id,
            userId:current.owner_id,
            feature:'ip',
            error:refundError
          }).catch(()=>null);
        }
      }
    }
    if (!['failed','closed','expired'].includes(current.status)) {
      await repository.transition({
        ownerId:current.owner_id,
        sessionId:current.id,
        status:'failed',
        providerSessionId:current.provider_session_id,
        usageSeconds:current.usage_seconds,
        proxyBytes:current.proxy_bytes,
        failureCode:error?.code || error?.message || 'cloud_browser_failed'
      }).catch(()=>null);
    }
  }

  async function settleSession(internal,providerState=null) {
    let current=await repository.internal({
      ownerId:internal.owner_id,
      sessionId:internal.id
    });
    const usageSeconds=Math.max(
      Number(current.usage_seconds || 0),
      Number(providerState?.usageSeconds || 0)
    );
    const proxyBytes=Math.max(
      Number(current.proxy_bytes || 0),
      Number(providerState?.proxyBytes || 0)
    );

    if (
      current.status!=='closed' &&
      current.status!=='failed' &&
      current.status!=='expired'
    ) {
      current=await repository.transition({
        ownerId:current.owner_id,
        sessionId:current.id,
        status:'closed',
        providerSessionId:current.provider_session_id,
        region:providerState?.region || current.region,
        usageSeconds,
        proxyBytes
      }).then(()=>repository.internal({ownerId:current.owner_id,sessionId:current.id}));
    }

    if (current.billing_state==='settled' || current.billing_state==='refunded') {
      return repository.get({ownerId:current.owner_id,sessionId:current.id});
    }
    if (current.billing_state==='not_reserved') {
      return repository.get({ownerId:current.owner_id,sessionId:current.id});
    }
    if (current.billing_state==='reserved') {
      await repository.billing({
        ownerId:current.owner_id,
        sessionId:current.id,
        expectedState:'reserved',
        nextState:'settling'
      });
      current=await repository.internal({ownerId:current.owner_id,sessionId:current.id});
    }
    if (current.billing_state==='settling') {
      const final=finalCreditsForSession(current,usageSeconds);
      await creditApi.settleCredits(current.billing_request_id,final.credits);
      await repository.billing({
        ownerId:current.owner_id,
        sessionId:current.id,
        expectedState:'settling',
        nextState:'settled',
        finalCredits:final.credits
      });
      if (typeof creditApi?.logCreditEvent==='function') {
        await creditApi.logCreditEvent({
          userId:current.owner_id,
          feature:'ip',
          modelUsed:'browserbase',
          status:'success',
          requestId:current.billing_request_id+':detail',
          metadata:{
            project_id:current.project_id,
            task_id:current.task_run_id || current.request_id,
            step_id:'browser-runtime',
            usage_kind:'browser_runtime',
            pricing_version:current.pricing_version,
            browser_hour_price_micro_usd:current.browser_hour_price_micro_usd,
            usage_seconds:usageSeconds,
            proxy_bytes:proxyBytes,
            provider_cost_micro_usd:final.costMicroUsd
          }
        }).catch(()=>null);
      }
    }
    return repository.get({ownerId:current.owner_id,sessionId:current.id});
  }

  router.get('/capabilities',(_req,res)=>{
    const live=require('./cloudBrowserPolicy').availability(env);
    return res.json({
      status:'success',
      pack:81,
      provider:'browserbase',
      liveSessionCreation:live.live,
      externalGate:'M17',
      blockers:live.blockers,
      session:{
        create:true,resume:true,close:true,
        maxTtlSeconds:config.session.maxTtlSeconds,
        keepAlive:true
      },
      observations:{screenshot:true,dom:true},
      files:{upload:true,download:true},
      network:{allowlistRequired:true,privateNetworkBlocked:true},
      secrets:{rawCredentialInputAllowed:false,connectUrlReturned:false},
      billing:{authority:'server',usageKind:'browser_runtime',feature:'ip'}
    });
  });

  router.get('/sessions',async(req,res)=>{
    try {
      return res.json({
        status:'success',
        sessions:await repository.list({ownerId:req.userId,limit:req.query?.limit})
      });
    } catch(error){ return fail(res,error); }
  });

  router.post('/sessions',async(req,res)=>{
    let local=null;
    let providerSession=null;
    let charged=false;
    try {
      rejectRawSecrets(req.body);
      assertLiveAvailable(env);

      const planId=await ownerPlan(db,req.userId);
      if (!planHasFeature(planId,'ip')) {
        const error=routeError('cloud_browser_requires_plan',403);
        error.minimumPlan=minimumPlanForFeature('ip');
        throw error;
      }

      const rid=requestId(req);
      const existing=await repository.byRequest({ownerId:req.userId,requestId:rid});
      if (existing) {
        if (['running','detached'].includes(existing.public.status)) {
          return res.json({status:'success',replayed:true,session:existing.public});
        }
        throw routeError('cloud_browser_session_in_progress',409);
      }

      const ttlSeconds=Number(req.body?.ttlSeconds || config.session.defaultTtlSeconds);
      const quote=quoteSession({ttlSeconds,env});
      const allowedHosts=normalizeAllowedHosts(req.body?.allowedHosts);
      const conversationId=optionalUuid(req.body?.conversationId,'cloud_browser_conversation_id_invalid');
      const taskRunId=optionalUuid(req.body?.taskRunId,'cloud_browser_task_run_id_invalid');
      const projectId=optionalUuid(req.body?.projectId,'cloud_browser_project_id_invalid');
      const now=Date.now();
      const expiresAt=new Date(now+ttlSeconds*1000).toISOString();
      const idleExpiresAt=new Date(
        Math.min(now+config.session.idleTtlSeconds*1000,new Date(expiresAt).getTime())
      ).toISOString();
      const bid=billingRequestId(rid);

      local=await repository.reserve({
        ownerId:req.userId,
        conversationId,
        taskRunId,
        projectId,
        requestId:rid,
        billingRequestId:bid,
        expiresAt,
        idleExpiresAt,
        allowedHosts,
        pricingVersion:quote.pricingVersion,
        browserHourPriceMicroUsd:quote.browserHourPriceMicroUsd,
        reservedCredits:quote.reservedCredits
      });

      await creditApi.reserveCredits({
        userId:req.userId,
        requestId:bid,
        feature:'ip',
        modelUsed:'browserbase',
        creditsConsumed:quote.reservedCredits,
        projectId,
        taskId:taskRunId || rid,
        stepId:'browser-runtime',
        usageKind:'browser_runtime',
        pricingVersion:quote.pricingVersion
      });
      charged=true;
      await repository.billing({
        ownerId:req.userId,
        sessionId:local.id,
        expectedState:'not_reserved',
        nextState:'reserved'
      });

      await repository.transition({
        ownerId:req.userId,
        sessionId:local.id,
        status:'provisioning'
      });

      providerSession=await browserbase.createSession({
        localSessionId:local.id,
        ttlSeconds:quote.ttlSeconds
      });
      local=await repository.transition({
        ownerId:req.userId,
        sessionId:local.id,
        status:'running',
        providerSessionId:providerSession.id,
        region:providerSession.region,
        usageSeconds:providerSession.usageSeconds,
        proxyBytes:providerSession.proxyBytes
      });

      return res.status(201).json({
        status:'success',
        replayed:false,
        session:local,
        quote:{
          reservedCredits:quote.reservedCredits,
          pricingVersion:quote.pricingVersion,
          targetGrossMarginBps:quote.targetGrossMarginBps
        }
      });
    } catch(error) {
      if (providerSession?.id) {
        await browserbase.releaseSession(providerSession.id).catch(()=>null);
      }
      if (local?.id) {
        const internal=await repository.internal({ownerId:req.userId,sessionId:local.id}).catch(()=>null);
        if (internal && charged) await refundSession(internal,error);
        else if (internal) {
          await repository.transition({
            ownerId:req.userId,
            sessionId:internal.id,
            status:'failed',
            failureCode:error.code || error.message
          }).catch(()=>null);
        }
      }
      return fail(res,error);
    }
  });

  router.get('/sessions/:sessionId',async(req,res)=>{
    try {
      const id=optionalUuid(req.params.sessionId,'cloud_browser_session_id_invalid');
      return res.json({status:'success',session:await repository.get({ownerId:req.userId,sessionId:id})});
    } catch(error){ return fail(res,error); }
  });

  router.post('/sessions/:sessionId/resume',async(req,res)=>{
    try {
      const id=optionalUuid(req.params.sessionId,'cloud_browser_session_id_invalid');
      let internal=await repository.internal({ownerId:req.userId,sessionId:id});
      if (!['running','detached'].includes(internal.status)) {
        throw routeError('cloud_browser_session_not_resumable',409);
      }
      const remote=await browserbase.getSession(internal.provider_session_id);
      if (!['RUNNING','REQUEST_RELEASE'].includes(remote.status.toUpperCase())) {
        throw routeError('cloud_browser_provider_session_not_running',409);
      }
      const idleExpiresAt=new Date(
        Math.min(
          Date.now()+config.session.idleTtlSeconds*1000,
          new Date(internal.expires_at).getTime()
        )
      ).toISOString();
      if (internal.status==='detached') {
        await repository.transition({
          ownerId:req.userId,sessionId:id,status:'running',
          providerSessionId:remote.id,region:remote.region,
          usageSeconds:remote.usageSeconds,proxyBytes:remote.proxyBytes
        });
      }
      const page=await withCdp(internal,cdp=>cdp.currentPage());
      const session=await repository.touch({
        ownerId:req.userId,sessionId:id,idleExpiresAt,
        currentHost:page.host,usageSeconds:remote.usageSeconds
      });
      return res.json({status:'success',session,page});
    } catch(error){ return fail(res,sanitizeProviderError(error)); }
  });

  router.post('/sessions/:sessionId/navigate',async(req,res)=>{
    try {
      rejectRawSecrets(req.body);
      const id=optionalUuid(req.params.sessionId,'cloud_browser_session_id_invalid');
      const internal=await repository.internal({ownerId:req.userId,sessionId:id});
      if (internal.status!=='running') throw routeError('cloud_browser_session_not_running',409);
      const target=normalizePublicUrl(req.body?.url,{
        allowedHosts:internal.network_policy?.allowedHosts || []
      });
      const result=await withCdp(internal,cdp=>cdp.navigate(target.url));
      const idleExpiresAt=new Date(
        Math.min(Date.now()+config.session.idleTtlSeconds*1000,new Date(internal.expires_at).getTime())
      ).toISOString();
      const session=await repository.touch({
        ownerId:req.userId,sessionId:id,idleExpiresAt,currentHost:result.host
      });
      return res.json({status:'success',session,page:{host:result.host}});
    } catch(error){ return fail(res,error); }
  });

  router.post('/sessions/:sessionId/screenshot',async(req,res)=>{
    try {
      const id=optionalUuid(req.params.sessionId,'cloud_browser_session_id_invalid');
      const internal=await repository.internal({ownerId:req.userId,sessionId:id});
      if (internal.status!=='running') throw routeError('cloud_browser_session_not_running',409);
      const shot=await withCdp(internal,cdp=>cdp.screenshot({
        format:req.body?.format,
        quality:req.body?.quality
      }));
      const artifact=await repository.uploadCanonical({
        ownerId:req.userId,sessionId:id,kind:'screenshot',
        buffer:shot.buffer,mimeType:shot.mimeType,
        fileName:'browser-screenshot.'+(shot.format==='jpeg'?'jpg':'png'),
        projectId:internal.project_id,
        metadata:{host:internal.current_host || null}
      });
      return res.status(201).json({status:'success',artifact});
    } catch(error){ return fail(res,error); }
  });

  router.post('/sessions/:sessionId/dom',async(req,res)=>{
    try {
      const id=optionalUuid(req.params.sessionId,'cloud_browser_session_id_invalid');
      const internal=await repository.internal({ownerId:req.userId,sessionId:id});
      if (internal.status!=='running') throw routeError('cloud_browser_session_not_running',409);
      const dom=await withCdp(internal,cdp=>cdp.domSnapshot());
      const artifact=await repository.uploadCanonical({
        ownerId:req.userId,sessionId:id,kind:'dom',
        buffer:Buffer.from(dom.html,'utf8'),mimeType:'text/html',
        fileName:'browser-dom.html',projectId:internal.project_id,
        metadata:{host:internal.current_host || null}
      });
      return res.status(201).json({status:'success',artifact});
    } catch(error){ return fail(res,error); }
  });

  router.post('/sessions/:sessionId/uploads',async(req,res)=>{
    try {
      const id=optionalUuid(req.params.sessionId,'cloud_browser_session_id_invalid');
      const assetId=optionalUuid(req.body?.assetId,'cloud_browser_upload_asset_id_invalid');
      const internal=await repository.internal({ownerId:req.userId,sessionId:id});
      if (internal.status!=='running') throw routeError('cloud_browser_session_not_running',409);
      const owned=await repository.downloadOwnedAssetBuffer({ownerId:req.userId,assetId});
      const uploaded=await browserbase.uploadFile(internal.provider_session_id,{
        buffer:owned.buffer,fileName:req.body?.fileName || owned.fileName,mimeType:owned.mimeType
      });
      const artifact=await repository.recordOwnedUpload({
        ownerId:req.userId,sessionId:id,assetId,
        providerArtifactId:uploaded.providerArtifactId,
        fileName:uploaded.fileName
      });
      return res.status(201).json({status:'success',artifact});
    } catch(error){ return fail(res,error); }
  });

  router.post('/sessions/:sessionId/downloads/capture',async(req,res)=>{
    try {
      const id=optionalUuid(req.params.sessionId,'cloud_browser_session_id_invalid');
      const internal=await repository.internal({ownerId:req.userId,sessionId:id});
      if (!['running','detached'].includes(internal.status)) {
        throw routeError('cloud_browser_session_not_active',409);
      }
      const existing=await repository.artifacts({ownerId:req.userId,sessionId:id,limit:200});
      const seen=new Set(existing.map(item=>item.provider_artifact_id).filter(Boolean));
      const listed=await browserbase.listDownloads(internal.provider_session_id,{limit:20});
      const captured=[];
      for (const item of listed.downloads.slice(0,20)) {
        if (seen.has(item.id)) continue;
        const file=await browserbase.getDownload(item.id);
        const artifact=await repository.uploadCanonical({
          ownerId:req.userId,sessionId:id,kind:'download',
          buffer:file.buffer,mimeType:file.mimeType,
          fileName:item.fileName || 'download',
          providerArtifactId:item.id,
          projectId:internal.project_id,
          metadata:{providerCreatedAt:item.createdAt || null}
        });
        captured.push(artifact);
      }
      return res.json({status:'success',captured});
    } catch(error){ return fail(res,error); }
  });

  router.get('/sessions/:sessionId/artifacts',async(req,res)=>{
    try {
      const id=optionalUuid(req.params.sessionId,'cloud_browser_session_id_invalid');
      return res.json({
        status:'success',
        artifacts:await repository.artifacts({ownerId:req.userId,sessionId:id,limit:req.query?.limit})
      });
    } catch(error){ return fail(res,error); }
  });

  router.post('/artifacts/:artifactId/download',async(req,res)=>{
    try {
      const artifactId=optionalUuid(req.params.artifactId,'cloud_browser_artifact_id_invalid');
      const signed=await repository.signedArtifactDownload({
        ownerId:req.userId,
        artifactId,
        requestId:requestId(req)+':asset'
      });
      return res.json({status:'success',download:signed});
    } catch(error){ return fail(res,error); }
  });

  router.post('/sessions/:sessionId/close',async(req,res)=>{
    try {
      const id=optionalUuid(req.params.sessionId,'cloud_browser_session_id_invalid');
      let internal=await repository.internal({ownerId:req.userId,sessionId:id});
      let remote=null;

      if (!['closed','failed','expired'].includes(internal.status)) {
        if (internal.status!=='closing') {
          await repository.transition({ownerId:req.userId,sessionId:id,status:'closing'});
          internal=await repository.internal({ownerId:req.userId,sessionId:id});
        }
        if (internal.provider_session_id) {
          try {
            remote=await browserbase.releaseSession(internal.provider_session_id);
          } catch(error) {
            if (![404,409,410].includes(Number(error?.providerStatus))) throw error;
          }
          try {
            remote=await browserbase.getSession(internal.provider_session_id);
          } catch(error) {
            if (![404,410].includes(Number(error?.providerStatus))) throw error;
          }
        }
      }

      const session=await settleSession(internal,remote);
      return res.json({status:'success',session});
    } catch(error){ return fail(res,error); }
  });

  return router;
}

module.exports={
  createCloudBrowserRouter,
  finalCreditsForSession,
  rejectRawSecrets
};
