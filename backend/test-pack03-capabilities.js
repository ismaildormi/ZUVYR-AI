'use strict';

const assert = require('node:assert/strict');
const { normalizeChatMode, isModeEnabled, assertChatModeAvailable } = require('./lib/chatCapabilities');

assert.equal(normalizeChatMode(), 'standard');
assert.equal(assertChatModeAvailable('standard', { env: {} }).capability, 'chat');
assert.equal(isModeEnabled('web_search', {}), true);
assert.equal(assertChatModeAvailable('web_search', { env: {} }).capability, 'web_search');
assert.equal(isModeEnabled('web_search', { ZUVYR_WEB_SEARCH_ENABLED: 'false' }), false);
assert.equal(assertChatModeAvailable('deep_research').mode, 'deep_research');
assert.equal(assertChatModeAvailable('shopping').mode, 'shopping');
assert.equal(assertChatModeAvailable('local_research').mode, 'local_research');
assert.equal(assertChatModeAvailable('connected_research').mode, 'connected_research');
assert.throws(() => normalizeChatMode('unknown'), error => error.code === 'unknown_chat_mode');

console.log('PASS: Pack 03 capability guard preserves standard Chat, Pack057 specialized research modes are live while standard Chat remains preserved');
