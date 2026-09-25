'use strict';

const { connection } = require('./queue');
const { plans } = require('../src/core/config');

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = plans.rateLimitsPerMinute;

function dependencyUnavailable(res) {
  res.setHeader('Retry-After', '5');
  return res.status(503).json({
    status: 'error',
    code: 'rate_limit_dependency_unavailable',
    message: 'Request protection is temporarily unavailable. Please retry shortly.'
  });
}

function rateLimit(kind) {
  const configured = Number(MAX_REQUESTS[kind]);
  const limit = Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : 10;

  return async function rateLimitMiddleware(req, res, next) {
    if (!req.userId) {
      return res.status(500).json({
        status: 'error',
        code: 'rate_limit_auth_order_invalid',
        message: 'Rate limit requires authenticated identity.'
      });
    }

    try {
      const key = `ratelimit:${kind}:${req.userId}`;
      const current = await connection.incr(key);
      if (current === 1) {
        await connection.expire(key, WINDOW_SECONDS);
      }

      if (current > limit) {
        const ttl = await connection.ttl(key);
        const retryAfter = ttl > 0 ? ttl : WINDOW_SECONDS;
        res.setHeader('Retry-After', retryAfter);
        return res.status(429).json({
          status: 'error',
          code: 'rate_limit_exceeded',
          message: 'Trop de requêtes — réessayez dans un instant.',
          retry_after_seconds: retryAfter
        });
      }

      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - current));
      return next();
    } catch (error) {
      console.error('[rate-limit] dependency unavailable', String(error?.code || error?.name || 'unknown'));
      return dependencyUnavailable(res);
    }
  };
}

module.exports = { rateLimit };
