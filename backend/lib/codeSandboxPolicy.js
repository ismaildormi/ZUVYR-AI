'use strict';

const crypto = require('node:crypto');
const config = require('../config/code-sandbox.v1.json');

function sandboxError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function envTrue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function availability(env = process.env) {
  const blockers = [];

  if (config.gates.canProvisionLive !== true) {
    blockers.push('pack076_source_live_gate_closed');
  }
  if (config.provider.externalGate === 'M15' && !envTrue(env.ZUVYR_M15_VERIFIED)) {
    blockers.push('pack076_m15_unverified');
  }
  if (config.provider.pricingVerificationStatus !== 'verified') {
    blockers.push('pack076_sandbox_pricing_unverified');
  }
  if (!envTrue(env.ZUVYR_SANDBOX_PRICING_VERIFIED)) {
    blockers.push('pack076_pricing_operator_gate_closed');
  }
  for (const key of config.provider.requiredEnvironment) {
    if (!String(env[key] || '').trim()) {
      blockers.push('pack076_missing_' + key.toLowerCase());
    }
  }

  return Object.freeze({
    live: blockers.length === 0,
    provider: config.provider.id,
    runtime: config.runtime.runtime,
    externalGate: config.provider.externalGate,
    pricingVerificationStatus: config.provider.pricingVerificationStatus,
    blockers: Object.freeze([...blockers])
  });
}

function assertLiveAvailable(env = process.env) {
  const status = availability(env);
  if (!status.live) {
    const error = sandboxError('code_sandbox_live_gate_closed');
    error.blockers = status.blockers;
    throw error;
  }
  return status;
}

function providerCredentialsAvailability(env = process.env) {
  const blockers = [];
  for (const key of config.provider.requiredEnvironment) {
    if (!String(env[key] || '').trim()) {
      blockers.push('pack076_missing_' + key.toLowerCase());
    }
  }
  return Object.freeze({
    available: blockers.length === 0,
    blockers: Object.freeze(blockers)
  });
}

function assertProviderCredentials(env = process.env) {
  const status = providerCredentialsAvailability(env);
  if (!status.available) {
    const error = sandboxError('code_sandbox_provider_credentials_unavailable');
    error.blockers = status.blockers;
    throw error;
  }
  return status;
}

function createPreviewCredential({ now = Date.now(), ttlSeconds } = {}) {
  const ttl = Math.max(
    30,
    Math.min(
      config.preview.maxTokenTtlSeconds,
      Number(ttlSeconds) || config.preview.defaultTokenTtlSeconds
    )
  );
  const token = crypto.randomBytes(config.preview.tokenBytes).toString('base64url');
  const hash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  return Object.freeze({
    token,
    hash,
    expiresAt: new Date(now + ttl * 1000).toISOString()
  });
}

function hashPreviewToken(token) {
  const text = String(token || '');
  if (text.length < 20 || text.length > 512) {
    throw sandboxError('code_preview_token_invalid');
  }
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function safeResourceLimits() {
  return Object.freeze({
    runtime: config.runtime.runtime,
    vcpus: config.runtime.vcpus,
    memoryMb: config.runtime.memoryMb,
    timeoutMs: config.runtime.defaultTimeoutMs,
    maxTimeoutMs: config.runtime.maxTimeoutMs,
    idleTimeoutMs: config.runtime.idleTimeoutMs
  });
}

function safeNetworkPolicy() {
  return Object.freeze({
    mode: 'deny-all',
    allowedDomains: Object.freeze([]),
    allowedCidrs: Object.freeze([]),
    deniedCidrs: Object.freeze([]),
    dependencyInstallRequiresPolicyOverride:
      config.network.dependencyInstallRequiresPolicyOverride === true
  });
}

function providerSandboxName(sessionId) {
  const compact = String(sessionId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (compact.length < 16) throw sandboxError('code_sandbox_session_id_invalid');
  return 'zuvyr-' + compact.slice(0, 40);
}

function buildProviderCreateBody({ localSessionId, env = process.env } = {}) {
  const name = providerSandboxName(localSessionId);
  const projectId = String(env.VERCEL_PROJECT_ID || '').trim();
  if (!projectId) throw sandboxError('pack076_missing_vercel_project_id');

  return Object.freeze({
    name,
    projectId,
    runtime: config.runtime.runtime,
    resources: Object.freeze({
      vcpus: String(config.runtime.vcpus),
      memory: String(config.runtime.memoryMb)
    }),
    timeout: String(config.runtime.defaultTimeoutMs),
    persistent: false,
    networkPolicy: Object.freeze({
      mode: 'deny-all'
    }),
    ports: Object.freeze([]),
    env: Object.freeze({
      ZUVYR_SANDBOX_SESSION_ID: String(localSessionId)
    }),
    tags: Object.freeze({
      zuvyrSession: String(localSessionId)
    })
  });
}

function assertNoSecretInjection(body) {
  const forbidden = config.secrets.forbiddenNamePatterns
    .map(value => String(value || '').toUpperCase())
    .filter(Boolean);

  function walkKeys(value, path = []) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const upperKey = String(key).toUpperCase();
      if (forbidden.some(pattern => upperKey.includes(pattern))) {
        throw sandboxError('code_sandbox_secret_injection_blocked');
      }
      walkKeys(child, path.concat(key));
    }
  }

  walkKeys(body);

  const keys = Object.keys(body?.env || {});
  for (const key of keys) {
    if (!config.secrets.allowedEnvironmentKeys.includes(key)) {
      throw sandboxError('code_sandbox_environment_key_blocked');
    }
  }

  return true;
}

function publicSession(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    runtime: row.runtime,
    resourceLimits: row.resource_limits || {},
    networkPolicy: row.network_policy || {},
    previewAvailable:
      row.status === 'running' &&
      Number.isInteger(row.preview_port) &&
      row.preview_port > 0 &&
      row.preview_expires_at &&
      new Date(row.preview_expires_at).getTime() > Date.now(),
    previewPortConfigured:
      Number.isInteger(row.preview_port) && row.preview_port > 0,
    expiresAt: row.expires_at,
    idleExpiresAt: row.idle_expires_at,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
    stoppedAt: row.stopped_at || null,
    failureCode: row.failure_code || null
  });
}

module.exports = {
  config,
  sandboxError,
  availability,
  assertLiveAvailable,
  providerCredentialsAvailability,
  assertProviderCredentials,
  createPreviewCredential,
  hashPreviewToken,
  safeResourceLimits,
  safeNetworkPolicy,
  providerSandboxName,
  buildProviderCreateBody,
  assertNoSecretInjection,
  publicSession
};
