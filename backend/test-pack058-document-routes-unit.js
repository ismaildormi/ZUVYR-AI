'use strict';
process.env.SUPABASE_URL ||= 'https://unit-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'unit-test-placeholder-not-a-secret';

const assert = require('node:assert/strict');
const express = require('express');
const { createWorkspaceRouter } = require('./lib/workspaceRoutes');

const CONTENT = '11111111-1111-4111-8111-111111111111';
const ASSET = '22222222-2222-4222-8222-222222222222';

async function run() {
  const calls = [];
  const libraryStore = {
    async listItems(input) {
      calls.push(['list', input]);
      return {
        items: [
          { id: CONTENT, kind: 'document', title: 'Document', metadata: {}, assets: [] },
          { id: '33333333-3333-4333-8333-333333333333', kind: 'document', title: 'Template', metadata: { documentTemplate: true }, assets: [] }
        ],
        filters: { kind: 'document' },
        has_more: false
      };
    },
    async getItem() { return {}; },
    async createDownload() { return {}; },
    async softDelete() { return {}; },
    async restore() { return {}; }
  };
  const documentStudio = {
    async listTemplates(ownerId) {
      calls.push(['templates', ownerId]);
      return [{ id: 'builtin:blank', name: 'Blank document', builtin: true, variables: ['body'] }];
    },
    async saveTemplate(input) {
      calls.push(['saveTemplate', input]);
      return { id: '44444444-4444-4444-8444-444444444444', name: 'Saved', builtin: false };
    },
    async renderDocument(input) {
      calls.push(['render', input]);
      return {
        contentId: CONTENT,
        title: 'Rendered',
        formats: ['pdf'],
        assets: [{ assetId: ASSET, format: 'pdf' }],
        providerCalls: 0,
        billedCredits: 0,
        liveBillingAllowed: false
      };
    }
  };
  const projectStore = {
    async listProjects(){return[];}, async createProject(){return{};}, async getProject(){return{};}, async updateProject(){return{};}, async linkResource(){return{};}, async unlinkResource(){return{};}
  };
  const universalActionsStore = {
    async sendTo(){return{};}, async createContextAction(){return{};}, async compareVersions(){return{};}, async restoreVersion(){return{};}, async getAction(){return{};}, async undoAction(){return{};}
  };
  const memoryStore = {
    async getPreferences(){return{};},async updatePreferences(){return{};},async listItems(){return{};},async createItem(){return{};},async getItem(){return{};},async updateItem(){return{};},async undoItem(){return{};},async forgetItem(){return{};},async retrieveContext(){return{};}
  };
  const contextGraphStore = {
    async listNodes(){return{};},async listEdges(){return{};},async getBrainContext(){return{};},async getManagerContext(){return{};}
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = 'owner-58'; next(); });
  app.use('/api/workspace', createWorkspaceRouter({
    projectStore, libraryStore, universalActionsStore, memoryStore, contextGraphStore, documentStudio
  }));
  const server = await new Promise(resolve => { const x = app.listen(0, () => resolve(x)); });
  const base = `http://127.0.0.1:${server.address().port}/api/workspace`;
  try {
    let response = await fetch(`${base}/documents`);
    assert.equal(response.status, 200);
    let body = await response.json();
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].id, CONTENT);
    assert.equal(calls[0][1].filters.kind, 'document');

    response = await fetch(`${base}/documents/templates`);
    assert.equal(response.status, 200);
    body = await response.json();
    assert.equal(body.templates[0].id, 'builtin:blank');
    assert.equal(calls[1][1], 'owner-58');

    response = await fetch(`${base}/documents/templates`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ template: { name: 'Saved', category: 'custom', body: '{{body}}' } })
    });
    assert.equal(response.status, 201);
    body = await response.json();
    assert.equal(body.providerCalls, 0);
    assert.equal(body.billedCredits, 0);
    assert.equal(calls[2][1].ownerId, 'owner-58');

    response = await fetch(`${base}/documents/render`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Rendered', content: 'hello', formats: ['pdf'] })
    });
    assert.equal(response.status, 201);
    body = await response.json();
    assert.equal(body.document.contentId, CONTENT);
    assert.equal(body.document.providerCalls, 0);
    assert.equal(calls[3][1].ownerId, 'owner-58');

    console.log('PASS: Pack058 document routes are owner-scoped, persistent, template-aware and return local zero-provider artifacts');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
run().catch(error => { console.error(error); process.exit(1); });
