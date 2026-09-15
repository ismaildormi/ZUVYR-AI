'use strict';
process.env.SUPABASE_URL ||= 'https://unit-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'unit-test-placeholder-not-a-secret';

const assert = require('node:assert/strict');
const express = require('express');
const { createWorkspaceRouter } = require('./lib/workspaceRoutes');

const CONTENT = '33333333-3333-4333-8333-333333333333';
const ASSET = '55555555-5555-4555-8555-555555555555';
const SOURCE = '11111111-1111-4111-8111-111111111111';

async function run() {
  const calls = [];
  const libraryStore = {
    async listItems(){ return { items: [], filters: {}, has_more: false }; },
    async getItem({ ownerId, contentId }) { calls.push(['get', ownerId, contentId]); return { id: contentId, assets: [{ id: ASSET, status: 'active' }] }; },
    async createDownload({ ownerId, contentId, assetId }) {
      calls.push(['download', ownerId, contentId, assetId]);
      return { content_id: contentId, asset_id: assetId, signed_url: 'https://signed.example/download', expires_in_seconds: 60 };
    },
    async softDelete(){return{};}, async restore(){return{};}
  };
  const researchCheckpoint = {
    async create({ ownerId, input }) {
      calls.push(['checkpoint', ownerId, input]);
      return {
        status: 'completed',
        outputKind: input.outputKind,
        contentId: CONTENT,
        artifact: { contentId: CONTENT, assets: [{ assetId: ASSET, format: 'pdf' }] },
        reload: { verified: true },
        download: { route: `/api/workspace/library/items/${CONTENT}/download`, assetIds: [ASSET] },
        billing: { conversionProviderCalls: 0, conversionCreditsCharged: 0, duplicateCharge: false, liveBillingAllowed: false }
      };
    }
  };
  const officeStudio = { async renderSpreadsheet(){return{};}, async renderPresentation(){return{};} };
  const documentStudio = { async listTemplates(){return[];}, async saveTemplate(){return{};}, async renderDocument(){return{};} };
  const projectStore = { async listProjects(){return[];}, async createProject(){return{};}, async getProject(){return{};}, async updateProject(){return{};}, async linkResource(){return{};}, async unlinkResource(){return{};} };
  const universalActionsStore = { async sendTo(){return{};}, async createContextAction(){return{};}, async compareVersions(){return{};}, async restoreVersion(){return{};}, async getAction(){return{};}, async undoAction(){return{};} };
  const memoryStore = { async getPreferences(){return{};},async updatePreferences(){return{};},async listItems(){return{};},async createItem(){return{};},async getItem(){return{};},async updateItem(){return{};},async undoItem(){return{};},async forgetItem(){return{};},async retrieveContext(){return{};} };
  const contextGraphStore = { async listNodes(){return{};},async listEdges(){return{};},async getBrainContext(){return{};},async getManagerContext(){return{};} };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = 'owner-60'; next(); });
  app.use('/api/workspace', createWorkspaceRouter({
    projectStore, libraryStore, universalActionsStore, memoryStore, contextGraphStore,
    documentStudio, officeStudio, researchCheckpoint
  }));
  const server = await new Promise(resolve => { const x = app.listen(0, () => resolve(x)); });
  const base = `http://127.0.0.1:${server.address().port}/api/workspace`;
  try {
    let response = await fetch(`${base}/research/artifacts`, {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({
        title: 'Research brief',
        researchText: 'Cited result',
        outputKind: 'document',
        researchMode: 'deep_research',
        sourceRecordIds: [SOURCE]
      })
    });
    let body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.checkpoint.contentId, CONTENT);
    assert.equal(body.checkpoint.billing.conversionCreditsCharged, 0);
    assert.equal(calls[0][0], 'checkpoint');
    assert.equal(calls[0][1], 'owner-60');

    response = await fetch(`${base}/library/items/${CONTENT}`);
    body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.item.id, CONTENT);

    response = await fetch(`${base}/library/items/${CONTENT}/download`, {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({ assetId: ASSET })
    });
    body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.download.signed_url, 'https://signed.example/download');

    console.log('PASS: Pack060 checkpoint route hands cited research into a canonical artifact, then reopens and downloads it through existing owner-scoped Library routes');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
run().catch(error => { console.error(error); process.exit(1); });
