'use strict';

const crypto = require('crypto');
const CONFIG = require('../config/cancel-compensation.v1.json');

function compensationError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function stableKey(value) {
  return crypto
    .createHash('sha256')
    .update(String(value), 'utf8')
    .digest('hex');
}

function createCompensationEngine({
  persistence,
  compensators = {},
  finance = null
} = {}) {
  if (
    !persistence ||
    typeof persistence.snapshot !== 'function' ||
    typeof persistence.recordCompensation !== 'function'
  ) {
    throw compensationError('COMPENSATION_PERSISTENCE_REQUIRED');
  }

  if (!compensators || typeof compensators !== 'object' || Array.isArray(compensators)) {
    throw compensationError('COMPENSATION_REGISTRY_INVALID');
  }

  if (
    finance !== null &&
    (
      typeof finance !== 'object' ||
      typeof finance.settleCancelledTask !== 'function'
    )
  ) {
    throw compensationError('COMPENSATION_FINANCE_ADAPTER_INVALID');
  }

  return Object.freeze({
    async compensate({ userId, taskRunId } = {}) {
      const snapshot = await persistence.snapshot({
        userId,
        taskRunId
      });

      if (!snapshot || !snapshot.run || !Array.isArray(snapshot.steps)) {
        throw compensationError('COMPENSATION_SNAPSHOT_INVALID');
      }

      if (snapshot.run.state !== 'cancelled') {
        throw compensationError('COMPENSATION_REQUIRES_CANCELLED_TASK');
      }

      if (snapshot.run.compensation_receipt) {
        return Object.freeze({
          replayed: true,
          receipt: snapshot.run.compensation_receipt
        });
      }

      const succeeded = snapshot.steps
        .filter(step => step.state === 'succeeded')
        .sort((a, b) =>
          Number(b.sequence_number ?? b.sequenceNumber ?? 0) -
          Number(a.sequence_number ?? a.sequenceNumber ?? 0)
        );

      const undoReceipts = [];

      for (const step of succeeded) {
        const compensator = compensators[step.capability];

        if (typeof compensator !== 'function') {
          undoReceipts.push(Object.freeze({
            stepKey: step.step_key || step.stepKey,
            capability: step.capability,
            status: 'not_supported'
          }));
          continue;
        }

        const stepKey = step.step_key || step.stepKey;
        const undoKey = stableKey(`${taskRunId}:${stepKey}:undo`);

        const result = await compensator({
          taskRunId,
          stepId: step.id,
          stepKey,
          capability: step.capability,
          output: step.output ?? null,
          checkpoint: step.checkpoint || {},
          idempotencyKey: undoKey
        });

        if (!result || typeof result !== 'object' || Array.isArray(result)) {
          throw compensationError('COMPENSATION_UNDO_RECEIPT_INVALID', {
            stepKey
          });
        }

        undoReceipts.push(Object.freeze({
          stepKey,
          capability: step.capability,
          status: 'compensated',
          idempotencyKey: undoKey,
          receipt: result
        }));
      }

      let financialReceipt = Object.freeze({
        status: 'not_wired'
      });

      if (finance) {
        const financialKey = stableKey(
          `${taskRunId}:cancellation-financial`
        );

        const result = await finance.settleCancelledTask({
          userId,
          taskRunId,
          idempotencyKey: financialKey,
          succeededStepKeys: succeeded.map(
            step => step.step_key || step.stepKey
          ),
          cancellationReceipt:
            snapshot.run.cancellation_receipt ||
            snapshot.run.cancellationReceipt ||
            null
        });

        if (!result || typeof result !== 'object' || Array.isArray(result)) {
          throw compensationError('COMPENSATION_FINANCIAL_RECEIPT_INVALID');
        }

        financialReceipt = Object.freeze({
          status: 'settled',
          idempotencyKey: financialKey,
          receipt: result
        });
      }

      const receipt = Object.freeze({
        version: 'pack-039.compensation-receipt.v1',
        taskRunId,
        financial: financialReceipt,
        undoReceipts: Object.freeze(undoReceipts)
      });

      const persisted = await persistence.recordCompensation({
        userId,
        taskRunId,
        receipt
      });

      return Object.freeze({
        replayed: persisted.replayed === true,
        compensationVersion: persisted.compensationVersion,
        receipt: persisted.receipt || receipt
      });
    }
  });
}

module.exports = {
  CONFIG,
  createCompensationEngine
};
