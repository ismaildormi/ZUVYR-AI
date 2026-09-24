'use strict';

const express = require('express');
const {
  publicInventory,
  assertWorkspaceExecutionAvailable
} = require('./workspaceCapabilityRegistry');
const {
  getDefaultWorkspaceMemoryStore
} = require('./workspaceMemoryRepository');
const {
  getDefaultWorkspaceContextGraphStore
} = require('./workspaceContextGraphRepository');
const { normalizeWorkspaceItem } = require('./workspaceItemContract');
const { normalizeWorkspaceProject } = require('./workspaceProjectContract');
const { normalizeCreation } = require('./workspaceCreationContract');
const { normalizeTemplate } = require('./workspaceTemplateContract');
const { normalizeSchedule } = require('./workspaceScheduleContract');
const {
  normalizeIntegrationRequest,
  assertNoCredentialMaterial
} = require('./workspaceIntegrationContract');
const {
  normalizeIntegrationDraft,
  normalizePluginDraft,
  normalizeSkill,
  uuid: connectionUuid
} = require('./workspaceConnectionContract');
const {
  getDefaultWorkspaceConnectionStore
} = require('./workspaceConnectionRepository');
const {
  getDefaultWorkspaceToolRuntime
} = require('./workspaceToolRuntime');
const {
  getDefaultWorkspaceGoogleDriveRuntime
} = require('./workspaceGoogleDrive');
const { normalizeWorkflow } = require('./workspaceWorkflowContract');
const { text, uuid, object, fail } = require('./workspaceValidation');
const {
  RESOURCE_TYPES,
  getDefaultWorkspaceProjectStore
} = require('./workspaceProjectRepository');
const { getDefaultWorkspaceLibraryStore } = require('./workspaceLibraryRepository');
const { getDefaultUniversalActionsStore } = require('./universalActionsRepository');
const { getDefaultDocumentStudioRepository } = require('./documentStudioRepository');
const { getDefaultOfficeArtifactRepository } = require('./officeArtifactRepository');
const { getDefaultResearchArtifactCheckpointRepository } = require('./researchArtifactCheckpointRepository');
const { getDefaultImageGenerationRepository } = require('./imageGenerationRepository');

function validation(res, error) {
  return res.status(400).json({
    status: 'error',
    code: error.code || 'invalid_workspace_request',
    message: 'Workspace request validation failed.'
  });
}

function disabled(res, operation) {
  try {
    assertWorkspaceExecutionAvailable(operation);
  } catch (error) {
    return res.status(503).json({
      status: 'error',
      code: error.code,
      operation,
      executionEnabled: false,
      externalWriteExecuted: false
    });
  }
  return res.status(501).json({
    status: 'error',
    code: 'workspace_executor_unavailable',
    operation,
    executionEnabled: false,
    externalWriteExecuted: false
  });
}

function projectFailure(res, error) {
  const code = String(error && (error.code || error.message) || '');
  if (
    code === 'workspace_project_not_found' ||
    code === 'workspace_project_resource_not_found'
  ) {
    return res.status(404).json({
      status: 'error',
      code,
      message: 'Project resource was not found.'
    });
  }

  if (code === 'workspace_project_update_empty') {
    return res.status(400).json({
      status: 'error',
      code,
      message: 'Project update is empty.'
    });
  }

  if (
    code === 'workspace_project_item_limit' ||
    code === 'workspace_project_content_already_linked' ||
    code === 'workspace_project_archived'
  ) {
    return res.status(409).json({
      status: 'error',
      code,
      message: 'Project state conflicts with this operation.'
    });
  }

  console.error('[workspace/projects] operation failed:', code || 'unknown');
  return res.status(500).json({
    status: 'error',
    code: 'workspace_project_operation_failed',
    message: 'Project operation could not be completed.'
  });
}

function libraryFailure(res,error){const c=error?.code||'workspace_library_operation_failed';if(['workspace_library_item_not_found','workspace_library_asset_not_found'].includes(c))return res.status(404).json({status:'error',code:c,message:'Library item was not found.'});if(['workspace_library_filter_invalid','workspace_library_destination_invalid'].includes(c))return res.status(400).json({status:'error',code:c,message:'Library request is invalid.'});if(['workspace_library_legal_hold','workspace_library_item_deleted','workspace_library_destination_unsupported'].includes(c))return res.status(409).json({status:'error',code:c,message:'Library action is unavailable.'});console.error('[workspace/library] operation failed:',c);return res.status(500).json({status:'error',code:'workspace_library_operation_failed',message:'Library operation failed.'})}
function assertProjectWriteEnabled() {
  assertWorkspaceExecutionAvailable('workspace_write');
}

function normalizeProjectPatch(input) {
  const value = object(input, 'invalid_workspace_project_patch');
  const patch = {};

  if (value.name !== undefined) {
    patch.name = text(value.name, {
      code: 'invalid_workspace_project_name',
      max: 120
    });
  }

  if (value.description !== undefined) {
    patch.description = text(value.description, {
      code: 'invalid_workspace_project_description',
      max: 2000,
      optional: true
    });
  }

  if (value.sharedContextEnabled !== undefined) {
    if (typeof value.sharedContextEnabled !== 'boolean') {
      fail('invalid_workspace_project_shared_context');
    }
    patch.sharedContextEnabled = value.sharedContextEnabled;
  }

  if (value.archived !== undefined) {
    if (typeof value.archived !== 'boolean') {
      fail('invalid_workspace_project_archived');
    }
    patch.archived = value.archived;
  }

  if (!Object.keys(patch).length) {
    fail('workspace_project_update_empty');
  }

  return patch;
}

