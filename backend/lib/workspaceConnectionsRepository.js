'use strict';

const { config } = require('./workspaceCapabilityRegistry');
const {
  object,
  text,
  uuid,
  uniqueStrings,
  fail
} = require('./workspaceValidation');

const MCP_CONNECTION_SCOPES = Object.freeze([
  'mcp.tools.list',
  'mcp.tools.invoke',
  'workspace.items.read',
  'workspace.items.write',
  'projects.read',
  'projects.write',
  'exports.create'
]);

const TOOL_KEY_RE = /^[A-Za-z][A-Za-z0-9_.:-]{0,199}$/;
const SAFE_PLUGIN_KEY_RE = /^[a-z0-9][a-z0-9._-]{0,119}$/;
const PRIVATE_IPV4_RE =
  /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

function storeError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function assertNoSecretMaterial(value) {
  const serialized = JSON.stringify(value || {});
  if (
    /(?:access|refresh|oauth|api)[_-]?token|client[_-]?secret|authorization|cookie|password|private[_-]?key/i.test(
      serialized
    )
  ) {
    fail('workspace_connection_secret_material_blocked');
  }
}

function normalizePluginKey(value) {
  const key = text(value, {
    code: 'workspace_plugin_key_invalid',
    max: 120
  }).toLowerCase();
  if (!SAFE_PLUGIN_KEY_RE.test(key)) fail('workspace_plugin_key_invalid');
  return key;
}

function normalizeHttpsEndpoint(value, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) fail('workspace_mcp_endpoint_required');
    return null;
  }
  const raw = text(value, {
    code: 'workspace_mcp_endpoint_invalid',
    max: 2048
  });
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail('workspace_mcp_endpoint_invalid');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    fail('workspace_mcp_endpoint_invalid');
  }
  const host = String(url.hostname || '').toLowerCase().replace(/\.$/, '');
  if (
    !host ||
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    PRIVATE_IPV4_RE.test(host)
  ) {
    fail('workspace_mcp_endpoint_blocked');
  }
  url.hash = '';
  return url.toString();
}

function normalizeManifest(value) {
  const manifest = value == null ? {} : object(value, 'workspace_plugin_manifest_invalid');
  assertNoSecretMaterial(manifest);
  const serialized = JSON.stringify(manifest);
  if (serialized.length > 20000) fail('workspace_plugin_manifest_invalid');
  return manifest;
}

function normalizePluginConnection(input) {
  const value = object(input, 'workspace_plugin_connection_invalid');
  assertNoSecretMaterial(value);

  const pluginKind = String(value.pluginKind || 'plugin').trim().toLowerCase();
  if (!['plugin', 'mcp'].includes(pluginKind)) {
    fail('workspace_plugin_kind_invalid');
  }

  const allowed =
    pluginKind === 'mcp'
      ? MCP_CONNECTION_SCOPES
      : config.integrations.plugins.allowedScopes;

  const scopes = uniqueStrings(value.scopes, {
    code: 'workspace_plugin_scopes_invalid',
    allowed,
    max: config.limits.permissionScopes
  });

  if (value.explicitConsent !== true) {
    fail('workspace_integration_consent_required');
  }

  return Object.freeze({
    plugin_key: normalizePluginKey(value.pluginKey),
    plugin_kind: pluginKind,
    display_name: text(value.displayName || value.pluginKey, {
      code: 'workspace_plugin_display_name_invalid',
      max: config.limits.nameChars
    }),
    scopes,
    explicit_consent: true,
    installed: false,
    runtime_enabled: false,
    manifest: normalizeManifest(value.manifest),
    endpoint_url:
      pluginKind === 'mcp'
        ? normalizeHttpsEndpoint(value.endpointUrl, { required: true })
        : null,
    status: 'draft',
    revoked_at: null,
    last_error_code: null,
    updated_at: new Date().toISOString()
  });
}

function normalizeIntegrationConnection(input) {
  const value = object(input, 'workspace_integration_connection_invalid');
  assertNoSecretMaterial(value);
  if (String(value.integration || '').trim().toLowerCase() !== 'google_drive') {
    fail('unsupported_workspace_integration');
  }
  if (value.explicitConsent !== true) {
    fail('workspace_integration_consent_required');
  }
  const scopes = uniqueStrings(value.scopes, {
    code: 'invalid_workspace_integration_scopes',
    allowed: config.integrations.google_drive.allowedScopes,
    max: config.limits.permissionScopes
  });

  return Object.freeze({
    integration_key: 'google_drive',
    scopes,
    explicit_consent: true,
    connected: false,
    read_enabled: false,
    write_enabled: false,
    status: 'draft',
    provider_subject: null,
    account_label: null,
    token_expires_at: null,
    refresh_token_present: false,
    revoked_at: null,
    last_error_code: null,
    updated_at: new Date().toISOString()
  });
}

