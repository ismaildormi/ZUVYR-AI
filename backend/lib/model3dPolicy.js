'use strict';

const config = require('../config/model3d-system.v1.json');

function gateError(code, blockers = []) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 503;
  error.retryable = false;
  error.blockers = Object.freeze([...blockers]);
  return error;
}

function truthy(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function model3dAvailability(env = process.env) {
  const blockers = [];
  if (!truthy(env[config.gates.liveBillingEnvironment])) {
    blockers.push('pack083_live_billing_disabled');
  }
  if (!truthy(env[config.gates.m18Environment])) {
    blockers.push('pack083_m18_unverified');
  }
  if (!truthy(env[config.gates.paidExecutionEnvironment])) {
    blockers.push('pack083_paid_execution_disabled');
  }
  if (!String(env[config.gates.credentialEnvironment] || '').trim()) {
    blockers.push('pack083_fal_not_configured');
  }

  return Object.freeze({
    live: blockers.length === 0,
    externalGate: config.gates.externalGate,
    provider: 'fal',
    blockers: Object.freeze(blockers)
  });
}

function assertModel3dLiveAvailable(env = process.env) {
  const status = model3dAvailability(env);
  if (!status.live) {
    throw gateError('model3d_live_gate_closed', status.blockers);
  }
  return status;
}

module.exports = {
  model3dAvailability,
  assertModel3dLiveAvailable
};
