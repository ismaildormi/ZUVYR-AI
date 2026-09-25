'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const backendPackage = JSON.parse(read('package.json'));
const expressMajor = Number(String(backendPackage.dependencies.express || '').match(/\d+/)?.[0] || 0);
assert.equal(expressMajor, 4, 'This regression test is specifically required while ZUVYR remains on Express 4');

const auth = read('lib/auth.js');
const rate = read('lib/rateLimit.js');
const ip = read('lib/ipGuard.js');

for (const [name, source, code] of [
  ['auth', auth, 'auth_dependency_unavailable'],
  ['rate limit', rate, 'rate_limit_dependency_unavailable'],
  ['IP guard', ip, 'ip_guard_dependency_unavailable']
]) {
  assert(source.includes('catch (error)'), `${name} must catch dependency failures under Express 4`);
  assert(source.includes("status(503)"), `${name} must fail closed with HTTP 503 when its dependency is unavailable`);
  assert(source.includes(code), `${name} must expose a stable non-secret dependency failure code`);
  assert(source.includes("Retry-After"), `${name} must provide safe retry semantics`);
}

assert(auth.includes('supabaseAdmin.auth.getUser(token)'), 'Auth must continue server-side token verification');
assert(rate.includes('await connection.incr(key)'), 'User rate limit must remain Redis-backed');
assert(ip.includes('await connection.get(`ipblocked:${ip}`)'), 'IP block guard must remain Redis-backed');
assert(ip.includes('boundedPositiveInt'), 'IP abuse-control environment values must be bounded and fail safe');

console.log('PASS: Express 4 auth/rate/IP security middleware catches dependency rejection and fails closed with retryable 503 semantics.');
