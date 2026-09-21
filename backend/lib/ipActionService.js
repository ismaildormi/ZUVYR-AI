'use strict';

const crypto = require('node:crypto');
const { config } = require('./ipCapabilityRegistry');
const { normalizeIpAction, actionDigest } = require('./ipActionPolicy');
const { normalizePermissionGrant } = require('./ipPermissionContract');
const { inspectIpActionSecurity } = require('./ipSecurityPolicy');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
const BACKUP_REF = /^backup:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RESULT_BYTES = 16384;
const FULL_CONTROL_MAX_SECONDS = 900;
const FULL_CONTROL_SCOPES = Object.freeze([
  'screen.view',
  'pointer.control',
  'keyboard.type',
  'application.open',
  'clipboard.read',
  'clipboard.write',
  'file.read',
  'file.write',
  'shell.execute'
]);
const REDACTED_KEY = /(password|secret|token|authorization|cookie|credential|private.?key|api.?key)/i;
const REDACTED_VALUE = /(?:Bearer\s+[A-Za-z0-9._~+\/-]{12,}|(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,})/gi;

function actionServiceError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function uuid(value, code) {
  const text = String(value || '').trim().toLowerCase();
  if (!UUID.test(text)) throw actionServiceError(code);
  return text;
}

function normalizeMission(value) {
  const mission = String(value || '').trim();
  if (!mission || mission.length > 4000) {
    throw actionServiceError('pack087_mission_invalid');
  }
  return mission;
}

function missionDigest(value) {
  return crypto.createHash('sha256').update(normalizeMission(value), 'utf8').digest('hex');
}

function normalizeFullControlExpiry(value, now) {
  const expiry = Date.parse(String(value || ''));
  if (!Number.isFinite(expiry) || expiry <= now) {
    throw actionServiceError('pack087_permission_expiry_invalid');
  }
  if (expiry > now + FULL_CONTROL_MAX_SECONDS * 1000) {
    throw actionServiceError('pack087_permission_expiry_too_long');
  }
  return new Date(expiry).toISOString();
}

function cleanErrorCode(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (!/^[a-z0-9_.:-]{1,160}$/i.test(text)) return 'pack087_device_action_failed';
  return text;
}

function redactString(value, state) {
  const input = String(value);
  const output = input.replace(REDACTED_VALUE, () => {
    state.redacted = true;
    return '[REDACTED]';
  });
  return output.length > 8000 ? output.slice(0, 8000) : output;
}

