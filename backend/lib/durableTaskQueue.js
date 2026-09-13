'use strict';

const CONFIG = require('../config/durable-task-kernel.v1.json');

function queueError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function uuid(value, code) {
  const text = value == null ? '' : String(value).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw queueError(code);
  }
  return text;
}

function durableTaskJobId(taskRunId) {
  return `${CONFIG.queue.jobIdPrefix}${uuid(taskRunId, 'DURABLE_QUEUE_TASK_RUN_ID_INVALID')}`;
}

function createDurableTaskQueue({
  QueueCtor = null,
  connection = null
} = {}) {
  const QueueClass = QueueCtor || require('bullmq').Queue;
  const redisConnection = connection || require('./queue').connection;

  return new QueueClass(CONFIG.queue.name, {
    connection: redisConnection
  });
}

async function enqueueDurableTask({
  queue,
  taskRunId,
  userId,
  requestId,
  planVersion
} = {}) {
  if (!queue || typeof queue.add !== 'function') {
    throw queueError('DURABLE_QUEUE_INSTANCE_REQUIRED');
  }

  const normalizedTaskRunId = uuid(taskRunId, 'DURABLE_QUEUE_TASK_RUN_ID_INVALID');
  const normalizedUserId = uuid(userId, 'DURABLE_QUEUE_USER_ID_INVALID');
  const normalizedRequestId = String(requestId || '').trim();
  const normalizedPlanVersion = String(planVersion || '').trim();

  if (!normalizedRequestId || normalizedRequestId.length > 200) {
    throw queueError('DURABLE_QUEUE_REQUEST_ID_INVALID');
  }
  if (!/^[0-9a-f]{64}$/.test(normalizedPlanVersion)) {
    throw queueError('DURABLE_QUEUE_PLAN_VERSION_INVALID');
  }

  const jobId = durableTaskJobId(normalizedTaskRunId);

  const job = await queue.add(
    CONFIG.queue.jobName,
    {
      taskRunId: normalizedTaskRunId,
      userId: normalizedUserId,
      requestId: normalizedRequestId,
      planVersion: normalizedPlanVersion
    },
    {
      jobId,
      attempts: CONFIG.queue.attempts,
      removeOnComplete: CONFIG.queue.removeOnComplete,
      removeOnFail: CONFIG.queue.removeOnFail
    }
  );

  return Object.freeze({
    jobId,
    taskRunId: normalizedTaskRunId,
    queueName: CONFIG.queue.name,
    bullJobId: job && job.id != null ? String(job.id) : jobId
  });
}

module.exports = {
  CONFIG,
  durableTaskJobId,
  createDurableTaskQueue,
  enqueueDurableTask
};
