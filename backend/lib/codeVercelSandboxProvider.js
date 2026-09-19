'use strict';

const net = require('node:net');

const {
  config,
  sandboxError,
  assertLiveAvailable,
  assertProviderCredentials,
  buildProviderCreateBody,
  assertNoSecretInjection
} = require('./codeSandboxPolicy');

const SESSION_RE = /^sbx_[A-Za-z0-9_-]{6,}$/;
const COMMAND_RE = /^cmd_[A-Za-z0-9_-]{6,}$/;
const MAX_PROVIDER_LOG_BYTES = 512 * 1024;

function safeProviderUsage(session) {
  const activeCpuDurationMs = Number(session?.activeCpuDurationMs || 0);
  const ingressBytes = Number(session?.networkTransfer?.ingress || 0);
  const egressBytes = Number(session?.networkTransfer?.egress || 0);
  const durationMs = Number(session?.duration || 0);
  return Object.freeze({
    durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0,
    activeCpuDurationMs:
      Number.isFinite(activeCpuDurationMs) && activeCpuDurationMs >= 0
        ? activeCpuDurationMs
        : 0,
    ingressBytes:
      Number.isFinite(ingressBytes) && ingressBytes >= 0 ? ingressBytes : 0,
    egressBytes:
      Number.isFinite(egressBytes) && egressBytes >= 0 ? egressBytes : 0
  });
}

function providerError(code, cause = null) {
  const error = sandboxError(code);
  if (cause) error.cause = cause;
  return error;
}

function providerSessionId(value) {
  const id = String(value || '').trim();
  if (!SESSION_RE.test(id)) {
    throw providerError('code_sandbox_provider_session_invalid');
  }
  return id;
}

function providerCommandId(value) {
  const id = String(value || '').trim();
  if (!COMMAND_RE.test(id)) {
    throw providerError('code_sandbox_provider_command_invalid');
  }
  return id;
}

