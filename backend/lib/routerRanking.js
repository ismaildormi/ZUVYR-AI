'use strict';

const CONFIG = require('../config/router-ranking.v1.json');
const { listRouterCandidates } = require('./modelRegistry');
const { providerSnapshot } = require('./providerRegistry');
const {
  providerHealthQuotaState
} = require('./providerHealthQuotaState');

const DIMENSIONS = Object.freeze([
  'quality',
  'reliability',
  'latency',
  'margin',
  'context',
  'language',
  'privacy'
]);

const MODE_PRIMARY = Object.freeze({
  SMART_BEST_VALUE: 'margin',
  ECONOMY: 'margin',
  FAST: 'latency',
  MAX_QUALITY: 'quality'
});

function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function optionalText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function routeKey(providerId, modelId) {
  return `${String(providerId || '').trim()}::${String(modelId || '').trim()}`;
}

function routeScoreOverride(map, route) {
  if (!map || typeof map !== 'object') return null;
  const key = routeKey(route?.provider, route?.model);
  const value = map[key];
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function normalizeMode(value) {
  const input = optionalText(value)?.toLowerCase() || 'smart';
  for (const [mode, spec] of Object.entries(CONFIG.modes)) {
    if (mode.toLowerCase() === input) return mode;
    if ((spec.aliases || []).some(alias => String(alias).toLowerCase() === input)) {
      return mode;
    }
  }
  throw new Error(`router_ranking_mode_invalid:${input}`);
}

function scoreTier(value, table, fallback = 50) {
  if (Number.isFinite(Number(value))) {
    const number = Number(value);
    if (number >= 0 && number <= 1) return clamp(number * 100);
    if (number >= 1 && number <= 5) return clamp(number * 20);
    return clamp(number);
  }
  const key = optionalText(value)?.toLowerCase().replace(/\s+/g, '_');
  if (!key) return fallback;
  return table[key] ?? table.unknown ?? fallback;
}

function qualityScore(candidate) {
  return scoreTier(candidate?.qualityTier, CONFIG.qualityTierScores, 50);
}

function latencyScore(candidate) {
  return scoreTier(candidate?.latencyClass, CONFIG.latencyClassScores, 50);
}

function reliabilityScore(providerId, healthState) {
  const snapshot = healthState.getSnapshot(providerId);
  const health = CONFIG.reliability.health[snapshot?.health?.state] ?? 50;
  const quota = CONFIG.reliability.quota[snapshot?.quota?.state] ?? 50;
  const hw = CONFIG.reliability.healthWeight;
  const qw = CONFIG.reliability.quotaWeight;
  return clamp((health * hw + quota * qw) / (hw + qw));
}

function contextCapacity(candidate) {
  const value = candidate?.context;
  if (Number.isFinite(Number(value))) return Number(value);
  if (!value || typeof value !== 'object') return null;

  for (const key of [
    'maxTokens',
    'max_tokens',
    'contextWindow',
    'context_window',
    'tokens',
    'inputTokens',
    'input_tokens',
    'maxInputTokens',
    'max_input_tokens'
  ]) {
    if (Number.isFinite(Number(value[key]))) return Number(value[key]);
  }
  return null;
}

function contextScore(candidate, minimumContextTokens, maxContextInSet) {
  const capacity = contextCapacity(candidate);
  const minimum = Number(minimumContextTokens);

  if (Number.isFinite(minimum) && minimum > 0) {
    if (!Number.isFinite(capacity) || capacity < minimum) return 0;
    const headroomRatio = capacity / minimum;
    return clamp(60 + Math.min(40, (headroomRatio - 1) * 40));
  }

  if (!Number.isFinite(capacity)) {
    return CONFIG.neutralScores.contextWhenUnknownAndUnrequired;
  }
  if (!Number.isFinite(maxContextInSet) || maxContextInSet <= 0) return 70;
  return clamp(50 + 50 * (capacity / maxContextInSet));
}

function candidateLanguages(candidate) {
  const raw = candidate?.languages;
  if (Array.isArray(raw)) {
    return raw.map(value => String(value).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw.split(/[\s,;|]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

function languageScore(candidate, language) {
  const requested = optionalText(language)?.toLowerCase();
  if (!requested) return CONFIG.neutralScores.languageWhenUnspecified;

  const languages = candidateLanguages(candidate);
  if (languages.includes(requested)) return 100;
  const base = requested.split(/[-_]/)[0];
  if (languages.includes(base)) return 95;
  if (languages.includes('*') || languages.includes('multilingual') || languages.includes('all')) return 85;

  const verification = optionalText(candidate?.languageVerification)?.toLowerCase();
  if (verification === 'verified' || verification === 'provider_verified') return 75;

  // Pack026 should already have removed explicitly unsupported candidates.
  // Neutral-low here avoids inventing support while still ranking only its eligible set.
  return 50;
}

function marginScore(route, options) {
  const explicit = routeScoreOverride(options.marginBpsByRoute, route);
  const fallback = Number.isFinite(Number(options.quotedGrossMarginBps))
    ? Number(options.quotedGrossMarginBps)
    : null;
  const marginBps = explicit ?? fallback;

  if (!Number.isFinite(marginBps)) return CONFIG.neutralScores.margin;

  const floor = Number.isFinite(Number(options.minimumGrossMarginBps))
    ? Number(options.minimumGrossMarginBps)
    : CONFIG.margin.minimumGrossMarginBpsDefault;

  if (marginBps <= floor) {
    return marginBps < floor ? 0 : CONFIG.margin.scoreAtFloor;
  }

  const above = marginBps - floor;
  const span = CONFIG.margin.bpsForMaxScoreAboveFloor;
  return clamp(CONFIG.margin.scoreAtFloor + 50 * (above / span));
}

function privacyScore(route, candidate, provider, options) {
  const override = routeScoreOverride(options.privacyScoreByRoute, route);
  if (override != null) return clamp(override);

  for (const value of [
    candidate?.privacyScore,
    candidate?.privacy?.score,
    provider?.privacyScore,
    provider?.privacy?.score
  ]) {
    if (Number.isFinite(Number(value))) return clamp(value);
  }

  return CONFIG.neutralScores.privacy;
}

function adjustedWeights(mode, loadLevel) {
  const base = CONFIG.modes[mode]?.weights;
  if (!base) throw new Error(`router_ranking_mode_config_missing:${mode}`);

  const level = optionalText(loadLevel)?.toLowerCase() || 'normal';
  const adjustments = CONFIG.loadAdjustments[level] || CONFIG.loadAdjustments.normal || {};

  const raw = {};
  let total = 0;
  for (const dimension of DIMENSIONS) {
    const multiplier = Number.isFinite(Number(adjustments[dimension]))
      ? Number(adjustments[dimension])
      : 1;
    raw[dimension] = Number(base[dimension] || 0) * multiplier;
    total += raw[dimension];
  }
  if (!(total > 0)) throw new Error('router_ranking_weights_invalid');

  return Object.freeze(
    Object.fromEntries(
      DIMENSIONS.map(dimension => [
        dimension,
        raw[dimension] / total
      ])
    )
  );
}

function createRouterRanking(deps = {}) {
  const listCandidates = deps.listCandidates || listRouterCandidates;
  const providerSnapshotFn = deps.providerSnapshot || providerSnapshot;
  const healthState = deps.healthState || providerHealthQuotaState;

  function rankEligibleRoutes({
    eligibleRoutes,
    mode = 'smart',
    capability,
    inputModality = null,
    outputModality = null,
    language = null,
    minimumContextTokens = null,
    loadLevel = 'normal',
    minimumGrossMarginBps = CONFIG.margin.minimumGrossMarginBpsDefault,
    quotedGrossMarginBps = null,
    marginBpsByRoute = null,
    privacyScoreByRoute = null,
    env = process.env
  } = {}) {
    if (!Array.isArray(eligibleRoutes)) {
      throw new Error('router_ranking_eligible_routes_required');
    }

    const requestedCapability = optionalText(capability);
    if (!requestedCapability) {
      throw new Error('router_ranking_capability_required');
    }

    const normalizedMode = normalizeMode(mode);
    const weights = adjustedWeights(normalizedMode, loadLevel);

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

    const contexts = candidates
      .map(contextCapacity)
      .filter(value => Number.isFinite(value) && value > 0);
    const maxContextInSet = contexts.length ? Math.max(...contexts) : null;

    const ranked = eligibleRoutes.map((route, originalIndex) => {
      const key = routeKey(route?.provider, route?.model);
      const candidate = byRoute.get(key);
      if (!candidate || candidate.validBaseCandidate !== true) {
        throw new Error(`router_ranking_received_ineligible_route:${key}`);
      }

      const provider = providerSnapshotFn(candidate.providerId, env);

      const breakdown = Object.freeze({
        quality: qualityScore(candidate),
        reliability: reliabilityScore(candidate.providerId, healthState),
        latency: latencyScore(candidate),
        margin: marginScore(route, {
          minimumGrossMarginBps,
          quotedGrossMarginBps,
          marginBpsByRoute
        }),
        context: contextScore(candidate, minimumContextTokens, maxContextInSet),
        language: languageScore(candidate, language),
        privacy: privacyScore(route, candidate, provider, { privacyScoreByRoute })
      });

      let total = 0;
      for (const dimension of DIMENSIONS) {
        total += breakdown[dimension] * weights[dimension];
      }

      return Object.freeze({
        route: Object.freeze({ ...route }),
        candidateId: candidate.id,
        originalIndex,
        score: Math.round(total * 1000) / 1000,
        breakdown
      });
    });

    const primary = MODE_PRIMARY[normalizedMode];
    const sorted = [...ranked].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.breakdown.reliability !== a.breakdown.reliability) {
        return b.breakdown.reliability - a.breakdown.reliability;
      }
      if (b.breakdown[primary] !== a.breakdown[primary]) {
        return b.breakdown[primary] - a.breakdown[primary];
      }
      if (a.originalIndex !== b.originalIndex) {
        return a.originalIndex - b.originalIndex;
      }
      return routeKey(a.route.provider, a.route.model)
        .localeCompare(routeKey(b.route.provider, b.route.model));
    });

    const originalKeys = eligibleRoutes.map(route => routeKey(route.provider, route.model));
    const rankedKeys = sorted.map(item => routeKey(item.route.provider, item.route.model));

    if (
      originalKeys.length !== rankedKeys.length ||
      [...originalKeys].sort().join('|') !== [...rankedKeys].sort().join('|')
    ) {
      throw new Error('router_ranking_candidate_set_changed');
    }

    return Object.freeze({
      version: CONFIG.version,
      mode: normalizedMode,
      loadLevel: optionalText(loadLevel)?.toLowerCase() || 'normal',
      routes: Object.freeze(sorted.map(item => item.route)),
      ranked: Object.freeze(sorted),
      candidateSetPreserved: true,
      rankingChanged: originalKeys.join('|') !== rankedKeys.join('|'),
      weights
    });
  }

  return Object.freeze({
    version: CONFIG.version,
    normalizeMode,
    rankEligibleRoutes
  });
}

const routerRanking = createRouterRanking();

module.exports = {
  DIMENSIONS,
  normalizeMode,
  createRouterRanking,
  routerRanking
};
