'use strict';

const fs = require('fs');
const assert = require('assert');
const aiTools = require('./src/modules/ai/tools');
const {
  createWorkspaceToolRuntime,
  normalizeManifestTools
} = require('./lib/workspaceToolRuntime');
const {
  createMcpRemoteAdapter,
  validateEndpoint,
  isBlockedAddress
} = require('./lib/workspaceMcpClient');
const { buildChallenge } = require('./lib/permissionCenterPolicy');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PLUGIN_ID = '33333333-3333-4333-8333-333333333333';
const MCP_ID = '44444444-4444-4444-8444-444444444444';
const SKILL_ID = '55555555-5555-4555-8555-555555555555';

function baseConnection(overrides = {}) {
  return {
    id: PLUGIN_ID,
    plugin_key: 'pack089-demo',
    plugin_kind: 'plugin',
    display_name: 'Pack089 Demo',
    scopes: ['projects.read'],
    status: 'active',
    installed: true,
    runtime_enabled: true,
    revoked_at: null,
    endpoint_url: null,
    manifest: {
      tools: [{
        name: 'echo',
        description: 'Echo a value through a built-in tool.',
        inputSchema: {
          type: 'object',
          properties: { value: { type: 'string' } },
          additionalProperties: false
        },
        requiredScopes: ['projects.read'],
        delegateToolKey: 'pack089.test.echo'
      }]
    },
    ...overrides
  };
}

