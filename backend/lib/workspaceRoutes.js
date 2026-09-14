'use strict';

const express = require('express');
const {
  publicInventory,
  assertWorkspaceExecutionAvailable
} = require('./workspaceCapabilityRegistry');
const {
  getDefaultWorkspaceMemoryStore
} = require('./workspaceMemoryRepository');
const { normalizeWorkspaceItem } = require('./workspaceItemContract');
const { normalizeWorkspaceProject } = require('./workspaceProjectContract');
const { normalizeCreation } = require('./workspaceCreationContract');
const { normalizeTemplate } = require('./workspaceTemplateContract');
const { normalizeSchedule } = require('./workspaceScheduleContract');
const {
  normalizeIntegrationRequest,
  assertNoCredentialMaterial
} = require('./workspaceIntegrationContract');
const { normalizeWorkflow } = require('./workspaceWorkflowContract');
const { text, uuid, object, fail } = require('./workspaceValidation');
const {
  RESOURCE_TYPES,
  getDefaultWorkspaceProjectStore
} = require('./workspaceProjectRepository');
const { getDefaultWorkspaceLibraryStore } = require('./workspaceLibraryRepository');

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
  const memoryStore =
    options.memoryStore || getDefaultWorkspaceMemoryStore();

  router.get(
    '/capabilities',
    (_req, res) => res.json({
      status: 'success',
      ...publicInventory()
    })
  );
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
  router.post('/library/items/:contentId/send-to',async(req,res)=>{try{return res.json({status:'success',handoff:await libraryStore.createSendTo({ownerId:req.userId,contentId:uuid(req.params.contentId,'invalid_workspace_library_content_id'),destination:req.body?.destination})})}catch(e){if(e?.code?.startsWith('invalid_'))return validation(res,e);return libraryFailure(res,e)}});

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

  router.post(
    '/workflows/execute',
    (_req, res) => disabled(res, 'workflow_execute')
  );
  router.post(
    '/schedules/activate',
    (_req, res) => disabled(res, 'schedule_execute')
  );
  router.post(
    '/plugins/install',
    (_req, res) => disabled(res, 'plugin_install')
  );
  router.post(
    '/drive/connect',
    (_req, res) => disabled(res, 'drive_connect')
  );
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
