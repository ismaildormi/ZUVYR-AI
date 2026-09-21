'use strict';

const CONFIG = require('../config/automations.v1.json');
const {
  createAutomationSchedulerRepository
} = require('./automationSchedulerRepository');
const {
  createAutomationQueue,
  enqueueAutomationOccurrence
} = require('./automationQueue');

function schedulerError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function schedulerEnabledFromEnv(env = process.env) {
  return String(env[CONFIG.scheduler.runtimeGateEnv] || '')
    .trim()
    .toLowerCase() === 'true';
}

function runtimeSchedulerOptions(env = process.env) {
  return Object.freeze({
    enabled: schedulerEnabledFromEnv(env),
    intervalMs: boundedInteger(
      env.PACK088_SCHEDULER_INTERVAL_MS,
      CONFIG.scheduler.intervalMsDefault,
      CONFIG.scheduler.intervalMsMin,
      CONFIG.scheduler.intervalMsMax
    ),
    batchSize: boundedInteger(
      env.PACK088_SCHEDULER_BATCH_SIZE,
      CONFIG.scheduler.batchSizeDefault,
      1,
      CONFIG.scheduler.batchSizeMax
    )
  });
}

function dedupeRuns(runs = []) {
  const byId = new Map();
  for (const run of runs) {
    if (!run || !run.runId || run.runState !== 'pending') continue;
    if (!byId.has(run.runId)) byId.set(run.runId, run);
  }
  return [...byId.values()];
}

async function runAutomationSchedulerTick({
  repository,
  queue,
  batchSize = CONFIG.scheduler.batchSizeDefault,
  now = new Date().toISOString(),
  logger = console
} = {}) {
  if (!repository) throw schedulerError('PACK088_SCHEDULER_REPOSITORY_REQUIRED');
  if (!queue) throw schedulerError('PACK088_SCHEDULER_QUEUE_REQUIRED');

  const pendingBeforeClaim = await repository.listPending({
    limit: Math.max(batchSize, 1) * 4
  });
  const claimed = await repository.claimDue({
    limit: batchSize,
    now
  });

  const candidates = dedupeRuns([
    ...pendingBeforeClaim,
    ...claimed
  ]);

  const summary = {
    version: 'pack-088.88b.scheduler-tick.v1',
    now,
    recovered: pendingBeforeClaim.filter(run => run.runState === 'pending').length,
    claimed: claimed.length,
    skipped: claimed.filter(run => run.runState === 'skipped').length,
    candidates: candidates.length,
    queued: 0,
    failed: 0,
    failures: []
  };

  for (const run of candidates) {
    try {
      const receipt = await enqueueAutomationOccurrence({ queue, run });
      await repository.markQueued({
        runId: run.runId,
        queueJobId: receipt.jobId,
        now
      });
      summary.queued += 1;
    } catch (error) {
      summary.failed += 1;
      const code = String(error && (error.code || error.message) || 'pack088_dispatch_failed')
        .slice(0, 200);
      summary.failures.push({ runId: run.runId, code });

      try {
        await repository.markDispatchError({
          runId: run.runId,
          errorCode: code,
          now
        });
      } catch (markError) {
        logger.error(
          '[pack088-scheduler] failed to persist dispatch error',
          run.runId,
          markError.code || markError.message
        );
      }
    }
  }

  return Object.freeze({
    ...summary,
    failures: Object.freeze(summary.failures.map(item => Object.freeze({ ...item })))
  });
}

function startAutomationScheduler({
  connection = null,
  repository = null,
  queue = null,
  env = process.env,
  logger = console,
  nowFactory = () => new Date().toISOString()
} = {}) {
  const options = runtimeSchedulerOptions(env);

  if (!options.enabled) {
    return Object.freeze({
      enabled: false,
      intervalMs: options.intervalMs,
      batchSize: options.batchSize,
      tick: async () => Object.freeze({
        version: 'pack-088.88b.scheduler-tick.v1',
        status: 'disabled'
      }),
      close: async () => {}
    });
  }

  const schedulerRepository =
    repository || createAutomationSchedulerRepository();
  const schedulerQueue =
    queue || createAutomationQueue({ connection });

  let running = false;
  let closed = false;

  async function tick() {
    if (closed) {
      return Object.freeze({
        version: 'pack-088.88b.scheduler-tick.v1',
        status: 'closed'
      });
    }
    if (running) {
      return Object.freeze({
        version: 'pack-088.88b.scheduler-tick.v1',
        status: 'overlap_suppressed'
      });
    }

    running = true;
    try {
      return await runAutomationSchedulerTick({
        repository: schedulerRepository,
        queue: schedulerQueue,
        batchSize: options.batchSize,
        now: nowFactory(),
        logger
      });
    } finally {
      running = false;
    }
  }

  const initialTick = tick().catch(error => {
    logger.error(
      '[pack088-scheduler] initial tick failed',
      error.code || error.message
    );
    return null;
  });

  const timer = setInterval(() => {
    tick().then(result => {
      if (result && result.status !== 'overlap_suppressed') {
        logger.log(
          '[pack088-scheduler] tick',
          JSON.stringify(result)
        );
      }
    }).catch(error => {
      logger.error(
        '[pack088-scheduler] tick failed',
        error.code || error.message
      );
    });
  }, options.intervalMs);

  if (typeof timer.unref === 'function') timer.unref();

  return Object.freeze({
    enabled: true,
    intervalMs: options.intervalMs,
    batchSize: options.batchSize,
    initialTick,
    tick,
    async close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      if (schedulerQueue && typeof schedulerQueue.close === 'function') {
        await schedulerQueue.close();
      }
    }
  });
}

module.exports = {
  CONFIG,
  schedulerError,
  boundedInteger,
  schedulerEnabledFromEnv,
  runtimeSchedulerOptions,
  dedupeRuns,
  runAutomationSchedulerTick,
  startAutomationScheduler
};
