'use strict';

const config = require('../config/model-registry.v1.json');
const { providerSnapshot } = require('./providerRegistry');

const COMMERCIAL_ALLOWED = new Set(['verified_for_launch']);
const DEPRECATION_ALLOWED = new Set(['active']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function optionalText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function resolvedModelId(entry, env = process.env) {
  if (entry.modelId) return entry.modelId;
  if (entry.modelIdEnvironment) {
    return optionalText(env[entry.modelIdEnvironment]);
  }
  return null;
}

function capabilityCostEligible(provider, capability) {
  if (!provider) return false;
  return provider.capabilities.some(item =>
    item.id === capability &&
    item.capabilityVerified === true &&
    item.costSourceVerified === true &&
    item.eligible === true
  );
}

function commercialEligible(entry) {
  return Boolean(
    entry &&
    entry.commercialEligibility &&
    COMMERCIAL_ALLOWED.has(entry.commercialEligibility.state)
  );
}

function deprecationEligible(entry) {
  return Boolean(
    entry &&
    entry.deprecation &&
    DEPRECATION_ALLOWED.has(entry.deprecation.state)
  );
}

function explicitLanguageEligible(entry, language) {
  const requested = optionalText(language);
  if (!requested || requested === 'auto') return true;
  if (entry.languageVerification !== 'verified') return false;
  return Array.isArray(entry.languages) &&
    (entry.languages.includes('*') || entry.languages.includes(requested));
}

function contextEligible(entry, minimumContextTokens) {
  if (minimumContextTokens == null) return true;
  const n = Number(minimumContextTokens);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error('invalid_minimum_context_tokens');
  }
  if (n === 0) return true;
  const max = entry && entry.context ? entry.context.maxTokens : null;
  return Number.isSafeInteger(max) && max >= n;
}

function modalityEligible(entry, inputModality, outputModality) {
  const input = optionalText(inputModality);
  const output = optionalText(outputModality);
  if (input && !entry.modalities.input.includes(input)) return false;
  if (output && !entry.modalities.output.includes(output)) return false;
  return true;
}

function modelSnapshot(entry, env = process.env) {
  const provider = providerSnapshot(entry.providerId, env);
  const modelId = resolvedModelId(entry, env);
  const capabilityStates = entry.capabilities.map(capability => ({
    capability,
    providerCostEligible: capabilityCostEligible(provider, capability)
  }));
  const providerEnabled = Boolean(provider && provider.enabled);
  const priceEligible = capabilityStates.some(item => item.providerCostEligible);
  const validBaseCandidate =
    providerEnabled &&
    Boolean(modelId) &&
    commercialEligible(entry) &&
    deprecationEligible(entry) &&
    priceEligible;

  return Object.freeze({
    id: entry.id,
    providerId: entry.providerId,
    modelId,
    kind: entry.kind,
    capabilities: [...entry.capabilities],
    modalities: clone(entry.modalities),
    context: clone(entry.context),
    languages: [...entry.languages],
    languageVerification: entry.languageVerification,
    qualityTier: entry.qualityTier,
    latencyClass: entry.latencyClass,
    commercialEligibility: clone(entry.commercialEligibility),
    priceReference: clone(entry.priceReference),
    deprecation: clone(entry.deprecation),
    providerEnabled,
    capabilityStates,
    validBaseCandidate
  });
}

function listModelSnapshots(env = process.env) {
  return Object.freeze(config.models.map(entry => modelSnapshot(entry, env)));
}

function listRouterCandidates({
  capability,
  inputModality = null,
  outputModality = null,
  language = null,
  minimumContextTokens = null
} = {}, env = process.env) {
  const requestedCapability = optionalText(capability);
  if (!requestedCapability) {
    throw new Error('model_registry_capability_required');
  }

  return Object.freeze(
    config.models
      .filter(entry => entry.capabilities.includes(requestedCapability))
      .filter(entry => modalityEligible(entry, inputModality, outputModality))
      .filter(entry => explicitLanguageEligible(entry, language))
      .filter(entry => contextEligible(entry, minimumContextTokens))
      .map(entry => modelSnapshot(entry, env))
      .filter(snapshot =>
        snapshot.validBaseCandidate &&
        snapshot.capabilityStates.some(item =>
          item.capability === requestedCapability &&
          item.providerCostEligible === true
        )
      )
  );
}

function getModelSnapshot(id, env = process.env) {
  const key = optionalText(id);
  if (!key) return null;
  const entry = config.models.find(item => item.id === key);
  return entry ? modelSnapshot(entry, env) : null;
}

function assertModelRegistryInvariant(env = process.env) {
  const ids = new Set();
  for (const entry of config.models) {
    if (!entry.id || ids.has(entry.id)) {
      throw new Error(`duplicate_or_missing_model_id:${entry.id || 'missing'}`);
    }
    ids.add(entry.id);
    if (!entry.providerId) throw new Error(`provider_id_missing:${entry.id}`);
    if (!Array.isArray(entry.capabilities) || entry.capabilities.length === 0) {
      throw new Error(`capabilities_missing:${entry.id}`);
    }
    if (!entry.modalities || !Array.isArray(entry.modalities.input) || !Array.isArray(entry.modalities.output)) {
      throw new Error(`modalities_missing:${entry.id}`);
    }
    if (!entry.context || !Object.prototype.hasOwnProperty.call(entry.context, 'maxTokens')) {
      throw new Error(`context_missing:${entry.id}`);
    }
    if (!Array.isArray(entry.languages) || entry.languages.length === 0) {
      throw new Error(`languages_missing:${entry.id}`);
    }
    if (!entry.qualityTier || !entry.latencyClass) {
      throw new Error(`quality_or_latency_missing:${entry.id}`);
    }
    if (!entry.commercialEligibility || !entry.priceReference || !entry.deprecation) {
      throw new Error(`eligibility_price_or_deprecation_missing:${entry.id}`);
    }
  }

  for (const snapshot of listModelSnapshots(env)) {
    if (snapshot.validBaseCandidate) {
      if (!snapshot.providerEnabled) throw new Error(`valid_model_provider_disabled:${snapshot.id}`);
      if (!snapshot.modelId) throw new Error(`valid_model_identity_missing:${snapshot.id}`);
      if (!COMMERCIAL_ALLOWED.has(snapshot.commercialEligibility.state)) {
        throw new Error(`valid_model_commercial_unverified:${snapshot.id}`);
      }
      if (!snapshot.capabilityStates.some(item => item.providerCostEligible)) {
        throw new Error(`valid_model_cost_unverified:${snapshot.id}`);
      }
    }
  }
  return true;
}

module.exports = {
  registryVersion: config.version,
  listModelSnapshots,
  listRouterCandidates,
  getModelSnapshot,
  assertModelRegistryInvariant
};
