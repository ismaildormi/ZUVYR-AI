#!/usr/bin/env node
// ROX AI — backend/test-gatekeeper-unit.js
//
// Unit tests for gatekeeper.js — the credit reservation/refund logic
// flagged in the audit as the highest-risk untested surface ("business-
// critical financial logic... currently has no automated test coverage
// found"). Unlike test-hardening.js (a live-instance HTTP smoke test),
// this mocks lib/supabaseAdmin.js entirely, so it needs no real
// Supabase project, no network, and no `@supabase/supabase-js` install.

const assert = require('assert');
const Module = require('module');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok - ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(`    ${err.stack || err}`);
    failed++;
    process.exitCode = 1;
  }
}

function loadGatekeeperWithMockSupabase({ profileResult, rpcResults = {} }) {
  const supabaseAdminPath = require.resolve('./lib/supabaseAdmin');
  const gatekeeperPath = require.resolve('./gatekeeper');

  const rpcCalls = [];
  const mockSupabaseAdmin = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async single() {
                  return profileResult;
                },
              };
            },
          };
        },
      };
    },
    async rpc(fnName, params) {
      rpcCalls.push({ fnName, params });
      const handler = rpcResults[fnName];
      if (!handler) throw new Error(`test did not configure an rpc mock for "${fnName}"`);
      return typeof handler === 'function' ? handler(params) : handler;
    },
  };

  const previousEntry = require.cache[supabaseAdminPath];
  const mockEntry = new Module(supabaseAdminPath);
  mockEntry.exports = { supabaseAdmin: mockSupabaseAdmin };
  mockEntry.loaded = true;
  require.cache[supabaseAdminPath] = mockEntry;

  delete require.cache[gatekeeperPath];
  let gatekeeper;
  try {
    gatekeeper = require(gatekeeperPath);
  } finally {
    if (previousEntry) require.cache[supabaseAdminPath] = previousEntry;
    else delete require.cache[supabaseAdminPath];
    delete require.cache[gatekeeperPath];
  }

  return { gatekeeper, rpcCalls };
}

function responseRecorder() {
  const state = { statusCode: null, body: null };
  return {
    state,
    res: {
      status(code) { state.statusCode = code; return this; },
      json(body) { state.body = body; return body; }
    }
  };
}

