'use strict';
process.env.SUPABASE_URL ||= 'https://unit-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'unit-test-placeholder-not-a-secret';

const assert = require('node:assert/strict');
const express = require('express');
const { createWorkspaceRouter } = require('./lib/workspaceRoutes');

const SHEET = '11111111-1111-4111-8111-111111111111';
const DECK = '22222222-2222-4222-8222-222222222222';

async function run() {
  const calls = [];
  const libraryStore = {
    async listItems(input) {
      calls.push(['list', input]);
      return {
        items: [
          { id: SHEET, kind: 'document', title: 'Budget', metadata: { officeArtifactKind: 'spreadsheet' }, assets: [] },
          { id: DECK, kind: 'document', title: 'Launch', metadata: { officeArtifactKind: 'presentation' }, assets: [] },
          { id: '33333333-3333-4333-8333-333333333333', kind: 'document', title: 'Doc', metadata: {}, assets: [] }
        ], filters: { kind: 'document' }, has_more: false
      };
    },
    async getItem(){return{};}, async createDownload(){return{};}, async softDelete(){return{};}, async restore(){return{};}
  };
  const officeStudio = {
    async renderSpreadsheet(input) { calls.push(['spreadsheet', input]); return { contentId: SHEET, artifactKind: 'spreadsheet', assets: [{ assetId: '44444444-4444-4444-8444-444444444444', format: 'xlsx' }], providerCalls: 0, billedCredits: 0 }; },
    async renderPresentation(input) { calls.push(['presentation', input]); return { contentId: DECK, artifactKind: 'presentation', assets: [{ assetId: '55555555-5555-4555-8555-555555555555', format: 'pptx' }], providerCalls: 0, billedCredits: 0 }; }
  };
  const documentStudio = { async listTemplates(){return[];}, async saveTemplate(){return{};}, async renderDocument(){return{};} };
  const projectStore = { async listProjects(){return[];}, async createProject(){return{};}, async getProject(){return{};}, async updateProject(){return{};}, async linkResource(){return{};}, async unlinkResource(){return{};} };
  const universalActionsStore = { async sendTo(){return{};}, async createContextAction(){return{};}, async compareVersions(){return{};}, async restoreVersion(){return{};}, async getAction(){return{};}, async undoAction(){return{};} };
  const memoryStore = { async getPreferences(){return{};},async updatePreferences(){return{};},async listItems(){return{};},async createItem(){return{};},async getItem(){return{};},async updateItem(){return{};},async undoItem(){return{};},async forgetItem(){return{};},async retrieveContext(){return{};} };
  const contextGraphStore = { async listNodes(){return{};},async listEdges(){return{};},async getBrainContext(){return{};},async getManagerContext(){return{};} };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = 'owner-59'; next(); });
  app.use('/api/workspace', createWorkspaceRouter({ projectStore, libraryStore, universalActionsStore, memoryStore, contextGraphStore, documentStudio, officeStudio }));
  const server = await new Promise(resolve => { const x = app.listen(0, () => resolve(x)); });
  const base = `http://127.0.0.1:${server.address().port}/api/workspace`;
  try {
    let response = await fetch(`${base}/spreadsheets`); let body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.items.length, 1); assert.equal(body.items[0].id, SHEET); assert.equal(calls[0][1].filters.kind, 'document');
    response = await fetch(`${base}/presentations`); body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.items.length, 1); assert.equal(body.items[0].id, DECK);

    response = await fetch(`${base}/spreadsheets/render`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({title:'Budget',columns:['A'],rows:[[1]],formats:['xlsx']}) });
    body = await response.json(); assert.equal(response.status, 201); assert.equal(body.spreadsheet.contentId, SHEET); assert.equal(body.spreadsheet.providerCalls, 0); assert.equal(calls[2][1].ownerId, 'owner-59');

    response = await fetch(`${base}/presentations/render`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({title:'Launch',slides:[{title:'One',lines:['Two']}]}) });
    body = await response.json(); assert.equal(response.status, 201); assert.equal(body.presentation.contentId, DECK); assert.equal(body.presentation.billedCredits, 0); assert.equal(calls[3][1].ownerId, 'owner-59');

    console.log('PASS: Pack059 spreadsheet/presentation routes are owner-scoped, Library-backed and return local zero-provider artifacts');
  } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
run().catch(error => { console.error(error); process.exit(1); });
