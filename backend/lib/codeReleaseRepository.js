'use strict';

function releaseRepositoryError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function rpcCode(error, fallback) {
  const text = String(error?.message || error?.details || error?.hint || '');
  const match = text.match(/pack079_[a-z0-9_]+/i);
  return match ? match[0].toLowerCase() : fallback;
}

function publicValidation(row) {
  if (!row) return null;
  return Object.freeze({
    id:row.id,
    projectId:row.project_id,
    projectVersionId:row.project_version_id,
    projectRevision:Number(row.project_revision),
    snapshotSha256:row.snapshot_sha256,
    filesDigest:row.files_digest,
    buildJobId:row.build_job_id,
    testJobId:row.test_job_id,
    previewState:row.preview_state,
    previewTransportStatus:row.preview_transport_status,
    validatedAt:row.validated_at
  });
}

function publicArtifact(row) {
  if (!row) return null;
  return Object.freeze({
    id:row.id,
    projectId:row.project_id,
    projectVersionId:row.project_version_id,
    validationId:row.validation_id,
    format:row.format,
    snapshotSha256:row.snapshot_sha256,
    manifestSha256:row.manifest_sha256,
    archiveSha256:row.archive_sha256,
    fileCount:Number(row.file_count),
    assetCount:Number(row.asset_count),
    archiveBytes:Number(row.archive_bytes),
    manifest:row.manifest || {},
    verifiedReopen:row.verified_reopen === true,
    createdAt:row.created_at
  });
}

function publicDeploy(row) {
  if (!row) return null;
  return Object.freeze({
    id:row.id,
    projectId:row.project_id,
    projectVersionId:row.project_version_id,
    validationId:row.validation_id,
    releaseArtifactId:row.release_artifact_id,
    status:row.status,
    target:row.target,
    provider:row.provider || null,
    providerProjectId:row.provider_project_id || null,
    providerDeploymentId:row.provider_deployment_id || null,
    deploymentUrl:row.deployment_url || null,
    previousProductionDeploymentId:
      row.previous_production_deployment_id || null,
    artifactSha256:row.artifact_sha256 || null,
    errorCode:row.error_code || null,
    confirmedAt:row.confirmed_at || null,
    completedAt:row.completed_at || null,
    createdAt:row.created_at,
    updatedAt:row.updated_at
  });
}

function publicRollback(row) {
  if (!row) return null;
  return Object.freeze({
    id:row.id,
    projectId:row.project_id,
    deployRequestId:row.deploy_request_id,
    rollbackToProviderDeploymentId:
      row.rollback_to_provider_deployment_id,
    status:row.status,
    errorCode:row.error_code || null,
    createdAt:row.created_at,
    completedAt:row.completed_at || null
  });
}