function redactValue(value, state, depth = 0) {
  if (depth > 6) return '[TRUNCATED]';
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return redactString(value, state);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(item => redactValue(item, state, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value).slice(0, 80)) {
      if (REDACTED_KEY.test(key)) {
        out[key] = '[REDACTED]';
        state.redacted = true;
      } else {
        out[key] = redactValue(child, state, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function sanitizeResult(value) {
  const state = { redacted: false };
  let result = redactValue(
    value && typeof value === 'object' && !Array.isArray(value) ? value : {},
    state
  );
  let encoded = JSON.stringify(result);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_RESULT_BYTES) {
    result = {
      truncated: true,
      preview: redactString(encoded.slice(0, 12000), state)
    };
    encoded = JSON.stringify(result);
    if (Buffer.byteLength(encoded, 'utf8') > MAX_RESULT_BYTES) {
      result.preview = result.preview.slice(0, 8000);
    }
  }
  return Object.freeze({ result, secretRedacted: state.redacted });
}

function createIpActionService({ repository, clock = () => new Date() } = {}) {
  if (!repository) throw actionServiceError('pack087_repository_required');

  async function listDevices({ ownerId }) {
    const owner = uuid(ownerId, 'pack087_owner_id_invalid');
    return repository.listOwnerDevices({ ownerId: owner });
  }

  async function grantFullControl({ ownerId, sessionId, mission, expiresAt, explicitConsent }) {
    if (explicitConsent !== true) {
      throw actionServiceError('pack087_full_control_consent_required');
    }
    const owner = uuid(ownerId, 'pack087_owner_id_invalid');
    const session = uuid(sessionId, 'pack087_session_id_invalid');
    const normalizedMission = normalizeMission(mission);
    const normalizedExpiry = normalizeFullControlExpiry(expiresAt, clock().getTime());
    await repository.getSessionForOwner({ ownerId: owner, sessionId: session });
    return repository.grantFullControl({
      ownerId: owner,
      sessionId: session,
      mission: normalizedMission,
      missionDigest: missionDigest(normalizedMission),
      expiresAt: normalizedExpiry,
      scopes: [...FULL_CONTROL_SCOPES]
    });
  }

  async function grantPermissions({ ownerId, deviceId, sessionId, scopes, expiresAt, explicitConsent }) {
    const owner = uuid(ownerId, 'pack087_owner_id_invalid');
    const session = uuid(sessionId, 'pack087_session_id_invalid');
    const device = uuid(deviceId, 'pack087_device_id_invalid');
    const normalized = normalizePermissionGrant({
      deviceId: device,
      sessionId: session,
      scopes,
      explicitConsent,
      expiresAt
    }, { now: clock().getTime() });
    const context = await repository.getSessionForOwner({ ownerId: owner, sessionId: session });
    if (String(context.device_id).toLowerCase() !== device) throw actionServiceError('pack087_wrong_device');
    return repository.grantPermissions({
      ownerId: owner,
      sessionId: session,
      scopes: [...normalized.scopes],
      expiresAt: normalized.expiresAt
    });
  }

  async function revokePermissions({ ownerId, sessionId }) {
    return repository.revokePermissions({
      ownerId: uuid(ownerId, 'pack087_owner_id_invalid'),
      sessionId: uuid(sessionId, 'pack087_session_id_invalid')
    });
  }

  async function prepareAction({ ownerId, sessionId, action: rawAction }) {
    const owner = uuid(ownerId, 'pack087_owner_id_invalid');
    const session = uuid(sessionId, 'pack087_session_id_invalid');
    const action = normalizeIpAction(rawAction);
    inspectIpActionSecurity(action);
    const digest = actionDigest(action);
    const confirmationExpiresAt = action.requiresConfirmation
      ? new Date(clock().getTime() + config.confirmation.challengeSeconds * 1000).toISOString()
      : null;
    const stored = await repository.prepareAction({
      ownerId: owner,
      sessionId: session,
      action,
      actionDigest: digest,
      confirmationExpiresAt
    });
    return Object.freeze({
      actionId: stored.action_id,
      status: stored.status,
      actionDigest: digest,
      confirmation: stored.confirmation_id ? {
        confirmationId: stored.confirmation_id,
        actionDigest: digest,
        phraseRequired: action.risk === 'critical' ? config.confirmation.criticalPhrase : null,
        expiresAt: confirmationExpiresAt,
        singleUse: true
      } : null,
      deviceActionExecuted: false
    });
  }

  async function confirmAction({ ownerId, actionId, actionDigest: digest, phrase, approved }) {
    const owner = uuid(ownerId, 'pack087_owner_id_invalid');
    const actionUuid = uuid(actionId, 'pack087_action_id_invalid');
    if (approved !== true) throw actionServiceError('pack087_confirmation_approval_required');
    const cleanDigest = String(digest || '').trim().toLowerCase();
    if (!HEX64.test(cleanDigest)) throw actionServiceError('pack087_action_digest_invalid');
    const action = await repository.getActionForOwner({ ownerId: owner, actionId: actionUuid });
    if (String(action.action_digest).toLowerCase() !== cleanDigest) {
      throw actionServiceError('pack087_action_digest_mismatch');
    }
    if (action.risk === 'critical' && String(phrase || '') !== config.confirmation.criticalPhrase) {
      throw actionServiceError('pack087_confirmation_phrase_invalid');
    }
    return repository.confirmAction({
      ownerId: owner,
      actionId: actionUuid,
      actionDigest: cleanDigest
    });
  }

  async function requestStop({ ownerId, sessionId }) {
    return repository.requestStop({
      ownerId: uuid(ownerId, 'pack087_owner_id_invalid'),
      sessionId: uuid(sessionId, 'pack087_session_id_invalid')
    });
  }

  async function requestUndo({ ownerId, actionId }) {
    return repository.requestUndo({
      ownerId: uuid(ownerId, 'pack087_owner_id_invalid'),
      actionId: uuid(actionId, 'pack087_action_id_invalid')
    });
  }

  async function claimAction(session) {
    if (!session || session.executionEnabled !== true) throw actionServiceError('pack087_execution_not_enabled');
    return repository.claimAction({ sessionId: uuid(session.sessionId, 'pack087_session_id_invalid') });
  }

  async function reportAction(session, body = {}) {
    if (!session || session.executionEnabled !== true) throw actionServiceError('pack087_execution_not_enabled');
    const sanitized = sanitizeResult(body.result);
    const backupRef = body.backupRef == null ? null : String(body.backupRef).trim().toLowerCase();
    if (backupRef && !BACKUP_REF.test(backupRef)) throw actionServiceError('pack087_backup_ref_invalid');
    const backupSha256 = body.backupSha256 == null ? null : String(body.backupSha256).trim().toLowerCase();
    if (backupSha256 && !HEX64.test(backupSha256)) throw actionServiceError('pack087_backup_sha256_invalid');
    return repository.reportAction({
      sessionId: uuid(session.sessionId, 'pack087_session_id_invalid'),
      actionId: uuid(body.actionId, 'pack087_action_id_invalid'),
      attemptId: uuid(body.attemptId, 'pack087_attempt_id_invalid'),
      success: body.success === true,
      result: sanitized.result,
      errorCode: cleanErrorCode(body.errorCode),
      deviceActionExecuted: body.deviceActionExecuted === true,
      backupRef,
      backupSha256,
      secretRedacted: sanitized.secretRedacted || body.secretRedacted === true
    });
  }

  async function claimStop(session) {
    return repository.claimStop({ sessionId: uuid(session.sessionId, 'pack087_session_id_invalid') });
  }

  async function ackStop(session, body = {}) {
    return repository.ackStop({
      sessionId: uuid(session.sessionId, 'pack087_session_id_invalid'),
      signalId: uuid(body.signalId, 'pack087_stop_signal_id_invalid')
    });
  }

  async function claimUndo(session) {
    if (!session || session.executionEnabled !== true) throw actionServiceError('pack087_execution_not_enabled');
    return repository.claimUndo({ sessionId: uuid(session.sessionId, 'pack087_session_id_invalid') });
  }

  async function reportUndo(session, body = {}) {
    if (!session || session.executionEnabled !== true) throw actionServiceError('pack087_execution_not_enabled');
    const sanitized = sanitizeResult(body.result);
    return repository.reportUndo({
      sessionId: uuid(session.sessionId, 'pack087_session_id_invalid'),
      undoId: uuid(body.undoId, 'pack087_undo_id_invalid'),
      attemptId: uuid(body.attemptId, 'pack087_attempt_id_invalid'),
      success: body.success === true,
      result: sanitized.result,
      errorCode: cleanErrorCode(body.errorCode),
      deviceActionExecuted: body.deviceActionExecuted === true,
      secretRedacted: sanitized.secretRedacted || body.secretRedacted === true
    });
  }

  return Object.freeze({
    listDevices,
    grantFullControl,
    grantPermissions,
    revokePermissions,
    prepareAction,
    confirmAction,
    requestStop,
    requestUndo,
    claimAction,
    reportAction,
    claimStop,
    ackStop,
    claimUndo,
    reportUndo
  });
}

module.exports = {
  MAX_RESULT_BYTES,
  FULL_CONTROL_MAX_SECONDS,
  FULL_CONTROL_SCOPES,
  normalizeMission,
  missionDigest,
  actionServiceError,
  sanitizeResult,
  createIpActionService
};
