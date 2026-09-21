'use strict';

const { Worker } = require('bullmq');
const CONFIG = require('../config/automations.v1.json');
const {
  createAutomationExecutionProcessor
} = require('./automationExecutionProcessor');

function executionWorkerEnabled(env = process.env) {
  return String(env[CONFIG.execution.runtimeGateEnv] || '')
    .trim()
    .toLowerCase() === 'true';
}

function startAutomationExecutionWorker({
  connection,
  env = process.env,
  concurrency = CONFIG.execution.concurrencyDefault,
  processor = null
} = {}) {
  if (!executionWorkerEnabled(env)) {
    return Object.freeze({
      enabled: false,
      close: async () => {}
    });
  }
  if (!connection) {
    const error = new Error('PACK088_EXECUTION_REDIS_CONNECTION_REQUIRED');
    error.code = 'PACK088_EXECUTION_REDIS_CONNECTION_REQUIRED';
    throw error;
  }

  const runtime = processor || createAutomationExecutionProcessor();

  const worker = new Worker(
    CONFIG.execution.queueName,
    async job => runtime.process({
      runId: job && job.data && job.data.runId,
      queueJobId: String(job && job.id || '')
    }),
    {
      connection,
      concurrency: Math.max(
        1,
        Math.min(
          CONFIG.execution.concurrencyMax,
          Math.floor(Number(concurrency) || CONFIG.execution.concurrencyDefault)
        )
      )
    }
  );

  worker.enabled = true;
  return worker;
}

module.exports = {
  CONFIG,
  executionWorkerEnabled,
  startAutomationExecutionWorker
};
