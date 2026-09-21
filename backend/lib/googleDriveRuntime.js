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
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
const GOOGLE_DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

const TOOL_DEFINITIONS = Object.freeze({
  'drive.list': Object.freeze({
    action: 'connection.read',
    requiredScope: 'drive.file.read',
    description: 'List files from the connected Google Drive account.',
    inputSchema: Object.freeze({
      type: 'object',
      properties: {
        connectionId: { type: 'string' },
        pageSize: { type: 'integer', minimum: 1, maximum: 100 },
        pageToken: { type: 'string' }
      },
      additionalProperties: false
    })
  }),
  'drive.search': Object.freeze({
    action: 'connection.read',
    requiredScope: 'drive.file.read',
    description: 'Search files by name in the connected Google Drive account.',
    inputSchema: Object.freeze({
      type: 'object',
      required: ['query'],
      properties: {
        connectionId: { type: 'string' },
        query: { type: 'string', minLength: 1, maxLength: 200 },
        pageSize: { type: 'integer', minimum: 1, maximum: 100 }
      },
      additionalProperties: false
    })
  }),
  'drive.read': Object.freeze({
    action: 'connection.read',
    requiredScope: 'drive.file.read',
    description: 'Read a non-Google native file from the connected Google Drive account.',
    inputSchema: Object.freeze({
      type: 'object',
      required: ['fileId'],
      properties: {
        connectionId: { type: 'string' },
        fileId: { type: 'string', minLength: 5, maxLength: 200 }
      },
      additionalProperties: false
    })
  }),
  'drive.export': Object.freeze({
    action: 'connection.read',
    requiredScope: 'drive.export',
    description: 'Export a Google Workspace file from the connected Google Drive account.',
    inputSchema: Object.freeze({
      type: 'object',
      required: ['fileId'],
      properties: {
        connectionId: { type: 'string' },
        fileId: { type: 'string', minLength: 5, maxLength: 200 },
        mimeType: { type: 'string' }
      },
      additionalProperties: false
    })
  }),
  'drive.write': Object.freeze({
    action: 'connection.write',
    requiredScope: 'drive.file.write',
    description: 'Create a text-based file in the connected Google Drive account.',
    inputSchema: Object.freeze({
      type: 'object',
      required: ['name','content'],
      properties: {
        connectionId: { type: 'string' },
        name: { type: 'string', minLength: 1, maxLength: 255 },
        content: { type: 'string', maxLength: 262144 },
        mimeType: { type: 'string' },
        parentId: { type: 'string' }
      },
      additionalProperties: false
    })
  })
});

const INTERNAL_TO_GOOGLE_SCOPE = Object.freeze({
  'drive.file.read': 'https://www.googleapis.com/auth/drive.readonly',
  'drive.export': 'https://www.googleapis.com/auth/drive.readonly',
  'drive.file.write': 'https://www.googleapis.com/auth/drive.file'
});