(async () => {
  aiTools.registerTool('pack089.test.echo', {
    source: 'builtin',
    description: 'Pack089 unit echo',
    inputSchema: { type: 'object' },
    handler: async input => ({ echoed: input.value })
  });

  const permissions = [];
  let connection = baseConnection();
  const connectionStore = {
    async listActivePlugins(ownerId) {
      assert.equal(ownerId, OWNER);
      return [connection];
    },
    async getPluginConnection({ ownerId, connectionId }) {
      assert.equal(ownerId, OWNER);
      assert.equal(connectionId, connection.id);
      return connection;
    },
    async installPlugin(input) {
      assert.equal(input.ownerId, OWNER);
      assert.equal(input.connectionId, connection.id);
      connection = { ...connection, status: 'active', installed: true, runtime_enabled: true };
      return { connection_id: connection.id, installed: true, runtime_enabled: true, status: 'active' };
    },
    async getPluginSecret({ ownerId, connectionId }) {
      assert.equal(ownerId, OWNER);
      assert.equal(connectionId, connection.id);
      return 'Bearer pack089-test';
    },
    async getSkill({ ownerId, skillId }) {
      assert.equal(ownerId, OWNER);
      assert.equal(skillId, SKILL_ID);
      return {
        id: SKILL_ID,
        name: 'Pack089 Skill',
        description: 'resolves dynamic tools',
        instructions: 'Use the echo tool.',
        tool_keys: [`plugin:${PLUGIN_ID}:echo`],
        status: 'active',
        enabled: true
      };
    }
  };

  const permissionStore = {
    async consumeWorkspaceTool(input) {
      permissions.push(input);
      return { success: true, allowed: true, grant_id: 'grant-1' };
    }
  };

  const fakeMcp = {
    preflightCalls: [],
    invokeCalls: [],
    async preflight(input) {
      this.preflightCalls.push(input);
      return { ready: true };
    },
    async invoke(input) {
      this.invokeCalls.push(input);
      return { content: [{ type: 'text', text: 'mcp-ok' }] };
    }
  };

  const runtime = createWorkspaceToolRuntime({
    connectionStore,
    permissionStore,
    mcpAdapter: fakeMcp,
    tools: aiTools
  });

  const manifestTools = normalizeManifestTools(connection);
  assert.equal(manifestTools.length, 1);
  assert.equal(manifestTools[0].key, `plugin:${PLUGIN_ID}:echo`);

  const hydrated = await runtime.hydrateOwnerTools(OWNER);
  assert(hydrated.some(item => item.key === `plugin:${PLUGIN_ID}:echo`));
  assert(!aiTools.listTools({ ownerId: OTHER }).some(item => item.key === `plugin:${PLUGIN_ID}:echo`));

  const prepared = await runtime.prepareInvocation({
    ownerId: OWNER,
    toolKey: `plugin:${PLUGIN_ID}:echo`,
    input: { value: 'hello' },
    sessionId: 'session-89b'
  });
  assert(/^[0-9a-f]{64}$/.test(prepared.operationFingerprint));
  assert.equal(prepared.permissionRequest.action, 'plugin.invoke');
  assert.equal(prepared.permissionRequest.scopeType, 'resource_session');
  assert.equal(prepared.permissionRequest.resourceNamespace, 'plugin_connection');
  assert.equal(prepared.permissionRequest.constraints.toolKey, `plugin:${PLUGIN_ID}:echo`);

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const challenge = buildChallenge({
    ...prepared.permissionRequest,
    expiresAt
  }, { ownerId: OWNER });
  assert.equal(challenge.normalized.scopeType, 'resource_session');
  assert.equal(challenge.normalized.resourceNamespace, 'plugin_connection');
  assert.equal(challenge.normalized.constraints.operationFingerprint, prepared.operationFingerprint);

  const pluginResult = await runtime.invoke({
    ownerId: OWNER,
    toolKey: `plugin:${PLUGIN_ID}:echo`,
    input: { value: 'hello' },
    sessionId: 'session-89b',
    requestId: 'request-plugin-89b'
  });
  assert.equal(pluginResult.billedCredits, 0);
  assert.deepEqual(pluginResult.result, { echoed: 'hello' });
  assert.equal(permissions.length, 1);
  assert.equal(permissions[0].action, 'plugin.invoke');
  assert.equal(permissions[0].toolKey, `plugin:${PLUGIN_ID}:echo`);
  assert.equal(permissions[0].operationFingerprint, prepared.operationFingerprint);

  const skill = await runtime.resolveSkill({ ownerId: OWNER, skillId: SKILL_ID });
  assert.equal(skill.tools.length, 1);
  assert.equal(skill.tools[0].key, `plugin:${PLUGIN_ID}:echo`);

  const installPrepared = await runtime.prepareInstall({
    ownerId: OWNER,
    connectionId: PLUGIN_ID,
    sessionId: 'session-install-89b'
  });
  assert.equal(installPrepared.permissionRequest.action, 'plugin.install');
  assert(/^[0-9a-f]{64}$/.test(installPrepared.operationFingerprint));
  const installed = await runtime.installPlugin({
    ownerId: OWNER,
    connectionId: PLUGIN_ID,
    sessionId: 'session-install-89b',
    requestId: 'request-install-89b',
    operationFingerprint: installPrepared.operationFingerprint
  });
  assert.equal(installed.installed, true);

  connection = baseConnection({
    id: MCP_ID,
    plugin_key: 'pack089-mcp',
    plugin_kind: 'mcp',
    endpoint_url: 'https://mcp.example.com/mcp',
    manifest: {
      tools: [{
        name: 'remote_echo',
        remoteToolName: 'echo',
        description: 'Remote echo',
        inputSchema: { type: 'object' },
        requiredScopes: ['projects.read']
      }]
    }
  });

  const mcpPrepared = await runtime.prepareInvocation({
    ownerId: OWNER,
    toolKey: `mcp:${MCP_ID}:remote_echo`,
    input: { value: 'remote' },
    sessionId: 'session-mcp-89b'
  });
  const mcpResult = await runtime.invoke({
    ownerId: OWNER,
    toolKey: `mcp:${MCP_ID}:remote_echo`,
    input: { value: 'remote' },
    sessionId: 'session-mcp-89b',
    requestId: 'request-mcp-89b'
  });
  assert.equal(mcpResult.billedCredits, 0);
  assert.equal(fakeMcp.preflightCalls.length, 1);
  assert.equal(fakeMcp.invokeCalls.length, 1);
  assert.equal(permissions.at(-1).action, 'mcp.invoke');
  assert.equal(permissions.at(-1).operationFingerprint, mcpPrepared.operationFingerprint);

  assert.throws(
    () => normalizeManifestTools(baseConnection({
      manifest: { tools: [{ name: 'bad', delegateToolKey: 'plugin:loop', requiredScopes: [] }] }
    })),
    error => error.code === 'workspace_plugin_delegate_invalid'
  );

  assert.throws(
    () => validateEndpoint('https://127.0.0.1/mcp'),
    error => error.code === 'workspace_mcp_endpoint_blocked'
  );
  assert.equal(isBlockedAddress('10.1.2.3'), true);
  assert.equal(isBlockedAddress('127.0.0.1'), true);
  assert.equal(isBlockedAddress('169.254.1.1'), true);
  assert.equal(isBlockedAddress('8.8.8.8'), false);
  assert.equal(isBlockedAddress('::1'), true);
  assert.equal(isBlockedAddress('fd00::1'), true);

  let networkCalls = 0;
  const disabledMcp = createMcpRemoteAdapter({
    enabled: false,
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('network_must_not_run');
    }
  });
  await assert.rejects(
    disabledMcp.invoke({
      endpointUrl: 'https://example.com/mcp',
      remoteToolName: 'echo',
      input: {}
    }),
    error => error.code === 'workspace_mcp_remote_disabled'
  );
  assert.equal(networkCalls, 0);

  const missingSdk = createMcpRemoteAdapter({
    enabled: true,
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    loadSdk: async () => {
      const error = new Error('Cannot find package @modelcontextprotocol/client');
      error.code = 'ERR_MODULE_NOT_FOUND';
      throw error;
    },
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('network_must_not_run');
    }
  });
  await assert.rejects(
    missingSdk.preflight({ endpointUrl: 'https://example.com/mcp' }),
    error => error.code === 'workspace_mcp_sdk_unavailable'
  );
  assert.equal(networkCalls, 0);

  const privateDns = createMcpRemoteAdapter({
    enabled: true,
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    loadSdk: async () => ({
      Client: class {},
      StreamableHTTPClientTransport: class {}
    }),
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('network_must_not_run');
    }
  });
  await assert.rejects(
    privateDns.preflight({ endpointUrl: 'https://mcp.example.com/mcp' }),
    error => error.code === 'workspace_mcp_endpoint_blocked'
  );
  assert.equal(networkCalls, 0);

  const sql = fs.readFileSync('90_pack089_89b_tool_runtime_permissions.sql', 'utf8');
  const routes = fs.readFileSync('lib/workspaceRoutes.js', 'utf8');
  const repo = fs.readFileSync('lib/permissionCenterRepository.js', 'utf8');
  const packageJson = fs.readFileSync('package.json', 'utf8');

  for (const marker of [
    'consume_workspace_tool_permission_pack089',
    'install_workspace_plugin_pack089',
    "scope_type='resource_session'",
    "constraints->>'operationFingerprint'",
    "constraints->>'toolKey'",
    'to service_role'
  ]) assert(sql.includes(marker));

  for (const marker of [
    "router.get('/tools'",
    "router.get('/skills/:id/resolve'",
    "router.post('/plugins/:id/install/challenge'",
    "router.post('/plugins/install'",
    "router.post('/tools/invoke/challenge'",
    "router.post('/tools/invoke'"
  ]) assert(routes.includes(marker));

  assert(repo.includes('consumeWorkspaceTool'));
  assert(packageJson.includes('test-pack089-89b-unified-tools-runtime.js'));

  console.log('PASS: Pack089 89B uses one owner-aware ai.tools seam for Skills/plugins/MCP');
  console.log('PASS: exact operation fingerprint + tool key permission binding is wired');
  console.log('PASS: MCP is fail-closed before permission/network when gate or SDK is unavailable');
  console.log('PASS: SSRF/private targets are blocked before MCP transport');
  console.log('PASS: dynamic tool invocations bill zero credits in 89B');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