function createVercelSandboxProvider({
  fetchImpl = globalThis.fetch,
  env = process.env
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw providerError('code_sandbox_fetch_unavailable');
  }

  function requestUrl(path) {
    const teamId = String(env.VERCEL_TEAM_ID || '').trim();
    if (!teamId) throw providerError('pack076_missing_vercel_team_id');
    const url = new URL(path, config.provider.apiBaseUrl);
    url.searchParams.set('teamId', teamId);
    return url.toString();
  }

  async function fetchProvider(
    path,
    options = {},
    {
      requireLiveGate = false,
      timeoutMs = config.runtime.providerRequestTimeoutMs
    } = {}
  ) {
    if (requireLiveGate) assertLiveAvailable(env);
    else assertProviderCredentials(env);

    const token = String(env.VERCEL_TOKEN || '').trim();
    if (!token) throw providerError('pack076_missing_vercel_token');

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.max(1000, Number(timeoutMs) || config.runtime.providerRequestTimeoutMs)
    );

    try {
      return await fetchImpl(requestUrl(path), {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: 'Bearer ' + token,
          ...(options.headers || {})
        }
      });
    } catch (cause) {
      if (cause?.name === 'AbortError') {
        throw providerError('code_sandbox_provider_timeout', cause);
      }
      throw providerError('code_sandbox_provider_unreachable', cause);
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(
    path,
    options = {},
    requestOptions = {}
  ) {
    const response = await fetchProvider(
      path,
      {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      },
      requestOptions
    );

    let body = {};
    try {
      body = await response.json();
    } catch (_) {
      body = {};
    }

    if (!response.ok) {
      const error = providerError('code_sandbox_provider_rejected');
      error.providerStatus = Number(response.status);
      throw error;
    }
    return body;
  }

  async function requestText(
    path,
    options = {},
    requestOptions = {}
  ) {
    const response = await fetchProvider(path, options, requestOptions);
    let body = '';
    try {
      body = await response.text();
    } catch (_) {
      body = '';
    }

    if (!response.ok) {
      const error = providerError('code_sandbox_provider_rejected');
      error.providerStatus = Number(response.status);
      throw error;
    }

    if (Buffer.byteLength(body, 'utf8') > MAX_PROVIDER_LOG_BYTES) {
      throw providerError('code_sandbox_provider_logs_too_large');
    }
    return body;
  }

  async function createSession({ localSessionId } = {}) {
    const body = buildProviderCreateBody({ localSessionId, env });
    assertNoSecretInjection(body);

    const result = await request('/v3/sandboxes', {
      method: 'POST',
      body: JSON.stringify(body)
    }, { requireLiveGate: true });

    const id = providerSessionId(result?.session?.id);

    // Provider routes/public URLs are intentionally discarded here.
    // PACK076 never returns or persists raw sandbox routes.
    return Object.freeze({
      provider: 'vercel_sandbox',
      providerSessionId: id,
      status: String(result?.session?.status || 'running'),
      runtime: String(result?.session?.runtime || config.runtime.runtime),
      usage: safeProviderUsage(result?.session)
    });
  }

  async function getSession(value) {
    const id = providerSessionId(value);
    const result = await request(
      '/v2/sandboxes/sessions/' + encodeURIComponent(id),
      { method: 'GET' }
    );
    return Object.freeze({
      provider: 'vercel_sandbox',
      providerSessionId: id,
      status: String(result?.session?.status || 'unknown'),
      runtime: String(result?.session?.runtime || ''),
      usage: safeProviderUsage(result?.session)
    });
  }

  async function writeArchive(value, archive, {
    cwd = '/vercel/sandbox',
    timeoutMs = 30000
  } = {}) {
    const id = providerSessionId(value);
    if (!Buffer.isBuffer(archive) || archive.length < 32) {
      throw providerError('code_sandbox_archive_invalid');
    }
    if (
      typeof cwd !== 'string' ||
      !cwd.startsWith('/') ||
      cwd.includes('\0') ||
      cwd.length > 300
    ) {
      throw providerError('code_sandbox_archive_cwd_invalid');
    }

    const response = await fetchProvider(
      '/v2/sandboxes/sessions/' + encodeURIComponent(id) + '/fs/write',
      {
        method: 'POST',
        body: archive,
        headers: {
          'Content-Type': 'application/gzip',
          'x-Cwd': cwd
        }
      },
      { timeoutMs }
    );

    if (!response.ok) {
      const error = providerError('code_sandbox_provider_write_failed');
      error.providerStatus = Number(response.status);
      throw error;
    }

    return Object.freeze({
      providerSessionId: id,
      archiveBytes: archive.length,
      cwd
    });
  }

  function normalizedCommand(command) {
    if (!command || typeof command !== 'object' || Array.isArray(command)) {
      throw providerError('code_sandbox_command_invalid');
    }
    const executable = String(command.command || '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(executable)) {
      throw providerError('code_sandbox_command_invalid');
    }
    const args = Array.isArray(command.args)
      ? command.args.map(value => String(value))
      : [];
    if (args.length > 64 || args.some(value => value.length > 2048 || value.includes('\0'))) {
      throw providerError('code_sandbox_command_args_invalid');
    }

    const cwd = String(command.cwd || '/vercel/sandbox');
    if (!cwd.startsWith('/') || cwd.includes('\0') || cwd.length > 300) {
      throw providerError('code_sandbox_command_cwd_invalid');
    }

    const envObject =
      command.env &&
      typeof command.env === 'object' &&
      !Array.isArray(command.env)
        ? command.env
        : {};
    const safeEnv = {};
    for (const [key, value] of Object.entries(envObject)) {
      if (!/^[A-Z_][A-Z0-9_]{0,63}$/i.test(key)) {
        throw providerError('code_sandbox_command_env_invalid');
      }
      const text = String(value);
      if (text.length > 2048 || text.includes('\0')) {
        throw providerError('code_sandbox_command_env_invalid');
      }
      safeEnv[key] = text;
    }

    const timeout = Math.max(1000, Math.min(900000, Number(command.timeout) || 30000));

    return Object.freeze({
      command: executable,
      args: Object.freeze(args),
      cwd,
      env: Object.freeze(safeEnv),
      sudo: false,
      wait: false,
      logs: false,
      timeout
    });
  }

  async function startCommand(value, command, commandValue) {
    const id = providerSessionId(value);
    const spec = normalizedCommand(command);
    const cmdId = providerCommandId(commandValue);
    const result = await request(
      '/v2/sandboxes/sessions/' + encodeURIComponent(id) +
        '/cmd?cmdId=' + encodeURIComponent(cmdId),
      {
        method: 'POST',
        body: JSON.stringify(spec)
      },
      { timeoutMs: Math.min(30000, spec.timeout + 5000) }
    );

    const returnedId = providerCommandId(result?.command?.id || cmdId);
    if (returnedId !== cmdId) {
      throw providerError('code_sandbox_provider_command_mismatch');
    }
    return Object.freeze({
      providerSessionId: id,
      providerCommandId: cmdId,
      command: String(result?.command?.name || spec.command),
      startedAt: result?.command?.startedAt || null
    });
  }

  function normalizeCommandStatus(value) {
    const command = value?.command || value || {};
    const id = providerCommandId(command.id);
    const rawExit = command.exitCode;
    const hasExit =
      rawExit !== null &&
      rawExit !== undefined &&
      rawExit !== '';
    const exitCode = hasExit ? Number(rawExit) : null;
    if (hasExit && !Number.isInteger(exitCode)) {
      throw providerError('code_sandbox_provider_exit_code_invalid');
    }
    const durationMs = Number(command.durationMs || 0);
    return Object.freeze({
      providerCommandId: id,
      running: !hasExit,
      finished: hasExit,
      exitCode,
      durationMs:
        Number.isFinite(durationMs) && durationMs >= 0
          ? Math.floor(durationMs)
          : 0,
      startedAt: command.startedAt || null
    });
  }

  async function getCommand(value, commandValue) {
    const id = providerSessionId(value);
    const cmdId = providerCommandId(commandValue);
    const result = await request(
      '/v2/sandboxes/sessions/' + encodeURIComponent(id) +
        '/cmd/' + encodeURIComponent(cmdId),
      { method: 'GET' }
    );
    return normalizeCommandStatus(result);
  }

  async function getCommandLogs(value, commandValue) {
    const id = providerSessionId(value);
    const cmdId = providerCommandId(commandValue);
    const body = await requestText(
      '/v2/sandboxes/sessions/' + encodeURIComponent(id) +
        '/cmd/' + encodeURIComponent(cmdId) + '/logs',
      {
        method: 'GET',
        headers: { Accept: 'application/x-ndjson,text/plain,*/*' }
      },
      { timeoutMs: 15000 }
    );
    return Object.freeze({
      providerSessionId: id,
      providerCommandId: cmdId,
      text: body
    });
  }

  async function killCommand(value, commandValue, signal = 15) {
    const id = providerSessionId(value);
    const cmdId = providerCommandId(commandValue);
    const numericSignal = Number(signal);
    if (![9, 15].includes(numericSignal)) {
      throw providerError('code_sandbox_kill_signal_invalid');
    }
    const result = await request(
      '/v2/sandboxes/sessions/' + encodeURIComponent(id) +
        '/cmd/' + encodeURIComponent(cmdId) + '/kill',
      {
        method: 'POST',
        body: JSON.stringify({ signal: numericSignal })
      }
    );
    return normalizeCommandStatus(result);
  }

  async function updateNetworkPolicy(value, policy) {
    const id = providerSessionId(value);
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
      throw providerError('code_sandbox_network_policy_invalid');
    }
    const mode = String(policy.mode || '').trim();
    if (!['deny-all', 'custom'].includes(mode)) {
      throw providerError('code_sandbox_network_policy_invalid');
    }
    const allowedDomains = Array.isArray(policy.allowedDomains)
      ? [...new Set(policy.allowedDomains.map(value => String(value).trim().toLowerCase()))]
      : [];
    if (
      allowedDomains.length > 32 ||
      allowedDomains.some(host =>
        !host ||
        host === '*' ||
        host.includes('/') ||
        host.includes(':') ||
        host.length > 253
      )
    ) {
      throw providerError('code_sandbox_network_domains_invalid');
    }

    const body = {
      mode,
      allowedDomains: mode === 'custom' ? allowedDomains : [],
      allowedCIDRs: [],
      deniedCIDRs: []
    };
    const result = await request(
      '/v2/sandboxes/sessions/' + encodeURIComponent(id) + '/network-policy',
      {
        method: 'POST',
        body: JSON.stringify(body)
      }
    );

    return Object.freeze({
      providerSessionId: id,
      networkPolicy: Object.freeze({
        mode: String(result?.session?.networkPolicy?.mode || mode),
        allowedDomains: Object.freeze([
          ...(result?.session?.networkPolicy?.allowedDomains || allowedDomains)
        ])
      })
    });
  }

  function safeUpstreamUrl(value) {
    let url;
    try {
      url = new URL(String(value || ''));
    } catch (_) {
      throw providerError('code_preview_provider_route_invalid');
    }
    if (url.protocol !== 'https:') {
      throw providerError('code_preview_provider_route_invalid');
    }
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      net.isIP(host) !== 0 ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      throw providerError('code_preview_provider_route_private');
    }
    return url.toString().replace(/\/$/, '');
  }

  async function resolvePreviewRoute({
    localSessionId,
    providerSessionId: expectedValue,
    port
  } = {}) {
    const expected = providerSessionId(expectedValue);
    const numericPort = Number(port);
    if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
      throw providerError('code_preview_port_invalid');
    }

    const name = require('./codeSandboxPolicy').providerSandboxName(localSessionId);
    const projectId = String(env.VERCEL_PROJECT_ID || '').trim();
    if (!projectId) throw providerError('pack076_missing_vercel_project_id');

    const result = await request(
      '/v2/sandboxes/' + encodeURIComponent(name) +
      '?projectId=' + encodeURIComponent(projectId),
      { method: 'GET' }
    );

    if (String(result?.session?.id || '') !== expected) {
      throw providerError('code_preview_provider_session_mismatch');
    }

    const route = (Array.isArray(result?.routes) ? result.routes : [])
      .find(item => Number(item?.port) === numericPort);
    if (!route?.url) {
      throw providerError('code_preview_provider_route_missing');
    }

    return safeUpstreamUrl(route.url);
  }

  async function stopSession(value) {
    const id = providerSessionId(value);
    const result = await request(
      '/v2/sandboxes/sessions/' + encodeURIComponent(id) + '/stop',
      { method: 'POST', body: '{}' }
    );
    return Object.freeze({
      provider: 'vercel_sandbox',
      providerSessionId: id,
      status: String(result?.session?.status || 'stopped'),
      usage: safeProviderUsage(result?.session)
    });
  }

  return Object.freeze({
    createSession,
    getSession,
    writeArchive,
    startCommand,
    getCommand,
    getCommandLogs,
    killCommand,
    updateNetworkPolicy,
    resolvePreviewRoute,
    stopSession
  });
}

module.exports = {
  createVercelSandboxProvider,
  safeProviderUsage
};
