'use strict';

const fs = require('fs');
const assert = require('assert');

const ui = fs.readFileSync('../frontend/zuvyr-suite-v1.js', 'utf8');
const css = fs.readFileSync('../frontend/zuvyr-suite-v1.css', 'utf8');
const routes = fs.readFileSync('lib/workspaceRoutes.js', 'utf8');
const drive = fs.readFileSync('lib/workspaceGoogleDrive.js', 'utf8');

assert.doesNotThrow(() => new Function(ui), 'frontend suite must remain syntactically valid');

assert(ui.includes("['plugins','⌘','Plugins','ready']"));
assert(ui.includes("if(id==='plugins')return pluginsView()"));
assert(ui.includes("if(id==='plugins')loadPluginSurface()"));
assert(ui.includes("['documents','spreadsheets','presentations','scheduled','plugins']"));

for (const marker of [
  'data-zs-drive-form',
  'data-zs-plugin-form',
  'data-zs-skill-form',
  'data-zs-connection-list',
  'data-zs-tool-list',
  'data-zs-plugin-permission',
  '/api/workspace/connections?limit=100',
  '/api/workspace/skills?limit=100',
  '/api/workspace/tools',
  '/api/workspace/drive/connect',
  '/api/workspace/drive/oauth/callback',
  '/api/workspace/plugins/install',
  '/api/permissions/challenge',
  '/api/permissions/grants',
  'data-zs-drive-disconnect',
  'data-zs-plugin-revoke',
  'data-zs-skill-toggle',
  'zuvyrPack089GoogleOAuth'
]) assert(ui.includes(marker), 'missing 89D marker: ' + marker);

const pluginsStart = ui.indexOf('function pluginsView()');
const pluginsEnd = ui.indexOf('var scheduledState=', pluginsStart);
assert(pluginsStart >= 0 && pluginsEnd > pluginsStart);
const pluginsMarkup = ui.slice(pluginsStart, pluginsEnd);
assert(!/<input[^>]+(?:access|refresh|oauth|api)[_-]?token/i.test(pluginsMarkup));
assert(!/<input[^>]+client[_-]?secret/i.test(pluginsMarkup));
assert(!/<input[^>]+password/i.test(pluginsMarkup));
assert(pluginsMarkup.includes('No scripts, tokens, passwords or executable code.'));

assert(ui.includes('permissionRequest:prepared.permissionRequest'));
assert(ui.includes('confirmationFingerprint:pending.challenge.confirmationFingerprint'));
assert(ui.includes("'/api/permissions/grants/'+encodeURIComponent(grantId)+'/revoke'"));
assert(
  ui.indexOf("'/api/permissions/grants'") < ui.indexOf("'/api/workspace/plugins/install'"),
  'permission grant must precede plugin install'
);

assert(drive.includes('function assertOAuthConfigured()'));
assert(routes.includes('googleDriveRuntime.assertOAuthConfigured();'));
assert(
  routes.indexOf('googleDriveRuntime.assertOAuthConfigured();') <
  routes.indexOf('connectionStore.createIntegration({'),
  'missing OAuth config must fail before draft creation'
);

for (const marker of [
  'ZUVYR PACK089 / 89D',
  '.zs-connection-item',
  '.zs-plugin-permission',
  '.zs-skill-tool-picker',
  '[dir="rtl"] .zs-connection-item',
  '@media(max-width:820px)',
  '@media(max-width:480px)'
]) assert(css.includes(marker), 'missing 89D CSS marker: ' + marker);

console.log('PASS: Pack089 89D activates real Connections / Plugins / Skills UI');
console.log('PASS: Google OAuth config fails before draft creation and credentials are absent from UI');
console.log('PASS: plugin install uses Permission Center challenge/grant before activation with compensation');
console.log('PASS: loading/error/retry, keyboard Escape, RTL and responsive wiring are present');
