'use strict';

const { supabaseAdmin } = require('./supabaseAdmin');
const { recordAuthFailure, clearAuthFailures } = require('./ipGuard');

function authDependencyUnavailable(res) {
  res.setHeader('Retry-After', '5');
  return res.status(503).json({
    status: 'error',
    code: 'auth_dependency_unavailable',
    message: 'Authentication is temporarily unavailable. Please retry shortly.'
  });
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      await recordAuthFailure(req);
      return res.status(401).json({
        status: 'error',
        code: 'authorization_missing',
        message: 'Missing Authorization bearer token.'
      });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      await recordAuthFailure(req);
      return res.status(401).json({
        status: 'error',
        code: 'authorization_invalid',
        message: 'Invalid or expired session.'
      });
    }

    await clearAuthFailures(req);
    req.userId = data.user.id;
    req.userEmail = data.user.email;
    return next();
  } catch (error) {
    console.error('[auth] dependency unavailable', String(error?.code || error?.name || 'unknown'));
    return authDependencyUnavailable(res);
  }
}

module.exports = { requireAuth };
