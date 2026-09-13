'use strict';

const PREFLIGHT_STATES = Object.freeze({
  BLOCKED_PENDING_M10: 'BLOCKED_PENDING_M10',
  BLOCKED_CREDENTIAL_MISSING: 'BLOCKED_CREDENTIAL_MISSING',
  BLOCKED_CAPABILITY_UNVERIFIED: 'BLOCKED_CAPABILITY_UNVERIFIED',
  BLOCKED_COST_UNVERIFIED: 'BLOCKED_COST_UNVERIFIED',
  PREFLIGHT_READY: 'PREFLIGHT_READY'
});

function providerHealthPreflight({
  launchAuthorized,
  credentialPresent,
  hasEligibleCapability,
  hasVerifiedCost
} = {}) {
  if (launchAuthorized !== true) {
    return { adapterId: 'pack021-credential-capability-cost-preflight', state: PREFLIGHT_STATES.BLOCKED_PENDING_M10 };
  }
  if (credentialPresent !== true) {
    return { adapterId: 'pack021-credential-capability-cost-preflight', state: PREFLIGHT_STATES.BLOCKED_CREDENTIAL_MISSING };
  }
  if (hasEligibleCapability !== true) {
    return { adapterId: 'pack021-credential-capability-cost-preflight', state: PREFLIGHT_STATES.BLOCKED_CAPABILITY_UNVERIFIED };
  }
  if (hasVerifiedCost !== true) {
    return { adapterId: 'pack021-credential-capability-cost-preflight', state: PREFLIGHT_STATES.BLOCKED_COST_UNVERIFIED };
  }
  return { adapterId: 'pack021-credential-capability-cost-preflight', state: PREFLIGHT_STATES.PREFLIGHT_READY };
}

module.exports = {
  PREFLIGHT_STATES,
  providerHealthPreflight
};
