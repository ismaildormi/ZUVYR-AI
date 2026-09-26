'use strict';

const assert = require('node:assert/strict');
const { runActionWithStop } = require('../src/actionWorker');

function stoppedExecution(signal) {
  return new Promise(resolve => {
    const finish = () => resolve(Object.freeze({
      success: false,
      result: { aborted: true },
      errorCode: 'pack087_action_stopped',
      deviceActionExecuted: false,
      backupRef: null,
      backupSha256: null,
      secretRedacted: false
    }));
    if (signal.aborted) finish();
    else signal.addEventListener('abort', finish, { once: true });
  });
}

(async () => {
  let criticalPolls = 0;
  const unavailablePost = async (_stateDir, route) => {
    assert.equal(route, '/api/device-agent/stop/next');
    criticalPolls += 1;
    const error = new Error('simulated_stop_channel_down');
    error.code = 'simulated_stop_channel_down';
    throw error;
  };

  const critical = await runActionWithStop('/tmp/zuvyr-test-state', {
    id: 'critical-stop-loss',
    risk: 'critical',
    type: 'run_command'
  }, {
    stopPollMs: 1,
    stopFailureGraceMs: 2,
    stopFailureMinAttempts: 2,
    post: unavailablePost,
    execute: async (_action, { signal }) => stoppedExecution(signal)
  });

  assert.equal(critical.success, false);
  assert.equal(critical.errorCode, 'pack087_stop_channel_unavailable');
  assert.equal(critical.result.stopChannelUnavailable, true);
  assert.equal(critical.result.risk, 'critical');
  assert.ok(critical.result.consecutivePollFailures >= 2);
  assert.ok(criticalPolls >= 2);

  let lowPolls = 0;
  const transientPost = async (_stateDir, route) => {
    assert.equal(route, '/api/device-agent/stop/next');
    lowPolls += 1;
    const error = new Error('simulated_transient_stop_poll');
    error.code = 'simulated_transient_stop_poll';
    throw error;
  };

  const low = await runActionWithStop('/tmp/zuvyr-test-state', {
    id: 'low-stop-loss',
    risk: 'low',
    type: 'observe_screen'
  }, {
    stopPollMs: 1,
    stopFailureGraceMs: 0,
    stopFailureMinAttempts: 1,
    post: transientPost,
    execute: async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return Object.freeze({
        success: true,
        result: { observed: true },
        errorCode: null,
        deviceActionExecuted: true,
        backupRef: null,
        backupSha256: null,
        secretRedacted: false
      });
    }
  });

  assert.equal(low.success, true);
  assert.equal(low.result.observed, true);
  assert.equal(low.result.stopPollWarning, 'simulated_transient_stop_poll');
  assert.ok(low.result.stopPollFailureCount >= 1);
  assert.ok(lowPolls >= 1);

  console.log('PASS: persistent STOP-channel loss aborts critical actions after bounded grace.');
  console.log('PASS: low-risk actions tolerate STOP polling loss with an explicit warning receipt.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
