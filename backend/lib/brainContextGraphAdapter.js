'use strict';

const {
  getDefaultWorkspaceContextGraphStore
} = require('./workspaceContextGraphRepository');

async function resolveBrainContextGraph({ ownerId, query, projectId, types, limit, depth, store } = {}) {
  if (!ownerId) {
    const error = new Error('workspace_context_graph_owner_required');
    error.code = 'workspace_context_graph_owner_required';
    throw error;
  }
  const graphStore = store || getDefaultWorkspaceContextGraphStore();
  return graphStore.getBrainContext(ownerId, {
    q: query,
    projectId,
    types,
    limit,
    depth
  });
}

async function resolveManagerContextGraph({ ownerId, query, projectId, types, limit, depth, store } = {}) {
  if (!ownerId) {
    const error = new Error('workspace_context_graph_owner_required');
    error.code = 'workspace_context_graph_owner_required';
    throw error;
  }
  const graphStore = store || getDefaultWorkspaceContextGraphStore();
  return graphStore.getManagerContext(ownerId, {
    q: query,
    projectId,
    types,
    limit,
    depth
  });
}

module.exports = {
  resolveBrainContextGraph,
  resolveManagerContextGraph
};
