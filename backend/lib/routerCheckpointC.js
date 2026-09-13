'use strict';

const CONFIG = require('../config/router-checkpoint-c.v1.json');
const { routerHardFilters } = require('./routerHardFilters');
const { routerRanking } = require('./routerRanking');
const { marginGuard } = require('./routerDecisionLog');
const { createFallbackBillingScope } = require('./routerBillingAttempt');

function requiredFunction(value, code) {
  if (typeof value !== 'function') throw new Error(code);
  return value;
}

function createRouterCheckpointC(deps = {}) {
  const hardFilters = deps.hardFilters || routerHardFilters;
  const ranking = deps.ranking || routerRanking;
  const guardFn = deps.marginGuard || marginGuard;
  const createScope = deps.createFallbackBillingScope || createFallbackBillingScope;

  async function execute({
    chain,
    feature = 'chat',
    capability = 'chat',
    rankingMode = 'smart',
    messages = [],
    invoke,
    env = process.env,
    minimumGrossMarginBps = 5000,
    quotedGrossMarginBps = 7000,
    requestId = null
  } = {}) {
    if (!Array.isArray(chain) || chain.length === 0) {
      throw new Error('checkpoint_chain_required');
    }

    const callProvider = requiredFunction(invoke, 'checkpoint_invoke_required');

    const filtered = hardFilters.filterLegacyChain({
      chain,
      feature,
      capability,
      inputModality: 'text',
      outputModality: 'text',
      language: null,
      minimumContextTokens: null,
      region: null,
      entitlementAllowed: true,
      permissionAllowed: true,
      minimumGrossMarginBps,
      quotedGrossMarginBps,
      env
    });

    if (!filtered.routes.length) {
      const error = new Error('checkpoint_no_eligible_routes');
      error.filtered = filtered.filtered;
      throw error;
    }

    const ranked = ranking.rankEligibleRoutes({
      eligibleRoutes: filtered.routes,
      mode: rankingMode,
      capability,
      inputModality: 'text',
      outputModality: 'text',
      language: null,
      minimumContextTokens: null,
      loadLevel: 'normal',
      minimumGrossMarginBps,
      quotedGrossMarginBps,
      env
    });

    const guard = guardFn({ quotedGrossMarginBps, minimumGrossMarginBps });
    if (!guard.allowed) throw new Error('checkpoint_margin_guard_blocked');

    const scope = createScope({ requestId, routes: ranked.routes });
    const attempts = [];

    for (const route of ranked.routes) {
      const attempt = scope.beginAttempt(route);
      const startedAt = Date.now();

      try {
        const result = await callProvider(route, messages);
        const completion = scope.completeAttempt(attempt.attemptId, 'SUCCESS');

        if (!completion.accepted) {
          attempts.push({
            provider: route.provider,
            model: route.model,
            status: 'late_success_ignored',
            latencyMs: Date.now() - startedAt
          });
          continue;
        }

        attempts.push({
          provider: route.provider,
          model: route.model,
          status: 'success',
          latencyMs: Date.now() - startedAt
        });

        return Object.freeze({
          version: CONFIG.version,
          provider: route.provider,
          model: route.model,
          success: true,
          attempts: Object.freeze(attempts),
          billingScope: scope.snapshot(),
          result
        });
      } catch (error) {
        scope.completeAttempt(
          attempt.attemptId,
          error && error.name === 'AbortError' ? 'TIMEOUT' : 'ERROR'
        );
        attempts.push({
          provider: route.provider,
          model: route.model,
          status: 'error',
          code: error?.code || error?.name || 'ERROR',
          latencyMs: Date.now() - startedAt
        });
      }
    }

    const error = new Error('checkpoint_routes_exhausted');
    error.attempts = attempts;
    error.billingScope = scope.snapshot();
    throw error;
  }

  return Object.freeze({ version: CONFIG.version, execute });
}

const routerCheckpointC = createRouterCheckpointC();

module.exports = {
  createRouterCheckpointC,
  routerCheckpointC
};
