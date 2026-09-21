'use strict';

const {
  createAutomationControlRepository
} = require('./automationControlRepository');
const {
  createDurableTaskPersistence
} = require('./durableTaskPersistence');
const {
  createTaskCancellation
} = require('./taskCancellation');

function serviceError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function createAutomationService({
  client = null,
  repository = null,
  cancellation = null
} = {}) {
  const db = client || require('./supabaseAdmin').supabaseAdmin;
  const repo = repository || createAutomationControlRepository({ client: db });
  const taskCancellation = cancellation || createTaskCancellation({
    persistence: createDurableTaskPersistence({ client: db })
  });

  return Object.freeze({
    create: input => repo.create(input),
    list: input => repo.list(input),
    get: input => repo.get(input),
    runs: input => repo.runs(input),
    run: input => repo.run(input),
    notifications: input => repo.notifications(input),
    markNotificationRead: input => repo.markNotificationRead(input),

    async activate({ ownerId, scheduleId } = {}) {
      return repo.control({ ownerId, scheduleId, action: 'activate' });
    },

    async pause({ ownerId, scheduleId } = {}) {
      return repo.control({ ownerId, scheduleId, action: 'pause' });
    },

    async resume({ ownerId, scheduleId } = {}) {
      return repo.control({ ownerId, scheduleId, action: 'resume' });
    },

    async runNow({ ownerId, scheduleId, requestToken } = {}) {
      return repo.control({
        ownerId,
        scheduleId,
        action: 'run_now',
        requestToken
      });
    },

    async cancel({ ownerId, scheduleId } = {}) {
      const control = await repo.control({
        ownerId,
        scheduleId,
        action: 'cancel'
      });

      const taskRunIds = Array.isArray(control && control.taskRunIds)
        ? [...new Set(control.taskRunIds.filter(Boolean))]
        : [];
      const cancellationRequests = [];

      for (const taskRunId of taskRunIds) {
        try {
          const receipt = await taskCancellation.request({
            userId: ownerId,
            taskRunId,
            reason: 'automation_schedule_cancelled'
          });
          cancellationRequests.push(Object.freeze({
            taskRunId,
            accepted: Boolean(receipt && receipt.accepted),
            state: receipt && receipt.state || null,
            errorCode: null
          }));
        } catch (error) {
          cancellationRequests.push(Object.freeze({
            taskRunId,
            accepted: false,
            state: null,
            errorCode: String(error && (error.code || error.message) || 'PACK039_CANCEL_FAILED')
          }));
        }
      }

      const failed = cancellationRequests.filter(item => item.errorCode);
      if (failed.length) {
        throw serviceError('PACK088_ACTIVE_TASK_CANCEL_REQUEST_FAILED', {
          control,
          cancellationRequests
        });
      }

      return Object.freeze({
        ...control,
        cancellationRequests: Object.freeze(cancellationRequests)
      });
    }
  });
}

module.exports = {
  serviceError,
  createAutomationService
};
