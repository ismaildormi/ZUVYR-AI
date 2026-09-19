'use strict';

const express = require('express');
const {
  createBrowserAgentController
} = require('./browserAgentController');
const {
  availability: browserRuntimeAvailability
} = require('./cloudBrowserPolicy');
const {
  canonicalPlanIdFromProfile,
  planHasFeature,
  minimumPlanForFeature
} = require('./planEntitlements');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function routeError(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function statusFor(error) {
  const code = String(error?.code || '');
  if (
    code === 'pack082_run_not_found' ||
    code === 'pack082_action_not_found'
  ) return 404;
  if (code === 'browser_agent_requires_plan') return 403;
  if (code === 'insufficient_credits' || code === 'out_of_credits') return 402;
  if (
    code.includes('approval') ||
    code.includes('uncertain') ||
    code.includes('in_progress') ||
    code.includes('idempotency') ||
    code.includes('state_conflict') ||
    code.includes('active_agent_run')
  ) return 409;
  if (
    code.startsWith('cloud_browser_provider_') ||
    code === 'cloud_browser_live_gate_closed' ||
    code === 'cloud_browser_provider_credentials_unavailable' ||
    code === 'cloud_browser_pricing_unverified'
  ) return 503;
  if (
    code.startsWith('cloud_browser_cdp_') ||
    code === 'browser_agent_model_router_unavailable'
  ) return 502;
  return Number(error?.status) || 400;
}

function fail(res, error, fallback = 'browser_agent_request_failed') {
  const code = String(error?.code || fallback);
  return res.status(statusFor(error)).json({
    status: 'error',
    code,
    message: 'Browser Agent request failed.'
  });
}

function requiredUuid(value, code) {
  const text = String(value || '').trim();
  if (!UUID_RE.test(text)) throw routeError(code, 422);
  return text.toLowerCase();
}

function optionalUuid(value, code) {
  if (value == null || value === '') return null;
  return requiredUuid(value, code);
}

function requiredIdempotency(req, prefix = 'browser-agent') {
  const value = String(req.headers['idempotency-key'] || '').trim();
  if (value.length < 8 || value.length > 160) {
    throw routeError('browser_agent_idempotency_key_required', 422);
  }
  return (prefix + ':' + value).slice(0, 200);
}

async function ownerPlan(db, ownerId) {
  const result = await db
    .from('profiles')
    .select('subscription_status')
    .eq('id', ownerId)
    .maybeSingle();
  if (result.error || !result.data) {
    throw routeError('browser_agent_plan_lookup_failed', 503);
  }
  return canonicalPlanIdFromProfile(result.data);
}

function createBrowserAgentRouter({
  db,
  storage,
  creditApi,
  routeRequestImpl = null,
  decisionEngine = null,
  browserProvider = null,
  permissionStore = null,
  WebSocketImpl = null,
  env = process.env
} = {}) {
  if (!db || !storage) {
    throw routeError('browser_agent_dependencies_unavailable', 503);
  }

  const router = express.Router();
  const controller = createBrowserAgentController({
    db,
    storage,
    creditApi,
    routeRequestImpl,
    decisionEngine,
    browserProvider,
    permissionStore,
    WebSocketImpl,
    env
  });

  async function requireIpPlan(ownerId) {
    const planId = await ownerPlan(db, ownerId);
    if (!planHasFeature(planId, 'ip')) {
      const error = routeError('browser_agent_requires_plan', 403);
      error.requiredPlan = minimumPlanForFeature('ip');
      throw error;
    }
    return planId;
  }

  router.get('/capabilities', (_req, res) => {
    const runtime = browserRuntimeAvailability(env);
    res.set('Cache-Control', 'no-store');
    return res.json({
      status: 'success',
      pack: 82,
      capability: 'browser.agent.run',
      planner: 'zuvyr.brain.planner.v1',
      loop: ['plan','observe','act','verify'],
      approvalSystem: 'permission-center',
      globalStop: true,
      runtime: {
        provider: runtime.provider,
        live: runtime.live,
        externalGate: runtime.externalGate,
        blockers: runtime.blockers
      },
      boundaries: {
        passwords: 'user_only',
        otp: 'user_only',
        paymentCards: 'user_only',
        captcha: 'user_only',
        robots: 'respect',
        rawProviderCredentials: false
      }
    });
  });

  router.get('/runs', async (req, res) => {
    try {
      const browserSessionId = req.query?.browserSessionId
        ? requiredUuid(
            req.query.browserSessionId,
            'browser_agent_session_invalid'
          )
        : null;
      const runs = await controller.listRuns({
        ownerId: req.userId,
        browserSessionId,
        limit: req.query?.limit
      });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', runs });
    } catch (error) {
      return fail(res, error);
    }
  });

  router.post('/runs', async (req, res) => {
    try {
      await requireIpPlan(req.userId);
      const requestId = requiredIdempotency(req, 'browser-agent-run');
      const result = await controller.planRun({
        ownerId: req.userId,
        browserSessionId: requiredUuid(
          req.body?.browserSessionId,
          'browser_agent_session_invalid'
        ),
        requestId,
        goal: req.body?.goal,
        conversationId: optionalUuid(
          req.body?.conversationId,
          'browser_agent_conversation_invalid'
        ),
        taskRunId: optionalUuid(
          req.body?.taskRunId,
          'browser_agent_task_run_invalid'
        ),
        maxSteps: req.body?.maxSteps
      });
      res.set('Cache-Control', 'no-store');
      return res.status(201).json({
        status: 'success',
        ...result
      });
    } catch (error) {
      return fail(res, error);
    }
  });

  router.get('/runs/:runId', async (req, res) => {
    try {
      const result = await controller.getRun({
        ownerId: req.userId,
        runId: requiredUuid(
          req.params.runId,
          'browser_agent_run_invalid'
        )
      });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', ...result });
    } catch (error) {
      return fail(res, error);
    }
  });

  router.post('/runs/:runId/advance', async (req, res) => {
    try {
      await requireIpPlan(req.userId);
      const result = await controller.advance({
        ownerId: req.userId,
        runId: requiredUuid(
          req.params.runId,
          'browser_agent_run_invalid'
        ),
        requestId: requiredIdempotency(
          req,
          'browser-agent-advance'
        )
      });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', ...result });
    } catch (error) {
      return fail(res, error);
    }
  });

  router.post(
    '/runs/:runId/actions/:actionId/approve',
    async (req, res) => {
      try {
        await requireIpPlan(req.userId);
        const result = await controller.approveAction({
          ownerId: req.userId,
          runId: requiredUuid(
            req.params.runId,
            'browser_agent_run_invalid'
          ),
          actionId: requiredUuid(
            req.params.actionId,
            'browser_agent_action_invalid'
          )
        });
        res.set('Cache-Control', 'no-store');
        return res.json({ status: 'success', ...result });
      } catch (error) {
        return fail(res, error);
      }
    }
  );

  router.post('/runs/:runId/resume', async (req, res) => {
    try {
      await requireIpPlan(req.userId);
      const result = await controller.resumeHumanBoundary({
        ownerId: req.userId,
        runId: requiredUuid(
          req.params.runId,
          'browser_agent_run_invalid'
        )
      });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', ...result });
    } catch (error) {
      return fail(res, error);
    }
  });

  router.post('/runs/:runId/stop', async (req, res) => {
    try {
      const result = await controller.stopRun({
        ownerId: req.userId,
        runId: requiredUuid(
          req.params.runId,
          'browser_agent_run_invalid'
        )
      });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', ...result });
    } catch (error) {
      return fail(res, error);
    }
  });

  return router;
}

module.exports = {
  createBrowserAgentRouter,
  requiredIdempotency
};
