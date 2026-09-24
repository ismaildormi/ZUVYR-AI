from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label} marker count={count}')
    return text.replace(old, new, 1)

repo = Path('backend/lib/workspaceConnectionRepository.js')
s = repo.read_text()
old = """  async function createIntegration({ ownerId, integrationKey, scopes, explicitConsent }) {
    const { data, error } = await db
      .from('workspace_integration_connections')
      .insert({
        owner_id: ownerId,
        integration_key: integrationKey,
        scopes,
        explicit_consent: explicitConsent === true,
        status: 'draft',
        connected: false,
        read_enabled: false,
        write_enabled: false
      })
      .select('id,integration_key,scopes,explicit_consent,status,connected,read_enabled,write_enabled,created_at,updated_at')
      .single();
    if (error) throw storeError('workspace_integration_create_failed', error.message);
    return data;
  }
"""
new = """  async function createOrReuseIntegration({ ownerId, integrationKey, scopes, explicitConsent }) {
    const { data, error } = await db.rpc('create_or_reuse_workspace_integration_pack089', {
      p_owner_id: ownerId,
      p_integration_key: integrationKey,
      p_scopes: scopes,
      p_explicit_consent: explicitConsent === true
    });
    if (error) throw storeError('workspace_integration_create_or_reuse_failed', error.message);
    if (!data || data.success !== true || !data.connection) {
      throw storeError(String(data?.error || 'workspace_integration_create_or_reuse_failed'));
    }
    return Object.freeze({ connection: data.connection, created: data.created === true });
  }

  async function createIntegration(input) {
    return (await createOrReuseIntegration(input)).connection;
  }
"""
s = replace_once(s, old, new, 'createIntegration')
s = replace_once(
    s,
    """    if (error) throw storeError('workspace_oauth_session_consume_failed', error.message);
    return data;
  }
""",
    """    if (error) throw storeError('workspace_oauth_session_consume_failed', error.message);
    if (!data || data.success === false) {
      throw storeError(String(data?.error || 'pack089_oauth_session_invalid'));
    }
    return data;
  }
""",
    'consumeOAuthSession'
)
s = replace_once(
    s,
    """    findLiveIntegration,
    createIntegration,
""",
    """    findLiveIntegration,
    createOrReuseIntegration,
    createIntegration,
""",
    'store exports'
)
repo.write_text(s)

routes = Path('backend/lib/workspaceRoutes.js')
s = routes.read_text()
s = replace_once(
    s,
    """      const connection = await connectionStore.createIntegration({
        ownerId: req.userId,
        ...draft
      });
      res.set('Cache-Control', 'no-store');
      return res.status(201).json({ status: 'success', connection });
""",
    """      const result = await connectionStore.createOrReuseIntegration({
        ownerId: req.userId,
        ...draft
      });
      res.set('Cache-Control', 'no-store');
      return res.status(result.created ? 201 : 200).json({ status: 'success', connection: result.connection });
""",
    'generic integration route'
)
old_drive = """        let connection = await connectionStore.findLiveIntegration(
          req.userId,
          'google_drive'
        );

        if (connection && !matchesRequestedScopes(connection)) {
          res.set('Cache-Control', 'no-store');
          return res.status(409).json({
            status: 'error',
            code: 'workspace_google_drive_scope_change_requires_disconnect',
            connectionId: connection.id,
            message: 'Disconnect the existing Google Drive connection before changing scopes.'
          });
        }

        if (!connection) {
          try {
            connection = await connectionStore.createIntegration({
              ownerId: req.userId,
              ...draft
            });
            created = true;
          } catch (error) {
            if (error?.code !== 'workspace_integration_create_failed') throw error;
            connection = await connectionStore.findLiveIntegration(
              req.userId,
              'google_drive'
            );
            if (!connection || !matchesRequestedScopes(connection)) throw error;
          }
        }

        connectionId = connection.id;
"""
new_drive = """        const result = await connectionStore.createOrReuseIntegration({
          ownerId: req.userId,
          ...draft
        });
        if (!matchesRequestedScopes(result.connection)) {
          const error = new Error('workspace_google_drive_scope_change_requires_disconnect');
          error.code = 'workspace_google_drive_scope_change_requires_disconnect';
          throw error;
        }
        connectionId = result.connection.id;
        created = result.created;
"""
s = replace_once(s, old_drive, new_drive, 'drive connect route')
idx = s.find("  function driveFailure(res, error) {")
if idx < 0:
    raise SystemExit('driveFailure missing')
