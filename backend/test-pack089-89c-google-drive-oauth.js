'use strict';

const assert = require('assert');
const fs = require('fs');

const {
  createGoogleDriveRuntime,
  googleProviderScopes
} = require('./lib/googleDriveRuntime');
const { buildChallenge } = require('./lib/permissionCenterPolicy');

const OWNER = '6f3a9c23-c4f2-4fef-8ed1-ae61f94bf758';
const CONNECTION = '11111111-1111-4111-8111-111111111111';
const SESSION = 'pack089-drive-session';

function responseJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => {
    assert.equal(error.code || error.message, code);
    return true;
  });
}

async function run() {
  let networkCalls = 0;
  const noConfigStore = {
    getIntegrationConnection: async () => {
      throw new Error('store_must_not_run');
    }
  };
  const noConfigRuntime = createGoogleDriveRuntime({
    connectionStore: noConfigStore,
    permissionStore: {},
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('network_must_not_run');
    },
    env: {}
  });
  await expectCode(noConfigRuntime.startOAuth({
    ownerId: OWNER,
    connectionId: CONNECTION
  }), 'google_oauth_not_configured');
  assert.equal(networkCalls, 0);

  const env = {
    GOOGLE_OAUTH_CLIENT_ID: 'google-client-id.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET: 'google-client-secret',
    ZUVYR_GOOGLE_OAUTH_REDIRECT_URI: 'https://app.example.com/oauth/google/callback'
  };

  const draftConnection = {
    id: CONNECTION,
    owner_id: OWNER,
    integration_key: 'google_drive',
    scopes: ['drive.export','drive.file.read','drive.file.write'],
    explicit_consent: true,
    status: 'draft',
    connected: false,
    read_enabled: false,
    write_enabled: false,
    revoked_at: null
  };
  const activeConnection = {
    ...draftConnection,
    status: 'active',
    connected: true,
    read_enabled: true,
    write_enabled: true,
    account_label: 'Google Drive',
    token_expires_at: '2026-09-21T22:00:00.000Z'
  };

  let oauthSessionInput = null;
  let storedSecret = null;
  let integrationError = null;
  const audits = [];
  const store = {
    async getIntegrationConnection({ ownerId, connectionId }) {
      assert.equal(ownerId, OWNER);
      assert.equal(connectionId, CONNECTION);
      return storedSecret ? activeConnection : draftConnection;
    },
    async getActiveIntegration({ ownerId, integrationKey }) {
      assert.equal(ownerId, OWNER);
      assert.equal(integrationKey, 'google_drive');
      return activeConnection;
    },
    async createOAuthSession(input) {
      oauthSessionInput = input;
      return { session_id: 'oauth-session-id', expires_at: input.expiresAt };
    },
    async consumeOAuthSession({ ownerId, stateHash }) {
      assert.equal(ownerId, OWNER);
      assert.equal(stateHash, oauthSessionInput.stateHash);
      return {
        owner_id: OWNER,
        connection_id: CONNECTION,
        provider: 'google_drive',
        redirect_uri: env.ZUVYR_GOOGLE_OAUTH_REDIRECT_URI,
        requested_scopes: oauthSessionInput.requestedScopes,
        pkce_verifier: oauthSessionInput.pkceVerifier
      };
    },
    async setIntegrationSecret(input) {
      assert.equal(input.ownerId, OWNER);
      assert.equal(input.connectionId, CONNECTION);
      storedSecret = input.secret;
      return { credential_configured: true, status: 'active' };
    },
    async getIntegrationSecret({ ownerId, connectionId }) {
      assert.equal(ownerId, OWNER);
      assert.equal(connectionId, CONNECTION);
      return storedSecret;
    },
    async markIntegrationError({ code }) {
      integrationError = code;
      return {};
    },
    async recordAudit(event) {
      audits.push(event);
      return { id: String(audits.length) };
    }
  };

  const permissionCalls = [];
  const permissionStore = {
    async consumeWorkspaceConnection(input) {
      permissionCalls.push(input);
      return { success: true, allowed: true };
    }
  };

  const fetchEvents = [];
  const fetchImpl = async (url, init = {}) => {
    networkCalls += 1;
    fetchEvents.push({ url: String(url), init });
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      const params = new URLSearchParams(String(init.body || ''));
      assert.equal(params.get('client_id'), env.GOOGLE_OAUTH_CLIENT_ID);
      assert.equal(params.get('client_secret'), env.GOOGLE_OAUTH_CLIENT_SECRET);
      assert.equal(params.get('code'), 'authorization-code');
      assert.equal(params.get('code_verifier'), oauthSessionInput.pkceVerifier);
      return responseJson({
        access_token: 'server-only-access-token',
        refresh_token: 'server-only-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file'
      });
    }

    const parsed = new URL(String(url));
    assert.equal(init.headers.authorization, 'Bearer server-only-access-token');
    if (parsed.hostname === 'www.googleapis.com' && parsed.pathname === '/drive/v3/files') {
      assert.equal(init.method, 'GET');
      return responseJson({
        files: [{ id: 'file_12345', name: 'Report', mimeType: 'text/plain' }],
        nextPageToken: null
      });
    }
    if (parsed.hostname === 'www.googleapis.com' && parsed.pathname === '/upload/drive/v3/files') {
      assert.equal(init.method, 'POST');
      assert(String(init.headers['content-type']).startsWith('multipart/related; boundary=zuvyr_'));
      return responseJson({
        id: 'file_67890',
        name: 'note.txt',
        mimeType: 'text/plain'
      });
    }
    throw new Error('unexpected_fetch:' + url);
  };

  const runtime = createGoogleDriveRuntime({
    connectionStore: store,
    permissionStore,
    fetchImpl,
    env,
    nowFactory: () => new Date('2026-09-21T21:10:00.000Z'),
    randomBytes: size => Buffer.alloc(size, 7)
  });

  const start = await runtime.startOAuth({
    ownerId: OWNER,
    connectionId: CONNECTION
  });
  assert.equal(start.connectionId, CONNECTION);
  assert.equal(start.provider, 'google_drive');
  assert.equal(start.scopes.length, 3);
  assert(oauthSessionInput);
  assert.equal(oauthSessionInput.pkceVerifier.length >= 43, true);
  assert.equal(oauthSessionInput.stateHash.length, 64);
  assert.equal(JSON.stringify(oauthSessionInput).includes('server-only'), false);
  const authUrl = new URL(start.authorizationUrl);
  assert.equal(authUrl.hostname, 'accounts.google.com');
  assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
  assert(authUrl.searchParams.get('state'));
  assert.notEqual(authUrl.searchParams.get('state'), oauthSessionInput.stateHash);
  assert.equal(start.authorizationUrl.includes(oauthSessionInput.pkceVerifier), false);
  assert.deepEqual(
    googleProviderScopes(start.scopes),
    [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.readonly'
    ]
  );

  const state = authUrl.searchParams.get('state');
  const complete = await runtime.completeOAuth({
    ownerId: OWNER,
    code: 'authorization-code',
    state
  });
  assert.equal(complete.connected, true);
  assert.equal(complete.credentialConfigured, true);
  assert.equal(JSON.stringify(complete).includes('server-only-access-token'), false);
  assert.equal(JSON.stringify(complete).includes('server-only-refresh-token'), false);
  assert(storedSecret.includes('server-only-access-token'));
  assert(storedSecret.includes('server-only-refresh-token'));
  assert.equal(integrationError, null);

  const fakeTools = {
    definitions: new Map(),
    registerTool(key, definition) {
      this.definitions.set(key, definition);
    }
  };
  runtime.registerTools(fakeTools);
  assert.deepEqual(
    [...fakeTools.definitions.keys()].sort(),
    ['drive.export','drive.list','drive.read','drive.search','drive.write']
  );

  const readPrepared = await runtime.prepareInvocation({
    ownerId: OWNER,
    toolKey: 'drive.search',
    input: { query: 'Report' },
    sessionId: SESSION
  });
  assert.equal(readPrepared.action, 'connection.read');
  assert.equal(readPrepared.requiredScope, 'drive.file.read');
  assert.equal(readPrepared.permissionRequest.constraints.toolKey, 'drive.search');
  assert.equal(Object.hasOwn(readPrepared.permissionRequest.constraints, 'operationFingerprint'), false);

  const readChallenge = buildChallenge({
    ...readPrepared.permissionRequest,
    expiresAt: '2026-09-21T21:20:00.000Z'
  }, {
    ownerId: OWNER,
    now: Date.parse('2026-09-21T21:10:00.000Z')
  });
  assert.equal(readChallenge.normalized.constraints.toolKey, 'drive.search');

  const search = await runtime.invoke({
    ownerId: OWNER,
    toolKey: 'drive.search',
    input: { query: 'Report' },
    sessionId: SESSION,
    requestId: 'drive-read-request'
  });
  assert.equal(search.result.files[0].name, 'Report');
  assert.equal(permissionCalls[0].action, 'connection.read');
  assert.equal(permissionCalls[0].toolKey, 'drive.search');
  assert.equal(permissionCalls[0].requiredScope, 'drive.file.read');
  assert.equal(permissionCalls[0].operationFingerprint, null);

  const writePrepared = await runtime.prepareInvocation({
    ownerId: OWNER,
    toolKey: 'drive.write',
    input: { name: 'note.txt', content: 'hello' },
    sessionId: SESSION
  });
  assert.equal(writePrepared.action, 'connection.write');
  assert.match(writePrepared.operationFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(writePrepared.permissionRequest.constraints.toolKey, 'drive.write');
  assert.equal(writePrepared.permissionRequest.constraints.operationFingerprint, writePrepared.operationFingerprint);

  const writeChallenge = buildChallenge({
    ...writePrepared.permissionRequest,
    expiresAt: '2026-09-21T21:15:00.000Z'
  }, {
    ownerId: OWNER,
    now: Date.parse('2026-09-21T21:10:00.000Z')
  });
  assert.equal(writeChallenge.normalized.constraints.toolKey, 'drive.write');
  assert.equal(writeChallenge.normalized.constraints.operationFingerprint, writePrepared.operationFingerprint);

  const beforeWriteNetwork = networkCalls;
  const write = await runtime.invoke({
    ownerId: OWNER,
    toolKey: 'drive.write',
    input: { name: 'note.txt', content: 'hello' },
    sessionId: SESSION,
    requestId: 'drive-write-request'
  });
  assert.equal(write.result.id, 'file_67890');
  assert.equal(permissionCalls[1].action, 'connection.write');
  assert.equal(permissionCalls[1].toolKey, 'drive.write');
  assert.equal(permissionCalls[1].operationFingerprint, writePrepared.operationFingerprint);
  assert.equal(networkCalls, beforeWriteNetwork + 1);
  assert.equal(audits.some(event => event.eventType === 'google_drive_tool_succeeded' && event.externalWriteExecuted === true), true);

  const denyRuntime = createGoogleDriveRuntime({
    connectionStore: {
      async getActiveIntegration() {
        return {
          ...activeConnection,
          scopes: ['drive.file.write'],
          read_enabled: false,
          write_enabled: true
        };
      }
    },
    permissionStore: {
      async consumeWorkspaceConnection() {
        throw new Error('permission_must_not_run');
      }
    },
    fetchImpl: async () => {
      throw new Error('network_must_not_run');
    },
    env
  });
  await expectCode(denyRuntime.prepareInvocation({
    ownerId: OWNER,
    toolKey: 'drive.search',
    input: { query: 'x' },
    sessionId: SESSION
  }), 'connection_scope_not_granted');

  const routesSource = fs.readFileSync('backend/lib/workspaceRoutes.js','utf8');
  const toolRuntimeSource = fs.readFileSync('backend/lib/workspaceToolRuntime.js','utf8');
  const sqlSource = fs.readFileSync('backend/91_pack089_89c_google_drive_oauth.sql','utf8');
  assert(routesSource.includes("router.post('/drive/connect'"));
  assert(routesSource.includes("router.post('/drive/oauth/callback'"));
  assert(!routesSource.includes("disabled(res, 'drive_connect')"));
  assert(toolRuntimeSource.includes("definition?.source === 'integration'"));
  assert(toolRuntimeSource.includes("driveRuntime.prepareInvocation"));
  assert(sqlSource.includes('consume_workspace_oauth_session_owner_pack089'));
  assert(sqlSource.includes('consume_workspace_connection_permission_pack089'));
  assert(sqlSource.toLowerCase().includes('from public,anon,authenticated'));
  assert(sqlSource.toLowerCase().includes('to service_role'));

  console.log('PASS: Pack089 89C OAuth is PKCE/state-bound, owner-bound and Vault-only for credentials');
  console.log('PASS: Google Drive tools share ai.tools and Permission Center with exact write fingerprints');
  console.log('PASS: missing credentials/scope fail closed before network and OAuth responses expose no tokens');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
