'use strict';

const CONFIG = require('../config/cancel-compensation.v1.json');

function cancellationError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function createTaskCancellation({ persistence } = {}) {
  if (
    !persistence ||
    typeof persistence.requestCancel !== 'function' ||
    typeof persistence.cancelState !== 'function' ||
    typeof persistence.finalizeCancellation !== 'function'
  ) {
    throw cancellationError('TASK_CANCELLATION_PERSISTENCE_REQUIRED');
  }

  return Object.freeze({
    async request({ userId, taskRunId, reason = 'user_requested' } = {}) {
      return persistence.requestCancel({
        userId,
        taskRunId,
        reason
      });
    },

    async state({ userId, taskRunId } = {}) {
      return persistence.cancelState({
        userId,
        taskRunId
      });
    },

    async finalizeActiveStep({
      stepId,
      workerOwner,
      leaseToken,
      receipt
    } = {}) {
      return persistence.finalizeCancellation({
        stepId,
        workerOwner,
        leaseToken,
        receipt
      });
    }
  });
}

module.exports = {
  CONFIG,
  createTaskCancellation
};
