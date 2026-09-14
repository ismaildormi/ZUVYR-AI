'use strict';
const assert = require('assert');
const {
  normalizeFilters,
  normalizeCreate,
  normalizePatch,
  MEMORY_CATEGORIES
} = require('./lib/workspaceMemoryRepository');

assert(MEMORY_CATEGORIES.has('preference'));
assert(MEMORY_CATEGORIES.has('decision'));

const a = normalizeCreate({
  scope:'account', category:'preference', content:'Prefers concise answers.'
});
assert.strictEqual(a.scope,'account');
assert.strictEqual(a.projectId,null);

const p = normalizeCreate({
  scope:'project',
  category:'decision',
  content:'Use the canonical asset pipeline.',
  projectId:'11111111-1111-4111-8111-111111111111'
});
assert.strictEqual(p.scope,'project');

assert.deepStrictEqual(normalizePatch({content:'Changed'}), {content:'Changed'});
assert.strictEqual(normalizeFilters({limit:999}).limit,100);

assert.throws(
  ()=>normalizeCreate({scope:'project',category:'fact',content:'x'}),
  e=>e.code==='workspace_memory_scope_invalid'
);
assert.throws(
  ()=>normalizeCreate({scope:'account',category:'bad',content:'x'}),
  e=>e.code==='workspace_memory_input_invalid'
);
console.log('PASS');
