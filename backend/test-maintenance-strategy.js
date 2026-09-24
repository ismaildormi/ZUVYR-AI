'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  STRATEGY,
  LOCK_KEY,
  maintenanceWindowKey,
  runMaintenanceOnce,
  requireMaintenanceStrategy,
} = require('./lib/maintenanceCoordinator');

class FakeRedis {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  async set(key, value, ...args) {
    let nx = false;
    for (const arg of args) {
      if (String(arg).toUpperCase() === 'NX') nx = true;
    }
    if (nx && this.values.has(key)) return null;
    this.values.set(key, String(value));
    return 'OK';
  }

  async eval(_script, _keyCount, key, token) {
    if (this.values.get(key) === token) {
      this.values.delete(key);
      return 1;
    }
    return 0;
  }
}

function fakeSupabase(results) {
  const calls = [];
  return {
    calls,
    async rpc(name) {
      calls.push(name);
      const configured = results[name];
      if (configured instanceof Error) {
        return { data: null, error: configured };
      }
      return { data: configured ?? 0, error: null };
    },
  };
}

const quietLogger = {
  log() {},
  error() {},
};

const healthyHygiene = Object.freeze({
  version: 'zuvyr-runtime-hygiene.v1',
  ok: true,
  rls_no_policy_count: 0,
  unindexed_fk_count: 0,
  exposed_security_definer_count: 0,
});

const cleanPkce = Object.freeze({
  success: true,
  ownersCleaned: 0,
  secretsDeleted: 0,
  secretValuesExposed: false,
});

async function testSuccessAndDuplicate() {
  const redis = new FakeRedis();
  const db = fakeSupabase({
    check_credit_audit_mismatches: 2,
    reset_monthly_credits: 3,
    zuvyr_runtime_hygiene_audit: healthyHygiene,
    cleanup_expired_workspace_oauth_pkce_pack089: cleanPkce,
  });
  const now = Date.UTC(2026, 8, 11, 22, 30, 0);

  const first = await runMaintenanceOnce({
    redis,
    supabaseAdmin: db,
    nowMs: now,
    logger: quietLogger,
  });

  assert.strictEqual(first.status, 'success');
  assert.strictEqual(first.duplicate, false);
  assert.strictEqual(first.receipt.newAlertsRaised, 2);
  assert.strictEqual(first.receipt.accountsReset, 3);
  assert.strictEqual(first.receipt.hygiene.ok, true);
  assert.strictEqual(first.receipt.hygiene.rlsNoPolicyCount, 0);
  assert.strictEqual(first.receipt.hygiene.unindexedFkCount, 0);
  assert.strictEqual(first.receipt.hygiene.exposedSecurityDefinerCount, 0);
  assert.strictEqual(first.receipt.oauthPkceCleanup.success, true);
  assert.strictEqual(first.receipt.oauthPkceCleanup.secretValuesExposed, false);
  assert.deepStrictEqual(db.calls, [
    'check_credit_audit_mismatches',
    'reset_monthly_credits',
    'zuvyr_runtime_hygiene_audit',
    'cleanup_expired_workspace_oauth_pkce_pack089',
  ]);

  const second = await runMaintenanceOnce({
    redis,
    supabaseAdmin: db,
    nowMs: now + 1000,
    logger: quietLogger,
  });

  assert.strictEqual(second.status, 'duplicate_suppressed');
  assert.strictEqual(second.duplicate, true);
  assert.strictEqual(db.calls.length, 4, 'duplicate must make no additional RPC calls');
}

async function testConcurrentLockSuppression() {
  const redis = new FakeRedis();
  redis.values.set(LOCK_KEY, 'other-run');
  const db = fakeSupabase({});
  const result = await runMaintenanceOnce({
    redis,
    supabaseAdmin: db,
    nowMs: Date.UTC(2026, 8, 11, 23, 0, 0),
    logger: quietLogger,
  });

  assert.strictEqual(result.status, 'already_running');
  assert.strictEqual(result.duplicate, true);
  assert.strictEqual(db.calls.length, 0);
}

async function testFailureAllowsRetry() {
  const redis = new FakeRedis();
  const firstDb = fakeSupabase({
    check_credit_audit_mismatches: 1,
    reset_monthly_credits: new Error('reset unavailable'),
    zuvyr_runtime_hygiene_audit: healthyHygiene,
    cleanup_expired_workspace_oauth_pkce_pack089: cleanPkce,
  });
  const now = Date.UTC(2026, 8, 12, 0, 0, 0);

  const first = await runMaintenanceOnce({
    redis,
    supabaseAdmin: firstDb,
    nowMs: now,
    logger: quietLogger,
  });

  assert.strictEqual(first.status, 'partial');
  assert.strictEqual(
    await redis.get(maintenanceWindowKey(now)),
    null,
    'failed/partial run must not create the success marker'
  );

  const retryDb = fakeSupabase({
    check_credit_audit_mismatches: 0,
    reset_monthly_credits: 0,
    zuvyr_runtime_hygiene_audit: healthyHygiene,
    cleanup_expired_workspace_oauth_pkce_pack089: cleanPkce,
  });
  const retry = await runMaintenanceOnce({
    redis,
    supabaseAdmin: retryDb,
    nowMs: now + 2000,
    logger: quietLogger,
  });

  assert.strictEqual(retry.status, 'success');
  assert.strictEqual(retryDb.calls.length, 4);
}

