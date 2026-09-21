'use strict';

const fs = require('fs');
const assert = require('assert');

const {
  normalizeIntegrationDraft,
  normalizePluginDraft,
  normalizeSkill,
  operationFingerprint
} = require('./lib/workspaceConnectionContract');
const {
  normalizePermissionRequest,
  publicPolicy
} = require('./lib/permissionCenterPolicy');

const FP = 'a'.repeat(64);
const OWNER = '11111111-1111-4111-8111-111111111111';
const RESOURCE = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-09-21T19:00:00Z');

function rejects(fn, code) {
  assert.throws(fn, error => error && error.code === code, code);
}

const integration = normalizeIntegrationDraft({
  integrationKey: 'google_drive',
  scopes: ['drive.file.read','drive.export','drive.file.read'],
  explicitConsent: true
});
assert.deepStrictEqual(integration.scopes, ['drive.export','drive.file.read']);
assert.equal(integration.integrationKey, 'google_drive');
rejects(() => normalizeIntegrationDraft({
  integrationKey: 'google_drive',
  scopes: ['*'],
  explicitConsent: true
}), 'invalid_workspace_integration_scopes');
rejects(() => normalizeIntegrationDraft({
  integrationKey: 'google_drive',
  scopes: ['drive.file.read'],
  explicitConsent: true,
  accessToken: 'must-not-enter-workspace-json'
}), 'workspace_credential_material_blocked');

const mcp = normalizePluginDraft({
  pluginKind: 'mcp',
  pluginKey: 'mcp.docs',
  displayName: 'Docs MCP',
  scopes: ['workspace.items.read'],
  explicitConsent: true,
  manifest: { tools: ['search'] },
  endpointUrl: 'https://mcp.example.com/rpc'
});
assert.equal(mcp.pluginKind, 'mcp');
assert.equal(mcp.endpointUrl, 'https://mcp.example.com/rpc');
rejects(() => normalizePluginDraft({
  pluginKind: 'mcp',
  pluginKey: 'mcp.bad',
  scopes: ['workspace.items.read'],
  explicitConsent: true,
  manifest: {},
  endpointUrl: 'http://127.0.0.1:8000'
}), 'invalid_workspace_plugin_endpoint');
rejects(() => normalizePluginDraft({
  pluginKind: 'mcp',
  pluginKey: 'mcp.private',
  scopes: ['workspace.items.read'],
  explicitConsent: true,
  manifest: {},
  endpointUrl: 'https://127.0.0.1/rpc'
}), 'workspace_mcp_endpoint_blocked');
rejects(() => normalizePluginDraft({
  pluginKind: 'mcp',
  pluginKey: 'mcp.metadata',
  scopes: ['workspace.items.read'],
  explicitConsent: true,
  manifest: {},
  endpointUrl: 'https://metadata.google.internal/rpc'
}), 'workspace_mcp_endpoint_blocked');
rejects(() => normalizePluginDraft({
  pluginKind: 'plugin',
  pluginKey: 'bad-code',
  scopes: ['workspace.items.read'],
  explicitConsent: true,
  manifest: { setup: 'eval(userCode)' }
}), 'workspace_plugin_executable_manifest_blocked');

const skill = normalizeSkill({
  name: 'Research brief',
  description: 'Use approved sources',
  instructions: 'Search only through approved connected tools and summarize.',
  toolKeys: ['drive.search','mcp:docs:search','drive.search']
});
assert.deepStrictEqual(skill.toolKeys, ['drive.search','mcp:docs:search']);
rejects(() => normalizeSkill({
  name: 'Bad',
  instructions: 'No',
  toolKeys: ['*']
}), 'invalid_workspace_skill_tools');

const readPermission = normalizePermissionRequest({
  action: 'connection.read',
  grantMode: 'scoped',
  scopeType: 'resource',
  resourceNamespace: 'integration_connection',
  resourceId: RESOURCE,
  expiresAt: '2026-09-21T20:00:00Z',
  constraints: {}
}, { ownerId: OWNER, now: NOW });
assert.equal(readPermission.scopeType, 'resource');
assert.equal(readPermission.sessionId, null);

const writePermission = normalizePermissionRequest({
  action: 'connection.write',
  grantMode: 'allow_once',
  scopeType: 'resource_session',
  resourceNamespace: 'integration_connection',
  resourceId: RESOURCE,
  sessionId: 'connection-session-1',
  expiresAt: '2026-09-21T19:10:00Z',
  constraints: { operationFingerprint: FP }
}, { ownerId: OWNER, now: NOW });
assert.equal(writePermission.constraints.operationFingerprint, FP);