function normalizeToolKeys(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 32) {
    fail('workspace_skill_tool_keys_invalid');
  }
  const normalized = value.map(item =>
    text(item, {
      code: 'workspace_skill_tool_keys_invalid',
      max: 200
    })
  );
  if (
    new Set(normalized).size !== normalized.length ||
    normalized.some(item => item === '*' || !TOOL_KEY_RE.test(item))
  ) {
    fail('workspace_skill_tool_keys_invalid');
  }
  return normalized;
}

function normalizeSkill(input) {
  const value = object(input, 'workspace_skill_invalid');
  assertNoSecretMaterial(value);
  return Object.freeze({
    name: text(value.name, {
      code: 'workspace_skill_name_invalid',
      max: 120
    }),
    description:
      value.description == null || value.description === ''
        ? ''
        : text(value.description, {
            code: 'workspace_skill_description_invalid',
            max: 2000
          }),
    instructions: text(value.instructions, {
      code: 'workspace_skill_instructions_invalid',
      max: 12000
    }),
    tool_keys: normalizeToolKeys(value.toolKeys),
    status: value.enabled === false ? 'disabled' : 'active',
    enabled: value.enabled !== false,
    updated_at: new Date().toISOString()
  });
}

function normalizeSkillPatch(input) {
  const value = object(input, 'workspace_skill_patch_invalid');
  assertNoSecretMaterial(value);
  const patch = { updated_at: new Date().toISOString() };

  if (value.name !== undefined) {
    patch.name = text(value.name, {
      code: 'workspace_skill_name_invalid',
      max: 120
    });
  }
  if (value.description !== undefined) {
    patch.description =
      value.description == null || value.description === ''
        ? ''
        : text(value.description, {
            code: 'workspace_skill_description_invalid',
            max: 2000
          });
  }
  if (value.instructions !== undefined) {
    patch.instructions = text(value.instructions, {
      code: 'workspace_skill_instructions_invalid',
      max: 12000
    });
  }
  if (value.toolKeys !== undefined) {
    patch.tool_keys = normalizeToolKeys(value.toolKeys);
  }
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== 'boolean') {
      fail('workspace_skill_enabled_invalid');
    }
    patch.enabled = value.enabled;
    patch.status = value.enabled ? 'active' : 'disabled';
  }

  if (Object.keys(patch).length === 1) {
    fail('workspace_skill_patch_empty');
  }
  return Object.freeze(patch);
}

function dataOrThrow(result, code) {
  if (!result || typeof result !== 'object' || result.error) {
    throw storeError(code, result && result.error ? result.error : null);
  }
  return result.data;
}

