'use strict';

const { createModelLabRepository, labError } = require('./modelLabRepository');

function rpcCode(error, fallback) {
  const text = String(error?.message || error?.details || error?.hint || '');
  const match = text.match(/pack096_[a-z0-9_]+/i);
  return match ? match[0].toLowerCase() : fallback;
}

function publicDeployment(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    ownerId: row.owner_id,
    checkpointId: row.checkpoint_id,
    evaluationId: row.evaluation_id,
    computeConnectorId: row.compute_connector_id,
    modelName: row.model_name,
    modelAlias: row.model_alias,
    endpointModelId: row.endpoint_model_id,
    rolloutStage: row.rollout_stage,
    trafficBps: Number(row.traffic_bps || 0),
    workloadPolicy:
      row.workload_policy && typeof row.workload_policy === 'object'
        ? row.workload_policy
        : {},
    status: row.status,
    externalFallbackRequired: row.external_fallback_required === true,
    customerComputeBilledDirectly: row.customer_compute_billed_directly === true,
    zuvyrPaidGpuRequired: row.zuvyr_paid_gpu_required === true,
    apiSoftwareFeeMicrousd: Number(row.api_software_fee_microusd || 0),
    ownedModelUsageFeeMicrousd: Number(row.owned_model_usage_fee_microusd || 0),
    inferenceMarkupMicrousd: Number(row.inference_markup_microusd || 0),
    minimumTaskSuccessBps:
      row.minimum_task_success_bps == null
        ? null
        : Number(row.minimum_task_success_bps),
    maximumCostPerSuccessfulTaskMicrousd:
      row.maximum_cost_per_successful_task_microusd == null
        ? null
        : Number(row.maximum_cost_per_successful_task_microusd),
    maxLatencyMs: Number(row.max_latency_ms || 30000),
    activatedAt: row.activated_at || null,
    rolledBackAt: row.rolled_back_at || null,
    rollbackReason: row.rollback_reason || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function createOwnedModelRuntimeRepository(client) {
  if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') {
    throw labError('pack096_repository_unavailable', 503);
  }
  const lab = createModelLabRepository(client);

  async function getDeploymentInternal(ownerId, deploymentId) {
    const result = await client
      .from('zuvyr_owned_model_deployments')
      .select('*')
      .eq('id', deploymentId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (result.error) throw labError('pack096_deployment_lookup_failed', 500, result.error);
    if (!result.data) throw labError('pack096_deployment_not_found', 404);
    return result.data;
  }

  async function getDeployment(ownerId, deploymentId) {
    return publicDeployment(await getDeploymentInternal(ownerId, deploymentId));
  }

  async function listDeployments(ownerId) {
    const result = await client
      .from('zuvyr_owned_model_deployments')
      .select('*')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (result.error) throw labError('pack096_deployment_list_failed', 500, result.error);
    return Object.freeze((result.data || []).map(publicDeployment));
  }

  async function findActiveDeployment(ownerId, capability = 'chat') {
    const result = await client
      .from('zuvyr_owned_model_deployments')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('status', 'active')
      .order('activated_at', { ascending: false })
      .limit(20);
    if (result.error) throw labError('pack096_active_deployment_lookup_failed', 500, result.error);

    const rows = (result.data || []).filter(row => {
      const eligible = Array.isArray(row.workload_policy?.eligible_features)
        ? row.workload_policy.eligible_features
        : [];
      return eligible.includes(capability) && row.workload_policy?.low_risk_only === true;
    });

    const rank = { PRIMARY: 4, SECONDARY: 3, CANARY: 2, SHADOW: 1 };
    rows.sort((a,b) =>
      (rank[b.rollout_stage] || 0) - (rank[a.rollout_stage] || 0) ||
      new Date(b.activated_at || b.updated_at).getTime() -
        new Date(a.activated_at || a.updated_at).getTime()
    );
    return rows[0] ? publicDeployment(rows[0]) : null;
  }

  async function registerDeployment(ownerId, body = {}) {
    const result = await client.rpc('register_zuvyr_owned_model_deployment_pack096', {
      p_admin_id: ownerId,
      p_checkpoint_id: body.checkpointId,
      p_evaluation_id: body.evaluationId,
      p_compute_connector_id: body.computeConnectorId,
      p_model_alias: String(body.modelAlias || '').trim(),
      p_endpoint_model_id: String(body.endpointModelId || '').trim(),
      p_rollout_stage: String(body.rolloutStage || '').trim(),
      p_traffic_bps: Number(body.trafficBps || 0),
      p_workload_policy:
        body.workloadPolicy && typeof body.workloadPolicy === 'object' &&
        !Array.isArray(body.workloadPolicy)
          ? body.workloadPolicy
          : { eligible_features: ['chat'], low_risk_only: true },
      p_minimum_task_success_bps:
        body.minimumTaskSuccessBps == null ? null : Number(body.minimumTaskSuccessBps),
      p_maximum_cost_per_successful_task_microusd:
        body.maximumCostPerSuccessfulTaskMicrousd == null
          ? null
          : Number(body.maximumCostPerSuccessfulTaskMicrousd),
      p_max_latency_ms: Number(body.maxLatencyMs || 30000)
    });
    if (result.error) {
      throw labError(rpcCode(result.error,'pack096_deployment_register_failed'),400,result.error);
    }
    return getDeployment(ownerId,result.data.deployment_id);
  }

  async function activateDeployment(ownerId, deploymentId) {
    const result = await client.rpc('activate_zuvyr_owned_model_deployment_pack096', {
      p_admin_id: ownerId,
      p_deployment_id: deploymentId
    });
    if (result.error) {
      throw labError(rpcCode(result.error,'pack096_deployment_activate_failed'),400,result.error);
    }
    return getDeployment(ownerId,deploymentId);
  }

  async function rollbackDeployment(ownerId, deploymentId, reason) {
    const result = await client.rpc('rollback_zuvyr_owned_model_deployment_pack096', {
      p_admin_id: ownerId,
      p_deployment_id: deploymentId,
      p_reason: String(reason || 'owned_model_rollback').slice(0,1000)
    });
    if (result.error) {
      throw labError(rpcCode(result.error,'pack096_deployment_rollback_failed'),400,result.error);
    }
    return getDeployment(ownerId,deploymentId);
  }

  async function runtimeConnector(ownerId, connectorId) {
    const [connector, secret] = await Promise.all([
      lab.getConnectorInternal(ownerId, connectorId),
      lab.getConnectorSecret(ownerId, connectorId)
    ]);
    if (
      connector.connector_kind !== 'openai_compatible_https' ||
      connector.qualification_status !== 'qualified' ||
      connector.health_status !== 'healthy' ||
      !connector.endpoint_url
    ) {
      throw labError('pack096_compute_connector_not_qualified', 503);
    }
    return Object.freeze({
      connector,
      credential: secret ? String(secret) : null
    });
  }

  async function latestAttestation(ownerId, connectorId) {
    const result = await client
      .from('zuvyr_compute_connector_attestations')
      .select('*')
      .eq('owner_id',ownerId)
      .eq('connector_id',connectorId)
      .order('created_at',{ascending:false})
      .limit(1)
      .maybeSingle();
    if (result.error) throw labError('pack096_attestation_lookup_failed',500,result.error);
    return result.data || null;
  }

  async function recordRoute(ownerId, body = {}) {
    const result = await client.rpc('record_zuvyr_owned_model_route_pack096', {
      p_request_owner_id: ownerId,
      p_deployment_id: body.deploymentId || null,
      p_request_id: String(body.requestId || ''),
      p_capability: String(body.capability || 'chat'),
      p_route_mode: String(body.routeMode || 'external_only'),
      p_owned_attempted: body.ownedAttempted === true,
      p_owned_succeeded: body.ownedSucceeded === true,
      p_external_fallback_triggered: body.externalFallbackTriggered === true,
      p_owned_latency_ms: body.ownedLatencyMs == null ? null : Number(body.ownedLatencyMs),
      p_external_latency_ms: body.externalLatencyMs == null ? null : Number(body.externalLatencyMs),
      p_customer_compute_cost_microusd:
        body.customerComputeCostMicrousd == null ? null : Number(body.customerComputeCostMicrousd),
      p_zuvyr_control_plane_cost_microusd:
        body.zuvyrControlPlaneCostMicrousd == null ? 0 : Number(body.zuvyrControlPlaneCostMicrousd),
      p_external_provider_cost_microusd:
        body.externalProviderCostMicrousd == null ? null : Number(body.externalProviderCostMicrousd),
      p_failure_code: body.failureCode || null,
      p_usage_metrics:
        body.usageMetrics && typeof body.usageMetrics === 'object' && !Array.isArray(body.usageMetrics)
          ? body.usageMetrics
          : {},
      p_decision_metadata:
        body.decisionMetadata && typeof body.decisionMetadata === 'object' && !Array.isArray(body.decisionMetadata)
          ? body.decisionMetadata
          : {}
    });
    if (result.error) {
      throw labError(rpcCode(result.error,'pack096_route_receipt_failed'),500,result.error);
    }
    return Object.freeze(result.data);
  }

  async function listRouteReceipts(ownerId, { limit = 100 } = {}) {
    const result = await client
      .from('zuvyr_owned_model_route_receipts')
      .select('id,request_owner_id,deployment_id,request_id,capability,route_mode,rollout_stage,owned_attempted,owned_succeeded,external_fallback_triggered,checkpoint_id,compute_connector_id,model_alias,owned_latency_ms,external_latency_ms,customer_compute_cost_microusd,zuvyr_control_plane_cost_microusd,external_provider_cost_microusd,owned_model_usage_fee_microusd,owned_model_credits_charged,task_success,tool_success,failure_code,usage_metrics,decision_metadata,created_at')
      .eq('request_owner_id',ownerId)
      .order('created_at',{ascending:false})
      .limit(Math.max(1,Math.min(200,Number(limit)||100)));
    if(result.error) throw labError('pack096_route_receipt_list_failed',500,result.error);
    return Object.freeze(result.data || []);
  }

  async function recordTeacherGateway(ownerId, body = {}) {
    const result = await client.rpc('record_zuvyr_teacher_gateway_output_pack096', {
      p_admin_id: ownerId,
      p_teacher_provider: String(body.teacherProvider || '').trim(),
      p_teacher_model: String(body.teacherModel || '').trim(),
      p_teacher_model_version: body.teacherModelVersion ? String(body.teacherModelVersion) : null,
      p_permitted_use: String(body.permittedUse || '').trim(),
      p_contract_or_license_reference: String(body.contractOrLicenseReference || '').trim(),
      p_rights_id: body.rightsId,
      p_source_event_id: body.sourceEventId || null,
      p_domain: body.domain || null,
      p_difficulty: body.difficulty == null ? null : Number(body.difficulty),
      p_quality_score: body.qualityScore == null ? null : Number(body.qualityScore),
      p_learning_value_score: Number(body.learningValueScore || 0),
      p_provider_cost_microusd:
        body.providerCostMicrousd == null ? null : Number(body.providerCostMicrousd),
      p_latency_ms: body.latencyMs == null ? null : Number(body.latencyMs),
      p_tool_success: body.toolSuccess == null ? null : body.toolSuccess === true,
      p_outcome: body.outcome || null,
      p_provenance:
        body.provenance && typeof body.provenance === 'object' && !Array.isArray(body.provenance)
          ? body.provenance
          : {},
      p_provider_system_prompt_collected: false,
      p_provider_weights_collected: false,
      p_customer_private_content_without_rights: false
    });
    if(result.error) {
      throw labError(rpcCode(result.error,'pack096_teacher_gateway_record_failed'),400,result.error);
    }
    return Object.freeze(result.data);
  }

  async function listTeacherGateway(ownerId,{limit=100}={}) {
    const result=await client
      .from('zuvyr_teacher_gateway_records')
      .select('id,teacher_provider,teacher_model,teacher_model_version,permitted_use,contract_or_license_reference,content_id,content_version_id,rights_id,training_candidate_id,source_event_id,provider_cost_microusd,latency_ms,tool_success,outcome,provenance,status,created_at')
      .eq('owner_id',ownerId)
      .order('created_at',{ascending:false})
      .limit(Math.max(1,Math.min(200,Number(limit)||100)));
    if(result.error) throw labError('pack096_teacher_gateway_list_failed',500,result.error);
    return Object.freeze(result.data || []);
  }

  return Object.freeze({
    getDeployment,
    getDeploymentInternal,
    listDeployments,
    findActiveDeployment,
    registerDeployment,
    activateDeployment,
    rollbackDeployment,
    runtimeConnector,
    latestAttestation,
    recordRoute,
    listRouteReceipts,
    recordTeacherGateway,
    listTeacherGateway
  });
}

module.exports = {
  createOwnedModelRuntimeRepository,
  publicDeployment
};
