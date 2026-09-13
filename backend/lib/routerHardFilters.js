'use strict';

const CONFIG = require('../config/router-hard-filters.v1.json');
const {
  listRouterCandidates,
  getModelSnapshot
} = require('./modelRegistry');
const { providerSnapshot } = require('./providerRegistry');
const {
  providerHealthQuotaState,
  HEALTH_STATES,
  QUOTA_STATES
} = require('./providerHealthQuotaState');
const { costTier } = require('./modelCosts');

const REASONS = Object.freeze({
  ENTITLEMENT_DENIED: 'ENTITLEMENT_DENIED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  REGISTRY_INELIGIBLE_OR_UNKNOWN_COST: 'REGISTRY_INELIGIBLE_OR_UNKNOWN_COST',
  REGION_UNVERIFIED: 'REGION_UNVERIFIED',
  PROVIDER_HEALTH_OPEN: 'PROVIDER_HEALTH_OPEN',
  PROVIDER_QUOTA_EXHAUSTED: 'PROVIDER_QUOTA_EXHAUSTED',
  VERIFIED_COST_REQUIRED: 'VERIFIED_COST_REQUIRED',
  MARGIN_FLOOR_UNKNOWN: 'MARGIN_FLOOR_UNKNOWN',
  MARGIN_FLOOR: 'MARGIN_FLOOR'
});

function optionalText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function integerOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function routeKey(providerId, modelId) {
  return `${String(providerId || '').trim()}::${String(modelId || '').trim()}`;
}

function normalizeBoolean(value) {
  return value === true;
}

function regionAllowed(provider, region) {
  const requested = optionalText(region);
  if (!requested) return true;
  const regions = Array.isArray(provider?.regions)
    ? provider.regions.map(value => String(value).trim()).filter(Boolean)
    : [];
  return regions.includes('*') || regions.includes(requested);
}

function capabilityHasVerifiedCost(candidate, capability) {
  return Boolean(
    candidate &&
    Array.isArray(candidate.capabilityStates) &&
    candidate.capabilityStates.some(item =>
      item.capability === capability &&
      item.providerCostEligible === true
    )
  );
}

