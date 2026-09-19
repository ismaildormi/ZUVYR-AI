'use strict';

const express = require('express');
const crypto = require('node:crypto');
const {
  createCodeReleaseRepository
} = require('./codeReleaseRepository');
const {
  buildReleaseZip,
  verifyReleaseZip
} = require('./codeReleaseZip');
const {
  createVercelDeploymentProvider,
  deploymentAvailability,
  assertDeploymentLive,
  assertProviderCredentials
} = require('./codeVercelDeploymentProvider');
const {
  guardDeploymentBeforeExecution,
  guardDeploymentRollbackBeforeExecution
} = require('./codePermissionGuard');

function routeError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function uuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(value || ''));
}

function requiredId(value, code) {
  const result = String(value || '').trim();
  if (!uuid(result)) throw routeError(code);
  return result;
}

function requestId(req) {
  const value =
    String(req.headers['idempotency-key'] || '').trim() ||
    crypto.randomUUID();
  if (!value || value.length > 200) {
    throw routeError('pack079_request_id_invalid');
  }
  return value;
}

function statusFor(error) {
  const code = String(error?.code || '');
  if (
    code.endsWith('_not_found') ||
    code === 'pack079_project_not_found' ||
    code === 'pack079_project_version_not_found'
  ) return 404;
  if (
    code.includes('idempotency') ||
    code.includes('terminal') ||
    code.includes('transition') ||
    code === 'pack079_deploy_not_in_production' ||
    code === 'pack079_previous_production_missing'
  ) return 409;
  if (
    code === 'permission_required' ||
    code === 'permission_request_replayed' ||
    code === 'permission_request_scope_mismatch'
  ) return 403;
  if (
    code === 'pack079_deploy_live_gate_closed' ||
    code === 'pack079_provider_credentials_unavailable' ||
    code.includes('_unavailable')
  ) return 503;
  if (code.startsWith('pack079_provider_')) return 502;
  return 400;
}

function sendError(res, error, fallback = 'pack079_release_request_failed') {
  const code = String(error?.code || fallback);
  return res.status(statusFor(error)).json({
    status:'error',
    code,
    message:'Code release request failed.'
  });
}

function permissionReceipt(result, {
  action,
  requestId: permissionRequestId
} = {}) {
  return Object.freeze({
    allowed:true,
    action,
    grantId:
      result?.grant_id ||
      result?.grantId ||
      null,
    requestId:permissionRequestId,
    replayed:false,
    consumedAt:new Date().toISOString()
  });
}

function cleanProviderReceipt(value) {
  const receipt =
    value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  return Object.freeze({
    provider:'vercel',
    deploymentId:String(receipt.deploymentId || receipt.id || '').slice(0,240) || null,
    state:String(receipt.state || '').slice(0,40) || null,
    url:String(receipt.url || '').slice(0,500) || null,
    action:String(receipt.action || '').slice(0,80) || null,
    observedAt:new Date().toISOString()
  });
}

