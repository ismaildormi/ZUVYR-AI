'use strict';

const express = require('express');
const {
  createAutomationService
} = require('./automationService');

function statusFor(code) {
  const value = String(code || '');
  if (value.includes('NOT_FOUND') || value.includes('not_found')) return 404;
  if (
    value.includes('NOT_ACTIVE') ||
    value.includes('NOT_PAUSED') ||
    value.includes('NOT_PAUSABLE') ||
    value.includes('REACTIVATION') ||
    value.includes('TERMINAL') ||
    value.includes('CONTROL') ||
    value.includes('cancelled_schedule')
  ) return 409;
  if (
    value.includes('INVALID') ||
    value.includes('REQUIRED') ||
    value.includes('FORBIDDEN')
  ) return 400;
  return 500;
}

function failure(res, error) {
  const code = String(error && (error.code || error.message) || 'PACK088_AUTOMATION_REQUEST_FAILED');
  if (statusFor(code) >= 500) {
    console.error('[pack088-automations] request failed:', code);
  }
  return res.status(statusFor(code)).json({
    status: 'error',
    code,
    message: statusFor(code) >= 500
      ? 'Scheduled task operation could not be completed.'
      : 'Scheduled task request could not be applied.'
  });
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function createAutomationRoutes({ client = null, service = null } = {}) {
  const router = express.Router();
  const api = service || createAutomationService({ client });

  router.get('/', async (req, res) => {
    try {
      const items = await api.list({
        ownerId: req.userId,
        limit: numberOr(req.query.limit, 100)
      });
      return res.json({ status: 'success', items });
    } catch (error) {
      return failure(res, error);
    }
  });

  router.post('/', async (req, res) => {
    try {
      const item = await api.create({
        ownerId: req.userId,
        title: req.body?.title,
        goal: req.body?.goal,
        scheduleType: req.body?.scheduleType,
        runAt: req.body?.runAt,
        intervalMinutes: req.body?.intervalMinutes ?? null,
        recurrenceSpec: req.body?.recurrenceSpec || {},
        timezone: req.body?.timezone || 'UTC',
        maxCreditsPerRun: req.body?.maxCreditsPerRun,
        allowTopup: req.body?.allowTopup === true
      });
      return res.status(201).json({
        status: 'success',
        automation: item,
        chargedCredits: 0
      });
    } catch (error) {
      return failure(res, error);
    }
  });

  router.get('/notifications', async (req, res) => {
    try {
      const items = await api.notifications({
        ownerId: req.userId,
        limit: numberOr(req.query.limit, 100)
      });
      return res.json({ status: 'success', items });
    } catch (error) {
      return failure(res, error);
    }
  });

  router.post('/notifications/:notificationId/read', async (req, res) => {
    try {
      const notification = await api.markNotificationRead({
        ownerId: req.userId,
        notificationId: req.params.notificationId
      });
      return res.json({ status: 'success', notification });
    } catch (error) {
      return failure(res, error);
    }
  });

  router.get('/:id/runs', async (req, res) => {
    try {
      const items = await api.runs({
        ownerId: req.userId,
        scheduleId: req.params.id,
        limit: numberOr(req.query.limit, 100)
      });
      return res.json({ status: 'success', items });
    } catch (error) {
      return failure(res, error);
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const item = await api.get({
        ownerId: req.userId,
        scheduleId: req.params.id
      });
      return res.json({ status: 'success', ...item });
    } catch (error) {
      return failure(res, error);
    }
  });

  for (const action of ['activate','pause','resume','cancel']) {
    router.post('/:id/' + action, async (req, res) => {
      try {
        const result = await api[action]({
          ownerId: req.userId,
          scheduleId: req.params.id
        });
        return res.json({ status: 'success', result });
      } catch (error) {
        return failure(res, error);
      }
    });
  }

  router.post('/:id/run-now', async (req, res) => {
    try {
      const result = await api.runNow({
        ownerId: req.userId,
        scheduleId: req.params.id,
        requestToken:
          req.get('Idempotency-Key') ||
          req.body?.requestToken
      });
      return res.status(202).json({ status: 'success', result });
    } catch (error) {
      return failure(res, error);
    }
  });

  return router;
}

function createAutomationRunRoutes({ client = null, service = null } = {}) {
  const router = express.Router();
  const api = service || createAutomationService({ client });

  router.get('/:runId', async (req, res) => {
    try {
      const run = await api.run({
        ownerId: req.userId,
        runId: req.params.runId
      });
      return res.json({ status: 'success', run });
    } catch (error) {
      return failure(res, error);
    }
  });

  return router;
}

module.exports = {
  statusFor,
  createAutomationRoutes,
  createAutomationRunRoutes
};
