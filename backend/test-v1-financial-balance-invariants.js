'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(__dirname, 'v1_quality_financial_balance_invariants.sql'),
  'utf8'
);

assert.match(
  migration,
  /credits_total\s+is\s+null[\s\S]*credits_used\s+is\s+null/i,
  'migration must fail closed on unexpected null credit balances'
);
assert.match(
  migration,
  /alter\s+column\s+credits_total\s+set\s+not\s+null/i,
  'credits_total must be NOT NULL'
);
assert.match(
  migration,
  /alter\s+column\s+credits_used\s+set\s+not\s+null/i,
  'credits_used must be NOT NULL'
);
assert.match(
  migration,
  /credits_total\s*>=\s*0/i,
  'credits_total must be nonnegative'
);
assert.match(
  migration,
  /credits_used\s*>=\s*0/i,
  'credits_used must be nonnegative'
);
assert.match(
  migration,
  /credits_used\s*<=\s*credits_total/i,
  'credits_used must never exceed credits_total'
);
assert.match(
  migration,
  /zuvyr_credit_balance_invariant_preflight_failed/i,
  'migration must abort rather than silently repair inconsistent production data'
);

console.log('PASS: V1 financial credit balance invariants are fail-closed and database-enforced.');