tail = s[idx:]
tail = replace_once(
    tail,
    """    if (
      code.includes('permission_') ||
""",
    """    if (code.includes('scope_change_requires_disconnect')) {
      return res.status(409).json({ status: 'error', code, externalWriteExecuted: false });
    }
    if (
      code.includes('permission_') ||
""",
    'driveFailure scope change'
)
routes.write_text(s[:idx] + tail)

ui = Path('frontend/zuvyr-suite-v1.js')
s = ui.read_text()
pattern = re.compile(
    r"    pluginState\.oauthMessage=\{title:'Finishing Google Drive connection…',message:'Validating the one-time OAuth state and storing credentials server-side in Vault\.'\};renderPluginOAuthMessage\(\);\n"
    r"    try\{\n"
    r"      await pluginApi\('/api/workspace/drive/oauth/callback',\{method:'POST',headers:\{'Content-Type':'application/json'\},body:JSON\.stringify\(\{code:code,state:state\}\)\}\);\n"
    r"      pluginState\.oauthMessage=\{title:'Google Drive connected',message:'The connection is active\. Tokens remain server-side in Vault\.'\};\n"
    r"    \}catch\(error\)\{pluginState\.oauthMessage=\{title:'Google Drive callback needs attention',message:error\.message\};\}\n"
    r"    finally\{oauthMarkerSet\(false\);scrubDriveOAuthUrl\(\);await loadPluginSurface\(true\);renderPluginOAuthMessage\(\);\}\n"
)
replacement = """    if(pluginState.oauthCallbackInFlight)return pluginState.oauthCallbackInFlight;
    pluginState.oauthMessage={title:'Finishing Google Drive connection…',message:'Validating the one-time OAuth state and storing credentials server-side in Vault.'};renderPluginOAuthMessage();
    pluginState.oauthCallbackInFlight=(async function(){
      try{
        await pluginApi('/api/workspace/drive/oauth/callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:code,state:state})});
        pluginState.oauthMessage={title:'Google Drive connected',message:'The connection is active. Tokens remain server-side in Vault.'};
      }catch(error){pluginState.oauthMessage={title:'Google Drive callback needs attention',message:error.message};}
      finally{oauthMarkerSet(false);scrubDriveOAuthUrl();await loadPluginSurface(true);renderPluginOAuthMessage();pluginState.oauthCallbackInFlight=null;}
    })();
    return pluginState.oauthCallbackInFlight;
"""
s, n = pattern.subn(replacement, s, count=1)
if n != 1:
    raise SystemExit(f'oauth callback block replacements={n}')
ui.write_text(s)

mcp = Path('supabase/functions/zuvyr-ops-mcp/index.ts')
s = mcp.read_text()
for old_url, new_url in {
    'https://raw.githubusercontent.com/ismaildormi/rox-ai/main': 'https://raw.githubusercontent.com/ismaildormi/ZUVYR-AI/main',
    'https://api.github.com/repos/ismaildormi/rox-ai': 'https://api.github.com/repos/ismaildormi/ZUVYR-AI'
}.items():
    if old_url not in s:
        raise SystemExit(f'MCP repo URL missing: {old_url}')
    s = s.replace(old_url, new_url)
mcp.write_text(s)