function normalizeResourceRequest(input) {
  const value = object(input, 'invalid_workspace_project_resource');
  const resourceType = String(value.type || '').trim().toLowerCase();

  if (!RESOURCE_TYPES.has(resourceType)) {
    fail('workspace_project_resource_type_invalid');
  }

  return {
    resourceType,
    resourceId: uuid(
      value.id,
      'invalid_workspace_project_resource_id'
    )
  };
}

function createWorkspaceRouter(options = {}) {
  const router = express.Router();
  const projectStore =
    options.projectStore || getDefaultWorkspaceProjectStore();
  const libraryStore = options.libraryStore || getDefaultWorkspaceLibraryStore();
  const universalActionsStore = options.universalActionsStore || getDefaultUniversalActionsStore({ libraryStore });
  const documentStudio = options.documentStudio || getDefaultDocumentStudioRepository({ projectStore });
  const officeStudio = options.officeStudio || getDefaultOfficeArtifactRepository({ projectStore });
  const researchCheckpoint = options.researchCheckpoint || getDefaultResearchArtifactCheckpointRepository({ documentStudio, officeStudio, libraryStore, projectStore });
  const imageGenerationStore = options.imageGenerationStore || getDefaultImageGenerationRepository();
  const connectionStore = options.connectionStore || getDefaultWorkspaceConnectionStore();
  const toolRuntime = options.toolRuntime || getDefaultWorkspaceToolRuntime();
  const googleDriveRuntime = options.googleDriveRuntime || getDefaultWorkspaceGoogleDriveRuntime();
  const memoryStore =
    options.memoryStore || getDefaultWorkspaceMemoryStore();
  const contextGraphStore =
    options.contextGraphStore || getDefaultWorkspaceContextGraphStore();

  router.get(
    '/capabilities',
    (_req, res) => res.json({
      status: 'success',
      ...publicInventory()
    })
  );

  router.get('/images/history', async (req,res) => {
    try {
      const history = await imageGenerationStore.listHistory({ ownerId:req.userId, limit:req.query?.limit });
      return res.json({status:'success',history,pack:61,providerCalls:0});
    } catch(error) {
      console.error('[workspace/images] history failed:', error?.code || error?.message || 'unknown');
      return res.status(500).json({status:'error',code:'image_history_operation_failed',message:'Image history could not be loaded.'});
    }
  });

  router.get('/images/:jobId/reopen', async (req,res) => {
    try {
      const item =
        await imageGenerationStore.reopenStudioItem({
          ownerId:
            req.userId,
          jobId:
            uuid(
              req.params.jobId,
              'invalid_image_studio_job_id'
            )
        });

      return res.json({
        status: 'success',
        item,
        pack: 65,
        providerCalls: 0
      });
    } catch (error) {
      const code =
        String(
          error?.code ||
          error?.message ||
          ''
        );

      if (code.startsWith('invalid_')) {
        return validation(res, error);
      }

      if (
        code === 'image_studio_item_not_found' ||
        code === 'image_studio_asset_not_found'
      ) {
        return res.status(404).json({
          status: 'error',
          code,
          message:
            'Image Studio item was not found.'
        });
      }

      console.error(
        '[workspace/images] reopen failed:',
        code || 'unknown'
      );

      return res.status(500).json({
        status: 'error',
        code:
          'image_studio_reopen_failed',
        message:
          'Image Studio item could not be reopened.'
      });
    }
  });

  router.post('/images/:jobId/rollback', async (req,res) => {
    try {
      const result = await imageGenerationStore.rollbackEdit({
        ownerId: req.userId,
        jobId: uuid(
          req.params.jobId,
          'invalid_image_rollback_job_id'
        )
      });

      return res.json({
        status: 'success',
        rollback: result,
        providerCalls: 0,
        sourcePreserved: true
      });
    } catch (error) {
      const code = String(error?.code || error?.message || '');
      if (code.startsWith('invalid_')) {
        return validation(res, error);
      }
      if (code === 'image_job_not_found' || code === 'image_rollback_source_not_found') {
        return res.status(404).json({
          status: 'error',
          code,
          message: 'Image rollback source was not found.'
        });
      }
      if (code === 'image_rollback_not_available' || code === 'image_rollback_source_missing') {
        return res.status(409).json({
          status: 'error',
          code,
          message: 'This image job has no reversible edit source.'
        });
      }
      console.error(
        '[workspace/images] rollback failed:',
        code || 'unknown'
      );
      return res.status(500).json({
        status: 'error',
        code: 'image_rollback_operation_failed',
        message: 'Image rollback could not be completed.'
      });
    }
  });
  function memoryFailure(res, error) {
    const code = error?.code || 'workspace_memory_operation_failed';
    if (code === 'workspace_memory_not_found') return res.status(404).json({status:'error',code,message:'Memory was not found.'});
    if (code === 'workspace_memory_undo_unavailable' || code === 'workspace_memory_scope_invalid') return res.status(409).json({status:'error',code,message:'Memory action is not available.'});
    if (code.includes('invalid') || code.endsWith('_empty')) return res.status(400).json({status:'error',code,message:'Memory request is invalid.'});
    console.error('[workspace/memory] operation failed:', code);
    return res.status(500).json({status:'error',code:'workspace_memory_operation_failed',message:'Memory operation could not be completed.'});
  }

  router.get('/memory/preferences', async (req,res) => {
    try { return res.json({status:'success',preferences:await memoryStore.getPreferences(req.userId)}); }
    catch(error){ return memoryFailure(res,error); }
  });

  router.patch('/memory/preferences', async (req,res) => {
    try { const preferences=await memoryStore.updatePreferences(req.userId,req.body||{}); return res.json({status:'success',preferences,memory_updated:true}); }
    catch(error){ return memoryFailure(res,error); }
  });

  router.get('/memory/items', async (req,res) => {
    try { return res.json({status:'success',...(await memoryStore.listItems(req.userId,req.query||{}))}); }
    catch(error){ return memoryFailure(res,error); }
  });

  router.post('/memory/items', async (req,res) => {
    try { const item=await memoryStore.createItem(req.userId,req.body||{}); return res.status(201).json({status:'success',item,memory_updated:true}); }
    catch(error){ return memoryFailure(res,error); }
  });

  router.get('/memory/items/:memoryId', async (req,res) => {
    try { const item=await memoryStore.getItem(req.userId,uuid(req.params.memoryId,'invalid_workspace_memory_id')); return res.json({status:'success',item}); }
    catch(error){ if(error?.code?.startsWith('invalid_'))return validation(res,error); return memoryFailure(res,error); }
  });

  router.patch('/memory/items/:memoryId', async (req,res) => {
    try { const item=await memoryStore.updateItem(req.userId,uuid(req.params.memoryId,'invalid_workspace_memory_id'),req.body||{}); return res.json({status:'success',item,memory_updated:true}); }
    catch(error){ if(error?.code?.startsWith('invalid_'))return validation(res,error); return memoryFailure(res,error); }
  });

  router.post('/memory/items/:memoryId/undo', async (req,res) => {
    try { const item=await memoryStore.undoItem(req.userId,uuid(req.params.memoryId,'invalid_workspace_memory_id')); return res.json({status:'success',item,memory_updated:true}); }
    catch(error){ if(error?.code?.startsWith('invalid_'))return validation(res,error); return memoryFailure(res,error); }
  });

  router.delete('/memory/items/:memoryId', async (req,res) => {
    try { const result=await memoryStore.forgetItem(req.userId,uuid(req.params.memoryId,'invalid_workspace_memory_id')); return res.json({status:'success',result,memory_updated:true}); }
    catch(error){ if(error?.code?.startsWith('invalid_'))return validation(res,error); return memoryFailure(res,error); }
  });

  router.get('/memory/context', async (req,res) => {
    try { const result=await memoryStore.retrieveContext(req.userId,req.query||{}); return res.json({status:'success',...result}); }
    catch(error){ return memoryFailure(res,error); }
  });
  function contextGraphFailure(res,error) {
    const code=error?.code||'workspace_context_graph_operation_failed';
    if(code.includes('input_invalid')) return res.status(400).json({status:'error',code,message:'Context graph request is invalid.'});
    console.error('[workspace/context-graph] operation failed:',code);
    return res.status(500).json({status:'error',code:'workspace_context_graph_operation_failed',message:'Context graph operation could not be completed.'});
  }

  router.get('/context-graph/query', async (req,res) => {
    try { return res.json({status:'success',graph:await contextGraphStore.query(req.userId,req.query||{})}); }
    catch(error){ return contextGraphFailure(res,error); }
  });

  router.get('/context-graph/brain', async (req,res) => {
    try { return res.json({status:'success',context:await contextGraphStore.getBrainContext(req.userId,req.query||{})}); }
    catch(error){ return contextGraphFailure(res,error); }
  });

  router.get('/context-graph/manager', async (req,res) => {
    try { return res.json({status:'success',context:await contextGraphStore.getManagerContext(req.userId,req.query||{})}); }
    catch(error){ return contextGraphFailure(res,error); }
  });



  router.post('/library/items/validate', (req, res) => {
    try {
      return res.json({
        status: 'success',
        item: normalizeWorkspaceItem(req.body?.item),
        persisted: false
      });
    } catch (error) {
      return validation(res, error);
    }
  });

  // Kept for compatibility and preflight validation. Real persistence is
  router.get('/library/items',async(req,res)=>{try{return res.json({status:'success',persisted:true,...await libraryStore.listItems({ownerId:req.userId,filters:req.query||{}})})}catch(e){return libraryFailure(res,e)}});
  router.get('/library/items/:contentId',async(req,res)=>{try{return res.json({status:'success',persisted:true,item:await libraryStore.getItem({ownerId:req.userId,contentId:uuid(req.params.contentId,'invalid_workspace_library_content_id')})})}catch(e){if(e?.code?.startsWith('invalid_'))return validation(res,e);return libraryFailure(res,e)}});
  router.post('/library/items/:contentId/download',async(req,res)=>{try{return res.json({status:'success',download:await libraryStore.createDownload({ownerId:req.userId,contentId:uuid(req.params.contentId,'invalid_workspace_library_content_id'),assetId:req.body?.assetId?uuid(req.body.assetId,'invalid_workspace_library_asset_id'):null})})}catch(e){if(e?.code?.startsWith('invalid_'))return validation(res,e);return libraryFailure(res,e)}});
  router.delete('/library/items/:contentId',async(req,res)=>{try{assertProjectWriteEnabled();return res.json({status:'success',persisted:true,item:await libraryStore.softDelete({ownerId:req.userId,contentId:uuid(req.params.contentId,'invalid_workspace_library_content_id')})})}catch(e){if(e?.code?.startsWith('invalid_'))return validation(res,e);if(e?.code==='workspace_executor_unavailable')return executorUnavailable(res,'workspace_write');return libraryFailure(res,e)}});
  router.post('/library/items/:contentId/restore',async(req,res)=>{try{assertProjectWriteEnabled();return res.json({status:'success',persisted:true,item:await libraryStore.restore({ownerId:req.userId,contentId:uuid(req.params.contentId,'invalid_workspace_library_content_id')})})}catch(e){if(e?.code?.startsWith('invalid_'))return validation(res,e);if(e?.code==='workspace_executor_unavailable')return executorUnavailable(res,'workspace_write');return libraryFailure(res,e)}});
  function universalActionFailure(res,e){
    const code=e?.code||'workspace_universal_action_failed';
    if(code==='workspace_universal_action_not_found'||code.includes('source_content_not_found')||code.includes('source_version_not_found')) return res.status(404).json({status:'error',code,message:'Action source was not found.'});
    if(code==='workspace_universal_permission_required') return res.status(403).json({status:'error',code,message:'A current scoped project permission is required.'});
    if(code.includes('already_current')||code.includes('path_conflict')||code.includes('reference_changed')||code.includes('not_undoable')) return res.status(409).json({status:'error',code,message:'Action conflicts with the current resource state.'});
    if(code.includes('invalid')||code.includes('mismatch')||code.includes('missing')) return res.status(400).json({status:'error',code,message:'Universal action request is invalid.'});
    console.error('[workspace/universal-actions] operation failed:',code);
    return res.status(500).json({status:'error',code:'workspace_universal_action_failed',message:'Universal action could not be completed.'});
  }
  router.post('/library/items/:contentId/send-to',async(req,res)=>{
    try{
      const handoff=await universalActionsStore.sendTo({
        ownerId:req.userId,
        contentId:uuid(req.params.contentId,'invalid_workspace_library_content_id'),
        destination:req.body?.destination,
        codeProjectId:req.body?.codeProjectId?uuid(req.body.codeProjectId,'invalid_code_project_id'):null,
        path:req.body?.path||null,
        sessionId:req.body?.sessionId||null,
        requestId:req.body?.requestId||null,
        metadata:req.body?.metadata||{}
      });
      return res.json({status:'success',handoff});
    }catch(e){if(e?.code?.startsWith('invalid_'))return validation(res,e);return universalActionFailure(res,e)}
  });
  router.post('/library/items/:contentId/actions',async(req,res)=>{
    try{
      const action=await universalActionsStore.createContextAction({
        ownerId:req.userId,contentId:uuid(req.params.contentId,'invalid_workspace_library_content_id'),
        action:req.body?.action,requestId:req.body?.requestId||null,metadata:req.body?.metadata||{}
      });
      return res.status(201).json({status:'success',action});
    }catch(e){if(e?.code?.startsWith('invalid_'))return validation(res,e);return universalActionFailure(res,e)}
  });
  router.get('/library/items/:contentId/versions/compare',async(req,res)=>{
    try{
      const comparison=await universalActionsStore.compareVersions({
        ownerId:req.userId,contentId:uuid(req.params.contentId,'invalid_workspace_library_content_id'),
        fromVersionId:uuid(req.query.fromVersionId,'invalid_workspace_content_version_id'),
        toVersionId:uuid(req.query.toVersionId,'invalid_workspace_content_version_id')
      });
      return res.json({status:'success',comparison});
    }catch(e){if(e?.code?.startsWith('invalid_'))return validation(res,e);return universalActionFailure(res,e)}
  });
  router.post('/library/items/:contentId/versions/:versionId/restore',async(req,res)=>{
    try{
      assertProjectWriteEnabled();
      const action=await universalActionsStore.restoreVersion({
        ownerId:req.userId,contentId:uuid(req.params.contentId,'invalid_workspace_library_content_id'),
        versionId:uuid(req.params.versionId,'invalid_workspace_content_version_id'),
        requestId:req.body?.requestId||null,metadata:req.body?.metadata||{}
      });
      return res.json({status:'success',action});
    }catch(e){if(e?.code==='workspace_executor_unavailable')return executorUnavailable(res,'workspace_write');if(e?.code?.startsWith('invalid_'))return validation(res,e);return universalActionFailure(res,e)}
  });
  router.get('/actions/:actionId',async(req,res)=>{
    try{return res.json({status:'success',action:await universalActionsStore.getAction({ownerId:req.userId,actionId:uuid(req.params.actionId,'invalid_universal_action_id')})})}
    catch(e){if(e?.code?.startsWith('invalid_'))return validation(res,e);return universalActionFailure(res,e)}
  });
  router.post('/actions/:actionId/undo',async(req,res)=>{
    try{
      const action=await universalActionsStore.undoAction({
        ownerId:req.userId,actionId:uuid(req.params.actionId,'invalid_universal_action_id'),
        sessionId:req.body?.sessionId||null,requestId:req.body?.requestId||null
      });
      return res.json({status:'success',action});
    }catch(e){if(e?.code?.startsWith('invalid_'))return validation(res,e);return universalActionFailure(res,e)}
  });

  // provided by the CRUD routes below.
  router.post('/projects/validate', (req, res) => {
    try {
      return res.json({
        status: 'success',
        project: normalizeWorkspaceProject(req.body?.project),
        persisted: false
      });
    } catch (error) {
      return validation(res, error);
    }
  });

  router.get('/projects', async (req, res) => {
    try {
      const projects = await projectStore.listProjects({
        ownerId: req.userId,
        archived: req.query.archived,
        limit: req.query.limit
      });
      return res.json({
        status: 'success',
        persisted: true,
        projects
      });
    } catch (error) {
      return projectFailure(res, error);
    }
  });

  router.post('/projects', async (req, res) => {
    let project;
    try {
      assertProjectWriteEnabled();
      project = normalizeWorkspaceProject(req.body?.project);
    } catch (error) {
      if (error.code && error.code.includes('disabled')) {
        return disabled(res, 'workspace_write');
      }
      return validation(res, error);
    }

    try {
      const created = await projectStore.createProject({
        ownerId: req.userId,
        project
      });

      // If validated items were supplied, only link items already represented
      // by a concrete source type via the dedicated resource route. We do not
      // fake persistence of arbitrary client-provided items here.
      return res.status(201).json({
        status: 'success',
        persisted: true,
        project: created
      });
    } catch (error) {
      return projectFailure(res, error);
    }
  });

  router.get('/projects/:projectId', async (req, res) => {
    let projectId;
    try {
      projectId = uuid(
        req.params.projectId,
        'invalid_workspace_project_id'
      );
    } catch (error) {
      return validation(res, error);
    }

    try {
      const project = await projectStore.getProject({
        ownerId: req.userId,
        projectId
      });
      return res.json({
        status: 'success',
        persisted: true,
        project
      });
    } catch (error) {
      return projectFailure(res, error);
    }
  });

  router.patch('/projects/:projectId', async (req, res) => {
    let projectId;
    let patch;
    try {
      assertProjectWriteEnabled();
      projectId = uuid(
        req.params.projectId,
        'invalid_workspace_project_id'
      );
      patch = normalizeProjectPatch(req.body || {});
    } catch (error) {
      if (error.code && error.code.includes('disabled')) {
        return disabled(res, 'workspace_write');
      }
      return validation(res, error);
    }

    try {
      const project = await projectStore.updateProject({
        ownerId: req.userId,
        projectId,
        patch
      });
      return res.json({
        status: 'success',
        persisted: true,
        project
      });
    } catch (error) {
      return projectFailure(res, error);
    }
  });

  router.post('/projects/:projectId/resources', async (req, res) => {
    let projectId;
    let resource;
    try {
      assertProjectWriteEnabled();
      projectId = uuid(
        req.params.projectId,
        'invalid_workspace_project_id'
      );
      resource = normalizeResourceRequest(req.body?.resource);
    } catch (error) {
      if (error.code && error.code.includes('disabled')) {
        return disabled(res, 'workspace_write');
      }
      return validation(res, error);
    }

    try {
      const project = await projectStore.linkResource({
        ownerId: req.userId,
        projectId,
        ...resource
      });
      return res.status(201).json({
        status: 'success',
        persisted: true,
        project
      });
    } catch (error) {
      return projectFailure(res, error);
    }
  });

  router.delete(
    '/projects/:projectId/resources/:itemId',
    async (req, res) => {
      let projectId;
      let itemId;
      try {
        assertProjectWriteEnabled();
        projectId = uuid(
          req.params.projectId,
          'invalid_workspace_project_id'
        );
        itemId = uuid(
          req.params.itemId,
          'invalid_workspace_item_id'
        );
      } catch (error) {
        if (error.code && error.code.includes('disabled')) {
          return disabled(res, 'workspace_write');
        }
        return validation(res, error);
      }

      try {
        const project = await projectStore.unlinkResource({
          ownerId: req.userId,
          projectId,
          itemId
        });
        return res.json({
          status: 'success',
          persisted: true,
          project
        });
      } catch (error) {
        return projectFailure(res, error);
      }
    }
  );

  function documentFailure(res, error) {
    const code = String(error && (error.code || error.message) || 'document_operation_failed');
    const status = Number(error && error.status);
    if (Number.isInteger(status) && status >= 400 && status < 600) {
      return res.status(status).json({ status: 'error', code, message: 'Document operation could not be completed.' });
    }
    if (code === 'workspace_project_not_found' || code === 'workspace_project_resource_not_found') {
      return res.status(404).json({ status: 'error', code, message: 'Document project was not found.' });
    }
    if (code === 'workspace_project_item_limit' || code === 'workspace_project_archived') {
      return res.status(409).json({ status: 'error', code, message: 'Document project cannot accept this item.' });
    }
    if (code.includes('invalid_') || code.includes('_blocked') || code.includes('_missing')) {
      return res.status(400).json({ status: 'error', code, message: 'Document request is invalid.' });
    }
    console.error('[workspace/documents] operation failed:', code);
    return res.status(500).json({ status: 'error', code: 'document_operation_failed', message: 'Document operation could not be completed.' });
  }

  router.get('/documents', async (req, res) => {
    try {
      const result = await libraryStore.listItems({ ownerId: req.userId, filters: { ...(req.query || {}), kind: 'document' } });
      const items = (result.items || []).filter(item => item?.metadata?.documentTemplate !== true);
      return res.json({ status: 'success', persisted: true, ...result, items });
    } catch (error) {
      return libraryFailure(res, error);
    }
  });

  router.get('/documents/templates', async (req, res) => {
    try {
      return res.json({ status: 'success', persisted: true, templates: await documentStudio.listTemplates(req.userId) });
    } catch (error) {
      return documentFailure(res, error);
    }
  });

  router.post('/documents/templates', async (req, res) => {
    try {
      assertProjectWriteEnabled();
      const template = await documentStudio.saveTemplate({ ownerId: req.userId, input: req.body || {} });
      return res.status(201).json({ status: 'success', persisted: true, template, providerCalls: 0, billedCredits: 0, liveBillingAllowed: false });
    } catch (error) {
      if (error?.code === 'workspace_workspace_write_disabled') return disabled(res, 'workspace_write');
      return documentFailure(res, error);
    }
  });

  router.post('/documents/render', async (req, res) => {
    try {
      assertProjectWriteEnabled();
      const document = await documentStudio.renderDocument({ ownerId: req.userId, input: req.body || {} });
      return res.status(201).json({ status: 'success', persisted: true, document });
    } catch (error) {
      if (error?.code === 'workspace_workspace_write_disabled') return disabled(res, 'workspace_write');
      return documentFailure(res, error);
    }
  });

  function officeFailure(res, error) {
    const code = String(error && (error.code || error.message) || 'office_artifact_operation_failed');
    const status = Number(error && error.status);
    if (Number.isInteger(status) && status >= 400 && status < 600) {
      return res.status(status).json({ status: 'error', code, message: 'Office artifact operation could not be completed.' });
    }
    if (code === 'workspace_project_not_found' || code === 'workspace_project_resource_not_found') {
      return res.status(404).json({ status: 'error', code, message: 'Artifact project was not found.' });
    }
    if (code.includes('invalid_') || code.includes('_disabled') || code.includes('_missing') || code.includes('_requires_')) {
      return res.status(400).json({ status: 'error', code, message: 'Office artifact request is invalid.' });
    }
    console.error('[workspace/office-artifacts] operation failed:', code);
    return res.status(500).json({ status: 'error', code: 'office_artifact_operation_failed', message: 'Office artifact operation could not be completed.' });
  }

  async function officeList(req, res, artifactKind) {
    try {
      const result = await libraryStore.listItems({ ownerId: req.userId, filters: { ...(req.query || {}), kind: 'document' } });
      const items = (result.items || []).filter(item => item?.metadata?.officeArtifactKind === artifactKind);
      return res.json({ status: 'success', persisted: true, ...result, items });
    } catch (error) {
      return libraryFailure(res, error);
    }
  }

  router.get('/spreadsheets', async (req, res) => officeList(req, res, 'spreadsheet'));
  router.post('/spreadsheets/render', async (req, res) => {
    try {
      assertProjectWriteEnabled();
      const spreadsheet = await officeStudio.renderSpreadsheet({ ownerId: req.userId, input: req.body || {} });
      return res.status(201).json({ status: 'success', persisted: true, spreadsheet });
    } catch (error) {
      if (error?.code === 'workspace_workspace_write_disabled') return disabled(res, 'workspace_write');
      return officeFailure(res, error);
    }
  });

  router.get('/presentations', async (req, res) => officeList(req, res, 'presentation'));
  router.post('/presentations/render', async (req, res) => {
    try {
      assertProjectWriteEnabled();
      const presentation = await officeStudio.renderPresentation({ ownerId: req.userId, input: req.body || {} });
      return res.status(201).json({ status: 'success', persisted: true, presentation });
    } catch (error) {
      if (error?.code === 'workspace_workspace_write_disabled') return disabled(res, 'workspace_write');
      return officeFailure(res, error);
    }
  });

  function researchCheckpointFailure(res, error) {
    const code = String(error && (error.code || error.message) || 'research_checkpoint_failed');
    const status = Number(error && error.status);
    if (Number.isInteger(status) && status >= 400 && status < 600) {
      return res.status(status).json({ status: 'error', code, message: 'Research artifact handoff could not be completed.' });
    }
    if (code.includes('source_record_not_found') || code.includes('sources_lookup_failed')) {
      return res.status(404).json({ status: 'error', code, message: 'A verified research source was not found.' });
    }
    if (code.includes('invalid_') || code.includes('_required') || code.includes('_too_large')) {
      return res.status(400).json({ status: 'error', code, message: 'Research artifact handoff request is invalid.' });
    }
    console.error('[workspace/research-artifacts] operation failed:', code);
    return res.status(500).json({ status: 'error', code: 'research_checkpoint_failed', message: 'Research artifact handoff could not be completed.' });
  }

  router.post('/research/artifacts', async (req, res) => {
    try {
      assertProjectWriteEnabled();
      const controller = new AbortController();
      req.once('aborted', () => controller.abort());
      const checkpoint = await researchCheckpoint.create({
        ownerId: req.userId,
        input: req.body || {},
        signal: controller.signal
      });
      return res.status(201).json({ status: 'success', persisted: true, checkpoint });
    } catch (error) {
      if (error?.code === 'workspace_workspace_write_disabled') return disabled(res, 'workspace_write');
      return researchCheckpointFailure(res, error);
    }
  });

  router.post('/creations/validate', (req, res) => {
    try {
      return res.json({
        status: 'success',
        creation: normalizeCreation(req.body?.creation),
        generated: false
      });
    } catch (error) {
      return validation(res, error);
    }
  });

  router.post('/templates/validate', (req, res) => {
    try {
      return res.json({
        status: 'success',
        template: normalizeTemplate(req.body?.template),
        persisted: false
      });
    } catch (error) {
      return validation(res, error);
    }
  });

  router.post('/workflows/validate', (req, res) => {
    try {
      return res.json({
        status: 'success',
        workflow: normalizeWorkflow(req.body?.workflow),
        persisted: false
      });
    } catch (error) {
      return validation(res, error);
    }
  });

  router.post('/schedules/validate', (req, res) => {
    try {
      return res.json({
        status: 'success',
        schedule: normalizeSchedule(req.body?.schedule),
        persisted: false
      });
    } catch (error) {
      return validation(res, error);
    }
  });

  router.post('/integrations/validate', (req, res) => {
    try {
      assertNoCredentialMaterial(req.body);
      return res.json({
        status: 'success',
        request: normalizeIntegrationRequest(req.body?.request),
        connected: false
      });
    } catch (error) {
      return validation(res, error);
    }
  });

  router.get('/connections', async (req, res) => {
    try {
      const connections = await connectionStore.list(req.userId, { limit: req.query?.limit });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', ...connections });
    } catch (error) {
      return res.status(500).json({ status: 'error', code: error.code || 'workspace_connections_read_failed' });
    }
  });

  router.post('/connections/integrations', async (req, res) => {
    try {
      const draft = normalizeIntegrationDraft(req.body);
      const result = await connectionStore.createOrReuseIntegration({
        ownerId: req.userId,
        ...draft
      });
      res.set('Cache-Control', 'no-store');
      return res.status(result.created ? 201 : 200).json({ status: 'success', connection: result.connection });
    } catch (error) {
      return validation(res, error);
    }
  });

  router.post('/connections/plugins', async (req, res) => {
    try {
      const draft = normalizePluginDraft(req.body);
      const connection = await connectionStore.createPlugin({
        ownerId: req.userId,
        ...draft
      });
      res.set('Cache-Control', 'no-store');
      return res.status(201).json({ status: 'success', connection });
    } catch (error) {
      return validation(res, error);
    }
  });

  router.post('/connections/integrations/:id/revoke', async (req, res) => {
    try {
      const result = await connectionStore.revokeIntegration({
        ownerId: req.userId,
        connectionId: connectionUuid(req.params.id)
      });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', result });
    } catch (error) {
      const code = error.code || 'workspace_integration_revoke_failed';
      const status = /invalid|not_found/.test(code) ? 400 : 500;
      return res.status(status).json({ status: 'error', code });
    }
  });

  router.post('/connections/plugins/:id/revoke', async (req, res) => {
    try {
      const result = await connectionStore.revokePlugin({
        ownerId: req.userId,
        connectionId: connectionUuid(req.params.id)
      });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', result });
    } catch (error) {
      const code = error.code || 'workspace_plugin_revoke_failed';
      const status = /invalid|not_found/.test(code) ? 400 : 500;
      return res.status(status).json({ status: 'error', code });
    }
  });

  router.get('/skills', async (req, res) => {
    try {
      const skills = await connectionStore.listSkills(req.userId, { limit: req.query?.limit });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', skills });
    } catch (error) {
      return res.status(500).json({ status: 'error', code: error.code || 'workspace_skills_read_failed' });
    }
  });

  router.post('/skills', async (req, res) => {
    try {
      const skill = normalizeSkill(req.body);
      const created = await connectionStore.createSkill({ ownerId: req.userId, ...skill });
      res.set('Cache-Control', 'no-store');
      return res.status(201).json({ status: 'success', skill: created });
    } catch (error) {
      return validation(res, error);
    }
  });

  router.post('/skills/:id/enabled', async (req, res) => {
    try {
      if (typeof req.body?.enabled !== 'boolean') {
        const error = new Error('invalid_workspace_skill_enabled');
        error.code = 'invalid_workspace_skill_enabled';
        throw error;
      }
      const skill = await connectionStore.setSkillEnabled({
        ownerId: req.userId,
        skillId: connectionUuid(req.params.id, 'invalid_workspace_skill_id'),
        enabled: req.body.enabled
      });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', skill });
    } catch (error) {
      return validation(res, error);
    }
  });

  function toolRuntimeFailure(res, error) {
    const code = String(error?.code || error?.message || 'workspace_tool_runtime_failed');
    if (
      code.includes('permission_') ||
      code.includes('owner_mismatch') ||
      code.includes('fingerprint_mismatch')
    ) {
      return res.status(403).json({ status: 'error', code });
    }
    if (
      code.includes('mcp_remote_disabled') ||
      code.includes('mcp_sdk_') ||
      code.includes('mcp_fetch_unavailable') ||
      code.includes('mcp_dns_failed')
    ) {
      return res.status(503).json({ status: 'error', code, externalWriteExecuted: false });
    }
    if (
      code.includes('invalid_') ||
      code.includes('not_found') ||
      code.includes('inactive') ||
      code.includes('unavailable') ||
      code.includes('blocked') ||
      code.includes('required') ||
      code.includes('scope_')
    ) {
      return res.status(400).json({ status: 'error', code });
    }
    console.error('[workspace/tools] operation failed:', code);
    return res.status(500).json({ status: 'error', code: 'workspace_tool_runtime_failed' });
  }

  function shortText(value, code, max = 200) {
    const result = String(value == null ? '' : value).trim();
    if (!result || result.length > max) {
      const error = new Error(code);
      error.code = code;
      throw error;
    }
    return result;
  }

  router.get('/tools', async (req, res) => {
    try {
      const tools = await toolRuntime.hydrateOwnerTools(req.userId);
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', tools, billedCredits: 0 });
    } catch (error) {
      return toolRuntimeFailure(res, error);
    }
  });

  router.get('/skills/:id/resolve', async (req, res) => {
    try {
      const skill = await toolRuntime.resolveSkill({
        ownerId: req.userId,
        skillId: connectionUuid(req.params.id, 'invalid_workspace_skill_id')
      });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', skill, billedCredits: 0 });
    } catch (error) {
      return toolRuntimeFailure(res, error);
    }
  });

  router.post('/plugins/:id/install/challenge', async (req, res) => {
    try {
      const sessionId = shortText(req.body?.sessionId, 'permission_session_required');
      const prepared = await toolRuntime.prepareInstall({
        ownerId: req.userId,
        connectionId: connectionUuid(req.params.id),
        sessionId
      });
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      res.set('Cache-Control', 'no-store');
      return res.json({
        status: 'success',
        operationFingerprint: prepared.operationFingerprint,
        permissionRequest: { ...prepared.permissionRequest, expiresAt }
      });
    } catch (error) {
      return toolRuntimeFailure(res, error);
    }
  });

  router.post('/plugins/install', async (req, res) => {
    try {
      const result = await toolRuntime.installPlugin({
        ownerId: req.userId,
        connectionId: connectionUuid(req.body?.connectionId),
        sessionId: shortText(req.body?.sessionId, 'permission_session_required'),
        requestId: shortText(req.body?.requestId, 'invalid_permission_request_id'),
        operationFingerprint: shortText(
          req.body?.operationFingerprint,
          'permission_operation_fingerprint_required',
          64
        ).toLowerCase()
      });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', result, billedCredits: 0 });
    } catch (error) {
      return toolRuntimeFailure(res, error);
    }
  });

  router.post('/tools/invoke/challenge', async (req, res) => {
    try {
      const sessionId = shortText(req.body?.sessionId, 'permission_session_required');
      const prepared = await toolRuntime.prepareInvocation({
        ownerId: req.userId,
        toolKey: shortText(req.body?.toolKey, 'invalid_workspace_tool_key', 240).toLowerCase(),
        input: req.body?.input == null ? {} : req.body.input,
        sessionId
      });
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      res.set('Cache-Control', 'no-store');
      return res.json({
        status: 'success',
        operationFingerprint: prepared.operationFingerprint,
        permissionRequest: { ...prepared.permissionRequest, expiresAt }
      });
    } catch (error) {
      return toolRuntimeFailure(res, error);
    }
  });

  router.post('/tools/invoke', async (req, res) => {
    try {
      const result = await toolRuntime.invoke({
        ownerId: req.userId,
        toolKey: shortText(req.body?.toolKey, 'invalid_workspace_tool_key', 240).toLowerCase(),
        input: req.body?.input == null ? {} : req.body.input,
        sessionId: shortText(req.body?.sessionId, 'permission_session_required'),
        requestId: shortText(req.body?.requestId, 'invalid_permission_request_id')
      });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', result, billedCredits: 0 });
    } catch (error) {
      return toolRuntimeFailure(res, error);
    }
  });

  router.post(
    '/workflows/execute',
    (_req, res) => disabled(res, 'workflow_execute')
  );
  router.post(
    '/schedules/activate',
    (_req, res) => disabled(res, 'schedule_execute')
  );
  function driveFailure(res, error) {
    const code = String(error?.code || error?.message || 'workspace_google_drive_failed');
    if (code.includes('not_configured')) {
      return res.status(503).json({
        status: 'error',
        code,
        externalWriteExecuted: false
      });
    }
    if (code.includes('scope_change_requires_disconnect')) {
      return res.status(409).json({ status: 'error', code, externalWriteExecuted: false });
    }
    if (
      code.includes('permission_') ||
      code.includes('owner_mismatch')
    ) {
      return res.status(403).json({ status: 'error', code, externalWriteExecuted: false });
    }
    if (
      code.includes('invalid') ||
      code.includes('not_found') ||
      code.includes('inactive') ||
      code.includes('revoked') ||
      code.includes('scope_') ||
      code.includes('required') ||
      code.includes('blocked')
    ) {
      return res.status(400).json({ status: 'error', code, externalWriteExecuted: false });
    }
    if (
      code.includes('token_') ||
      code.includes('google_request_') ||
      code.includes('drive_api_')
    ) {
      return res.status(502).json({ status: 'error', code, externalWriteExecuted: false });
    }
    console.error('[workspace/drive] operation failed:', code);
    return res.status(500).json({ status: 'error', code: 'workspace_google_drive_failed' });
  }

  router.post('/drive/connect', async (req, res) => {
    try {
      googleDriveRuntime.assertOAuthConfigured();
      let connectionId;
      let created = false;
      if (req.body?.connectionId) {
        connectionId = connectionUuid(req.body.connectionId);
      } else {
        const draft = normalizeIntegrationDraft({
          ...req.body,
          integrationKey: 'google_drive'
        });
        const requestedScopes = [...draft.scopes].sort();
        const matchesRequestedScopes = connection =>
          Array.isArray(connection?.scopes) &&
          JSON.stringify([...connection.scopes].sort()) === JSON.stringify(requestedScopes);

        const result = await connectionStore.createOrReuseIntegration({
          ownerId: req.userId,
          ...draft
        });
        if (!matchesRequestedScopes(result.connection)) {
          const error = new Error('workspace_google_drive_scope_change_requires_disconnect');
          error.code = 'workspace_google_drive_scope_change_requires_disconnect';
          throw error;
        }
        connectionId = result.connection.id;
        created = result.created;
      }

      const oauth = await googleDriveRuntime.startOAuth({
        ownerId: req.userId,
        connectionId
      });
      res.set('Cache-Control', 'no-store');
      return res.status(created ? 201 : 200).json({
        status: 'success',
        connectionId,
        authorizationUrl: oauth.authorizationUrl,
        expiresAt: oauth.expiresAt,
        credentialConfigured: false,
        billedCredits: 0
      });
    } catch (error) {
      return driveFailure(res, error);
    }
  });

  router.post('/drive/oauth/callback', async (req, res) => {
    try {
      const result = await googleDriveRuntime.completeOAuth({
        ownerId: req.userId,
        code: shortText(req.body?.code, 'workspace_google_oauth_code_invalid', 4096),
        state: shortText(req.body?.state, 'workspace_google_oauth_state_invalid', 512)
      });
      res.set('Cache-Control', 'no-store');
      return res.json({
        status: 'success',
        connection: result,
        billedCredits: 0
      });
    } catch (error) {
      return driveFailure(res, error);
    }
  });

  router.post('/drive/:id/disconnect', async (req, res) => {
    try {
      const result = await googleDriveRuntime.disconnect({
        ownerId: req.userId,
        connectionId: connectionUuid(req.params.id)
      });
      toolRuntime.clearOwner(req.userId);
      res.set('Cache-Control', 'no-store');
      return res.json({
        status: 'success',
        result,
        billedCredits: 0
      });
    } catch (error) {
      return driveFailure(res, error);
    }
  });

  router.post(
    '/exports/create',
    (_req, res) => disabled(res, 'external_export')
  );

  return router;
}

module.exports = {
  createWorkspaceRouter,
  normalizeProjectPatch,
  normalizeResourceRequest
};
