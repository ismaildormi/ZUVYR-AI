'use strict';

process.env.SUPABASE_URL ||=
  'https://unit-test.supabase.co';

process.env.SUPABASE_SERVICE_ROLE_KEY ||=
  'unit-test-placeholder-not-a-secret';

const assert = require('node:assert/strict');
const express = require('express');

const {
  createWorkspaceRouter
} = require('./lib/workspaceRoutes');

const JOB =
  '11111111-1111-4111-8111-111111111111';

const CONTENT =
  '22222222-2222-4222-8222-222222222222';

const ASSET =
  '33333333-3333-4333-8333-333333333333';

async function run() {
  const calls = [];

  const imageGenerationStore = {
    async listHistory(input) {
      calls.push(['history', input]);

      return [{
        jobId: JOB,
        status: 'completed',
        operation: 'generate',
        contentId: CONTENT,
        assetId: ASSET,
        downloadable: true
      }];
    },

    async reopenStudioItem(input) {
      calls.push(['reopen', input]);

      return {
        jobId: input.jobId,
        status: 'completed',
        operation: 'generate',
        contentId: CONTENT,
        assetId: ASSET,
        previewUrl:
          'https://signed.invalid/image',
        previewExpiresInSeconds: 300,
        downloadable: true,
        reversible: false,
        providerCalls: 0
      };
    },

    async rollbackEdit() {
      throw new Error(
        'rollback_not_expected'
      );
    }
  };

  const libraryStore = {
    async listItems(){return{items:[]}},
    async getItem(){return{};},
    async createDownload(){return{};},
    async softDelete(){return{};},
    async restore(){return{};},
    async createSendTo(){return{};}
  };

  const documentStudio = {
    async listTemplates(){return[];},
    async saveTemplate(){return{};},
    async renderDocument(){return{};}
  };

  const officeStudio = {
    async renderSpreadsheet(){return{};},
    async renderPresentation(){return{};}
  };

  const researchCheckpoint = {
    async createArtifact(){return{};}
  };

  const projectStore = {
    async listProjects(){return[];},
    async createProject(){return{};},
    async getProject(){return{};},
    async updateProject(){return{};},
    async linkResource(){return{};},
    async unlinkResource(){return{};}
  };

  const universalActionsStore = {
    async sendTo(){return{};},
    async createContextAction(){return{};},
    async compareVersions(){return{};},
    async restoreVersion(){return{};},
    async getAction(){return{};},
    async undoAction(){return{};}
  };

  const memoryStore = {
    async getPreferences(){return{};},
    async updatePreferences(){return{};},
    async listItems(){return{};},
    async createItem(){return{};},
    async getItem(){return{};},
    async updateItem(){return{};},
    async undoItem(){return{};},
    async forgetItem(){return{};},
    async retrieveContext(){return{};}
  };

  const contextGraphStore = {
    async listNodes(){return{};},
    async listEdges(){return{};},
    async getBrainContext(){return{};},
    async getManagerContext(){return{};}
  };

  const app = express();
  app.use(express.json());

  app.use((req,_res,next)=>{
    req.userId =
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    next();
  });

  app.use(
    '/api/workspace',
    createWorkspaceRouter({
      imageGenerationStore,
      libraryStore,
      documentStudio,
      officeStudio,
      researchCheckpoint,
      projectStore,
      universalActionsStore,
      memoryStore,
      contextGraphStore
    })
  );

  const server =
    await new Promise(resolve=>{
      const instance =
        app.listen(
          0,
          ()=>resolve(instance)
        );
    });

  try {
    const base =
      'http://127.0.0.1:' +
      server.address().port +
      '/api/workspace';

    let response =
      await fetch(
        base +
        '/images/history?limit=12'
      );

    let body =
      await response.json();

    assert.equal(response.status,200);
    assert.equal(body.status,'success');
    assert.equal(body.history.length,1);

    response =
      await fetch(
        base +
        '/images/' +
        JOB +
        '/reopen'
      );

    body =
      await response.json();

    assert.equal(response.status,200);
    assert.equal(body.status,'success');
    assert.equal(body.pack,65);
    assert.equal(body.providerCalls,0);
    assert.equal(body.item.jobId,JOB);
    assert.equal(
      body.item.previewExpiresInSeconds,
      300
    );

    assert.equal(
      calls[0][1].ownerId,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );

    assert.equal(
      calls[1][1].ownerId,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );

    response =
      await fetch(
        base +
        '/images/not-a-uuid/reopen'
      );

    assert.equal(response.status,400);

    console.log(
      'PASS: PACK065 Image Studio history/reopen routes are authenticated owner-scoped and reopen canonical previews with zero provider calls'
    );
  } finally {
    await new Promise((resolve,reject)=>
      server.close(error=>
        error?reject(error):resolve()
      )
    );
  }
}

run().catch(error=>{
  console.error(error);
  process.exit(1);
});
