'use strict';

const crypto = require('node:crypto');
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

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const MAX_CONTENT_BYTES = 8 * 1024 * 1024;
const FILE_ID_RE = /^[A-Za-z0-9_-]{8,200}$/;
const EXPORT_MIME_TYPES = new Set([
  'text/plain',
  'text/csv',
  'application/pdf',
  'application/rtf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);

const INTERNAL_TO_GOOGLE_SCOPES = Object.freeze({
  'drive.file.read': 'https://www.googleapis.com/auth/drive.readonly',
  'drive.export': 'https://www.googleapis.com/auth/drive.readonly',
  'drive.file.write': 'https://www.googleapis.com/auth/drive.file'
});

function runtimeError(code, detail = null) {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  return error;
}

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function pkceChallenge(verifier) {
  return base64url(crypto.createHash('sha256').update(verifier).digest());
}

function normalizeInternalScopes(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) {
    throw runtimeError('workspace_google_drive_scopes_invalid');
  }
  const scopes = [...new Set(value.map(item => String(item || '').trim().toLowerCase()))].filter(Boolean).sort();
  if (!scopes.length || scopes.includes('*')) throw runtimeError('workspace_google_drive_scopes_invalid');
  for (const scope of scopes) {
    if (!Object.hasOwn(INTERNAL_TO_GOOGLE_SCOPES, scope)) {
      throw runtimeError('workspace_google_drive_scope_unsupported');
    }
  }
  return scopes;
}

function providerScopes(internalScopes) {
  return [...new Set(normalizeInternalScopes(internalScopes).map(scope => INTERNAL_TO_GOOGLE_SCOPES[scope]))].sort();
}

function oauthConfig(env = process.env) {
  const clientId = String(env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = String(env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  const redirectUri = String(env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw runtimeError('workspace_google_oauth_not_configured');
  }
  let parsed;
  try { parsed = new URL(redirectUri); }
  catch { throw runtimeError('workspace_google_oauth_redirect_invalid'); }
  if (!['https:','http:'].includes(parsed.protocol)) {
    throw runtimeError('workspace_google_oauth_redirect_invalid');
  }
  if (parsed.protocol === 'http:' && !['localhost','127.0.0.1'].includes(parsed.hostname)) {
    throw runtimeError('workspace_google_oauth_redirect_invalid');
  }
  return Object.freeze({ clientId, clientSecret, redirectUri: parsed.toString() });
}

function safeJson(textValue, code) {
  try {
    const value = JSON.parse(String(textValue || ''));
    if (!plainObject(value)) throw new Error('not_object');
    return value;
  } catch {
    throw runtimeError(code);
  }
}

function googleErrorDetail(payload) {
  const code = payload?.error?.status || payload?.error || null;
  return typeof code === 'string' ? code.slice(0, 120) : null;
}

async function fetchWithTimeout(fetchImpl, url, init = {}, timeoutMs = 20000) {
  if (typeof fetchImpl !== 'function') throw runtimeError('workspace_google_fetch_unavailable');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await fetchImpl(url, { ...init, signal: init.signal || controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw runtimeError('workspace_google_request_timeout');
    throw runtimeError('workspace_google_request_failed', error?.code || null);
  } finally {
    clearTimeout(timer);
  }
}

function parseTokenSecret(raw) {
  if (!raw) throw runtimeError('workspace_google_token_missing');
  const secret = safeJson(raw, 'workspace_google_token_invalid');
  const accessToken = String(secret.access_token || '').trim();
  const refreshToken = String(secret.refresh_token || '').trim();
  const tokenType = String(secret.token_type || 'Bearer').trim();
  const expiresAt = Date.parse(secret.expires_at || '');
  if (!accessToken || tokenType.toLowerCase() !== 'bearer' || !Number.isFinite(expiresAt)) {
    throw runtimeError('workspace_google_token_invalid');
  }
  return {
    ...secret,
    access_token: accessToken,
    refresh_token: refreshToken || null,
    token_type: 'Bearer',
    expires_at: new Date(expiresAt).toISOString()
  };
}

function normalizeFileId(value) {
  const id = String(value || '').trim();
  if (!FILE_ID_RE.test(id)) throw runtimeError('workspace_drive_file_id_invalid');
  return id;
}

function normalizePageSize(value) {
  const n = Number(value == null ? 50 : value);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw runtimeError('workspace_drive_page_size_invalid');
  return n;
}

function normalizeToolInput(name, value) {
  const input = value == null ? {} : value;
  if (!plainObject(input)) throw runtimeError('workspace_drive_input_invalid');

  if (name === 'list') {
    return Object.freeze({
      pageSize: normalizePageSize(input.pageSize),
      pageToken: input.pageToken == null ? null : String(input.pageToken).trim().slice(0, 2048) || null
    });
  }

  if (name === 'search') {
    const query = String(input.query || '').trim();
    if (!query || query.length > 500) throw runtimeError('workspace_drive_search_query_invalid');
    return Object.freeze({
      query,
      pageSize: normalizePageSize(input.pageSize),
      pageToken: input.pageToken == null ? null : String(input.pageToken).trim().slice(0, 2048) || null
    });
  }

  if (name === 'read') {
    return Object.freeze({ fileId: normalizeFileId(input.fileId) });
  }

  if (name === 'export') {
    const mimeType = String(input.mimeType || '').trim().toLowerCase();
    if (!EXPORT_MIME_TYPES.has(mimeType)) throw runtimeError('workspace_drive_export_mime_invalid');
    return Object.freeze({
      fileId: normalizeFileId(input.fileId),
      mimeType
    });
  }

  if (name === 'write') {
    const fileName = String(input.name || '').trim();
    const mimeType = String(input.mimeType || 'text/plain').trim().toLowerCase();
    if (!fileName || fileName.length > 255) throw runtimeError('workspace_drive_write_name_invalid');
    if (!mimeType || mimeType.length > 200) throw runtimeError('workspace_drive_write_mime_invalid');
    const parentId = input.parentId == null || String(input.parentId).trim() === ''
      ? null
      : normalizeFileId(input.parentId);
    const hasText = typeof input.text === 'string';
    const hasBase64 = typeof input.contentBase64 === 'string' && input.contentBase64.length > 0;
    if (hasText === hasBase64) throw runtimeError('workspace_drive_write_content_invalid');
    let content;
    if (hasText) {
      content = Buffer.from(input.text, 'utf8');
    } else {
      try { content = Buffer.from(input.contentBase64, 'base64'); }
      catch { throw runtimeError('workspace_drive_write_content_invalid'); }
    }
    if (content.length < 1 || content.length > MAX_CONTENT_BYTES) {
      throw runtimeError('workspace_drive_content_size_invalid');
    }
    return Object.freeze({
      name: fileName,
      mimeType,
      parentId,
      content
    });
  }

  throw runtimeError('workspace_drive_tool_invalid');
}

function driveToolDefinitions(connection) {
  const id = uuid(connection?.id);
  const scopes = new Set(normalizeInternalScopes(connection?.scopes || []));
  const tools = [];

  if (scopes.has('drive.file.read')) {
    tools.push(
      {
        key: `drive:${id}:list`,
        name: 'list',
        action: 'connection.read',
        requiredScope: 'drive.file.read',
        description: 'List files from the connected Google Drive.',
        inputSchema: { type: 'object', properties: { pageSize: { type: 'integer' }, pageToken: { type: 'string' } }, additionalProperties: false }
      },
      {
        key: `drive:${id}:search`,
        name: 'search',
        action: 'connection.read',
        requiredScope: 'drive.file.read',
        description: 'Search file names and full-text content in the connected Google Drive.',
        inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, pageSize: { type: 'integer' }, pageToken: { type: 'string' } }, additionalProperties: false }
      },
      {
        key: `drive:${id}:read`,
        name: 'read',
        action: 'connection.read',
        requiredScope: 'drive.file.read',
        description: 'Read a blob file from the connected Google Drive.',
        inputSchema: { type: 'object', required: ['fileId'], properties: { fileId: { type: 'string' } }, additionalProperties: false }
      }
    );
  }

  if (scopes.has('drive.export')) {
    tools.push({
      key: `drive:${id}:export`,
      name: 'export',
      action: 'connection.read',
      requiredScope: 'drive.export',
      description: 'Export a Google Workspace document from the connected Google Drive.',
      inputSchema: { type: 'object', required: ['fileId','mimeType'], properties: { fileId: { type: 'string' }, mimeType: { type: 'string' } }, additionalProperties: false }
    });
  }

  if (scopes.has('drive.file.write')) {
    tools.push({
      key: `drive:${id}:write`,
      name: 'write',
      action: 'connection.write',
      requiredScope: 'drive.file.write',
      description: 'Create a file in the connected Google Drive.',
      inputSchema: {
        type: 'object',
        required: ['name','mimeType'],
        properties: {
          name: { type: 'string' },
          mimeType: { type: 'string' },
          text: { type: 'string' },
          contentBase64: { type: 'string' },
          parentId: { type: 'string' }
        },
        additionalProperties: false
      }
    });
  }

  return Object.freeze(tools.map(item => Object.freeze(item)));
}

function isTextMime(mimeType) {
  const value = String(mimeType || '').toLowerCase();
  return value.startsWith('text/') ||
    value === 'application/json' ||
    value.endsWith('+json') ||
    value === 'application/xml' ||
    value.endsWith('+xml') ||
    value === 'application/javascript';
}

function contentResult(buffer, mimeType, metadata = {}) {
  if (buffer.length > MAX_CONTENT_BYTES) throw runtimeError('workspace_drive_content_too_large');
  return Object.freeze({
    ...metadata,
    mimeType,
    bytes: buffer.length,
    ...(isTextMime(mimeType)
      ? { text: buffer.toString('utf8') }
      : { contentBase64: buffer.toString('base64') })
  });
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function createWorkspaceGoogleDriveRuntime({
  connectionStore = getDefaultWorkspaceConnectionStore(),
  permissionStore = getDefaultPermissionCenterStore(),
  fetchImpl = globalThis.fetch,
  env = process.env,
  now = () => Date.now()
} = {}) {
  async function getConnection(ownerId, connectionId, { active = false } = {}) {
    const connection = await connectionStore.getIntegrationConnection({
      ownerId,
      connectionId: uuid(connectionId)
    });
    if (connection.integration_key !== 'google_drive') throw runtimeError('workspace_google_drive_connection_invalid');
    if (active && (
      connection.status !== 'active' ||
      connection.connected !== true ||
      connection.revoked_at != null
    )) {
      throw runtimeError('workspace_google_drive_connection_inactive');
    }
    return connection;
  }

  async function startOAuth({ ownerId, connectionId }) {
    const config = oauthConfig(env);
    const connection = await getConnection(ownerId, connectionId);
    if (connection.status === 'revoked') throw runtimeError('workspace_google_drive_connection_revoked');

    const internalScopes = normalizeInternalScopes(connection.scopes || []);
    const state = base64url(crypto.randomBytes(32));
    const verifier = base64url(crypto.randomBytes(48));
    const challenge = pkceChallenge(verifier);
    const expiresAt = new Date(now() + 10 * 60 * 1000).toISOString();

    const session = await connectionStore.createOAuthSession({
      ownerId,
      connectionId: connection.id,
      stateHash: sha256Hex(state),
      pkceVerifier: verifier,
      redirectUri: config.redirectUri,
      requestedScopes: internalScopes,
      expiresAt
    });

    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('scope', providerScopes(internalScopes).join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return Object.freeze({
      connectionId: connection.id,
      authorizationUrl: url.toString(),
      expiresAt: session?.expires_at || session?.expiresAt || expiresAt
    });
  }

  async function tokenRequest(params) {
    const response = await fetchWithTimeout(fetchImpl, GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(params).toString()
    });
    const text = await response.text();
    const payload = safeJson(text, 'workspace_google_token_response_invalid');
    if (!response.ok) {
      throw runtimeError('workspace_google_token_exchange_failed', googleErrorDetail(payload));
    }
    return payload;
  }

  async function completeOAuth({ ownerId, code, state }) {
    const config = oauthConfig(env);
    const authCode = String(code || '').trim();
    const rawState = String(state || '').trim();
    if (!authCode || authCode.length > 4096) throw runtimeError('workspace_google_oauth_code_invalid');
    if (!rawState || rawState.length > 512) throw runtimeError('workspace_google_oauth_state_invalid');

    const session = await connectionStore.consumeOAuthSession({
      ownerId,
      stateHash: sha256Hex(rawState)
    });
    if (!session || String(session.owner_id || '') !== String(ownerId)) {
      throw runtimeError('workspace_google_oauth_owner_mismatch');
    }

    const token = await tokenRequest({
      code: authCode,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: String(session.pkce_verifier || ''),
      grant_type: 'authorization_code',
      redirect_uri: String(session.redirect_uri || config.redirectUri)
    });

    const accessToken = String(token.access_token || '').trim();
    const refreshToken = String(token.refresh_token || '').trim();
    const expiresIn = Number(token.expires_in);
    if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw runtimeError('workspace_google_token_response_invalid');
    }

    const internalScopes = normalizeInternalScopes(session.requested_scopes || []);
    const expiresAt = new Date(now() + Math.floor(expiresIn * 1000)).toISOString();
    const secret = JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_at: expiresAt,
      scope: String(token.scope || ''),
      issued_at: new Date(now()).toISOString()
    });

    const result = await connectionStore.setIntegrationSecret({
      ownerId,
      connectionId: session.connection_id,
      secret,
      tokenExpiresAt: expiresAt,
      scopes: internalScopes,
      providerSubject: null,
      accountLabel: null
    });

    return Object.freeze({
      connectionId: session.connection_id,
      status: result?.status || 'active',
      connected: true,
      scopes: Object.freeze([...internalScopes]),
      tokenExpiresAt: expiresAt,
      credentialStored: true
    });
  }

  async function getAccessToken(ownerId, connection) {
    const raw = await connectionStore.getIntegrationSecret({
      ownerId,
      connectionId: connection.id
    });
    let secret = parseTokenSecret(raw);
    if (Date.parse(secret.expires_at) > now() + 60_000) return secret.access_token;
    if (!secret.refresh_token) throw runtimeError('workspace_google_refresh_token_missing');

    const config = oauthConfig(env);
    const refreshed = await tokenRequest({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: secret.refresh_token,
      grant_type: 'refresh_token'
    });
    const accessToken = String(refreshed.access_token || '').trim();
    const expiresIn = Number(refreshed.expires_in);
    if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw runtimeError('workspace_google_token_refresh_invalid');
    }
    const expiresAt = new Date(now() + Math.floor(expiresIn * 1000)).toISOString();
    secret = {
      ...secret,
      access_token: accessToken,
      refresh_token: String(refreshed.refresh_token || '').trim() || secret.refresh_token,
      token_type: 'Bearer',
      expires_at: expiresAt,
      scope: String(refreshed.scope || secret.scope || ''),
      refreshed_at: new Date(now()).toISOString()
    };
    await connectionStore.setIntegrationSecret({
      ownerId,
      connectionId: connection.id,
      secret: JSON.stringify(secret),
      tokenExpiresAt: expiresAt,
      scopes: normalizeInternalScopes(connection.scopes || []),
      providerSubject: connection.provider_subject || null,
      accountLabel: connection.account_label || null
    });
    return accessToken;
  }

  async function googleJson(accessToken, url, init = {}) {
    const headers = {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      ...(init.headers || {})
    };
    const response = await fetchWithTimeout(fetchImpl, url, { ...init, headers });
    const text = await response.text();
    const payload = text ? safeJson(text, 'workspace_drive_response_invalid') : {};
    if (!response.ok) throw runtimeError('workspace_drive_api_failed', googleErrorDetail(payload));
    return payload;
  }

  async function googleBytes(accessToken, url, init = {}) {
    const headers = {
      authorization: `Bearer ${accessToken}`,
      ...(init.headers || {})
    };
    const response = await fetchWithTimeout(fetchImpl, url, { ...init, headers });
    if (!response.ok) {
      let detail = null;
      try { detail = googleErrorDetail(await response.json()); } catch {}
      throw runtimeError('workspace_drive_api_failed', detail);
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_CONTENT_BYTES) {
      throw runtimeError('workspace_drive_content_too_large');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_CONTENT_BYTES) throw runtimeError('workspace_drive_content_too_large');
    return {
      buffer,
      mimeType: String(response.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase()
    };
  }

  async function executeDriveTool({ accessToken, tool, input }) {
    if (tool.name === 'list' || tool.name === 'search') {
      const params = new URLSearchParams({
        pageSize: String(input.pageSize),
        spaces: 'drive',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,webViewLink,capabilities(canDownload))'
      });
      const query = tool.name === 'search'
        ? `trashed = false and (name contains '${escapeDriveQuery(input.query)}' or fullText contains '${escapeDriveQuery(input.query)}')`
        : 'trashed = false';
      params.set('q', query);
      if (input.pageToken) params.set('pageToken', input.pageToken);
      const payload = await googleJson(accessToken, `${DRIVE_API}/files?${params.toString()}`);
      return Object.freeze({
        files: Object.freeze(Array.isArray(payload.files) ? payload.files : []),
        nextPageToken: payload.nextPageToken || null
      });
    }

    if (tool.name === 'read') {
      const metaParams = new URLSearchParams({
        supportsAllDrives: 'true',
        fields: 'id,name,mimeType,size,modifiedTime,webViewLink,capabilities(canDownload)'
      });
      const metadata = await googleJson(
        accessToken,
        `${DRIVE_API}/files/${encodeURIComponent(input.fileId)}?${metaParams.toString()}`
      );
      if (metadata?.capabilities?.canDownload === false) throw runtimeError('workspace_drive_download_not_allowed');
      if (String(metadata.mimeType || '').startsWith('application/vnd.google-apps.')) {
        throw runtimeError('workspace_drive_export_required');
      }
      const bytes = await googleBytes(
        accessToken,
        `${DRIVE_API}/files/${encodeURIComponent(input.fileId)}?alt=media&supportsAllDrives=true`
      );
      return contentResult(bytes.buffer, bytes.mimeType || metadata.mimeType, {
        id: metadata.id,
        name: metadata.name,
        modifiedTime: metadata.modifiedTime || null,
        webViewLink: metadata.webViewLink || null
      });
    }

    if (tool.name === 'export') {
      const bytes = await googleBytes(
        accessToken,
        `${DRIVE_API}/files/${encodeURIComponent(input.fileId)}/export?mimeType=${encodeURIComponent(input.mimeType)}`
      );
      return contentResult(bytes.buffer, bytes.mimeType || input.mimeType, {
        id: input.fileId,
        exported: true
      });
    }

    if (tool.name === 'write') {
      const boundary = `zuvyr_pack089_${crypto.randomBytes(12).toString('hex')}`;
      const metadata = {
        name: input.name,
        mimeType: input.mimeType,
        ...(input.parentId ? { parents: [input.parentId] } : {})
      };
      const preamble = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`
      );
      const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([preamble, input.content, suffix]);
      const params = new URLSearchParams({
        uploadType: 'multipart',
        supportsAllDrives: 'true',
        fields: 'id,name,mimeType,size,modifiedTime,webViewLink'
      });
      return googleJson(accessToken, `${DRIVE_UPLOAD_API}/files?${params.toString()}`, {
        method: 'POST',
        headers: { 'content-type': `multipart/related; boundary=${boundary}` },
        body
      });
    }

    throw runtimeError('workspace_drive_tool_invalid');
  }

  async function prepareInvocation({ ownerId, connectionId, toolKey, input, sessionId }) {
    const connection = await getConnection(ownerId, connectionId, { active: true });
    const tool = driveToolDefinitions(connection).find(item => item.key === String(toolKey || '').toLowerCase());
    if (!tool) throw runtimeError('workspace_drive_tool_not_found');
    const normalizedInput = normalizeToolInput(tool.name, input);
    const fingerprint = tool.action === 'connection.write'
      ? operationFingerprint({
          action: tool.action,
          connectionId: connection.id,
          toolKey: tool.key,
          requiredScope: tool.requiredScope,
          input: tool.name === 'write'
            ? {
                name: normalizedInput.name,
                mimeType: normalizedInput.mimeType,
                parentId: normalizedInput.parentId,
                contentSha256: crypto.createHash('sha256').update(normalizedInput.content).digest('hex')
              }
            : normalizedInput
        })
      : null;

    return Object.freeze({
      connection,
      tool,
      input: normalizedInput,
      operationFingerprint: fingerprint,
      permissionRequest: Object.freeze({
        action: tool.action,
        grantMode: tool.action === 'connection.write' ? 'allow_once' : 'session',
        scopeType: 'resource_session',
        resourceNamespace: 'integration_connection',
        resourceId: connection.id,
        sessionId: String(sessionId || '').trim(),
        constraints: Object.freeze({
          toolKey: tool.key,
          ...(fingerprint ? { operationFingerprint: fingerprint } : {})
        })
      })
    });
  }

  async function invoke({ ownerId, connectionId, toolKey, input, sessionId, requestId }) {
    const prepared = await prepareInvocation({ ownerId, connectionId, toolKey, input, sessionId });
    const session = String(sessionId || '').trim();
    const request = String(requestId || '').trim();
    if (!session || !request) throw runtimeError('workspace_drive_context_required');

    await permissionStore.consumeWorkspaceConnection({
      ownerId,
      action: prepared.tool.action,
      connectionId: prepared.connection.id,
      sessionId: session,
      requestId: request,
      toolKey: prepared.tool.key,
      requiredScope: prepared.tool.requiredScope,
      operationFingerprint: prepared.operationFingerprint
    });

    const accessToken = await getAccessToken(ownerId, prepared.connection);
    const result = await executeDriveTool({
      accessToken,
      tool: prepared.tool,
      input: prepared.input
    });
    return Object.freeze({
      toolKey: prepared.tool.key,
      source: 'google_drive',
      connectionId: prepared.connection.id,
      billedCredits: 0,
      result
    });
  }

  async function disconnect({ ownerId, connectionId }) {
    const connection = await getConnection(ownerId, connectionId);
    let token = null;
    try {
      const raw = await connectionStore.getIntegrationSecret({ ownerId, connectionId: connection.id });
      const parsed = raw ? parseTokenSecret(raw) : null;
      token = parsed?.refresh_token || parsed?.access_token || null;
    } catch {}

    const local = await connectionStore.revokeIntegration({
      ownerId,
      connectionId: connection.id
    });

    let remoteRevoked = false;
    if (token) {
      try {
        const response = await fetchWithTimeout(fetchImpl, GOOGLE_REVOKE_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }).toString()
        }, 10000);
        remoteRevoked = response.ok;
      } catch {
        remoteRevoked = false;
      }
    }

    return Object.freeze({
      connectionId: connection.id,
      status: 'revoked',
      localBlocked: true,
      remoteRevoked,
      revokedPermissionGrants: Number(local?.revoked_permission_grants || 0)
    });
  }

  return Object.freeze({
    startOAuth,
    completeOAuth,
    disconnect,
    prepareInvocation,
    invoke,
    getAccessToken,
    driveToolDefinitions
  });
}

let defaultRuntime = null;
function getDefaultWorkspaceGoogleDriveRuntime() {
  if (!defaultRuntime) defaultRuntime = createWorkspaceGoogleDriveRuntime();
  return defaultRuntime;
}

module.exports = {
  createWorkspaceGoogleDriveRuntime,
  getDefaultWorkspaceGoogleDriveRuntime,
  driveToolDefinitions,
  normalizeToolInput,
  normalizeInternalScopes,
  providerScopes,
  oauthConfig,
  sha256Hex,
  pkceChallenge
};
