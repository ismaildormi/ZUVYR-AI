'use strict';

const express = require('express');
const definition = require('../config/unified-product.v1.json');
const { buildCrossFeaturePlan, approveCrossFeaturePlan } = require('./crossFeatureOrchestration');
const { createProductionBrainKernelRuntime } = require('./brainKernelRuntime');
let pack040Runtime = null;
function brainKernelRuntime(){
  if (!pack040Runtime) pack040Runtime = createProductionBrainKernelRuntime();
  return pack040Runtime;
}
const { ALLOWED_SCOPES, buildIpToolPlan } = require('./zuvyrIpToolAccess');

function invalid(res, error) {
  return res.status(400).json({ status: 'error', code: error.code || 'invalid_unified_product_request', executionEnabled: false });
}

function createUnifiedProductRouter() {
  const router = express.Router();
  router.get('/catalog', (_req, res) => res.json({
    status: 'success', version: definition.version, identity: definition.identity,
    sections: definition.sections, capabilities: definition.capabilities,
    connections: definition.connections, orchestration: definition.orchestration,
    zuvyrIp: definition.zuvyrIp, ipScopes: [...ALLOWED_SCOPES]
  }));
  router.post('/orchestration/plan', (req, res) => {
    try { return res.json({ status: 'success', plan: buildCrossFeaturePlan(req.body) }); }
    catch (error) { return invalid(res, error); }
  });
  router.post('/orchestration/approve', async (req, res) => {
    try {
      const request =
        req.body && req.body.request
          ? req.body.request
          : null;
      const result =
        await brainKernelRuntime().start({
          userId: req.userId,
          request,
          approved:
            req.body && req.body.approved === true,
          confirmCreditReservation:
            req.body &&
            req.body.confirmCreditReservation === true,
          allowTopup:
            req.body &&
            req.body.allowTopup === true,
          idempotencyKey:
            req.headers['idempotency-key'] ||
            request && request.requestId
        });
      return res.status(202).json({
        status: 'accepted',
        executionEnabled: true,
        ...result
      });
    }
    catch (error) { return invalid(res, error); }
  });
  router.post('/ip/plan', (req, res) => {
    try { return res.json({ status: 'success', plan: buildIpToolPlan(req.body) }); }
    catch (error) { return invalid(res, error); }
  });
  router.get('/orchestration/tasks/:taskRunId', async (req, res) => {
    try {
      const task =
        await brainKernelRuntime().status({
          userId: req.userId,
          taskRunId: req.params.taskRunId
        });
      return res.json({
        status: 'success',
        executionEnabled: true,
        task
      });
    } catch (error) {
      return fail(res, error);
    }
  });

  return router;
}

module.exports = { createUnifiedProductRouter };
