'use strict';

function repoError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function rpcCode(error, fallback) {
  const text = String(error?.message || error?.details || error?.hint || '');
  const match = text.match(/pack082_[a-z0-9_]+/i);
  return match ? match[0].toLowerCase() : fallback;
}

function publicRun(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    browserSessionId: row.browser_session_id,
    conversationId: row.conversation_id || null,
    taskRunId: row.task_run_id || null,
    requestId: row.request_id,
    status: row.status,
    goal: row.goal_redacted,
    planVersion: row.plan_version,
    intentFingerprint: row.intent_fingerprint,
    allowedHosts: Array.isArray(row.allowed_hosts) ? row.allowed_hosts : [],
    maxSteps: Number(row.max_steps || 0),
    completedSteps: Number(row.completed_steps || 0),
    currentUrl: row.current_url || null,
    currentHost: row.current_host || null,
    stopRequested: row.stop_requested === true,
    failureCode: row.failure_code || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at || null
  });
}

function publicAction(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    runId: row.run_id,
    browserSessionId: row.browser_session_id,
    sequenceNo: Number(row.sequence_no),
    requestId: row.request_id,
    actionType: row.action_type,
    actionFingerprint: row.action_fingerprint,
    target: row.target && typeof row.target === 'object' ? row.target : {},
    inputSha256: row.input_sha256 || null,
    inputLength: Number.isInteger(Number(row.input_length))
      ? Number(row.input_length)
      : null,
    risk: row.risk,
    permissionAction: row.permission_action || null,
    status: row.status,
    permissionGrantId: row.permission_grant_id || null,
    beforeArtifactId: row.before_artifact_id || null,
    afterArtifactId: row.after_artifact_id || null,
    outcome: row.outcome && typeof row.outcome === 'object' ? row.outcome : {},
    failureCode: row.failure_code || null,
    startedAt: row.started_at || null,
    finishedAt: row.finished_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function createBrowserAgentRepository(db) {
  if (!db || typeof db.rpc !== 'function' || typeof db.from !== 'function') {
    throw repoError('browser_agent_repository_unavailable');
  }

  async function reserveRun(input = {}) {
    const result = await db.rpc('reserve_zuvyr_browser_agent_run_pack082', {
      p_owner_id: input.ownerId,
      p_browser_session_id: input.browserSessionId,
      p_conversation_id: input.conversationId || null,
      p_task_run_id: input.taskRunId || null,
      p_request_id: input.requestId,
      p_goal_redacted: input.goalRedacted,
      p_goal_sha256: input.goalSha256,
      p_plan_version: input.planVersion,
      p_intent_fingerprint: input.intentFingerprint,
      p_allowed_hosts: input.allowedHosts || [],
      p_max_steps: input.maxSteps
    });
    if (result.error) {
      throw repoError(rpcCode(result.error, 'browser_agent_run_reserve_failed'), result.error);
    }
    return getRun({ ownerId: input.ownerId, runId: result.data.run_id });
  }

  async function getRunInternal({ ownerId, runId } = {}) {
    const result = await db
      .from('browser_agent_runs')
      .select('*')
      .eq('id', runId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (result.error) throw repoError('browser_agent_run_lookup_failed', result.error);
    if (!result.data) throw repoError('pack082_run_not_found');
    return result.data;
  }

  async function getRun({ ownerId, runId } = {}) {
    return publicRun(await getRunInternal({ ownerId, runId }));
  }

  async function byRequest({ ownerId, requestId } = {}) {
    const result = await db
      .from('browser_agent_runs')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('request_id', requestId)
      .maybeSingle();
    if (result.error) throw repoError('browser_agent_request_lookup_failed', result.error);
    return publicRun(result.data);
  }

  async function listRuns({ ownerId, browserSessionId = null, limit = 30 } = {}) {
    let query = db
      .from('browser_agent_runs')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(100, Number(limit) || 30)));
    if (browserSessionId) query = query.eq('browser_session_id', browserSessionId);
    const result = await query;
    if (result.error) throw repoError('browser_agent_run_list_failed', result.error);
    return Object.freeze((result.data || []).map(publicRun));
  }

  async function transitionRun({
    ownerId,
    runId,
    status,
    currentUrl = null,
    currentHost = null,
    failureCode = null
  } = {}) {
    const result = await db.rpc('transition_zuvyr_browser_agent_run_pack082', {
      p_owner_id: ownerId,
      p_run_id: runId,
      p_next_status: status,
      p_current_url: currentUrl,
      p_current_host: currentHost,
      p_failure_code: failureCode
    });
    if (result.error) {
      throw repoError(rpcCode(result.error, 'browser_agent_run_transition_failed'), result.error);
    }
    return getRun({ ownerId, runId });
  }

  async function requestStop({
    ownerId,
    runId,
    reason = 'user_requested'
  } = {}) {
    const result = await db.rpc('request_stop_zuvyr_browser_agent_run_pack082', {
      p_owner_id: ownerId,
      p_run_id: runId,
      p_reason: String(reason || 'user_requested').slice(0, 200)
    });
    if (result.error) {
      throw repoError(rpcCode(result.error, 'browser_agent_stop_failed'), result.error);
    }
    return getRun({ ownerId, runId });
  }

  async function reserveAction({
    ownerId,
    runId,
    requestId,
    classified
  } = {}) {
    const result = await db.rpc('reserve_zuvyr_browser_agent_action_pack082', {
      p_owner_id: ownerId,
      p_run_id: runId,
      p_request_id: requestId,
      p_action_type: classified.type,
      p_action_fingerprint: classified.actionFingerprint,
      p_target: classified.persistedTarget || {},
      p_input_sha256: classified.inputSha256,
      p_input_length: classified.inputLength,
      p_input_text_redacted: classified.text,
      p_risk: classified.risk,
      p_permission_action: classified.permissionAction
    });
    if (result.error) {
      throw repoError(rpcCode(result.error, 'browser_agent_action_reserve_failed'), result.error);
    }
    return getAction({ ownerId, actionId: result.data.action_id });
  }

  async function getActionInternal({ ownerId, actionId } = {}) {
    const result = await db
      .from('browser_agent_actions')
      .select('*')
      .eq('id', actionId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (result.error) throw repoError('browser_agent_action_lookup_failed', result.error);
    if (!result.data) throw repoError('pack082_action_not_found');
    return result.data;
  }

  async function getAction({ ownerId, actionId } = {}) {
    return publicAction(await getActionInternal({ ownerId, actionId }));
  }

  async function listActions({ ownerId, runId, limit = 100 } = {}) {
    const result = await db
      .from('browser_agent_actions')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('run_id', runId)
      .order('sequence_no', { ascending: true })
      .limit(Math.max(1, Math.min(200, Number(limit) || 100)));
    if (result.error) throw repoError('browser_agent_action_list_failed', result.error);
    return Object.freeze((result.data || []).map(publicAction));
  }

  async function transitionAction(input = {}) {
    const result = await db.rpc('transition_zuvyr_browser_agent_action_pack082', {
      p_owner_id: input.ownerId,
      p_action_id: input.actionId,
      p_expected_status: input.expectedStatus,
      p_next_status: input.status,
      p_permission_grant_id: input.permissionGrantId || null,
      p_before_artifact_id: input.beforeArtifactId || null,
      p_after_artifact_id: input.afterArtifactId || null,
      p_outcome: input.outcome || {},
      p_failure_code: input.failureCode || null
    });
    if (result.error) {
      throw repoError(rpcCode(result.error, 'browser_agent_action_transition_failed'), result.error);
    }
    return getAction({ ownerId: input.ownerId, actionId: input.actionId });
  }

  async function getReasoning({ ownerId, requestId } = {}) {
    const result = await db
      .from('browser_agent_reasoning_turns')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('request_id', requestId)
      .maybeSingle();
    if (result.error) throw repoError('browser_agent_reasoning_lookup_failed', result.error);
    return result.data || null;
  }

  async function beginReasoning({
    ownerId,
    runId,
    requestId,
    observationSha256
  } = {}) {
    const existing = await getReasoning({ ownerId, requestId });
    if (existing) {
      if (
        existing.run_id !== runId ||
        existing.observation_sha256 !== observationSha256
      ) {
        throw repoError('pack082_reasoning_idempotency_scope_mismatch');
      }
      return Object.freeze({ replayed: true, row: existing });
    }

    const result = await db
      .from('browser_agent_reasoning_turns')
      .insert({
        owner_id: ownerId,
        run_id: runId,
        request_id: requestId,
        observation_sha256: observationSha256,
        status: 'processing',
        decision_summary: {}
      })
      .select('*')
      .single();

    if (result.error) {
      if (String(result.error.code || '') === '23505') {
        const raced = await getReasoning({ ownerId, requestId });
        if (
          raced &&
          raced.run_id === runId &&
          raced.observation_sha256 === observationSha256
        ) {
          return Object.freeze({ replayed: true, row: raced });
        }
        throw repoError('pack082_reasoning_idempotency_scope_mismatch', result.error);
      }
      throw repoError('browser_agent_reasoning_create_failed', result.error);
    }

    return Object.freeze({ replayed: false, row: result.data });
  }

  async function completeReasoning({
    ownerId,
    requestId,
    actionId = null,
    decisionSummary = {},
    model,
    providerCostMicroUsd,
    creditsCharged
  } = {}) {
    const result = await db
      .from('browser_agent_reasoning_turns')
      .update({
        status: 'succeeded',
        action_id: actionId,
        decision_summary: decisionSummary,
        model: String(model || '').slice(0, 200) || null,
        provider_cost_micro_usd: Number(providerCostMicroUsd || 0),
        credits_charged: Number(creditsCharged || 0),
        failure_code: null,
        completed_at: new Date().toISOString()
      })
      .eq('owner_id', ownerId)
      .eq('request_id', requestId)
      .eq('status', 'processing')
      .select('*')
      .maybeSingle();
    if (result.error) throw repoError('browser_agent_reasoning_complete_failed', result.error);
    if (!result.data) {
      const existing = await getReasoning({ ownerId, requestId });
      if (existing?.status === 'succeeded') return existing;
      throw repoError('browser_agent_reasoning_state_conflict');
    }
    return result.data;
  }

  async function failReasoning({
    ownerId,
    requestId,
    failureCode
  } = {}) {
    const result = await db
      .from('browser_agent_reasoning_turns')
      .update({
        status: 'failed',
        failure_code: String(failureCode || 'browser_agent_reasoning_failed').slice(0, 200),
        completed_at: new Date().toISOString()
      })
      .eq('owner_id', ownerId)
      .eq('request_id', requestId)
      .eq('status', 'processing')
      .select('*')
      .maybeSingle();
    if (result.error) throw repoError('browser_agent_reasoning_fail_failed', result.error);
    return result.data || getReasoning({ ownerId, requestId });
  }

  return Object.freeze({
    reserveRun,
    getRun,
    getRunInternal,
    byRequest,
    listRuns,
    transitionRun,
    requestStop,
    reserveAction,
    getAction,
    getActionInternal,
    listActions,
    transitionAction,
    getReasoning,
    beginReasoning,
    completeReasoning,
    failReasoning
  });
}

module.exports = {
  createBrowserAgentRepository,
  publicRun,
  publicAction
};
