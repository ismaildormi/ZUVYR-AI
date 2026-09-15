'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

const migration=read('backend/64_pack052_attachment_identity.sql');
assert.match(migration,/add column if not exists canonical_asset_id uuid/i);
assert.match(migration,/references public\.zuvyr_assets\(id\)/i);
assert.match(migration,/conversation_assets_canonical_asset_idx/i);
assert.match(migration,/pack052_conversation_asset_identity\(\)/i);
assert.match(migration,/from public\.zuvyr_assets a[\s\S]*a\.owner_id = new\.owner_id[\s\S]*a\.sha256 = lower\(new\.sha256\)/i);
assert.match(migration,/public\.register_zuvyr_asset\(/i);
assert.match(migration,/before insert or update of sha256, scan_status, canonical_content_id/i);
assert.match(migration,/revoke all on function public\.pack052_conversation_asset_identity\(\)[\s\S]*from public, anon, authenticated/i);
assert.match(migration,/grant execute on function public\.pack052_conversation_asset_identity\(\)[\s\S]*to service_role/i);
assert.match(migration,/update public\.conversation_assets[\s\S]*where canonical_asset_id is null/i);

const memory=read('backend/lib/conversationMemory.js');
assert.match(memory,/listReferencedAttachmentIds/);
assert.match(memory,/resolveAttachmentAssets/);
assert.match(memory,/\.from\('zuvyr_assets'\)[\s\S]*\.eq\('owner_id', ownerId\)[\s\S]*\.in\('id', missing\)/);
assert.match(memory,/attachment_id: asset\.id/);
assert.match(memory,/legacy_asset_id/);
assert.match(memory,/canonical_asset_id/);

const context=read('backend/lib/conversationAttachmentContext.js');
assert.match(context,/typeof store\.resolveAttachmentAssets === 'function'/);
assert.match(context,/asset\.requested_attachment_id,[\s\S]*asset\.attachment_id,[\s\S]*asset\.canonical_asset_id,[\s\S]*asset\.legacy_asset_id/);
assert.match(context,/attachmentIds: assets\.map\(asset => String\([\s\S]*asset\.attachment_id[\s\S]*asset\.canonical_asset_id/);
assert.match(context,/not found or is not owned/);

const routes=read('backend/lib/conversationRoutes.js');
assert.match(routes,/function attachmentPublicRecord\(asset\)/);
assert.match(routes,/attachment_id: canonicalId \|\| legacyId/);
assert.match(routes,/listReferencedAttachmentIds/);
assert.match(routes,/resolveAttachmentAssets/);

const validation=read('backend/lib/inputValidation.js');
assert.match(validation,/feature !== 'chat' && feature !== 'code'/);
assert.match(validation,/supported in Chat and Code Studio/);

const server=read('backend/server.js');
assert.match(server,/if \(hasDurableAttachments && !isCode\) \{[\s\S]*attachmentAnalysisReservation/);
assert.match(server,/if \(attachmentAnalysisReservation\) \{[\s\S]*await settleCredits\([\s\S]*attachmentAnalysisRequestId/);

const ui=read('frontend/zuvyr-chat-workspace-v1.js');
assert.match(ui,/entryForCanonicalAsset/);
assert.match(ui,/completed\?\.asset\?\.attachment_id \|\| completed\?\.asset\?\.canonical_asset_id/);
assert.match(ui,/\[asset\?\.attachment_id,asset\?\.canonical_asset_id,asset\?\.legacy_asset_id,asset\?\.id\]/);
assert.match(ui,/const openWorkspacePicker = async/);
assert.match(ui,/\/api\/workspace\/library\/items\?/);
assert.match(ui,/\/api\/workspace\/projects\?limit=30/);
assert.match(ui,/\/api\/workspace\/projects\/\$\{encodeURIComponent\(project\.id\)\}/);
assert.match(ui,/data-action="recent"/);
assert.match(ui,/data-action="project"/);
assert.match(ui,/data-action="library"/);
assert.match(ui,/zuvyr-attachment-retry/);
assert.match(ui,/document\.querySelectorAll\('#feature-chat \.chat-input-row, #feature-code \.chat-input-row'\)/);
assert.match(ui,/const input = composerFor\(row\)/);
assert.match(ui,/window\.__zuvyrOpenAttachmentPicker/);

const html=read('frontend/index.html');
assert.strictEqual((html.match(/attachmentIds:/g)||[]).length,2,'both duplicated runtimes must carry attachmentIds');
assert.match(html,/feature === 'chat' \|\| feature === 'code'/);

const css=read('frontend/zuvyr-chat-workspace-v1.css');
assert.match(css,/:is\(#feature-chat,#feature-code\) \.zuvyr-attachment-list/);
assert.match(css,/\.zuvyr-workspace-picker-backdrop/);
assert.match(css,/\.zuvyr-workspace-picker-add/);

console.log('PASS: Pack052 canonical attachment identity, Chat/Code reuse, picker wiring, retry, persistence and billing guards');
