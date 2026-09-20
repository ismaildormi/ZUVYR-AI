'use strict';

const express = require('express');
const { createSupabaseIpPairingRepository } = require('./ipPairingRepository');
const { createIpPairingService } = require('./ipPairingService');

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
    'pack086_wrong_session'
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

function createDeviceSessionRouter({ db, service, env = process.env } = {}) {
  const router = express.Router();
  const runtime = service || createIpPairingService({
    repository: createSupabaseIpPairingRepository(db)
  });

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
    executionEnabled: false
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

  return router;
}

module.exports = { createDeviceSessionRouter, sendDeviceError };
