'use strict';

const crypto = require('crypto');
const { config } = require('./workspaceCapabilityRegistry');

const RESOURCE_TYPES =
  new Set(['conversation', 'content', 'task', 'deployment']);

const CONTENT_KIND_TO_ITEM_KIND = Object.freeze({
  image: 'image',
  video: 'video',
  audio: 'audio',
  code: 'code',
  document: 'document',
  text: 'file',
  '3d': 'file',
  web: 'file',
  research: 'file'
});

function storeError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function clampLimit(value, fallback = 50, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function normalizeBooleanQuery(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return fallback;
}

function createWorkspaceProjectStore(db) {
  if (!db || typeof db.from !== 'function') {
    throw new TypeError(
      'createWorkspaceProjectStore requires a Supabase-compatible database client.'
    );
  }

  async function requireOwnedProject(projectId, ownerId) {
    const { data, error } = await db
      .from('workspace_projects')
      .select(
        'id, owner_id, name, description, shared_context_enabled, ' +
        'external_sharing_enabled, archived_at, created_at, updated_at'
      )
      .eq('id', projectId)
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (error || !data) {
      throw storeError('workspace_project_not_found', error || null);
    }
    return data;
  }

  async function listProjects({
    ownerId,
    archived = false,
    limit = 50
  }) {
    let query = db
      .from('workspace_projects')
      .select(
        'id, name, description, shared_context_enabled, ' +
        'external_sharing_enabled, archived_at, created_at, updated_at'
      )
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
      .limit(clampLimit(limit));

    query = normalizeBooleanQuery(archived, false)
      ? query.not('archived_at', 'is', null)
      : query.is('archived_at', null);

    const { data, error } = await query;
    if (error) throw storeError('workspace_project_list_failed', error);

    return data || [];
  }

  async function createProject({
    ownerId,
    project
  }) {
    const payload = {
      owner_id: ownerId,
      name: project.name,
      description: project.description,
      shared_context_enabled: project.sharedContextEnabled === true,
      external_sharing_enabled: false,
      archived_at: null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await db
      .from('workspace_projects')
      .insert(payload)
      .select(
        'id, name, description, shared_context_enabled, ' +
        'external_sharing_enabled, archived_at, created_at, updated_at'
      )
      .single();

    if (error || !data) {
      throw storeError('workspace_project_create_failed', error || null);
    }
    return data;
  }

  async function updateProject({
    ownerId,
    projectId,
    patch
  }) {
    await requireOwnedProject(projectId, ownerId);

    const update = {
      updated_at: new Date().toISOString()
    };

    if (patch.name !== undefined) update.name = patch.name;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.sharedContextEnabled !== undefined) {
      update.shared_context_enabled = patch.sharedContextEnabled === true;
    }
    if (patch.archived !== undefined) {
      update.archived_at = patch.archived
        ? new Date().toISOString()
        : null;
    }

    if (Object.keys(update).length === 1) {
      throw storeError('workspace_project_update_empty');
    }

    const { data, error } = await db
      .from('workspace_projects')
      .update(update)
      .eq('id', projectId)
      .eq('owner_id', ownerId)
      .select(
        'id, name, description, shared_context_enabled, ' +
        'external_sharing_enabled, archived_at, created_at, updated_at'
      )
      .single();

    if (error || !data) {
      throw storeError('workspace_project_update_failed', error || null);
    }
    return data;
  }

  async function loadProjectItems(projectId, ownerId) {
    const { data: links, error: linkError } = await db
      .from('workspace_project_items')
      .select('project_id, item_id, position, added_at')
      .eq('project_id', projectId)
      .order('position', { ascending: true });

    if (linkError) {
      throw storeError('workspace_project_items_failed', linkError);
    }
    if (!links || !links.length) return [];

    const itemIds = links.map(link => link.item_id);
    const { data: items, error: itemError } = await db
      .from('workspace_items')
      .select(
        'id, owner_id, kind, name, description, source_id, resource_type, ' +
        'canonical_content_id, metadata, archived_at, created_at, updated_at'
      )
      .in('id', itemIds)
      .eq('owner_id', ownerId);

    if (itemError) {
      throw storeError('workspace_project_items_failed', itemError);
    }

    const byId = new Map((items || []).map(item => [item.id, item]));
    return links
      .map(link => {
        const item = byId.get(link.item_id);
        if (!item) return null;
        return {
          ...item,
          position: link.position,
          added_at: link.added_at
        };
      })
      .filter(Boolean);
  }

  async function getProject({
    ownerId,
    projectId
  }) {
    const project = await requireOwnedProject(projectId, ownerId);
    const items = await loadProjectItems(projectId, ownerId);

    return {
      ...project,
      items,
      item_count: items.length
    };
  }

  async function resolveResource({
    ownerId,
    resourceType,
    resourceId
  }) {
    if (!RESOURCE_TYPES.has(resourceType)) {
      throw storeError('workspace_project_resource_type_invalid');
    }

    if (resourceType === 'conversation') {
      const { data, error } = await db
        .from('shared_conversations')
        .select(
          'id, title, feature, archived, message_count, memory_summary, updated_at'
        )
        .eq('id', resourceId)
        .eq('owner_id', ownerId)
        .maybeSingle();

      if (error || !data) {
        throw storeError('workspace_project_resource_not_found', error || null);
      }

      return {
        kind: 'chat',
        name: data.title || 'Conversation',
        description: data.feature ? `Conversation · ${data.feature}` : 'Conversation',
        sourceId: data.id,
        canonicalContentId: null,
        metadata: {
          resourceType: 'conversation',
          feature: data.feature || 'chat',
          messageCount: Number(data.message_count) || 0,
          memoryLinked: Boolean(String(data.memory_summary || '').trim())
        }
      };
    }

    if (resourceType === 'content') {
      const { data, error } = await db
        .from('zuvyr_content_objects')
        .select(
          'id, kind, title, status, source_kind, source_system, source_id, project_id'
        )
        .eq('id', resourceId)
        .eq('owner_id', ownerId)
        .maybeSingle();

      if (error || !data) {
        throw storeError('workspace_project_resource_not_found', error || null);
      }

      return {
        kind: CONTENT_KIND_TO_ITEM_KIND[data.kind] || 'file',
        name: data.title || `${data.kind || 'Content'} item`,
        description: `Canonical ${data.kind || 'content'}`,
        sourceId: data.id,
        canonicalContentId: data.id,
        metadata: {
          resourceType: 'content',
          canonicalKind: data.kind,
          sourceKind: data.source_kind,
          sourceSystem: data.source_system,
          sourceId: data.source_id,
          status: data.status
        }
      };
    }

    if (resourceType === 'task') {
      const { data, error } = await db
        .from('zuvyr_task_runs')
        .select('id, intent, state, updated_at')
        .eq('id', resourceId)
        .eq('user_id', ownerId)
        .maybeSingle();

      if (error || !data) {
        throw storeError('workspace_project_resource_not_found', error || null);
      }

      return {
        kind: 'task',
        name: String(data.intent || 'Task').slice(0, 120),
        description: data.state ? `Task · ${data.state}` : 'Task',
        sourceId: data.id,
        canonicalContentId: null,
        metadata: {
          resourceType: 'task',
          state: data.state || null
        }
      };
    }

    const { data, error } = await db
      .from('code_deploy_requests')
      .select('id, status, target, project_id, created_at, completed_at')
      .eq('id', resourceId)
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (error || !data) {
      throw storeError('workspace_project_resource_not_found', error || null);
    }

    return {
      // A deployment is a project resource, not a new canonical code object.
      // Using `file` avoids Pack041's workspace-item content trigger creating
      // duplicate canonical content for a deployment reference.
      kind: 'file',
      name: data.target ? `Deployment · ${data.target}` : 'Deployment',
      description: data.status ? `Deployment · ${data.status}` : 'Deployment',
      sourceId: data.id,
      canonicalContentId: null,
      metadata: {
        resourceType: 'deployment',
        target: data.target || null,
        status: data.status || null
      }
    };
  }

  async function nextPosition(projectId) {
    const { data, error } = await db
      .from('workspace_project_items')
      .select('position')
      .eq('project_id', projectId)
      .order('position', { ascending: false })
      .limit(1);

    if (error) throw storeError('workspace_project_position_failed', error);
    return data && data.length ? Number(data[0].position) + 1 : 0;
  }

  async function findOrCreateResourceItem({
    ownerId,
    resourceType,
    resolved
  }) {
    const { data: existing, error: findError } = await db
      .from('workspace_items')
      .select(
        'id, owner_id, kind, name, description, source_id, resource_type, ' +
        'canonical_content_id, metadata, archived_at, created_at, updated_at'
      )
      .eq('owner_id', ownerId)
      .eq('resource_type', resourceType)
      .eq('source_id', resolved.sourceId)
      .maybeSingle();

    if (findError) {
      throw storeError('workspace_project_resource_lookup_failed', findError);
    }

    const payload = {
      owner_id: ownerId,
      kind: resolved.kind,
      name: String(resolved.name || 'Project item').slice(0, 120),
      description: resolved.description
        ? String(resolved.description).slice(0, 2000)
        : null,
      source_id: resolved.sourceId,
      resource_type: resourceType,
      canonical_content_id: resolved.canonicalContentId || null,
      metadata: resolved.metadata || {},
      archived_at: null,
      updated_at: new Date().toISOString()
    };

    if (existing) {
      const { data, error } = await db
        .from('workspace_items')
        .update(payload)
        .eq('id', existing.id)
        .eq('owner_id', ownerId)
        .select(
          'id, owner_id, kind, name, description, source_id, resource_type, ' +
          'canonical_content_id, metadata, archived_at, created_at, updated_at'
        )
        .single();

      if (error || !data) {
        throw storeError('workspace_project_resource_update_failed', error || null);
      }
      return data;
    }

    const { data, error } = await db
      .from('workspace_items')
      .insert({
        id: crypto.randomUUID(),
        ...payload
      })
      .select(
        'id, owner_id, kind, name, description, source_id, resource_type, ' +
        'canonical_content_id, metadata, archived_at, created_at, updated_at'
      )
      .single();

    if (error || !data) {
      if (String(error && error.code) === '23505') {
        return findOrCreateResourceItem({
          ownerId,
          resourceType,
          resolved
        });
      }
      throw storeError('workspace_project_resource_create_failed', error || null);
    }
    return data;
  }

  async function linkResource({
    ownerId,
    projectId,
    resourceType,
    resourceId
  }) {
    const project = await requireOwnedProject(projectId, ownerId);

    if (project.archived_at) {
      throw storeError('workspace_project_archived');
    }

    const resolved = await resolveResource({
      ownerId,
      resourceType,
      resourceId
    });

    const item = await findOrCreateResourceItem({
      ownerId,
      resourceType,
      resolved
    });

    const { data: existingLink, error: existingLinkError } = await db
      .from('workspace_project_items')
      .select('item_id')
      .eq('project_id', projectId)
      .eq('item_id', item.id)
      .maybeSingle();

    if (existingLinkError) {
      throw storeError(
        'workspace_project_resource_lookup_failed',
        existingLinkError
      );
    }

    if (existingLink) {
      return getProject({ ownerId, projectId });
    }

    const { count, error: countError } = await db
      .from('workspace_project_items')
      .select('item_id', { count: 'exact', head: true })
      .eq('project_id', projectId);

    if (countError) {
      throw storeError('workspace_project_resource_count_failed', countError);
    }

    if (Number(count) >= config.limits.projectItems) {
      throw storeError('workspace_project_item_limit');
    }

    const position = await nextPosition(projectId);

    const { error } = await db
      .from('workspace_project_items')
      .insert({
        project_id: projectId,
        item_id: item.id,
        position
      });

    if (error) {
      const message = String(error.message || '');
      if (message.includes('pack043_project_item_limit')) {
        throw storeError('workspace_project_item_limit', error);
      }
      if (message.includes('pack043_content_already_linked')) {
        throw storeError('workspace_project_content_already_linked', error);
      }
      if (
        message.includes('pack043_project_item_owner_mismatch') ||
        message.includes('pack043_content_owner_mismatch')
      ) {
        throw storeError('workspace_project_resource_not_found', error);
      }
      throw storeError('workspace_project_resource_link_failed', error);
    }

    await db
      .from('workspace_projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('owner_id', ownerId);

    return getProject({ ownerId, projectId });
  }

  async function unlinkResource({
    ownerId,
    projectId,
    itemId
  }) {
    await requireOwnedProject(projectId, ownerId);

    const { data: item, error: itemError } = await db
      .from('workspace_items')
      .select('id')
      .eq('id', itemId)
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (itemError || !item) {
      throw storeError('workspace_project_resource_not_found', itemError || null);
    }

    const { error } = await db
      .from('workspace_project_items')
      .delete()
      .eq('project_id', projectId)
      .eq('item_id', itemId);

    if (error) {
      throw storeError('workspace_project_resource_unlink_failed', error);
    }

    await db
      .from('workspace_projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('owner_id', ownerId);

    return getProject({ ownerId, projectId });
  }

  return {
    requireOwnedProject,
    listProjects,
    createProject,
    updateProject,
    getProject,
    linkResource,
    unlinkResource
  };
}

let defaultStore = null;

function getDefaultWorkspaceProjectStore() {
  if (!defaultStore) {
    const { supabaseAdmin } = require('./supabaseAdmin');
    defaultStore = createWorkspaceProjectStore(supabaseAdmin);
  }
  return defaultStore;
}

module.exports = {
  RESOURCE_TYPES,
  createWorkspaceProjectStore,
  getDefaultWorkspaceProjectStore
};
