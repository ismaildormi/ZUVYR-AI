'use strict';

const { config, ipError } = require('./ipCapabilityRegistry');

const BLOCKED_TARGETS = [
  /(^|\/)\.ssh(?:\/|$)/i,
  /(^|\/)\.aws(?:\/|$)/i,
  /(^|\/)\.env(?:\.|\/|$)/i,
  /credentials?/i,
  /service[-_]?account/i,
  /private[-_]?key/i
];

function inspectIpActionSecurity(action) {
  const surfaces = [action?.target, action?.input]
    .filter(value => value !== null && value !== undefined && String(value).length > 0)
    .map(value => String(value).replace(/\\/g, '/'));
  if (surfaces.some(surface => BLOCKED_TARGETS.some(pattern => pattern.test(surface)))) {
    throw ipError('ip_sensitive_target_blocked');
  }
  return Object.freeze({
    sandboxConfigured: config.execution.sandboxConfigured,
    networkEnabled: false,
    secretsAvailable: false,
    safeForExecution: false
  });
}

module.exports = { inspectIpActionSecurity };
