'use strict';

const {
  redactTrainingText,
  candidateLearningValueScore
} = require('./learningPrivacy');

function learningError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function rpcCode(error, fallback) {
  const text = String(error?.message || error?.details || error?.hint || '');
  const match = text.match(/pack094_[a-z0-9_]+/i);
  return match ? match[0].toLowerCase() : fallback;
}

function publicConsent(row) {
  if (!row) {
    return Object.freeze({
      globalTrainingOptIn: false,
      policyVersion: 'pack094-v1',
      consentVersion: 0,
      source: 'default_off',
      updatedAt: null
    });
  }
  return Object.freeze({
    globalTrainingOptIn: row.global_training_opt_in === true,
    policyVersion: row.policy_version,
    consentVersion: Number(row.consent_version || 0),
    source: row.source,
    updatedAt: row.updated_at
  });
}

function publicRights(row) {
  return Object.freeze({
    id: row.id,
    contentId: row.content_id,
    versionId: row.version_id,
    rightsBasis: row.rights_basis,
    licenseReference: row.license_reference || null,
    evidenceReference: row.evidence_reference || null,
    allowGlobalTraining: row.allow_global_training === true,
    privacyStatus: row.privacy_status,
    provenanceStatus: row.provenance_status,
    dedupeSha256: row.dedupe_sha256 || null,
    revokedAt: row.revoked_at || null,
    revocationReason: row.revocation_reason || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function publicCandidate(row) {
  return Object.freeze({
    id: row.id,
    contentId: row.content_id,
    versionId: row.version_id,
    rightsId: row.rights_id,
    sourceEventId: row.source_event_id || null,
    consentVersion: Number(row.consent_version || 0),
    dedupeSha256: row.dedupe_sha256,
    payloadKind: row.payload_kind,
    domain: row.domain || null,
    difficulty: row.difficulty === null ? null : Number(row.difficulty),
    qualityScore: row.quality_score === null ? null : Number(row.quality_score),
    learningValueScore: Number(row.learning_value_score || 0),
    status: row.status,
    exclusionReason: row.exclusion_reason || null,
    excludedAt: row.excluded_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

function createLearningPipelineRepository(client) {
  if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') {
    throw learningError('pack094_repository_unavailable');
  }

  async function getConsent(ownerId) {
    const result = await client
      .from('zuvyr_learning_consents')
      .select('owner_id,global_training_opt_in,policy_version,consent_version,source,created_at,updated_at,last_opt_in_at,last_opt_out_at')
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (result.error) throw learningError('pack094_consent_lookup_failed', result.error);
    return publicConsent(result.data);
  }

  async function setConsent({
    ownerId,
    globalTrainingOptIn,
    policyVersion = 'pack094-v1',
    source = 'user'
  } = {}) {
    const result = await client.rpc('set_zuvyr_learning_consent_pack094', {
      p_owner_id: ownerId,
      p_global_training_opt_in: globalTrainingOptIn === true,
      p_policy_version: String(policyVersion || 'pack094-v1').slice(0, 80),
      p_source: source === 'enterprise_policy' ? 'enterprise_policy' : 'user'
    });
    if (result.error) {
      throw learningError(rpcCode(result.error, 'pack094_consent_update_failed'), result.error);
    }
    return getConsent(ownerId);
  }

  async function listRights(ownerId, { limit = 100 } = {}) {
    const result = await client
      .from('zuvyr_training_rights')
      .select('id,owner_id,content_id,version_id,rights_basis,license_reference,evidence_reference,allow_global_training,privacy_status,provenance_status,dedupe_sha256,created_at,updated_at,revoked_at,revocation_reason')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
      .limit(Math.max(1, Math.min(200, Number(limit) || 100)));
    if (result.error) throw learningError('pack094_rights_list_failed', result.error);
    return Object.freeze((result.data || []).map(publicRights));
  }

  async function setRights({
    ownerId,
    contentId,
    versionId,
    rightsBasis,
    licenseReference = null,
    evidenceReference = null,
    allowGlobalTraining = false
  } = {}) {
    const result = await client.rpc('upsert_zuvyr_training_rights_pack094', {
      p_owner_id: ownerId,
      p_content_id: contentId,
      p_version_id: versionId,
      p_rights_basis: rightsBasis,
      p_license_reference: licenseReference,
      p_evidence_reference: evidenceReference,
      p_allow_global_training: allowGlobalTraining === true
    });
    if (result.error) {
      throw learningError(rpcCode(result.error, 'pack094_rights_update_failed'), result.error);
    }
    const list = await client
      .from('zuvyr_training_rights')
      .select('id,owner_id,content_id,version_id,rights_basis,license_reference,evidence_reference,allow_global_training,privacy_status,provenance_status,dedupe_sha256,created_at,updated_at,revoked_at,revocation_reason')
      .eq('id', result.data.id)
      .eq('owner_id', ownerId)
      .single();
    if (list.error) throw learningError('pack094_rights_lookup_failed', list.error);
    return publicRights(list.data);
  }

  async function revokeRights({ ownerId, rightsId, reason = 'user_revoked' } = {}) {
    const result = await client.rpc('revoke_zuvyr_training_rights_pack094', {
      p_owner_id: ownerId,
      p_rights_id: rightsId,
      p_reason: String(reason || 'user_revoked').slice(0, 500)
    });
    if (result.error) {
      throw learningError(rpcCode(result.error, 'pack094_rights_revoke_failed'), result.error);
    }
    return Object.freeze({
      id: result.data.id,
      allowGlobalTraining: false,
      revokedAt: result.data.revoked_at
    });
  }

  async function requireActiveRights({ ownerId, contentId, versionId } = {}) {
    const result = await client
      .from('zuvyr_training_rights')
      .select('id,owner_id,content_id,version_id,rights_basis,license_reference,evidence_reference,allow_global_training,privacy_status,provenance_status,dedupe_sha256,created_at,updated_at,revoked_at,revocation_reason')
      .eq('owner_id', ownerId)
      .eq('content_id', contentId)
      .eq('version_id', versionId)
      .maybeSingle();
    if (result.error) throw learningError('pack094_rights_lookup_failed', result.error);
    if (!result.data) throw learningError('pack094_rights_not_found');
    if (result.data.revoked_at || result.data.allow_global_training !== true) {
      throw learningError('pack094_training_rights_inactive');
    }
    return result.data;
  }

  async function loadCanonicalText({ ownerId, contentId, versionId } = {}) {
    const [objectResult, versionResult] = await Promise.all([
      client
        .from('zuvyr_content_objects')
        .select('id,owner_id,status,source_kind,source_system,source_id,metadata,current_version_id,deleted_at')
        .eq('id', contentId)
        .eq('owner_id', ownerId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle(),
      client
        .from('zuvyr_content_versions')
        .select('id,content_id,owner_id,version_number,source_version_key,mime_type,text_content,sha256,provenance,created_at')
        .eq('id', versionId)
        .eq('content_id', contentId)
        .eq('owner_id', ownerId)
        .maybeSingle()
    ]);

    if (objectResult.error || versionResult.error) {
      throw learningError(
        'pack094_content_lookup_failed',
        objectResult.error || versionResult.error
      );
    }
    if (!objectResult.data) throw learningError('pack094_content_not_owned');
    if (!versionResult.data) throw learningError('pack094_content_version_not_owned');

    const text = versionResult.data.text_content;
    if (typeof text !== 'string' || !text.trim()) {
      throw learningError('pack094_text_candidate_required');
    }

    const provenance = Object.freeze({
      contentId: objectResult.data.id,
      versionId: versionResult.data.id,
      sourceKind: objectResult.data.source_kind,
      sourceSystem: objectResult.data.source_system,
      sourceId: objectResult.data.source_id,
      sourceVersionKey: versionResult.data.source_version_key,
      sourceSha256: versionResult.data.sha256 || null,
      versionNumber: Number(versionResult.data.version_number || 0)
    });

    if (
      !provenance.sourceKind ||
      !provenance.sourceSystem ||
      !provenance.sourceId ||
      !provenance.sourceVersionKey
    ) {
      throw learningError('pack094_provenance_verification_required');
    }

    return Object.freeze({
      text,
      provenance,
      version: versionResult.data,
      content: objectResult.data
    });
  }

  async function sourceLearningValue({ ownerId, eventId } = {}) {
    if (!eventId) return 0;
    const result = await client
      .from('zuvyr_learning_events')
      .select('id,owner_id,learning_value_score')
      .eq('id', eventId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (result.error) throw learningError('pack094_learning_event_lookup_failed', result.error);
    if (!result.data) throw learningError('pack094_learning_event_not_owned');
    return Number(result.data.learning_value_score || 0);
  }

  async function prepareTextCandidate({
    ownerId,
    contentId,
    versionId,
    sourceEventId = null,
    domain = null,
    difficulty = 3,
    qualityScore = 5000
  } = {}) {
    const consent = await getConsent(ownerId);
    if (!consent.globalTrainingOptIn) {
      throw learningError('pack094_global_training_opt_in_required');
    }

    const rights = await requireActiveRights({ ownerId, contentId, versionId });
    const canonical = await loadCanonicalText({ ownerId, contentId, versionId });
    const processed = redactTrainingText(canonical.text);
    const sourceValue = await sourceLearningValue({ ownerId, eventId: sourceEventId });

    const mark = await client.rpc('mark_zuvyr_training_rights_privacy_pack094', {
      p_owner_id: ownerId,
      p_rights_id: rights.id,
      p_privacy_status: 'processed',
      p_provenance_status: 'verified',
      p_dedupe_sha256: processed.sha256
    });
    if (mark.error) {
      throw learningError(rpcCode(mark.error, 'pack094_privacy_mark_failed'), mark.error);
    }

    const learningValueScore = candidateLearningValueScore({
      qualityScore,
      difficulty,
      redactionCount: processed.summary.redactionCount,
      sourceLearningValue: sourceValue
    });

    const admitted = await client.rpc('admit_zuvyr_redacted_text_candidate_pack094', {
      p_owner_id: ownerId,
      p_rights_id: rights.id,
      p_source_event_id: sourceEventId,
      p_domain: domain ? String(domain).slice(0, 120) : null,
      p_difficulty: Number(difficulty),
      p_quality_score: Number(qualityScore),
      p_learning_value_score: learningValueScore,
      p_redacted_text: processed.redactedText,
      p_redacted_sha256: processed.sha256,
      p_redaction_summary: {
        ...processed.summary,
        provenance: canonical.provenance
      }
    });
    if (admitted.error) {
      throw learningError(rpcCode(admitted.error, 'pack094_candidate_admission_failed'), admitted.error);
    }

    return Object.freeze({
      id: admitted.data.id,
      contentId: admitted.data.content_id,
      versionId: admitted.data.version_id,
      consentVersion: Number(admitted.data.consent_version),
      dedupeSha256: admitted.data.dedupe_sha256,
      payloadKind: admitted.data.payload_kind,
      payloadSha256: admitted.data.payload_sha256,
      status: admitted.data.status,
      learningValueScore,
      privacy: Object.freeze({
        processed: true,
        redactionCount: processed.summary.redactionCount,
        categories: processed.summary.categories
      }),
      provenance: canonical.provenance
    });
  }

  async function listCandidates(ownerId, { limit = 100 } = {}) {
    const result = await client
      .from('zuvyr_training_candidates')
      .select('id,owner_id,content_id,version_id,rights_id,source_event_id,consent_version,dedupe_sha256,payload_kind,domain,difficulty,quality_score,learning_value_score,status,exclusion_reason,excluded_at,created_at,updated_at')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(200, Number(limit) || 100)));
    if (result.error) throw learningError('pack094_candidate_list_failed', result.error);
    return Object.freeze((result.data || []).map(publicCandidate));
  }

  async function summary(ownerId) {
    const [
      consent,
      events,
      failures,
      openFailures,
      candidates,
      eligibleCandidates,
      rights
    ] = await Promise.all([
      getConsent(ownerId),
      client.from('zuvyr_learning_events').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId),
      client.from('zuvyr_failure_bank').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId),
      client.from('zuvyr_failure_bank').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId).eq('status', 'open'),
      client.from('zuvyr_training_candidates').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId),
      client.from('zuvyr_training_candidates').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId).eq('status', 'candidate'),
      client.from('zuvyr_training_rights').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId).eq('allow_global_training', true).is('revoked_at', null)
    ]);

    for (const result of [events,failures,openFailures,candidates,eligibleCandidates,rights]) {
      if (result.error) throw learningError('pack094_summary_lookup_failed', result.error);
    }

    return Object.freeze({
      consent,
      nonContentLearningEvents: Number(events.count || 0),
      failureBankEntries: Number(failures.count || 0),
      openFailureBankEntries: Number(openFailures.count || 0),
      trainingCandidates: Number(candidates.count || 0),
      eligibleTrainingCandidates: Number(eligibleCandidates.count || 0),
      activeTrainingRights: Number(rights.count || 0),
      memoryPermissionIndependent: true
    });
  }

  async function listFailures(ownerId, { limit = 100 } = {}) {
    const result = await client
      .from('zuvyr_failure_bank')
      .select('id,fingerprint,capability,failure_category,provider,model_tool,domain,occurrences,first_seen_at,last_seen_at,latest_repair_outcome,status,updated_at')
      .eq('owner_id', ownerId)
      .order('last_seen_at', { ascending: false })
      .limit(Math.max(1, Math.min(200, Number(limit) || 100)));
    if (result.error) throw learningError('pack094_failure_bank_lookup_failed', result.error);
    return Object.freeze((result.data || []).map(row => Object.freeze({
      id: row.id,
      fingerprint: row.fingerprint,
      capability: row.capability || null,
      failureCategory: row.failure_category,
      provider: row.provider || null,
      modelTool: row.model_tool || null,
      domain: row.domain || null,
      occurrences: Number(row.occurrences || 0),
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      latestRepairOutcome: row.latest_repair_outcome || null,
      status: row.status,
      updatedAt: row.updated_at
    })));
  }

  return Object.freeze({
    getConsent,
    setConsent,
    listRights,
    setRights,
    revokeRights,
    prepareTextCandidate,
    listCandidates,
    summary,
    listFailures
  });
}

module.exports = {
  createLearningPipelineRepository,
  learningError,
  publicConsent,
  publicRights,
  publicCandidate
};
