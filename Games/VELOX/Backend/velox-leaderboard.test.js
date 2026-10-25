'use strict';
// Run: node --test Games/VELOX/Backend/velox-leaderboard.test.js  (no DB needed for these units)
const { test } = require('node:test'); const assert = require('node:assert');
process.env.NODE_ENV = 'test';
const { _test } = require('./velox-leaderboard');
test('periodId is UTC YYYY-MM', () => assert.equal(_test.periodId(new Date(Date.UTC(2026, 9, 25))), '2026-10'));
test('nextReset is first of next month (incl. December rollover)', () => {
  assert.equal(new Date(_test.nextReset(new Date(Date.UTC(2026, 11, 31)))).toISOString(), '2027-01-01T00:00:00.000Z'); });
test('session token round-trips and rejects tampering', () => {
  const t = _test.signSession({ sub: 'u1', exp: Date.now() + 60000 }, 's3cret');
  assert.equal(_test.verifySession(t, 's3cret').sub, 'u1');
  assert.equal(_test.verifySession(t + 'x', 's3cret'), null);
  assert.equal(_test.verifySession(_test.signSession({ sub: 'u1', exp: 0 }, 's3cret'), 's3cret'), null); });
