'use strict';

const {
  config,
  sandboxError,
  assertLiveAvailable,
  buildProviderCreateBody,
  assertNoSecretInjection
} = require('./codeSandboxPolicy');

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

  async function request(path, options = {}) {
    assertLiveAvailable(env);

    const token = String(env.VERCEL_TOKEN || '').trim();
    if (!token) throw providerError('pack076_missing_vercel_token');

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      config.runtime.providerRequestTimeoutMs
    );

    let response;
    try {
      response = await fetchImpl(requestUrl(path), {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
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

  async function createSession({ localSessionId } = {}) {
    const body = buildProviderCreateBody({ localSessionId, env });
    assertNoSecretInjection(body);

    const result = await request('/v3/sandboxes', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const providerSessionId = String(result?.session?.id || '').trim();
    if (!/^sbx_[A-Za-z0-9_-]{6,}$/.test(providerSessionId)) {
      throw providerError('code_sandbox_provider_session_missing');
    }

    // Provider routes/public URLs are intentionally discarded here.
    // PACK076 never returns or persists raw sandbox routes.
    return Object.freeze({
      provider: 'vercel_sandbox',
      providerSessionId,
      status: String(result?.session?.status || 'running'),
      runtime: String(result?.session?.runtime || config.runtime.runtime),
      usage: safeProviderUsage(result?.session)
    });
  }

  async function getSession(providerSessionId) {
    const id = String(providerSessionId || '').trim();
    if (!/^sbx_[A-Za-z0-9_-]{6,}$/.test(id)) {
      throw providerError('code_sandbox_provider_session_invalid');
    }
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

  async function stopSession(providerSessionId) {
    const id = String(providerSessionId || '').trim();
    if (!/^sbx_[A-Za-z0-9_-]{6,}$/.test(id)) {
      throw providerError('code_sandbox_provider_session_invalid');
    }
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
    stopSession
  });
}

module.exports = {
  createVercelSandboxProvider,
  safeProviderUsage
};
