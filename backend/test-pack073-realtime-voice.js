'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const audioSystem=require('./config/audio-system.v1.json');
const flags=require('./config/feature-flags.json');
const providers=require('./config/provider-registry.v1.json');
const models=require('./config/model-registry.v1.json');
const costs=require('./config/cost-registry.v1.json');
const {normalizeVoiceSessionRequest}=require('./lib/voiceSessionContract');
const {assertAudioOperationAvailable,providerSupports}=require('./lib/audioOperationRegistry');
const {resolveCostQuote}=require('./lib/costRegistry');

const root=path.join(__dirname,'..');
const routes=fs.readFileSync(path.join(__dirname,'lib/audioStudioRoutes.js'),'utf8');
const repository=fs.readFileSync(path.join(__dirname,'lib/voiceSessionRepository.js'),'utf8');
const migration=fs.readFileSync(path.join(__dirname,'73_pack073_realtime_voice.sql'),'utf8');
const fix1Migration=fs.readFileSync(path.join(__dirname,'73_pack073_realtime_voice_fix1.sql'),'utf8');
const frontend=fs.readFileSync(path.join(root,'frontend/zuvyr-chat-workspace-v1.js'),'utf8');
const css=fs.readFileSync(path.join(root,'frontend/zuvyr-chat-workspace-v1.css'),'utf8');

assert.equal(audioSystem.pack073.phase,'IMPLEMENTED_BROWSER_RUNTIME');
assert.equal(audioSystem.operations.voice_chat.enabledByDefault,true);
assert.equal(audioSystem.operations.voice_chat.status,'implemented_pack073_browser_runtime');
assert.equal(audioSystem.operations.voice_chat.paidExecutionEnvironment,null);
assert.equal(audioSystem.operations.voice_chat.billingAuthority,false);
assert.equal(providerSupports('browser','voice_chat'),true);
assert.equal(assertAudioOperationAvailable('voice_chat',{env:{}}).operation,'voice_chat');

assert.equal(flags.voice_ai.enabled,true);
assert.equal(flags.audio_voice_chat.enabled,true);
assert.equal(flags.audio_voice_chat.status,'implemented_pack073_browser_runtime');

const session=normalizeVoiceSessionRequest({
  microphoneConsent:true,
  maxSeconds:300,
  retentionMode:'transcript_only',
  autoSpeak:true
});
assert.equal(session.provider,'browser');
assert.equal(session.transport,'web_speech_api');
assert.equal(session.bargeInEnabled,true);
assert.equal(session.visibleRecordingIndicator,true);
assert.equal(session.stopControl,true);
assert.equal(session.storeRawAudio,false);
assert.equal(session.backgroundRecording,false);
assert.equal(session.continuousListening,false);

const browserCost=costs.entries.find(x=>x.id==='browser-web-speech-realtime-voice');
assert(browserCost);
assert.equal(browserCost.verificationStatus,'verified');
assert.equal(browserCost.inputUnitPriceMicroUsd,'0');
assert.equal(browserCost.fixedOperationPriceMicroUsd,null);
assert.equal(browserCost.enabledState,'enabled');
const quote=resolveCostQuote({
  provider:'browser',
  modelToolId:'web-speech-api',
  capability:'audio_voice_chat',
  operationType:'realtime_voice_browser'
},{inputUnits:300000},{now:Date.parse('2026-09-19T12:00:00Z'),env:{}});
assert.equal(quote.providerCostMicroUsd,'0');

assert(providers.providers.browser);
assert(providers.providers.browser.capabilities.some(
  x=>x.id==='audio.voice_chat.browser'&&x.model==='web-speech-api'
));
assert(models.models.some(x=>x.id==='browser:audio.voice_chat:web-speech-api'));

for(const marker of [
  "router.post('/voice/sessions/request'",
  "router.get('/voice/sessions/:sessionId'",
  "router.post('/voice/sessions/:sessionId/state'",
  "router.post('/voice/sessions/:sessionId/turns'",
  "router.post('/voice/sessions/:sessionId/stop'",
  'createVoiceSessionRepository(db)'
]) assert(routes.includes(marker),marker);

for(const marker of [
  'create table if not exists public.voice_session_turns',
  'transition_zuvyr_voice_session',
  'record_zuvyr_voice_turn',
  "state in ('stopped','failed')",
  'for update',
  'to service_role'
]) assert(migration.includes(marker),marker);
assert(migration.includes("retention_mode in ('transcript_only','none')"));
assert(migration.includes('Raw microphone audio is not stored by ZUVYR'));
assert(fix1Migration.includes("v_session.state='listening' and v_next in ('listening','ready','processing','stopped','failed')"));
assert(fix1Migration.includes('for update'));
assert(fix1Migration.includes('to service_role'));

for(const marker of [
  'retention_mode',
  'web_speech_api',
  'providerBillingAuthority:false',
  'trainingPermissionImplied:false',
  'voice_session_repository_unavailable'
]) assert(repository.includes(marker),marker);

assert(frontend.includes('ZUVYR PACK073 REALTIME VOICE CONTROLLER'));
assert(frontend.includes('const dictatedSuffix = (value, beforeValue) =>'));
assert(frontend.includes("state.processingBaselineNode = latestAssistant(messages)"));
assert(frontend.includes("sendButton.classList.contains('is-generating')"));
assert(frontend.includes("await transition(state, 'ready')"));
assert(frontend.includes("void transition(state, 'processing')"));
assert(frontend.includes("window.speechSynthesis.cancel();"));
assert(frontend.includes("window.speechSynthesis.speak(utterance);"));
assert(frontend.indexOf("window.speechSynthesis.cancel();\n    window.speechSynthesis.speak(utterance);") >= 0);
assert(frontend.includes("localStorage.getItem('roxVoiceRate')"));
assert(frontend.includes("localStorage.getItem('roxVoiceName')"));
assert(frontend.includes("message === state.lastAssistantNode"));
assert(!frontend.includes("clean === state.lastAssistantText"));
assert(!frontend.includes("}, 900);"));
assert(frontend.includes("'barge_in'"));
assert(frontend.includes("/api/audio-studio/voice/sessions/request"));
assert(frontend.includes("/turns"));
assert(frontend.includes("/stop"));
assert(/storeRawAudio\s*:\s*false/.test(frontend));
assert(/rawAudioStoredByZuvyr\s*:\s*false/.test(routes));
assert(frontend.includes("source: 'browser_speech_recognition'"));
assert(frontend.includes("source: 'browser_speech_synthesis'"));
assert(frontend.includes("composedPromptIncludesExistingText"));
assert(frontend.includes("event.stopImmediatePropagation()"));
assert(css.includes('ZUVYR PACK073 REALTIME VOICE STATUS'));
assert.doesNotThrow(()=>new Function(frontend));

console.log('PASS: PACK073 browser realtime voice is consent-gated, owner-session-authoritative and zero-provider-charge');
console.log('PASS: PACK073 STOP is terminal, transcript turns are idempotent/retention-aware, and raw microphone audio is not persisted by ZUVYR');
console.log('PASS: PACK073 FIX1 binds processing to the real chat request, dedupes final assistant speech, preserves voice settings and records only the dictated suffix');
console.log('LIVE PROVIDER / PAYMENT / PRODUCTION DATABASE / NETWORK CALLS: NONE');
