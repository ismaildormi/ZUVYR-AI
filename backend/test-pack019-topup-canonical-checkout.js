'use strict';

const assert = require('node:assert/strict');

const stripeClientPath =
  require.resolve(
    './lib/stripeClient'
  );
const routePath =
  require.resolve(
    './createTopupSession'
  );

const sessions = [];

const stripe = {
  checkout: {
    sessions: {
      create: async payload => {
        sessions.push(payload);
        return {
          url:
            'https://checkout.test/session'
        };
      }
    }
  }
};

require.cache[stripeClientPath] = {
  id: stripeClientPath,
  filename: stripeClientPath,
  loaded: true,
  exports: {
    getStripeClient: () =>
      stripe,
    missingEnvironmentVariables: keys =>
      keys.filter(
        key =>
          typeof process.env[key] !==
            'string' ||
          !process.env[key].trim()
      ),
    sendBillingUnavailable: (
      res,
      missing = [],
      code = 'billing_not_configured'
    ) =>
      res.status(503).json({
        status: 'error',
        code,
        missing
      }),
    normalizeAppUrl: () =>
      'https://zuvyr.test',
    billingV1IsActive: () =>
      String(process.env.ZUVYR_BILLING_V1_ACTIVE || '').toLowerCase() === 'true',
    billingExecutionStatus: () => ({
      allowed: true,
      blockers: []
    })
  }
};

delete require.cache[routePath];
const router =
  require('./createTopupSession');

const layer =
  router.stack.find(
    item =>
      item.route?.path === '/'
  );

assert(layer);

const handler =
  layer.route.stack[
    layer.route.stack.length - 1
  ].handle;

const fs = require('node:fs');
const path = require('node:path');
const topupSource = fs.readFileSync(
  path.join(__dirname, 'createTopupSession.js'),
  'utf8'
);

assert(
  topupSource.includes(
    "success_url: `${appUrl}/?topup=true`"
  ),
  'Top-up redirect must preserve the normalized APP_URL root source contract.'
);
assert(
  topupSource.includes('billingV1IsActive') &&
  topupSource.includes('billingExecutionStatus'),
  'Top-up checkout must share the explicit billing activation and execution gates.'
);

function responseMock() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

async function invoke(
  credits,
  env
) {
  const before = { ...process.env };

  for (const key of [
    'ZUVYR_BILLING_V1_ACTIVE',
    'ZUVYR_STRIPE_CANONICAL_CATALOG_ACTIVE',
    'STRIPE_BILLING_MODE',
    'STRIPE_SECRET_KEY',
    'APP_URL',
    'STRIPE_TOPUP_STANDARD_PRICE_ID',
    'STRIPE_TOPUP_BULK_PRICE_ID',
    'TOPUP_PRICE_PER_CREDIT_USD',
    'MIN_TOPUP_USD',
    'MAX_TOPUP_CREDITS'
  ]) {
    delete process.env[key];
  }

  Object.assign(
    process.env,
    env || {}
  );

  sessions.length = 0;

  const res =
    responseMock();

  try {
    await handler(
      {
        userId:
          '11111111-1111-4111-8111-111111111111',
        userEmail:
          'owner@example.test',
        body: {
          credits
        }
      },
      res
    );

    return {
      res,
      payload:
        sessions[0] || null
    };
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in before)) {
        delete process.env[key];
      }
    }

    Object.assign(
      process.env,
      before
    );
  }
}

const baseBillingEnv = {
  ZUVYR_BILLING_V1_ACTIVE: 'true',
  STRIPE_BILLING_MODE: 'test',
  STRIPE_SECRET_KEY: 'sk_test_placeholder',
  APP_URL: 'https://zuvyr.test'
};

(async () => {
  let result =
    await invoke(
      1000,
      {
        ...baseBillingEnv,
        ZUVYR_STRIPE_CANONICAL_CATALOG_ACTIVE:
          'true',
        STRIPE_TOPUP_STANDARD_PRICE_ID:
          'price_topup_standard_test',
        STRIPE_TOPUP_BULK_PRICE_ID:
          'price_topup_bulk_test'
      }
    );

  assert.equal(
    result.res.statusCode,
    200
  );
  assert.equal(
    result.payload.line_items[0].price,
    'price_topup_standard_test'
  );
  assert.equal(
    result.payload.line_items[0].quantity,
    1000
  );
  assert.equal(
    result.payload.metadata.stripeBillingUnitCents,
    '1'
  );
  assert.equal(
    result.payload.metadata.stripeCheckoutQuantity,
    '1000'
  );
  assert.equal(
    result.payload.metadata.type,
    'topup'
  );
  assert.equal(
    result.payload.metadata.credits,
    '1000'
  );
  assert.equal(
    result.payload.metadata.topupTier,
    'standard'
  );
  assert.equal(
    result.res.body.priceUsd,
    10
  );

  result =
    await invoke(
      5000,
      {
        ...baseBillingEnv,
        ZUVYR_STRIPE_CANONICAL_CATALOG_ACTIVE:
          'true',
        STRIPE_TOPUP_STANDARD_PRICE_ID:
          'price_topup_standard_test',
        STRIPE_TOPUP_BULK_PRICE_ID:
          'price_topup_bulk_test'
      }
    );

  assert.equal(
    result.payload.line_items[0].price,
    'price_topup_bulk_test'
  );
  assert.equal(
    result.payload.line_items[0].quantity,
    4000
  );
  assert.equal(
    result.payload.metadata.stripeBillingUnitCents,
    '1'
  );
  assert.equal(
    result.payload.metadata.stripeCheckoutQuantity,
    '4000'
  );
  assert.equal(
    result.payload.metadata.topupTier,
    'bulk'
  );
  assert.equal(
    result.res.body.priceUsd,
    40
  );

  result =
    await invoke(
      1000,
      {
        ...baseBillingEnv,
        ZUVYR_STRIPE_CANONICAL_CATALOG_ACTIVE:
          'true'
      }
    );

  assert.equal(
    result.res.statusCode,
    503
  );
  assert.equal(
    result.payload,
    null
  );

  result =
    await invoke(
      1000,
      baseBillingEnv
    );

  assert.equal(
    result.res.statusCode,
    200
  );
  assert(
    result.payload
      .line_items[0]
      .price_data
  );
  assert.equal(
    result.payload
      .line_items[0]
      .price_data
      .unit_amount,
    1000
  );
  assert.equal(
    result.payload
      .line_items[0]
      .quantity,
    1
  );
  assert.equal(
    result.payload.metadata.type,
    'topup'
  );
  assert.equal(
    result.payload.metadata.credits,
    '1000'
  );
  assert.equal(
    result.res.body.canonicalCatalog,
    false
  );

  result = await invoke(
    1000,
    {
      STRIPE_BILLING_MODE: 'test',
      STRIPE_SECRET_KEY: 'sk_test_placeholder',
      APP_URL: 'https://zuvyr.test'
    }
  );

  assert.equal(result.res.statusCode, 503);
  assert.equal(result.res.body.code, 'billing_not_active');
  assert.equal(result.payload, null);

  console.log(
    'PASS: canonical top-up checkout uses one-cent Stripe billing units while preserving standard/bulk economics'
  );
  console.log(
    'PASS: canonical mode fails closed when required Price bindings are absent'
  );
  console.log(
    'PASS: legacy dynamic price_data checkout remains compatible only behind the explicit billing activation gate'
  );
  console.log(
    'PASS: top-up checkout is disabled when ZUVYR_BILLING_V1_ACTIVE is not true'
  );
  console.log(
    'NETWORK / DATABASE / STRIPE / MODEL CALLS: NONE'
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