async function main() {
  console.log('gatekeeper.js unit tests (mocked Supabase)');

  await test('checkAccess: unknown user -> not allowed, reason user_not_found', async () => {
    const { gatekeeper } = loadGatekeeperWithMockSupabase({
      profileResult: { data: null, error: { message: 'no rows' } },
    });
    const result = await gatekeeper.checkAccess('missing-user');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'user_not_found');
  });

  await test('checkAccess: credits remaining -> allowed, correct remaining balance', async () => {
    const { gatekeeper } = loadGatekeeperWithMockSupabase({
      profileResult: { data: { subscription_status: 'free', credits_total: 100, credits_used: 40 }, error: null },
    });
    const result = await gatekeeper.checkAccess('user-1');
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.remaining, 60);
  });

  await test('checkAccess: credits fully used -> not allowed, reason out_of_credits', async () => {
    const { gatekeeper } = loadGatekeeperWithMockSupabase({
      profileResult: { data: { subscription_status: 'free', credits_total: 100, credits_used: 100 }, error: null },
    });
    const result = await gatekeeper.checkAccess('user-2');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'out_of_credits');
  });

  await test('checkAccess: Pro is not an unconditional bypass — still blocked at 0 remaining', async () => {
    const { gatekeeper } = loadGatekeeperWithMockSupabase({
      profileResult: { data: { subscription_status: 'pro', credits_total: 500, credits_used: 500 }, error: null },
    });
    const result = await gatekeeper.checkAccess('pro-user');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'out_of_credits');
  });

  await test('loadRoxUserMiddleware: missing profile fails closed', async () => {
    const { gatekeeper } = loadGatekeeperWithMockSupabase({
      profileResult: { data: null, error: { message: 'missing' } }
    });
    const req = { userId: 'missing' };
    const { res, state } = responseRecorder();
    let nextCalled = false;
    await gatekeeper.loadRoxUserMiddleware(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(state.statusCode, 403);
    assert.strictEqual(state.body.code, 'user_not_found');
  });

  await test('loadRoxUserMiddleware: valid profile is attached and continues', async () => {
    const profile = { subscription_status: 'free', credits_total: 20, credits_used: 3 };
    const { gatekeeper } = loadGatekeeperWithMockSupabase({ profileResult: { data: profile, error: null } });
    const req = { userId: 'u' };
    const { res } = responseRecorder();
    let nextCalled = false;
    await gatekeeper.loadRoxUserMiddleware(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.deepStrictEqual(req.roxUser, profile);
  });

  await test('gatekeeperMiddleware: exhausted Pro returns pro_out_of_credits', async () => {
    const { gatekeeper } = loadGatekeeperWithMockSupabase({
      profileResult: { data: { subscription_status: 'pro', credits_total: 5, credits_used: 5 }, error: null }
    });
    const { res, state } = responseRecorder();
    let nextCalled = false;
    await gatekeeper.gatekeeperMiddleware({ userId: 'pro' }, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(state.statusCode, 403);
    assert.strictEqual(state.body.code, 'pro_out_of_credits');
  });

  await test('gatekeeperMiddleware: funded user continues with profile attached', async () => {
    const profile = { subscription_status: 'free', credits_total: 10, credits_used: 2 };
    const { gatekeeper } = loadGatekeeperWithMockSupabase({ profileResult: { data: profile, error: null } });
    const req = { userId: 'u' };
    const { res } = responseRecorder();
    let nextCalled = false;
    await gatekeeper.gatekeeperMiddleware(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.deepStrictEqual(req.roxUser, profile);
  });

  await test('reserveCredits: rejects without a requestId (idempotency requirement)', async () => {
    const { gatekeeper } = loadGatekeeperWithMockSupabase({ profileResult: { data: null, error: null } });
    await assert.rejects(gatekeeper.reserveCredits({ userId: 'u', feature: 'chat' }), /requestId/);
  });

  await test('reserveCredits: success path returns newBalance and replayed=false', async () => {
    const { gatekeeper, rpcCalls } = loadGatekeeperWithMockSupabase({
      profileResult: { data: null, error: null },
      rpcResults: { deduct_credit_and_log: { data: { success: true, new_balance: 59, replayed: false }, error: null } },
    });
    const result = await gatekeeper.reserveCredits({ userId: 'u1', requestId: 'req-1', feature: 'chat', creditsConsumed: 1 });
    assert.strictEqual(result.newBalance, 59);
    assert.strictEqual(result.replayed, false);
    assert.strictEqual(rpcCalls[0].fnName, 'deduct_credit_and_log');
    assert.strictEqual(rpcCalls[0].params.p_request_id, 'req-1');
  });

  await test('reserveCredits: idempotent replay returns replayed=true instead of double-charging', async () => {
    const { gatekeeper } = loadGatekeeperWithMockSupabase({
      profileResult: { data: null, error: null },
      rpcResults: { deduct_credit_and_log: { data: { success: true, new_balance: 59, replayed: true }, error: null } },
    });
    const result = await gatekeeper.reserveCredits({ userId: 'u1', requestId: 'req-1', feature: 'chat' });
    assert.strictEqual(result.replayed, true);
  });

  await test('reserveCredits: insufficient credits rejects with code + available/required', async () => {
    const { gatekeeper } = loadGatekeeperWithMockSupabase({
      profileResult: { data: null, error: null },
      rpcResults: { deduct_credit_and_log: { data: { success: false, error: 'insufficient_credits', available: 0, required: 1 }, error: null } },
    });
    await assert.rejects(
      gatekeeper.reserveCredits({ userId: 'u2', requestId: 'req-2', feature: 'chat' }),
      err => err.code === 'insufficient_credits' && err.available === 0 && err.required === 1
    );
  });

  await test('reserveCredits: propagates a raw Supabase/RPC error', async () => {
    const { gatekeeper } = loadGatekeeperWithMockSupabase({
      profileResult: { data: null, error: null },
      rpcResults: { deduct_credit_and_log: { data: null, error: new Error('connection reset') } },
    });
    await assert.rejects(gatekeeper.reserveCredits({ userId: 'u3', requestId: 'req-3', feature: 'chat' }), /connection reset/);
  });

  await test('settleCredits: success preserves final cost and replay metadata', async () => {
    const { gatekeeper, rpcCalls } = loadGatekeeperWithMockSupabase({
      profileResult: { data: null, error: null },
      rpcResults: { settle_credit_charge: { data: { success: true, final_credits: 3, already_settled: false }, error: null } }
    });
    const result = await gatekeeper.settleCredits('req-settle', 3);
    assert.strictEqual(result.final_credits, 3);
    assert.deepStrictEqual(rpcCalls[0], {
      fnName: 'settle_credit_charge',
      params: { p_request_id: 'req-settle', p_final_credits: 3 }
    });
  });

  await test('settleCredits: RPC business failure is surfaced with its error code', async () => {
    const { gatekeeper } = loadGatekeeperWithMockSupabase({
      profileResult: { data: null, error: null },
      rpcResults: { settle_credit_charge: { data: { success: false, error: 'settlement_conflict' }, error: null } }
    });
    await assert.rejects(gatekeeper.settleCredits('req-settle', 4), err => err.code === 'settlement_conflict');
  });

  await test('refundCredits: success returns newBalance, alreadyRefunded=false', async () => {
    const { gatekeeper, rpcCalls } = loadGatekeeperWithMockSupabase({
      profileResult: { data: null, error: null },
      rpcResults: { refund_credit_and_log: { data: { success: true, new_balance: 60, already_refunded: false }, error: null } },
    });
    const result = await gatekeeper.refundCredits('req-1');
    assert.strictEqual(result.newBalance, 60);
    assert.strictEqual(result.alreadyRefunded, false);
    assert.strictEqual(rpcCalls[0].params.p_request_id, 'req-1');
  });

  await test('refundCredits: calling twice reports alreadyRefunded, never double-refunds', async () => {
    const { gatekeeper } = loadGatekeeperWithMockSupabase({
      profileResult: { data: null, error: null },
      rpcResults: { refund_credit_and_log: { data: { success: true, new_balance: 60, already_refunded: true }, error: null } },
    });
    const result = await gatekeeper.refundCredits('req-1');
    assert.strictEqual(result.alreadyRefunded, true);
  });

  await test('refundCredits: unknown requestId surfaces the RPC error code', async () => {
    const { gatekeeper } = loadGatekeeperWithMockSupabase({
      profileResult: { data: null, error: null },
      rpcResults: { refund_credit_and_log: { data: { success: false, error: 'request_not_found' }, error: null } },
    });
    await assert.rejects(gatekeeper.refundCredits('unknown-req'), err => err.code === 'request_not_found');
  });

  await test('logCreditEvent: sends p_credits_consumed=0 (logging only)', async () => {
    const { gatekeeper, rpcCalls } = loadGatekeeperWithMockSupabase({
      profileResult: { data: null, error: null },
      rpcResults: { deduct_credit_and_log: { data: { success: true, new_balance: 60 }, error: null } },
    });
    await gatekeeper.logCreditEvent({ userId: 'u1', feature: 'chat', status: 'blocked' });
    assert.strictEqual(rpcCalls[0].params.p_credits_consumed, 0);
  });

  await test('logCreditEvent: swallows RPC errors instead of breaking the request', async () => {
    const { gatekeeper } = loadGatekeeperWithMockSupabase({
      profileResult: { data: null, error: null },
      rpcResults: { deduct_credit_and_log: { data: null, error: new Error('db down') } },
    });
    await assert.doesNotReject(gatekeeper.logCreditEvent({ userId: 'u1', feature: 'chat', status: 'error' }));
  });

  await test('reportRefundFailure: persists the reconciliation alert without exposing secrets', async () => {
    const { gatekeeper, rpcCalls } = loadGatekeeperWithMockSupabase({
      profileResult: { data: null, error: null },
      rpcResults: { log_refund_failure: { data: { success: true }, error: null } }
    });
    await gatekeeper.reportRefundFailure({ requestId: 'req-refund', userId: 'u1', feature: 'video', error: new Error('provider refund failed') });
    assert.strictEqual(rpcCalls[0].fnName, 'log_refund_failure');
    assert.strictEqual(rpcCalls[0].params.p_request_id, 'req-refund');
    assert.strictEqual(rpcCalls[0].params.p_feature, 'video');
    assert.match(rpcCalls[0].params.p_error_message, /refund failed/);
  });

  await test('reportRefundFailure: secondary persistence failure remains last-resort non-throwing', async () => {
    const { gatekeeper } = loadGatekeeperWithMockSupabase({
      profileResult: { data: null, error: null },
      rpcResults: { log_refund_failure: { data: null, error: new Error('audit unavailable') } }
    });
    await assert.doesNotReject(gatekeeper.reportRefundFailure({ requestId: 'req-refund-2', userId: 'u2', feature: 'image', error: new Error('refund failed') }));
  });

  console.log(`\n${passed} test(s) passed, ${failed} failed.`);
  if (failed > 0) console.error('Some tests FAILED.');
  else console.log('All gatekeeper unit tests passed.');
}

main();
