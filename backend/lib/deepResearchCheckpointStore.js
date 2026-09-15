'use strict';

const crypto = require('crypto');

function storeError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function stable(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stable(value), 'utf8').digest('hex');
}

function researchRunKey({ userId, turnId, conversationId = null, question }) {
  const anchor = `${String(userId)}:${String(conversationId || 'no-conversation')}:${String(turnId || '')}:${String(question || '')}`;
  return `deep-research:${sha256(anchor).slice(0, 64)}`;
}

function initialCheckpoint() {
  return {
    version: 'pack-056.deep-research-checkpoint.v1',
    operations: {},
    lastError: null
  };
}

function sanitizeOperationResult(result) {
  const grounding = result && result.grounding || {};
  const billing = result && result.billing || {};
  return {
    grounding: {
      evidence: String(grounding.evidence || '').slice(0, 6000),
      sources: Array.isArray(grounding.sources) ? grounding.sources.slice(0, 12) : [],
      usage: grounding.usage && typeof grounding.usage === 'object' ? grounding.usage : {},
      model: grounding.model || null,
      provider: grounding.provider || null,
      directUrl: grounding.directUrl || null,
      mode: grounding.mode || null
    },
    billing: {
      requestId: billing.requestId || null,
      creditsCharged: Number(billing.creditsCharged || 0),
      providerCostMicroUsd: String(billing.providerCostMicroUsd || '0'),
      pricingVersion: billing.pricingVersion || null,
      newBalance: billing.newBalance ?? null
    }
  };
}

