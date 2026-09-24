'use strict';

const fs = require('fs');
const assert = require('assert');
const {
  createWorkspaceGoogleDriveRuntime,
  providerScopes,
  sha256Hex
} = require('./lib/workspaceGoogleDrive');
const { createWorkspaceToolRuntime } = require('./lib/workspaceToolRuntime');
const { buildChallenge } = require('./lib/permissionCenterPolicy');
const aiTools = require('./src/modules/ai/tools');

const OWNER = '11111111-1111-4111-8111-111111111111';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';

function jsonResponse(payload, status = 200, headers = {}) {
  const body = JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        const key = String(name || '').toLowerCase();
        return headers[key] ?? headers[name] ?? (key === 'content-type' ? 'application/json' : null);
      }
    },
    async text() { return body; },
    async json() { return payload; },
    async arrayBuffer() { return Buffer.from(body).buffer; }
  };
}

function bytesResponse(buffer, mimeType = 'text/plain', status = 200) {
  const data = Buffer.from(buffer);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        const key = String(name || '').toLowerCase();
        if (key === 'content-type') return mimeType;
        if (key === 'content-length') return String(data.length);
        return null;
      }
    },
    async text() { return data.toString('utf8'); },
    async json() { return JSON.parse(data.toString('utf8')); },
    async arrayBuffer() { return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength); }
  };
}

