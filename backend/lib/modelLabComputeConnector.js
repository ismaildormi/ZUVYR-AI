'use strict';

const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');
const config = require('../config/model-lab.v1.json');

function connectorError(code, status = 400, cause = null) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  if (cause) error.cause = cause;
  return error;
}

function isBlockedIpv4(address) {
  const parts = String(address).split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a,b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isBlockedIpv6(address) {
  const value = String(address || '').toLowerCase();
  if (!value) return true;
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(value)) return true;
  if (value.startsWith('ff')) return true;
  if (value.startsWith('2001:db8:')) return true;
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length);
    return net.isIP(mapped) !== 4 || isBlockedIpv4(mapped);
  }
  return false;
}

function assertPublicResolvedAddress(address) {
  const kind = net.isIP(String(address || ''));
  if (kind === 4 && !isBlockedIpv4(address)) return true;
  if (kind === 6 && !isBlockedIpv6(address)) return true;
  throw connectorError('model_lab_connector_private_address_blocked', 400);
}

function normalizeEndpointUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch (_) {
    throw connectorError('model_lab_connector_endpoint_invalid', 400);
  }

  if (url.protocol !== 'https:') {
    throw connectorError('model_lab_connector_https_required', 400);
  }
  if (url.username || url.password || url.hash) {
    throw connectorError('model_lab_connector_endpoint_credentials_forbidden', 400);
  }
  if (!url.hostname || net.isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0) {
    throw connectorError('model_lab_connector_dns_hostname_required', 400);
  }
  if (
    url.hostname.toLowerCase() === 'localhost' ||
    url.hostname.toLowerCase().endsWith('.localhost') ||
    url.hostname.toLowerCase().endsWith('.local') ||
    url.hostname.toLowerCase().endsWith('.internal')
  ) {
    throw connectorError('model_lab_connector_private_hostname_blocked', 400);
  }

  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function normalizeHealthPath(value, connectorKind) {
  const fallback =
    connectorKind === 'openai_compatible_https' ? '/v1/models' : '/health';
  const path = String(value || fallback).trim() || fallback;
  if (!path.startsWith('/') || path.startsWith('//') || path.length > 240) {
    throw connectorError('model_lab_connector_health_path_invalid', 400);
  }
  if (/\s/.test(path) || path.includes('..')) {
    throw connectorError('model_lab_connector_health_path_invalid', 400);
  }
  return path;
}

function ownershipChallenge() {
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  return Object.freeze({
    token,
    hash,
    path: '/.well-known/zuvyr-compute-verification',
    expiresAt: new Date(
      Date.now() + config.computeConnectors.ownershipChallengeTtlSeconds * 1000
    ).toISOString()
  });
}

