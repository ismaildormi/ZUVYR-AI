'use strict';

const express = require('express');
const {
  isConversationId
} = require('./conversationRoutes');
const {
  MAX_ROXIP_COMMAND_CHARS,
  MAX_ROXIP_RESPONSE_CHARS,
  recordRoxIpDemoTurn
} = require('./conversationRoxIp');
const { publicInventory, assertIpExecutionAvailable } = require('./ipCapabilityRegistry');
const { normalizeIpPlan } = require('./ipPlanContract');
const { normalizePermissionGrant } = require('./ipPermissionContract');
const { normalizeIpAction, buildConfirmationChallenge } = require('./ipActionPolicy');
const { inspectIpActionSecurity } = require('./ipSecurityPolicy');
const { buildStopSignal, normalizeUndoReceipt } = require('./ipRecoveryContract');
const { createSupabaseIpPairingRepository } = require('./ipPairingRepository');
const { createIpPairingService } = require('./ipPairingService');
const { createSupabaseIpActionRepository } = require('./ipActionRepository');
const { createIpActionService } = require('./ipActionService');

function sendValidationError(res, code, message) {
  return res.status(400).json({
    status: 'error',
    code,
    message
  });
}

function sendRoxIpError(res, error) {
  const code = String(
    error && (error.code || error.message) || ''
  );

  if (code === 'conversation_not_found') {
    return res.status(404).json({
      status: 'error',
      code,
      message: 'Conversation not found.'
    });
  }

  if (code === 'conversation_feature_mismatch') {
    return res.status(409).json({
      status: 'error',
      code,
      message:
        'This conversation belongs to another Rox service.'
    });
  }

  if (code === 'conversation_message_limit') {
    return res.status(409).json({
      status: 'error',
      code,
      message:
        'This conversation reached 1000 messages. Start a new chat.'
    });
  }

  if (
    code.startsWith('roxip_command_') ||
    code.startsWith('roxip_response_') ||
    code.startsWith('roxip_request_key_')
  ) {
    return res.status(400).json({
      status: 'error',
      code,
      message: 'Invalid Rox IP demo request.'
    });
  }

  console.error(
    '[roxip-api] demo memory save failed:',
    error && error.message ? error.message : error
  );

  return res.status(500).json({
    status: 'error',
    code: 'roxip_memory_save_failed',
    message: 'Rox IP demo history could not be saved.'
  });
}

