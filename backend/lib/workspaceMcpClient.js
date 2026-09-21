'use strict';

const dns = require('node:dns').promises;
const net = require('node:net');

function runtimeError(code, detail = null) {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  return error;
}

function parseV4(address) {
  const parts = String(address || '').split('.').map(Number);
  return parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
    ? parts
    : null;
}

function isBlockedAddress(address) {
  const value = String(address || '').toLowerCase().split('%')[0];
  const family = net.isIP(value);
  if (family === 4) {
    const p = parseV4(value);
    if (!p) return true;
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true;
    if (p[0] >= 224) return true;
    return false;
  }
  if (family === 6) {
    if (value === '::' || value === '::1') return true;
    if (/^f[cd]/.test(value)) return true;
    if (/^fe[89ab]/.test(value)) return true;
    if (value.startsWith('::ffff:')) {
      const mapped = value.slice('::ffff:'.length);
      return net.isIP(mapped) !== 4 || isBlockedAddress(mapped);
    }
    return false;
  }
  return true;
}

function validateEndpoint(urlValue) {
  let url;
  try { url = new URL(String(urlValue || '')); }
  catch { throw runtimeError('workspace_mcp_endpoint_invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw runtimeError('workspace_mcp_endpoint_invalid');
  }
  const host = String(url.hostname || '').toLowerCase().replace(/\.$/, '');
  if (
    !host ||
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === 'metadata.google.internal' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw runtimeError('workspace_mcp_endpoint_blocked');
  }
  if (net.isIP(host) && isBlockedAddress(host)) {
    throw runtimeError('workspace_mcp_endpoint_blocked');
  }
  url.hash = '';
  return url;
}

async function assertPublicResolution(url, lookup = dns.lookup) {
  const host = String(url.hostname || '');
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw runtimeError('workspace_mcp_endpoint_blocked');
    return [{ address: host, family: net.isIP(host) }];
  }

  let records;
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch (error) {
    throw runtimeError('workspace_mcp_dns_failed', error?.code || error?.message || null);
  }
  if (!Array.isArray(records) || records.length < 1) {
    throw runtimeError('workspace_mcp_dns_failed');
  }
  for (const record of records) {
    if (!record || isBlockedAddress(record.address)) {
      throw runtimeError('workspace_mcp_endpoint_blocked');
    }
  }
  return records;
}

function createMcpRemoteAdapter({
  enabled = process.env.PACK089_MCP_REMOTE_ENABLED === 'true',
  loadSdk = async () => import('@modelcontextprotocol/client'),
  lookup = dns.lookup,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== 'function') throw runtimeError('workspace_mcp_fetch_unavailable');

  let sdkPromise = null;
  async function loadSdkChecked() {
    if (!sdkPromise) {
      sdkPromise = Promise.resolve()
        .then(() => loadSdk())
        .catch(error => {
          sdkPromise = null;
          if (
            error?.code === 'ERR_MODULE_NOT_FOUND' ||
            /modelcontextprotocol[/]client/i.test(String(error?.message || ''))
          ) {
            throw runtimeError('workspace_mcp_sdk_unavailable');
          }
          throw runtimeError('workspace_mcp_sdk_load_failed', error?.code || null);
        });
    }
    const sdk = await sdkPromise;
    if (typeof sdk?.Client !== 'function' || typeof sdk?.StreamableHTTPClientTransport !== 'function') {
      throw runtimeError('workspace_mcp_sdk_invalid');
    }
    return sdk;
  }

  async function preflight({ endpointUrl }) {
    if (!enabled) throw runtimeError('workspace_mcp_remote_disabled');
    const endpoint = validateEndpoint(endpointUrl);
    await assertPublicResolution(endpoint, lookup);
    await loadSdkChecked();
    return Object.freeze({ ready: true, endpoint: endpoint.toString() });
  }

  async function invoke({
    endpointUrl,
    remoteToolName,
    input = {},
    authorization = null,
    signal = null
  }) {
    const endpoint = validateEndpoint(endpointUrl);
    await assertPublicResolution(endpoint, lookup);
    const sdk = await loadSdkChecked();
    const Client = sdk.Client;
    const StreamableHTTPClientTransport = sdk.StreamableHTTPClientTransport;

    const safeFetch = async (resource, init = {}) => {
      const requestUrl =
        resource instanceof URL
          ? resource
          : typeof resource === 'string'
            ? new URL(resource)
            : new URL(resource.url);
      const validated = validateEndpoint(requestUrl);
      await assertPublicResolution(validated, lookup);
      const response = await fetchImpl(validated, { ...init, redirect: 'manual', signal: init.signal || signal || undefined });
      if (response && response.status >= 300 && response.status < 400) {
        throw runtimeError('workspace_mcp_redirect_blocked');
      }
      return response;
    };

    const headers = {};
    const auth = authorization == null ? '' : String(authorization).trim();
    if (auth) {
      if (auth.length > 4096 || /[\r\n]/.test(auth)) throw runtimeError('workspace_mcp_authorization_invalid');
      headers.Authorization = auth;
    }

    const client = new Client(
      { name: 'zuvyr-pack089', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    const transport = new StreamableHTTPClientTransport(endpoint, {
      fetch: safeFetch,
      requestInit: Object.keys(headers).length ? { headers } : undefined
    });

    try {
      await client.connect(transport);
      return await client.callTool({
        name: String(remoteToolName || '').trim(),
        arguments: input == null ? {} : input
      });
    } finally {
      try {
        if (typeof transport.terminateSession === 'function') await transport.terminateSession();
      } catch {}
      try { await client.close(); } catch {}
    }
  }

  return Object.freeze({
    invoke,
    preflight,
    isEnabled: () => enabled === true,
    validateEndpoint,
    assertPublicResolution
  });
}

module.exports = {
  createMcpRemoteAdapter,
  validateEndpoint,
  assertPublicResolution,
  isBlockedAddress
};
