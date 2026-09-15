'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  safeMessageId,
  safeCitationKey,
  publicSourceRecord
} = require('./lib/sourceRecordRepository');
const {
  normalizeSources
} = require('./lib/sourceContract');

assert.equal(safeMessageId('42'), '42');
assert.throws(
  () => safeMessageId('0'),
  error => error.code === 'invalid_source_message_id'
);
assert.equal(safeCitationKey('source-1'), 'source-1');
assert.throws(
  () => safeCitationKey(''),
  error => error.code === 'invalid_source_citation_key'
);

const normalized = normalizeSources([
  {
    type: 'web',
    title: 'Primary evidence',
    url: 'https://example.com/report#section',
    snippet: ' verified  evidence '
  },
  {
    type: 'memory',
    title: 'User preference',
    externalId: '11111111-1111-4111-8111-111111111111',
    snippet: 'private owner-scoped memory'
  }
]);
assert.equal(normalized.length, 2);
assert.equal(normalized[0].citationId, 'source-1');
assert.equal(normalized[0].url, 'https://example.com/report');
assert.equal(normalized[1].type, 'memory');

const publicRecord = publicSourceRecord({
  id: 'record-1',
  citation_key: 'source-1',
  source_type: 'file',
  title: 'plan.pdf',
  url: null,
  snippet: 'Plan',
  external_id: 'asset-1',
  project_id: 'project-1',
  canonical_asset_id: 'asset-1',
  canonical_content_id: 'content-1',
  metadata: { extractionStatus: 'ready' },
  verified_at: '2026-09-15T00:00:00Z',
  created_at: '2026-09-15T00:00:00Z'
}, 'https://signed.example/file');
assert.equal(publicRecord.openUrl, 'https://signed.example/file');
assert.equal(publicRecord.citationId, 'source-1');
assert.equal(publicRecord.projectId, 'project-1');

const sql = fs.readFileSync(
  path.join(__dirname, '65_pack054_sources_citations.sql'),
  'utf8'
);
for (const marker of [
  'add column if not exists canonical_asset_id',
  'add column if not exists canonical_content_id',
  'add column if not exists project_id',
  'create or replace function public.zuvyr_capture_message_sources()',
  "new.role <> 'assistant'",
  "wi.resource_type = 'conversation'",
  'ca.owner_id = new.owner_id',
  'za.owner_id = new.owner_id',
  'm.id = v_uuid and m.owner_id = new.owner_id',
  'on conflict (message_id, citation_key)',
  'after insert or update of content on public.conversation_messages',
  'revoke all on function public.zuvyr_capture_message_sources()',
  'grant execute on function public.zuvyr_capture_message_sources()'
]) {
  assert(sql.includes(marker), `Missing PACK054 SQL marker: ${marker}`);
}

const routes = fs.readFileSync(
  path.join(__dirname, 'lib', 'conversationRoutes.js'),
  'utf8'
);
assert(
  routes.includes(
    "'/:conversationId/messages/:messageId/sources/:citationKey'"
  ),
  'PACK054 must expose owner-scoped durable source reopen route.'
);
assert(
  routes.includes('getSourceStore().getSourceRecord'),
  'PACK054 source route must use the source repository.'
);

const server = fs.readFileSync(
  path.join(__dirname, 'server.js'),
  'utf8'
);
assert(
  server.includes('conversationMessageId:'),
  'Chat responses must expose the durable assistant message id.'
);

const frontend = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'zuvyr-chat-workspace-v1.js'),
  'utf8'
);
for (const marker of [
  'citationId:String(source.citationId',
  '/messages/',
  '/sources/',
  'message?._zuvyrMeta?.messageId',
  'durable.openUrl'
]) {
  assert(frontend.includes(marker), `Missing PACK054 frontend marker: ${marker}`);
}

console.log(
  'PASS: Pack054 durable normalized citations, owner/project/file verification, source-record reopen API and UI wiring'
);
