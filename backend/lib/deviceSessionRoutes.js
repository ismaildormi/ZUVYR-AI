'use strict';

const express = require('express');
const { createSupabaseIpPairingRepository } = require('./ipPairingRepository');
const { createIpPairingService } = require('./ipPairingService');
const { createSupabaseIpActionRepository } = require('./ipActionRepository');
const { createIpActionService } = require('./ipActionService');

function bearer(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function sendDeviceError(res, error) {
  const code = String(error && (error.code || error.message) || 'pack086_device_session_error');
  const unauthorized = [
    'pack086_token_invalid',
    'pack086_token_expired',
    'pack086_session_signature_invalid',
    'pack086_session_revoked',
    'pack086_device_not_paired',
    'pack086_device_key_mismatch',
    'pack086_wrong_device',
    'pack086_wrong_session',
    'pack086_session_not_found',
    'pack086_device_not_found'
  ].includes(code);
  const replay = code === 'pack086_counter_replay';
  const forbidden = code === 'pack086_session_scope_forbidden';
  const invalid = code.includes('_invalid') || code.includes('_required');
  return res.status(unauthorized ? 401 : forbidden ? 403 : replay ? 409 : invalid ? 400 : 503).json({
    status: 'error',
    code,
    executionEnabled: false
  });
}

function createDeviceSessionRouter({
  db,
  service,
  actionService,
  env = process.env
} = {}) {
  const router = express.Router();
  const runtime = service || createIpPairingService({
    repository: createSupabaseIpPairingRepository(db)
  });
  const actions = actionService || (
    db
      ? createIpActionService({ repository: createSupabaseIpActionRepository(db) })
      : null
  );

  const requestBody = req =>
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : {};

  const httpsRequired = (req, res) => {
    if (String(env.NODE_ENV || '').toLowerCase() === 'production' && req.secure !== true) {
      res.status(426).json({
        status: 'error',
        code: 'pack086_https_required',
        executionEnabled: false
      });
      return true;
    }
    return false;
  };

  const authenticate = (req, route) => runtime.authenticateSessionRequest({
    sessionId: req.headers['x-zuvyr-session-id'],
    token: bearer(req),
    counter: req.headers['x-zuvyr-device-counter'],
    signature: req.headers['x-zuvyr-device-signature'],
    method: 'POST',
    path: route,
    body: requestBody(req)
  });

  const requireScope = (session, scope) => {
    if (!Array.isArray(session.scopes) || !session.scopes.includes(scope)) {
      const error = new Error('pack086_session_scope_forbidden');
      error.code = 'pack086_session_scope_forbidden';
      throw error;
    }
  };

  const publicSession = session => ({
    ownerId: session.ownerId,
    deviceId: session.deviceId,
    sessionId: session.sessionId,
    counter: session.counter,
    tokenExpiresAt: session.tokenExpiresAt,
    scopes: session.scopes,
    heartbeatAt: session.heartbeatAt,
    executionEnabled: session.executionEnabled === true
  });

  router.post('/heartbeat', async (req, res) => {
    if (httpsRequired(req, res)) return;
    try {
      const session = await authenticate(req, '/api/device-agent/heartbeat');
      requireScope(session, 'heartbeat');
      return res.json({ status: 'success', ...publicSession(session) });
    } catch (error) {
      return sendDeviceError(res, error);
    }
  });

  router.post('/status', async (req, res) => {
    if (httpsRequired(req, res)) return;
    try {
      const session = await authenticate(req, '/api/device-agent/status');
      requireScope(session, 'session_status');
      return res.json({ status: 'success', ...publicSession(session) });
    } catch (error) {
      return sendDeviceError(res, error);
    }
  });

  router.post('/rotate-token', async (req, res) => {
    if (httpsRequired(req, res)) return;
    try {
      const session = await authenticate(req, '/api/device-agent/rotate-token');
      requireScope(session, 'session_rotate');
      const rotated = await runtime.rotateSessionToken({
        ownerId: session.ownerId,
        sessionId: session.sessionId,
        expectedTokenHash: session.tokenHash
      });
      return res.json({
        status: 'success',
        ...rotated,
        executionEnabled: false
      });
    } catch (error) {
      return sendDeviceError(res, error);
    }
  });


  const requireActions = res => {
    if (actions) return true;
    res.status(503).json({
      status: 'error',
      code: 'pack087_action_runtime_unavailable',
      executionEnabled: false
    });
    return false;
  };

  const sendActionError = (res, error) => {
    const code = String(error && (error.code || error.message) || 'pack087_device_action_error');
    if (code.startsWith('pack086_')) return sendDeviceError(res, error);
    const forbidden = [
      'pack087_execution_not_enabled',
      'pack087_permission_scope_missing',
      'pack087_permission_expired'
    ].includes(code);
    const conflict =
      code.includes('attempt_mismatch') ||
      code.includes('not_ready') ||
      code.includes('unavailable');
    const invalid = code.includes('_invalid') || code.includes('_required');
    return res.status(forbidden ? 403 : conflict ? 409 : invalid ? 400 : 503).json({
      status: 'error',
      code,
      executionEnabled: false
    });
  };

  router.post('/actions/next', async (req, res) => {
    if (httpsRequired(req, res) || !requireActions(res)) return;
    try {
      const session = await authenticate(req, '/api/device-agent/actions/next');
      const result = await actions.claimAction(session);
      return res.json({
        status: 'success',
        ...result,
        executionEnabled: session.executionEnabled === true
      });
    } catch (error) {
      return sendActionError(res, error);
    }
  });

  router.post('/actions/report', async (req, res) => {
    if (httpsRequired(req, res) || !requireActions(res)) return;
    try {
      const session = await authenticate(req, '/api/device-agent/actions/report');
      const result = await actions.reportAction(session, requestBody(req));
      return res.json({
        status: 'success',
        ...result,
        executionEnabled: session.executionEnabled === true
      });
    } catch (error) {
      return sendActionError(res, error);
    }
  });

  router.post('/stop/next', async (req, res) => {
    if (httpsRequired(req, res) || !requireActions(res)) return;
    try {
      const session = await authenticate(req, '/api/device-agent/stop/next');
      const result = await actions.claimStop(session);
      return res.json({
        status: 'success',
        ...result,
        executionEnabled: session.executionEnabled === true
      });
    } catch (error) {
      return sendActionError(res, error);
    }
  });

  router.post('/stop/ack', async (req, res) => {
    if (httpsRequired(req, res) || !requireActions(res)) return;
    try {
      const session = await authenticate(req, '/api/device-agent/stop/ack');
      const result = await actions.ackStop(session, requestBody(req));
      return res.json({
        status: 'success',
        ...result,
        executionEnabled: session.executionEnabled === true
      });
    } catch (error) {
      return sendActionError(res, error);
    }
  });

  router.post('/undo/next', async (req, res) => {
    if (httpsRequired(req, res) || !requireActions(res)) return;
    try {
      const session = await authenticate(req, '/api/device-agent/undo/next');
      const result = await actions.claimUndo(session);
      return res.json({
        status: 'success',
        ...result,
        executionEnabled: session.executionEnabled === true
      });
    } catch (error) {
      return sendActionError(res, error);
    }
  });

  router.post('/undo/report', async (req, res) => {
    if (httpsRequired(req, res) || !requireActions(res)) return;
    try {
      const session = await authenticate(req, '/api/device-agent/undo/report');
      const result = await actions.reportUndo(session, requestBody(req));
      return res.json({
        status: 'success',
        ...result,
        executionEnabled: session.executionEnabled === true
      });
    } catch (error) {
      return sendActionError(res, error);
    }
  });

  return router;
}

module.exports = { createDeviceSessionRouter, sendDeviceError };
