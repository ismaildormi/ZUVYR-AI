'use strict';

process.env.SUPABASE_URL ||= 'https://unit-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||=
  'unit-test-placeholder-not-a-secret';

const assert = require('node:assert/strict');
const express = require('express');
const {
  createWorkspaceRouter
} = require('./lib/workspaceRoutes');

const JOB =
  '11111111-1111-4111-8111-111111111111';
const SOURCE =
  '22222222-2222-4222-8222-222222222222';
const CONTENT =
  '33333333-3333-4333-8333-333333333333';
const VERSION =
  '44444444-4444-4444-8444-444444444444';

async function run() {
  const calls = [];

  const imageGenerationStore = {
    async listHistory() {
      return [];
    },
    async rollbackEdit(input) {
      calls.push(input);
      return {
        jobId: input.jobId,
        operation: 'inpaint',
        rolledBack: true,
        providerCalls: 0,
        sourceAssetId: SOURCE,
        sourceContentId: CONTENT,
        sourceVersionId: VERSION,
        mimeType: 'image/png',
        fileSizeBytes: 1024
      };
    }
  };

  const libraryStore = {
    async listItems(){return{items:[]}},
    async getItem(){return{};},
    async createDownload(){return{};},
    async softDelete(){return{};},
    async restore(){return{};}
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
  app.use((req, _res, next) => {
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

  const server = await new Promise(resolve => {
    const instance =
      app.listen(0, () => resolve(instance));
  });

  try {
    const base =
      'http://127.0.0.1:' +
      server.address().port +
      '/api/workspace';

    const response = await fetch(
      base + '/images/' + JOB + '/rollback',
      { method: 'POST' }
    );

    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'success');
    assert.equal(body.providerCalls, 0);
    assert.equal(body.sourcePreserved, true);
    assert.equal(body.rollback.sourceAssetId, SOURCE);
    assert.equal(body.rollback.sourceContentId, CONTENT);
    assert.equal(body.rollback.sourceVersionId, VERSION);

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].ownerId,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    assert.equal(calls[0].jobId, JOB);

    const bad = await fetch(
      base + '/images/not-a-uuid/rollback',
      { method: 'POST' }
    );
    assert.equal(bad.status, 400);

    console.log(
      'PASS: PACK063 rollback route is owner-scoped, returns immutable source lineage, rejects invalid job IDs and performs zero provider calls'
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close(error =>
        error ? reject(error) : resolve()
      )
    );
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