const mcpPermission = normalizePermissionRequest({
  action: 'mcp.invoke',
  grantMode: 'session',
  scopeType: 'resource_session',
  resourceNamespace: 'plugin_connection',
  resourceId: RESOURCE,
  sessionId: 'mcp-session-1',
  expiresAt: '2026-09-21T19:20:00Z',
  constraints: { operationFingerprint: FP, toolKey: 'mcp:docs:search' }
}, { ownerId: OWNER, now: NOW });
assert.equal(mcpPermission.constraints.toolKey, 'mcp:docs:search');
rejects(() => normalizePermissionRequest({
  action: 'mcp.invoke',
  grantMode: 'session',
  scopeType: 'resource_session',
  resourceNamespace: 'plugin_connection',
  resourceId: RESOURCE,
  sessionId: 'mcp-session-1',
  expiresAt: '2026-09-21T19:20:00Z',
  constraints: { toolKey: 'mcp:docs:search' }
}, { ownerId: OWNER, now: NOW }), 'permission_operation_fingerprint_required');

const policy = publicPolicy();
for (const action of ['connection.read','connection.write','plugin.install','plugin.invoke','mcp.invoke']) {
  assert(policy.actions[action], 'missing policy action ' + action);
}

const sql = fs.readFileSync('89_pack089_connections_permissions.sql', 'utf8');
const hardeningSql = fs.readFileSync('89_pack089_89a_oauth_revoke_hardening.sql', 'utf8');
const allSql = sql + '\n' + hardeningSql;
const routes = fs.readFileSync('lib/workspaceRoutes.js', 'utf8');
const repository = fs.readFileSync('lib/workspaceConnectionRepository.js', 'utf8');
const contract = fs.readFileSync('lib/workspaceConnectionContract.js', 'utf8');

for (const marker of [
  'alter table public.workspace_plugin_connections',
  'alter table public.workspace_integration_connections',
  'create table if not exists public.workspace_oauth_sessions',
  'create table if not exists public.workspace_skills',
  'vault.create_secret',
  'vault.update_secret',
  'vault.decrypted_secrets',
  'delete from vault.secrets',
  "'integration_connection'",
  "'plugin_connection'",
  "'connection.read'",
  "'connection.write'",
  "'plugin.install'",
  "'plugin.invoke'",
  "'mcp.invoke'",
  'revoke all on public.workspace_oauth_sessions from public,anon,authenticated',
  'revoke all on public.workspace_skills from public,anon,authenticated',
  'to service_role',
  "resource_namespace='integration_connection'",
  "resource_namespace='plugin_connection'",
  "and c.status <> 'revoked'",
  "select s.pkce_verifier_secret_id",
  "update public.workspace_oauth_sessions",
  "set consumed_at=coalesce(consumed_at,now())"
]) assert(allSql.includes(marker), marker);

assert(!/create table if not exists public\.plugin_installations/i.test(allSql));
assert(!/grant\s+.+\s+to\s+(?:anon|authenticated)/i.test(allSql));

for (const route of [
  "router.get('/connections'",
  "router.post('/connections/integrations'",
  "router.post('/connections/plugins'",
  "router.post('/connections/integrations/:id/revoke'",
  "router.post('/connections/plugins/:id/revoke'",
  "router.get('/skills'",
  "router.post('/skills'",
  "router.post('/skills/:id/enabled'"
]) assert(routes.includes(route), route);

// 89A originally kept plugin install fail-closed. 89B is allowed to advance
// that surface only through the exact permission-gated runtime, while Drive
// connect remains gated until 89C.
assert(routes.includes("router.post('/plugins/install'"));
assert(routes.includes('toolRuntime.installPlugin'));
assert(!routes.includes("disabled(res, 'plugin_install')"));
assert(routes.includes("'/drive/connect'"));
assert(routes.includes("disabled(res, 'drive_connect')"));

assert(!repository.includes("select('credential_secret_id"));
assert(!/\\baccess_token\\b/.test(repository));
assert(!/\\brefresh_token\\b/.test(repository));
assert(contract.includes('workspace_credential_material_blocked'));

const fp1 = operationFingerprint({ tool: 'drive.search', query: 'x' });
const fp2 = operationFingerprint({ query: 'x', tool: 'drive.search' });
assert.equal(fp1, fp2);
const nestedFp1 = operationFingerprint({ tool: 'drive.search', args: { z: 1, a: 2 } });
const nestedFp2 = operationFingerprint({ args: { a: 2, z: 1 }, tool: 'drive.search' });
assert.equal(nestedFp1, nestedFp2);
assert(/^[0-9a-f]{64}$/.test(fp1));

console.log('PASS: Pack089 89A canonical connection tables are extended without reviving legacy plugin_installations');
console.log('PASS: OAuth/plugin secrets stay Vault-only and management responses exclude credential material');
console.log('PASS: Permission Center supports owner-scoped connection/plugin/MCP grants with operation fingerprints');
console.log('PASS: Skills remain declarative; 89B may advance plugin install only through the guarded runtime while Drive connect remains gated');
