'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'ci-release-gate.yml'),
  'utf8'
);

function has(text) {
  assert.ok(workflow.includes(text), `missing CI contract: ${text}`);
}

const CHECKOUT_SHA = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';
const SETUP_NODE_SHA = 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020';

for (const required of [
  'name: ZUVYR Release Quality Gate',
  'push:',
  'pull_request:',
  '- main',
  'permissions:',
  'contents: read',
  'concurrency:',
  'cancel-in-progress: true',
  'release-quality:',
  'backend-quality:',
  "node-version: '22'",
  'cache-dependency-path: package-lock.json',
  'cache-dependency-path: backend/package-lock.json',
  'run: npm ci',
  'run: node tools/test-github-action-pins.cjs',
  'run: npm audit --omit=dev --audit-level=high',
  'run: node tools/test-release-validator-scope.js',
  'run: npm run validate:release',
  'run: node tools/test-ci-release-gate.js',
  'run: npm run test:unit',
  'run: npm run test:maintenance',
  'run: node test-readiness-gates.js',
  'run: node test-readiness-lifecycle.js',
  CHECKOUT_SHA,
  SETUP_NODE_SHA,
]) {
  has(required);
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

assert.strictEqual(
  (workflow.match(new RegExp(escapeRegex(CHECKOUT_SHA), 'g')) || []).length,
  2,
  'both jobs must use the pinned checkout action'
);

assert.strictEqual(
  (workflow.match(new RegExp(escapeRegex(SETUP_NODE_SHA), 'g')) || []).length,
  2,
  'both jobs must use the pinned setup-node action'
);

assert.ok(
  !/actions\/(checkout|setup-node)@v\d+/.test(workflow),
  'quality gate actions must be commit-SHA pinned'
);

assert.ok(
  !/\bsecrets\./.test(workflow),
  'quality gate must not require repository secrets'
);

assert.ok(
  !/\b(railway|vercel)\s+(up|deploy|redeploy)\b/i.test(workflow) &&
  !/production-deploy\.sh/.test(workflow),
  'quality gate must validate only; it must not deploy'
);

console.log('PASS: ZUVYR CI release quality gate contract verified.');
