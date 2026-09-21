'use strict';

const {
  operationFingerprint,
  uuid
} = require('./workspaceConnectionContract');
const {
  getDefaultWorkspaceConnectionStore
} = require('./workspaceConnectionRepository');
const {
  getDefaultPermissionCenterStore
} = require('./permissionCenterRepository');
const aiTools = require('../src/modules/ai/tools');
const { createMcpRemoteAdapter } = require('./workspaceMcpClient');

const TOOL_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const DELEGATE_KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,199}$/;

function toolRuntimeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeManifestTools(connection) {
  const manifest = connection?.manifest;
  if (!plainObject(manifest) || !Array.isArray(manifest.tools) || manifest.tools.length < 1 || manifest.tools.length > 32) {
    throw toolRuntimeError('workspace_plugin_manifest_tools_required');
  }

  const scopes = new Set((connection.scopes || []).map(value => String(value).toLowerCase()));
  const seen = new Set();

  return manifest.tools.map(raw => {
    if (!plainObject(raw)) throw toolRuntimeError('workspace_plugin_tool_invalid');
    const name = String(raw.name || '').trim().toLowerCase();
    if (!TOOL_NAME_RE.test(name) || seen.has(name)) throw toolRuntimeError('workspace_plugin_tool_name_invalid');
    seen.add(name);

    const description = String(raw.description || name).trim();
    if (!description || description.length > 2000) throw toolRuntimeError('workspace_plugin_tool_description_invalid');

    const inputSchema = raw.inputSchema == null ? { type: 'object' } : raw.inputSchema;
    if (!plainObject(inputSchema) || JSON.stringify(inputSchema).length > 12000) {
      throw toolRuntimeError('workspace_plugin_tool_schema_invalid');
    }

    const requiredScopes = raw.requiredScopes == null ? [] : raw.requiredScopes;
    if (!Array.isArray(requiredScopes) || requiredScopes.length > 12) {
      throw toolRuntimeError('workspace_plugin_tool_scopes_invalid');
    }
    const normalizedScopes = [...new Set(requiredScopes.map(value => String(value || '').trim().toLowerCase()))].filter(Boolean).sort();
    if (normalizedScopes.includes('*') || normalizedScopes.some(scope => !scopes.has(scope))) {
      throw toolRuntimeError('workspace_plugin_tool_scope_not_declared');
    }

    let delegateToolKey = null;
    let remoteToolName = null;
    if (connection.plugin_kind === 'plugin') {
      delegateToolKey = String(raw.delegateToolKey || '').trim().toLowerCase();
      if (
        !DELEGATE_KEY_RE.test(delegateToolKey) ||
        delegateToolKey.startsWith('plugin:') ||
        delegateToolKey.startsWith('mcp:')
      ) {
        throw toolRuntimeError('workspace_plugin_delegate_invalid');
      }
    } else if (connection.plugin_kind === 'mcp') {
      remoteToolName = String(raw.remoteToolName || name).trim();
      if (!remoteToolName || remoteToolName.length > 200) {
        throw toolRuntimeError('workspace_mcp_tool_name_invalid');
      }
    } else {
      throw toolRuntimeError('workspace_plugin_kind_invalid');
    }

    const key = `${connection.plugin_kind}:${String(connection.id).toLowerCase()}:${name}`;
    return Object.freeze({
      key,
      name,
      description,
      inputSchema,
      requiredScopes: Object.freeze(normalizedScopes),
      delegateToolKey,
      remoteToolName
    });
  });
}

