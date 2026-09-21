// ROX AI — src/modules/ai/tools
// Canonical model-facing tool registry. Built-ins, declarative plugins and MCP
// tools all register through this one seam.

const registry = require('../../../core/registry');

function toolError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * @param {string} key unique tool identifier
 * @param {{description:string,inputSchema?:object,handler:Function,ownerId?:string|null,source?:string,connectionId?:string|null}} definition
 */
function registerTool(key, definition) {
  const normalizedKey = String(key || '').trim().toLowerCase();
  if (!normalizedKey || normalizedKey.length > 240) throw toolError('invalid_tool_key');
  if (!definition || typeof definition !== 'object' || typeof definition.handler !== 'function') {
    throw toolError('invalid_tool_definition');
  }
  registry.register('ai.tools', normalizedKey, Object.freeze({
    description: String(definition.description || normalizedKey).trim().slice(0, 2000),
    inputSchema: definition.inputSchema && typeof definition.inputSchema === 'object' && !Array.isArray(definition.inputSchema)
      ? definition.inputSchema
      : { type: 'object' },
    handler: definition.handler,
    ownerId: definition.ownerId == null ? null : String(definition.ownerId).toLowerCase(),
    source: String(definition.source || 'builtin').trim().toLowerCase(),
    connectionId: definition.connectionId == null ? null : String(definition.connectionId).toLowerCase()
  }));
  return normalizedKey;
}

function unregisterTool(key) {
  return registry.remove('ai.tools', String(key || '').trim().toLowerCase());
}

function getToolDefinition(key) {
  return registry.get('ai.tools', String(key || '').trim().toLowerCase());
}

function hasTool(key, { ownerId = null } = {}) {
  const tool = getToolDefinition(key);
  if (!tool) return false;
  if (tool.ownerId == null) return true;
  return ownerId != null && tool.ownerId === String(ownerId).toLowerCase();
}

function listTools({ ownerId = null } = {}) {
  const owner = ownerId == null ? null : String(ownerId).toLowerCase();
  return registry
    .list('ai.tools')
    .filter(({ value }) => value.ownerId == null || (owner && value.ownerId === owner))
    .map(({ key, value }) => ({
      key,
      description: value.description,
      inputSchema: value.inputSchema,
      source: value.source,
      connectionId: value.connectionId
    }));
}

async function invokeTool(key, input, context = {}) {
  const normalizedKey = String(key || '').trim().toLowerCase();
  const tool = registry.get('ai.tools', normalizedKey);
  if (!tool) throw toolError('unknown_tool', `Unknown tool: ${normalizedKey}`);
  if (tool.ownerId != null && String(context.ownerId || '').toLowerCase() !== tool.ownerId) {
    throw toolError('workspace_tool_owner_mismatch');
  }
  return tool.handler(input == null ? {} : input, context);
}

module.exports = {
  registerTool,
  unregisterTool,
  getToolDefinition,
  hasTool,
  listTools,
  invokeTool
};
