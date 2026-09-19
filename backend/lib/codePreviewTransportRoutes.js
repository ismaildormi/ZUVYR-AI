'use strict';

const express = require('express');
const { createCodeSandboxRepository } = require('./codeSandboxRepository');
const {
  hashPreviewToken,
  sandboxError,
  config
} = require('./codeSandboxPolicy');
const {
  createVercelSandboxProvider
} = require('./codeVercelSandboxProvider');

function transportError(code, status = 400) {
  const error = sandboxError(code);
  error.status = status;
  return error;
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function previewCookiePath(sessionId) {
  return '/api/code-preview/' + encodeURIComponent(sessionId);
}

function previewCookie(token, sessionId, expiresAt) {
  const maxAge = Math.max(
    1,
    Math.min(
      config.preview.maxTokenTtlSeconds,
      Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
    )
  );
  return [
    'zuvyr_preview=' + encodeURIComponent(token),
    'Path=' + previewCookiePath(sessionId),
    'Max-Age=' + maxAge,
    'HttpOnly',
    'Secure',
    'SameSite=None',
    'Partitioned'
  ].join('; ');
}

function cspHeader() {
  return [
    "default-src 'self' data: blob:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors https://rox-ai-sepia.vercel.app"
  ].join('; ');
}

function safeClientPath(req, sessionId) {
  const prefix = '/' + String(sessionId);
  let relative = req.path.startsWith(prefix)
    ? req.path.slice(prefix.length)
    : '/';
  if (!relative.startsWith('/')) relative = '/' + relative;
  return relative || '/';
}

function createCodePreviewTransportRouter({
  db,
  sandboxProvider = null,
  fetchImpl = globalThis.fetch
} = {}) {
  const router = express.Router();
  if (!db) throw transportError('code_preview_repository_unavailable', 503);
  if (typeof fetchImpl !== 'function') {
    throw transportError('code_preview_fetch_unavailable', 503);
  }

  const repository = createCodeSandboxRepository(db);
  const provider =
    sandboxProvider ||
    createVercelSandboxProvider({ fetchImpl });

  async function handler(req, res) {
    try {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.sessionId)) {
        throw transportError('code_preview_session_invalid', 404);
      }

      if (!['GET','HEAD'].includes(req.method)) {
        throw transportError('code_preview_method_not_allowed', 405);
      }

      const queryToken = String(req.query?.t || '').trim();
      const cookies = parseCookies(req.headers.cookie);
      const token = queryToken || String(cookies.zuvyr_preview || '').trim();
      if (!token) throw transportError('code_preview_token_required', 401);

      const tokenHash = hashPreviewToken(decodeURIComponent(token));
      const authority = await repository.previewAuthority({
        sessionId: req.params.sessionId,
        previewTokenHash: tokenHash
      });

      if (queryToken) {
        const clean = new URL(req.originalUrl, 'https://zuvyr.invalid');
        clean.searchParams.delete('t');
        res.setHeader(
          'Set-Cookie',
          previewCookie(decodeURIComponent(queryToken), authority.id, authority.preview_expires_at)
        );
        res.setHeader('Referrer-Policy', 'no-referrer');
        return res.redirect(303, clean.pathname + clean.search);
      }

      const routeBase = await provider.resolvePreviewRoute({
        localSessionId: authority.id,
        providerSessionId: authority.provider_session_id,
        port: authority.preview_port
      });

      const target = new URL(safeClientPath(req, authority.id), routeBase + '/');
      for (const [key, value] of Object.entries(req.query || {})) {
        if (key === 't') continue;
        if (Array.isArray(value)) {
          for (const item of value) target.searchParams.append(key, String(item));
        } else if (value !== undefined && value !== null) {
          target.searchParams.set(key, String(value));
        }
      }

      const upstream = await fetchImpl(target.toString(), {
        method: req.method,
        redirect: 'manual',
        headers: {
          Accept: String(req.headers.accept || '*/*'),
          'Accept-Language': String(req.headers['accept-language'] || 'en')
        }
      });

      if (upstream.status >= 300 && upstream.status < 400) {
        throw transportError('code_preview_upstream_redirect_blocked', 502);
      }

      res.status(upstream.status);
      const contentType = upstream.headers.get('content-type');
      const cacheControl = upstream.headers.get('cache-control');
      if (contentType) res.setHeader('Content-Type', contentType);
      if (cacheControl) res.setHeader('Cache-Control', cacheControl);

      res.setHeader('Content-Security-Policy', cspHeader());
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

      if (req.method === 'HEAD') return res.end();

      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (bytes.length > 8 * 1024 * 1024) {
        throw transportError('code_preview_response_too_large', 502);
      }
      return res.end(bytes);
    } catch (error) {
      const code = String(error?.code || 'code_preview_transport_failed');
      const status =
        Number(error?.status) ||
        (code === 'code_preview_token_invalid' ? 401 :
         code === 'code_preview_transport_unavailable' ? 503 :
         code.endsWith('_unavailable') ? 503 : 400);
      return res.status(status).json({
        status: 'error',
        code,
        message: 'Preview transport unavailable.'
      });
    }
  }

  router.get('/:sessionId', handler);
  router.get('/:sessionId/*', handler);
  router.head('/:sessionId', handler);
  router.head('/:sessionId/*', handler);

  return router;
}

module.exports = {
  createCodePreviewTransportRouter,
  parseCookies,
  previewCookie,
  cspHeader,
  safeClientPath
};
