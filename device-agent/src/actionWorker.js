'use strict';

const {
  loadSession,
  replaceSessionToken
} = require('./pairingSession');
const { signedPost } = require('./deviceApiClient');
const {
  executeAction,
  executeUndo
} = require('./actionExecutor');
const { agentError } = require('./security');

const TOKEN_ROTATE_BEFORE_MS = 2 * 60 * 1000;
const IDLE_POLL_MS = 750;
const STOP_POLL_MS = 350;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function workerError(code, cause) {
  const error = agentError(code, cause);
  error.code = code;
  return error;
}

async function rotateIfNeeded(stateDir) {
  const session = loadSession(stateDir);
  const expiresIn = Date.parse(session.tokenExpiresAt) - Date.now();
  if (expiresIn > TOKEN_ROTATE_BEFORE_MS) return { rotated: false };

  const response = await signedPost(stateDir, '/api/device-agent/rotate-token', {});
  if (!response.token || !response.tokenExpiresAt) {
    throw workerError('pack087_token_rotation_response_invalid');
  }
  replaceSessionToken(stateDir, {
    token: response.token,
    tokenExpiresAt: response.tokenExpiresAt,
    scopes: response.scopes
  });
  return { rotated: true };
}

async function pullStop(stateDir) {
  const response = await signedPost(stateDir, '/api/device-agent/stop/next', {});
  return response.stop || null;
}

async function acknowledgeStop(stateDir, stop) {
  if (!stop || !stop.id) return null;
  return signedPost(stateDir, '/api/device-agent/stop/ack', {
    signalId: stop.id
  });
}

async function drainImmediateStop(stateDir) {
  const stop = await pullStop(stateDir);
  if (!stop) return false;
  await acknowledgeStop(stateDir, stop);
  return true;
}

async function runActionWithStop(stateDir, action, {
  env = process.env,
  stopPollMs = STOP_POLL_MS
} = {}) {
  const controller = new AbortController();
  let active = true;
  let stop = null;
  let pollFailure = null;

  const watcher = (async () => {
    while (active) {
      try {
        const candidate = await pullStop(stateDir);
        if (candidate) {
          stop = candidate;
          controller.abort();
          await acknowledgeStop(stateDir, candidate);
          return;
        }
      } catch (error) {
        pollFailure = error;
      }
      if (active) await sleep(stopPollMs);
    }
  })();

  const execution = await executeAction(action, {
    stateDir,
    env,
    signal: controller.signal
  });

  active = false;
  await watcher.catch(() => null);

  if (stop && execution.success !== false) {
    return {
      success: false,
      result: { stopped: true },
      errorCode: 'pack087_action_stopped',
      deviceActionExecuted: execution.deviceActionExecuted === true,
      backupRef: execution.backupRef || null,
      backupSha256: execution.backupSha256 || null,
      secretRedacted: execution.secretRedacted === true
    };
  }

  if (pollFailure && execution.success === true) {
    execution.result = {
      ...(execution.result || {}),
      stopPollWarning: String(pollFailure.code || pollFailure.message || 'pack087_stop_poll_failed')
    };
  }

  return execution;
}

async function reportAction(stateDir, action, result) {
  return signedPost(stateDir, '/api/device-agent/actions/report', {
    actionId: action.id,
    attemptId: action.attemptId,
    success: result.success === true,
    result: result.result || {},
    errorCode: result.errorCode || null,
    deviceActionExecuted: result.deviceActionExecuted === true,
    backupRef: result.backupRef || null,
    backupSha256: result.backupSha256 || null,
    secretRedacted: result.secretRedacted === true
  });
}

async function runUndo(stateDir, undo, { env = process.env } = {}) {
  const result = await executeUndo(undo, { stateDir, env });
  await signedPost(stateDir, '/api/device-agent/undo/report', {
    undoId: undo.id,
    attemptId: undo.attemptId,
    success: result.success === true,
    result: result.result || {},
    errorCode: result.errorCode || null,
    deviceActionExecuted: result.deviceActionExecuted === true,
    secretRedacted: result.secretRedacted === true
  });
  return result;
}

async function runOneCycle(stateDir, {
  env = process.env
} = {}) {
  await rotateIfNeeded(stateDir);

  if (await drainImmediateStop(stateDir)) {
    return { kind: 'stop', handled: true };
  }

  const undoResponse = await signedPost(stateDir, '/api/device-agent/undo/next', {});
  if (undoResponse.undo) {
    const result = await runUndo(stateDir, undoResponse.undo, { env });
    return { kind: 'undo', id: undoResponse.undo.id, result };
  }

  const actionResponse = await signedPost(stateDir, '/api/device-agent/actions/next', {});
  if (!actionResponse.action) {
    return { kind: 'idle' };
  }

  const result = await runActionWithStop(stateDir, actionResponse.action, { env });
  await reportAction(stateDir, actionResponse.action, result);
  return { kind: 'action', id: actionResponse.action.id, result };
}

async function runWorker(stateDir, {
  env = process.env,
  idlePollMs = IDLE_POLL_MS,
  signal = null,
  onCycle = null
} = {}) {
  if (!stateDir) throw workerError('pack087_state_dir_required');
  while (!signal?.aborted) {
    try {
      const result = await runOneCycle(stateDir, { env });
      if (typeof onCycle === 'function') onCycle(null, result);
      if (result.kind === 'idle') await sleep(idlePollMs);
    } catch (error) {
      if (signal?.aborted) break;
      if (typeof onCycle === 'function') onCycle(error, null);
      await sleep(idlePollMs);
    }
  }
  return { stopped: true };
}

module.exports = {
  TOKEN_ROTATE_BEFORE_MS,
  IDLE_POLL_MS,
  STOP_POLL_MS,
  rotateIfNeeded,
  pullStop,
  acknowledgeStop,
  drainImmediateStop,
  runActionWithStop,
  reportAction,
  runUndo,
  runOneCycle,
  runWorker
};