function createDeepResearchCheckpointStore({ client } = {}) {
  if (!client || typeof client.from !== 'function') throw storeError('research_store_client_required');

  async function getRun({ userId, idempotencyKey }) {
    const { data, error } = await client
      .from('zuvyr_task_runs')
      .select('id,user_id,idempotency_key,plan_version,intent,state,plan,checkpoint,checkpoint_version,final_result,error_code,started_at,created_at,updated_at')
      .eq('user_id', userId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (error) throw storeError('research_run_lookup_failed', { code: error.code || null });
    return data || null;
  }

  async function getRunById({ userId, runId }) {
    const { data, error } = await client
      .from('zuvyr_task_runs')
      .select('id,user_id,idempotency_key,plan_version,intent,state,plan,checkpoint,checkpoint_version,final_result,error_code,started_at,created_at,updated_at')
      .eq('id', runId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) throw storeError('research_run_not_found');
    return data;
  }

  async function createOrGet({ userId, idempotencyKey, question, plan }) {
    const planVersion = sha256(plan);
    let existing = await getRun({ userId, idempotencyKey });
    if (!existing) {
      const { error } = await client.from('zuvyr_task_runs').insert({
        user_id: userId,
        idempotency_key: idempotencyKey,
        plan_version: planVersion,
        intent: String(question || '').slice(0, 1000),
        state: 'pending',
        plan,
        checkpoint: initialCheckpoint(),
        checkpoint_version: 0
      });
      if (error && error.code !== '23505') {
        throw storeError('research_run_create_failed', { code: error.code || null });
      }
      existing = await getRun({ userId, idempotencyKey });
    }
    if (!existing) throw storeError('research_run_create_failed');
    if (existing.plan_version !== planVersion || existing.intent !== String(question || '').slice(0, 1000)) {
      throw storeError('research_run_idempotency_conflict');
    }
    return existing;
  }

  async function writeCheckpoint({ userId, runId, checkpoint, state = 'running', errorCode = null, finalResult = undefined }) {
    const current = await getRunById({ userId, runId });
    const patch = {
      state,
      checkpoint,
      checkpoint_version: Number(current.checkpoint_version || 0) + 1,
      last_checkpoint_at: new Date().toISOString(),
      error_code: errorCode,
      updated_at: new Date().toISOString()
    };
    if (state === 'running' && !current.started_at) patch.started_at = new Date().toISOString();
    if (finalResult !== undefined) patch.final_result = finalResult;
    if (state === 'succeeded') patch.completed_at = new Date().toISOString();
    const { data, error } = await client
      .from('zuvyr_task_runs')
      .update(patch)
      .eq('id', runId)
      .eq('user_id', userId)
      .select('id,state,checkpoint,checkpoint_version,final_result,error_code')
      .single();
    if (error || !data) throw storeError('research_checkpoint_write_failed', { code: error?.code || null });
    return data;
  }

  return Object.freeze({
    createOrGet,
    getRunById,
    async markRunning({ userId, runId }) {
      const run = await getRunById({ userId, runId });
      if (run.state === 'succeeded') return run;
      return writeCheckpoint({
        userId, runId,
        checkpoint: run.checkpoint || initialCheckpoint(),
        state: 'running',
        errorCode: null
      });
    },
    async startOperation({ userId, runId, key, type, input }) {
      const run = await getRunById({ userId, runId });
      const checkpoint = run.checkpoint && typeof run.checkpoint === 'object'
        ? JSON.parse(JSON.stringify(run.checkpoint))
        : initialCheckpoint();
      checkpoint.operations ||= {};
      const existing = checkpoint.operations[key];
      if (existing && existing.status === 'completed' && existing.result) {
        return { completed: true, attempt: existing.attempt || 1, result: existing.result };
      }
      if (existing && existing.status === 'started') {
        return { completed: false, attempt: existing.attempt || 1, resumed: true };
      }
      if (existing && existing.status === 'failed' && Number(existing.attempt || 0) >= 3) {
        throw storeError('research_operation_retry_exhausted', { key });
      }
      const attempt = Number(existing?.attempt || 0) + 1;
      checkpoint.operations[key] = {
        status: 'started', attempt, type,
        input: String(input || '').slice(0, 1600),
        startedAt: new Date().toISOString()
      };
      checkpoint.lastError = null;
      await writeCheckpoint({ userId, runId, checkpoint, state: 'running', errorCode: null });
      return { completed: false, attempt, resumed: false };
    },
    async completeOperation({ userId, runId, key, result }) {
      const run = await getRunById({ userId, runId });
      const checkpoint = run.checkpoint && typeof run.checkpoint === 'object'
        ? JSON.parse(JSON.stringify(run.checkpoint))
        : initialCheckpoint();
      checkpoint.operations ||= {};
      const existing = checkpoint.operations[key];
      if (!existing || existing.status !== 'started') throw storeError('research_operation_not_started');
      checkpoint.operations[key] = {
        ...existing,
        status: 'completed',
        completedAt: new Date().toISOString(),
        result: sanitizeOperationResult(result)
      };
      checkpoint.lastError = null;
      return writeCheckpoint({ userId, runId, checkpoint, state: 'running', errorCode: null });
    },
    async failOperation({ userId, runId, key, errorCode }) {
      const run = await getRunById({ userId, runId });
      const checkpoint = run.checkpoint && typeof run.checkpoint === 'object'
        ? JSON.parse(JSON.stringify(run.checkpoint))
        : initialCheckpoint();
      checkpoint.operations ||= {};
      const existing = checkpoint.operations[key] || { status: 'started', attempt: 1 };
      checkpoint.operations[key] = {
        ...existing,
        status: 'failed',
        failedAt: new Date().toISOString(),
        errorCode: String(errorCode || 'research_operation_failed').slice(0, 180)
      };
      checkpoint.lastError = checkpoint.operations[key].errorCode;
      return writeCheckpoint({
        userId, runId, checkpoint, state: 'running',
        errorCode: checkpoint.lastError
      });
    },
    async completeRun({ userId, runId, result }) {
      const run = await getRunById({ userId, runId });
      return writeCheckpoint({
        userId, runId,
        checkpoint: run.checkpoint || initialCheckpoint(),
        state: 'succeeded',
        errorCode: null,
        finalResult: result
      });
    }
  });
}

module.exports = {
  createDeepResearchCheckpointStore,
  researchRunKey,
  sha256
};