function createRoxIpRouter({
  recordTurn = recordRoxIpDemoTurn,
  db = null,
  pairingService = null,
  actionService = null
} = {}) {
  const router = express.Router();
  const pairing = pairingService || (
    db
      ? createIpPairingService({ repository: createSupabaseIpPairingRepository(db) })
      : null
  );
  const actions = actionService || (
    db
      ? createIpActionService({ repository: createSupabaseIpActionRepository(db) })
      : null
  );

  const sendPairingError = (res, error) => {
    const code = String(error && (error.code || error.message) || 'pack086_pairing_failed');
    const unauthorized = ['pack086_pairing_signature_invalid','pack086_challenge_mismatch'].includes(code);
    const conflict =
      code.includes('revoked') ||
      code.includes('not_pending') ||
      code.includes('expired') ||
      code.includes('key_mismatch');
    const invalid = code.includes('_invalid') || code.includes('_required');
    return res.status(unauthorized ? 401 : conflict ? 409 : invalid ? 400 : 503).json({
      status: 'error',
      code,
      executionEnabled: false
    });
  };

  router.get('/capabilities', (_req, res) => res.json({ status: 'success', ...publicInventory(), demoOnly: true, deviceActionExecuted: false }));

  router.post('/plans/validate', (req, res) => {
    try { return res.json({ status: 'success', plan: normalizeIpPlan(req.body), demoOnly: true }); }
    catch (error) { return sendValidationError(res, error.code || 'invalid_ip_plan', 'Invalid ZUVYR IP plan.'); }
  });

  router.post('/permissions/validate', (req, res) => {
    try { return res.json({ status: 'success', grant: normalizePermissionGrant(req.body), executionEnabled: false }); }
    catch (error) { return sendValidationError(res, error.code || 'invalid_ip_permission_grant', 'Invalid ZUVYR IP permission grant.'); }
  });

  const sendPack087Error = (res, error) => {
    const code = String(error && (error.code || error.message) || 'pack087_action_error');
    const forbidden = [
      'pack087_wrong_device',
      'pack087_permission_scope_missing',
      'pack087_confirmation_phrase_invalid'
    ].includes(code);
    const conflict =
      code.includes('not_pending') ||
      code.includes('expired') ||
      code.includes('unavailable') ||
      code.includes('not_undoable');
    const invalid = code.includes('_invalid') || code.includes('_required');
    return res.status(forbidden ? 403 : conflict ? 409 : invalid ? 400 : 503).json({
      status: 'error',
      code
    });
  };

  router.post('/permissions/grant', async (req, res) => {
    if (!actions) return res.status(503).json({ status: 'error', code: 'pack087_action_runtime_unavailable' });
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    try {
      const grant = await actions.grantPermissions({
        ownerId: req.userId,
        deviceId: body.deviceId,
        sessionId: body.sessionId,
        scopes: body.scopes,
        expiresAt: body.expiresAt,
        explicitConsent: body.explicitConsent
      });
      return res.status(201).json({ status: 'success', grant });
    } catch (error) {
      return sendPack087Error(res, error);
    }
  });

  router.post('/permissions/revoke', async (req, res) => {
    if (!actions) return res.status(503).json({ status: 'error', code: 'pack087_action_runtime_unavailable' });
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    try {
      const result = await actions.revokePermissions({
        ownerId: req.userId,
        sessionId: body.sessionId
      });
      return res.json({ status: 'success', ...result });
    } catch (error) {
      return sendPack087Error(res, error);
    }
  });

  router.post('/actions/prepare', async (req, res) => {
    if (!actions) return res.status(503).json({ status: 'error', code: 'pack087_action_runtime_unavailable' });
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    try {
      const prepared = await actions.prepareAction({
        ownerId: req.userId,
        sessionId: body.sessionId,
        action: body.action
      });
      return res.status(201).json({ status: 'success', ...prepared });
    } catch (error) {
      return sendPack087Error(res, error);
    }
  });

  router.post('/actions/:actionId/confirm', async (req, res) => {
    if (!actions) return res.status(503).json({ status: 'error', code: 'pack087_action_runtime_unavailable' });
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    try {
      const confirmed = await actions.confirmAction({
        ownerId: req.userId,
        actionId: req.params.actionId,
        actionDigest: body.actionDigest,
        phrase: body.phrase,
        approved: body.approved
      });
      return res.json({ status: 'success', ...confirmed });
    } catch (error) {
      return sendPack087Error(res, error);
    }
  });

  router.post('/stop/request', async (req, res) => {
    if (!actions) return res.status(503).json({ status: 'error', code: 'pack087_action_runtime_unavailable' });
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    try {
      const result = await actions.requestStop({
        ownerId: req.userId,
        sessionId: body.sessionId
      });
      return res.status(202).json({ status: 'success', ...result });
    } catch (error) {
      return sendPack087Error(res, error);
    }
  });

  router.post('/actions/:actionId/undo', async (req, res) => {
    if (!actions) return res.status(503).json({ status: 'error', code: 'pack087_action_runtime_unavailable' });
    try {
      const result = await actions.requestUndo({
        ownerId: req.userId,
        actionId: req.params.actionId
      });
      return res.status(202).json({ status: 'success', ...result });
    } catch (error) {
      return sendPack087Error(res, error);
    }
  });

  router.post('/actions/validate', (req, res) => {
    try {
      const action = normalizeIpAction(req.body);
      return res.json({ status: 'success', action, security: inspectIpActionSecurity(action), executionEnabled: false });
    } catch (error) { return sendValidationError(res, error.code || 'invalid_ip_action', 'Invalid ZUVYR IP action.'); }
  });

  router.post('/confirmations/challenge', (req, res) => {
    try { return res.json({ status: 'success', challenge: buildConfirmationChallenge(req.body), executionEnabled: false }); }
    catch (error) { return sendValidationError(res, error.code || 'invalid_ip_confirmation', 'Confirmation challenge could not be created.'); }
  });

  router.post('/pairing/start', async (req, res) => {
    if (!pairing) return res.status(503).json({ status: 'error', code: 'pack086_pairing_unavailable', executionEnabled: false });
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    try {
      const challenge = await pairing.startPairing({
        ownerId: req.userId,
        agentDeviceId: body.agentDeviceId,
        displayName: body.displayName,
        publicKeyPem: body.publicKeyPem
      });
      return res.status(201).json({ status: 'success', challenge, executionEnabled: false });
    } catch (error) {
      return sendPairingError(res, error);
    }
  });

  router.post('/pairing/complete', async (req, res) => {
    if (!pairing) return res.status(503).json({ status: 'error', code: 'pack086_pairing_unavailable', executionEnabled: false });
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    try {
      const session = await pairing.completePairing({
        ownerId: req.userId,
        challengeId: body.challengeId,
        challenge: body.challenge,
        signature: body.signature
      });
      return res.json({ status: 'success', session, executionEnabled: false });
    } catch (error) {
      return sendPairingError(res, error);
    }
  });

  router.post('/devices/:deviceId/revoke', async (req, res) => {
    if (!pairing) return res.status(503).json({ status: 'error', code: 'pack086_pairing_unavailable', executionEnabled: false });
    try {
      const result = await pairing.revokeDevice({ ownerId: req.userId, deviceId: req.params.deviceId });
      return res.json({ status: 'success', ...result, executionEnabled: false });
    } catch (error) {
      return sendPairingError(res, error);
    }
  });

  router.post('/sessions/:sessionId/token/rotate', async (req, res) => {
    if (!pairing) return res.status(503).json({ status: 'error', code: 'pack086_pairing_unavailable', executionEnabled: false });
    try {
      const session = await pairing.rotateSessionToken({ ownerId: req.userId, sessionId: req.params.sessionId });
      return res.json({ status: 'success', session, executionEnabled: false });
    } catch (error) {
      return sendPairingError(res, error);
    }
  });

  router.post('/execute', (_req, res) => {
    try { assertIpExecutionAvailable(); return res.status(501).json({ status: 'error', code: 'roxip_executor_unavailable' }); }
    catch (error) { return res.status(503).json({ status: 'error', code: error.code || 'roxip_execution_disabled', message: 'ZUVYR IP computer control is not enabled.', deviceActionExecuted: false }); }
  });

  router.post('/stop', (req, res) => {
    try { return res.json({ status: 'success', signal: buildStopSignal(req.body) }); }
    catch (error) { return sendValidationError(res, error.code || 'invalid_ip_stop_session', 'Invalid STOP request.'); }
  });

  router.post('/undo/validate', (req, res) => {
    try { return res.json({ status: 'success', receipt: normalizeUndoReceipt(req.body), executionEnabled: false }); }
    catch (error) { return sendValidationError(res, error.code || 'invalid_ip_undo_receipt', 'Invalid Undo request.'); }
  });

  router.post('/demo-turn', async (req, res) => {
    const body =
      req.body &&
      typeof req.body === 'object' &&
      !Array.isArray(req.body)
        ? req.body
        : {};

    if (!isConversationId(body.conversationId)) {
      return sendValidationError(
        res,
        'invalid_conversation_id',
        'Invalid conversation id.'
      );
    }

    if (!isConversationId(body.turnId)) {
      return sendValidationError(
        res,
        'invalid_turn_id',
        'Invalid turn id.'
      );
    }

    if (
      typeof body.command !== 'string' ||
      !body.command.trim()
    ) {
      return sendValidationError(
        res,
        'invalid_roxip_command',
        'command must be a non-empty string.'
      );
    }

    if (body.command.length > MAX_ROXIP_COMMAND_CHARS) {
      return sendValidationError(
        res,
        'roxip_command_too_long',
        `command exceeds ${MAX_ROXIP_COMMAND_CHARS} characters.`
      );
    }

    if (
      typeof body.responseText !== 'string' ||
      !body.responseText.trim()
    ) {
      return sendValidationError(
        res,
        'invalid_roxip_response',
        'responseText must be a non-empty string.'
      );
    }

    if (
      body.responseText.length >
      MAX_ROXIP_RESPONSE_CHARS
    ) {
      return sendValidationError(
        res,
        'roxip_response_too_long',
        `responseText exceeds ${MAX_ROXIP_RESPONSE_CHARS} characters.`
      );
    }

    try {
      const result = await recordTurn({
        conversationId: body.conversationId,
        ownerId: req.userId,
        command: body.command,
        responseText: body.responseText,
        requestKey: body.turnId
      });

      return res.json({
        status: 'success',
        conversationId: body.conversationId,
        userMessageId: result.userMessage.id,
        assistantMessageId: result.assistantMessage.id,
        demoOnly: true,
        deviceActionExecuted: false
      });
    } catch (error) {
      return sendRoxIpError(res, error);
    }
  });

  return router;
}

module.exports = {
  createRoxIpRouter,
  sendRoxIpError
};
