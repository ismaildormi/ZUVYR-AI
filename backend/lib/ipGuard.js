'use strict';

const { connection } = require('./queue');

const WINDOW_SECONDS = 60;

function boundedPositiveInt(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

const IP_RATE_LIMIT_RPM = boundedPositiveInt(process.env.IP_RATE_LIMIT_RPM, 120, 100000);
const AUTH_FAIL_THRESHOLD = boundedPositiveInt(process.env.AUTH_FAIL_BLOCK_THRESHOLD, 20, 10000);
const AUTH_FAIL_WINDOW_SECONDS = boundedPositiveInt(process.env.AUTH_FAIL_BLOCK_WINDOW_MIN, 10, 1440) * 60;
const AUTH_FAIL_COOLDOWN_SECONDS = boundedPositiveInt(process.env.AUTH_FAIL_BLOCK_COOLDOWN_MIN, 30, 10080) * 60;

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function dependencyUnavailable(res) {
  res.setHeader('Retry-After', '5');
  return res.status(503).json({
    status: 'error',
    code: 'ip_guard_dependency_unavailable',
    message: 'Request protection is temporarily unavailable. Please retry shortly.'
  });
}

function ipRateLimit() {
  return async function ipRateLimitMiddleware(req, res, next) {
    try {
      const ip = clientIp(req);
      const bucket = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
      const key = `ipload:${ip}:${bucket}`;

      const count = await connection.incr(key);
      if (count === 1) {
        await connection.expire(key, WINDOW_SECONDS * 2);
      }

      if (count > IP_RATE_LIMIT_RPM) {
        res.setHeader('Retry-After', String(WINDOW_SECONDS));
        return res.status(429).json({
          status: 'error',
          code: 'ip_rate_limit_exceeded',
          message: 'Trop de requêtes depuis cette adresse — réessayez plus tard.'
        });
      }
      return next();
    } catch (error) {
      console.error('[ip-guard] rate dependency unavailable', String(error?.code || error?.name || 'unknown'));
      return dependencyUnavailable(res);
    }
  };
}

async function ipBlockGuard(req, res, next) {
  try {
    const ip = clientIp(req);
    const blocked = await connection.get(`ipblocked:${ip}`);
    if (blocked) {
      res.setHeader('Retry-After', String(AUTH_FAIL_COOLDOWN_SECONDS));
      return res.status(429).json({
        status: 'error',
        code: 'ip_temporarily_blocked',
        message: 'Adresse temporairement bloquée suite à trop de tentatives invalides.'
      });
    }
    return next();
  } catch (error) {
    console.error('[ip-guard] block dependency unavailable', String(error?.code || error?.name || 'unknown'));
    return dependencyUnavailable(res);
  }
}

async function recordAuthFailure(req) {
  const ip = clientIp(req);
  const key = `authfail:${ip}`;
  const count = await connection.incr(key);
  if (count === 1) {
    await connection.expire(key, AUTH_FAIL_WINDOW_SECONDS);
  }
  if (count >= AUTH_FAIL_THRESHOLD) {
    await connection.set(`ipblocked:${ip}`, '1', 'EX', AUTH_FAIL_COOLDOWN_SECONDS);
  }
}

async function clearAuthFailures(req) {
  const ip = clientIp(req);
  await connection.del(`authfail:${ip}`);
}

module.exports = {
  clientIp,
  ipRateLimit,
  ipBlockGuard,
  recordAuthFailure,
  clearAuthFailures,
  boundedPositiveInt
};
