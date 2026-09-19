'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { publicInventory, assertAudioOperationAvailable } = require('./audioOperationRegistry');
const { normalizeAudioRequest } = require('./audioRequestContract');
const { resolveTtsModel } = require('./audioProvider');
const { buildAudioJobSnapshot } = require('./audioJobContract');
const { normalizeVoiceSessionRequest } = require('./voiceSessionContract');
const { createVoiceSessionRepository } = require('./voiceSessionRepository');
const { quoteGeneration } = require('./dynamicPricing');

function statusFor(error) {
  if ([
    'audio_operation_unpriced',
    'audio_operation_disabled',
    'audio_operation_paid_execution_disabled',
    'pricing_unconfigured'
  ].includes(error.code)) return 503;
  return 400;
}

function uuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function createAudioStudioRouter({
  db = null,
  queue = null,
  creditApi = null,
  audioInputResolver = null,
  assetKernel = null,
  env = process.env
} = {}) {
  const router = express.Router();
  const voiceSessions = db ? createVoiceSessionRepository(db) : null;

  router.get('/capabilities', (_req, res) =>
    res.json({ status: 'success', ...publicInventory() })
  );

  router.post('/requests/validate', (req, res) => {
    try {
      return res.json({
        status: 'success',
        request: normalizeAudioRequest(req.body)
      });
    } catch (error) {
      return res.status(statusFor(error)).json({
        status: 'error',
        code: error.code || 'invalid_audio_request',
        message: 'Audio request validation failed.'
      });
    }
  });

  router.post('/jobs/request', async (req, res) => {
    if (
      !db ||
      !queue ||
      !creditApi ||
      typeof creditApi.reserveCredits !== 'function' ||
      typeof creditApi.refundCredits !== 'function' ||
      !audioInputResolver
    ) {
      return res.status(503).json({
        status: 'error',
        code: 'audio_runtime_dependencies_unavailable',
        message: 'Audio execution is not available.'
      });
    }

    let request;
    let operationAvailability;
    try {
      request = normalizeAudioRequest(req.body);
      operationAvailability = assertAudioOperationAvailable(request.operation, { env });
      if (request.operation === 'text_to_speech') resolveTtsModel(request);
    } catch (error) {
      return res.status(statusFor(error)).json({
        status: 'error',
        code: error.code || 'audio_operation_disabled',
        operation: error.operation,
        message: 'Audio provider execution is not enabled.'
      });
    }

    const requestId =
      String(req.headers['idempotency-key'] || '').trim() ||
      crypto.randomUUID();

    const existing = await db
      .from('audio_jobs')
      .select('id,owner_id,request_id,status,stage,progress_percent,reserved_credits,canonical_content_id,canonical_asset_id')
      .eq('owner_id', req.userId)
      .eq('request_id', requestId)
      .maybeSingle();

    if (existing.error) {
      return res.status(500).json({
        status: 'error',
        code: 'audio_job_lookup_failed',
        message: 'Audio job lookup failed.'
      });
    }
    if (existing.data) {
      return res.status(202).json({
        status: 'success',
        replayed: true,
        job: {
          id: existing.data.id,
          requestId,
          status: existing.data.status,
          stage: existing.data.stage,
          progressPercent: Number(existing.data.progress_percent || 0),
          reservedCredits: Number(existing.data.reserved_credits || 0),
          canonicalContentId: existing.data.canonical_content_id || null,
          canonicalAssetId: existing.data.canonical_asset_id || null
        }
      });
    }

    let inspected = {
      source: {
        durationSeconds: null,
        fileSizeBytes: null,
        mimeType: null
      },
      lineage: {}
    };
    if (operationAvailability.requiresSourceAudio === true) {
      try {
        inspected = await audioInputResolver.inspect({
          ownerId: req.userId,
          request
        });
      } catch (error) {
        const code = String(error.code || error.message || '');
        return res.status(code.includes('duration') || code.includes('not_ready') ? 409 : 400).json({
          status: 'error',
          code: code || 'audio_source_preflight_failed',
          message: 'The selected audio source is not ready.'
        });
      }
    }

    let pricing;
    try {
      pricing = quoteGeneration('audio', {
        audioRequest: request,
        audioPricingContext: {
          sourceDurationSeconds: inspected.source.durationSeconds,
          sourceFileSizeBytes: inspected.source.fileSizeBytes,
          sourceMimeType: inspected.source.mimeType,
          speechCharacters: Array.from(String(request.text || '')).length,
          canonicalLineage: inspected.lineage
        },
        env
      });
    } catch (error) {
      return res.status(503).json({
        status: 'error',
        code: error.message || error.code || 'audio_pricing_unavailable',
        message: 'Audio pricing is unavailable.'
      });
    }

    let reservation;
    try {
      reservation = await creditApi.reserveCredits({
        userId: req.userId,
        requestId,
        feature: 'audio',
        modelUsed: pricing.provider,
        creditsConsumed: pricing.credits,
        usageKind:
          request.operation === 'transcription'
            ? 'audio_transcription'
            : request.operation === 'text_to_speech'
              ? 'audio_text_to_speech'
              : 'audio_cleanup',
        pricingVersion: pricing.pricingVersion
      });
    } catch (error) {
      if (error.code === 'insufficient_credits') {
        return res.status(402).json({
          status: 'error',
          code: 'insufficient_credits',
          message: 'Insufficient credits.'
        });
      }
      return res.status(500).json({
        status: 'error',
        code: 'audio_credit_reservation_failed',
        message: 'Audio credits could not be reserved.'
      });
    }

    const jobId = crypto.randomUUID();
    const row = {
      id: jobId,
      owner_id: req.userId,
      conversation_id: request.conversationId,
      request_id: requestId,
      operation: request.operation,
      source_audio_asset_id: request.sourceAudioAssetId,
      options: request,
      status: 'queued',
      stage: 'validating',
      progress_percent: 0,
      pricing_status: 'verified',
      reservation_request_id: requestId,
      reserved_credits: pricing.credits,
      provider: pricing.provider,
      usage: {
        pricingVersion: pricing.pricingVersion,
        quotedProviderCostMicroUsd: pricing.providerCostMicroUsd,
        sourceDurationSeconds: inspected.source.durationSeconds,
        sourceMimeType: inspected.source.mimeType,
        sourceFileSizeBytes: inspected.source.fileSizeBytes,
        speechCharacters: Array.from(String(request.text || '')).length
      }
    };

    const inserted = await db.from('audio_jobs').insert(row);
    if (inserted.error) {
      await creditApi.refundCredits(requestId).catch(() => null);
      return res.status(500).json({
        status: 'error',
        code: 'audio_job_create_failed',
        message: 'Audio job could not be created.'
      });
    }

    try {
      await queue.add('process', {
        jobRowId: jobId,
        requestId,
        userId: req.userId,
        request,
        creditsConsumed: pricing.credits,
        pricingVersion: pricing.pricingVersion,
        quotedProviderCostMicroUsd: pricing.providerCostMicroUsd
      }, {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 500,
        removeOnFail: 1000
      });
    } catch (error) {
      await db.from('audio_jobs').update({
        status: 'failed',
        stage: 'failed',
        error_code: 'audio_queue_failed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', jobId).eq('owner_id', req.userId);
      await creditApi.refundCredits(requestId).catch(() => null);
      return res.status(503).json({
        status: 'error',
        code: 'audio_queue_failed',
        message: 'Audio job could not be queued.'
      });
    }

    return res.status(202).json({
      status: 'success',
      replayed: reservation?.replayed === true,
      job: {
        id: jobId,
        requestId,
        operation: request.operation,
        status: 'queued',
        stage: 'validating',
        progressPercent: 0,
        reservedCredits: pricing.credits,
        provider: pricing.provider
      }
    });
  });

  router.get('/jobs/:jobId', async (req, res) => {
    if (!db) {
      return res.status(503).json({ status: 'error', code: 'audio_runtime_dependencies_unavailable' });
    }
    const jobId = String(req.params.jobId || '').trim();
    if (!uuid(jobId)) {
      return res.status(400).json({ status: 'error', code: 'invalid_audio_job_id' });
    }

    const result = await db
      .from('audio_jobs')
      .select('id,request_id,operation,status,stage,progress_percent,provider,model,usage,result_text,detected_language,error_code,canonical_content_id,canonical_asset_id,created_at,updated_at,completed_at')
      .eq('id', jobId)
      .eq('owner_id', req.userId)
      .maybeSingle();

    if (result.error) return res.status(500).json({ status: 'error', code: 'audio_job_lookup_failed' });
    if (!result.data) return res.status(404).json({ status: 'error', code: 'audio_job_not_found' });

    const completed = result.data.status === 'done';
    let downloadUrl = null;
    if (completed && result.data.canonical_asset_id && assetKernel) {
      try {
        const signed = await assetKernel.createSignedDownload({
          ownerId: req.userId,
          assetId: result.data.canonical_asset_id,
          requestId: 'audio-job:' + jobId + ':download',
          expiresIn: 3600
        });
        downloadUrl = signed.signedUrl;
      } catch (_) {
        downloadUrl = null;
      }
    }

    const segments = completed && result.data.operation === 'transcription'
      ? await db.from('audio_transcript_segments')
          .select('segment_index,start_seconds,end_seconds,speaker,confidence,text,metadata')
          .eq('owner_id', req.userId)
          .eq('job_id', jobId)
          .order('segment_index', { ascending: true })
      : { data: [], error: null };

    return res.json({
      status: 'success',
      job: {
        id: result.data.id,
        requestId: result.data.request_id,
        operation: result.data.operation,
        status: result.data.status,
        stage: result.data.stage,
        progressPercent: Number(result.data.progress_percent || 0),
        provider: result.data.provider,
        model: result.data.model,
        language: completed ? result.data.detected_language : null,
        transcript: completed ? result.data.result_text : null,
        errorCode: result.data.error_code,
        canonicalContentId: completed ? result.data.canonical_content_id : null,
        canonicalAssetId: completed ? result.data.canonical_asset_id : null,
        downloadUrl,
        segments: segments.error ? [] : (segments.data || []),
        usage: result.data.usage || {},
        createdAt: result.data.created_at,
        updatedAt: result.data.updated_at,
        completedAt: result.data.completed_at
      }
    });
  });

  router.post('/jobs/:jobId/cancel', async (req, res) => {
    if (!db || !queue || !creditApi) {
      return res.status(503).json({ status: 'error', code: 'audio_runtime_dependencies_unavailable' });
    }
    const jobId = String(req.params.jobId || '').trim();
    if (!uuid(jobId)) return res.status(400).json({ status: 'error', code: 'invalid_audio_job_id' });

    const before = await db.from('audio_jobs')
      .select('id,reservation_request_id,status,stage')
      .eq('id', jobId).eq('owner_id', req.userId).maybeSingle();
    if (before.error) return res.status(500).json({ status: 'error', code: 'audio_job_lookup_failed' });
    if (!before.data) return res.status(404).json({ status: 'error', code: 'audio_job_not_found' });

    const result = await db.rpc('request_zuvyr_audio_job_cancel', {
      p_owner_id: req.userId,
      p_job_id: jobId
    });
    if (result.error) {
      return res.status(500).json({ status: 'error', code: 'audio_cancel_failed' });
    }
    const state = result.data || {};
    if (state.code === 'audio_cancel_too_late') {
      return res.status(409).json({
        status: 'error',
        code: 'audio_cancel_too_late',
        jobStatus: state.status,
        jobStage: state.stage
      });
    }
    if (state.status === 'cancelled') {
      try {
        const queued = await queue.getJob(jobId);
        if (queued) {
          const queueState = await queued.getState().catch(() => null);
          if (['waiting','delayed','paused'].includes(queueState)) await queued.remove().catch(() => null);
        }
      } catch (_) {}
      if (state.refundRequired === true && before.data.reservation_request_id) {
        await creditApi.refundCredits(before.data.reservation_request_id).catch(async error => {
          if (typeof creditApi.reportRefundFailure === 'function') {
            await creditApi.reportRefundFailure({
              requestId: before.data.reservation_request_id,
              userId: req.userId,
              feature: 'audio',
              error
            }).catch(() => null);
          }
        });
      }
      return res.json({ status: 'cancelled', jobId });
    }
    return res.status(409).json({
      status: 'error',
      code: 'audio_cancel_terminal',
      jobStatus: state.status,
      jobStage: state.stage
    });
  });

  router.post('/voice/sessions/request', async (req, res) => {
    if (!voiceSessions) {
      return res.status(503).json({ status: 'error', code: 'voice_runtime_dependencies_unavailable' });
    }
    try {
      const sessionRequest = normalizeVoiceSessionRequest(req.body);
      assertAudioOperationAvailable('voice_chat', { env });
      const session = await voiceSessions.create({
        ownerId: req.userId,
        conversationId: sessionRequest.conversationId,
        maxSeconds: sessionRequest.maxSeconds,
        retentionMode: sessionRequest.retentionMode
      });
      res.set('Cache-Control','no-store');
      return res.status(201).json({
        status: 'success',
        session: {
          id: session.id,
          state: session.state,
          provider: session.provider,
          transport: session.transport,
          retentionMode: session.retention_mode,
          maxSeconds: session.max_seconds,
          expiresAt: session.expires_at,
          visibleRecordingIndicator: true,
          stopControl: true,
          bargeInEnabled: true,
          autoSpeak: sessionRequest.autoSpeak,
          rawAudioStoredByZuvyr: false
        }
      });
    } catch (error) {
      return res.status(statusFor(error)).json({
        status: 'error',
        code: error.code || 'voice_session_create_failed',
        message: 'Realtime voice session could not be created.'
      });
    }
  });

  router.get('/voice/sessions/:sessionId', async (req, res) => {
    if (!voiceSessions) {
      return res.status(503).json({ status: 'error', code: 'voice_runtime_dependencies_unavailable' });
    }
    try {
      const session = await voiceSessions.get({
        ownerId: req.userId,
        sessionId: req.params.sessionId,
        includeTurns: true
      });
      res.set('Cache-Control','no-store');
      return res.json({ status: 'success', session });
    } catch (error) {
      const code=error.code||'voice_session_lookup_failed';
      return res.status(code==='voice_session_not_found'?404:400).json({ status:'error', code });
    }
  });

  router.post('/voice/sessions/:sessionId/state', async (req, res) => {
    if (!voiceSessions) {
      return res.status(503).json({ status: 'error', code: 'voice_runtime_dependencies_unavailable' });
    }
    try {
      const state = await voiceSessions.transition({
        ownerId: req.userId,
        sessionId: req.params.sessionId,
        state: req.body?.state,
        reason: req.body?.reason
      });
      res.set('Cache-Control','no-store');
      return res.json({ status: 'success', session: state });
    } catch (error) {
      const code=error.code||'voice_session_transition_failed';
      const http=code==='voice_session_not_found'?404:(code==='voice_session_transition_invalid'?409:400);
      return res.status(http).json({ status:'error', code });
    }
  });

  router.post('/voice/sessions/:sessionId/turns', async (req, res) => {
    if (!voiceSessions) {
      return res.status(503).json({ status: 'error', code: 'voice_runtime_dependencies_unavailable' });
    }
    try {
      const result = await voiceSessions.recordTurn({
        ownerId: req.userId,
        sessionId: req.params.sessionId,
        clientTurnId: req.body?.clientTurnId,
        turnIndex: req.body?.turnIndex,
        role: req.body?.role,
        text: req.body?.text,
        interrupted: req.body?.interrupted === true,
        metadata: req.body?.metadata
      });
      res.set('Cache-Control','no-store');
      return res.status(result.replayed===true?200:201).json({ status:'success', turn:result });
    } catch (error) {
      const code=error.code||'voice_turn_record_failed';
      const http=code==='voice_session_not_found'?404:(code.includes('terminal')||code.includes('expired')?409:400);
      return res.status(http).json({ status:'error', code });
    }
  });

  router.post('/voice/sessions/:sessionId/stop', async (req, res) => {
    if (!voiceSessions) {
      return res.status(503).json({ status: 'error', code: 'voice_runtime_dependencies_unavailable' });
    }
    try {
      const state = await voiceSessions.stop({
        ownerId: req.userId,
        sessionId: req.params.sessionId,
        reason: req.body?.reason || 'user_stop'
      });
      res.set('Cache-Control','no-store');
      return res.json({ status:'success', session:state });
    } catch (error) {
      const code=error.code||'voice_session_stop_failed';
      return res.status(code==='voice_session_not_found'?404:400).json({ status:'error', code });
    }
  });

  return router;
}

module.exports = { createAudioStudioRouter };
