'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../frontend/zuvyr-image-next-actions.js'), 'utf8');
const { plan } = require('../frontend/zuvyr-image-next-actions');
assert.deepEqual(plan({ prompt: 'missing canonical identity' }), []);
const ctx = { contentId: 'content-a', assetId: 'asset-a', prompt: 'blue cube' };
assert.equal(plan(ctx).length, 2);
assert.deepEqual(plan({ ...ctx, prepared: true, copied: true }).map(a => a.intent), ['restore_image_draft']);
class Element {
  constructor() { this.dataset = {}; this.children = []; this.handlers = {}; this.isConnected = true; this.value = ''; }
  setAttribute() {}
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); }
  replaceChildren() { this.children = []; }
  addEventListener(name, callback) { this.handlers[name] = callback; }
  dispatchEvent() {}
  focus() {}
}
async function run() {
  const message = new Element();
  message._zuvyrMeta = { canonicalContentId: 'content-a', canonicalAssetId: 'asset-a', conversationId: 'conversation-a' };
  message.querySelector = () => ({});
  message.previousElementSibling = { textContent: 'the exact original image prompt', matches: () => true };
  const input = new Element(); input.value = 'my unfinished draft';
  const copied = [];
  const sandbox = { window: {}, Event: class {}, MutationObserver: class { observe() {} },
    navigator: { clipboard: { writeText: async text => copied.push(text) } },
    document: { head: new Element(), body: new Element(), createElement: () => new Element(),
      querySelector: () => input, querySelectorAll: () => [message] } };
  vm.runInNewContext(source, sandbox);
  const panel = message.children[0], buttons = panel.children[1], status = panel.children[2];
  const click = async intent => { const b = buttons.children.find(x => x.dataset.intent === intent); assert.ok(b); await b.handlers.click(); };
  await click('prepare_image_prompt');
  assert.equal(input.value, message.previousElementSibling.textContent);
  assert.match(status.textContent, /before sending/);
  assert.ok(!buttons.children.some(x => x.dataset.intent === 'prepare_image_prompt'), 'next suggestions change after execution');
  await click('copy_image_prompt');
  assert.deepEqual(copied, [message.previousElementSibling.textContent]);
  await click('restore_image_draft');
  assert.equal(input.value, 'my unfinished draft');
  await click('prepare_image_prompt');
  input.value = 'new user edit';
  await click('restore_image_draft');
  assert.equal(input.value, 'new user edit', 'undo must preserve intervening user edits');
  message.isConnected = false;
  await click('prepare_image_prompt');
  assert.equal(input.value, 'new user edit', 'stale conversation cannot mutate current composer');
  console.log('PASS: contextual image identity, exact prompt reuse, next-action replacement, copy, reversible draft, stale-context protection; no provider/billing API');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
