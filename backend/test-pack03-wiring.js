'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const validation = fs.readFileSync(path.join(__dirname, 'lib/inputValidation.js'), 'utf8');
const turn = fs.readFileSync(path.join(__dirname, 'lib/conversationTurn.js'), 'utf8');
const flags = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/feature-flags.json'), 'utf8'));

for (const marker of ["require('./lib/chatCapabilities')", "require('./lib/sourceContract')", "chatMode = 'standard'", 'assertChatModeAvailable(chatMode)', 'const responseSources = normalizeSources', 'sources: responseSources']) assert(server.includes(marker), `Missing server marker: ${marker}`);
assert(server.indexOf('assertChatModeAvailable(chatMode)') < server.indexOf('reservation = await reserveCredits'));
assert(validation.includes('ALLOWED_CHAT_MODES'));
assert(validation.includes("'standard', 'web_search', 'deep_research', 'shopping', 'local_research', 'connected_research'"));
assert(turn.includes('sources: Array.isArray(sources) ? sources : []'));
assert(turn.includes('source_count: Array.isArray(sources) ? sources.length : 0'));
assert.equal(flags.chat_sources.enabled, true);
assert.equal(flags.web_search.enabled, true);
assert.equal(flags.file_analysis.enabled, false);
for (const key of ['shopping','local_research','connected_research']) assert.equal(flags[key].enabled, true);
assert.equal(flags.deep_research.enabled, true);
assert.equal(flags.deep_research.status, 'live_verified');

console.log('PASS: Pack 03 foundations preserved while Pack057 preserves Web/Deep Research and activates Shopping/Local/Connected Research through the same source/memory contract');