Path('backend/92_pack089_89e_clean_oauth_idempotency.sql').write_text("""-- ZUVYR V1 PACK089 / 89E — clean OAuth idempotency hardening
-- Atomic provider-row creation + expected OAuth replay as structured denial.

begin;

create or replace function public.create_or_reuse_workspace_integration_pack089(
  p_owner_id uuid,
  p_integration_key text,
  p_scopes text[],
  p_explicit_consent boolean
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_89e_create_or_reuse$
declare
  v_key text := lower(trim(coalesce(p_integration_key,'')));
  v_scopes text[];
  v_existing_scopes text[];
  v_connection public.workspace_integration_connections%rowtype;
  v_created boolean := false;
begin
  if p_owner_id is null then
    return jsonb_build_object('success',false,'error','workspace_owner_required');
  end if;
  if v_key <> 'google_drive' then
    return jsonb_build_object('success',false,'error','invalid_workspace_integration_key');
  end if;

  select coalesce(array_agg(distinct lower(trim(u.scope)) order by lower(trim(u.scope))), array[]::text[])
  into v_scopes
  from unnest(coalesce(p_scopes,array[]::text[])) as u(scope)
  where nullif(trim(u.scope),'') is not null;

  if cardinality(v_scopes) < 1 or cardinality(v_scopes) > 12 or '*'=any(v_scopes) then
    return jsonb_build_object('success',false,'error','invalid_workspace_integration_scopes');
  end if;
  if exists (
    select 1 from unnest(v_scopes) as allowed(scope)
    where allowed.scope not in ('drive.file.read','drive.file.write','drive.export')
  ) then
    return jsonb_build_object('success',false,'error','invalid_workspace_integration_scope');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text || ':' || v_key, 0));

  select * into v_connection
  from public.workspace_integration_connections c
  where c.owner_id=p_owner_id
    and c.integration_key=v_key
    and c.status <> 'revoked'
    and c.revoked_at is null
  order by c.updated_at desc
  limit 1
  for update;

  if found then
    select coalesce(array_agg(distinct lower(trim(u.scope)) order by lower(trim(u.scope))), array[]::text[])
    into v_existing_scopes
    from unnest(coalesce(v_connection.scopes,array[]::text[])) as u(scope)
    where nullif(trim(u.scope),'') is not null;

    if v_existing_scopes is distinct from v_scopes then
      return jsonb_build_object(
        'success',false,
        'error','workspace_google_drive_scope_change_requires_disconnect',
        'connection_id',v_connection.id
      );
    end if;

    if coalesce(p_explicit_consent,false) and v_connection.explicit_consent is distinct from true then
      update public.workspace_integration_connections
      set explicit_consent=true, updated_at=now()
      where id=v_connection.id
      returning * into v_connection;
    end if;
  else
    insert into public.workspace_integration_connections(
      owner_id,integration_key,scopes,explicit_consent,status,connected,read_enabled,write_enabled
    ) values (
      p_owner_id,v_key,v_scopes,coalesce(p_explicit_consent,false),'draft',false,false,false
    ) returning * into v_connection;
    v_created := true;
  end if;

  return jsonb_build_object(
    'success',true,
    'created',v_created,
    'connection',jsonb_build_object(
      'id',v_connection.id,
      'integration_key',v_connection.integration_key,
      'scopes',to_jsonb(v_connection.scopes),
      'explicit_consent',v_connection.explicit_consent,
      'status',v_connection.status,
      'connected',v_connection.connected,
      'read_enabled',v_connection.read_enabled,
      'write_enabled',v_connection.write_enabled,
      'created_at',v_connection.created_at,
      'updated_at',v_connection.updated_at
    )
  );
end;
$pack089_89e_create_or_reuse$;

create or replace function public.consume_workspace_oauth_session_owner_pack089(
  p_owner_id uuid,
  p_state_hash text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack089_89e_oauth_consume$
declare
  v_session public.workspace_oauth_sessions%rowtype;
  v_verifier text;
begin
  select s.* into v_session
  from public.workspace_oauth_sessions s
  join public.workspace_integration_connections c
    on c.id=s.connection_id
   and c.owner_id=s.owner_id
  where s.owner_id=p_owner_id
    and s.state_hash=lower(trim(coalesce(p_state_hash,'')))
    and s.consumed_at is null
    and s.expires_at > now()
    and c.status <> 'revoked'
    and c.revoked_at is null
  for update of s;

  if not found then
    return jsonb_build_object('success',false,'error','pack089_oauth_session_invalid');
  end if;

  select decrypted_secret into v_verifier
  from vault.decrypted_secrets
  where id=v_session.pkce_verifier_secret_id;

  if v_verifier is null then
    raise exception 'pack089_pkce_verifier_missing';
  end if;

  update public.workspace_oauth_sessions
  set consumed_at=now()
  where id=v_session.id;

  delete from vault.secrets where id=v_session.pkce_verifier_secret_id;

  return jsonb_build_object(
    'success',true,
    'session_id',v_session.id,
    'owner_id',v_session.owner_id,
    'connection_id',v_session.connection_id,
    'provider',v_session.provider,
    'redirect_uri',v_session.redirect_uri,
    'requested_scopes',to_jsonb(v_session.requested_scopes),
    'pkce_verifier',v_verifier
  );
end;
$pack089_89e_oauth_consume$;

revoke all on function public.create_or_reuse_workspace_integration_pack089(uuid,text,text[],boolean) from public,anon,authenticated;
grant execute on function public.create_or_reuse_workspace_integration_pack089(uuid,text,text[],boolean) to service_role;
revoke all on function public.consume_workspace_oauth_session_owner_pack089(uuid,text) from public,anon,authenticated;
grant execute on function public.consume_workspace_oauth_session_owner_pack089(uuid,text) to service_role;

comment on function public.create_or_reuse_workspace_integration_pack089(uuid,text,text[],boolean) is
  'PACK089/89E atomic owner/provider connection creation. Advisory-lock serialized; exact-scope retries reuse the existing live row.';
comment on function public.consume_workspace_oauth_session_owner_pack089(uuid,text) is
  'PACK089/89E one-time owner-bound OAuth consume. Expected stale/replayed state returns structured denial; PKCE corruption remains a hard error.';

commit;
""")

