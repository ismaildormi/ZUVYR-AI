'use strict';

const assert = require('node:assert/strict');
const { normalizeChatMode, isModeEnabled, assertChatModeAvailable } = require('./lib/chatCapabilities');

assert.equal(normalizeChatMode(), 'standard');
assert.equal(assertChatModeAvailable('standard', { env: {} }).capability, 'chat');
assert.equal(isModeEnabled('web_search', {}), true);
assert.equal(assertChatModeAvailable('web_search', { env: {} }).capability, 'web_search');
assert.equal(isModeEnabled('web_search', { ZUVYR_WEB_SEARCH_ENABLED: 'false' }), false);
assert.equal(assertChatModeAvailable('deep_research').mode, 'deep_research');
assert.throws(() => assertChatModeAvailable('shopping'), error => error.code === 'chat_mode_unpriced');
assert.throws(() => normalizeChatMode('unknown'), error => error.code === 'unknown_chat_mode');

console.log('PASS: Pack 03 capability guard preserves standard Chat, Pack056 Deep Research is live, while later external modes still fail closed');