function createRouterHardFilters(deps = {}) {
  const listCandidates = deps.listCandidates || listRouterCandidates;
  const modelSnapshot = deps.modelSnapshot || getModelSnapshot;
  const providerSnapshotFn = deps.providerSnapshot || providerSnapshot;
  const healthState = deps.healthState || providerHealthQuotaState;
  const costTierFn = deps.costTier || costTier;

  function evaluateCandidate({
    route,
    candidate,
    capability,
    entitlementAllowed,
    permissionAllowed,
    region,
    minimumGrossMarginBps,
    quotedGrossMarginBps,
    env = process.env
  } = {}) {
    const reasons = [];

    if (!normalizeBoolean(entitlementAllowed)) {
      reasons.push(REASONS.ENTITLEMENT_DENIED);
    }
    if (!normalizeBoolean(permissionAllowed)) {
      reasons.push(REASONS.PERMISSION_DENIED);
    }
    if (!candidate || candidate.validBaseCandidate !== true) {
      reasons.push(REASONS.REGISTRY_INELIGIBLE_OR_UNKNOWN_COST);
    }

    const provider = candidate
      ? providerSnapshotFn(candidate.providerId, env)
      : null;

    if (candidate && !regionAllowed(provider, region)) {
      reasons.push(REASONS.REGION_UNVERIFIED);
    }

    if (candidate) {
      const runtime = healthState.getSnapshot(candidate.providerId);
      if (runtime.health.state === HEALTH_STATES.OPEN) {
        reasons.push(REASONS.PROVIDER_HEALTH_OPEN);
      }
      if (runtime.quota.state === QUOTA_STATES.EXHAUSTED) {
        reasons.push(REASONS.PROVIDER_QUOTA_EXHAUSTED);
      }
    }

    if (
      candidate &&
      !capabilityHasVerifiedCost(candidate, capability)
    ) {
      reasons.push(REASONS.VERIFIED_COST_REQUIRED);
    }

    if (candidate && route) {
      let finiteCost = false;
      try {
        const value = Number(
          costTierFn(route.model, { provider: route.provider })
        );
        finiteCost = Number.isFinite(value) && value >= 0;
      } catch (_) {
        finiteCost = false;
      }
      if (!finiteCost) reasons.push(REASONS.VERIFIED_COST_REQUIRED);
    }

    const floor = integerOrNull(minimumGrossMarginBps);
    const quoted = integerOrNull(quotedGrossMarginBps);
    if (floor == null || floor < 0 || quoted == null) {
      reasons.push(REASONS.MARGIN_FLOOR_UNKNOWN);
    } else if (quoted < floor) {
      reasons.push(REASONS.MARGIN_FLOOR);
    }

    return Object.freeze({
      allowed: reasons.length === 0,
      reasons: Object.freeze([...new Set(reasons)]),
      candidateId: candidate?.id || null,
      providerId: route?.provider || candidate?.providerId || null,
      modelId: route?.model || candidate?.modelId || null,
      capability: capability || null
    });
  }

  function filterLegacyChain({
    capability,
    chain,
    inputModality = null,
    outputModality = null,
    language = null,
    minimumContextTokens = null,
    region = null,
    entitlementAllowed,
    permissionAllowed,
    minimumGrossMarginBps = CONFIG.margin.defaultMinimumGrossMarginBps,
    quotedGrossMarginBps = null,
    env = process.env
  } = {}) {
    const requestedCapability = optionalText(capability);
    if (!requestedCapability) {
      throw new Error('router_hard_filter_capability_required');
    }
    if (!Array.isArray(chain)) {
      throw new Error('router_hard_filter_chain_required');
    }

    const candidates = listCandidates({
      capability: requestedCapability,
      inputModality,
      outputModality,
      language,
      minimumContextTokens
    }, env);

    const byRoute = new Map(
      candidates.map(candidate => [
        routeKey(candidate.providerId, candidate.modelId),
        candidate
      ])
    );

    const routes = [];
    const filtered = [];

    for (const route of chain) {
      const candidate = byRoute.get(routeKey(route?.provider, route?.model)) || null;
      const decision = evaluateCandidate({
        route,
        candidate,
        capability: requestedCapability,
        entitlementAllowed,
        permissionAllowed,
        region,
        minimumGrossMarginBps,
        quotedGrossMarginBps,
        env
      });

      if (decision.allowed) {
        routes.push(Object.freeze({ ...route }));
      } else {
        filtered.push(Object.freeze({
          route: Object.freeze({ ...route }),
          decision
        }));
      }
    }

    return Object.freeze({
      version: CONFIG.version,
      routes: Object.freeze(routes),
      filtered: Object.freeze(filtered),
      candidateCount: candidates.length,
      fallbackCannotBypassFilters: true
    });
  }

  function filterRegistryCandidates({
    capability,
    inputModality = null,
    outputModality = null,
    language = null,
    minimumContextTokens = null,
    region = null,
    entitlementAllowed,
    permissionAllowed,
    minimumGrossMarginBps = CONFIG.margin.defaultMinimumGrossMarginBps,
    quotedGrossMarginBps = null,
    env = process.env
  } = {}) {
    const candidates = listCandidates({
      capability,
      inputModality,
      outputModality,
      language,
      minimumContextTokens
    }, env);

    const allowed = [];
    const filtered = [];

    for (const candidate of candidates) {
      const route = {
        provider: candidate.providerId,
        model: candidate.modelId
      };
      const decision = evaluateCandidate({
        route,
        candidate,
        capability,
        entitlementAllowed,
        permissionAllowed,
        region,
        minimumGrossMarginBps,
        quotedGrossMarginBps,
        env
      });
      if (decision.allowed) allowed.push(candidate);
      else filtered.push(Object.freeze({ candidate, decision }));
    }

    return Object.freeze({
      version: CONFIG.version,
      candidates: Object.freeze(allowed),
      filtered: Object.freeze(filtered),
      fallbackCannotBypassFilters: true
    });
  }

  function inspectModel(id, env = process.env) {
    return modelSnapshot(id, env);
  }

  return Object.freeze({
    version: CONFIG.version,
    evaluateCandidate,
    filterLegacyChain,
    filterRegistryCandidates,
    inspectModel
  });
}

const routerHardFilters = createRouterHardFilters();

module.exports = {
  REASONS,
  createRouterHardFilters,
  routerHardFilters
};
