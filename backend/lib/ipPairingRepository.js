'use strict';

function repoError(code, cause) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function requireDb(db) {
  if (!db || typeof db.from !== 'function' || typeof db.rpc !== 'function') throw repoError('pack086_db_required');
  return db;
}

function unwrapRpc(result, code) {
  if (result && result.error) throw repoError(code, result.error);
  const data = result && result.data;
  if (!data || typeof data !== 'object') throw repoError(code);
  if (data.success === false) throw repoError(String(data.error || code));
  return data;
}

function createSupabaseIpPairingRepository(db) {
  requireDb(db);
  return Object.freeze({
    async startPairing(input) {
      return unwrapRpc(await db.rpc('start_ip_pairing_pack086', {
        p_owner_id: input.ownerId,
        p_agent_device_id: input.agentDeviceId,
        p_display_name: input.displayName,
        p_public_key_fingerprint: input.fingerprint,
        p_public_key_pem: input.publicKeyPem,
        p_challenge_hash: input.challengeHash,
        p_expires_at: input.expiresAt
      }), 'pack086_start_pairing_failed');
    },

    async getPairingContext({ ownerId, challengeId }) {
      const challengeResult = await db.from('ip_pairing_challenges')
        .select('id,owner_id,device_id,challenge_hash,state,expires_at,consumed_at')
        .eq('id', challengeId)
        .eq('owner_id', ownerId)
        .maybeSingle();
      if (challengeResult.error) throw repoError('pack086_pairing_context_failed', challengeResult.error);
      if (!challengeResult.data) throw repoError('pack086_challenge_not_found');

      const deviceResult = await db.from('ip_devices')
        .select('id,owner_id,agent_device_id,status,public_key_fingerprint,public_key_pem,key_algorithm,revoked_at')
        .eq('id', challengeResult.data.device_id)
        .eq('owner_id', ownerId)
        .maybeSingle();
      if (deviceResult.error) throw repoError('pack086_pairing_device_failed', deviceResult.error);
      if (!deviceResult.data) throw repoError('pack086_device_not_found');
      return { challenge: challengeResult.data, device: deviceResult.data };
    },

    async completePairing(input) {
      return unwrapRpc(await db.rpc('complete_ip_pairing_pack086', {
        p_owner_id: input.ownerId,
        p_challenge_id: input.challengeId,
        p_token_hash: input.tokenHash,
        p_token_expires_at: input.tokenExpiresAt
      }), 'pack086_complete_pairing_failed');
    },

    async rotateSessionToken(input) {
      return unwrapRpc(await db.rpc('rotate_ip_session_token_pack086', {
        p_owner_id: input.ownerId,
        p_session_id: input.sessionId,
        p_token_hash: input.tokenHash,
        p_token_expires_at: input.tokenExpiresAt
      }), 'pack086_rotate_token_failed');
    },

    async revokeDevice(input) {
      return unwrapRpc(await db.rpc('revoke_ip_device_pack086', {
        p_owner_id: input.ownerId,
        p_device_id: input.deviceId
      }), 'pack086_revoke_device_failed');
    },

    async getSessionContext({ sessionId }) {
      const sessionResult = await db.from('ip_sessions')
        .select('id,owner_id,device_id,state,execution_enabled,token_hash,token_expires_at,revoked_at,last_client_counter,permission_scopes')
        .eq('id', sessionId)
        .maybeSingle();
      if (sessionResult.error) throw repoError('pack086_session_context_failed', sessionResult.error);
      if (!sessionResult.data) throw repoError('pack086_session_not_found');

      const deviceResult = await db.from('ip_devices')
        .select('id,owner_id,agent_device_id,status,public_key_fingerprint,public_key_pem,key_algorithm,revoked_at')
        .eq('id', sessionResult.data.device_id)
        .eq('owner_id', sessionResult.data.owner_id)
        .maybeSingle();
      if (deviceResult.error) throw repoError('pack086_session_device_failed', deviceResult.error);
      if (!deviceResult.data) throw repoError('pack086_device_not_found');
      return { session: sessionResult.data, device: deviceResult.data };
    },

    async advanceSessionCounter(input) {
      return unwrapRpc(await db.rpc('advance_ip_session_counter_pack086', {
        p_session_id: input.sessionId,
        p_token_hash: input.tokenHash,
        p_counter: input.counter
      }), 'pack086_heartbeat_failed');
    }
  });
}

module.exports = { repoError, createSupabaseIpPairingRepository };
