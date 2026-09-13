'use strict';

const assert = require('assert');
const express = require('express');
const {
  createWorkspaceRouter
} = require('./lib/workspaceRoutes');

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const RESOURCE_ID = '33333333-3333-4333-8333-333333333333';

async function run() {
  const calls = [];

  const projectStore = {
    async listProjects(input) {
      calls.push(['list', input]);
      return [{
        id: PROJECT_ID,
        name: 'Real persisted project',
        description: null,
        shared_context_enabled: true,
        archived_at: null
      }];
    },
    async createProject(input) {
      calls.push(['create', input]);
      return {
        id: PROJECT_ID,
        name: input.project.name,
        description: input.project.description,
        shared_context_enabled: input.project.sharedContextEnabled,
        archived_at: null
      };
    },
    async getProject(input) {
      calls.push(['get', input]);
      return {
        id: PROJECT_ID,
        name: 'Real persisted project',
        items: []
      };
    },
    async updateProject(input) {
      calls.push(['update', input]);
      return {
        id: PROJECT_ID,
        name: input.patch.name || 'Real persisted project',
        archived_at: input.patch.archived ? new Date().toISOString() : null
      };
    },
    async linkResource(input) {
      calls.push(['link', input]);
      return {
        id: PROJECT_ID,
        name: 'Real persisted project',
        items: [{ id: ITEM_ID, resource_type: input.resourceType }]
      };
    },
    async unlinkResource(input) {
      calls.push(['unlink', input]);
      return {
        id: PROJECT_ID,
        name: 'Real persisted project',
        items: []
      };
    }
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = 'owner-123';
    next();
  });
  app.use(
    '/api/workspace',
    createWorkspaceRouter({ projectStore })
  );

  const server = await new Promise(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const base =
    `http://127.0.0.1:${server.address().port}/api/workspace`;

  try {
    let response = await fetch(`${base}/capabilities`);
    assert.strictEqual(response.status, 200);
    let body = await response.json();
    assert.strictEqual(body.mode, 'projects_crud');
    assert.strictEqual(body.execution.workspaceWritesEnabled, true);
    assert.strictEqual(body.execution.workflowExecutionEnabled, false);
    assert.strictEqual(body.execution.pluginInstallEnabled, false);
    assert.strictEqual(body.execution.driveOAuthEnabled, false);
    assert.strictEqual(body.execution.externalExportsEnabled, false);

    response = await fetch(`${base}/projects/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project: { name: 'Validation compatibility' }
      })
    });
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert.strictEqual(body.persisted, false);

    response = await fetch(`${base}/projects?archived=false&limit=25`);
    assert.strictEqual(response.status, 200);
    body = await response.json();
    assert.strictEqual(body.persisted, true);
    assert.strictEqual(body.projects.length, 1);
    assert.strictEqual(calls[0][1].ownerId, 'owner-123');

    response = await fetch(`${base}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project: {
          name: 'Launch project',
          description: 'Persist this project',
          sharedContextEnabled: true
        }
      })
    });
    assert.strictEqual(response.status, 201);
    body = await response.json();
    assert.strictEqual(body.persisted, true);
    assert.strictEqual(calls[1][1].ownerId, 'owner-123');

    response = await fetch(`${base}/projects/${PROJECT_ID}`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(calls[2][1].ownerId, 'owner-123');

    response = await fetch(`${base}/projects/${PROJECT_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Renamed project',
        archived: false
      })
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(calls[3][1].ownerId, 'owner-123');
    assert.strictEqual(calls[3][1].patch.name, 'Renamed project');

    response = await fetch(
      `${base}/projects/${PROJECT_ID}/resources`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resource: {
            type: 'conversation',
            id: RESOURCE_ID
          }
        })
      }
    );
    assert.strictEqual(response.status, 201);
    assert.strictEqual(calls[4][1].ownerId, 'owner-123');
    assert.strictEqual(calls[4][1].resourceType, 'conversation');

    response = await fetch(
      `${base}/projects/${PROJECT_ID}/resources/${ITEM_ID}`,
      { method: 'DELETE' }
    );
    assert.strictEqual(response.status, 200);
    assert.strictEqual(calls[5][1].ownerId, 'owner-123');

    response = await fetch(`${base}/projects/not-a-uuid`);
    assert.strictEqual(response.status, 400);

    response = await fetch(
      `${base}/projects/${PROJECT_ID}/resources`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          resource: {
            type: 'unknown',
            id: RESOURCE_ID
          }
        })
      }
    );
    assert.strictEqual(response.status, 400);

    console.log('PASS: PACK043 workspace project routes unit tests');
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
