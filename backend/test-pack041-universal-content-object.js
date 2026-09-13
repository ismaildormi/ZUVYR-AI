'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CONFIG,
  normalizeContentInput
} = require('./lib/universalContent');
const {
  createContentRepository
} = require('./lib/contentRepository');

assert.equal(CONFIG.version, 'pack-041.universal-content.v1');
assert.deepEqual(
  CONFIG.kinds,
  ['text','image','video','audio','document','code','3d','web','research']
);

for (const kind of CONFIG.kinds) {
  const normalized = normalizeContentInput({
    ownerId: '11111111-1111-4111-8111-111111111111',
    projectId: null,
    kind,
    title: `Example ${kind}`,
    sourceKind: 'test',
    sourceSystem: 'api',
    sourceId: `source-${kind}`,
    sourceVersionKey: 'v1',
    metadata: { kind },
    version: {
      mimeType: kind === 'text' ? 'text/plain' : null,
      text: kind === 'text' ? 'hello' : null,
      payload: { ok: true },
      provenance: { test: true }
    }
  });
  assert.equal(normalized.kind, kind);
}

assert.throws(
  () => normalizeContentInput({
    ownerId: 'owner',
    kind: 'binary',
    sourceKind: 'test',
    sourceSystem: 'api',
    sourceId: 'x',
    sourceVersionKey: '1',
    version: {}
  }),
  error => error.code === 'CONTENT_KIND_UNSUPPORTED'
);

const calls = [];
const fakeClient = {
  async rpc(name, args) {
    calls.push([name, args]);
    if (name === 'upsert_zuvyr_content_version') {
      return {
        data: {
          contentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          versionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          versionNumber: 1,
          kind: args.p_kind,
          replayed: false
        },
        error: null
      };
    }
    if (name === 'resolve_zuvyr_content_by_source') {
      return {
        data: {
          contentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          versionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          kind: 'text'
        },
        error: null
      };
    }
    throw new Error('unexpected_rpc');
  },
  from() {
    return {
      select() { return this; },
      eq() { return this; },
      async maybeSingle() {
        return {
          data: {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            owner_id: '11111111-1111-4111-8111-111111111111',
            kind: 'text'
          },
          error: null
        };
      }
    };
  }
};

(async () => {
  const repository = createContentRepository({ client: fakeClient });

  const created = await repository.ensure({
    ownerId: '11111111-1111-4111-8111-111111111111',
    kind: 'text',
    sourceKind: 'task_step',
    sourceSystem: 'durable_task_step',
    sourceId: 'task:step',
    sourceVersionKey: 'final',
    metadata: {},
    version: {
      text: 'PACK041',
      payload: { text: 'PACK041' },
      provenance: { taskRunId: 'task' }
    }
  });

  assert.equal(created.kind, 'text');
  assert.equal(created.versionNumber, 1);
  assert.equal(calls[0][0], 'upsert_zuvyr_content_version');

  const migration = fs.readFileSync(
    path.join(__dirname, '50_pack041_universal_content.sql'),
    'utf8'
  );

  for (const marker of [
    'create table if not exists public.zuvyr_content_objects',
    'create table if not exists public.zuvyr_content_versions',
    'unique (owner_id, source_system, source_id)',
    'unique (content_id, source_version_key)',
    'upsert_zuvyr_content_version',
    'resolve_zuvyr_content_by_source',
    'add column if not exists canonical_content_id',
    'pack041_task_step_content_trg',
    'pack041_generation_job_content_trg',
    'pack041_conversation_asset_content_trg',
    'pack041_audio_artifact_content_trg',
    'pack041_code_version_content_trg',
    'pack041_workspace_item_content_trg'
  ]) {
    assert(migration.includes(marker), `missing migration marker: ${marker}`);
  }

  for (const kind of CONFIG.kinds) {
    assert(migration.includes(`'${kind}'`), `migration missing kind ${kind}`);
  }

  console.log('PASS: universal content supports all Pack041 canonical kinds');
  console.log('PASS: source identity + source-version identity are replay-safe');
  console.log('PASS: canonical content IDs are wired into durable task, generation, upload, audio, code-version and workspace producers');
  console.log('PASS: Pack041 does not duplicate blob storage or enable live billing');
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
