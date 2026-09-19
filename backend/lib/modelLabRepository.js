'use strict';

const config = require('../config/model-lab.v1.json');

function labError(code, status = 400, cause = null) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  if (cause) error.cause = cause;
  return error;
}

function rpcCode(error, fallback) {
  const text = String(error?.message || error?.details || error?.hint || '');
  const match = text.match(/pack095_[a-z0-9_]+/i);
  return match ? match[0].toLowerCase() : fallback;
}

function publicConnector(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    ownershipKind: row.ownership_kind,
    ownershipSubject: row.ownership_subject,
    ownershipEvidenceReference: row.ownership_evidence_reference || null,
    ownershipVerifiedAt: row.ownership_verified_at || null,
    connectorKind: row.connector_kind,
    endpointUrl: row.endpoint_url || null,
    healthPath: row.health_path,
    credentialConfigured: Boolean(row.credential_secret_id),
    capabilityClaims:
      row.capability_claims && typeof row.capability_claims === 'object'
        ? row.capability_claims
        : {},
    attestedCapabilities:
      row.attested_capabilities && typeof row.attested_capabilities === 'object'
        ? row.attested_capabilities
        : {},
    customerComputeCostModel:
      row.customer_compute_cost_model &&
      typeof row.customer_compute_cost_model === 'object'
        ? row.customer_compute_cost_model
        : {},
    zuvyrControlPlaneCostModel:
      row.zuvyr_control_plane_cost_model &&
      typeof row.zuvyr_control_plane_cost_model === 'object'
        ? row.zuvyr_control_plane_cost_model
        : {},
    costKnown: row.cost_known === true,
    healthStatus: row.health_status,
    qualificationStatus: row.qualification_status,
    lastHealthAt: row.last_health_at || null,
    lastHealthLatencyMs:
      row.last_health_latency_ms === null ||
      row.last_health_latency_ms === undefined
        ? null
        : Number(row.last_health_latency_ms),
    lastErrorCode: row.last_error_code || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function publicDataset(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    name: row.name,
    purpose: row.purpose || null,
    status: row.status,
    currentVersionId: row.current_version_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function publicDatasetVersion(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    datasetId: row.dataset_id,
    versionNumber: Number(row.version_number),
    status: row.status,
    datasetSha256: row.dataset_sha256 || null,
    itemCount: Number(row.item_count || 0),
    licenseCount: Number(row.license_count || 0),
    createdAt: row.created_at,
    frozenAt: row.frozen_at || null
  });
}

