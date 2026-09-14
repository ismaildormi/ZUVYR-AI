'use strict';

const fs = require('fs');
const assert = require('assert');

const ux = fs.readFileSync('frontend/zuvyr-unified-ux-v1.js','utf8');
const css = fs.readFileSync('frontend/zuvyr-unified-ux-v1.css','utf8');
const index = fs.readFileSync('frontend/index.html','utf8');
const suite = fs.readFileSync('frontend/zuvyr-suite-v1.js','utf8');
const routes = fs.readFileSync('backend/lib/workspaceRoutes.js','utf8');

for (const id of ['projects','library','creations','research','code','history','settings','usage','permissions','memory','analytics']) {
  assert(ux.includes("'" + id + "'") || ux.includes('"' + id + '"'), id);
}
for (const marker of [
  'aria-haspopup="menu"',
  'aria-expanded="false"',
  'role="menu"',
  'role="menuitem"',
  "event.key === 'Escape'",
  'zuvyr:pack050:navigate',
  'No provider or billing action runs on open',
  'window.ZuvyrUnifiedUX'
]) assert(ux.includes(marker), marker);

assert(ux.includes('.nav-item[data-open="'));
assert(ux.includes('[data-open="'));
assert(!ux.includes("classList.add('active')"));
assert(!ux.includes('fetch('));
assert(!ux.includes('authFetch('));

assert(css.includes('@media (max-width:768px)'));
assert(css.includes('html[dir="rtl"]'));
assert(css.includes(':focus-visible'));
assert(css.includes('prefers-reduced-motion'));

assert(index.includes('/zuvyr-unified-ux-v1.css'));
assert(index.includes('/zuvyr-unified-ux-v1.js'));
assert(index.includes('/zuvyr-suite-v1.js'));

assert(suite.includes("library:[['All assets','Search, filters and folders'],['Universal actions','Ask, Edit, Verify, Translate, Search and Save'],['Handoffs & versions','Send-To, compare, restore and Undo']]"));
assert(suite.includes("projects:[['Work context','Projects, linked content and task context'],['Cross-surface handoffs','Library, Research, Code and media references'],['History & versions','Decisions, affected files and reversible results']]"));
assert(suite.includes("settings:[['Account & preferences','Profile, language and appearance'],['Plans, credits & usage','Allowance, top-up credits and billing visibility'],['Privacy & permissions','Permission Center, Memory and data controls']]"));

for (const route of [
  "router.get('/library/items'",
  "router.post('/library/items/:contentId/actions'",
  "versions/compare",
  "versions/:versionId/restore",
  "router.post('/actions/:actionId/undo'",
  "router.get('/projects'",
  "router.get('/memory/preferences'"
]) assert(routes.includes(route), route);

console.log('PASS');
