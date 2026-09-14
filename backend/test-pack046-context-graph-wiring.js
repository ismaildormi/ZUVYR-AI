'use strict';
const fs=require('fs');
const assert=require('assert');

const routes=fs.readFileSync('backend/lib/workspaceRoutes.js','utf8');
const repo=fs.readFileSync('backend/lib/workspaceContextGraphRepository.js','utf8');
const adapter=fs.readFileSync('backend/lib/brainContextGraphAdapter.js','utf8');
const migration=fs.readFileSync('backend/58_pack046_knowledge_context_graph.sql','utf8');
const config=JSON.parse(fs.readFileSync('backend/config/workspace-system.v1.json','utf8'));

for(const needle of [
  "router.get('/context-graph/query'",
  "router.get('/context-graph/brain'",
  "router.get('/context-graph/manager'"
]) assert(routes.includes(needle),needle);

assert(routes.includes('getDefaultWorkspaceContextGraphStore'));
assert.strictEqual(config.pack,46);
assert.strictEqual(config.mode,'context_graph');
assert.strictEqual(config.foundations.contextGraph,true);
assert(repo.includes('refresh_zuvyr_context_graph'));
assert(repo.includes('retrieve_zuvyr_context_graph'));
assert(repo.includes('unrelated_user_scan: false'));
assert(adapter.includes('resolveBrainContextGraph'));
assert(adapter.includes('resolveManagerContextGraph'));
assert(migration.includes('create table if not exists public.zuvyr_context_nodes'));
assert(migration.includes('create table if not exists public.zuvyr_context_edges'));
assert(migration.includes('workspace_integration_connections'));
assert(migration.includes('workspace_plugin_connections'));
assert(migration.includes('zuvyr_task_runs'));
assert(migration.includes('code_deploy_requests'));
console.log('PASS');
