'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  requiresStopFailClosed,
  rotateIfNeeded,
  pullStop,
  acknowledgeStop,
  drainImmediateStop,
  reportAction,
  runUndo,
  runOneCycle
} = require('../src/actionWorker');
const { loadSession } = require('../src/pairingSession');

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const DEVICE_ID = '22222222-2222-4222-8222-222222222222';
const AGENT_ID = '33333333-3333-4333-8333-333333333333';

function writeSession(stateDir, expiresInMs = 10 * 60 * 1000) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'session.json'), JSON.stringify({
    version: 'pack086.device-session.v1',
    backendOrigin: 'https://device.example.com',
    backendDeviceId: DEVICE_ID,
    sessionId: SESSION_ID,
    token: 'zst_' + 'a'.repeat(48),
    tokenExpiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    scopes: ['heartbeat', 'session_status', 'session_rotate'],
    counter: 0,
    agentDeviceId: AGENT_ID,
    fingerprint: 'f'.repeat(64),
    importedAt: new Date().toISOString()
  }, null, 2) + '\n', { mode: 0o600 });
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zuvyr-action-worker-'));
  try {
    assert.equal(requiresStopFailClosed({ risk: 'critical' }), true);
    assert.equal(requiresStopFailClosed({ risk: 'HIGH' }), true);
    assert.equal(requiresStopFailClosed({ risk: 'medium' }), false);
    assert.equal(requiresStopFailClosed(null), false);

    const farDir = path.join(root, 'far');
    writeSession(farDir, 10 * 60 * 1000);
    let farPostCalls = 0;
    const far = await rotateIfNeeded(farDir, {
      post: async () => { farPostCalls += 1; throw new Error('must_not_rotate'); }
    });
    assert.deepEqual(far, { rotated: false });
    assert.equal(farPostCalls, 0);

    const nearDir = path.join(root, 'near');
    writeSession(nearDir, 30 * 1000);
    const rotated = await rotateIfNeeded(nearDir, {
      post: async (_state, route) => {
        assert.equal(route, '/api/device-agent/rotate-token');
        return {
          token: 'zst_' + 'b'.repeat(48),
          tokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          scopes: ['heartbeat', 'session_status', 'session_rotate']
        };
      }
    });
    assert.deepEqual(rotated, { rotated: true });
    assert.equal(loadSession(nearDir).token, 'zst_' + 'b'.repeat(48));

    const stop = { id: '44444444-4444-4444-8444-444444444444' };
    const pulled = await pullStop(farDir, {
      post: async (_state, route, body) => {
        assert.equal(route, '/api/device-agent/stop/next');
        assert.deepEqual(body, {});
        return { stop };
      }
    });
    assert.deepEqual(pulled, stop);

    let ackBody = null;
    await acknowledgeStop(farDir, stop, {
      post: async (_state, route, body) => {
        assert.equal(route, '/api/device-agent/stop/ack');
        ackBody = body;
        return { success: true };
      }
    });
    assert.deepEqual(ackBody, { signalId: stop.id });
    assert.equal(await acknowledgeStop(farDir, null, { post: async () => { throw new Error('no-call'); } }), null);

    const drainCalls = [];
    const drained = await drainImmediateStop(farDir, {
      post: async (_state, route, body) => {
        drainCalls.push({ route, body });
        if (route.endsWith('/next')) return { stop };
        return { success: true };
      }
    });
    assert.equal(drained, true);
    assert.equal(drainCalls.length, 2);
    const noDrain = await drainImmediateStop(farDir, { post: async () => ({ stop: null }) });
    assert.equal(noDrain, false);

    const action = { id: '55555555-5555-4555-8555-555555555555', attemptId: '66666666-6666-4666-8666-666666666666' };
    let actionReport = null;
    await reportAction(farDir, action, {
      success: false,
      result: { stopped: true },
      errorCode: 'pack087_action_stopped',
      deviceActionExecuted: true,
      backupRef: 'backup:77777777-7777-4777-8777-777777777777',
      backupSha256: 'd'.repeat(64),
      secretRedacted: true
    }, {
      post: async (_state, route, body) => {
        assert.equal(route, '/api/device-agent/actions/report');
        actionReport = body;
        return { success: true };
      }
    });
    assert.equal(actionReport.actionId, action.id);
    assert.equal(actionReport.success, false);
    assert.equal(actionReport.secretRedacted, true);

    const undo = { id: '88888888-8888-4888-8888-888888888888', attemptId: '99999999-9999-4999-8999-999999999999', backupRef: 'backup:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', target: '/tmp/example' };
    let undoReport = null;
    const undoResult = await runUndo(farDir, undo, {
      undoExecute: async input => {
        assert.equal(input, undo);
        return { success: true, result: { restored: true }, errorCode: null, deviceActionExecuted: true, secretRedacted: false };
      },
      post: async (_state, route, body) => {
        assert.equal(route, '/api/device-agent/undo/report');
        undoReport = body;
        return { success: true };
      }
    });
    assert.equal(undoResult.success, true);
    assert.equal(undoReport.undoId, undo.id);
    assert.equal(undoReport.deviceActionExecuted, true);

    const stopCycleRoutes = [];
    const stopCycle = await runOneCycle(farDir, {
      post: async (_state, route) => {
        stopCycleRoutes.push(route);
        if (route === '/api/device-agent/stop/next') return { stop };
        if (route === '/api/device-agent/stop/ack') return { success: true };
        throw new Error('unexpected_route:' + route);
      }
    });
    assert.deepEqual(stopCycle, { kind: 'stop', handled: true });
    assert.deepEqual(stopCycleRoutes, ['/api/device-agent/stop/next', '/api/device-agent/stop/ack']);

    const undoCycleRoutes = [];
    const undoCycle = await runOneCycle(farDir, {
      undoExecute: async claimed => ({ success: true, result: { restored: claimed.id }, deviceActionExecuted: true }),
      post: async (_state, route) => {
        undoCycleRoutes.push(route);
        if (route === '/api/device-agent/stop/next') return { stop: null };
        if (route === '/api/device-agent/undo/next') return { undo };
        if (route === '/api/device-agent/undo/report') return { success: true };
        throw new Error('unexpected_route:' + route);
      }
    });
    assert.equal(undoCycle.kind, 'undo');
    assert.equal(undoCycle.id, undo.id);
    assert(undoCycleRoutes.includes('/api/device-agent/undo/report'));

    const idle = await runOneCycle(farDir, {
      post: async (_state, route) => {
        if (route === '/api/device-agent/stop/next') return { stop: null };
        if (route === '/api/device-agent/undo/next') return { undo: null };
        if (route === '/api/device-agent/actions/next') return { action: null };
        throw new Error('unexpected_route:' + route);
      }
    });
    assert.deepEqual(idle, { kind: 'idle' });

    const claimedAction = { ...action, risk: 'low', type: 'read_file' };
    const actionCycle = await runOneCycle(farDir, {
      execute: async received => {
        assert.equal(received.id, claimedAction.id);
        return { success: true, result: { ok: true }, deviceActionExecuted: true, secretRedacted: false };
      },
      post: async (_state, route) => {
        if (route === '/api/device-agent/stop/next') return { stop: null };
        if (route === '/api/device-agent/undo/next') return { undo: null };
        if (route === '/api/device-agent/actions/next') return { action: claimedAction };
        if (route === '/api/device-agent/actions/report') return { success: true };
        throw new Error('unexpected_route:' + route);
      }
    });
    assert.equal(actionCycle.kind, 'action');
    assert.equal(actionCycle.id, claimedAction.id);
    assert.equal(actionCycle.result.success, true);

    console.log('PASS: action worker token rotation, STOP, undo, report, idle and action lifecycle paths are deterministic.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
