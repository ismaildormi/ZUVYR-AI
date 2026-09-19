'use strict';

const crypto = require('node:crypto');
const config = require('../config/owned-model-runtime.v1.json');
const {
  invokeOpenAiCompatible
} = require('./modelLabComputeConnector');
const {
  createOwnedModelRuntimeRepository
} = require('./ownedModelRuntimeRepository');

function runtimeError(code, status = 400, cause = null) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  if (cause) error.cause = cause;
  return error;
}

function envTrue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function liveAvailability(env = process.env) {
  const blockers = [];
  if (!envTrue(env[config.liveGate.env])) {
    blockers.push('pack096_m21_unverified');
  }
  return Object.freeze({
    live: blockers.length === 0,
    externalGate: config.liveGate.externalGate,
    blockers: Object.freeze(blockers)
  });
}

function boundedWorkloadEligible({
  feature,
  messages,
  chatMode = 'chat',
  hasAttachments = false
} = {}) {
  if (feature !== 'chat') return false;
  if (chatMode !== 'chat') return false;
  if (hasAttachments) return false;
  if (!Array.isArray(messages) || messages.length < 1) return false;
  return messages.every(message =>
    ['system','user','assistant','tool'].includes(String(message?.role || '')) &&
    typeof message?.content === 'string'
  );
}

function trafficSelected(deployment, requestId) {
  const bps = Math.max(0, Math.min(10000, Number(deployment?.trafficBps) || 0));
  if (bps <= 0) return false;
  if (bps >= 10000) return true;
  const digest = crypto
    .createHash('sha256')
    .update(String(deployment.id) + ':' + String(requestId || ''), 'utf8')
    .digest('hex');
  const bucket = Number.parseInt(digest.slice(0, 8), 16) % 10000;
  return bucket < bps;
}

function microUsdFromUsd(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 1_000_000);
}

function ownedResult(deployment, providerResult, receipt) {
  return Object.freeze({
    text: providerResult.text,
    model: 'zuvyr/' + deployment.modelAlias,
    provider: 'zuvyr_owned_byoc',
    fallback_triggered: false,
    usage: providerResult.usage || {},
    attempts: Object.freeze([{
      provider: 'zuvyr_owned_byoc',
      model: deployment.modelAlias,
      status: 'success',
      deployment_id: deployment.id,
      checkpoint_id: deployment.checkpointId,
      rollout_stage: deployment.rolloutStage
    }]),
    cost_usd: 0,
    chain_reordered: false,
    billing_scope: Object.freeze({
      owned_model: true,
      api_software_fee_usd: 0,
      owned_model_usage_fee_usd: 0,
      inference_markup_usd: 0,
      credits_charged_for_owned_model: 0,
      customer_compute_billed_directly: true
    }),
    owned_model: Object.freeze({
      deploymentId: deployment.id,
      checkpointId: deployment.checkpointId,
      computeConnectorId: deployment.computeConnectorId,
      rolloutStage: deployment.rolloutStage,
      customerComputeCostMicrousd:
        providerResult.customerComputeCostMicrousd ?? null,
      routeReceiptId: receipt?.receipt_id || null
    })
  });
}

function withOwnedFallback(external, deployment, failureCode) {
  return Object.freeze({
    ...external,
    fallback_triggered: true,
    attempts: Object.freeze([
      {
        provider: 'zuvyr_owned_byoc',
        model: deployment.modelAlias,
        status: 'failed',
        error: failureCode,
        deployment_id: deployment.id,
        checkpoint_id: deployment.checkpointId
      },
      ...(Array.isArray(external.attempts) ? external.attempts : [])
    ]),
    owned_model: Object.freeze({
      deploymentId: deployment.id,
      checkpointId: deployment.checkpointId,
      computeConnectorId: deployment.computeConnectorId,
      rolloutStage: deployment.rolloutStage,
      fallbackReason: failureCode
    })
  });
}

