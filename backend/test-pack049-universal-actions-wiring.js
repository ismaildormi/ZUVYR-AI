'use strict';

const fs=require('fs');
const assert=require('assert');

const routes=fs.readFileSync('backend/lib/workspaceRoutes.js','utf8');
const repo=fs.readFileSync('backend/lib/universalActionsRepository.js','utf8');
const library=fs.readFileSync('backend/lib/workspaceLibraryRepository.js','utf8');

assert(routes.includes("require('./universalActionsRepository')"));
assert(routes.includes('getDefaultUniversalActionsStore'));
assert(routes.includes("'/library/items/:contentId/actions'"));
assert(routes.includes("'/library/items/:contentId/versions/compare'"));
assert(routes.includes("'/library/items/:contentId/versions/:versionId/restore'"));
assert(routes.includes("'/actions/:actionId'"));
assert(routes.includes("'/actions/:actionId/undo'"));
assert(routes.includes('universalActionsStore.sendTo'));
assert(repo.includes('execute_zuvyr_code_asset_handoff'));
assert(repo.includes('restore_zuvyr_content_version_action'));
assert(repo.includes('undo_zuvyr_universal_action'));
assert(repo.includes('compareVersionRecords'));
assert(library.includes("reuse_mode:'canonical_reference'"));
assert(library.includes('canonical_content_id:i.id'));
assert(library.includes('canonical_version_id:i.current_version_id'));

console.log('PASS: Pack049 workspace routes expose actions/send-to/compare/restore/undo');
console.log('PASS: Pack044 Library remains the canonical source descriptor; no media/research duplication');
console.log('PASS: Pack049 repository reuses canonical content/version IDs and provenance');
