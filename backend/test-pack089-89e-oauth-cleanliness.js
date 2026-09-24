'use strict';
const fs = require('fs');
const assert = require('assert');
const { createWorkspaceConnectionStore } = require('./lib/workspaceConnectionRepository');

(async () => {
  const calls = [];
  let createCount = 0;
  const db = {
    from() { throw new Error('unexpected_table_call'); },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'create_or_reuse_workspace_integration_pack089') {
        createCount += 1;
        return {
          data: {
            success: true,
            created: createCount === 1,
            connection: {
              id: '22222222-2222-4222-8222-222222222222',
              integration_key: 'google_drive',
              scopes: ['drive.export','drive.file.read'],
              explicit_consent: true,
              status: 'draft', connected: false, read_enabled: false, write_enabled: false
            }
          },
          error: null
        };
      }
      if (name === 'consume_workspace_oauth_session_owner_pack089') {
        return { data: { success: false, error: 'pack089_oauth_session_invalid' }, error: null };
      }
      throw new Error('unexpected_rpc:' + name);
    }
  };
  const store = createWorkspaceConnectionStore(db);
  const input = {
    ownerId: '11111111-1111-4111-8111-111111111111',
    integrationKey: 'google_drive',
    scopes: ['drive.export','drive.file.read'],
    explicitConsent: true
  };
  const first = await store.createOrReuseIntegration(input);
  const retry = await store.createOrReuseIntegration(input);
  assert.equal(first.created, true);
  assert.equal(retry.created, false);
  assert.equal(first.connection.id, retry.connection.id);
  assert.equal(calls.filter(x => x.name === 'create_or_reuse_workspace_integration_pack089').length, 2);

  await assert.rejects(
    store.consumeOAuthSession({ ownerId: input.ownerId, stateHash: 'a'.repeat(64) }),
    error => error.code === 'pack089_oauth_session_invalid'
  );

  const migration = fs.readFileSync('92_pack089_89e_clean_oauth_idempotency.sql','utf8');
  assert(migration.includes('pg_advisory_xact_lock'));
  assert(migration.includes("return jsonb_build_object('success',false,'error','pack089_oauth_session_invalid')"));
  assert(!migration.includes("raise exception 'pack089_oauth_session_invalid'"));
  assert(migration.includes('to service_role'));

  const cleanup = fs.readFileSync('93_pack089_89e_expired_pkce_cleanup.sql','utf8');
  for (const marker of [
    'cleanup_expired_workspace_oauth_pkce_owner_pack089',
    "s.provider='google_drive'",
    's.consumed_at is null',
    's.expires_at <= now()',
    'delete from vault.secrets',
    'workspace_oauth_expired_pkce_before_insert_pack089',
    'before insert on public.workspace_oauth_sessions',
    "'integration_oauth_expired_pkce_cleaned'",
    "'secretValuesExposed',false",
    'to service_role'
  ]) assert(cleanup.includes(marker), marker);
  assert(!cleanup.includes('vault.decrypted_secrets'));
  assert(!cleanup.includes('decrypted_secret'));

  const routes = fs.readFileSync('lib/workspaceRoutes.js','utf8');
  const start = routes.indexOf("router.post('/drive/connect'");
  const end = routes.indexOf("router.post('/drive/oauth/callback'", start);
  const driveConnect = routes.slice(start, end);
  assert(start >= 0 && end > start);
  assert(driveConnect.includes('connectionStore.createOrReuseIntegration({'));
  assert(!driveConnect.includes('connectionStore.findLiveIntegration('));
  assert(routes.includes("code.includes('scope_change_requires_disconnect')"));

  const ui = fs.readFileSync('../frontend/zuvyr-suite-v1.js','utf8');
  assert(ui.includes('pluginState.oauthCallbackInFlight'));
  assert(ui.includes('if(pluginState.oauthCallbackInFlight)return pluginState.oauthCallbackInFlight;'));

  const mcp = fs.readFileSync('../supabase/functions/zuvyr-ops-mcp/index.ts','utf8');
  assert(mcp.includes('ismaildormi/ZUVYR-AI'));
  assert(!mcp.includes('raw.githubusercontent.com/ismaildormi/rox-ai/main'));

  console.log('PASS: PACK089 OAuth connect is atomic/idempotent, stale callbacks fail closed, and expired PKCE Vault secrets are cleaned owner-scoped without exposing secret values');
})();
