'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = rel => fs.readFileSync(path.join(__dirname, rel), 'utf8').replace(/^\uFEFF/, '');
const json = rel => JSON.parse(read(rel));

const checkpoint = json('config/code-voice-checkpoint-h.v1.json');
const audio = json('config/audio-system.v1.json');
const studio = json('config/code-studio.v1.json');
const sandbox = json('config/code-sandbox.v1.json');
const runtime = json('config/code-runtime.v1.json');
const release = json('config/code-release.v1.json');
const flags = json('config/feature-flags.json');
const pkg = json('package.json');

const usageBridge = read('lib/codeStudioUsageBridge.js');
const codeRoutes = read('lib/codeStudioRoutes.js');
const codeProjectRepo = read('lib/codeProjectRepository.js');
const runtimeExecutor = read('lib/codeRuntimeExecutor.js');
const releaseZip = read('lib/codeReleaseZip.js');
const releaseRoutes = read('lib/codeReleaseRoutes.js');
const universal = read('lib/universalActionsRepository.js');
const gatekeeper = read('gatekeeper.js');
const ledgerSql = read('44_pack013_unified_usage_ledger.sql');
const pack049Sql = read('63_pack049_universal_actions_send_to_undo.sql');
const voiceFrontend = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'zuvyr-chat-workspace-v1.js'),
  'utf8'
);
const suiteFrontend = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'zuvyr-suite-v1.js'),
  'utf8'
);

assert.equal(checkpoint.version, 'pack-080.code-voice-checkpoint-h.v1');
assert.equal(checkpoint.packId, '080');
assert.deepEqual(
  checkpoint.dependencies,
  ['013','015','035','047','049','061','062','063','064','065','071','072','073','074','075','076','077','078','079']
);
assert.equal(checkpoint.checkpoint.progressionWhenDeferred, 'LOCKED_ENGINEERING_VERIFIED');
assert.equal(checkpoint.checkpoint.canonicalLockedVerifiedRequiresLiveEvidence, true);
assert.equal(checkpoint.unifiedAccounting.liveBillingAllowed, false);

// Voice truth: browser realtime is implemented, but physical authenticated mic proof is not invented.
assert.equal(audio.operations.voice_chat.enabledByDefault, true);
assert.equal(audio.operations.voice_chat.status, 'implemented_pack073_browser_runtime');
assert.equal(audio.voicePrivacy.rawAudioStoredByZuvyr, false);
assert.equal(audio.voicePrivacy.explicitMicrophoneConsentRequired, true);
assert.equal(audio.voicePrivacy.globalStopRequired, true);
assert.equal(audio.pack073.realtimeVoice.bargeIn, true);
assert.equal(audio.pack073.realtimeVoice.globalStop, true);
assert.equal(checkpoint.voice.realtimeVoice.authenticatedPhysicalMicAcceptance, 'deferred');
assert.equal(checkpoint.voice.realtimeVoice.canonicalLiveClaim, false);

assert.equal(audio.operations.transcription.status, 'implemented_pack071_paid_live_deferred');
assert.equal(audio.operations.text_to_speech.status, 'implemented_pack072_paid_live_deferred');
assert.equal(audio.operations.music_generation.status, 'implemented_pack074_paid_live_deferred');
assert.equal(audio.operations.translate_dub.enabledByDefault, false);
assert.equal(audio.operations.translate_dub.status, 'blocked_provider_output_contract_unverified');

for (const marker of [
  'ZUVYR PACK073 REALTIME VOICE CONTROLLER',
  'Retry STOP',
  'barge_in',
  "stopSession(button, 'timeout')"
]) {
  assert(voiceFrontend.includes(marker), 'Pack073 frontend marker missing: ' + marker);
}

// Durable Code Studio truth.
assert.equal(studio.version, 'pack-079.code-studio.v1');
assert.equal(studio.capabilities.files.enabledByDefault, true);
assert.equal(studio.capabilities.editor.enabledByDefault, true);
assert.equal(studio.capabilities.history.enabledByDefault, true);
assert.equal(studio.capabilities.preview.status, 'pack078_product_layer_live_deferred');
assert.equal(studio.capabilities.deploy.enabledByDefault, false);
assert.equal(studio.capabilities.deploy.status, 'pack079_implemented_live_deferred_m16');

for (const marker of [
  "router.post('/projects/:projectId/ai-edit'",
  "router.patch('/projects/:projectId/editor-state'",
  "router.post('/projects/:projectId/branches/:branch/switch'",
  "usageKind: 'ai_code_edit'"
]) {
  assert(codeRoutes.includes(marker), 'Code project marker missing: ' + marker);
}
assert(codeProjectRepo.includes("from('zuvyr_code_asset_bindings')"));
assert(codeProjectRepo.includes("from('code_project_ai_edits')"));

for (const marker of [
  'ZUVYR PACK075 CODE STUDIO',
  'data-zs-code-ai-apply',
  'data-zs-code-preview-frame',
  'schedulePostSaveValidation',
  'pollRepair'
]) {
  assert(suiteFrontend.includes(marker), 'Code Studio product marker missing: ' + marker);
}

// Sandbox/runtime stays fail-closed until exact live prerequisites are proven.
assert.equal(sandbox.provider.externalGate, 'M15');
assert.equal(sandbox.provider.liveEnabledByDefault, false);
assert.equal(sandbox.provider.pricingVerificationStatus, 'unverified');
assert.equal(sandbox.network.defaultMode, 'deny-all');
assert.equal(sandbox.network.allowAllForbidden, true);
assert.equal(sandbox.preview.rawProviderRoutesReturnedToClient, false);

