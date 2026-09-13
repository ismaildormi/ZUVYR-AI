'use strict';

const fs = require('node:fs');
const path = require('node:path');
const registry = require('../config/provider-registry.v1.json');
const {
  PREFLIGHT_STATES,
  providerHealthPreflight
} = require('./providerHealthAdapter');

const COST_REGISTRY_PATH = path.resolve(__dirname, '../config/cost-registry.v1.json');

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveDecimal(value) {
  const text = String(value || '').trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return false;
  const n = Number(text);
  return Number.isFinite(n) && n > 0;
}

function launchSet(env = process.env) {
  return new Set(
    String(env[registry.launchAuthorizationEnvironment] || '')
      .split(',')
      .map(v => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

function credentialPresent(provider, env = process.env) {
  const keys = Array.isArray(provider.credentialEnvironment)
    ? provider.credentialEnvironment
    : [];
  const connection = Array.isArray(provider.connectionEnvironment)
    ? provider.connectionEnvironment
    : [];
  if (keys.length) return keys.some(key => present(env[key]));
  if (connection.length) return connection.every(key => present(env[key]));
  return false;
}

function costRegistryObjects() {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(COST_REGISTRY_PATH, 'utf8'));
  } catch {
    return [];
  }
  const out = [];
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value)) out.push(value);
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      if (child && typeof child === 'object') walk(child);
    }
  };
  walk(parsed);
  return out;
}

function acceptedVerification(value) {
  return ['verified', 'conditional_repository_verified'].includes(
    String(value || '').trim().toLowerCase()
  );
}

function registryProviderMatch(providerId, capabilityId) {
  const provider = String(providerId || '').toLowerCase();
  const capability = String(capabilityId || '').toLowerCase();
  return costRegistryObjects().some(entry => {
    const candidate = String(
      entry.provider || entry.providerId || entry.provider_id || entry.vendor || ''
    ).toLowerCase();
    if (candidate !== provider) return false;
    const status =
      entry.verificationStatus ||
      entry.verification ||
      entry.status;
    if (!acceptedVerification(status)) return false;
    if (String(entry.pricingSource || '').toLowerCase() === 'unverified') return false;
    const haystack = JSON.stringify(entry).toLowerCase();
    const capabilityTokens = capability.split(/[._:-]+/).filter(Boolean);
    return capabilityTokens.length === 0 || capabilityTokens.some(token => haystack.includes(token));
  });
}

function costSourceVerified(providerId, capability, env = process.env) {
  const cost = capability && capability.cost ? capability.cost : {};
  switch (cost.mode) {
    case 'groq_verified_catalog': {
      const evidence = path.resolve(__dirname, '../config/groq-text-pricing.verified.v1.json');
      return fs.existsSync(COST_REGISTRY_PATH) &&
        fs.existsSync(evidence) &&
        truthy(env.ZUVYR_GROQ_FREE_TIER_CONFIRMED);
    }
    case 'compat_environment_cost': {
      const required = Array.isArray(cost.requiredEnvironment)
        ? cost.requiredEnvironment
        : [];
      return fs.existsSync(COST_REGISTRY_PATH) &&
        required.length > 0 &&
        required.every(key => positiveDecimal(env[key]));
    }
    case 'registry_verified_entry':
      return fs.existsSync(COST_REGISTRY_PATH) &&
        registryProviderMatch(providerId, capability.id);
    default:
      return false;
  }
}

function capabilitySnapshot(providerId, capability, env = process.env) {
  const capabilityVerified = capability.verification === 'verified_repository';
  const costVerified = costSourceVerified(providerId, capability, env);
  return Object.freeze({
    id: capability.id,
    capabilityVerified,
    costSourceVerified: costVerified,
    eligible: capabilityVerified && costVerified,
    costAuthority: capability.cost && capability.cost.authority
      ? capability.cost.authority
      : registry.costAuthority
  });
}

function providerSnapshot(providerId, env = process.env) {
  const provider = registry.providers[providerId];
  if (!provider) return null;

  const authorized = launchSet(env).has(providerId.toLowerCase());
  const hasCredential = credentialPresent(provider, env);
  const capabilities = provider.capabilities.map(cap =>
    capabilitySnapshot(providerId, cap, env)
  );
  const eligibleCapabilities = capabilities.filter(cap => cap.eligible);
  const hasEligibleCapability = eligibleCapabilities.length > 0;
  const hasVerifiedCost = eligibleCapabilities.some(cap => cap.costSourceVerified);
  const health = providerHealthPreflight({
    launchAuthorized: authorized,
    credentialPresent: hasCredential,
    hasEligibleCapability,
    hasVerifiedCost
  });
  const enabled = health.state === PREFLIGHT_STATES.PREFLIGHT_READY;

  return Object.freeze({
    id: providerId,
    enabled,
    credentialPresent: hasCredential,
    credentialEnvironmentNames: [...(provider.credentialEnvironment || [])],
    connectionEnvironmentNames: [...(provider.connectionEnvironment || [])],
    regions: [...provider.regions],
    quotaType: provider.quotaType,
    termsLicenseNotes: provider.termsLicenseNotes,
    adapter: provider.adapter,
    launchAuthorized: authorized,
    capabilities,
    health,
    costRegistryAuthority: registry.costAuthority,
    externalGate: registry.externalGate
  });
}

function listProviderSnapshots(env = process.env) {
  return Object.freeze(
    Object.keys(registry.providers).map(id => providerSnapshot(id, env))
  );
}

function listEnabledProviders(env = process.env) {
  return Object.freeze(
    listProviderSnapshots(env).filter(provider => provider.enabled)
  );
}

function assertRegistryInvariant(env = process.env) {
  const snapshots = listProviderSnapshots(env);
  for (const provider of snapshots) {
    if (provider.enabled) {
      if (!provider.credentialPresent) {
        throw new Error(`enabled_provider_missing_credential:${provider.id}`);
      }
      if (!provider.capabilities.some(cap => cap.eligible)) {
        throw new Error(`enabled_provider_missing_verified_capability_cost:${provider.id}`);
      }
    } else if (provider.health.state === PREFLIGHT_STATES.PREFLIGHT_READY) {
      throw new Error(`blocked_provider_marked_ready:${provider.id}`);
    }
  }
  return true;
}

module.exports = {
  registryVersion: registry.version,
  externalGate: registry.externalGate,
  providerSnapshot,
  listProviderSnapshots,
  listEnabledProviders,
  assertRegistryInvariant,
  credentialPresent,
  costSourceVerified
};
