'use strict';

function storeError(code, detail = null) {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  return error;
}

function normalizeLimit(value, fallback = 50, max = 200) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function createWorkspaceConnectionStore(db) {
  if (!db || typeof db.from !== 'function' || typeof db.rpc !== 'function') {
    throw storeError('workspace_connection_store_unavailable');
  }

  async function list(ownerId, { limit = 50 } = {}) {
    const n = normalizeLimit(limit);
    const [integrations, plugins] = await Promise.all([
      db
        .from('workspace_integration_connections')
        .select('id,integration_key,scopes,explicit_consent,status,connected,read_enabled,write_enabled,provider_subject,account_label,token_expires_at,refresh_token_present,created_at,updated_at,revoked_at,last_error_code')
        .eq('owner_id', ownerId)
        .order('updated_at', { ascending: false })
        .limit(n),
      db
        .from('workspace_plugin_connections')
        .select('id,plugin_key,plugin_kind,display_name,scopes,explicit_consent,status,installed,runtime_enabled,manifest,endpoint_url,created_at,updated_at,revoked_at,last_error_code')
        .eq('owner_id', ownerId)
        .order('updated_at', { ascending: false })
        .limit(n)
    ]);
    if (integrations.error) throw storeError('workspace_integrations_read_failed', integrations.error.message);
    if (plugins.error) throw storeError('workspace_plugins_read_failed', plugins.error.message);
    return Object.freeze({
      integrations: integrations.data || [],
      plugins: plugins.data || []
    });
  }

  async function createIntegration({ ownerId, integrationKey, scopes, explicitConsent }) {
    const { data, error } = await db
      .from('workspace_integration_connections')
      .insert({
        owner_id: ownerId,
        integration_key: integrationKey,
        scopes,
        explicit_consent: explicitConsent === true,
        status: 'draft',
        connected: false,
        read_enabled: false,
        write_enabled: false
      })
      .select('id,integration_key,scopes,explicit_consent,status,connected,read_enabled,write_enabled,created_at,updated_at')
      .single();
    if (error) throw storeError('workspace_integration_create_failed', error.message);
    return data;
  }

  async function createPlugin({ ownerId, pluginKind, pluginKey, displayName, scopes, explicitConsent, manifest, endpointUrl }) {
    const { data, error } = await db
      .from('workspace_plugin_connections')
      .insert({
        owner_id: ownerId,
        plugin_kind: pluginKind,
        plugin_key: pluginKey,
        display_name: displayName,
        scopes,
        explicit_consent: explicitConsent === true,
        manifest,
        endpoint_url: endpointUrl,
        status: 'draft',
        installed: false,
        runtime_enabled: false
      })
      .select('id,plugin_key,plugin_kind,display_name,scopes,explicit_consent,status,installed,runtime_enabled,manifest,endpoint_url,created_at,updated_at')
      .single();
    if (error) throw storeError('workspace_plugin_create_failed', error.message);
    return data;
  }

  async function revokeIntegration({ ownerId, connectionId }) {
    const { data, error } = await db.rpc('revoke_workspace_integration_connection_pack089', {
      p_owner_id: ownerId,
      p_connection_id: connectionId
    });
    if (error) throw storeError('workspace_integration_revoke_failed', error.message);
    return data;
  }

  async function revokePlugin({ ownerId, connectionId }) {
    const { data, error } = await db.rpc('revoke_workspace_plugin_connection_pack089', {
      p_owner_id: ownerId,
      p_connection_id: connectionId
    });
    if (error) throw storeError('workspace_plugin_revoke_failed', error.message);
    return data;
  }

  async function listSkills(ownerId, { limit = 50 } = {}) {
    const { data, error } = await db
      .from('workspace_skills')
      .select('id,name,description,instructions,tool_keys,status,enabled,created_at,updated_at')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
      .limit(normalizeLimit(limit));
    if (error) throw storeError('workspace_skills_read_failed', error.message);
    return data || [];
  }

  async function createSkill({ ownerId, name, description, instructions, toolKeys }) {
    const { data, error } = await db
      .from('workspace_skills')
      .insert({
        owner_id: ownerId,
        name,
        description,
        instructions,
        tool_keys: toolKeys,
        status: 'active',
        enabled: true
      })
      .select('id,name,description,instructions,tool_keys,status,enabled,created_at,updated_at')
      .single();
    if (error) throw storeError('workspace_skill_create_failed', error.message);
    return data;
  }

  async function setSkillEnabled({ ownerId, skillId, enabled }) {
    const { data, error } = await db
      .from('workspace_skills')
      .update({
        status: enabled ? 'active' : 'disabled',
        enabled: enabled === true,
        updated_at: new Date().toISOString()
      })
      .eq('owner_id', ownerId)
      .eq('id', skillId)
      .select('id,name,description,instructions,tool_keys,status,enabled,created_at,updated_at')
      .single();
    if (error || !data) throw storeError('workspace_skill_update_failed', error?.message || null);
    return data;
  }

  return Object.freeze({
    list,
    createIntegration,
    createPlugin,
    revokeIntegration,
    revokePlugin,
    listSkills,
    createSkill,
    setSkillEnabled
  });
}

let defaultStore = null;
function getDefaultWorkspaceConnectionStore() {
  if (!defaultStore) {
    const { supabaseAdmin } = require('./supabaseAdmin');
    defaultStore = createWorkspaceConnectionStore(supabaseAdmin);
  }
  return defaultStore;
}

module.exports = {
  createWorkspaceConnectionStore,
  getDefaultWorkspaceConnectionStore
};