function createCodeReleaseRouter({
  db,
  deploymentProvider = null,
  permissionApi = null,
  env = process.env
} = {}) {
  if (!db) throw routeError('pack079_repository_unavailable');

  const router = express.Router();
  const releases = createCodeReleaseRepository(db);
  const provider =
    deploymentProvider ||
    createVercelDeploymentProvider({ env });

  async function regenerateArtifact(ownerId, artifact) {
    const validation = await releases.getValidation({
      ownerId,
      validationId:artifact.validationId
    });
    const version = await releases.getVersion({
      ownerId,
      projectId:artifact.projectId,
      versionId:artifact.projectVersionId
    });
    const built = await buildReleaseZip({
      db,
      ownerId,
      projectId:artifact.projectId,
      version,
      validation:{
        snapshot_sha256:validation.snapshotSha256,
        files_digest:validation.filesDigest
      }
    });
    await verifyReleaseZip(built.archive,{
      archiveSha256:artifact.archiveSha256,
      manifestSha256:artifact.manifestSha256
    });
    if (
      built.archiveSha256 !== artifact.archiveSha256 ||
      built.manifestSha256 !== artifact.manifestSha256
    ) {
      throw routeError('pack079_release_artifact_regeneration_mismatch');
    }
    return Object.freeze({ built, validation, version });
  }

  router.get('/release/capabilities', (_req, res) => {
    const live = deploymentAvailability(env);
    return res.json({
      status:'success',
      pack:79,
      zip:{
        format:'zip',
        deterministic:true,
        referencedAssets:true,
        verifiedReopen:true,
        exactSavedVersion:true
      },
      deploy:{
        provider:'vercel',
        live:live.live,
        externalGate:live.externalGate,
        blockers:live.blockers,
        previewDistinctFromProduction:true,
        approval:'permission_center_allow_once'
      },
      rollback:{
        supported:true,
        serverAuthoritativePreviousDeployment:true,
        approval:'deploy.rollback'
      }
    });
  });

  router.get('/projects/:projectId/releases', async (req, res) => {
    try {
      const projectId=requiredId(req.params.projectId,'invalid_code_project_id');
      await releases.requireOwnedProject(req.userId,projectId);
      const [artifacts,deployments,targets]=await Promise.all([
        releases.listArtifacts({
          ownerId:req.userId,
          projectId,
          limit:req.query?.limit
        }),
        releases.listDeploys({
          ownerId:req.userId,
          projectId,
          limit:req.query?.limit
        }),
        releases.listDeploymentTargets({
          ownerId:req.userId,
          projectId
        })
      ]);
      return res.json({
        status:'success',
        projectId,
        artifacts,
        deployments,
        deploymentTargets:targets,
        deploymentAvailability:deploymentAvailability(env)
      });
    } catch(error) {
      return sendError(res,error);
    }
  });

  router.post('/projects/:projectId/releases/:versionId/validate', async (req,res) => {
    try{
      const projectId=requiredId(req.params.projectId,'invalid_code_project_id');
      const versionId=requiredId(req.params.versionId,'invalid_code_project_version_id');
      const validation=await releases.validateRelease({
        ownerId:req.userId,
        projectId,
        versionId
      });
      return res.json({status:'success',validation});
    }catch(error){
      return sendError(res,error,'pack079_release_validation_failed');
    }
  });

  router.post('/projects/:projectId/releases/:versionId/artifacts', async (req,res) => {
    try{
      const projectId=requiredId(req.params.projectId,'invalid_code_project_id');
      const versionId=requiredId(req.params.versionId,'invalid_code_project_version_id');

      let validation=await releases.latestValidation({
        ownerId:req.userId,
        projectId,
        versionId
      });
      if(!validation){
        validation=await releases.validateRelease({
          ownerId:req.userId,
          projectId,
          versionId
        });
      }

      const version=await releases.getVersion({
        ownerId:req.userId,
        projectId,
        versionId
      });
      const built=await buildReleaseZip({
        db,
        ownerId:req.userId,
        projectId,
        version,
        validation:{
          snapshot_sha256:validation.snapshotSha256,
          files_digest:validation.filesDigest
        }
      });
      const verified=await verifyReleaseZip(built.archive,{
        archiveSha256:built.archiveSha256,
        manifestSha256:built.manifestSha256
      });
      if(verified.verified!==true){
        throw routeError('pack079_zip_reopen_not_verified');
      }

      const artifact=await releases.recordArtifact({
        ownerId:req.userId,
        projectId,
        versionId,
        validationId:validation.id,
        snapshotSha256:validation.snapshotSha256,
        manifestSha256:built.manifestSha256,
        archiveSha256:built.archiveSha256,
        fileCount:built.fileCount,
        assetCount:built.assetCount,
        archiveBytes:built.archiveBytes,
        manifest:built.manifest,
        verifiedReopen:true
      });

      return res.status(201).json({
        status:'success',
        artifact:{
          ...artifact,
          filename:built.filename,
          downloadPath:
            '/api/code-studio/release-artifacts/' +
            encodeURIComponent(artifact.id) +
            '/download'
        }
      });
    }catch(error){
      return sendError(res,error,'pack079_release_artifact_failed');
    }
  });

  router.get('/release-artifacts/:artifactId/download', async (req,res) => {
    try{
      const artifactId=requiredId(
        req.params.artifactId,
        'invalid_code_release_artifact_id'
      );
      const artifact=await releases.getArtifact({
        ownerId:req.userId,
        artifactId
      });
      const { built }=await regenerateArtifact(req.userId,artifact);
      res.setHeader('Content-Type','application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="' +
          built.filename.replace(/["\\\r\n]/g,'_') +
          '"'
      );
      res.setHeader('Content-Length',String(built.archive.length));
      res.setHeader('Cache-Control','private, no-store');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('X-ZUVYR-Archive-SHA256',built.archiveSha256);
      return res.end(built.archive);
    }catch(error){
      return sendError(res,error,'pack079_release_download_failed');
    }
  });

  router.post('/projects/:projectId/deployments', async (req,res) => {
    let deploy=null;
    try{
      // Fail before consuming allow-once permission or performing any
      // provider/network mutation while M16/source gate is closed.
      assertDeploymentLive(env);

      const projectId=requiredId(req.params.projectId,'invalid_code_project_id');
      const artifactId=requiredId(
        req.body?.artifactId,
        'invalid_code_release_artifact_id'
      );
      const deploymentTargetId=requiredId(
        req.body?.deploymentTargetId,
        'invalid_code_deployment_target_id'
      );
      const target=String(req.body?.target||'preview').trim().toLowerCase();
      if(!['preview','production'].includes(target)){
        throw routeError('pack079_deploy_target_invalid');
      }

      const rid=requestId(req);
      const existing=await releases.getDeployByRequest({
        ownerId:req.userId,
        requestId:rid
      });
      if(existing){
        if(
          existing.project_id!==projectId ||
          existing.release_artifact_id!==artifactId ||
          existing.deployment_target_id!==deploymentTargetId ||
          existing.target!==target
        ){
          throw routeError('pack079_deploy_idempotency_scope_mismatch');
        }
        return res.json({
          status:'success',
          replayed:true,
          deployment:await releases.getDeploy({
            ownerId:req.userId,
            deployRequestId:existing.id
          })
        });
      }

      const artifact=await releases.getArtifact({
        ownerId:req.userId,
        artifactId
      });
      if(artifact.projectId!==projectId){
        throw routeError('pack079_release_artifact_not_found');
      }
      const validationInternal=await releases.getValidationInternal({
        ownerId:req.userId,
        validationId:artifact.validationId
      });
      const targetInternal=await releases.getDeploymentTargetInternal({
        ownerId:req.userId,
        projectId,
        targetId:deploymentTargetId
      });
      if(
        !Array.isArray(targetInternal.allowed_targets) ||
        !targetInternal.allowed_targets.includes(target)
      ){
        throw routeError('pack079_deployment_target_scope_denied');
      }

      let previousProduction=null;
      if(target==='production'){
        previousProduction=await provider.currentProduction(
          targetInternal.provider_project_id
        );
        if(!previousProduction?.id){
          throw routeError('pack079_previous_production_missing');
        }
      }

      const permission=await guardDeploymentBeforeExecution({
        permissionApi,
        ownerId:req.userId,
        projectId,
        sessionId:String(validationInternal.sandbox_session_id),
        requestId:rid
      });
      const approval=permissionReceipt(permission,{
        action:'deploy.execute',
        requestId:rid
      });

      const { built }=await regenerateArtifact(req.userId,artifact);

      deploy=await releases.reserveDeploy({
        ownerId:req.userId,
        projectId,
        versionId:artifact.projectVersionId,
        validationId:artifact.validationId,
        artifactId:artifact.id,
        requestId:rid,
        target,
        deploymentTargetId,
        approvalReceipt:approval
      });

      deploy=await releases.transitionDeploy({
        ownerId:req.userId,
        deployRequestId:deploy.id,
        status:'uploading',
        previousProductionDeploymentId:previousProduction?.id||null
      });

      const created=await provider.createPreviewDeployment({
        providerProjectId:targetInternal.provider_project_id,
        archive:built.archive,
        artifactSha256:artifact.archiveSha256,
        versionId:artifact.projectVersionId
      });

      deploy=await releases.transitionDeploy({
        ownerId:req.userId,
        deployRequestId:deploy.id,
        status:'deploying',
        providerDeploymentId:created.id,
        deploymentUrl:created.url,
        previousProductionDeploymentId:previousProduction?.id||null,
        providerReceipt:cleanProviderReceipt({
          ...created,
          action:'create_preview'
        })
      });

      const ready=await provider.waitUntilReady(created.id);
      deploy=await releases.transitionDeploy({
        ownerId:req.userId,
        deployRequestId:deploy.id,
        status:'ready',
        providerDeploymentId:ready.id,
        deploymentUrl:ready.url,
        previousProductionDeploymentId:previousProduction?.id||null,
        providerReceipt:cleanProviderReceipt({
          ...ready,
          action:'ready'
        })
      });

      if(target==='preview'){
        return res.status(201).json({
          status:'success',
          replayed:false,
          deployment:deploy
        });
      }

      deploy=await releases.transitionDeploy({
        ownerId:req.userId,
        deployRequestId:deploy.id,
        status:'promoting',
        providerDeploymentId:ready.id,
        deploymentUrl:ready.url,
        previousProductionDeploymentId:previousProduction.id
      });
      await provider.promote({
        providerProjectId:targetInternal.provider_project_id,
        deploymentId:ready.id
      });
      deploy=await releases.transitionDeploy({
        ownerId:req.userId,
        deployRequestId:deploy.id,
        status:'production',
        providerDeploymentId:ready.id,
        deploymentUrl:ready.url,
        previousProductionDeploymentId:previousProduction.id,
        providerReceipt:cleanProviderReceipt({
          ...ready,
          action:'promote'
        })
      });

      return res.status(201).json({
        status:'success',
        replayed:false,
        deployment:deploy
      });
    }catch(error){
      if(deploy?.id && !['production','failed','cancelled','rolled_back'].includes(deploy.status)){
        await releases.transitionDeploy({
          ownerId:req.userId,
          deployRequestId:deploy.id,
          status:'failed',
          errorCode:error.code||error.message,
          providerReceipt:cleanProviderReceipt({action:'failed'})
        }).catch(()=>null);
      }
      return sendError(res,error,'pack079_deploy_failed');
    }
  });

  router.post('/deployments/:deployRequestId/rollback', async (req,res) => {
    let rollback=null;
    try{
      // Emergency rollback must remain available even if M16/source-create
      // gate is subsequently disabled. Provider credentials are still required.
      assertProviderCredentials(env);

      const deployRequestId=requiredId(
        req.params.deployRequestId,
        'invalid_code_deploy_request_id'
      );
      const deploy=await releases.getDeployInternal({
        ownerId:req.userId,
        deployRequestId
      });
      if(deploy.status!=='production'){
        throw routeError('pack079_deploy_not_in_production');
      }
      if(!deploy.previous_production_deployment_id){
        throw routeError('pack079_previous_production_missing');
      }

      const rid=requestId(req);
      const existing=await releases.getRollbackByRequest({
        ownerId:req.userId,
        requestId:rid
      });
      if(existing){
        if(existing.deploy_request_id!==deployRequestId){
          throw routeError('pack079_rollback_idempotency_scope_mismatch');
        }
        return res.json({
          status:'success',
          replayed:true,
          rollback:await releases.getRollback({
            ownerId:req.userId,
            rollbackId:existing.id
          })
        });
      }

      const permission=await guardDeploymentRollbackBeforeExecution({
        permissionApi,
        ownerId:req.userId,
        projectId:deploy.project_id,
        sessionId:deployRequestId,
        requestId:rid
      });
      const approval=permissionReceipt(permission,{
        action:'deploy.rollback',
        requestId:rid
      });

      rollback=await releases.reserveRollback({
        ownerId:req.userId,
        projectId:deploy.project_id,
        deployRequestId,
        requestId:rid,
        approvalReceipt:approval
      });
      const internal=await releases.getRollbackInternal({
        ownerId:req.userId,
        rollbackId:rollback.id
      });

      rollback=await releases.transitionRollback({
        ownerId:req.userId,
        rollbackId:rollback.id,
        status:'rolling_back'
      });

      await provider.rollback({
        providerProjectId:deploy.provider_project_id,
        deploymentId:internal.rollback_to_provider_deployment_id,
        description:'ZUVYR user-approved rollback'
      });

      rollback=await releases.transitionRollback({
        ownerId:req.userId,
        rollbackId:rollback.id,
        status:'succeeded',
        providerReceipt:cleanProviderReceipt({
          deploymentId:internal.rollback_to_provider_deployment_id,
          state:'ROLLED_BACK',
          action:'rollback'
        })
      });
      await releases.transitionDeploy({
        ownerId:req.userId,
        deployRequestId,
        status:'rolled_back',
        providerDeploymentId:deploy.provider_deployment_id,
        deploymentUrl:deploy.deployment_url,
        previousProductionDeploymentId:
          deploy.previous_production_deployment_id,
        providerReceipt:cleanProviderReceipt({
          deploymentId:internal.rollback_to_provider_deployment_id,
          state:'ROLLED_BACK',
          action:'rollback'
        })
      });

      return res.json({
        status:'success',
        replayed:false,
        rollback,
        deployment:await releases.getDeploy({
          ownerId:req.userId,
          deployRequestId
        })
      });
    }catch(error){
      if(rollback?.id && !['succeeded','failed'].includes(rollback.status)){
        await releases.transitionRollback({
          ownerId:req.userId,
          rollbackId:rollback.id,
          status:'failed',
          errorCode:error.code||error.message,
          providerReceipt:cleanProviderReceipt({action:'rollback_failed'})
        }).catch(()=>null);
      }
      return sendError(res,error,'pack079_rollback_failed');
    }
  });

  return router;
}

module.exports={
  createCodeReleaseRouter,
  permissionReceipt,
  cleanProviderReceipt,
  statusFor
};
