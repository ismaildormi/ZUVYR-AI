'use strict';

const crypto = require('node:crypto');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,119}$/;
const TOOL_KEY_RE = /^[a-z0-9][a-z0-9._:-]{0,199}$/;
const ALLOWED_INTEGRATION_SCOPES = new Set([
  'drive.file.read',
  'drive.file.write',
  'drive.export'
]);
const ALLOWED_PLUGIN_SCOPES = new Set([
  'workspace.items.read',
  'workspace.items.write',
  'projects.read',
  'projects.write',
  'exports.create'
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function text(value, code, max, { optional = false } = {}) {
  const result = String(value == null ? '' : value).trim();
  if (!result) {
    if (optional) return null;
    fail(code);
  }
  if (result.length > max) fail(code);
  return result;
}

function uuid(value, code = 'invalid_workspace_connection_id') {
  const result = text(value, code, 200).toLowerCase();
  if (!UUID_RE.test(result)) fail(code);
  return result;
}

function uniqueScopes(value, allowed, code) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) fail(code);
  const scopes = [...new Set(value.map(item => String(item || '').trim().toLowerCase()))];
  if (!scopes.length || scopes.length > 12 || scopes.includes('*')) fail(code);
  for (const scope of scopes) if (!allowed.has(scope)) fail(code);
  return scopes.sort();
}

function assertNoCredentialMaterial(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value == null ? {} : value);
  } catch {
    fail('workspace_connection_payload_invalid');
  }
  if (/(?:access|refresh|oauth|api)[_-]?token|client[_-]?secret|authorization|cookie|password|pkce[_-]?verifier/i.test(serialized)) {
    fail('workspace_credential_material_blocked');
  }
  return true;
}

function normalizeIntegrationDraft(input) {
  assertNoCredentialMaterial(input);
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_workspace_integration');
  const integrationKey = String(input.integrationKey || input.integration || '').trim().toLowerCase();
  if (integrationKey !== 'google_drive') fail('unsupported_workspace_integration');
  if (input.explicitConsent !== true) fail('workspace_integration_consent_required');
  const scopes = uniqueScopes(input.scopes, ALLOWED_INTEGRATION_SCOPES, 'invalid_workspace_integration_scopes');
  return Object.freeze({
    integrationKey,
    scopes,
    explicitConsent: true
  });
}

function normalizePluginDraft(input) {
  assertNoCredentialMaterial(input);
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_workspace_plugin');
  const pluginKind = String(input.pluginKind || 'plugin').trim().toLowerCase();
  if (!['plugin','mcp'].includes(pluginKind)) fail('invalid_workspace_plugin_kind');
  const pluginKey = text(input.pluginKey, 'invalid_workspace_plugin_key', 120).toLowerCase();
  if (!KEY_RE.test(pluginKey)) fail('invalid_workspace_plugin_key');
  const displayName = text(input.displayName || pluginKey, 'invalid_workspace_plugin_name', 120);
  const scopes = uniqueScopes(input.scopes, ALLOWED_PLUGIN_SCOPES, 'invalid_workspace_plugin_scopes');

  const manifest = input.manifest == null ? {} : input.manifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('invalid_workspace_plugin_manifest');
  const raw = JSON.stringify(manifest);
  if (raw.length > 24000) fail('invalid_workspace_plugin_manifest');
  if (/(?:javascript:|data:text/html|<script\b|require\s*\(|process\.|child_process|eval\s*\()/i.test(raw)) {
    fail('workspace_plugin_executable_manifest_blocked');
  }

  let endpointUrl = null;
  if (input.endpointUrl != null && String(input.endpointUrl).trim() !== '') {
    const rawUrl = text(input.endpointUrl, 'invalid_workspace_plugin_endpoint', 2048);
    let parsed;
    try { parsed = new URL(rawUrl); } catch { fail('invalid_workspace_plugin_endpoint'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail('invalid_workspace_plugin_endpoint');
    endpointUrl = parsed.toString();
  }
  if (pluginKind === 'mcp' && !endpointUrl) fail('workspace_mcp_endpoint_required');

  return Object.freeze({
    pluginKind,
    pluginKey,
    displayName,
    scopes,
    explicitConsent: true,
    manifest: Object.freeze({ ...manifest }),
    endpointUrl
  });
}

function normalizeSkill(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_workspace_skill');
  assertNoCredentialMaterial(input);
  const name = text(input.name, 'invalid_workspace_skill_name', 120);
  const description = text(input.description, 'invalid_workspace_skill_description', 2000, { optional: true }) || '';
  const instructions = text(input.instructions, 'invalid_workspace_skill_instructions', 12000);
  const values = input.toolKeys == null ? [] : input.toolKeys;
  if (!Array.isArray(values) || values.length > 32) fail('invalid_workspace_skill_tools');
  const toolKeys = [...new Set(values.map(item => String(item || '').trim().toLowerCase()))].filter(Boolean).sort();
  if (toolKeys.length > 32 || toolKeys.includes('*')) fail('invalid_workspace_skill_tools');
  for (const key of toolKeys) if (!TOOL_KEY_RE.test(key)) fail('invalid_workspace_skill_tools');
  return Object.freeze({ name, description, instructions, toolKeys });
}

function operationFingerprint(value) {
  const stable = JSON.stringify(value, Object.keys(value || {}).sort());
  return crypto.createHash('sha256').update(stable).digest('hex');
}

module.exports = {
  ALLOWED_INTEGRATION_SCOPES,
  ALLOWED_PLUGIN_SCOPES,
  normalizeIntegrationDraft,
  normalizePluginDraft,
  normalizeSkill,
  assertNoCredentialMaterial,
  operationFingerprint,
  uuid
};
