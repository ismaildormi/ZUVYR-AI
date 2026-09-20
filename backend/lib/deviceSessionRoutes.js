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
  const invalid = code.includes('_invalid') || code.includes('_required');
  return res.status(unauthorized ? 401 : replay ? 409 : invalid ? 400 : 503).json({
    status: 'error',
    code,
    executionEnabled: false
  });
}

function createDeviceSessionRouter({ db, service } = {}) {
  const router = express.Router();
  const runtime = service || createIpPairingService({
    repository: createSupabaseIpPairingRepository(db)
  });

  router.post('/heartbeat', async (req, res) => {
    try {
      const session = await runtime.authenticateSessionRequest({
        sessionId: req.headers['x-zuvyr-session-id'],
        token: bearer(req),
        counter: req.headers['x-zuvyr-device-counter'],
        signature: req.headers['x-zuvyr-device-signature'],
        method: 'POST',
        path: '/api/device-agent/heartbeat',
        body: req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
      });
      return res.json({
        status: 'success',
        ...session,
        executionEnabled: false
      });
    } catch (error) {
      return sendDeviceError(res, error);
    }
  });

  return router;
}

module.exports = { createDeviceSessionRouter, sendDeviceError };