(async () => {
  const connection = {
    id: CONNECTION_ID,
    integration_key: 'google_drive',
    scopes: ['drive.export','drive.file.read','drive.file.write'],
    status: 'active',
    connected: true,
    read_enabled: true,
    write_enabled: true,
    revoked_at: null,
    provider_subject: null,
    account_label: null
  };

  const events = [];
  const oauthSessions = [];
  const secretWrites = [];
  let storedSecret = JSON.stringify({
    access_token: 'access-existing',
    refresh_token: 'refresh-existing',
    token_type: 'Bearer',
    expires_at: '2026-09-22T00:00:00.000Z'
  });

  const connectionStore = {
    async getIntegrationConnection({ ownerId, connectionId }) {
      assert.equal(ownerId, OWNER);
      assert.equal(connectionId, CONNECTION_ID);
      return { ...connection };
    },
    async listActiveIntegrations(ownerId) {
      assert.equal(ownerId, OWNER);
      return [{ ...connection }];
    },
    async listActivePlugins(ownerId) {
      assert.equal(ownerId, OWNER);
      return [];
    },
    async createOAuthSession(input) {
      events.push('oauth-session');
      oauthSessions.push(input);
      return { expires_at: input.expiresAt };
    },
    async consumeOAuthSession({ ownerId, stateHash }) {
      events.push('oauth-consume');
      assert.equal(ownerId, OWNER);
      assert.equal(stateHash, oauthSessions.at(-1).stateHash);
      return {
        owner_id: OWNER,
        connection_id: CONNECTION_ID,
        requested_scopes: [...connection.scopes],
        redirect_uri: 'https://app.example.com/oauth/google/callback',
        pkce_verifier: oauthSessions.at(-1).pkceVerifier
      };
    },
    async setIntegrationSecret(input) {
      events.push('vault-write');
      assert.equal(input.ownerId, OWNER);
      assert.equal(input.connectionId, CONNECTION_ID);
      assert(!input.secret.includes('client-secret-test'));
      storedSecret = input.secret;
      secretWrites.push(input);
      return { status: 'active' };
    },
    async getIntegrationSecret({ ownerId, connectionId }) {
      assert.equal(ownerId, OWNER);
      assert.equal(connectionId, CONNECTION_ID);
      events.push('vault-read');
      return storedSecret;
    },
    async revokeIntegration({ ownerId, connectionId }) {
      assert.equal(ownerId, OWNER);
      assert.equal(connectionId, CONNECTION_ID);
      events.push('local-revoke');
      return { revoked_permission_grants: 2 };
    }
  };

  const permissionCalls = [];
  const permissionStore = {
    async consumeWorkspaceConnection(input) {
      events.push('permission');
      permissionCalls.push(input);
      return { success: true, allowed: true, grant_id: 'grant-drive' };
    }
  };

  let nowMs = Date.parse('2026-09-21T21:15:00.000Z');
  const fetchCalls = [];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    fetchCalls.push({ url: href, method: init.method || 'GET', body: init.body || null });
    events.push('network');

    if (href === 'https://oauth2.googleapis.com/token') {
      return jsonResponse({
        access_token: 'access-from-google',
        refresh_token: 'refresh-from-google',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file'
      });
    }
    if (href.startsWith('https://www.googleapis.com/drive/v3/files?')) {
      return jsonResponse({
        files: [{ id: 'file_abcdef12', name: 'hello.txt', mimeType: 'text/plain' }],
        nextPageToken: null
      });
    }
    if (href.startsWith('https://www.googleapis.com/upload/drive/v3/files?')) {
      return jsonResponse({
        id: 'file_created12',
        name: 'created.txt',
        mimeType: 'text/plain',
        size: '5'
      });
    }
    if (href.startsWith('https://oauth2.googleapis.com/revoke')) {
      return jsonResponse({}, 200);
    }
    if (href.includes('/drive/v3/files/file_abcdef12?fields=')) {
      return jsonResponse({
        id: 'file_abcdef12',
        name: 'hello.txt',
        mimeType: 'text/plain',
        capabilities: { canDownload: true }
      });
    }
    if (href.includes('/drive/v3/files/file_abcdef12?alt=media')) {
      return bytesResponse(Buffer.from('hello'), 'text/plain');
    }
    throw new Error('unexpected_fetch:' + href);
  };

  const env = {
    GOOGLE_OAUTH_CLIENT_ID: 'client-id-test.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret-test',
    GOOGLE_OAUTH_REDIRECT_URI: 'https://app.example.com/oauth/google/callback'
  };

  const missing = createWorkspaceGoogleDriveRuntime({
    connectionStore,
    permissionStore,
    fetchImpl,
    env: {},
    now: () => nowMs
  });
  assert.throws(
    () => missing.assertOAuthConfigured(),
    error => error.code === 'workspace_google_oauth_not_configured'
  );
  await assert.rejects(
    missing.startOAuth({ ownerId: OWNER, connectionId: CONNECTION_ID }),
    error => error.code === 'workspace_google_oauth_not_configured'
  );
  assert.equal(fetchCalls.length, 0);

  const drive = createWorkspaceGoogleDriveRuntime({
    connectionStore,
    permissionStore,
    fetchImpl,
    env,
    now: () => nowMs
  });

  const oauth = await drive.startOAuth({ ownerId: OWNER, connectionId: CONNECTION_ID });
  const authUrl = new URL(oauth.authorizationUrl);
  assert.equal(authUrl.origin + authUrl.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
  assert(authUrl.searchParams.get('code_challenge'));
  assert(authUrl.searchParams.get('state'));
  assert.equal(oauthSessions.length, 1);
  assert(/^[0-9a-f]{64}$/.test(oauthSessions[0].stateHash));
  assert.equal(oauthSessions[0].stateHash, sha256Hex(authUrl.searchParams.get('state')));
  assert.notEqual(oauthSessions[0].pkceVerifier, authUrl.searchParams.get('code_challenge'));
  assert.deepEqual(
    providerScopes(connection.scopes),
    [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.readonly'
    ]
  );

  const callback = await drive.completeOAuth({
    ownerId: OWNER,
    code: 'google-code-test',
    state: authUrl.searchParams.get('state')
  });
  assert.equal(callback.connectionId, CONNECTION_ID);
  assert.equal(callback.credentialStored, true);
  assert.equal(callback.access_token, undefined);
  assert.equal(callback.refresh_token, undefined);
  assert.equal(secretWrites.length, 1);
  assert(storedSecret.includes('access-from-google'));
  assert(storedSecret.includes('refresh-from-google'));
  assert(!JSON.stringify(callback).includes('access-from-google'));

  const readTool = `drive:${CONNECTION_ID}:list`;
  const preparedRead = await drive.prepareInvocation({
    ownerId: OWNER,
    connectionId: CONNECTION_ID,
    toolKey: readTool,
    input: { pageSize: 10 },
    sessionId: 'drive-session'
  });
  assert.equal(preparedRead.permissionRequest.action, 'connection.read');
  assert.equal(preparedRead.permissionRequest.constraints.toolKey, readTool);
  assert.equal(preparedRead.operationFingerprint, null);

  const readChallenge = buildChallenge({
    ...preparedRead.permissionRequest,
    expiresAt: new Date(nowMs + 10 * 60 * 1000).toISOString()
  }, { ownerId: OWNER, now: nowMs });
  assert.equal(readChallenge.normalized.resourceNamespace, 'integration_connection');
  assert.equal(readChallenge.normalized.constraints.toolKey, readTool);

  events.length = 0;
  const listResult = await drive.invoke({
    ownerId: OWNER,
    connectionId: CONNECTION_ID,
    toolKey: readTool,
    input: { pageSize: 10 },
    sessionId: 'drive-session',
    requestId: 'drive-read-request'
  });
  assert.equal(listResult.billedCredits, 0);
  assert.equal(listResult.result.files.length, 1);
  assert.equal(permissionCalls.at(-1).requiredScope, 'drive.file.read');
  assert.equal(permissionCalls.at(-1).toolKey, readTool);
  assert(events.indexOf('permission') < events.indexOf('network'));

  const deniedDrive = createWorkspaceGoogleDriveRuntime({
    connectionStore,
    permissionStore: {
      async consumeWorkspaceConnection() {
        events.push('permission-denied');
        const error = new Error('permission_required');
        error.code = 'permission_required';
        throw error;
      }
    },
    fetchImpl,
    env,
    now: () => nowMs
  });
  const networkBeforeDeny = fetchCalls.length;
  await assert.rejects(
    deniedDrive.invoke({
      ownerId: OWNER,
      connectionId: CONNECTION_ID,
      toolKey: readTool,
      input: { pageSize: 5 },
      sessionId: 'drive-session',
      requestId: 'drive-denied-request'
    }),
    error => error.code === 'permission_required'
  );
  assert.equal(fetchCalls.length, networkBeforeDeny);

  const writeTool = `drive:${CONNECTION_ID}:write`;
  const preparedWrite = await drive.prepareInvocation({
    ownerId: OWNER,
    connectionId: CONNECTION_ID,
    toolKey: writeTool,
    input: { name: 'created.txt', mimeType: 'text/plain', text: 'hello' },
    sessionId: 'drive-write-session'
  });
  assert.equal(preparedWrite.permissionRequest.action, 'connection.write');
  assert(/^[0-9a-f]{64}$/.test(preparedWrite.operationFingerprint));
  assert.equal(preparedWrite.permissionRequest.constraints.toolKey, writeTool);
  assert.equal(preparedWrite.permissionRequest.constraints.operationFingerprint, preparedWrite.operationFingerprint);

  const writeChallenge = buildChallenge({
    ...preparedWrite.permissionRequest,
    expiresAt: new Date(nowMs + 5 * 60 * 1000).toISOString()
  }, { ownerId: OWNER, now: nowMs });
  assert.equal(writeChallenge.normalized.constraints.toolKey, writeTool);
  assert.equal(writeChallenge.normalized.constraints.operationFingerprint, preparedWrite.operationFingerprint);

  events.length = 0;
  const writeResult = await drive.invoke({
    ownerId: OWNER,
    connectionId: CONNECTION_ID,
    toolKey: writeTool,
    input: { name: 'created.txt', mimeType: 'text/plain', text: 'hello' },
    sessionId: 'drive-write-session',
    requestId: 'drive-write-request'
  });
  assert.equal(writeResult.billedCredits, 0);
  assert.equal(writeResult.result.id, 'file_created12');
  assert.equal(permissionCalls.at(-1).action, 'connection.write');
  assert.equal(permissionCalls.at(-1).operationFingerprint, preparedWrite.operationFingerprint);
  assert(events.indexOf('permission') < events.indexOf('network'));

  const toolRuntime = createWorkspaceToolRuntime({
    connectionStore,
    permissionStore,
    driveRuntime: drive,
    mcpAdapter: {
      async preflight() { throw new Error('mcp_not_expected'); },
      async invoke() { throw new Error('mcp_not_expected'); }
    },
    tools: aiTools
  });
  const hydrated = await toolRuntime.hydrateOwnerTools(OWNER);
  assert(hydrated.some(tool => tool.key === readTool && tool.source === 'google_drive'));
  assert(hydrated.some(tool => tool.key === writeTool && tool.source === 'google_drive'));

  const runtimePrepared = await toolRuntime.prepareInvocation({
    ownerId: OWNER,
    toolKey: writeTool,
    input: { name: 'runtime.txt', mimeType: 'text/plain', text: 'runtime' },
    sessionId: 'runtime-session'
  });
  assert.equal(runtimePrepared.permissionRequest.action, 'connection.write');
  assert.equal(runtimePrepared.permissionRequest.resourceNamespace, 'integration_connection');
  toolRuntime.clearOwner(OWNER);

  events.length = 0;
  const disconnected = await drive.disconnect({ ownerId: OWNER, connectionId: CONNECTION_ID });
  assert.equal(disconnected.localBlocked, true);
  assert.equal(disconnected.remoteRevoked, true);
  assert.equal(disconnected.revokedPermissionGrants, 2);
  assert(events.indexOf('local-revoke') >= 0);
  assert(events.indexOf('local-revoke') < events.indexOf('network'));

  const sql = fs.readFileSync('91_pack089_89c_google_drive_oauth.sql', 'utf8');
  const routes = fs.readFileSync('lib/workspaceRoutes.js', 'utf8');
  const repo = fs.readFileSync('lib/workspaceConnectionRepository.js', 'utf8');
  const permissions = fs.readFileSync('lib/permissionCenterRepository.js', 'utf8');
  const toolSource = fs.readFileSync('lib/workspaceToolRuntime.js', 'utf8');

  for (const marker of [
    'consume_workspace_oauth_session_owner_pack089',
    'consume_workspace_connection_permission_pack089',
    "g.resource_namespace='integration_connection'",
    "constraints->>'toolKey'",
    "constraints->>'operationFingerprint'",
    'to service_role'
  ]) assert(sql.includes(marker));

  for (const marker of [
    "router.post('/drive/connect'",
    "router.post('/drive/oauth/callback'",
    "router.post('/drive/:id/disconnect'",
    "googleDriveRuntime.assertOAuthConfigured();"
  ]) assert(routes.includes(marker));
  const driveConnectStart = routes.indexOf("router.post('/drive/connect'");
  const driveCallbackStart = routes.indexOf("router.post('/drive/oauth/callback'", driveConnectStart);
  const driveConnectRoute = routes.slice(driveConnectStart, driveCallbackStart);
  assert(driveConnectStart >= 0 && driveCallbackStart > driveConnectStart);
  assert(
    driveConnectRoute.indexOf("googleDriveRuntime.assertOAuthConfigured();") <
    driveConnectRoute.indexOf("connectionStore.createIntegration({"),
    'Drive OAuth config must fail closed before creating a draft connection'
  );

  assert(repo.includes('findLiveIntegration'));
  assert(repo.includes('workspace_integration_lookup_failed'));
  assert(driveConnectRoute.includes('connectionStore.findLiveIntegration('));
  assert(driveConnectRoute.includes('workspace_google_drive_scope_change_requires_disconnect'));
  assert(driveConnectRoute.includes("error?.code !== 'workspace_integration_create_failed'"));
  assert(
    driveConnectRoute.indexOf('connectionStore.findLiveIntegration(') <
    driveConnectRoute.indexOf('connectionStore.createIntegration({'),
    'OAuth retry must reuse an existing live provider row before attempting a new insert'
  );

  for (const marker of [
    'createOAuthSession',
    'consumeOAuthSession',
    'setIntegrationSecret',
    'getIntegrationSecret',
    'listActiveIntegrations'
  ]) assert(repo.includes(marker));

  assert(permissions.includes('consumeWorkspaceConnection'));
  assert(toolSource.includes("source: 'google_drive'"));
  assert(toolSource.includes('driveToolDefinitions'));

  console.log('PASS: Pack089 89C OAuth uses one-time hashed state + PKCE and Vault-only token handoff');
  console.log('PASS: missing Google OAuth credentials fail closed before network');
  console.log('PASS: Google Drive OAuth retries reuse the live provider row and fail closed on scope changes');
  console.log('PASS: Google Drive tools register through canonical ai.tools and bill zero credits');
  console.log('PASS: exact tool-key and write fingerprint permission checks happen before Drive network');
  console.log('PASS: local disconnect blocks the connection before best-effort Google token revoke');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
