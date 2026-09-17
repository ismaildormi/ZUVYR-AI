'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function run() {
  const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
  for (const variant of ['mobile', 'desktop']) {
    const start = html.indexOf(`id="rox-src-${variant}">`);
    const end = html.indexOf('</script>', start);
    const template = html.slice(start, end);
    const match = template.match(/async function downloadCanonicalGeneration\(contentId, assetId, button\) \{[\s\S]*?\n\}\s*\nasync function sendGeneration/);
    assert.ok(match, `${variant}: canonical download helper must exist in the actual selected template`);
    const code = match[0].replace(/\s*async function sendGeneration$/, '');
    for (const scenario of ['success', 'denied', 'network']) {
      const calls = [], navigations = [], alerts = [];
      const button = { disabled: false };
      const sandbox = {
        authFetch: async (route, options) => {
          assert.equal(button.disabled, true, 'disable while authorization is pending');
          calls.push({ route, options });
          if (scenario === 'network') throw new Error('offline');
          return { ok: scenario === 'success', json: async () => scenario === 'success'
            ? { download: { signed_url: 'https://storage.example/signed-fixture?token=test' } }
            : { code: 'asset_not_found' } };
        },
        window: { location: { assign: url => navigations.push(url) }, alert: text => alerts.push(text) },
        console: { error() {} }
      };
      vm.createContext(sandbox);
      vm.runInContext(code, sandbox);
      await sandbox.downloadCanonicalGeneration('content/fixture', 'asset-fixture', button);
      assert.equal(calls.length, 1, 'one owner-authorized request; no generation or settlement call');
      assert.equal(calls[0].route, '/api/workspace/library/items/content%2Ffixture/download');
      assert.equal(calls[0].options.method, 'POST');
      assert.deepEqual(JSON.parse(calls[0].options.body), { assetId: 'asset-fixture' });
      assert.equal(navigations.length, scenario === 'success' ? 1 : 0);
      assert.equal(alerts.length, scenario === 'success' ? 0 : 1);
      assert.equal(button.disabled, false, 'button recovers after success or failure');
    }
  }
  console.log('PASS: mobile and desktop actual template download runtime: signed success, owner denial and network recovery; one request, no generation');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