function hashChallenge(value) {
  const text = String(value || '').trim();
  if (text.length < 20 || text.length > 512) {
    throw connectorError('model_lab_connector_challenge_invalid', 400);
  }
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

async function resolvePublicHost(hostname) {
  let answers;
  try {
    answers = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (cause) {
    throw connectorError('model_lab_connector_dns_failed', 502, cause);
  }
  if (!Array.isArray(answers) || answers.length < 1) {
    throw connectorError('model_lab_connector_dns_empty', 502);
  }
  for (const answer of answers) assertPublicResolvedAddress(answer.address);
  return Object.freeze([...answers]);
}

function requestPinned({
  endpointUrl,
  path,
  credential = null,
  method = 'GET',
  jsonBody = null,
  timeoutMs = config.computeConnectors.requestTimeoutMs,
  maxBytes = config.computeConnectors.healthResponseMaxBytes
} = {}) {
  return new Promise(async (resolve, reject) => {
    let endpoint;
    try {
      endpoint = new URL(normalizeEndpointUrl(endpointUrl));
      const answers = await resolvePublicHost(endpoint.hostname);
      const selected = answers[0];
      const requestMethod = String(method || 'GET').toUpperCase();
      if (!['GET','POST'].includes(requestMethod)) {
        throw connectorError('model_lab_connector_method_not_allowed', 400);
      }
      const targetPath = String(path || '/');
      if (
        !targetPath.startsWith('/') ||
        targetPath.startsWith('//') ||
        targetPath.length > 500 ||
        /\s/.test(targetPath) ||
        targetPath.includes('..')
      ) {
        throw connectorError('model_lab_connector_request_path_invalid', 400);
      }

      let bodyBuffer = null;
      if (jsonBody !== null && jsonBody !== undefined) {
        if (requestMethod !== 'POST') {
          throw connectorError('model_lab_connector_body_not_allowed', 400);
        }
        const encoded = JSON.stringify(jsonBody);
        bodyBuffer = Buffer.from(encoded, 'utf8');
        if (bodyBuffer.length > 1024 * 1024) {
          throw connectorError('model_lab_connector_request_too_large', 413);
        }
      }

      const headers = {
        Host: endpoint.host,
        Accept: 'application/json'
      };
      if (bodyBuffer) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = String(bodyBuffer.length);
      }
      if (credential) headers.Authorization = 'Bearer ' + String(credential);

      const req = https.request({
        protocol: 'https:',
        hostname: selected.address,
        family: selected.family,
        port: endpoint.port ? Number(endpoint.port) : 443,
        servername: endpoint.hostname,
        method: requestMethod,
        path: targetPath,
        headers,
        timeout: Math.max(1000, Math.min(15000, Number(timeoutMs) || 8000)),
        rejectUnauthorized: true
      }, res => {
        const chunks = [];
        let size = 0;
        res.on('data', chunk => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(connectorError('model_lab_connector_response_too_large', 502));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const status = Number(res.statusCode || 0);
          if (status >= 300 && status < 400) {
            reject(connectorError('model_lab_connector_redirect_blocked', 502));
            return;
          }
          const body = Buffer.concat(chunks).toString('utf8');
          resolve(Object.freeze({
            status,
            headers: Object.freeze({
              contentType: String(res.headers['content-type'] || '')
            }),
            body
          }));
        });
      });

      req.on('timeout', () => {
        req.destroy(connectorError('model_lab_connector_timeout', 504));
      });
      req.on('error', cause => {
        if (cause?.code && String(cause.code).startsWith('model_lab_')) {
          reject(cause);
          return;
        }
        reject(connectorError('model_lab_connector_unreachable', 502, cause));
      });
      if (bodyBuffer) req.write(bodyBuffer);
      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

function parseJsonMaybe(text) {
  try {
    const value = JSON.parse(String(text || ''));
    return value && typeof value === 'object' ? value : null;
  } catch (_) {
    return null;
  }
}

function publicAttestation(connectorKind, response, latencyMs) {
  const body = parseJsonMaybe(response.body);
  const healthy = response.status >= 200 && response.status < 300;
  const capabilities = {};

  if (connectorKind === 'openai_compatible_https') {
    const models = Array.isArray(body?.data)
      ? body.data
          .map(item => String(item?.id || '').trim())
          .filter(Boolean)
          .slice(0, 100)
      : [];
    capabilities.openaiCompatible = healthy;
    capabilities.serving = healthy;
    capabilities.training = false;
    capabilities.models = models;
  } else {
    const reported =
      body?.capabilities &&
      typeof body.capabilities === 'object' &&
      !Array.isArray(body.capabilities)
        ? body.capabilities
        : {};
    capabilities.customHttps = healthy;
    capabilities.reported = reported;
  }

  return Object.freeze({
    healthStatus: healthy ? 'healthy' : 'unhealthy',
    httpStatus: response.status,
    latencyMs: Math.max(0, Math.round(Number(latencyMs) || 0)),
    capabilities: Object.freeze(capabilities),
    measurement: Object.freeze({
      responseBytes: Buffer.byteLength(String(response.body || ''), 'utf8'),
      checkedAt: new Date().toISOString()
    }),
    customerComputeCostMicrousd: null,
    zuvyrControlPlaneCostMicrousd: 0,
    costKnown: false
  });
}

async function verifyOwnership({
  endpointUrl,
  challengeToken,
  expectedChallengeHash
} = {}) {
  if (hashChallenge(challengeToken) !== String(expectedChallengeHash || '')) {
    throw connectorError('model_lab_connector_challenge_scope_mismatch', 409);
  }
  const started = Date.now();
  const response = await requestPinned({
    endpointUrl,
    path:
      '/.well-known/zuvyr-compute-verification?challenge=' +
      encodeURIComponent(String(challengeToken))
  });
  if (response.status < 200 || response.status >= 300) {
    throw connectorError('model_lab_connector_ownership_not_verified', 409);
  }
  const body = parseJsonMaybe(response.body);
  const echoed = String(body?.challenge || response.body || '').trim();
  if (echoed !== String(challengeToken)) {
    throw connectorError('model_lab_connector_ownership_not_verified', 409);
  }
  return Object.freeze({
    verified: true,
    latencyMs: Date.now() - started,
    evidenceReference:
      'https://' +
      new URL(normalizeEndpointUrl(endpointUrl)).hostname +
      '/.well-known/zuvyr-compute-verification'
  });
}

async function healthCheck({
  connectorKind,
  endpointUrl,
  healthPath,
  credential = null
} = {}) {
  if (connectorKind === 'zuvyr_compute_relay') {
    throw connectorError('model_lab_compute_relay_not_connected', 503);
  }
  const path = normalizeHealthPath(healthPath, connectorKind);
  const started = Date.now();
  const response = await requestPinned({
    endpointUrl,
    path,
    credential
  });
  return publicAttestation(connectorKind, response, Date.now() - started);
}


function normalizeInferenceMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 128) {
    throw connectorError('owned_model_messages_invalid', 400);
  }
  const normalized = messages.map(message => {
    const role = String(message?.role || '').trim();
    if (!['system','user','assistant','tool'].includes(role)) {
      throw connectorError('owned_model_message_role_invalid', 400);
    }
    if (typeof message?.content !== 'string') {
      throw connectorError('owned_model_text_only_required', 400);
    }
    const content = message.content;
    if (content.length > 200000) {
      throw connectorError('owned_model_message_too_large', 413);
    }
    return { role, content };
  });
  if (Buffer.byteLength(JSON.stringify(normalized),'utf8') > 900000) {
    throw connectorError('owned_model_messages_too_large', 413);
  }
  return Object.freeze(normalized.map(item => Object.freeze(item)));
}

async function invokeOpenAiCompatible({
  endpointUrl,
  credential = null,
  model,
  messages,
  maxOutputTokens = 4096,
  timeoutMs = 30000
} = {}) {
  const modelId = String(model || '').trim();
  if (!modelId || modelId.length > 240) {
    throw connectorError('owned_model_endpoint_model_invalid', 400);
  }
  const normalizedMessages = normalizeInferenceMessages(messages);
  const tokens = Math.max(1, Math.min(16384, Number(maxOutputTokens) || 4096));
  const startedAt = Date.now();

  const response = await requestPinned({
    endpointUrl,
    path: '/v1/chat/completions',
    credential,
    method: 'POST',
    jsonBody: {
      model: modelId,
      messages: normalizedMessages,
      max_tokens: tokens,
      stream: false
    },
    timeoutMs: Math.max(1000, Math.min(60000, Number(timeoutMs) || 30000)),
    maxBytes: 4 * 1024 * 1024
  });

  if (response.status < 200 || response.status >= 300) {
    const error = connectorError('owned_model_provider_rejected', 502);
    error.providerStatus = response.status;
    throw error;
  }

  const parsed = parseJsonMaybe(response.body);
  const choice = Array.isArray(parsed?.choices) ? parsed.choices[0] : null;
  const text = choice?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw connectorError('owned_model_provider_output_invalid', 502);
  }

  const usage = parsed?.usage && typeof parsed.usage === 'object'
    ? {
        prompt_tokens: Number(parsed.usage.prompt_tokens || 0),
        completion_tokens: Number(parsed.usage.completion_tokens || 0),
        total_tokens: Number(parsed.usage.total_tokens || 0)
      }
    : {};

  return Object.freeze({
    text,
    model: modelId,
    provider: 'zuvyr_owned_byoc',
    usage: Object.freeze(usage),
    latencyMs: Date.now() - startedAt,
    providerCostUsd: 0,
    zuvyrOwnedModelUsageFeeUsd: 0,
    zuvyrApiSoftwareFeeUsd: 0,
    inferenceMarkupUsd: 0
  });
}

module.exports = {
  connectorError,
  isBlockedIpv4,
  isBlockedIpv6,
  assertPublicResolvedAddress,
  normalizeEndpointUrl,
  normalizeHealthPath,
  ownershipChallenge,
  hashChallenge,
  resolvePublicHost,
  requestPinned,
  publicAttestation,
  verifyOwnership,
  healthCheck,
  normalizeInferenceMessages,
  invokeOpenAiCompatible
};
