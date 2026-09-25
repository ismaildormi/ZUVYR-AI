'use strict';

const net = require('node:net');
const config = require('../config/cloud-browser.v1.json');
const { CREDIT_PRICE_USD } = require('./creditEconomics');

function browserError(code, details = null) {
  const error = new Error(code);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function envTrue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function isProductionEnvironment(env = process.env) {
  return String(env.RAILWAY_ENVIRONMENT_NAME || env.NODE_ENV || '')
    .trim()
    .toLowerCase() === 'production';
}

function availability(env = process.env) {
  const blockers = [];
  if (!envTrue(env.LIVE_BILLING_ALLOWED)) blockers.push('pack081_live_billing_disabled');
  if (config.gates.canCreateLiveSession !== true) blockers.push('pack081_source_live_gate_closed');
  if (!envTrue(env.ZUVYR_M17_VERIFIED)) blockers.push('pack081_m17_unverified');
  if (!envTrue(env.ZUVYR_BROWSER_PRICING_VERIFIED)) blockers.push('pack081_pricing_operator_gate_closed');
  if (isProductionEnvironment(env) && !envTrue(env.ZUVYR_BROWSER_PRIVATE_EGRESS_VERIFIED)) {
    blockers.push('pack081_private_egress_unverified');
  }
  for (const key of config.provider.requiredEnvironment) {
    if (!String(env[key] || '').trim()) blockers.push('pack081_missing_' + key.toLowerCase());
  }
  return Object.freeze({
    live: blockers.length === 0,
    provider: config.provider.id,
    externalGate: config.provider.externalGate,
    pricingVerificationStatus: config.pricing.verificationStatus,
    privateEgressVerified: !isProductionEnvironment(env) || envTrue(env.ZUVYR_BROWSER_PRIVATE_EGRESS_VERIFIED),
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

function pricingSnapshot(env = process.env) {
  const raw = String(env.BROWSERBASE_BROWSER_HOUR_PRICE_MICRO_USD || '').trim();
  const price = Number(raw);
  const version = String(env.BROWSERBASE_PRICING_VERSION || '').trim();
  if (
    !Number.isSafeInteger(price) ||
    price <= 0 ||
    price > Number(config.pricing.maxAcceptedBrowserHourPriceMicroUsd || 10000000)
  ) {
    throw browserError('cloud_browser_pricing_invalid');
  }
  if (!version || version.length > 160) {
    throw browserError('cloud_browser_pricing_version_invalid');
  }
  if (!envTrue(env.ZUVYR_BROWSER_PRICING_VERIFIED)) {
    throw browserError('cloud_browser_pricing_unverified');
  }
  return Object.freeze({
    browserHourPriceMicroUsd: price,
    pricingVersion: version,
    checkedByOperator: true
  });
}

function costMicroUsdForSeconds(seconds, snapshot) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) throw browserError('cloud_browser_usage_seconds_invalid');
  const price = Number(snapshot?.browserHourPriceMicroUsd);
  if (!Number.isSafeInteger(price) || price <= 0) throw browserError('cloud_browser_pricing_invalid');
  return Math.ceil((Math.ceil(s) * price) / 3600);
}

function creditsForCostMicroUsd(costMicroUsd, {
  creditPriceUsd = CREDIT_PRICE_USD,
  targetGrossMarginBps = config.pricing.targetGrossMarginBps
} = {}) {
  const cost = Number(costMicroUsd);
  const creditPrice = Number(creditPriceUsd);
  const marginBps = Number(targetGrossMarginBps);
  if (!Number.isFinite(cost) || cost < 0) throw browserError('cloud_browser_cost_invalid');
  if (!Number.isFinite(creditPrice) || creditPrice <= 0) throw browserError('cloud_browser_credit_price_invalid');
  if (!Number.isInteger(marginBps) || marginBps < 0 || marginBps >= 10000) {
    throw browserError('cloud_browser_margin_invalid');
  }
  if (cost === 0) return 0;
  const revenueNeededUsd = (cost / 1000000) / (1 - marginBps / 10000);
  return Math.max(1, Math.ceil(revenueNeededUsd / creditPrice));
}

function quoteSession({ ttlSeconds, env = process.env } = {}) {
  const ttl = Number(ttlSeconds);
  if (!Number.isInteger(ttl) || ttl < 30 || ttl > config.session.maxTtlSeconds) {
    throw browserError('cloud_browser_ttl_invalid');
  }
  const snapshot = pricingSnapshot(env);
  const estimatedProviderCostMicroUsd = costMicroUsdForSeconds(ttl, snapshot);
  const reservedCredits = creditsForCostMicroUsd(estimatedProviderCostMicroUsd);
  return Object.freeze({
    ttlSeconds: ttl,
    pricingVersion: snapshot.pricingVersion,
    browserHourPriceMicroUsd: snapshot.browserHourPriceMicroUsd,
    estimatedProviderCostMicroUsd,
    reservedCredits,
    targetGrossMarginBps: config.pricing.targetGrossMarginBps
  });
}

function normalizeAllowedHosts(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > config.network.maxAllowedHosts) {
    throw browserError('cloud_browser_allowed_hosts_invalid');
  }
  const out = [];
  for (const value of values) {
    const raw = String(value || '').trim().toLowerCase().replace(/\.$/, '');
    if (!raw || raw === '*' || raw.length > 253 || !raw.includes('.')) {
      throw browserError('cloud_browser_allowed_host_invalid');
    }
    if (net.isIP(raw) !== 0) throw browserError('cloud_browser_private_network_blocked');
    if (
      raw === 'localhost' ||
      raw === 'metadata.google.internal' ||
      config.network.blockedHostSuffixes.some(suffix => raw.endsWith(suffix))
    ) {
      throw browserError('cloud_browser_private_network_blocked');
    }
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(raw)) {
      throw browserError('cloud_browser_allowed_host_invalid');
    }
    if (!out.includes(raw)) out.push(raw);
  }
  return Object.freeze(out.sort());
}

