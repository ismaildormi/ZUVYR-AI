'use strict';

const { createCodeRuntimeExecutor } = require('./codeRuntimeExecutor');

async function reconcileActiveCodeRuntimeJobs({
  db,
  creditApi,
  provider,
  env = process.env,
  limit = 50,
  logger = console
} = {}) {
  const executor = createCodeRuntimeExecutor({
    db,
    creditApi: creditApi || {},
    provider,
    env
  });
  return executor.reconcileActive({ limit, logger });
}

module.exports = {
  reconcileActiveCodeRuntimeJobs
};
