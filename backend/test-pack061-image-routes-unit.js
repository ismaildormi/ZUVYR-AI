'use strict';
process.env.SUPABASE_URL ||= 'https://unit-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'unit-test-placeholder-not-a-secret';

const assert = require('node:assert/strict');
const express = require('express');
const { createWorkspaceRouter } = require('./lib/workspaceRoutes');

async function run() {
  const calls = [];
  const imageGenerationStore = {
    async listHistory(input) {
      calls.push(input);
      return [{
        jobId: '11111111-1111-4111-8111-111111111111',
        status: 'done',
        prompt: 'launch image',
        contentId: '22222222-2222-4222-8222-222222222222',
        assetId: '33333333-3333-4333-8333-333333333333',
        downloadable: true
      }];
    }
  };
  const libraryStore = { async listItems(){return{items:[]}},async getItem(){return{};},async createDownload(){return{};},async softDelete(){return{};},async restore(){return{};} };
  const documentStudio = { async listTemplates(){return[];}, async saveTemplate(){return{};}, async renderDocument(){return{};} };
  const officeStudio = { async renderSpreadsheet(){return{};}, async renderPresentation(){return{};} };
  const researchCheckpoint = { async createArtifact(){return{};} };
  const projectStore = { async listProjects(){return[];},async createProject(){return{};},async getProject(){return{};},async updateProject(){return{};},async linkResource(){return{};},async unlinkResource(){return{};} };
  const universalActionsStore = { async sendTo(){return{};},async createContextAction(){return{};},async compareVersions(){return{};},async restoreVersion(){return{};},async getAction(){return{};},async undoAction(){return{};} };
  const memoryStore = { async getPreferences(){return{};},async updatePreferences(){return{};},async listItems(){return{};},async createItem(){return{};},async getItem(){return{};},async updateItem(){return{};},async undoItem(){return{};},async forgetItem(){return{};},async retrieveContext(){return{};} };
  const contextGraphStore = { async listNodes(){return{};},async listEdges(){return{};},async getBrainContext(){return{};},async getManagerContext(){return{};} };

  const app = express();
  app.use(express.json());
  app.use((req,_res,next)=>{ req.userId='owner-61'; next(); });
  app.use('/api/workspace', createWorkspaceRouter({ imageGenerationStore, libraryStore, documentStudio, officeStudio, researchCheckpoint, projectStore, universalActionsStore, memoryStore, contextGraphStore }));
  const server = await new Promise(resolve => { const x=app.listen(0,()=>resolve(x)); });
  try {
    const base=`http://127.0.0.1:${server.address().port}/api/workspace`;
    const response=await fetch(`${base}/images/history?limit=12`);
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(body.pack,61);
    assert.equal(body.history.length,1);
    assert.equal(body.history[0].downloadable,true);
    assert.equal(calls.length,1);
    assert.equal(calls[0].ownerId,'owner-61');
    assert.equal(calls[0].limit,'12');
    console.log('PASS: Pack061 image history route is owner-scoped and returns canonical downloadable job identity');
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}
run().catch(error=>{console.error(error);process.exit(1);});
