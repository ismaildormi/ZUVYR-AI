'use strict';

const express = require('express');
const { createLearningPipelineRepository } = require('./learningPipelineRepository');
const learningConfig = require('../config/learning-pipeline.v1.json');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RIGHTS_BASES = new Set([
  'owner_created',
  'licensed_for_training',
  'public_domain',
  'documented_permission'
]);

function routeError(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function errorStatus(error) {
  const code = String(error?.code || '');
  if (
    code === 'pack094_content_not_owned' ||
    code === 'pack094_content_version_not_owned' ||
    code === 'pack094_rights_not_found' ||
    code === 'pack094_learning_event_not_owned'
  ) return 404;
  if (
    code === 'pack094_global_training_opt_in_required' ||
    code === 'pack094_training_rights_inactive' ||
    code === 'pack094_privacy_processing_required' ||
    code === 'pack094_provenance_verification_required' ||
    code === 'pack094_dedupe_hash_required'
  ) return 409;
  if (code.endsWith('_unavailable')) return 503;
  return Number(error?.status) || 400;
}

function respondError(res, error, fallback = 'pack094_request_failed') {
  const code = String(error?.code || fallback);
  return res.status(errorStatus(error)).json({
    status: 'error',
    code,
    message: 'Learning Pipeline request failed.'
  });
}

function uuid(value, code) {
  const text = String(value || '').trim();
  if (!UUID.test(text)) throw routeError(code);
  return text.toLowerCase();
}

function boundedText(value, max, { nullable = true } = {}) {
  const text = String(value == null ? '' : value).trim();
  if (!text) {
    if (nullable) return null;
    throw routeError('pack094_text_value_required');
  }
  if (text.length > max) throw routeError('pack094_text_value_too_long');
  return text;
}

function createLearningPipelineRouter({ db } = {}) {
  const router = express.Router();
  if (!db) throw routeError('pack094_repository_unavailable', 503);
  const learning = createLearningPipelineRepository(db);

  router.get('/policy', (_req, res) => res.json({
    status: 'success',
    policy: {
      version: learningConfig.version,
      nonContentAggregateLearning:
        learningConfig.telemetry.nonContentAggregateLearning === true,
      nonContentSignalsDoNotRequireTrainingOptIn:
        learningConfig.telemetry.trainingOptInRequiredForNonContentTelemetry === false,
      globalTrainingOptInDefault: false,
      memoryPermissionSeparateFromTrainingPermission:
        learningConfig.training.memoryPermissionSeparate === true,
      automaticConversationContentTraining: false,
      currentConsentAuthority: learningConfig.training.currentConsentAuthority,
      consentPolicyVersion: learningConfig.training.consentPolicyVersion,
      optOutExcludesExistingCandidates:
        learningConfig.training.optOutBehavior ===
        'exclude_existing_candidates_and_block_future_admission',
      dataDeleteRequestExcludesExistingCandidates:
        learningConfig.training.dataDeleteBehavior ===
        'exclude_existing_training_candidates_immediately',
      trainingCandidateRequirements: learningConfig.training.requirements,
      datasetAndCheckpointAdmissionOwner:
        learningConfig.evaluation.datasetCheckpointAdmissionOwner,
      primaryEvaluationObjective: learningConfig.evaluation.primaryObjective,
      sharedLearningPlane: learningConfig.sharedLearningPlane
    }
  }));

  router.get('/consent', async (req, res) => {
    try {
      return res.json({
        status: 'success',
        consent: await learning.getConsent(req.userId)
      });
    } catch (error) {
      return respondError(res, error, 'pack094_consent_lookup_failed');
    }
  });

  router.get('/consent/history', async (req, res) => {
    try {
      return res.json({
        status: 'success',
        events: await learning.listConsentHistory(req.userId, {
          limit: req.query?.limit
        })
      });
    } catch (error) {
      return respondError(res, error, 'pack094_consent_history_lookup_failed');
    }
  });

  router.put('/consent', async (req, res) => {
    try {
      if (typeof req.body?.globalTrainingOptIn !== 'boolean') {
        throw routeError('pack094_consent_boolean_required');
      }
      const consent = await learning.setConsent({
        ownerId: req.userId,
        globalTrainingOptIn: req.body.globalTrainingOptIn,
        policyVersion: boundedText(req.body?.policyVersion || 'pack094-v1', 80, { nullable: false }),
        source: 'user'
      });
      return res.json({ status: 'success', consent });
    } catch (error) {
      return respondError(res, error, 'pack094_consent_update_failed');
    }
  });

  router.get('/summary', async (req, res) => {
    try {
      return res.json({
        status: 'success',
        summary: await learning.summary(req.userId)
      });
    } catch (error) {
      return respondError(res, error, 'pack094_summary_lookup_failed');
    }
  });

  router.get('/events', async (req, res) => {
    try {
      return res.json({
        status: 'success',
        events: await learning.listEvents(req.userId, {
          limit: req.query?.limit
        })
      });
    } catch (error) {
      return respondError(res, error, 'pack094_learning_events_lookup_failed');
    }
  });

  router.get('/failures', async (req, res) => {
    try {
      return res.json({
        status: 'success',
        failures: await learning.listFailures(req.userId, {
          limit: req.query?.limit
        })
      });
    } catch (error) {
      return respondError(res, error, 'pack094_failure_bank_lookup_failed');
    }
  });

  router.get('/rights', async (req, res) => {
    try {
      return res.json({
        status: 'success',
        rights: await learning.listRights(req.userId, {
          limit: req.query?.limit
        })
      });
    } catch (error) {
      return respondError(res, error, 'pack094_rights_list_failed');
    }
  });

  router.post('/rights', async (req, res) => {
    try {
      const rightsBasis = String(req.body?.rightsBasis || '').trim();
      if (!RIGHTS_BASES.has(rightsBasis)) {
        throw routeError('pack094_rights_basis_invalid');
      }

      const rights = await learning.setRights({
        ownerId: req.userId,
        contentId: uuid(req.body?.contentId, 'pack094_content_id_invalid'),
        versionId: uuid(req.body?.versionId, 'pack094_version_id_invalid'),
        rightsBasis,
        licenseReference: boundedText(req.body?.licenseReference, 500),
        evidenceReference: boundedText(req.body?.evidenceReference, 500),
        allowGlobalTraining: req.body?.allowGlobalTraining === true
      });

      return res.status(201).json({ status: 'success', rights });
    } catch (error) {
      return respondError(res, error, 'pack094_rights_update_failed');
    }
  });

  router.post('/rights/:rightsId/revoke', async (req, res) => {
    try {
      const result = await learning.revokeRights({
        ownerId: req.userId,
        rightsId: uuid(req.params.rightsId, 'pack094_rights_id_invalid'),
        reason: boundedText(req.body?.reason || 'user_revoked', 500, { nullable: false })
      });
      return res.json({ status: 'success', rights: result });
    } catch (error) {
      return respondError(res, error, 'pack094_rights_revoke_failed');
    }
  });

  router.get('/candidates', async (req, res) => {
    try {
      return res.json({
        status: 'success',
        candidates: await learning.listCandidates(req.userId, {
          limit: req.query?.limit
        })
      });
    } catch (error) {
      return respondError(res, error, 'pack094_candidate_list_failed');
    }
  });

  router.get('/exclusions', async (req, res) => {
    try {
      return res.json({
        status: 'success',
        exclusions: await learning.listExclusions(req.userId, {
          limit: req.query?.limit
        })
      });
    } catch (error) {
      return respondError(res, error, 'pack094_exclusion_list_failed');
    }
  });

  router.post('/candidates/:candidateId/exclude', async (req, res) => {
    try {
      const candidate = await learning.excludeCandidate({
        ownerId: req.userId,
        candidateId: uuid(
          req.params.candidateId,
          'pack094_candidate_id_invalid'
        ),
        reason: 'user_excluded'
      });
      return res.json({ status: 'success', candidate });
    } catch (error) {
      return respondError(res, error, 'pack094_candidate_exclude_failed');
    }
  });

  router.post('/candidates/prepare', async (req, res) => {
    try {
      const difficulty =
        req.body?.difficulty == null ? 3 : Number(req.body.difficulty);
      const qualityScore =
        req.body?.qualityScore == null ? 5000 : Number(req.body.qualityScore);

      if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
        throw routeError('pack094_candidate_difficulty_invalid');
      }
      if (!Number.isInteger(qualityScore) || qualityScore < 0 || qualityScore > 10000) {
        throw routeError('pack094_candidate_quality_invalid');
      }

      const sourceEventId =
        req.body?.sourceEventId == null
          ? null
          : uuid(req.body.sourceEventId, 'pack094_source_event_id_invalid');

      const candidate = await learning.prepareTextCandidate({
        ownerId: req.userId,
        contentId: uuid(req.body?.contentId, 'pack094_content_id_invalid'),
        versionId: uuid(req.body?.versionId, 'pack094_version_id_invalid'),
        sourceEventId,
        domain: boundedText(req.body?.domain, 120),
        difficulty,
        qualityScore
      });

      return res.status(201).json({
        status: 'success',
        candidate
      });
    } catch (error) {
      return respondError(res, error, 'pack094_candidate_prepare_failed');
    }
  });

  return router;
}

module.exports = {
  createLearningPipelineRouter,
  RIGHTS_BASES
};
