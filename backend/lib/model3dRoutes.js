'use strict';

const crypto = require('node:crypto');
const express = require('express');
const config = require('../config/model3d-system.v1.json');
const { normalizeModel3dRequest } = require('./model3dRequestContract');
const { model3dAvailability, assertModel3dLiveAvailable } = require('./model3dPolicy');
const { createModel3dInputResolver } = require('./model3dInputResolver');
const { createModel3dGenerationRepository } = require('./model3dGenerationRepository');
const { quoteGeneration } = require('./dynamicPricing');

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function routeError(code, status=400, extra=null) {
  const error=new Error(code);
  error.code=code;
  error.status=status;
  if (extra && typeof extra==='object') Object.assign(error,extra);
  return error;
}

function stableRequestShape(request) {
  return {
    operation:request.operation,
    prompt:request.prompt,
    views:Object.fromEntries(
      config.input.viewRoles
        .filter(role=>request.views[role])
        .map(role=>[role,request.views[role]])
    ),
    options:{
      generateType:request.options.generateType,
      enablePbr:request.options.enablePbr,
      faceCount:request.options.faceCount
    }
  };
}

function requestFingerprint(request) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableRequestShape(request)),'utf8')
    .digest('hex');
}

function publicJob(row) {
  if (!row) return null;
  return Object.freeze({
    jobId:row.id,
    status:row.status,
    stage:row.job_stage||'queued',
    progressPercent:Number(row.progress_percent||0),
    operation:row.model3d_operation,
    prompt:row.prompt||'',
    options:row.model3d_options||{},
    manifest:Array.isArray(row.model3d_output_manifest)
      ? row.model3d_output_manifest
      : [],
    contentId:row.canonical_content_id||null,
    cancelRequested:row.cancel_requested===true,
    error:row.error_message||null,
    createdAt:row.created_at,
    completedAt:row.completed_at||null
  });
}

