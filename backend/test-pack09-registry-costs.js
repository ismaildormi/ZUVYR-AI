'use strict';
const assert = require('node:assert/strict');
const { publicInventory, assertWorkspaceExecutionAvailable } = require('./lib/workspaceCapabilityRegistry');
const flags = require('./config/feature-flags.json');
const plans = require('./config/plans.json');
const costs = require('./config/cost-registry.v1.json');

const inventory = publicInventory();
for (const key of ['library','projects','documents','spreadsheets','presentations','templates','scheduledTasks','plugins','googleDrive','workflows']) assert.equal(inventory.foundations[key], true);
assert.equal(inventory.execution.workspaceWritesEnabled, true);
for (const [key, enabled] of Object.entries(inventory.execution)) if (key !== 'workspaceWritesEnabled') assert.equal(enabled, false, key);
assert.doesNotThrow(() => assertWorkspaceExecutionAvailable('workspace_write'));
for (const operation of ['schedule_execute','workflow_execute','plugin_install','plugin_run','drive_connect','drive_read','drive_write','external_export','publish']) assert.throws(() => assertWorkspaceExecutionAvailable(operation), /disabled/);
for (const key of ['workspaces','library','projects','creation_tools','templates','workflows']) assert.equal(flags[key].status, 'foundation');
assert.equal(flags.documents.status, 'live_verified');
assert.equal(flags.spreadsheets.status, 'implemented_pending_visual_e2e');
assert.equal(flags.presentations.status, 'implemented_pending_visual_e2e');
for (const key of ['scheduled_tasks','plugins','google_drive']) assert.equal(flags[key].enabled, false);
for (const key of ['workspace_storage','scheduled_tasks','workspace_integrations']) {
  assert.equal(plans.featureCosts[key].credits, 0);
  assert.equal(plans.featureCosts[key].pricingMode, 'dynamic_required');
}
for (const id of ['unassigned-workspace-storage','unassigned-scheduled-runtime','unassigned-workspace-integrations']) {
  const row = costs.entries.find(entry => entry.id === id);
  assert(row, `Missing cost entry ${id}`);
  assert.equal(row.verificationStatus, 'unverified');
  assert.equal(row.enabledState, 'blocked');
  assert.equal(row.targetGrossMarginBps, 5000);
  assert.equal(row.creditConversionResult, null);
}
console.log('PASS: Pack 09 bounded workspace writes are enabled while unpriced external execution remains fail-closed');
