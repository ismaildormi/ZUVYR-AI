'use strict';

const net = require('node:net');
const config = require('../config/cloud-browser.v1.json');

function browserError(code, details = null) {
  const error = new Error(code);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function envTrue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function availability(env = process.env) {
  const blockers = [];
  if (config.gates.canCreateLiveSession !== true) blockers.push('pack081_source_live_gate_closed');
  if (!envTrue(env.ZUVYR_M17_VERIFIED)) blockers.push('pack081_m17_unverified');
  if (config.pricing.verificationStatus !== 'verified') blockers.push('pack081_browser_pricing_unverified');
  if (!envTrue(env.ZUVYR_BROWSER_PRICING_VERIFIED)) blockers.push('pack081_pricing_operator_gate_closed');
  for (const key of config.provider.requiredEnvironment) {
    if (!String(env[key] || '').trim()) blockers.push('pack081_missing_' + key.toLowerCase());
  }
  return Object.freeze({
    live: blockers.length === 0,
    provider: config.provider.id,
    externalGate: config.provider.externalGate,
    pricingVerificationStatus: config.pricing.verificationStatus,
    blockers: Object.freeze(blockers)
  });
}

function assertLiveAvailable(env = process.env) {
  const status = availability(env);
  if (!status.live) {
    const error = browserError('cloud_browser_live_gate_closed');
    error.blockers = status.blockers;
    throw error;
  }
  return status;
}

function credentialAvailability(env = process.env) {
  const blockers = config.provider.requiredEnvironment
    .filter(key => !String(env[key] || '').trim())
    .map(key => 'pack081_missing_' + key.toLowerCase());
  return Object.freeze({ available: blockers.length === 0, blockers:Object.freeze(blockers) });
}

function assertProviderCredentials(env = process.env) {
  const status = credentialAvailability(env);
  if (!status.available) {
    const error = browserError('cloud_browser_provider_credentials_unavailable');
    error.blockers = status.blockers;
    throw error;
  }
  return status;
}

function normalizePublicUrl(value) {
  let url;
  try { url = new URL(String(value || '')); }
  catch (_) { throw browserError('cloud_browser_url_invalid'); }
  if (!config.network.allowedSchemes.includes(url.protocol.replace(':',''))) {
    throw browserError('cloud_browser_url_scheme_blocked');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if (
    net.isIP(host) !== 0 ||
    host === 'localhost' ||
    config.network.blockedHostSuffixes.some(suffix => host.endsWith(suffix)) ||
    host === 'metadata.google.internal' ||
    host === '169.254.169.254'
  ) {
    throw browserError('cloud_browser_private_network_blocked');
  }
  url.username = '';
  url.password = '';
  return Object.freeze({
    url: url.toString(),
    host
  });
}

function sessionPolicies() {
  return Object.freeze({
    network:Object.freeze({
      mode:config.network.mode,
      blockPrivateIpLiterals:config.network.blockPrivateIpLiterals,
      blockLocalhost:config.network.blockLocalhost,
      blockLinkLocal:config.network.blockLinkLocal,
      blockCloudMetadata:config.network.blockCloudMetadata
    }),
    secrets:Object.freeze({
      injectBackendEnvironment:false,
      persistConnectUrl:false,
      persistCookiesOutsideProvider:false,
      rawCredentialInputAllowed:false
    })
  });
}

function publicSession(row) {
  if (!row) return null;
  return Object.freeze({
    id:row.id,
    taskRunId:row.task_run_id || null,
    status:row.status,
    provider:row.provider,
    region:row.region || null,
    currentHost:row.current_host || null,
    startedAt:row.started_at || null,
    lastActivityAt:row.last_activity_at,
    expiresAt:row.expires_at,
    idleExpiresAt:row.idle_expires_at,
    endedAt:row.ended_at || null,
    usageSeconds:Number(row.usage_seconds || 0),
    failureCode:row.failure_code || null,
    createdAt:row.created_at,
    updatedAt:row.updated_at
  });
}

function sanitizeProviderError(error) {
  const code=String(error?.code || 'cloud_browser_provider_error');
  return browserError(code, {
    status:Number.isInteger(Number(error?.providerStatus)) ? Number(error.providerStatus) : null
  });
}

module.exports={
  config,
  browserError,
  availability,
  assertLiveAvailable,
  credentialAvailability,
  assertProviderCredentials,
  normalizePublicUrl,
  sessionPolicies,
  publicSession,
  sanitizeProviderError
};