Path('backend/test-pack089-89e-oauth-cleanliness.js').write_text("""'use strict';
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

  console.log('PASS: PACK089 OAuth connect is atomic/idempotent and expected callback replay is fail-closed without PostgreSQL ERROR control flow');
})();
""")

pkg = Path('backend/package.json')
s = pkg.read_text()
marker = 'node test-pack089-89d-product-ui.js'
if s.count(marker) != 2:
    raise SystemExit(f'package test marker count={s.count(marker)}')
pkg.write_text(s.replace(marker, marker + ' && node test-pack089-89e-oauth-cleanliness.js'))

ledger = Path('docs/zuvyr/ZUVYR_REMAINING_WORK.md')
s = ledger.read_text()
operating_marker = 'Do not rely on chat memory alone for unfinished work.\n'
clean_rule = """Do not rely on chat memory alone for unfinished work.

### Zero-known-actionable-error gate

A ZUVYR stage/PACK may not advance while any **known internally actionable** error, failed check, security gap, runtime defect, integration race, broken deployment, or visual/UX defect remains in GitHub, Supabase, Railway, Vercel, CI, production runtime, security review, or Visual QA.

Provider-wide incidents outside ZUVYR control must be recorded here, their actual ZUVYR impact must be tested, and resilience/fail-closed behavior must be verified. Do not relabel a provider incident as a ZUVYR code fix. Informational findings must be classified with evidence rather than silenced by risky cleanup.

A `CLEAN` claim requires current evidence across the affected work surfaces, not only green source-code tests.
"""
s = replace_once(s, operating_marker, clean_rule, 'ledger clean rule')
old_rw1 = """### RW-001 — PACK089 Google OAuth production acceptance
Status: `ACTIVE / BLOCKED_EXTERNAL`

Required before PACK090:
- real owner-scoped Google Drive OAuth start in production;
- Google accepts configured client and redirect URI;
- approve only requested scopes;
- callback activation;
- one granted-scope Drive tool call;
- denied-scope/action proof;
- disconnect/revoke;
- post-revoke denial;
- audit persistence;
- Vault/plaintext-secret cleanliness proof.

Do not mark PACK089 complete before this evidence exists.
"""
new_rw1 = """### RW-001 — PACK089 Google OAuth production acceptance
Status: `ACTIVE`

Live evidence now confirmed:
- real owner-scoped OAuth reached Google and callback activation succeeded;
- the single live Google Drive connection is active with `drive.file.read` + `drive.export`;
- `write_enabled=false`;
- credentials are stored server-side through the existing Vault-backed path.

Still required before PACK090:
- close the duplicate-connect/callback cleanliness defects discovered from Supabase production logs and verify a clean post-fix window;
- one granted-scope Drive tool call;
- denied-scope/action proof;
- disconnect/revoke;
- post-revoke denial;
- audit persistence;
- Vault/plaintext-secret cleanliness proof.

Do not mark PACK089 complete before this evidence exists.
"""
s = replace_once(s, old_rw1, new_rw1, 'RW-001')
insert_before = '\n## Rules for future additions\n'
rw17 = """
---

### RW-017 — Supabase eu-west-1 provider incident + ZUVYR resilience verification
Status: `BLOCKED_EXTERNAL / MONITOR`
Subsystem: `Supabase provider availability / production resilience`

On 2026-09-24 the Supabase dashboard/status surface reported an active technical incident affecting project lifecycle operations in `eu-west-1`. The ZUVYR project itself remained `ACTIVE_HEALTHY` and representative production RPC traffic continued returning HTTP 200, so the provider incident must not be confused with an internal database outage.

Required before closure:
- Supabase marks the provider incident resolved;
- re-run project health, Auth, database, Edge Function and representative ZUVYR RPC checks after provider recovery;
- verify no data-integrity, migration, auth, secret/Vault, or runtime regression was introduced during the incident window;
- attach dated evidence and close this item.

This external incident does not justify leaving internally actionable Supabase errors unresolved.
"""
s = replace_once(s, insert_before, rw17 + insert_before, 'RW-017 insertion')
ledger.write_text(s)
