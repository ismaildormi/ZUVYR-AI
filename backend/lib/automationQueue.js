'use strict';

const CONFIG = require('../config/automations.v1.json');

function schedulerQueueError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function uuid(value, code) {
  const text = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw schedulerQueueError(code);
  }
  return text;
}

function automationJobId(runId) {
  return CONFIG.scheduler.jobIdPrefix + uuid(runId, 'PACK088_RUN_ID_INVALID');
}

function createAutomationQueue({ QueueCtor = null, connection = null } = {}) {
  const QueueClass = QueueCtor || require('bullmq').Queue;
  const redisConnection = connection || require('./queue').connection;
  return new QueueClass(CONFIG.scheduler.queueName, { connection: redisConnection });
}

async function enqueueAutomationOccurrence({ queue, run } = {}) {
  if (!queue || typeof queue.add !== 'function') {
    throw schedulerQueueError('PACK088_QUEUE_REQUIRED');
  }
  if (!run || typeof run !== 'object') {
    throw schedulerQueueError('PACK088_RUN_REQUIRED');
  }

  const runId = uuid(run.runId, 'PACK088_RUN_ID_INVALID');
  const ownerId = uuid(run.ownerId, 'PACK088_OWNER_ID_INVALID');
  const scheduleId = uuid(run.scheduleId, 'PACK088_SCHEDULE_ID_INVALID');
  const workflowId = uuid(run.workflowId, 'PACK088_WORKFLOW_ID_INVALID');
  const jobId = automationJobId(runId);

  const job = await queue.add(
    CONFIG.scheduler.jobName,
    {
      runId,
      ownerId,
      scheduleId,
      workflowId,
      workflowRevision: Number(run.workflowRevision),
      scheduleRevision: Number(run.scheduleRevision),
      occurrenceKey: String(run.occurrenceKey || ''),
      scheduledFor: String(run.scheduledFor || '')
    },
    {
      jobId,
      attempts: CONFIG.scheduler.queueAttempts,
      backoff: {
        type: 'exponential',
        delay: CONFIG.scheduler.queueBackoffMs
      },
      removeOnComplete: CONFIG.scheduler.removeOnComplete,
      removeOnFail: CONFIG.scheduler.removeOnFail
    }
  );

  return Object.freeze({
    runId,
    jobId,
    queueName: CONFIG.scheduler.queueName,
    bullJobId: job && job.id != null ? String(job.id) : jobId
  });
}

module.exports = {
  CONFIG,
  schedulerQueueError,
  automationJobId,
  createAutomationQueue,
  enqueueAutomationOccurrence
};
