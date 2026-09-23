'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const reconciliation = readJson('zuvyr-pack-evidence/reconciliations/2026-09-23-pack051-060-finalizers/receipt.json');

assert.equal(reconciliation.type, 'HISTORICAL_FINALIZER_RECONCILIATION');
assert.equal(reconciliation.range, 'PACK051..PACK060');
assert.equal(reconciliation.rules.old_receipts_preserved, true);
assert.equal(reconciliation.rules.runtime_features_reexecuted, false);
assert.equal(reconciliation.rules.new_paid_provider_calls, 0);
assert.equal(reconciliation.rules.new_live_acceptance_claimed, false);
assert.equal(reconciliation.packs.length, 10);

const rows = Object.fromEntries(reconciliation.packs.map((row) => [row.pack, row]));
for (let n = 51; n <= 60; n += 1) {
  const id = String(n).padStart(3, '0');
  assert(rows[id], `missing reconciliation row ${id}`);
  assert.equal(rows[id].capability_status_changed, false, `reconciliation must not fabricate a capability status change for PACK${id}`);
}

const receipt051 = readJson('zuvyr-pack-evidence/pack-051/receipt.json');
assert.equal(receipt051.status, 'LOCKED_VERIFIED');
assert.equal(receipt051.finalizer.commit, 'PENDING_RUNNER_OUTPUT');
assert.equal(rows['051'].finalizer_commit, 'a72801f3440434f4f5881542e9616d3a7ad6c052');

const parentChain = [
  ['052', 'a72801f3440434f4f5881542e9616d3a7ad6c052'],
  ['053', 'f9630ce3367453468807a2c9e3dd0e163c3c95ec'],
  ['054', '673a3ad475adbdaa6c24c05270653f89d4f2cd18'],
  ['055', '2fbdc55ff7a0fbcff3424d2e452b6b44ae2e5024'],
  ['056', '8feb41ca720d934af007d9fc1805245d9b69c6aa'],
  ['057', '0740345dda5e5fca9258c136b9f5d405b2a1e6a3'],
  ['058', 'ea10852b0fdddb585ddac883bedde7d884be79a9'],
  ['059', 'cd9a5efc6c151d963b7e8dba3312921fc21aa37f'],
  ['060', '84cfe821a3cd19ade390f46c78aade2dc1de4bfd']
];
for (const [pack, expectedParentFinalizer] of parentChain) {
  const receipt = readJson(`zuvyr-pack-evidence/pack-${pack}/receipt.json`);
  assert.equal(receipt.parent_pack_finalizer_commit, expectedParentFinalizer, `PACK${pack} parent finalizer mismatch`);
}

const expectedFinalizers = {
  '051': 'a72801f3440434f4f5881542e9616d3a7ad6c052',
  '052': 'f9630ce3367453468807a2c9e3dd0e163c3c95ec',
  '053': '673a3ad475adbdaa6c24c05270653f89d4f2cd18',
  '054': '2fbdc55ff7a0fbcff3424d2e452b6b44ae2e5024',
  '055': '8feb41ca720d934af007d9fc1805245d9b69c6aa',
  '056': '0740345dda5e5fca9258c136b9f5d405b2a1e6a3',
  '057': 'ea10852b0fdddb585ddac883bedde7d884be79a9',
  '058': 'cd9a5efc6c151d963b7e8dba3312921fc21aa37f',
  '059': '84cfe821a3cd19ade390f46c78aade2dc1de4bfd',
  '060': 'dc2c6c1343194e1840fe171d73abe2a02bcc7a8f'
};
for (const [pack, sha] of Object.entries(expectedFinalizers)) {
  assert.equal(rows[pack].finalizer_commit, sha, `PACK${pack} reconciled finalizer mismatch`);
}

const pack061 = readJson('zuvyr-pack-evidence/pack-061/2026-09-17-final/receipt.json');
assert.equal(pack061.status, 'LOCKED_VERIFIED');
assert.equal(pack061.authenticated_live_proof.result, 'PASS');
assert.equal(reconciliation.conclusion.stale_pending_or_prepared_metadata_resolved, true);
assert.equal(reconciliation.conclusion.prior_receipts_overwritten, false);

console.log('PASS PACK051-PACK060 historical finalizer reconciliation');
