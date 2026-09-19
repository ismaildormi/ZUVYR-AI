'use strict';

const { createCodeSandboxRepository } = require('./codeSandboxRepository');
const { createVercelSandboxProvider } = require('./codeVercelSandboxProvider');

function cleanupError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

async function cleanupExpiredCodeSandboxes({
  db,
  sandboxProvider = null,
  nowMs = Date.now(),
  limit = 50,
  logger = console
} = {}) {
  if (!db) throw cleanupError('code_sandbox_cleanup_db_unavailable');

  const repository = createCodeSandboxRepository(db);
  const provider = sandboxProvider || createVercelSandboxProvider();
  const candidates = await repository.stale({ limit });

  const receipt = {
    scanned: candidates.length,
    stopped: 0,
    expired: 0,
    deferred: 0,
    failures: []
  };

  for (const candidate of candidates) {
    try {
      const internal = await repository.getInternal({
        ownerId: candidate.owner_id,
        sessionId: candidate.id
      });

      if (['stopped','failed','expired'].includes(internal.status)) continue;

      const now = Number(nowMs);
      const hardExpired =
        new Date(internal.expires_at).getTime() <= now;
      const idleExpired =
        new Date(internal.idle_expires_at).getTime() <= now;

      if (!hardExpired && !idleExpired) continue;

      let current = internal;

      if (current.provider_session_id) {
        if (current.status !== 'stopping') {
          await repository.transition({
            ownerId: current.owner_id,
            sessionId: current.id,
            status: 'stopping'
          });
          current = await repository.getInternal({
            ownerId: current.owner_id,
            sessionId: current.id
          });
        }

        let stoppedUsage = current.usage_metrics || {};
        try {
          const stopped = await provider.stopSession(
            current.provider_session_id
          );
          stoppedUsage = stopped.usage || stoppedUsage;
          receipt.stopped += 1;
        } catch (error) {
          if (![404,410].includes(Number(error?.providerStatus))) {
            receipt.deferred += 1;
            receipt.failures.push({
              sessionId: current.id,
              code: String(error?.code || 'code_sandbox_cleanup_stop_failed')
            });
            logger.error(
              '[code-sandbox-cleanup] provider stop deferred:',
              current.id,
              String(error?.code || error?.message || error)
            );
            continue;
          }
        }

        await repository.transition({
          ownerId: current.owner_id,
          sessionId: current.id,
          status: 'expired',
          providerSessionId: current.provider_session_id,
          usageMetrics: stoppedUsage
        });
        receipt.expired += 1;
        continue;
      }

      await repository.transition({
        ownerId: current.owner_id,
        sessionId: current.id,
        status: 'expired',
        usageMetrics: current.usage_metrics || {}
      });
      receipt.expired += 1;
    } catch (error) {
      receipt.failures.push({
        sessionId: candidate.id,
        code: String(error?.code || 'code_sandbox_cleanup_failed')
      });
      logger.error(
        '[code-sandbox-cleanup] session cleanup failed:',
        candidate.id,
        String(error?.code || error?.message || error)
      );
    }
  }

  return Object.freeze(receipt);
}

module.exports = {
  cleanupExpiredCodeSandboxes
};
