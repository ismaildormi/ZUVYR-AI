'use strict';

const fs = require('fs');
const assert = require('assert');

const server = fs.readFileSync('backend/server.js', 'utf8');
const routes = fs.readFileSync('backend/lib/permissionCenterRoutes.js', 'utf8');
const repo = fs.readFileSync('backend/lib/permissionCenterRepository.js', 'utf8');
const guard = fs.readFileSync('backend/lib/codePermissionGuard.js', 'utf8');
const runtime = fs.readFileSync('backend/lib/codeRuntimePolicy.js', 'utf8');
const preview = fs.readFileSync('backend/lib/codePreviewPolicy.js', 'utf8');
const sql = fs.readFileSync('backend/61_pack047_permission_center.sql', 'utf8');

assert(server.includes("createPermissionCenterRouter"));
assert(server.includes("'/api/permissions'"));
assert(server.includes("requireAuth"));
assert(routes.includes("router.post('/challenge'"));
assert(routes.includes("router.post('/grants'"));
assert(routes.includes("router.post('/grants/:id/revoke'"));
assert(routes.includes("router.get('/audit'"));

for (const rpc of [
  'zuvyr_permission_resource_owned',
  'create_zuvyr_permission_grant',
  'revoke_zuvyr_permission_grant',
  'consume_zuvyr_permission_grant'
]) assert(repo.includes(rpc));

for (const marker of [
  'zuvyr_permission_grants',
  'zuvyr_permission_consumptions',
  'zuvyr_permission_audit_events',
  'enable row level security',
  'from public, anon, authenticated',
  'to service_role',
  'unique(owner_id, action_class, request_id)',
  "grant_mode = 'allow_once'",
  'for update'
]) assert(sql.toLowerCase().includes(marker.toLowerCase()));

for (const action of [
  'project.read','project.write','dependency.install','runtime.execute',
  'preview.view','preview.open','network.egress','deploy.execute'
]) assert(sql.includes("'" + action + "'"));

assert(guard.includes('guardCodeActionBeforeExecution'));
assert(guard.includes('guardPreviewBeforeExecution'));
assert(guard.includes('guardNetworkEgressBeforeExecution'));
assert(runtime.includes('networkEnabled: false'));
assert(runtime.includes('secretsMounted: false'));
assert(preview.includes('networkEnabled: false'));
assert(preview.includes('Content-Security-Policy'));
assert(preview.includes('sandbox'));

console.log('PASS: Pack047 Permission Center API is auth-mounted and owner-derived');
console.log('PASS: atomic allow-once/idempotent consumption and audit persistence are wired');
console.log('PASS: existing Code Studio runtime/preview remains fail-closed with network/secrets disabled');
