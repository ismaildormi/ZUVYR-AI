'use strict';
const fs = require('fs');
const assert = require('assert');

const routes = fs.readFileSync('backend/lib/workspaceRoutes.js','utf8');
const projectRepo = fs.readFileSync('backend/lib/workspaceProjectRepository.js','utf8');
const index = fs.readFileSync('frontend/index.html','utf8');
const migration = fs.readFileSync('backend/57_pack045_memory_personal_intelligence.sql','utf8');
const config = JSON.parse(fs.readFileSync('backend/config/workspace-system.v1.json','utf8'));

for (const needle of [
  "router.get('/memory/preferences'",
  "router.patch('/memory/preferences'",
  "router.get('/memory/items'",
  "router.post('/memory/items'",
  "router.get('/memory/items/:memoryId'",
  "router.patch('/memory/items/:memoryId'",
  "router.post('/memory/items/:memoryId/undo'",
  "router.delete('/memory/items/:memoryId'",
  "router.get('/memory/context'"
]) assert(routes.includes(needle), needle);

assert.strictEqual(config.pack,45);
assert.strictEqual(config.mode,'memory');
assert.strictEqual(config.foundations.memory,true);
assert(index.includes('/zuvyr-memory-v1.css'));
assert(index.includes('/zuvyr-memory-v1.js'));
assert(projectRepo.includes("'memory'"));
assert(projectRepo.includes("resourceType === 'memory'"));
assert(migration.includes('create table if not exists public.zuvyr_memories'));
assert(migration.includes('retrieve_zuvyr_memory_context'));
assert(migration.includes("'conversation','content','task','deployment','memory','generic'"));
console.log('PASS');