function hostAllowed(host, allowedHosts) {
  const normalized = String(host || '').trim().toLowerCase().replace(/\.$/, '');
  return Array.isArray(allowedHosts) && allowedHosts.includes(normalized);
}

function normalizePublicUrl(value, { allowedHosts = null } = {}) {
  let url;
  try { url = new URL(String(value || '')); }
  catch (_) { throw browserError('cloud_browser_url_invalid'); }
  if (!config.network.allowedSchemes.includes(url.protocol.replace(':',''))) {
    throw browserError('cloud_browser_url_scheme_blocked');
  }
  if (url.username || url.password) {
    throw browserError('cloud_browser_url_credentials_forbidden');
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
  if (allowedHosts !== null && !hostAllowed(host, allowedHosts)) {
    throw browserError('cloud_browser_host_not_allowed');
  }
  url.username = '';
  url.password = '';
  url.hash = '';
  return Object.freeze({
    url: url.toString(),
    host
  });
}

function sessionPolicies({allowedHosts}={}) {
  const hosts=normalizeAllowedHosts(allowedHosts);
  return Object.freeze({
    network:Object.freeze({
      mode:config.network.mode,
      allowedHosts:hosts,
      blockPrivateIpLiterals:config.network.blockPrivateIpLiterals,
      blockLocalhost:config.network.blockLocalhost,
      blockLinkLocal:config.network.blockLinkLocal,
      blockCloudMetadata:config.network.blockCloudMetadata,
      requireVerifiedProductionPrivateEgress:true
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
    conversationId:row.conversation_id || null,
    taskRunId:row.task_run_id || null,
    projectId:row.project_id || null,
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
    proxyBytes:Number(row.proxy_bytes || 0),
    billingState:row.billing_state || 'not_reserved',
    finalCredits:Number.isInteger(Number(row.final_credits)) ? Number(row.final_credits) : null,
    allowedHosts:Object.freeze(
      Array.isArray(row.network_policy?.allowedHosts)
        ? [...row.network_policy.allowedHosts]
        : []
    ),
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
  envTrue,
  isProductionEnvironment,
  availability,
  assertLiveAvailable,
  credentialAvailability,
  assertProviderCredentials,
  pricingSnapshot,
  costMicroUsdForSeconds,
  creditsForCostMicroUsd,
  quoteSession,
  normalizeAllowedHosts,
  hostAllowed,
  normalizePublicUrl,
  sessionPolicies,
  publicSession,
  sanitizeProviderError
};
