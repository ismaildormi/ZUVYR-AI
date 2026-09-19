'use strict';

const express = require('express');
const {
  createModelLabRepository,
  labError
} = require('./modelLabRepository');
const {
  connectorError,
  normalizeEndpointUrl,
  normalizeHealthPath,
  ownershipChallenge,
  verifyOwnership,
  healthCheck
} = require('./modelLabComputeConnector');
const config = require('../config/model-lab.v1.json');

function uuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(value || ''));
}

function statusFor(error) {
  const code = String(error?.code || '');
  if (Number.isInteger(error?.status)) return error.status;
  if (code.endsWith('_not_found')) return 404;
  if (code.includes('admin_required')) return 403;
  if (code.includes('state_conflict') || code.includes('not_draft')) return 409;
  if (code.includes('unreachable') || code.includes('dns_failed')) return 502;
  return 400;
}

function respondError(res, error, fallback = 'model_lab_request_failed') {
  const code = String(error?.code || fallback);
  return res.status(statusFor(error)).json({
    status: 'error',
    code,
    message: 'Model Lab request failed.'
  });
}

function requireUuid(value, code = 'model_lab_id_invalid') {
  if (!uuid(value)) throw labError(code,400);
  return String(value);
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function createModelLabRouter({ db } = {}) {
  const router = express.Router();
  const lab = createModelLabRepository(db);

  router.get('/capabilities', (_req,res) => {
    res.json({
      status:'success',
      pack:95,
      title:'ZUVYR Model Lab',
      access:config.access,
      training:{
        liveExecutionEnabled:false,
        executionOwner:'PACK096'
      },
      rollout:{
        stages:config.rollout.stages,
        liveRouterActivationEnabled:false,
        liveRouterActivationOwner:'PACK096'
      },
      computeConnectors:{
        ownershipKinds:config.computeConnectors.ownershipKinds,
        directKinds:config.computeConnectors.directKinds,
        relayKind:config.computeConnectors.relayKind,
        credentials:'supabase_vault_reference',
        browserSecretExposure:false,
        customerAndZuvyrCostSeparated:true
      }
    });
  });

  router.get('/summary', async (req,res) => {
    try {
      return res.json({
        status:'success',
        summary:await lab.summary(req.userId)
      });
    } catch(error) {
      return respondError(res,error,'model_lab_summary_failed');
    }
  });

  router.get('/candidate-pool', async (req,res) => {
    try {
      return res.json({
        status:'success',
        candidates:await lab.listCandidatePool({
          limit:req.query?.limit,
          domain:req.query?.domain||null
        })
      });
    } catch(error) {
      return respondError(res,error,'model_lab_candidate_pool_failed');
    }
  });

  router.get('/failure-bank', async (req,res) => {
    try {
      return res.json({
        status:'success',
        failures:await lab.listFailurePatterns({limit:req.query?.limit})
      });
    } catch(error) {
      return respondError(res,error,'model_lab_failure_bank_failed');
    }
  });

  router.get('/datasets', async (req,res) => {
    try {
      return res.json({
        status:'success',
        datasets:await lab.listDatasets(req.userId)
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/datasets', async (req,res) => {
    try {
      const dataset=await lab.createDataset(req.userId,{
        name:req.body?.name,
        purpose:req.body?.purpose
      });
      return res.status(201).json({status:'success',dataset});
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.get('/datasets/:datasetId', async (req,res) => {
    try {
      const datasetId=requireUuid(req.params.datasetId,'model_lab_dataset_id_invalid');
      return res.json({
        status:'success',
        dataset:await lab.getDataset(req.userId,datasetId)
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/datasets/:datasetId/versions', async (req,res) => {
    try {
      const datasetId=requireUuid(req.params.datasetId,'model_lab_dataset_id_invalid');
      return res.status(201).json({
        status:'success',
        dataset:await lab.cloneDatasetVersion(req.userId,datasetId)
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.get('/dataset-versions/:versionId/items', async (req,res) => {
    try {
      const versionId=requireUuid(req.params.versionId,'model_lab_dataset_version_id_invalid');
      return res.json({
        status:'success',
        items:await lab.listDatasetItems(req.userId,versionId)
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/dataset-versions/:versionId/candidates', async (req,res) => {
    try {
      const versionId=requireUuid(req.params.versionId,'model_lab_dataset_version_id_invalid');
      const candidateId=requireUuid(req.body?.candidateId,'model_lab_candidate_id_invalid');
      return res.status(201).json({
        status:'success',
        item:await lab.addCandidate(req.userId,versionId,candidateId)
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/dataset-versions/:versionId/freeze', async (req,res) => {
    try {
      const versionId=requireUuid(req.params.versionId,'model_lab_dataset_version_id_invalid');
      return res.json({
        status:'success',
        version:await lab.freezeDatasetVersion(req.userId,versionId)
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.get('/skills', async (req,res) => {
    try {
      return res.json({status:'success',skills:await lab.listSkills(req.userId)});
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/skills', async (req,res) => {
    try {
      return res.status(201).json({
        status:'success',
        skill:await lab.createSkill(req.userId,req.body||{})
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.get('/curricula', async (req,res) => {
    try {
      return res.json({status:'success',curricula:await lab.listCurricula(req.userId)});
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/curricula', async (req,res) => {
    try {
      return res.status(201).json({
        status:'success',
        curriculum:await lab.createCurriculum(req.userId,req.body||{})
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/curricula/:curriculumId/skills', async (req,res) => {
    try {
      const curriculumId=requireUuid(req.params.curriculumId,'model_lab_curriculum_id_invalid');
      requireUuid(req.body?.skillId,'model_lab_skill_id_invalid');
      requireUuid(req.body?.datasetVersionId,'model_lab_dataset_version_id_invalid');
      return res.status(201).json({
        status:'success',
        link:await lab.addCurriculumSkill(req.userId,curriculumId,req.body||{})
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.get('/connectors', async (req,res) => {
    try {
      return res.json({
        status:'success',
        connectors:await lab.listConnectors(req.userId)
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/connectors', async (req,res) => {
    try {
      const ownershipKind=String(req.body?.ownershipKind||'').trim();
      if (!config.computeConnectors.ownershipKinds.includes(ownershipKind)) {
        throw connectorError('model_lab_connector_ownership_kind_invalid',400);
      }

      const ownershipSubject=String(req.body?.ownershipSubject||'').trim();
      if(!ownershipSubject || ownershipSubject.length>240){
        throw connectorError('model_lab_connector_ownership_subject_invalid',400);
      }

      const connectorKind=String(req.body?.connectorKind||'').trim();
      const allowedKinds=[
        ...config.computeConnectors.directKinds,
        config.computeConnectors.relayKind
      ];
      if(!allowedKinds.includes(connectorKind)){
        throw connectorError('model_lab_connector_kind_invalid',400);
      }

      let endpointUrl=null;
      let healthPath='/health';
      let challenge=null;

      if(connectorKind!=='zuvyr_compute_relay'){
        endpointUrl=normalizeEndpointUrl(req.body?.endpointUrl);
        healthPath=normalizeHealthPath(req.body?.healthPath,connectorKind);
        challenge=ownershipChallenge();
      } else if(req.body?.endpointUrl){
        throw connectorError('model_lab_relay_endpoint_forbidden',400);
      }

      const connector=await lab.createConnector(req.userId,{
        ownershipKind,
        ownershipSubject,
        ownershipChallengeHash:challenge?.hash||null,
        ownershipChallengeExpiresAt:challenge?.expiresAt||null,
        connectorKind,
        endpointUrl,
        healthPath,
        capabilityClaims:object(req.body?.capabilityClaims),
        customerComputeCostModel:object(req.body?.customerComputeCostModel),
        zuvyrControlPlaneCostModel:object(req.body?.zuvyrControlPlaneCostModel),
        costKnown:req.body?.costKnown===true
      });

      return res.status(201).json({
        status:'success',
        connector,
        ownershipChallenge:challenge
          ? {
              token:challenge.token,
              path:challenge.path,
              expiresAt:challenge.expiresAt,
              note:'Publish this challenge on the compute endpoint, then call verify-ownership. This is not a compute credential and is not stored in plaintext.'
            }
          : {
              token:null,
              path:null,
              expiresAt:null,
              note:'Relay ownership verification requires the PACK096 compute relay handshake.'
            }
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/connectors/:connectorId/credential', async (req,res) => {
    try {
      const connectorId=requireUuid(req.params.connectorId,'model_lab_connector_id_invalid');
      const secret=String(req.body?.credential||'');
      if(!secret) throw connectorError('model_lab_connector_credential_required',400);
      const connector=await lab.setConnectorSecret(req.userId,connectorId,secret);
      return res.json({
        status:'success',
        connector,
        credentialAccepted:true
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.delete('/connectors/:connectorId/credential', async (req,res) => {
    try {
      const connectorId=requireUuid(req.params.connectorId,'model_lab_connector_id_invalid');
      return res.json({
        status:'success',
        connector:await lab.clearConnectorSecret(req.userId,connectorId)
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/connectors/:connectorId/verify-ownership', async (req,res) => {
    try {
      const connectorId=requireUuid(req.params.connectorId,'model_lab_connector_id_invalid');
      const connector=await lab.getConnectorInternal(req.userId,connectorId);
      if(connector.connector_kind==='zuvyr_compute_relay'){
        throw connectorError('model_lab_compute_relay_not_connected',503);
      }
      if(!connector.ownership_challenge_hash || !connector.ownership_challenge_expires_at){
        throw connectorError('model_lab_connector_challenge_missing',409);
      }
      if(new Date(connector.ownership_challenge_expires_at).getTime()<=Date.now()){
        throw connectorError('model_lab_connector_challenge_expired',409);
      }

      const proof=await verifyOwnership({
        endpointUrl:connector.endpoint_url,
        challengeToken:req.body?.challengeToken,
        expectedChallengeHash:connector.ownership_challenge_hash
      });
      const updated=await lab.markOwnershipVerified(
        req.userId,
        connectorId,
        proof.evidenceReference
      );
      return res.json({
        status:'success',
        connector:updated,
        verification:{
          verified:true,
          latencyMs:proof.latencyMs
        }
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/connectors/:connectorId/health-check', async (req,res) => {
    try {
      const connectorId=requireUuid(req.params.connectorId,'model_lab_connector_id_invalid');
      const connector=await lab.getConnectorInternal(req.userId,connectorId);
      if(!connector.ownership_verified_at){
        throw connectorError('model_lab_connector_ownership_required',409);
      }

      const credential=connector.credential_secret_id
        ? await lab.getConnectorSecret(req.userId,connectorId)
        : null;

      let attestation;
      try {
        attestation=await healthCheck({
          connectorKind:connector.connector_kind,
          endpointUrl:connector.endpoint_url,
          healthPath:connector.health_path,
          credential
        });
      } catch(error) {
        const failed={
          healthStatus:
            error.code==='model_lab_compute_relay_not_connected'
              ? 'blocked'
              : 'unreachable',
          latencyMs:null,
          httpStatus:null,
          capabilities:{},
          measurement:{errorCode:error.code||'model_lab_connector_health_failed'},
          customerComputeCostMicrousd:null,
          zuvyrControlPlaneCostMicrousd:0,
          costKnown:false
        };
        await lab.recordAttestation(req.userId,connectorId,failed).catch(()=>null);
        throw error;
      }

      const recorded=await lab.recordAttestation(req.userId,connectorId,attestation);
      return res.json({
        status:'success',
        connector:recorded.connector,
        attestation:recorded.attestation
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.get('/training-runs', async (req,res) => {
    try {
      return res.json({
        status:'success',
        trainingRuns:await lab.listTrainingRuns(req.userId),
        liveExecutionEnabled:false
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/training-runs', async (req,res) => {
    try {
      requireUuid(req.body?.datasetVersionId,'model_lab_dataset_version_id_invalid');
      requireUuid(req.body?.computeConnectorId,'model_lab_connector_id_invalid');
      if(req.body?.curriculumId) requireUuid(req.body.curriculumId,'model_lab_curriculum_id_invalid');
      const run=await lab.createTrainingRun(req.userId,req.body||{});
      return res.status(201).json({
        status:'success',
        trainingRun:run,
        liveExecutionEnabled:false,
        note:'PACK095 records a qualified run plan. PACK096 owns live training/serving execution.'
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.patch('/training-runs/:runId/state', async (req,res) => {
    try {
      const runId=requireUuid(req.params.runId,'model_lab_training_run_id_invalid');
      return res.json({
        status:'success',
        trainingRun:await lab.transitionTrainingRun(req.userId,runId,req.body||{})
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/training-runs/:runId/checkpoint', async (req,res) => {
    try {
      const runId=requireUuid(req.params.runId,'model_lab_training_run_id_invalid');
      return res.status(201).json({
        status:'success',
        checkpoint:await lab.recordCheckpoint(req.userId,runId,req.body||{})
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.get('/benchmarks', async (req,res) => {
    try {
      return res.json({status:'success',benchmarks:await lab.listBenchmarks(req.userId)});
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/benchmarks', async (req,res) => {
    try {
      if(req.body?.datasetVersionId) requireUuid(req.body.datasetVersionId,'model_lab_dataset_version_id_invalid');
      return res.status(201).json({
        status:'success',
        benchmark:await lab.createBenchmark(req.userId,req.body||{})
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.get('/evaluations', async (req,res) => {
    try {
      return res.json({status:'success',evaluations:await lab.listEvaluations(req.userId)});
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/evaluations', async (req,res) => {
    try {
      requireUuid(req.body?.checkpointId,'model_lab_checkpoint_id_invalid');
      requireUuid(req.body?.benchmarkId,'model_lab_benchmark_id_invalid');
      if(req.body?.baselineCheckpointId) requireUuid(req.body.baselineCheckpointId,'model_lab_checkpoint_id_invalid');
      return res.status(201).json({
        status:'success',
        evaluation:await lab.createEvaluation(req.userId,req.body||{})
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.get('/checkpoints', async (req,res) => {
    try {
      return res.json({status:'success',checkpoints:await lab.listCheckpoints(req.userId)});
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/checkpoints/:checkpointId/promote', async (req,res) => {
    try {
      const checkpointId=requireUuid(req.params.checkpointId,'model_lab_checkpoint_id_invalid');
      if(req.body?.evaluationId) requireUuid(req.body.evaluationId,'model_lab_evaluation_id_invalid');
      return res.json({
        status:'success',
        rollout:await lab.promoteCheckpoint(req.userId,checkpointId,req.body||{})
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.get('/synthetic-jobs', async (req,res) => {
    try {
      return res.json({
        status:'success',
        syntheticJobs:await lab.listSyntheticJobs(req.userId),
        liveExecutionEnabled:false
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  router.post('/synthetic-jobs', async (req,res) => {
    try {
      requireUuid(req.body?.targetDatasetId,'model_lab_dataset_id_invalid');
      if(req.body?.skillId) requireUuid(req.body.skillId,'model_lab_skill_id_invalid');
      return res.status(201).json({
        status:'success',
        syntheticJob:await lab.createSyntheticJob(req.userId,req.body||{}),
        liveExecutionEnabled:false
      });
    } catch(error) {
      return respondError(res,error);
    }
  });

  return router;
}

module.exports={
  createModelLabRouter,
  requireUuid,
  respondError
};