function createModel3dRouter({
  db,
  storage,
  queue,
  defaultJobOptions,
  reserveCredits,
  refundCredits,
  reportRefundFailure,
  recordRefund,
  env=process.env
}={}) {
  if (!db || !storage || !queue) {
    throw new TypeError('3D router requires database, storage and queue.');
  }
  if (
    typeof reserveCredits!=='function' ||
    typeof refundCredits!=='function'
  ) {
    throw new TypeError('3D router requires credit reservation/refund APIs.');
  }

  const router=express.Router();
  const inputs=createModel3dInputResolver({db,storage});
  const repository=createModel3dGenerationRepository({db,storage});

  async function refund(requestId,userId) {
    try {
      await refundCredits(requestId);
      if (typeof recordRefund==='function') recordRefund('3d');
      return true;
    } catch (error) {
      if (typeof reportRefundFailure==='function') {
        await reportRefundFailure({
          requestId,userId,feature:'3d',error
        }).catch(()=>null);
      }
      return false;
    }
  }

  async function ownedJob(ownerId,jobId) {
    const result=await db.from('generation_jobs')
      .select(
        'id,user_id,feature,status,prompt,job_stage,progress_percent,cancel_requested,'+
        'model3d_operation,model3d_input_views,model3d_options,model3d_output_manifest,'+
        'canonical_content_id,error_message,created_at,completed_at'
      )
      .eq('id',jobId)
      .eq('user_id',ownerId)
      .eq('feature','3d')
      .maybeSingle();
    if (result.error) throw routeError('model3d_job_lookup_failed',500);
    if (!result.data) throw routeError('model3d_job_not_found',404);
    return result.data;
  }

  async function submit(ownerId,body,headers,{retryOf=null}={}) {
    assertModel3dLiveAvailable(env);

    const request=normalizeModel3dRequest({
      prompt:body?.prompt,
      model3dOperation:body?.operation||body?.model3dOperation,
      model3dViews:body?.views||body?.model3dViews,
      model3dOptions:body?.options||body?.model3dOptions
    });

    const requestedId=String(
      headers?.['idempotency-key'] || body?.requestId || ''
    ).trim();
    if (requestedId && !UUID.test(requestedId)) {
      throw routeError('model3d_idempotency_key_invalid');
    }
    const requestId=requestedId||crypto.randomUUID();
    const fingerprint=requestFingerprint(request);

    const existingResult=await db.from('generation_jobs')
      .select('id,user_id,feature,status,model3d_options,created_at')
      .eq('id',requestId)
      .maybeSingle();
    if (existingResult.error) {
      throw routeError('model3d_idempotency_lookup_failed',500);
    }
    if (existingResult.data) {
      if (
        existingResult.data.user_id!==ownerId ||
        existingResult.data.feature!=='3d' ||
        existingResult.data.model3d_options?.requestFingerprint!==fingerprint
      ) {
        throw routeError('model3d_idempotency_scope_mismatch',409);
      }
      return Object.freeze({
        replayed:true,
        jobId:existingResult.data.id,
        status:existingResult.data.status,
        creditsCharged:
          Number(existingResult.data.model3d_options?.pricingSnapshot?.credits||0),
        newBalance:null
      });
    }

    // Validate ownership, cleanliness, MIME, size and dimensions before
    // quoting/reserving. No signed provider URL is issued in this preflight.
    const inspected=
      request.operation==='text_to_3d'
        ? {views:{},lineage:{}}
        : await inputs.inspect({ownerId,request});

    const pricing=quoteGeneration('3d',{
      env,
      model3dRequest:request
    });

    let reservation;
    try {
      reservation=await reserveCredits({
        userId:ownerId,
        requestId,
        feature:'3d',
        modelUsed:config.operations[request.operation].model,
        creditsConsumed:pricing.credits,
        usageKind:'generation',
        pricingVersion:pricing.pricingVersion
      });
    } catch (error) {
      if (error.code==='insufficient_credits') {
        throw routeError('insufficient_credits',402);
      }
      throw routeError('model3d_credit_reservation_failed',500);
    }

    const optionsSnapshot={
      ...request.options,
      requestFingerprint:fingerprint,
      retryOf:retryOf||null,
      pricingSnapshot:{
        credits:pricing.credits,
        providerCostMicroUsd:pricing.providerCostMicroUsd,
        pricingVersion:pricing.pricingVersion,
        revenueMicroUsd:pricing.revenueMicroUsd,
        estimatedNetMarginBps:pricing.estimatedNetMarginBps,
        pricingDecisionMode:pricing.pricingDecisionMode
      },
      inputLineage:inspected.lineage||{}
    };

    const insert=await db.from('generation_jobs').insert([{
      id:requestId,
      user_id:ownerId,
      feature:'3d',
      prompt:request.prompt,
      status:'queued',
      progress_percent:0,
      job_stage:'queued',
      model3d_operation:request.operation,
      model3d_input_views:request.views,
      model3d_options:optionsSnapshot
    }]);

    if (insert.error) {
      // A concurrent idempotent retry may win the insert after our
      // preflight. Never refund that shared request until scope is known.
      if (String(insert.error.code||'')==='23505') {
        const raced=await db.from('generation_jobs')
          .select('id,user_id,feature,status,model3d_options')
          .eq('id',requestId)
          .maybeSingle();
        if (
          raced.data &&
          raced.data.user_id===ownerId &&
          raced.data.feature==='3d' &&
          raced.data.model3d_options?.requestFingerprint===fingerprint
        ) {
          return Object.freeze({
            replayed:true,
            jobId:requestId,
            status:raced.data.status,
            creditsCharged:pricing.credits,
            newBalance:reservation.newBalance
          });
        }
        throw routeError('model3d_idempotency_scope_mismatch',409);
      }

      await refund(requestId,ownerId);
      throw routeError('model3d_job_create_failed',500);
    }

    try {
      await queue.add(
        'generate',
        {
          jobRowId:requestId,
          requestId,
          userId:ownerId,
          request:stableRequestShape(request),
          creditsConsumed:pricing.credits,
          pricingVersion:pricing.pricingVersion,
          quotedProviderCostMicroUsd:pricing.providerCostMicroUsd
        },
        {
          ...defaultJobOptions,
          jobId:requestId
        }
      );
    } catch (error) {
      await db.from('generation_jobs').update({
        status:'failed',
        job_stage:'failed',
        progress_percent:0,
        error_message:'queue_unavailable',
        completed_at:new Date().toISOString()
      }).eq('id',requestId).eq('user_id',ownerId);
      await refund(requestId,ownerId);
      throw routeError('model3d_queue_unavailable',503);
    }

    return Object.freeze({
      replayed:false,
      jobId:requestId,
      status:'queued',
      creditsCharged:pricing.credits,
      providerCostMicroUsd:pricing.providerCostMicroUsd,
      pricingVersion:pricing.pricingVersion,
      newBalance:reservation.newBalance
    });
  }

  router.get('/capabilities',(_req,res)=>{
    const availability=model3dAvailability(env);
    return res.json({
      status:'success',
      pack:83,
      title:config.title,
      live:availability.live,
      externalGate:availability.externalGate,
      blockers:availability.blockers,
      operations:Object.keys(config.operations),
      input:{
        maxViews:config.input.maxViews,
        viewRoles:config.input.viewRoles,
        imageMimeTypes:config.input.imageMimeTypes,
        maxImageBytes:config.input.maxImageBytes,
        minImageDimension:config.input.minImageDimension,
        maxImageDimension:config.input.maxImageDimension
      },
      output:{
        primaryFormat:config.output.primaryFormat,
        supportedExportFormats:config.output.supportedExportFormats
      },
      providerPricing:{
        baseCostMicroUsd:config.pricing.baseCostMicroUsd,
        pbrAddonMicroUsd:config.pricing.pbrAddonMicroUsd,
        multiviewAddonMicroUsd:config.pricing.multiviewAddonMicroUsd,
        customFaceCountAddonMicroUsd:config.pricing.customFaceCountAddonMicroUsd
      }
    });
  });

  router.post('/jobs',async(req,res)=>{
    try {
      const result=await submit(req.userId,req.body,req.headers);
      return res.status(result.replayed?200:202).json({
        status:result.status,
        ...result
      });
    } catch(error) {
      return res.status(Number(error.status)||503).json({
        status:'error',
        code:error.code||'model3d_create_failed',
        message:'3D generation request could not be queued.',
        blockers:error.blockers||undefined
      });
    }
  });

  router.get('/jobs',async(req,res)=>{
    try {
      const jobs=await repository.history({
        ownerId:req.userId,
        limit:req.query?.limit
      });
      return res.json({status:'success',jobs});
    } catch(error) {
      return res.status(Number(error.status)||500).json({
        status:'error',
        code:error.code||'model3d_history_failed'
      });
    }
  });

  router.get('/jobs/:jobId',async(req,res)=>{
    try {
      if (!UUID.test(String(req.params.jobId||''))) {
        throw routeError('model3d_job_id_invalid');
      }
      const row=await ownedJob(req.userId,req.params.jobId);
      return res.json({status:'success',job:publicJob(row)});
    } catch(error) {
      return res.status(Number(error.status)||500).json({
        status:'error',code:error.code||'model3d_job_lookup_failed'
      });
    }
  });

  router.post('/jobs/:jobId/cancel',async(req,res)=>{
    try {
      const jobId=String(req.params.jobId||'').trim();
      if (!UUID.test(jobId)) throw routeError('model3d_job_id_invalid');

      const result=await db.rpc(
        'request_zuvyr_model3d_job_cancel_pack083',
        {p_job_id:jobId,p_owner_id:req.userId}
      );
      if (result.error) {
        const text=String(result.error.message||'');
        if (text.includes('pack083_model3d_job_not_found')) {
          throw routeError('model3d_job_not_found',404);
        }
        throw routeError('model3d_cancel_failed',500);
      }

      const state=result.data&&typeof result.data==='object'?result.data:{};
      if (state.accepted===true || state.status==='cancelled') {
        try {
          const queued=await queue.getJob(jobId);
          if (queued) {
            const queueState=await queued.getState().catch(()=>null);
            if (['waiting','delayed','paused'].includes(queueState)) {
              await queued.remove().catch(()=>null);
            }
          }
        } catch (_) {}

        if (state.refundRequired===true || state.status==='cancelled') {
          const refunded=await refund(jobId,req.userId);
          if (!refunded) {
            return res.status(503).json({
              status:'cancelled',
              code:'model3d_cancel_refund_pending',
              jobId
            });
          }
        }
        return res.json({status:'cancelled',jobId,replayed:state.replayed===true});
      }

      if (state.tooLate===true) {
        return res.status(409).json({
          status:'error',
          code:'model3d_cancel_too_late',
          message:'3D provider execution has already been claimed; the result will be persisted and settled safely.'
        });
      }

      return res.status(409).json({
        status:'error',
        code:'model3d_cancel_terminal',
        jobStatus:state.status||null
      });
    } catch(error) {
      return res.status(Number(error.status)||500).json({
        status:'error',code:error.code||'model3d_cancel_failed'
      });
    }
  });

  router.post('/jobs/:jobId/retry',async(req,res)=>{
    try {
      const jobId=String(req.params.jobId||'').trim();
      if (!UUID.test(jobId)) throw routeError('model3d_job_id_invalid');
      const old=await ownedJob(req.userId,jobId);
      if (!['failed','cancelled'].includes(old.status)) {
        throw routeError('model3d_retry_not_allowed',409);
      }
      const retryBody={
        prompt:old.prompt,
        operation:old.model3d_operation,
        views:old.model3d_input_views||{},
        options:{
          generateType:old.model3d_options?.generateType,
          enablePbr:old.model3d_options?.enablePbr,
          faceCount:old.model3d_options?.faceCount
        }
      };
      const result=await submit(
        req.userId,
        retryBody,
        {},
        {retryOf:jobId}
      );
      return res.status(202).json({status:'queued',...result,retryOf:jobId});
    } catch(error) {
      return res.status(Number(error.status)||503).json({
        status:'error',
        code:error.code||'model3d_retry_failed',
        blockers:error.blockers||undefined
      });
    }
  });

  router.get('/jobs/:jobId/viewer',async(req,res)=>{
    try {
      const jobId=String(req.params.jobId||'').trim();
      if (!UUID.test(jobId)) throw routeError('model3d_job_id_invalid');
      const signed=await repository.signRole({
        ownerId:req.userId,
        jobId,
        role:'model_glb',
        requestId:'model3d-viewer:'+crypto.randomUUID()
      });
      return res.json({status:'success',viewer:signed});
    } catch(error) {
      return res.status(Number(error.status)||500).json({
        status:'error',code:error.code||'model3d_viewer_unavailable'
      });
    }
  });

  router.get('/jobs/:jobId/export/:format',async(req,res)=>{
    try {
      const jobId=String(req.params.jobId||'').trim();
      if (!UUID.test(jobId)) throw routeError('model3d_job_id_invalid');
      const format=String(req.params.format||'').trim().toLowerCase();
      if (!config.output.supportedExportFormats.includes(format)) {
        throw routeError('model3d_export_format_unsupported');
      }
      const role=format==='glb'?'model_glb':'export_'+format;
      const signed=await repository.signRole({
        ownerId:req.userId,
        jobId,
        role,
        requestId:'model3d-export:'+format+':'+crypto.randomUUID()
      });
      return res.json({status:'success',export:signed});
    } catch(error) {
      return res.status(Number(error.status)||500).json({
        status:'error',code:error.code||'model3d_export_unavailable'
      });
    }
  });

  return router;
}

module.exports={
  createModel3dRouter,
  stableRequestShape,
  requestFingerprint,
  publicJob
};
