'use strict';

const CONFIG = require('../config/brain-kernel-checkpoint-d.v1.json');

function usageError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function integer(value, code) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw usageError(code);
  return number;
}

function integerString(value, code) {
  const text = String(value == null ? '' : value).trim();
  if (!/^(0|[1-9]\d*)$/.test(text)) throw usageError(code);
  return text;
}

function rpcResult(name, result) {
  if (!result || typeof result !== 'object') {
    throw usageError('PACK040_USAGE_RPC_RESULT_INVALID', { name });
  }
  if (result.error) {
    throw usageError('PACK040_USAGE_RPC_FAILED', {
      name,
      code: result.error.code || null
    });
  }
  if (!result.data || result.data.success !== true) {
    throw usageError(
      result.data && result.data.error
        ? String(result.data.error)
        : 'PACK040_USAGE_RPC_REJECTED',
      { name }
    );
  }
  return result.data;
}

function createBrainKernelUsage({ client } = {}) {
  if (
    !client ||
    typeof client.rpc !== 'function' ||
    typeof client.from !== 'function'
  ) {
    throw usageError('PACK040_USAGE_CLIENT_REQUIRED');
  }

  return Object.freeze({
    async reserve({
      userId,
      requestId,
      taskIdentity,
      quote,
      modelTool,
      pricingVersion,
      allowTopup = false,
      capability = 'brain.checkpoint_d',
      provider = 'groq',
      usageKind = 'brain_checkpoint_d',
      stepId = 'root',
      projectId = null
    } = {}) {
      const reservedCredits = integer(
        quote && quote.aggregate && quote.aggregate.estimatedCredits,
        'PACK040_RESERVED_CREDITS_INVALID'
      );
      const estimatedCost = integerString(
        quote && quote.aggregate && quote.aggregate.estimatedCostMicroUsd,
        'PACK040_ESTIMATED_COST_INVALID'
      );

      const result = rpcResult(
        CONFIG.usage.reserveRpc,
        await client.rpc(CONFIG.usage.reserveRpc, {
          p_user_id: userId,
          p_request_id: requestId,
          p_idempotency_key: requestId,
          p_capability: String(capability || 'brain.checkpoint_d'),
          p_provider: String(provider || 'groq'),
          p_model_tool: modelTool,
          p_pricing_version: pricingVersion,
          p_reserved_credits: reservedCredits,
          p_estimated_provider_cost_microusd: estimatedCost,
          p_allow_topup: allowTopup === true,
          p_enforcement_enabled: true,
          p_project_id: projectId,
          p_task_id: taskIdentity,
          p_step_id: String(stepId || 'root'),
          p_usage_kind: String(usageKind || 'brain_checkpoint_d')
        })
      );

      const query = await client
        .from(CONFIG.usage.ledger)
        .select('id,request_id,state,reserved_credits')
        .eq('request_id', requestId)
        .maybeSingle();

      if (query.error || !query.data || !Number.isSafeInteger(Number(query.data.id))) {
        throw usageError('PACK040_USAGE_RECORD_LOOKUP_FAILED');
      }

      return Object.freeze({
        requestId,
        usageRecordId: Number(query.data.id),
        reservedCredits,
        replayed: result.replayed === true,
        state: query.data.state
      });
    },

    async settle({
      requestId,
      actualCredits,
      actualProviderCostMicroUsd,
      creditValueMicroUsd,
      providerUsage
    } = {}) {
      const credits = integer(actualCredits, 'PACK040_ACTUAL_CREDITS_INVALID');
      const actualCost = BigInt(integerString(
        actualProviderCostMicroUsd,
        'PACK040_ACTUAL_COST_INVALID'
      ));
      const creditValue = BigInt(integerString(
        creditValueMicroUsd,
        'PACK040_CREDIT_VALUE_INVALID'
      ));

      const revenue = BigInt(credits) * creditValue;
      const profit = revenue - actualCost;
      const margin = revenue > 0n
        ? Number((profit * 10000n) / revenue)
        : 0;

      return rpcResult(
        CONFIG.usage.settleRpc,
        await client.rpc(CONFIG.usage.settleRpc, {
          p_request_id: requestId,
          p_actual_credits: credits,
          p_actual_provider_cost_microusd: actualCost.toString(),
          p_revenue_microusd: revenue.toString(),
          p_gross_profit_microusd: profit.toString(),
          p_gross_margin_bps: margin,
          p_provider_usage: providerUsage || {},
          p_enforcement_enabled: true
        })
      );
    },

    async refund({ requestId } = {}) {
      return rpcResult(
        CONFIG.usage.refundRpc,
        await client.rpc(CONFIG.usage.refundRpc, {
          p_request_id: requestId,
          p_actual_provider_cost_microusd: '0',
          p_enforcement_enabled: true
        })
      );
    }
  });
}

module.exports = {
  CONFIG,
  createBrainKernelUsage
};
