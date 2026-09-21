'use strict';

function actionRepoError(code, cause) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function requireDb(db) {
  if (!db || typeof db.from !== 'function' || typeof db.rpc !== 'function') {
    throw actionRepoError('pack087_db_required');
  }
  return db;
}

function unwrapRpc(result, code) {
  if (result && result.error) throw actionRepoError(code, result.error);
  const data = result && result.data;
  if (!data || typeof data !== 'object') throw actionRepoError(code);
  if (data.success === false) throw actionRepoError(String(data.error || code));
  return data;
}

function createSupabaseIpActionRepository(db) {
  requireDb(db);
  return Object.freeze({
    async getSessionForOwner({ ownerId, sessionId }) {
      const result = await db.from('ip_sessions')
        .select('id,owner_id,device_id,state,execution_enabled,revoked_at')
        .eq('id', sessionId)
        .eq('owner_id', ownerId)
        .maybeSingle();
      if (result.error) throw actionRepoError('pack087_session_lookup_failed', result.error);
      if (!result.data) throw actionRepoError('pack087_session_not_found');
      return result.data;
    },

    async listOwnerDevices({ ownerId }) {
      const devicesResult = await db.from('ip_devices')
        .select('id,agent_device_id,display_name,status,paired_at,last_seen_at')
        .eq('owner_id', ownerId)
        .eq('status', 'paired')
        .is('revoked_at', null)
        .order('last_seen_at', { ascending: false });

      if (devicesResult.error) {
        throw actionRepoError('pack087_device_list_failed', devicesResult.error);
      }

      const sessionsResult = await db.from('ip_sessions')
        .select('id,device_id,state,execution_enabled,last_seen_at,token_expires_at,created_at')
        .eq('owner_id', ownerId)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });

      if (sessionsResult.error) {
        throw actionRepoError('pack087_session_list_failed', sessionsResult.error);
      }

      const now = Date.now();
      const sessions = Array.isArray(sessionsResult.data) ? sessionsResult.data : [];
      const devices = (Array.isArray(devicesResult.data) ? devicesResult.data : []).map(device => {
        const session = sessions.find(item =>
          item.device_id === device.id &&
          !['stopped','failed'].includes(String(item.state || '')) &&
          Number.isFinite(Date.parse(item.token_expires_at)) &&
          Date.parse(item.token_expires_at) > now
        ) || null;
        return Object.freeze({ ...device, session });
      });

      return Object.freeze({ devices });
    },

    async getActionForOwner({ ownerId, actionId }) {
      const result = await db.from('ip_actions')
        .select('id,owner_id,session_id,action_type,required_scope,risk,status,action_digest,requires_confirmation,device_action_executed,backup_ref,permission_grant_id,mission_digest')
        .eq('id', actionId)
        .eq('owner_id', ownerId)
        .maybeSingle();
      if (result.error) throw actionRepoError('pack087_action_lookup_failed', result.error);
      if (!result.data) throw actionRepoError('pack087_action_not_found');
      return result.data;
    },

    async grantPermissions(input) {
      return unwrapRpc(await db.rpc('grant_ip_permissions_pack087', {
        p_owner_id: input.ownerId,
        p_session_id: input.sessionId,
        p_scopes: input.scopes,
        p_expires_at: input.expiresAt
      }), 'pack087_permission_grant_failed');
    },

    async grantFullControl(input) {
      return unwrapRpc(await db.rpc('grant_ip_full_control_pack087', {
        p_owner_id: input.ownerId,
        p_session_id: input.sessionId,
        p_mission: input.mission,
        p_mission_digest: input.missionDigest,
        p_expires_at: input.expiresAt
      }), 'pack087_full_control_grant_failed');
    },

    async revokePermissions(input) {
      return unwrapRpc(await db.rpc('revoke_ip_permissions_pack087', {
        p_owner_id: input.ownerId,
        p_session_id: input.sessionId
      }), 'pack087_permission_revoke_failed');
    },

    async prepareAction(input) {
      return unwrapRpc(await db.rpc('prepare_ip_action_pack087', {
        p_owner_id: input.ownerId,
        p_session_id: input.sessionId,
        p_action_type: input.action.type,
        p_required_scope: input.action.scope,
        p_risk: input.action.risk,
        p_action_digest: input.actionDigest,
        p_target: input.action.target,
        p_input_text: input.action.input,
        p_requires_confirmation: input.action.requiresConfirmation,
        p_confirmation_expires_at: input.confirmationExpiresAt
      }), 'pack087_action_prepare_failed');
    },

    async confirmAction(input) {
      return unwrapRpc(await db.rpc('confirm_ip_action_pack087', {
        p_owner_id: input.ownerId,
        p_action_id: input.actionId,
        p_action_digest: input.actionDigest
      }), 'pack087_action_confirm_failed');
    },

    async requestStop(input) {
      return unwrapRpc(await db.rpc('request_ip_stop_pack087', {
        p_owner_id: input.ownerId,
        p_session_id: input.sessionId
      }), 'pack087_stop_request_failed');
    },

    async requestUndo(input) {
      return unwrapRpc(await db.rpc('request_ip_undo_pack087', {
        p_owner_id: input.ownerId,
        p_action_id: input.actionId
      }), 'pack087_undo_request_failed');
    },

    async claimAction({ sessionId }) {
      return unwrapRpc(await db.rpc('claim_ip_action_pack087', {
        p_session_id: sessionId
      }), 'pack087_action_claim_failed');
    },

    async reportAction(input) {
      return unwrapRpc(await db.rpc('report_ip_action_pack087', {
        p_session_id: input.sessionId,
        p_action_id: input.actionId,
        p_attempt_id: input.attemptId,
        p_success: input.success,
        p_result: input.result,
        p_error_code: input.errorCode,
        p_device_action_executed: input.deviceActionExecuted,
        p_backup_ref: input.backupRef,
        p_backup_sha256: input.backupSha256,
        p_secret_redacted: input.secretRedacted
      }), 'pack087_action_report_failed');
    },

    async claimStop({ sessionId }) {
      return unwrapRpc(await db.rpc('claim_ip_stop_pack087', {
        p_session_id: sessionId
      }), 'pack087_stop_claim_failed');
    },

    async ackStop(input) {
      return unwrapRpc(await db.rpc('ack_ip_stop_pack087', {
        p_session_id: input.sessionId,
        p_signal_id: input.signalId
      }), 'pack087_stop_ack_failed');
    },

    async claimUndo({ sessionId }) {
      return unwrapRpc(await db.rpc('claim_ip_undo_pack087', {
        p_session_id: sessionId
      }), 'pack087_undo_claim_failed');
    },

    async reportUndo(input) {
      return unwrapRpc(await db.rpc('report_ip_undo_pack087', {
        p_session_id: input.sessionId,
        p_undo_id: input.undoId,
        p_attempt_id: input.attemptId,
        p_success: input.success,
        p_result: input.result,
        p_error_code: input.errorCode,
        p_device_action_executed: input.deviceActionExecuted,
        p_secret_redacted: input.secretRedacted
      }), 'pack087_undo_report_failed');
    }
  });
}

module.exports = { actionRepoError, createSupabaseIpActionRepository };