assert.equal(runtime.live.enabledByDefault, false);
assert.equal(runtime.live.requiresSandboxGate, 'M15');
assert.equal(runtime.live.requiresVerifiedRuntimePricing, true);
assert.equal(runtime.preview.transport, 'pack076_authenticated_proxy');
assert.equal(runtime.preview.rawProviderRouteAllowed, false);
assert.equal(runtime.repair.enabled, true);
assert.equal(runtime.repair.maxAttempts, 2);
assert.equal(runtime.repair.autoApply, false);
assert.equal(runtime.repair.everyAttemptMetered, true);

for (const flag of ['code_terminal','code_runtime','code_dependencies','code_build','code_test','code_deploy']) {
  assert.equal(flags[flag].enabled, false, flag + ' must stay non-live at Checkpoint H');
}

// Runtime billing and repair are unified, not separate credit systems.
for (const kind of ['ai_code_edit','build_job','sandbox_runtime','preview_runtime']) {
  assert(usageBridge.includes("'" + kind + "'"), 'usage bridge missing ' + kind);
}
assert(runtimeExecutor.includes("usageKind: 'sandbox_runtime'"));
assert(runtimeExecutor.includes('settleUsage'));
assert(runtimeExecutor.includes('refundUsage'));
assert(gatekeeper.includes("'ai_code_edit'"));
assert(ledgerSql.includes("'generation'"));

// Image → Code uses canonical Universal Send-To + durable binding, not an ad-hoc blob.
assert(pack049Sql.includes('create table if not exists public.zuvyr_code_asset_bindings'));
assert(universal.includes('libraryStore.createSendTo({ ownerId, contentId, destination })'));
assert(read('test-pack049-universal-actions-unit.js').includes("destination:'code'"));
assert.equal(checkpoint.imageToCode.bindingTable, 'public.zuvyr_code_asset_bindings');
assert.equal(checkpoint.imageToCode.checkpointUsesProviderCalls, false);

// Real ZIP / deploy truth.
assert.equal(release.status, 'engineering_implemented_live_deploy_deferred_m16');
assert.equal(release.deploy.externalGate, 'M16');
assert.equal(release.deploy.liveEnabledByDefault, false);
assert.equal(release.deploy.pricingVerificationStatus, 'unverified');
assert.equal(release.deploy.previewAndProductionDistinct, true);
assert.equal(release.deploy.productionRequiresPermission, 'deploy.execute');
assert.equal(release.deploy.rollbackRequiresPermission, 'deploy.rollback');

for (const marker of [
  'zuvyr-release-manifest.json',
  'snapshotSha256',
  'projectVersionId',
  'archiveSha256'
]) {
  assert(
    releaseZip.includes(marker) || JSON.stringify(release).includes(marker),
    'release identity marker missing: ' + marker
  );
}
assert(releaseRoutes.includes('deploy.execute'));
assert(releaseRoutes.includes('deploy.rollback'));

// Project state is durable; runtime/transient state is not treated as project persistence.
assert.equal(checkpoint.persistence.closeReopenProject, true);
assert.equal(checkpoint.persistence.restoreEditorState, true);
assert.equal(checkpoint.persistence.restoreAssetBindings, true);
assert.equal(checkpoint.persistence.runtimeSessionNeverTreatedAsDurableProjectState, true);

// Existing checkpoint suites must cover every dependency layer continuously.
const audioScript = String(pkg.scripts['test:audio-checkpoint'] || '');
for (const file of [
  'test-pack071-stt-diarization-cleanup.js',
  'test-pack072-tts-voice-design.js',
  'test-pack073-realtime-voice.js',
  'test-pack074-music-sfx-remix-stems-dubbing.js'
]) assert(audioScript.includes(file), 'audio checkpoint missing ' + file);

const codeScript = String(pkg.scripts['test:code-checkpoint'] || '');
for (const file of [
  'test-pack075-code-projects-editor.js',
  'test-pack076-secure-code-sandbox.js',
  'test-pack077-terminal-dependencies-run.js',
  'test-pack078-build-test-browser-preview-repair.js',
  'test-pack079-real-zip-deploy-rollback.js'
]) assert(codeScript.includes(file), 'code checkpoint missing ' + file);

const mediaScript = String(pkg.scripts['test:media-checkpoint'] || '');
assert(mediaScript.includes('test-pack049-universal-actions-unit.js'));
assert(mediaScript.includes('test-pack061-image-generate.js'));

// No checkpoint may silently elevate deferred live gates.
for (const gate of [
  'PACK073_AUTHENTICATED_PHYSICAL_MIC_ACCEPTANCE',
  'M15_SANDBOX_RUNTIME',
  'M16_DEPLOY_ROLLBACK',
  'PACK074_DUB_OUTPUT_CONTRACT'
]) assert(checkpoint.checkpoint.deferredGates.includes(gate), 'deferred gate missing: ' + gate);

assert.equal(checkpoint.checkpoint.paidProviderCallsRequired, false);
assert.equal(checkpoint.checkpoint.productionMutationRequired, false);

console.log('PASS: PACK080 reconciles Voice, Code, Image→Code and release dependencies without fake live claims');
console.log('PASS: PACK080 preserves one usage ledger, durable project state and bounded repair/release lineage');
console.log('PASS: PACK080 keeps mic, M15 sandbox/runtime, M16 deploy/rollback and dubbing contract gates explicit');
console.log('LIVE PAID PROVIDER / PAYMENT / PRODUCTION MUTATION CALLS: NONE');