function createCodeReleaseRepository(db) {
  if (!db || typeof db.from !== 'function' || typeof db.rpc !== 'function') {
    throw releaseRepositoryError('pack079_repository_unavailable');
  }

  async function requireOwnedProject(ownerId, projectId) {
    const result=await db.from('code_projects')
      .select('id,owner_id,name,current_branch,revision,status')
      .eq('id',projectId)
      .eq('owner_id',ownerId)
      .eq('status','active')
      .maybeSingle();
    if(result.error) throw releaseRepositoryError('pack079_project_lookup_failed',result.error);
    if(!result.data) throw releaseRepositoryError('pack079_project_not_found');
    return result.data;
  }

  async function getVersion({ownerId,projectId,versionId}) {
    await requireOwnedProject(ownerId,projectId);
    const result=await db.from('code_project_versions')
      .select('id,project_id,created_by,snapshot,branch_name,reason,canonical_content_id,created_at')
      .eq('id',versionId)
      .eq('project_id',projectId)
      .maybeSingle();
    if(result.error) throw releaseRepositoryError('pack079_project_version_lookup_failed',result.error);
    if(!result.data) throw releaseRepositoryError('pack079_project_version_not_found');
    return Object.freeze(result.data);
  }

  async function validateRelease({ownerId,projectId,versionId}) {
    await requireOwnedProject(ownerId,projectId);
    const result=await db.rpc('reserve_zuvyr_code_release_validation_pack079',{
      p_owner_id:ownerId,
      p_project_id:projectId,
      p_project_version_id:versionId
    });
    if(result.error) throw releaseRepositoryError(
      rpcCode(result.error,'pack079_release_validation_failed'),
      result.error
    );
    return getValidation({ownerId,validationId:result.data.validation_id});
  }

  async function getValidation({ownerId,validationId}) {
    const result=await db.from('code_release_validations')
      .select('id,owner_id,project_id,project_version_id,project_revision,snapshot_sha256,files_digest,build_job_id,test_job_id,preview_state,preview_transport_status,validated_at')
      .eq('id',validationId)
      .eq('owner_id',ownerId)
      .maybeSingle();
    if(result.error) throw releaseRepositoryError('pack079_validation_lookup_failed',result.error);
    if(!result.data) throw releaseRepositoryError('pack079_validation_not_found');
    return publicValidation(result.data);
  }

  async function latestValidation({ownerId,projectId,versionId}) {
    const result=await db.from('code_release_validations')
      .select('id,owner_id,project_id,project_version_id,project_revision,snapshot_sha256,files_digest,build_job_id,test_job_id,preview_state,preview_transport_status,validated_at')
      .eq('owner_id',ownerId)
      .eq('project_id',projectId)
      .eq('project_version_id',versionId)
      .order('validated_at',{ascending:false})
      .limit(1)
      .maybeSingle();
    if(result.error) throw releaseRepositoryError('pack079_validation_lookup_failed',result.error);
    return publicValidation(result.data);
  }

  async function recordArtifact({
    ownerId,projectId,versionId,validationId,
    snapshotSha256,manifestSha256,archiveSha256,
    fileCount,assetCount,archiveBytes,manifest,verifiedReopen
  }) {
    const result=await db.rpc('record_zuvyr_code_release_artifact_pack079',{
      p_owner_id:ownerId,
      p_project_id:projectId,
      p_project_version_id:versionId,
      p_validation_id:validationId,
      p_snapshot_sha256:snapshotSha256,
      p_manifest_sha256:manifestSha256,
      p_archive_sha256:archiveSha256,
      p_file_count:fileCount,
      p_asset_count:assetCount,
      p_archive_bytes:archiveBytes,
      p_manifest:manifest,
      p_verified_reopen:verifiedReopen === true
    });
    if(result.error) throw releaseRepositoryError(
      rpcCode(result.error,'pack079_artifact_record_failed'),
      result.error
    );
    return getArtifact({ownerId,artifactId:result.data.artifact_id});
  }

  async function getArtifact({ownerId,artifactId}) {
    const result=await db.from('code_release_artifacts')
      .select('*')
      .eq('id',artifactId)
      .eq('owner_id',ownerId)
      .maybeSingle();
    if(result.error) throw releaseRepositoryError('pack079_artifact_lookup_failed',result.error);
    if(!result.data) throw releaseRepositoryError('pack079_release_artifact_not_found');
    return publicArtifact(result.data);
  }

  async function listArtifacts({ownerId,projectId,limit=30}) {
    const result=await db.from('code_release_artifacts')
      .select('*')
      .eq('owner_id',ownerId)
      .eq('project_id',projectId)
      .order('created_at',{ascending:false})
      .limit(Math.max(1,Math.min(100,Number(limit)||30)));
    if(result.error) throw releaseRepositoryError('pack079_artifact_list_failed',result.error);
    return Object.freeze((result.data||[]).map(publicArtifact));
  }

  async function getDeploymentTarget({ownerId,projectId,targetId}) {
    const result=await db.from('code_deployment_targets')
      .select('id,owner_id,project_id,provider,provider_project_id,display_name,allowed_targets,status,metadata,created_at,updated_at')
      .eq('id',targetId)
      .eq('owner_id',ownerId)
      .eq('project_id',projectId)
      .eq('status','active')
      .maybeSingle();
    if(result.error) throw releaseRepositoryError('pack079_deployment_target_lookup_failed',result.error);
    if(!result.data) throw releaseRepositoryError('pack079_deployment_target_not_found');
    return Object.freeze({
      id:result.data.id,
      projectId:result.data.project_id,
      provider:result.data.provider,
      displayName:result.data.display_name,
      allowedTargets:Array.isArray(result.data.allowed_targets)
        ? Object.freeze([...result.data.allowed_targets])
        : Object.freeze([]),
      status:result.data.status,
      metadata:result.data.metadata||{}
    });
  }

  async function getDeploymentTargetInternal({ownerId,projectId,targetId}) {
    const result=await db.from('code_deployment_targets')
      .select('*')
      .eq('id',targetId)
      .eq('owner_id',ownerId)
      .eq('project_id',projectId)
      .eq('status','active')
      .maybeSingle();
    if(result.error) throw releaseRepositoryError('pack079_deployment_target_lookup_failed',result.error);
    if(!result.data) throw releaseRepositoryError('pack079_deployment_target_not_found');
    return result.data;
  }

  async function listDeploymentTargets({ownerId,projectId}) {
    const result=await db.from('code_deployment_targets')
      .select('id,owner_id,project_id,provider,display_name,allowed_targets,status,metadata,created_at,updated_at')
      .eq('owner_id',ownerId)
      .eq('project_id',projectId)
      .eq('status','active')
      .order('created_at',{ascending:true});
    if(result.error) throw releaseRepositoryError('pack079_deployment_target_list_failed',result.error);
    return Object.freeze((result.data||[]).map(row=>Object.freeze({
      id:row.id,
      projectId:row.project_id,
      provider:row.provider,
      displayName:row.display_name,
      allowedTargets:Array.isArray(row.allowed_targets)
        ? Object.freeze([...row.allowed_targets])
        : Object.freeze([]),
      status:row.status,
      metadata:row.metadata||{}
    })));
  }

  async function reserveDeploy({
    ownerId,projectId,versionId,validationId,artifactId,
    requestId,target,deploymentTargetId,approvalReceipt
  }) {
    const result=await db.rpc('reserve_zuvyr_code_deploy_request_pack079',{
      p_owner_id:ownerId,
      p_project_id:projectId,
      p_project_version_id:versionId,
      p_validation_id:validationId,
      p_release_artifact_id:artifactId,
      p_request_id:requestId,
      p_target:target,
      p_deployment_target_id:deploymentTargetId,
      p_approval_receipt:approvalReceipt
    });
    if(result.error) throw releaseRepositoryError(
      rpcCode(result.error,'pack079_deploy_reserve_failed'),
      result.error
    );
    return getDeploy({ownerId,deployRequestId:result.data.deploy_request_id});
  }

  async function getDeployInternal({ownerId,deployRequestId}) {
    const result=await db.from('code_deploy_requests')
      .select('*')
      .eq('id',deployRequestId)
      .eq('owner_id',ownerId)
      .maybeSingle();
    if(result.error) throw releaseRepositoryError('pack079_deploy_lookup_failed',result.error);
    if(!result.data) throw releaseRepositoryError('pack079_deploy_request_not_found');
    return result.data;
  }

  async function getDeploy({ownerId,deployRequestId}) {
    return publicDeploy(await getDeployInternal({ownerId,deployRequestId}));
  }

  async function transitionDeploy({
    ownerId,deployRequestId,status,providerDeploymentId=null,
    deploymentUrl=null,previousProductionDeploymentId=null,
    providerReceipt=null,errorCode=null
  }) {
    const result=await db.rpc('transition_zuvyr_code_deploy_request_pack079',{
      p_owner_id:ownerId,
      p_deploy_request_id:deployRequestId,
      p_next_status:status,
      p_provider_deployment_id:providerDeploymentId,
      p_deployment_url:deploymentUrl,
      p_previous_production_deployment_id:previousProductionDeploymentId,
      p_provider_receipt:providerReceipt,
      p_error_code:errorCode
    });
    if(result.error) throw releaseRepositoryError(
      rpcCode(result.error,'pack079_deploy_transition_failed'),
      result.error
    );
    return getDeploy({ownerId,deployRequestId});
  }

  async function listDeploys({ownerId,projectId,limit=30}) {
    const result=await db.from('code_deploy_requests')
      .select('*')
      .eq('owner_id',ownerId)
      .eq('project_id',projectId)
      .order('created_at',{ascending:false})
      .limit(Math.max(1,Math.min(100,Number(limit)||30)));
    if(result.error) throw releaseRepositoryError('pack079_deploy_list_failed',result.error);
    return Object.freeze((result.data||[]).map(publicDeploy));
  }

  async function reserveRollback({
    ownerId,projectId,deployRequestId,requestId,approvalReceipt
  }) {
    const result=await db.rpc('reserve_zuvyr_code_deployment_rollback_pack079',{
      p_owner_id:ownerId,
      p_project_id:projectId,
      p_deploy_request_id:deployRequestId,
      p_request_id:requestId,
      p_approval_receipt:approvalReceipt
    });
    if(result.error) throw releaseRepositoryError(
      rpcCode(result.error,'pack079_rollback_reserve_failed'),
      result.error
    );
    return getRollback({ownerId,rollbackId:result.data.rollback_id});
  }

  async function getRollbackInternal({ownerId,rollbackId}) {
    const result=await db.from('code_deployment_rollbacks')
      .select('*')
      .eq('id',rollbackId)
      .eq('owner_id',ownerId)
      .maybeSingle();
    if(result.error) throw releaseRepositoryError('pack079_rollback_lookup_failed',result.error);
    if(!result.data) throw releaseRepositoryError('pack079_rollback_not_found');
    return result.data;
  }

  async function getRollback({ownerId,rollbackId}) {
    return publicRollback(await getRollbackInternal({ownerId,rollbackId}));
  }

  async function transitionRollback({
    ownerId,rollbackId,status,providerReceipt=null,errorCode=null
  }) {
    const result=await db.rpc('transition_zuvyr_code_deployment_rollback_pack079',{
      p_owner_id:ownerId,
      p_rollback_id:rollbackId,
      p_next_status:status,
      p_provider_receipt:providerReceipt,
      p_error_code:errorCode
    });
    if(result.error) throw releaseRepositoryError(
      rpcCode(result.error,'pack079_rollback_transition_failed'),
      result.error
    );
    return getRollback({ownerId,rollbackId});
  }

  return Object.freeze({
    requireOwnedProject,
    getVersion,
    validateRelease,
    getValidation,
    latestValidation,
    recordArtifact,
    getArtifact,
    listArtifacts,
    getDeploymentTarget,
    getDeploymentTargetInternal,
    listDeploymentTargets,
    reserveDeploy,
    getDeploy,
    getDeployInternal,
    transitionDeploy,
    listDeploys,
    reserveRollback,
    getRollback,
    getRollbackInternal,
    transitionRollback
  });
}

module.exports={
  createCodeReleaseRepository,
  publicValidation,
  publicArtifact,
  publicDeploy,
  publicRollback
};