function createWorkspaceToolRuntime({
  connectionStore = getDefaultWorkspaceConnectionStore(),
  permissionStore = getDefaultPermissionCenterStore(),
  mcpAdapter = createMcpRemoteAdapter(),
  tools = aiTools
} = {}) {
  const hydratedByOwner = new Map();

  function clearOwner(ownerId) {
    const owner = String(ownerId || '').toLowerCase();
    const previous = hydratedByOwner.get(owner) || [];
    for (const key of previous) tools.unregisterTool(key);
    hydratedByOwner.delete(owner);
  }

  async function freshConnection(ownerId, connectionId) {
    const connection = await connectionStore.getPluginConnection({ ownerId, connectionId });
    if (
      connection.status !== 'active' ||
      connection.installed !== true ||
      connection.runtime_enabled !== true ||
      connection.revoked_at != null
    ) {
      throw toolRuntimeError('workspace_plugin_connection_inactive');
    }
    return connection;
  }

  async function invokeDynamicTool(connectionSnapshot, manifestTool, input, context = {}) {
    const ownerId = String(context.ownerId || '').toLowerCase();
    const sessionId = String(context.sessionId || '').trim();
    const requestId = String(context.requestId || '').trim();
    if (!ownerId || !sessionId || !requestId) throw toolRuntimeError('workspace_tool_context_required');

    const connection = await freshConnection(ownerId, connectionSnapshot.id);
    const currentTool = normalizeManifestTools(connection).find(item => item.key === manifestTool.key);
    if (!currentTool) throw toolRuntimeError('workspace_plugin_tool_unavailable');

    const declared = new Set((connection.scopes || []).map(value => String(value).toLowerCase()));
    if (currentTool.requiredScopes.some(scope => !declared.has(scope))) {
      throw toolRuntimeError('workspace_plugin_tool_scope_not_declared');
    }

    const action = connection.plugin_kind === 'mcp' ? 'mcp.invoke' : 'plugin.invoke';

    // Fail closed before consuming an allow-once grant when the MCP runtime
    // itself is disabled, missing its SDK, or resolves to a blocked network.
    if (connection.plugin_kind === 'mcp') {
      await mcpAdapter.preflight({ endpointUrl: connection.endpoint_url });
    }

    const fingerprint = operationFingerprint({
      action,
      connectionId: connection.id,
      toolKey: currentTool.key,
      input: input == null ? {} : input
    });

    await permissionStore.consumeWorkspaceTool({
      ownerId,
      action,
      connectionId: connection.id,
      sessionId,
      requestId,
      toolKey: currentTool.key,
      operationFingerprint: fingerprint
    });

    if (connection.plugin_kind === 'plugin') {
      const delegate = tools.getToolDefinition(currentTool.delegateToolKey);
      if (!delegate || delegate.ownerId != null || delegate.source !== 'builtin') {
        throw toolRuntimeError('workspace_plugin_delegate_unavailable');
      }
      const result = await tools.invokeTool(currentTool.delegateToolKey, input, {
        ...context,
        delegatedFrom: currentTool.key
      });
      return Object.freeze({
        toolKey: currentTool.key,
        source: 'plugin',
        connectionId: connection.id,
        billedCredits: 0,
        result
      });
    }

    const authorization = await connectionStore.getPluginSecret({
      ownerId,
      connectionId: connection.id
    });
    const result = await mcpAdapter.invoke({
      endpointUrl: connection.endpoint_url,
      remoteToolName: currentTool.remoteToolName,
      input,
      authorization,
      signal: context.signal || null
    });
    return Object.freeze({
      toolKey: currentTool.key,
      source: 'mcp',
      connectionId: connection.id,
      billedCredits: 0,
      result
    });
  }

  async function hydrateOwnerTools(ownerId) {
    const owner = String(ownerId || '').toLowerCase();
    if (!owner) throw toolRuntimeError('workspace_tool_owner_required');
    clearOwner(owner);

    const connections = await connectionStore.listActivePlugins(owner, { limit: 200 });
    const keys = [];

    for (const connection of connections) {
      for (const manifestTool of normalizeManifestTools(connection)) {
        tools.registerTool(manifestTool.key, {
          ownerId: owner,
          source: connection.plugin_kind,
          connectionId: connection.id,
          description: manifestTool.description,
          inputSchema: manifestTool.inputSchema,
          handler: (input, context) => invokeDynamicTool(connection, manifestTool, input, context)
        });
        keys.push(manifestTool.key);
      }
    }

    hydratedByOwner.set(owner, keys);
    return tools.listTools({ ownerId: owner });
  }

  async function prepareInstall({ ownerId, connectionId, sessionId }) {
    const connection = await connectionStore.getPluginConnection({
      ownerId,
      connectionId: uuid(connectionId)
    });
    if (connection.status === 'revoked') throw toolRuntimeError('workspace_plugin_connection_revoked');
    normalizeManifestTools(connection);
    const fingerprint = operationFingerprint({
      action: 'plugin.install',
      connectionId: connection.id,
      pluginKey: connection.plugin_key,
      pluginKind: connection.plugin_kind,
      scopes: connection.scopes || [],
      manifest: connection.manifest || {},
      endpointUrl: connection.endpoint_url || null
    });
    return Object.freeze({
      operationFingerprint: fingerprint,
      permissionRequest: Object.freeze({
        action: 'plugin.install',
        grantMode: 'allow_once',
        scopeType: 'resource_session',
        resourceNamespace: 'plugin_connection',
        resourceId: connection.id,
        sessionId: String(sessionId || '').trim(),
        constraints: Object.freeze({ operationFingerprint: fingerprint })
      })
    });
  }

  async function installPlugin({ ownerId, connectionId, sessionId, requestId, operationFingerprint: supplied }) {
    const prepared = await prepareInstall({ ownerId, connectionId, sessionId });
    if (String(supplied || '').toLowerCase() !== prepared.operationFingerprint) {
      throw toolRuntimeError('workspace_plugin_install_fingerprint_mismatch');
    }
    const result = await connectionStore.installPlugin({
      ownerId,
      connectionId: uuid(connectionId),
      sessionId: String(sessionId || '').trim(),
      requestId: String(requestId || '').trim(),
      operationFingerprint: prepared.operationFingerprint
    });
    await hydrateOwnerTools(ownerId);
    return result;
  }

  async function prepareInvocation({ ownerId, toolKey, input, sessionId }) {
    await hydrateOwnerTools(ownerId);
    const definition = tools.getToolDefinition(toolKey);
    if (!definition || definition.ownerId !== String(ownerId).toLowerCase() || !definition.connectionId) {
      throw toolRuntimeError('workspace_tool_not_found');
    }
    const connection = await freshConnection(ownerId, definition.connectionId);
    const action = connection.plugin_kind === 'mcp' ? 'mcp.invoke' : 'plugin.invoke';
    const normalizedToolKey = String(toolKey || '').trim().toLowerCase();
    const fingerprint = operationFingerprint({
      action,
      connectionId: connection.id,
      toolKey: normalizedToolKey,
      input: input == null ? {} : input
    });
    return Object.freeze({
      operationFingerprint: fingerprint,
      permissionRequest: Object.freeze({
        action,
        grantMode: 'allow_once',
        scopeType: 'resource_session',
        resourceNamespace: 'plugin_connection',
        resourceId: connection.id,
        sessionId: String(sessionId || '').trim(),
        constraints: Object.freeze({
          toolKey: normalizedToolKey,
          operationFingerprint: fingerprint
        })
      })
    });
  }

  async function invoke({ ownerId, toolKey, input, sessionId, requestId }) {
    await hydrateOwnerTools(ownerId);
    return tools.invokeTool(toolKey, input, {
      ownerId,
      sessionId,
      requestId
    });
  }

  async function resolveSkill({ ownerId, skillId }) {
    const skill = await connectionStore.getSkill({ ownerId, skillId: uuid(skillId, 'invalid_workspace_skill_id') });
    if (skill.status !== 'active' || skill.enabled !== true) {
      throw toolRuntimeError('workspace_skill_disabled');
    }
    await hydrateOwnerTools(ownerId);
    const resolvedTools = [];
    for (const key of skill.tool_keys || []) {
      if (!tools.hasTool(key, { ownerId })) throw toolRuntimeError('workspace_skill_tool_unavailable');
      const definition = tools.getToolDefinition(key);
      resolvedTools.push({
        key,
        description: definition.description,
        inputSchema: definition.inputSchema,
        source: definition.source,
        connectionId: definition.connectionId
      });
    }
    return Object.freeze({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      toolKeys: Object.freeze([...(skill.tool_keys || [])]),
      tools: Object.freeze(resolvedTools)
    });
  }

  return Object.freeze({
    clearOwner,
    hydrateOwnerTools,
    prepareInstall,
    installPlugin,
    prepareInvocation,
    invoke,
    resolveSkill,
    normalizeManifestTools
  });
}

let defaultRuntime = null;
function getDefaultWorkspaceToolRuntime() {
  if (!defaultRuntime) defaultRuntime = createWorkspaceToolRuntime();
  return defaultRuntime;
}

module.exports = {
  createWorkspaceToolRuntime,
  getDefaultWorkspaceToolRuntime,
  normalizeManifestTools
};