async function testHygieneDriftBlocksSuccessMarker() {
  const redis = new FakeRedis();
  const now = Date.UTC(2026, 8, 12, 0, 30, 0);
  const db = fakeSupabase({
    check_credit_audit_mismatches: 0,
    reset_monthly_credits: 0,
    zuvyr_runtime_hygiene_audit: {
      version: 'zuvyr-runtime-hygiene.v1',
      ok: false,
      rls_no_policy_count: 1,
      unindexed_fk_count: 2,
      exposed_security_definer_count: 0,
    },
    cleanup_expired_workspace_oauth_pkce_pack089: cleanPkce,
  });

  const result = await runMaintenanceOnce({
    redis,
    supabaseAdmin: db,
    nowMs: now,
    logger: quietLogger,
  });

  assert.strictEqual(result.status, 'partial');
  assert.strictEqual(result.receipt.hygiene.ok, false);
  assert.strictEqual(result.receipt.hygiene.rlsNoPolicyCount, 1);
  assert.strictEqual(result.receipt.hygiene.unindexedFkCount, 2);
  assert(
    result.receipt.errors.some(item => item.step === 'zuvyr_runtime_hygiene_audit'),
    'hygiene drift must be recorded in the maintenance receipt'
  );
  assert.strictEqual(
    await redis.get(maintenanceWindowKey(now)),
    null,
    'hygiene drift must never create a success marker'
  );
}

async function testPkceCleanupFailureBlocksSuccessMarker() {
  const redis = new FakeRedis();
  const now = Date.UTC(2026, 8, 12, 1, 0, 0);
  const db = fakeSupabase({
    check_credit_audit_mismatches: 0,
    reset_monthly_credits: 0,
    zuvyr_runtime_hygiene_audit: healthyHygiene,
    cleanup_expired_workspace_oauth_pkce_pack089: new Error('cleanup unavailable'),
  });

  const result = await runMaintenanceOnce({
    redis,
    supabaseAdmin: db,
    nowMs: now,
    logger: quietLogger,
  });

  assert.strictEqual(result.status, 'partial');
  assert(
    result.receipt.errors.some(
      item => item.step === 'cleanup_expired_workspace_oauth_pkce_pack089'
    ),
    'PKCE cleanup failure must be recorded in the maintenance receipt'
  );
  assert.strictEqual(
    await redis.get(maintenanceWindowKey(now)),
    null,
    'PKCE cleanup failure must never create a success marker'
  );
}

function mockResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function testStrategyGate() {
  const previous = process.env.MAINTENANCE_STRATEGY;
  delete process.env.MAINTENANCE_STRATEGY;
  const disabled = mockResponse();
  let disabledNext = false;
  requireMaintenanceStrategy({}, disabled, () => { disabledNext = true; });
  assert.strictEqual(disabled.statusCode, 503);
  assert.strictEqual(disabled.body.code, 'maintenance_strategy_disabled');
  assert.strictEqual(disabledNext, false);

  process.env.MAINTENANCE_STRATEGY = STRATEGY;
  const enabled = mockResponse();
  let enabledNext = false;
  requireMaintenanceStrategy({}, enabled, () => { enabledNext = true; });
  assert.strictEqual(enabledNext, true);

  if (previous === undefined) delete process.env.MAINTENANCE_STRATEGY;
  else process.env.MAINTENANCE_STRATEGY = previous;
}

function testSourceContracts() {
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const runner = fs.readFileSync(path.join(__dirname, 'maintenanceRunner.js'), 'utf8');
  const coordinator = fs.readFileSync(path.join(__dirname, 'lib', 'maintenanceCoordinator.js'), 'utf8');

  const maintenanceRouteGuardOrder =
    /app\.post\(\s*['"]\/internal\/maintenance\/run['"]\s*,\s*requireMaintenanceStrategy\s*,\s*requireCronAccess\s*,/m;

  assert(
    maintenanceRouteGuardOrder.test(server),
    'maintenance route must use strategy gate before the secret guard'
  );
  assert(
    !runner.includes('?token=') &&
      !runner.includes('CRON_SECRET=') &&
      runner.includes("'x-cron-secret': secret"),
    'runner must keep CRON_SECRET in a header, never in URL/log output'
  );
  assert(
    coordinator.includes("supabaseAdmin.rpc('zuvyr_runtime_hygiene_audit')"),
    'maintenance must continuously enforce the ZUVYR runtime hygiene invariant'
  );
  assert(
    coordinator.includes("'cleanup_expired_workspace_oauth_pkce_pack089'"),
    'maintenance must continuously clean expired PACK089 PKCE Vault secrets'
  );
}

(async () => {
  testStrategyGate();
  testSourceContracts();
  await testSuccessAndDuplicate();
  await testConcurrentLockSuppression();
  await testFailureAllowsRetry();
  await testHygieneDriftBlocksSuccessMarker();
  await testPkceCleanupFailureBlocksSuccessMarker();
  console.log('PASS: Pack 005 maintenance strategy tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