function normalizeLimit(value, fallback = 100, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function createWorkspaceConnectionsStore(db) {
  if (
    !db ||
    typeof db.from !== 'function' ||
    typeof db.rpc !== 'function'
  ) {
    throw new TypeError(
      'createWorkspaceConnectionsStore requires a Supabase-compatible database client.'
    );
  }

  async function listPluginConnections(ownerId, { limit = 100 } = {}) {
    const result = await db
      .from('workspace_plugin_connections')
      .select(
        'id,plugin_key,plugin_kind,display_name,scopes,explicit_consent,' +
          'installed,runtime_enabled,manifest,endpoint_url,status,created_at,' +
          'updated_at,revoked_at,last_error_code'
      )
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
      .limit(normalizeLimit(limit));
    return dataOrThrow(result, 'workspace_plugin_connections_list_failed') || [];
  }

  async function createPluginConnection({ ownerId, connection }) {
    const row = {
      owner_id: ownerId,
      ...normalizePluginConnection(connection)
    };
    const result = await db
      .from('workspace_plugin_connections')
      .insert(row)
      .select(
        'id,plugin_key,plugin_kind,display_name,scopes,explicit_consent,' +
          'installed,runtime_enabled,manifest,endpoint_url,status,created_at,' +
          'updated_at,revoked_at,last_error_code'
      )
      .single();
    return dataOrThrow(result, 'workspace_plugin_connection_create_failed');
  }

  async function listIntegrationConnections(ownerId, { limit = 100 } = {}) {
    const result = await db
      .from('workspace_integration_connections')
      .select(
        'id,integration_key,scopes,explicit_consent,connected,read_enabled,' +
          'write_enabled,status,provider_subject,account_label,token_expires_at,' +
          'refresh_token_present,created_at,updated_at,revoked_at,last_error_code'
      )
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
      .limit(normalizeLimit(limit));
    return dataOrThrow(result, 'workspace_integration_connections_list_failed') || [];
  }

  async function createIntegrationConnection({ ownerId, connection }) {
    const row = {
      owner_id: ownerId,
      ...normalizeIntegrationConnection(connection)
    };
    const result = await db
      .from('workspace_integration_connections')
      .insert(row)
      .select(
        'id,integration_key,scopes,explicit_consent,connected,read_enabled,' +
          'write_enabled,status,provider_subject,account_label,token_expires_at,' +
          'refresh_token_present,created_at,updated_at,revoked_at,last_error_code'
      )
      .single();
    return dataOrThrow(result, 'workspace_integration_connection_create_failed');
  }

  async function revokeIntegrationConnection({ ownerId, connectionId }) {
    const id = uuid(connectionId, 'workspace_integration_connection_id_invalid');
    const result = await db.rpc(
      'revoke_workspace_integration_connection_pack089',
      {
        p_owner_id: ownerId,
        p_connection_id: id
      }
    );
    return dataOrThrow(result, 'workspace_integration_connection_revoke_failed');
  }

  async function revokePluginConnection({ ownerId, connectionId }) {
    const id = uuid(connectionId, 'workspace_plugin_connection_id_invalid');
    const result = await db.rpc(
      'revoke_workspace_plugin_connection_pack089',
      {
        p_owner_id: ownerId,
        p_connection_id: id
      }
    );
    return dataOrThrow(result, 'workspace_plugin_connection_revoke_failed');
  }

  async function listSkills(ownerId, { limit = 100 } = {}) {
    const result = await db
      .from('workspace_skills')
      .select(
        'id,name,description,instructions,tool_keys,status,enabled,created_at,updated_at'
      )
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
      .limit(normalizeLimit(limit));
    return dataOrThrow(result, 'workspace_skills_list_failed') || [];
  }

  async function createSkill({ ownerId, skill }) {
    const row = {
      owner_id: ownerId,
      ...normalizeSkill(skill)
    };
    const result = await db
      .from('workspace_skills')
      .insert(row)
      .select(
        'id,name,description,instructions,tool_keys,status,enabled,created_at,updated_at'
      )
      .single();
    return dataOrThrow(result, 'workspace_skill_create_failed');
  }

  async function updateSkill({ ownerId, skillId, patch }) {
    const id = uuid(skillId, 'workspace_skill_id_invalid');
    const update = normalizeSkillPatch(patch);
    const result = await db
      .from('workspace_skills')
      .update(update)
      .eq('id', id)
      .eq('owner_id', ownerId)
      .select(
        'id,name,description,instructions,tool_keys,status,enabled,created_at,updated_at'
      )
      .maybeSingle();
    const row = dataOrThrow(result, 'workspace_skill_update_failed');
    if (!row) throw storeError('workspace_skill_not_found');
    return row;
  }

  return Object.freeze({
    listPluginConnections,
    createPluginConnection,
    listIntegrationConnections,
    createIntegrationConnection,
    revokeIntegrationConnection,
    revokePluginConnection,
    listSkills,
    createSkill,
    updateSkill
  });
}

let defaultStore = null;
function getDefaultWorkspaceConnectionsStore() {
  if (!defaultStore) {
    const { supabaseAdmin } = require('./supabaseAdmin');
    defaultStore = createWorkspaceConnectionsStore(supabaseAdmin);
  }
  return defaultStore;
}

module.exports = {
  MCP_CONNECTION_SCOPES,
  assertNoSecretMaterial,
  normalizeHttpsEndpoint,
  normalizePluginConnection,
  normalizeIntegrationConnection,
  normalizeSkill,
  normalizeSkillPatch,
  createWorkspaceConnectionsStore,
  getDefaultWorkspaceConnectionsStore
};