function createModelLabRepository(client) {
  if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') {
    throw labError('model_lab_repository_unavailable', 503);
  }

  async function summary(ownerId) {
    const tables = [
      ['datasets','zuvyr_model_lab_datasets'],
      ['datasetVersions','zuvyr_model_lab_dataset_versions'],
      ['skills','zuvyr_model_lab_skills'],
      ['curricula','zuvyr_model_lab_curricula'],
      ['connectors','zuvyr_compute_connectors'],
      ['qualifiedConnectors','zuvyr_compute_connectors'],
      ['trainingRuns','zuvyr_model_lab_training_runs'],
      ['checkpoints','zuvyr_model_lab_checkpoints'],
      ['evaluations','zuvyr_model_lab_evaluations'],
      ['benchmarks','zuvyr_model_lab_benchmarks'],
      ['syntheticJobs','zuvyr_model_lab_synthetic_jobs']
    ];

    const results = await Promise.all(
      tables.map(([key, table]) => {
        let query = client
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('owner_id', ownerId);
        if (key === 'qualifiedConnectors') {
          query = query.eq('qualification_status', 'qualified');
        }
        return query.then(result => [key, result]);
      })
    );

    const counts = {};
    for (const [key, result] of results) {
      if (result.error) throw labError('model_lab_summary_lookup_failed', 500, result.error);
      counts[key] = Number(result.count || 0);
    }

    const failureBank = await client
      .from('zuvyr_failure_bank')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open');
    if (failureBank.error) throw labError('model_lab_failure_bank_lookup_failed', 500, failureBank.error);

    const eligibleCandidates = await client
      .from('zuvyr_training_candidates')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'candidate');
    if (eligibleCandidates.error) throw labError('model_lab_candidate_count_failed', 500, eligibleCandidates.error);

    return Object.freeze({
      ...counts,
      openFailurePatterns: Number(failureBank.count || 0),
      candidatePool: Number(eligibleCandidates.count || 0),
      liveTrainingExecutionEnabled: config.training.liveExecutionEnabled === true,
      liveRouterActivationEnabled: config.rollout.liveRouterActivationEnabled === true
    });
  }

  async function listDatasets(ownerId) {
    const result = await client
      .from('zuvyr_model_lab_datasets')
      .select('id,name,purpose,status,current_version_id,created_at,updated_at')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false });
    if (result.error) throw labError('model_lab_dataset_list_failed', 500, result.error);
    return Object.freeze((result.data || []).map(publicDataset));
  }

  async function getDataset(ownerId, datasetId) {
    const dataset = await client
      .from('zuvyr_model_lab_datasets')
      .select('id,name,purpose,status,current_version_id,created_at,updated_at')
      .eq('id', datasetId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (dataset.error) throw labError('model_lab_dataset_lookup_failed', 500, dataset.error);
    if (!dataset.data) throw labError('model_lab_dataset_not_found', 404);

    const versions = await client
      .from('zuvyr_model_lab_dataset_versions')
      .select('id,dataset_id,version_number,status,dataset_sha256,item_count,license_count,created_at,frozen_at')
      .eq('dataset_id', datasetId)
      .eq('owner_id', ownerId)
      .order('version_number', { ascending: false });
    if (versions.error) throw labError('model_lab_dataset_versions_failed', 500, versions.error);

    return Object.freeze({
      ...publicDataset(dataset.data),
      versions: Object.freeze((versions.data || []).map(publicDatasetVersion))
    });
  }

  async function createDataset(ownerId, { name, purpose = null } = {}) {
    const result = await client.rpc('create_zuvyr_model_lab_dataset_pack095', {
      p_admin_id: ownerId,
      p_name: String(name || '').trim(),
      p_purpose: purpose === null ? null : String(purpose || '').trim()
    });
    if (result.error) throw labError(rpcCode(result.error,'model_lab_dataset_create_failed'),400,result.error);
    return getDataset(ownerId, result.data.dataset_id);
  }

  async function addCandidate(ownerId, datasetVersionId, candidateId) {
    const result = await client.rpc('add_zuvyr_model_lab_candidate_pack095', {
      p_admin_id: ownerId,
      p_dataset_version_id: datasetVersionId,
      p_candidate_id: candidateId
    });
    if (result.error) throw labError(rpcCode(result.error,'model_lab_candidate_add_failed'),400,result.error);
    return Object.freeze(result.data);
  }

  async function freezeDatasetVersion(ownerId, datasetVersionId) {
    const result = await client.rpc('freeze_zuvyr_model_lab_dataset_pack095', {
      p_admin_id: ownerId,
      p_dataset_version_id: datasetVersionId
    });
    if (result.error) throw labError(rpcCode(result.error,'model_lab_dataset_freeze_failed'),400,result.error);
    return Object.freeze(result.data);
  }

  async function cloneDatasetVersion(ownerId, datasetId) {
    const result = await client.rpc('clone_zuvyr_model_lab_dataset_version_pack095', {
      p_admin_id: ownerId,
      p_dataset_id: datasetId
    });
    if (result.error) throw labError(rpcCode(result.error,'model_lab_dataset_clone_failed'),400,result.error);
    return getDataset(ownerId, datasetId);
  }

  async function listDatasetItems(ownerId, datasetVersionId) {
    const version = await client
      .from('zuvyr_model_lab_dataset_versions')
      .select('id')
      .eq('id', datasetVersionId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (version.error) throw labError('model_lab_dataset_version_lookup_failed',500,version.error);
    if (!version.data) throw labError('model_lab_dataset_version_not_found',404);

    const result = await client
      .from('zuvyr_model_lab_dataset_items')
      .select('id,candidate_id,content_id,content_version_id,rights_id,consent_version,payload_sha256,dedupe_sha256,domain,difficulty,quality_score,learning_value_score,created_at')
      .eq('dataset_version_id', datasetVersionId)
      .order('created_at', { ascending: true });
    if (result.error) throw labError('model_lab_dataset_items_failed',500,result.error);
    return Object.freeze(result.data || []);
  }

  async function createSkill(ownerId, body = {}) {
    const name = String(body.name || '').trim();
    if (!name || name.length > 120) throw labError('model_lab_skill_name_invalid');
    const result = await client
      .from('zuvyr_model_lab_skills')
      .insert({
        owner_id: ownerId,
        name,
        description: body.description ? String(body.description).slice(0,4000) : null,
        capability: body.capability ? String(body.capability).slice(0,160) : null
      })
      .select('id,name,description,capability,status,created_at,updated_at')
      .single();
    if (result.error) throw labError('model_lab_skill_create_failed',400,result.error);
    return Object.freeze(result.data);
  }

  async function listSkills(ownerId) {
    const result = await client
      .from('zuvyr_model_lab_skills')
      .select('id,name,description,capability,status,created_at,updated_at')
      .eq('owner_id', ownerId)
      .eq('status','active')
      .order('name', { ascending: true });
    if (result.error) throw labError('model_lab_skill_list_failed',500,result.error);
    return Object.freeze(result.data || []);
  }

  async function createCurriculum(ownerId, body = {}) {
    const name = String(body.name || '').trim();
    if (!name || name.length > 160) throw labError('model_lab_curriculum_name_invalid');
    const result = await client
      .from('zuvyr_model_lab_curricula')
      .insert({
        owner_id: ownerId,
        name,
        description: body.description ? String(body.description).slice(0,4000) : null
      })
      .select('id,name,description,status,created_at,updated_at')
      .single();
    if (result.error) throw labError('model_lab_curriculum_create_failed',400,result.error);
    return Object.freeze(result.data);
  }

  async function listCurricula(ownerId) {
    const result = await client
      .from('zuvyr_model_lab_curricula')
      .select('id,name,description,status,created_at,updated_at')
      .eq('owner_id', ownerId)
      .eq('status','active')
      .order('updated_at', { ascending: false });
    if (result.error) throw labError('model_lab_curriculum_list_failed',500,result.error);
    return Object.freeze(result.data || []);
  }

  async function addCurriculumSkill(ownerId, curriculumId, body = {}) {
    const [curriculum, skill, version] = await Promise.all([
      client.from('zuvyr_model_lab_curricula').select('id').eq('id',curriculumId).eq('owner_id',ownerId).eq('status','active').maybeSingle(),
      client.from('zuvyr_model_lab_skills').select('id').eq('id',body.skillId).eq('owner_id',ownerId).eq('status','active').maybeSingle(),
      client.from('zuvyr_model_lab_dataset_versions').select('id,status').eq('id',body.datasetVersionId).eq('owner_id',ownerId).maybeSingle()
    ]);
    for (const result of [curriculum,skill,version]) {
      if (result.error) throw labError('model_lab_curriculum_link_lookup_failed',500,result.error);
    }
    if (!curriculum.data || !skill.data || !version.data || version.data.status !== 'frozen') {
      throw labError('model_lab_curriculum_link_invalid',400);
    }
    const result = await client
      .from('zuvyr_model_lab_curriculum_skills')
      .upsert({
        curriculum_id: curriculumId,
        skill_id: body.skillId,
        dataset_version_id: body.datasetVersionId,
        weight_bps: Math.max(1,Math.min(10000,Number(body.weightBps)||10000)),
        sequence_no: Math.max(1,Number(body.sequenceNo)||1)
      }, { onConflict:'curriculum_id,skill_id,dataset_version_id' })
      .select('*')
      .single();
    if (result.error) throw labError('model_lab_curriculum_link_failed',400,result.error);
    return Object.freeze(result.data);
  }

  async function createConnector(ownerId, body = {}) {
    const result = await client
      .from('zuvyr_compute_connectors')
      .insert({
        owner_id: ownerId,
        ownership_kind: body.ownershipKind,
        ownership_subject: body.ownershipSubject,
        ownership_challenge_hash: body.ownershipChallengeHash,
        ownership_challenge_expires_at: body.ownershipChallengeExpiresAt,
        connector_kind: body.connectorKind,
        endpoint_url: body.endpointUrl,
        health_path: body.healthPath,
        capability_claims: body.capabilityClaims || {},
        customer_compute_cost_model: body.customerComputeCostModel || {},
        zuvyr_control_plane_cost_model: body.zuvyrControlPlaneCostModel || {},
        cost_known: body.costKnown === true,
        created_by: ownerId
      })
      .select('*')
      .single();
    if (result.error) throw labError('model_lab_connector_create_failed',400,result.error);
    return publicConnector(result.data);
  }

  async function getConnectorInternal(ownerId, connectorId) {
    const result = await client
      .from('zuvyr_compute_connectors')
      .select('*')
      .eq('id',connectorId)
      .eq('owner_id',ownerId)
      .maybeSingle();
    if (result.error) throw labError('model_lab_connector_lookup_failed',500,result.error);
    if (!result.data) throw labError('model_lab_connector_not_found',404);
    return result.data;
  }

  async function getConnector(ownerId, connectorId) {
    return publicConnector(await getConnectorInternal(ownerId,connectorId));
  }

  async function listConnectors(ownerId) {
    const result = await client
      .from('zuvyr_compute_connectors')
      .select('*')
      .eq('owner_id',ownerId)
      .order('updated_at',{ascending:false});
    if (result.error) throw labError('model_lab_connector_list_failed',500,result.error);
    return Object.freeze((result.data||[]).map(publicConnector));
  }

  async function setConnectorSecret(ownerId, connectorId, secret) {
    const result = await client.rpc('set_zuvyr_compute_connector_secret_pack095',{
      p_admin_id:ownerId,
      p_connector_id:connectorId,
      p_secret:String(secret||'')
    });
    if (result.error) throw labError(rpcCode(result.error,'model_lab_connector_secret_failed'),400,result.error);
    return getConnector(ownerId,connectorId);
  }

  async function getConnectorSecret(ownerId, connectorId) {
    const result = await client.rpc('get_zuvyr_compute_connector_secret_pack095',{
      p_admin_id:ownerId,
      p_connector_id:connectorId
    });
    if (result.error) throw labError(rpcCode(result.error,'model_lab_connector_secret_read_failed'),500,result.error);
    return result.data || null;
  }

  async function clearConnectorSecret(ownerId, connectorId) {
    const result = await client.rpc('clear_zuvyr_compute_connector_secret_pack095',{
      p_admin_id:ownerId,
      p_connector_id:connectorId
    });
    if (result.error) throw labError(rpcCode(result.error,'model_lab_connector_secret_clear_failed'),400,result.error);
    return getConnector(ownerId,connectorId);
  }

  async function markOwnershipVerified(ownerId, connectorId, evidenceReference) {
    const result = await client
      .from('zuvyr_compute_connectors')
      .update({
        ownership_verified_at:new Date().toISOString(),
        ownership_evidence_reference:String(evidenceReference||'').slice(0,1200)||null,
        qualification_status:'ownership_verified',
        updated_at:new Date().toISOString()
      })
      .eq('id',connectorId)
      .eq('owner_id',ownerId)
      .select('*')
      .maybeSingle();
    if (result.error) throw labError('model_lab_connector_ownership_update_failed',500,result.error);
    if (!result.data) throw labError('model_lab_connector_not_found',404);
    return publicConnector(result.data);
  }

  async function recordAttestation(ownerId, connectorId, attestation) {
    const connector = await getConnectorInternal(ownerId,connectorId);
    const qualified =
      connector.ownership_verified_at &&
      attestation.healthStatus === 'healthy' &&
      attestation.capabilities &&
      Object.keys(attestation.capabilities).length > 0;

    const inserted = await client
      .from('zuvyr_compute_connector_attestations')
      .insert({
        connector_id:connectorId,
        owner_id:ownerId,
        health_status:attestation.healthStatus,
        latency_ms:attestation.latencyMs,
        http_status:attestation.httpStatus,
        capabilities:attestation.capabilities||{},
        measurement:attestation.measurement||{},
        customer_compute_cost_microusd:attestation.customerComputeCostMicrousd,
        zuvyr_control_plane_cost_microusd:attestation.zuvyrControlPlaneCostMicrousd||0,
        cost_known:attestation.costKnown===true
      })
      .select('*')
      .single();
    if (inserted.error) throw labError('model_lab_connector_attestation_failed',500,inserted.error);

    const updated = await client
      .from('zuvyr_compute_connectors')
      .update({
        attested_capabilities:attestation.capabilities||{},
        health_status:attestation.healthStatus,
        qualification_status:qualified?'qualified':(
          connector.ownership_verified_at?'ownership_verified':'registered'
        ),
        last_health_at:new Date().toISOString(),
        last_health_latency_ms:attestation.latencyMs,
        last_error_code:attestation.healthStatus==='healthy'?null:'model_lab_connector_health_failed',
        updated_at:new Date().toISOString()
      })
      .eq('id',connectorId)
      .eq('owner_id',ownerId)
      .select('*')
      .single();
    if (updated.error) throw labError('model_lab_connector_update_failed',500,updated.error);

    return Object.freeze({
      connector:publicConnector(updated.data),
      attestation:Object.freeze(inserted.data)
    });
  }

  async function createTrainingRun(ownerId, body = {}) {
    const result = await client.rpc('create_zuvyr_model_lab_training_run_pack095',{
      p_admin_id:ownerId,
      p_dataset_version_id:body.datasetVersionId,
      p_curriculum_id:body.curriculumId||null,
      p_compute_connector_id:body.computeConnectorId,
      p_base_model_ref:String(body.baseModelRef||'').trim(),
      p_base_model_license_reference:String(body.baseModelLicenseReference||'').trim(),
      p_training_config:
        body.trainingConfig&&typeof body.trainingConfig==='object'&&!Array.isArray(body.trainingConfig)
          ? body.trainingConfig:{}
    });
    if (result.error) throw labError(rpcCode(result.error,'model_lab_training_run_create_failed'),400,result.error);
    return getTrainingRun(ownerId,result.data.training_run_id);
  }

  async function getTrainingRun(ownerId, runId) {
    const result = await client
      .from('zuvyr_model_lab_training_runs')
      .select('*')
      .eq('id',runId)
      .eq('owner_id',ownerId)
      .maybeSingle();
    if (result.error) throw labError('model_lab_training_run_lookup_failed',500,result.error);
    if (!result.data) throw labError('model_lab_training_run_not_found',404);
    return Object.freeze(result.data);
  }

  async function listTrainingRuns(ownerId) {
    const result = await client
      .from('zuvyr_model_lab_training_runs')
      .select('*')
      .eq('owner_id',ownerId)
      .order('created_at',{ascending:false})
      .limit(100);
    if (result.error) throw labError('model_lab_training_run_list_failed',500,result.error);
    return Object.freeze(result.data||[]);
  }

  async function transitionTrainingRun(ownerId, runId, body = {}) {
    const run = await getTrainingRun(ownerId,runId);
    const next=String(body.status||'').trim().toLowerCase();
    const allowed={
      planned:['queued','running','cancelled'],
      queued:['running','failed','cancelled'],
      running:['succeeded','failed','cancelled'],
      succeeded:[],
      failed:[],
      cancelled:[]
    };
    if(!allowed[run.status]?.includes(next)) throw labError('model_lab_training_run_transition_invalid',409);

    const patch={status:next};
    if(next==='running') patch.started_at=run.started_at||new Date().toISOString();
    if(['succeeded','failed','cancelled'].includes(next)) patch.completed_at=new Date().toISOString();
    if(body.failureCode) patch.failure_code=String(body.failureCode).slice(0,200);
    if(body.customerComputeCostMicrousd!==undefined){
      patch.customer_compute_cost_microusd=body.customerComputeCostMicrousd;
    }
    if(body.zuvyrControlPlaneCostMicrousd!==undefined){
      patch.zuvyr_control_plane_cost_microusd=body.zuvyrControlPlaneCostMicrousd;
    }
    if(typeof body.costKnown==='boolean') patch.cost_known=body.costKnown;

    const result=await client
      .from('zuvyr_model_lab_training_runs')
      .update(patch)
      .eq('id',runId)
      .eq('owner_id',ownerId)
      .eq('status',run.status)
      .select('*')
      .maybeSingle();
    if(result.error) throw labError('model_lab_training_run_transition_failed',500,result.error);
    if(!result.data) throw labError('model_lab_training_run_state_conflict',409);
    return Object.freeze(result.data);
  }

  async function createBenchmark(ownerId, body = {}) {
    const name=String(body.name||'').trim();
    const version=String(body.version||'').trim();
    if(!name||!version) throw labError('model_lab_benchmark_identity_required');
    const result=await client
      .from('zuvyr_model_lab_benchmarks')
      .insert({
        owner_id:ownerId,
        name:name.slice(0,160),
        version:version.slice(0,80),
        dataset_version_id:body.datasetVersionId||null,
        definition:body.definition&&typeof body.definition==='object'&&!Array.isArray(body.definition)?body.definition:{}
      })
      .select('*')
      .single();
    if(result.error) throw labError('model_lab_benchmark_create_failed',400,result.error);
    return Object.freeze(result.data);
  }

  async function listBenchmarks(ownerId) {
    const result=await client
      .from('zuvyr_model_lab_benchmarks')
      .select('*')
      .eq('owner_id',ownerId)
      .eq('status','active')
      .order('created_at',{ascending:false});
    if(result.error) throw labError('model_lab_benchmark_list_failed',500,result.error);
    return Object.freeze(result.data||[]);
  }

  async function createEvaluation(ownerId, body = {}) {
    const checkpoint=await client
      .from('zuvyr_model_lab_checkpoints')
      .select('id')
      .eq('id',body.checkpointId)
      .eq('owner_id',ownerId)
      .maybeSingle();
    const benchmark=await client
      .from('zuvyr_model_lab_benchmarks')
      .select('id')
      .eq('id',body.benchmarkId)
      .eq('owner_id',ownerId)
      .maybeSingle();
    if(checkpoint.error||benchmark.error) throw labError('model_lab_evaluation_lookup_failed',500,checkpoint.error||benchmark.error);
    if(!checkpoint.data||!benchmark.data) throw labError('model_lab_evaluation_scope_invalid',400);

    const status=String(body.status||'planned').trim().toLowerCase();
    if(!['planned','running','passed','failed','cancelled'].includes(status)){
      throw labError('model_lab_evaluation_status_invalid');
    }
    const regression=String(body.regressionStatus||'unknown').trim().toLowerCase();
    if(!['unknown','pass','fail'].includes(regression)) throw labError('model_lab_regression_status_invalid');

    const result=await client
      .from('zuvyr_model_lab_evaluations')
      .insert({
        owner_id:ownerId,
        checkpoint_id:body.checkpointId,
        baseline_checkpoint_id:body.baselineCheckpointId||null,
        benchmark_id:body.benchmarkId,
        independent:body.independent!==false,
        metrics:body.metrics&&typeof body.metrics==='object'&&!Array.isArray(body.metrics)?body.metrics:{},
        task_success_bps:body.taskSuccessBps??null,
        total_cost_per_successful_task_microusd:body.totalCostPerSuccessfulTaskMicrousd??null,
        regression_status:regression,
        status,
        completed_at:['passed','failed','cancelled'].includes(status)?new Date().toISOString():null
      })
      .select('*')
      .single();
    if(result.error) throw labError('model_lab_evaluation_create_failed',400,result.error);
    return Object.freeze(result.data);
  }

  async function listEvaluations(ownerId) {
    const result=await client
      .from('zuvyr_model_lab_evaluations')
      .select('*')
      .eq('owner_id',ownerId)
      .order('created_at',{ascending:false})
      .limit(100);
    if(result.error) throw labError('model_lab_evaluation_list_failed',500,result.error);
    return Object.freeze(result.data||[]);
  }

  async function recordCheckpoint(ownerId, runId, body = {}) {
    const result=await client.rpc('record_zuvyr_model_lab_checkpoint_pack095',{
      p_admin_id:ownerId,
      p_training_run_id:runId,
      p_name:String(body.name||'').trim(),
      p_artifact_reference:String(body.artifactReference||'').trim(),
      p_artifact_sha256:String(body.artifactSha256||'').trim().toLowerCase(),
      p_license_reference:String(body.licenseReference||'').trim(),
      p_customer_compute_cost_microusd:body.customerComputeCostMicrousd??null,
      p_zuvyr_control_plane_cost_microusd:body.zuvyrControlPlaneCostMicrousd??0,
      p_cost_known:body.costKnown===true
    });
    if(result.error) throw labError(rpcCode(result.error,'model_lab_checkpoint_record_failed'),400,result.error);
    return getCheckpoint(ownerId,result.data.checkpoint_id);
  }

  async function getCheckpoint(ownerId, checkpointId) {
    const result=await client
      .from('zuvyr_model_lab_checkpoints')
      .select('*')
      .eq('id',checkpointId)
      .eq('owner_id',ownerId)
      .maybeSingle();
    if(result.error) throw labError('model_lab_checkpoint_lookup_failed',500,result.error);
    if(!result.data) throw labError('model_lab_checkpoint_not_found',404);
    return Object.freeze(result.data);
  }

  async function listCheckpoints(ownerId) {
    const result=await client
      .from('zuvyr_model_lab_checkpoints')
      .select('*')
      .eq('owner_id',ownerId)
      .order('created_at',{ascending:false})
      .limit(100);
    if(result.error) throw labError('model_lab_checkpoint_list_failed',500,result.error);
    return Object.freeze(result.data||[]);
  }

  async function promoteCheckpoint(ownerId, checkpointId, body = {}) {
    const result=await client.rpc('promote_zuvyr_model_lab_checkpoint_pack095',{
      p_admin_id:ownerId,
      p_checkpoint_id:checkpointId,
      p_target_stage:String(body.targetStage||'').trim(),
      p_evaluation_id:body.evaluationId||null
    });
    if(result.error) throw labError(rpcCode(result.error,'model_lab_checkpoint_promote_failed'),400,result.error);
    return Object.freeze(result.data);
  }

  async function createSyntheticJob(ownerId, body = {}) {
    const dataset=await client
      .from('zuvyr_model_lab_datasets')
      .select('id')
      .eq('id',body.targetDatasetId)
      .eq('owner_id',ownerId)
      .eq('status','active')
      .maybeSingle();
    if(dataset.error) throw labError('model_lab_synthetic_dataset_lookup_failed',500,dataset.error);
    if(!dataset.data) throw labError('model_lab_dataset_not_found',404);

    const result=await client
      .from('zuvyr_model_lab_synthetic_jobs')
      .insert({
        owner_id:ownerId,
        target_dataset_id:body.targetDatasetId,
        skill_id:body.skillId||null,
        teacher_source:body.teacherSource?String(body.teacherSource).slice(0,240):null,
        generation_policy:body.generationPolicy&&typeof body.generationPolicy==='object'&&!Array.isArray(body.generationPolicy)?body.generationPolicy:{},
        rights_basis:'owner_created',
        status:'planned'
      })
      .select('*')
      .single();
    if(result.error) throw labError('model_lab_synthetic_job_create_failed',400,result.error);
    return Object.freeze(result.data);
  }

  async function listSyntheticJobs(ownerId) {
    const result=await client
      .from('zuvyr_model_lab_synthetic_jobs')
      .select('*')
      .eq('owner_id',ownerId)
      .order('created_at',{ascending:false})
      .limit(100);
    if(result.error) throw labError('model_lab_synthetic_job_list_failed',500,result.error);
    return Object.freeze(result.data||[]);
  }

  return Object.freeze({
    summary,
    listDatasets,
    getDataset,
    createDataset,
    addCandidate,
    freezeDatasetVersion,
    cloneDatasetVersion,
    listDatasetItems,
    createSkill,
    listSkills,
    createCurriculum,
    listCurricula,
    addCurriculumSkill,
    createConnector,
    getConnector,
    getConnectorInternal,
    listConnectors,
    setConnectorSecret,
    getConnectorSecret,
    clearConnectorSecret,
    markOwnershipVerified,
    recordAttestation,
    createTrainingRun,
    getTrainingRun,
    listTrainingRuns,
    transitionTrainingRun,
    createBenchmark,
    listBenchmarks,
    createEvaluation,
    listEvaluations,
    recordCheckpoint,
    getCheckpoint,
    listCheckpoints,
    promoteCheckpoint,
    createSyntheticJob,
    listSyntheticJobs
  });
}

module.exports = {
  createModelLabRepository,
  publicConnector,
  publicDataset,
  publicDatasetVersion,
  labError
};
