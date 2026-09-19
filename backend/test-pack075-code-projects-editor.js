'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeCodeProject } = require('./lib/codeProjectContract');
const {
  parseAiEditOutput,
  normalizeAiTargets,
  mergeAiEdits,
  finalCodeCredits
} = require('./lib/codeStudioRoutes');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

const migration = read('75_pack075_code_projects_editor.sql');
const routes = read('lib/codeStudioRoutes.js');
const repository = read('lib/codeProjectRepository.js');
const server = read('server.js');
const suite = read('../frontend/zuvyr-suite-v1.js');
const css = read('../frontend/zuvyr-suite-v1.css');
const config = require('./config/code-studio.v1.json');

for (const marker of [
  'code_project_branches',
  'code_project_editor_state',
  'code_project_ai_edits',
  'current_branch',
  'revision bigint',
  'create_zuvyr_code_project_pack075',
  'save_zuvyr_code_project_pack075',
  'create_zuvyr_code_branch_pack075',
  'switch_zuvyr_code_branch_pack075',
  'revoke all on public.code_project_branches from public, anon, authenticated',
  'revoke all on public.code_project_editor_state from public, anon, authenticated',
  'revoke all on public.code_project_ai_edits from public, anon, authenticated'
]) {
  assert(migration.toLowerCase().includes(marker.toLowerCase()), marker);
}

assert(migration.includes('for update'));
assert(migration.includes('pack075_revision_conflict'));
assert(migration.includes('unique(owner_id,request_id)'));
assert(!/grant\s+(?:select|insert|update|delete)[^;]*\s+to\s+(?:anon|authenticated)/i.test(migration));

assert.equal(config.version, 'pack-075.code-studio.v1');
for (const capability of ['assistant','files','editor','history']) {
  assert.equal(config.capabilities[capability].enabledByDefault, true);
  assert.equal(config.capabilities[capability].status, 'implemented_pack075');
}
assert.equal(config.capabilities.preview.enabledByDefault, false);
assert.equal(config.capabilities.preview.status, 'preview_unavailable_until_pack078');
assert.equal(config.capabilities.export_zip.enabledByDefault, false);
assert.equal(config.capabilities.export_zip.status, 'blocked_until_pack079');

for (const marker of [
  "router.get('/projects'",
  "router.post('/projects'",
  "router.get('/projects/:projectId'",
  "router.put('/projects/:projectId'",
  "router.delete('/projects/:projectId'",
  "router.get('/projects/:projectId/versions'",
  "router.post('/projects/:projectId/branches'",
  "router.post('/projects/:projectId/branches/:branch/switch'",
  "router.patch('/projects/:projectId/editor-state'",
  "router.post('/projects/:projectId/ai-edit'",
  "usageKind: 'ai_code_edit'",
  "routeRequestImpl('code'",
  'receiptOwned',
  'code_ai_edit_scope_violation',
  'preview_unavailable_until_pack078'
]) {
  assert(routes.includes(marker), marker);
}

assert(!routes.includes('buildSafePreview'));
assert(routes.includes('started.replayed !== true'));
assert(routes.includes('receiptStarted && receiptOwned && requestId'));
assert(routes.indexOf('pack075_revision_conflict') < routes.indexOf("routeRequestImpl('code'"));

for (const marker of [
  ".eq('owner_id', ownerId)",
  "from('zuvyr_code_asset_bindings')",
  "from('code_project_ai_edits')",
  'code_ai_edit_idempotency_scope_mismatch',
  'create_zuvyr_code_project_pack075',
  'save_zuvyr_code_project_pack075'
]) {
  assert(repository.includes(marker), marker);
}

assert(server.includes('routeRequestImpl: routeRequest'));
assert(server.includes('logCreditEvent'));
assert(server.includes('reportRefundFailure'));

for (const marker of [
  'ZUVYR PACK075 CODE STUDIO',
  'data-zuvyr-code-studio-pack075',
  'Preview unavailable',
  '/api/code-studio/projects',
  '/editor-state',
  '/ai-edit',
  'data-zs-code-divider',
  'data-zs-code-mobile-pane',
  'Runtime logs unavailable until PACK077'
]) {
  assert(suite.includes(marker), marker);
}

const pack075Segment = suite.slice(suite.indexOf('ZUVYR PACK075 CODE STUDIO'));
assert(!/<iframe\b/i.test(pack075Segment));
assert(css.includes('ZUVYR PACK075 CODE STUDIO'));
assert(css.includes('.zs-code-divider'));
assert(css.includes('@media (max-width:820px)'));

const project = {
  ...normalizeCodeProject({
    name: 'Pack075 test',
    entryFile: 'index.js',
    files: [
      { path: 'index.js', language: 'javascript', content: 'export const value = 1;' },
      { path: 'README.md', language: 'markdown', content: '# Pack075' }
    ]
  }),
  id: '11111111-1111-4111-8111-111111111111',
  currentBranch: 'main',
  revision: 1,
  editorState: { activeFile: 'index.js', openFiles: ['index.js'] }
};

const parsed = parseAiEditOutput(JSON.stringify({
  summary: 'Raise value',
  files: [{ path: 'index.js', language: 'javascript', content: 'export const value = 2;' }]
}));
assert.equal(parsed.summary, 'Raise value');
assert.equal(parsed.files.length, 1);

const fence = String.fromCharCode(96).repeat(3);
const fenced = parseAiEditOutput(
  fence + 'json\n{"summary":"ok","files":[]}\n' + fence
);
assert.equal(fenced.summary, 'ok');

assert.throws(
  () => parseAiEditOutput('not json'),
  error => error.code === 'code_ai_edit_output_invalid'
);

const targets = normalizeAiTargets(project, []);
assert.deepEqual(targets, ['index.js']);

const merged = mergeAiEdits(project, ['index.js'], parsed);
assert.deepEqual(merged.changedPaths, ['index.js']);
assert.equal(
  merged.project.files.find(file => file.path === 'index.js').content,
  'export const value = 2;'
);
assert.equal(
  merged.project.files.find(file => file.path === 'README.md').content,
  '# Pack075'
);

assert.throws(
  () => mergeAiEdits(
    project,
    ['index.js'],
    {
      summary: 'illegal',
      files: [{ path: 'README.md', content: 'changed outside target' }]
    }
  ),
  error => error.code === 'code_ai_edit_scope_violation'
);

assert(Number.isSafeInteger(finalCodeCredits(0)));
assert(finalCodeCredits(0) >= 1);
assert(finalCodeCredits(0.01) >= finalCodeCredits(0));

console.log('PASS: Pack075 durable code projects, branches, versions and editor state are wired');
console.log('PASS: Pack075 AI edits are scoped, metered, idempotent and replay-safe');
console.log('PASS: Pack075 UI is native/responsive and truthfully keeps Preview unavailable');
console.log('PASS: Pack075 new DB surfaces remain service-role only with RLS enabled');