function createOwnedModelRuntime({
  db = null,
  repository: repositoryImpl = null,
  env = process.env,
  externalRoute,
  invokeOwned = invokeOpenAiCompatible,
  logger = console
} = {}) {
  if (!repositoryImpl && !db) {
    throw runtimeError('pack096_db_unavailable', 503);
  }
  if (typeof externalRoute !== 'function') {
    throw runtimeError('pack096_external_fallback_unavailable', 503);
  }
  const repository =
    repositoryImpl || createOwnedModelRuntimeRepository(db);

  async function safeRecord(ownerId, body) {
    try {
      return await repository.recordRoute(ownerId, body);
    } catch (error) {
      logger.error(
        '[owned-model] route receipt failed:',
        String(error?.code || error?.message || error)
      );
      return null;
    }
  }

  async function automaticRollback(ownerId, deployment, reason) {
    if (!config.rollout.automaticRollback) return null;
    try {
      return await repository.rollbackDeployment(
        ownerId,
        deployment.id,
        String(reason || 'owned_model_runtime_failure').slice(0,1000)
      );
    } catch (error) {
      logger.error(
        '[owned-model] automatic rollback failed:',
        deployment.id,
        String(error?.code || error?.message || error)
      );
      return null;
    }
  }

  async function externalWithReceipt({
    ownerId,
    deployment,
    requestId,
    feature,
    messages,
    routerOptions,
    routeMode,
    ownedAttempted,
    ownedSucceeded,
    ownedLatencyMs,
    customerComputeCostMicrousd,
    failureCode,
    fallbackTriggered
  }) {
    const started = Date.now();
    const external = await externalRoute(feature, messages, routerOptions);
    const externalLatencyMs = Date.now() - started;
    const receipt = deployment
      ? await safeRecord(ownerId, {
          deploymentId: deployment.id,
          requestId,
          capability: feature,
          routeMode,
          ownedAttempted,
          ownedSucceeded,
          externalFallbackTriggered: fallbackTriggered,
          ownedLatencyMs,
          externalLatencyMs,
          customerComputeCostMicrousd,
          externalProviderCostMicrousd: microUsdFromUsd(external.cost_usd),
          failureCode,
          usageMetrics: {},
          decisionMetadata: {
            external_model: external.model || null,
            external_provider: external.provider || null,
            payload_content_stored: false
          }
        })
      : null;
    return {
      external,
      receipt
    };
  }

  async function route(feature, messages, options = {}) {
    const ownerId = options.ownerId;
    const requestId = String(options.requestId || options.idempotencyKey || '').trim();
    if (!ownerId || !requestId) {
      return externalRoute(feature, messages, options.routerOptions || options);
    }

    if (!boundedWorkloadEligible({
      feature,
      messages,
      chatMode: options.chatMode,
      hasAttachments: options.hasAttachments
    })) {
      return externalRoute(feature, messages, options.routerOptions || options);
    }

    const deployment = await repository.findActiveDeployment(ownerId, feature);
    if (!deployment) {
      return externalRoute(feature, messages, options.routerOptions || options);
    }

    const routerOptions = options.routerOptions || options;
    const live = liveAvailability(env);
    if (!live.live) {
      const { external, receipt } = await externalWithReceipt({
        ownerId,
        deployment,
        requestId,
        feature,
        messages,
        routerOptions,
        routeMode: 'external_only',
        ownedAttempted: false,
        ownedSucceeded: false,
        ownedLatencyMs: null,
        customerComputeCostMicrousd: null,
        failureCode: live.blockers[0] || 'pack096_m21_unverified',
        fallbackTriggered: false
      });
      return Object.freeze({
        ...external,
        owned_model: Object.freeze({
          deploymentId: deployment.id,
          checkpointId: deployment.checkpointId,
          rolloutStage: deployment.rolloutStage,
          selected: false,
          liveGate: false,
          routeReceiptId: receipt?.receipt_id || null
        })
      });
    }

    const selected = trafficSelected(deployment, requestId);
    if (!selected) {
      const { external, receipt } = await externalWithReceipt({
        ownerId,
        deployment,
        requestId,
        feature,
        messages,
        routerOptions,
        routeMode: 'external_only',
        ownedAttempted: false,
        ownedSucceeded: false,
        ownedLatencyMs: null,
        customerComputeCostMicrousd: null,
        failureCode: null,
        fallbackTriggered: false
      });
      return Object.freeze({
        ...external,
        owned_model: Object.freeze({
          deploymentId: deployment.id,
          checkpointId: deployment.checkpointId,
          rolloutStage: deployment.rolloutStage,
          selected: false,
          routeReceiptId: receipt?.receipt_id || null
        })
      });
    }

    let connectorRuntime;
    try {
      connectorRuntime = await repository.runtimeConnector(
        ownerId,
        deployment.computeConnectorId
      );
      const lastHealthAt = new Date(
        connectorRuntime.connector.last_health_at || 0
      ).getTime();
      if (
        !Number.isFinite(lastHealthAt) ||
        Date.now() - lastHealthAt >
          config.rollout.connectorHealthFreshSeconds * 1000
      ) {
        throw runtimeError('pack096_compute_connector_health_stale', 503);
      }
    } catch (error) {
      await automaticRollback(ownerId, deployment, error.code || error.message);
      const { external, receipt } = await externalWithReceipt({
        ownerId,
        deployment,
        requestId,
        feature,
        messages,
        routerOptions,
        routeMode: 'fallback',
        ownedAttempted: false,
        ownedSucceeded: false,
        ownedLatencyMs: null,
        customerComputeCostMicrousd: null,
        failureCode: error.code || 'pack096_connector_unavailable',
        fallbackTriggered: true
      });
      const result = withOwnedFallback(
        external,
        deployment,
        error.code || 'pack096_connector_unavailable'
      );
      return Object.freeze({
        ...result,
        owned_model: Object.freeze({
          ...result.owned_model,
          routeReceiptId: receipt?.receipt_id || null
        })
      });
    }

    const ownedStarted = Date.now();
    let owned;
    try {
      owned = await invokeOwned({
        endpointUrl: connectorRuntime.connector.endpoint_url,
        credential: connectorRuntime.credential,
        model: deployment.endpointModelId,
        messages,
        maxOutputTokens: config.serving.maxOutputTokens,
        timeoutMs: Math.min(
          deployment.maxLatencyMs,
          config.serving.requestTimeoutMs
        )
      });
    } catch (error) {
      const latency = Date.now() - ownedStarted;
      await automaticRollback(ownerId, deployment, error.code || error.message);
      const { external, receipt } = await externalWithReceipt({
        ownerId,
        deployment,
        requestId,
        feature,
        messages,
        routerOptions,
        routeMode: 'fallback',
        ownedAttempted: true,
        ownedSucceeded: false,
        ownedLatencyMs: latency,
        customerComputeCostMicrousd: null,
        failureCode: error.code || 'pack096_owned_inference_failed',
        fallbackTriggered: true
      });
      const result = withOwnedFallback(
        external,
        deployment,
        error.code || 'pack096_owned_inference_failed'
      );
      return Object.freeze({
        ...result,
        owned_model: Object.freeze({
          ...result.owned_model,
          routeReceiptId: receipt?.receipt_id || null
        })
      });
    }

    const ownedLatencyMs = Number(owned.latencyMs || (Date.now() - ownedStarted));
    if (ownedLatencyMs > deployment.maxLatencyMs) {
      await automaticRollback(ownerId, deployment, 'pack096_owned_latency_gate_failed');
      const { external, receipt } = await externalWithReceipt({
        ownerId,
        deployment,
        requestId,
        feature,
        messages,
        routerOptions,
        routeMode: 'fallback',
        ownedAttempted: true,
        ownedSucceeded: true,
        ownedLatencyMs,
        customerComputeCostMicrousd: owned.customerComputeCostMicrousd,
        failureCode: 'pack096_owned_latency_gate_failed',
        fallbackTriggered: true
      });
      const result = withOwnedFallback(
        external,
        deployment,
        'pack096_owned_latency_gate_failed'
      );
      return Object.freeze({
        ...result,
        owned_model: Object.freeze({
          ...result.owned_model,
          routeReceiptId: receipt?.receipt_id || null
        })
      });
    }

    if (deployment.rolloutStage === 'SHADOW') {
      const { external, receipt } = await externalWithReceipt({
        ownerId,
        deployment,
        requestId,
        feature,
        messages,
        routerOptions,
        routeMode: 'shadow',
        ownedAttempted: true,
        ownedSucceeded: true,
        ownedLatencyMs,
        customerComputeCostMicrousd: owned.customerComputeCostMicrousd,
        failureCode: null,
        fallbackTriggered: false
      });
      return Object.freeze({
        ...external,
        owned_model: Object.freeze({
          deploymentId: deployment.id,
          checkpointId: deployment.checkpointId,
          computeConnectorId: deployment.computeConnectorId,
          rolloutStage: deployment.rolloutStage,
          selected: true,
          shadow: true,
          shadowSucceeded: true,
          shadowLatencyMs: ownedLatencyMs,
          shadowCustomerComputeCostMicrousd:
            owned.customerComputeCostMicrousd ?? null,
          routeReceiptId: receipt?.receipt_id || null
        })
      });
    }

    const receipt = await safeRecord(ownerId, {
      deploymentId: deployment.id,
      requestId,
      capability: feature,
      routeMode: 'owned',
      ownedAttempted: true,
      ownedSucceeded: true,
      externalFallbackTriggered: false,
      ownedLatencyMs,
      externalLatencyMs: null,
      customerComputeCostMicrousd: owned.customerComputeCostMicrousd,
      externalProviderCostMicrousd: null,
      failureCode: null,
      usageMetrics: owned.usage || {},
      decisionMetadata: {
        endpoint_model_id: deployment.endpointModelId,
        payload_content_stored: false,
        zuvyr_owned_model_usage_fee_usd: 0,
        zuvyr_api_software_fee_usd: 0,
        inference_markup_usd: 0
      }
    });

    if (!receipt) {
      const { external } = await externalWithReceipt({
        ownerId,
        deployment,
        requestId: requestId + ':receipt-fallback',
        feature,
        messages,
        routerOptions,
        routeMode: 'fallback',
        ownedAttempted: true,
        ownedSucceeded: true,
        ownedLatencyMs,
        customerComputeCostMicrousd: owned.customerComputeCostMicrousd,
        failureCode: 'pack096_route_receipt_unavailable',
        fallbackTriggered: true
      });
      return withOwnedFallback(
        external,
        deployment,
        'pack096_route_receipt_unavailable'
      );
    }

    return ownedResult(deployment, owned, receipt);
  }

  return Object.freeze({
    route,
    liveAvailability: () => liveAvailability(env),
    boundedWorkloadEligible,
    trafficSelected
  });
}

module.exports = {
  config,
  runtimeError,
  liveAvailability,
  boundedWorkloadEligible,
  trafficSelected,
  microUsdFromUsd,
  ownedResult,
  withOwnedFallback,
  createOwnedModelRuntime
};