const EXPORT_MIME_TYPES = new Set([
  'text/plain',
  'text/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const DRIVE_ID_RE = /^[A-Za-z0-9_-]{5,200}$/;
const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const MAX_JSON_BYTES = 2 * 1024 * 1024;

function driveError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function trimText(value, code, max, { optional = false } = {}) {
  const result = String(value == null ? '' : value).trim();
  if (!result) {
    if (optional) return null;
    throw driveError(code);
  }
  if (result.length > max) throw driveError(code);
  return result;
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

function normalizeInternalScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length < 1) throw driveError('google_drive_scopes_missing');
  const result = [...new Set(scopes.map(item => String(item || '').trim().toLowerCase()))].filter(Boolean).sort();
  if (result.some(scope => !Object.hasOwn(INTERNAL_TO_GOOGLE_SCOPE, scope))) {
    throw driveError('google_drive_scope_unsupported');
  }
  return result;
}

function googleProviderScopes(internalScopes) {
  return [...new Set(normalizeInternalScopes(internalScopes).map(scope => INTERNAL_TO_GOOGLE_SCOPE[scope]))].sort();
}

function readOAuthConfig(env = process.env) {
  const clientId = String(env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = String(env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  const redirectUri = String(env.ZUVYR_GOOGLE_OAUTH_REDIRECT_URI || '').trim();
  if (!clientId || !clientSecret || !redirectUri) throw driveError('google_oauth_not_configured');

  let parsed;
  try { parsed = new URL(redirectUri); }
  catch { throw driveError('google_oauth_redirect_invalid'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    throw driveError('google_oauth_redirect_invalid');
  }
  return Object.freeze({ clientId, clientSecret, redirectUri: parsed.toString() });
}

function normalizeConnectionId(value) {
  return value == null || value === '' ? null : uuid(value, 'invalid_workspace_connection_id');
}

function normalizeFileId(value) {
  const id = trimText(value, 'google_drive_file_id_invalid', 200);
  if (!DRIVE_ID_RE.test(id)) throw driveError('google_drive_file_id_invalid');
  return id;
}

function normalizePageSize(value) {
  if (value == null || value === '') return 50;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw driveError('google_drive_page_size_invalid');
  return n;
}

function normalizeDriveInput(toolKey, input) {
  const value = input == null ? {} : input;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw driveError('google_drive_input_invalid');
  const connectionId = normalizeConnectionId(value.connectionId);

  if (toolKey === 'drive.list') {
    return Object.freeze({
      connectionId,
      pageSize: normalizePageSize(value.pageSize),
      pageToken: value.pageToken == null || value.pageToken === ''
        ? null
        : trimText(value.pageToken, 'google_drive_page_token_invalid', 2048)
    });
  }

  if (toolKey === 'drive.search') {
    return Object.freeze({
      connectionId,
      query: trimText(value.query, 'google_drive_search_invalid', 200),
      pageSize: normalizePageSize(value.pageSize)
    });
  }

  if (toolKey === 'drive.read') {
    return Object.freeze({
      connectionId,
      fileId: normalizeFileId(value.fileId)
    });
  }

  if (toolKey === 'drive.export') {
    const mimeType = String(value.mimeType || 'text/plain').trim().toLowerCase();
    if (!EXPORT_MIME_TYPES.has(mimeType)) throw driveError('google_drive_export_mime_invalid');
    return Object.freeze({
      connectionId,
      fileId: normalizeFileId(value.fileId),
      mimeType
    });
  }

  if (toolKey === 'drive.write') {
    const name = trimText(value.name, 'google_drive_file_name_invalid', 255);
    const content = String(value.content == null ? '' : value.content);
    if (Buffer.byteLength(content, 'utf8') > 262144) throw driveError('google_drive_write_too_large');
    const mimeType = String(value.mimeType || 'text/plain').trim().toLowerCase();
    if (!MIME_RE.test(mimeType)) throw driveError('google_drive_mime_invalid');
    const parentId = value.parentId == null || value.parentId === '' ? null : normalizeFileId(value.parentId);
    return Object.freeze({ connectionId, name, content, mimeType, parentId });
  }

  throw driveError('google_drive_tool_unknown');
}

function publicInput(input) {
  const { connectionId, ...rest } = input;
  return rest;
}

async function readLimitedBody(response, maxBytes = MAX_DOWNLOAD_BYTES) {
  const length = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(length) && length > maxBytes) throw driveError('google_drive_response_too_large');

  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw driveError('google_drive_response_too_large');
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        throw driveError('google_drive_response_too_large');
      }
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  return Buffer.concat(chunks, total);
}

function createGoogleDriveRuntime({
  connectionStore = getDefaultWorkspaceConnectionStore(),
  permissionStore = getDefaultPermissionCenterStore(),
  fetchImpl = global.fetch,
  env = process.env,
  nowFactory = () => new Date(),
  randomBytes = crypto.randomBytes
} = {}) {
  if (typeof fetchImpl !== 'function') throw driveError('google_drive_fetch_unavailable');

  let toolsRegistered = false;

  async function fetchJson(url, init, { maxBytes = MAX_JSON_BYTES, errorCode = 'google_drive_request_failed' } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(url, {
        ...init,
        redirect: 'manual',
        signal: init?.signal || controller.signal
      });
      if (response.status >= 300 && response.status < 400) throw driveError('google_drive_redirect_blocked');
      const body = await readLimitedBody(response, maxBytes);
      let parsed = {};
      if (body.length) {
        try { parsed = JSON.parse(body.toString('utf8')); }
        catch { throw driveError('google_drive_response_invalid'); }
      }
      if (!response.ok) {
        const code = response.status === 401 ? 'google_drive_token_rejected' : errorCode;
        throw driveError(code);
      }
      return parsed;
    } catch (error) {
      if (error?.name === 'AbortError') throw driveError('google_drive_timeout');
      throw error?.code ? error : driveError(errorCode);
    } finally {
      clearTimeout(timer);
    }
  }

  async function connectionFor(ownerId, connectionId = null) {
    const connection = connectionId
      ? await connectionStore.getIntegrationConnection({ ownerId, connectionId })
      : await connectionStore.getActiveIntegration({ ownerId, integrationKey: 'google_drive' });
    if (
      connection.integration_key !== 'google_drive' ||
      connection.status !== 'active' ||
      connection.connected !== true ||
      connection.revoked_at != null
    ) {
      throw driveError('google_drive_connection_inactive');
    }
    return connection;
  }

  async function startOAuth({ ownerId, connectionId }) {
    const config = readOAuthConfig(env);
    const id = uuid(connectionId, 'invalid_workspace_connection_id');
    const connection = await connectionStore.getIntegrationConnection({ ownerId, connectionId: id });
    if (connection.integration_key !== 'google_drive') throw driveError('google_drive_connection_required');
    if (connection.status === 'revoked' || connection.revoked_at != null) throw driveError('google_drive_connection_revoked');

    const internalScopes = normalizeInternalScopes(connection.scopes || []);
    const providerScopes = googleProviderScopes(internalScopes);
    const state = base64url(randomBytes(32));
    const verifier = base64url(randomBytes(48));
    if (verifier.length < 43 || verifier.length > 128) throw driveError('google_oauth_pkce_generation_failed');
    const expiresAt = new Date(nowFactory().getTime() + 10 * 60 * 1000).toISOString();

    await connectionStore.createOAuthSession({
      ownerId,
      connectionId: id,
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
    url.searchParams.set('scope', providerScopes.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', pkceChallenge(verifier));
    url.searchParams.set('code_challenge_method', 'S256');

    return Object.freeze({
      connectionId: id,
      authorizationUrl: url.toString(),
      expiresAt,
      provider: 'google_drive',
      scopes: Object.freeze([...internalScopes])
    });
  }

  async function exchangeAuthorizationCode({ code, verifier, redirectUri }) {
    const config = readOAuthConfig(env);
    if (redirectUri !== config.redirectUri) throw driveError('google_oauth_redirect_mismatch');
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });
    return fetchJson(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }, { maxBytes: 262144, errorCode: 'google_oauth_token_exchange_failed' });
  }

  async function completeOAuth({ ownerId, code, state }) {
    const authorizationCode = trimText(code, 'google_oauth_code_required', 4096);
    const rawState = trimText(state, 'google_oauth_state_required', 1024);
    const session = await connectionStore.consumeOAuthSession({
      ownerId,
      stateHash: sha256Hex(rawState)
    });

    let token;
    try {
      token = await exchangeAuthorizationCode({
        code: authorizationCode,
        verifier: String(session.pkce_verifier || ''),
        redirectUri: String(session.redirect_uri || '')
      });
    } catch (error) {
      await connectionStore.markIntegrationError({
        ownerId,
        connectionId: session.connection_id,
        code: error.code || 'google_oauth_token_exchange_failed'
      }).catch(() => null);
      throw error;
    }

    const accessToken = trimText(token.access_token, 'google_oauth_access_token_missing', 16384);
    const tokenType = String(token.token_type || 'Bearer').trim();
    if (!/^Bearer$/i.test(tokenType)) throw driveError('google_oauth_token_type_invalid');
    const expiresIn = Number(token.expires_in);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 86400) {
      throw driveError('google_oauth_token_expiry_invalid');
    }
    const expiresAt = new Date(nowFactory().getTime() + expiresIn * 1000).toISOString();
    const refreshToken = token.refresh_token == null ? null : trimText(token.refresh_token, 'google_oauth_refresh_token_invalid', 16384);
    const internalScopes = normalizeInternalScopes(session.requested_scopes || []);

    const bundle = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_at: expiresAt,
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
      provider_scope: String(token.scope || '')
    };

    const stored = await connectionStore.setIntegrationSecret({
      ownerId,
      connectionId: session.connection_id,
      secret: JSON.stringify(bundle),
      tokenExpiresAt: expiresAt,
      providerSubject: null,
      accountLabel: 'Google Drive',
      scopes: internalScopes
    });

    return Object.freeze({
      connectionId: session.connection_id,
      provider: 'google_drive',
      status: 'active',
      connected: true,
      refreshTokenPresent: refreshToken != null,
      tokenExpiresAt: expiresAt,
      scopes: Object.freeze([...internalScopes]),
      credentialConfigured: stored?.credential_configured === true
    });
  }

  async function refreshAccessToken({ ownerId, connection, bundle }) {
    const refreshToken = bundle.refresh_token == null ? null : String(bundle.refresh_token);
    if (!refreshToken) throw driveError('google_drive_reconnect_required');
    const config = readOAuthConfig(env);
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });
    const token = await fetchJson(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }, { maxBytes: 262144, errorCode: 'google_oauth_token_refresh_failed' });

    const accessToken = trimText(token.access_token, 'google_oauth_access_token_missing', 16384);
    const expiresIn = Number(token.expires_in);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 86400) {
      throw driveError('google_oauth_token_expiry_invalid');
    }
    const expiresAt = new Date(nowFactory().getTime() + expiresIn * 1000).toISOString();
    const updated = {
      ...bundle,
      access_token: accessToken,
      token_type: 'Bearer',
      expires_at: expiresAt,
      refresh_token: token.refresh_token || refreshToken,
      provider_scope: String(token.scope || bundle.provider_scope || '')
    };
    await connectionStore.setIntegrationSecret({
      ownerId,
      connectionId: connection.id,
      secret: JSON.stringify(updated),
      tokenExpiresAt: expiresAt,
      providerSubject: connection.provider_subject || null,
      accountLabel: connection.account_label || 'Google Drive',
      scopes: connection.scopes || []
    });
    return accessToken;
  }

  async function accessToken({ ownerId, connection }) {
    const raw = await connectionStore.getIntegrationSecret({ ownerId, connectionId: connection.id });
    if (!raw) throw driveError('google_drive_credential_missing');
    let bundle;
    try { bundle = JSON.parse(raw); }
    catch { throw driveError('google_drive_credential_invalid'); }
    const token = trimText(bundle.access_token, 'google_drive_credential_invalid', 16384);
    const expiryMs = Date.parse(bundle.expires_at || '');
    if (Number.isFinite(expiryMs) && expiryMs > nowFactory().getTime() + 60000) return token;
    return refreshAccessToken({ ownerId, connection, bundle });
  }

  async function driveJson(token, url, init = {}) {
    return fetchJson(url, {
      ...init,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        ...(init.headers || {})
      }
    }, { maxBytes: MAX_JSON_BYTES, errorCode: 'google_drive_api_failed' });
  }

  function escapeQuery(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  async function executeDriveTool({ toolKey, input, token }) {
    if (toolKey === 'drive.list' || toolKey === 'drive.search') {
      const url = new URL(`${GOOGLE_DRIVE_API}/files`);
      url.searchParams.set('pageSize', String(input.pageSize));
      url.searchParams.set('spaces', 'drive');
      url.searchParams.set('orderBy', 'modifiedTime desc');
      url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink,parents)');
      const q = ["trashed = false"];
      if (toolKey === 'drive.search') q.push(`name contains '${escapeQuery(input.query)}'`);
      url.searchParams.set('q', q.join(' and '));
      if (input.pageToken) url.searchParams.set('pageToken', input.pageToken);
      return driveJson(token, url.toString(), { method: 'GET' });
    }

    if (toolKey === 'drive.read') {
      const url = `${GOOGLE_DRIVE_API}/files/${encodeURIComponent(input.fileId)}?alt=media`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetchImpl(url, {
          method: 'GET',
          headers: { authorization: `Bearer ${token}` },
          redirect: 'manual',
          signal: controller.signal
        });
        if (response.status >= 300 && response.status < 400) throw driveError('google_drive_redirect_blocked');
        if (!response.ok) throw driveError(response.status === 401 ? 'google_drive_token_rejected' : 'google_drive_api_failed');
        const body = await readLimitedBody(response);
        const mimeType = String(response.headers?.get?.('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
        const textual = mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml';
        return {
          fileId: input.fileId,
          mimeType,
          size: body.length,
          encoding: textual ? 'utf8' : 'base64',
          content: textual ? body.toString('utf8') : body.toString('base64')
        };
      } catch (error) {
        if (error?.name === 'AbortError') throw driveError('google_drive_timeout');
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    if (toolKey === 'drive.export') {
      const url = new URL(`${GOOGLE_DRIVE_API}/files/${encodeURIComponent(input.fileId)}/export`);
      url.searchParams.set('mimeType', input.mimeType);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetchImpl(url.toString(), {
          method: 'GET',
          headers: { authorization: `Bearer ${token}` },
          redirect: 'manual',
          signal: controller.signal
        });
        if (response.status >= 300 && response.status < 400) throw driveError('google_drive_redirect_blocked');
        if (!response.ok) throw driveError(response.status === 401 ? 'google_drive_token_rejected' : 'google_drive_api_failed');
        const body = await readLimitedBody(response);
        const textual = input.mimeType.startsWith('text/');
        return {
          fileId: input.fileId,
          mimeType: input.mimeType,
          size: body.length,
          encoding: textual ? 'utf8' : 'base64',
          content: textual ? body.toString('utf8') : body.toString('base64')
        };
      } catch (error) {
        if (error?.name === 'AbortError') throw driveError('google_drive_timeout');
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    if (toolKey === 'drive.write') {
      const boundary = `zuvyr_${randomBytes(12).toString('hex')}`;
      const metadata = {
        name: input.name,
        ...(input.parentId ? { parents: [input.parentId] } : {})
      };
      const body = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n${input.content}\r\n` +
        `--${boundary}--\r\n`,
        'utf8'
      );
      const url = new URL(GOOGLE_DRIVE_UPLOAD);
      url.searchParams.set('uploadType', 'multipart');
      url.searchParams.set('fields', 'id,name,mimeType,modifiedTime,size,webViewLink,parents');
      return driveJson(token, url.toString(), {
        method: 'POST',
        headers: { 'content-type': `multipart/related; boundary=${boundary}` },
        body
      });
    }

    throw driveError('google_drive_tool_unknown');
  }

  async function prepareInvocation({ ownerId, toolKey, input, sessionId }) {
    const key = String(toolKey || '').trim().toLowerCase();
    const definition = TOOL_DEFINITIONS[key];
    if (!definition) throw driveError('google_drive_tool_unknown');
    const normalized = normalizeDriveInput(key, input);
    const connection = await connectionFor(ownerId, normalized.connectionId);
    if (!(connection.scopes || []).map(String).map(v => v.toLowerCase()).includes(definition.requiredScope)) {
      throw driveError('connection_scope_not_granted');
    }
    if (definition.action === 'connection.read' && connection.read_enabled !== true) {
      throw driveError('connection_read_disabled');
    }
    if (definition.action === 'connection.write' && connection.write_enabled !== true) {
      throw driveError('connection_write_disabled');
    }

    const session = trimText(sessionId, 'permission_session_required', 200);
    const fingerprint = operationFingerprint({
      action: definition.action,
      connectionId: connection.id,
      toolKey: key,
      requiredScope: definition.requiredScope,
      input: publicInput(normalized)
    });
    const write = definition.action === 'connection.write';
    return Object.freeze({
      connectionId: connection.id,
      toolKey: key,
      action: definition.action,
      requiredScope: definition.requiredScope,
      normalizedInput: normalized,
      operationFingerprint: fingerprint,
      permissionRequest: Object.freeze({
        action: definition.action,
        grantMode: write ? 'allow_once' : 'session',
        scopeType: 'resource_session',
        resourceNamespace: 'integration_connection',
        resourceId: connection.id,
        sessionId: session,
        constraints: Object.freeze({
          toolKey: key,
          ...(write ? { operationFingerprint: fingerprint } : {})
        })
      })
    });
  }

  async function invoke({ ownerId, toolKey, input, sessionId, requestId }) {
    const prepared = await prepareInvocation({ ownerId, toolKey, input, sessionId });
    const request = trimText(requestId, 'invalid_permission_request_id', 200);
    await permissionStore.consumeWorkspaceConnection({
      ownerId,
      action: prepared.action,
      connectionId: prepared.connectionId,
      sessionId: String(sessionId || '').trim(),
      requestId: request,
      toolKey: prepared.toolKey,
      requiredScope: prepared.requiredScope,
      operationFingerprint: prepared.action === 'connection.write'
        ? prepared.operationFingerprint
        : null
    });

    const connection = await connectionFor(ownerId, prepared.connectionId);
    let token;
    try {
      token = await accessToken({ ownerId, connection });
      const result = await executeDriveTool({
        toolKey: prepared.toolKey,
        input: prepared.normalizedInput,
        token
      });
      await connectionStore.recordAudit({
        ownerId,
        eventType: 'google_drive_tool_succeeded',
        details: {
          connectionId: connection.id,
          toolKey: prepared.toolKey,
          requiredScope: prepared.requiredScope,
          requestId: request
        },
        externalWriteExecuted: prepared.action === 'connection.write'
      });
      return Object.freeze({
        toolKey: prepared.toolKey,
        source: 'integration',
        provider: 'google_drive',
        connectionId: connection.id,
        billedCredits: 0,
        result
      });
    } catch (error) {
      await connectionStore.markIntegrationError({
        ownerId,
        connectionId: connection.id,
        code: error.code || 'google_drive_tool_failed'
      }).catch(() => null);
      await connectionStore.recordAudit({
        ownerId,
        eventType: 'google_drive_tool_failed',
        details: {
          connectionId: connection.id,
          toolKey: prepared.toolKey,
          requiredScope: prepared.requiredScope,
          requestId: request,
          errorCode: String(error.code || 'google_drive_tool_failed').slice(0, 200)
        },
        externalWriteExecuted: false
      }).catch(() => null);
      throw error;
    }
  }

  function registerTools(tools) {
    if (toolsRegistered) return;
    for (const [key, definition] of Object.entries(TOOL_DEFINITIONS)) {
      tools.registerTool(key, {
        description: definition.description,
        inputSchema: definition.inputSchema,
        source: 'integration',
        handler: (input, context) => invoke({
          ownerId: context.ownerId,
          toolKey: key,
          input,
          sessionId: context.sessionId,
          requestId: context.requestId
        })
      });
    }
    toolsRegistered = true;
  }

  return Object.freeze({
    startOAuth,
    completeOAuth,
    prepareInvocation,
    invoke,
    registerTools,
    googleProviderScopes,
    normalizeDriveInput,
    readOAuthConfig
  });
}

let defaultRuntime = null;
function getDefaultGoogleDriveRuntime() {
  if (!defaultRuntime) defaultRuntime = createGoogleDriveRuntime();
  return defaultRuntime;
}

module.exports = {
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_DRIVE_API,
  GOOGLE_DRIVE_UPLOAD,
  TOOL_DEFINITIONS,
  createGoogleDriveRuntime,
  getDefaultGoogleDriveRuntime,
  googleProviderScopes,
  normalizeDriveInput,
  readOAuthConfig
};
