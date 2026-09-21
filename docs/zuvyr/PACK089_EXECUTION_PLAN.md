# PACK089 — Skills / Plugins / MCP / Connections — Execution Plan

Date: 2026-09-21
Canonical predecessor: PACK088 `LOCKED_VERIFIED`
Implementation status: `IN_PROGRESS` — 89A–89B `LOCKED_VERIFIED`, 89C active

## 1. Objective

Turn the existing workspace plugin/integration placeholders and process-local `ai.tools` registry into one secure V1 connection system without creating parallel permission, billing, content, or task systems.

PACK089 must deliver:
- reusable declarative Skills;
- one unified tool registry for built-in tools, plugins and MCP-backed tools;
- owner-scoped plugin/MCP lifecycle;
- OAuth connection lifecycle with Google Drive first;
- credentials/tokens stored only in Supabase Vault;
- Permission Center grants for connected-tool execution;
- immediate local revoke that blocks all future execution;
- audit receipts for connect/install/invoke/revoke;
- UI states for Skills / Plugins / Connections;
- production acceptance proving scope enforcement and revoke behavior.

## 2. Reconciled foundations

Existing and reused:
- `backend/src/core/registry.js` — canonical generic process-local registry.
- `backend/src/modules/ai/tools/index.js` — canonical `ai.tools` registration seam.
- `workspace_plugin_connections` — production table, RLS ON, server-only, zero rows.
- `workspace_integration_connections` — production table, RLS ON, server-only, zero rows.
- `workspace_audit_events` — production server-only audit table.
- PACK047 Permission Center — canonical grant/consume/revoke/audit path.
- PACK095 Supabase Vault pattern — canonical secret storage precedent.
- Brain/Kernel + unified usage ledger — reused; PACK089 creates no second ledger.
- Frontend Plugins surface exists but is intentionally blocked.

Historical source `plugin_installations` is NOT present in production and must not be revived as a second plugin model.

## 3. Security invariants

1. Plaintext OAuth/MCP/plugin credentials never persist in public tables, logs, receipts or browser responses.
2. Vault secret identifiers may persist; plaintext is service-role runtime only.
3. All connection/plugin/skill rows are owner-scoped.
4. No wildcard scope.
5. Connected tool execution requires BOTH:
   - active/non-revoked connection state with matching declared scope; and
   - current Permission Center authorization.
6. Revocation atomically:
   - makes the resource non-executable;
   - revokes active Permission Center grants for that resource;
   - removes its Vault credential reference and secret;
   - preserves non-secret history/audit.
7. External writes require an exact operation fingerprint and a short-lived permission.
8. Custom MCP endpoints must be HTTPS and pass SSRF/private-network checks before any network call.
9. Third-party executable code is never loaded into the ZUVYR process. Plugin manifests remain declarative.
10. Memory permission and model-training consent remain separate from connection/tool permissions.

## 4. Phases

### 89A — Canonical schema + Vault + Permission Center ✅ `LOCKED_VERIFIED`
- extend existing plugin/integration connection rows; do not create replacement tables;
- add durable OAuth sessions with hashed state + PKCE verifier in Vault;
- add owner-scoped declarative Skills;
- extend Permission Center actions/namespaces/scope types;
- add atomic connection/plugin revoke RPCs that revoke associated grants;
- service-role-only privileges;
- transaction-only production schema/invariant acceptance.

### 89B — Unified tool / Skills / Plugin / MCP runtime ✅ `LOCKED_VERIFIED`
- keep `ai.tools` as the single invocation seam;
- persistent declarative Skills resolve to registered tool keys;
- plugin manifests register namespaced tools only;
- MCP uses an isolated remote adapter, not in-process third-party code;
- exact declared scope checked before invocation;
- permission consumption bound to invocation request identity;
- MCP endpoint SSRF/private-network protections;
- no paid provider charge unless a canonical cost entry exists.

### 89C — Google Drive OAuth + tools 🟠 `IN_PROGRESS`
- OAuth authorization-code + PKCE flow;
- durable expiring one-time state;
- token exchange server-side;
- token payload stored in Vault;
- refresh flow server-side;
- Google Drive list/search/read/export/write tool adapters;
- requested internal scope maps to provider OAuth scope;
- no browser token exposure;
- disconnect blocks runtime before remote revoke attempt.

### 89D — Product UI
- activate Plugins/Connections/Skills surface only after backend gates pass;
- discover/list, connect/install, permission review, active scopes, revoke/disconnect;
- loading/empty/error/retry/reopen states;
- responsive/mobile, keyboard and RTL acceptance;
- no credential fields rendered after submission.

### 89E — Production acceptance
- real owner-scoped connection journey;
- connected tool executes only granted scope;
- denied scope fails before external call;
- revoke immediately blocks future call;
- no credential leakage;
- audit event persisted;
- retry/reopen stable;
- exact deployment identity and receipt/state/matrix/roadmap reconciliation.

## 5. Google OAuth external gate

At reconciliation time production Railway exposes `GOOGLE_API_KEY` only; no Google OAuth client ID/secret variable is present.
Engineering continues through 89A–89D.
A real Google OAuth acceptance in 89E requires legitimate Google OAuth client credentials and redirect configuration. Missing credentials must fail closed; they must never be fabricated or copied into source.

## 6. Definition of done

PACK089 becomes `LOCKED_VERIFIED` only when:
- 89A–89E all pass;
- Google Drive OAuth executes with real credentials in production or an explicitly approved canonical alternative is evidenced;
- scope denial is proven before network execution;
- token/connection revoke is proven to block the next action immediately;
- plugin/MCP invoke is permission-scoped and SSRF-safe;
- Skills persist and reopen without executable code injection;
- production rows/grants/secrets are cleaned or intentionally preserved;
- receipts and canonical project state are reconciled.

PACK090 must not start before this gate.


## 7. 89A canonical receipt — 2026-09-21

- Final production commit: `c977e342646b6d3b59d61844ae9ef84486dfa82d`
- Quality run: `35649552503` — Backend Quality PASS + Release Quality PASS.
- Production migrations:
  - `20260921192642 pack089_89a_connections_permissions`
  - `20260921201251 pack089_89a_oauth_revoke_hardening`
- Railway exact commit: backend / worker / maintenance all SUCCESS.
- RLS: PASS on canonical connection/OAuth/Skill tables.
- Client table grants: 0.
- Sensitive RPC client EXECUTE grants: 0; service-role sensitive RPCs: 8.
- Revoked OAuth callbacks fail closed; revoke clears pending PKCE Vault secrets.
- MCP private/local endpoint validation is blocked before runtime.
- Acceptance residue: 0 connection rows, 0 OAuth rows, 0 Skills, 0 PACK089 grants, 0 PACK089 Vault secrets.
- No provider/payment/external-connection calls were made in 89A.
- Receipt: `zuvyr-pack-evidence/pack-089/2026-09-21-89a/receipt.json`.

Canonical next action: `89C_GOOGLE_DRIVE_OAUTH_TOOLS`.

## 8. 89B canonical receipt — 2026-09-21

- Unified `ai.tools` runtime, declarative Skills, guarded plugin delegates and MCP remote tools are live on main.
- 89B runtime implementation commit: `62b82697aa3be0eaa38ebf7f6dc2931d2289395f`.
- Official MCP client SDK: `@modelcontextprotocol/client@2.0.0`.
- SDK PR #83 merged as `92d4e05667c2f095e63b0410d0a81cad62e6d0a7`.
- Quality run `35654292803`: Backend Quality PASS + Release Quality PASS; `npm ci` and real SDK preflight import PASS.
- Production migration: `20260921204458 pack089_89b_tool_runtime_permissions`.
- 89B RPCs are service-role-only; anon/authenticated EXECUTE grants are 0.
- Transaction-only production acceptance: plugin install PASS, invoke PASS, replay blocked, fingerprint mismatch blocked, revoke blocks next invocation; 0 network/provider/billing calls; full rollback.
- Production cleanup: 0 active plugin rows and 0 PACK089 plugin grants.
- Railway exact commit `92d4e05667c2f095e63b0410d0a81cad62e6d0a7`: backend gate-enabled deployment `1d160111-a3c6-4416-992d-2fb246d88e3d` SUCCESS; worker `e52a3d7e-1b59-4bd2-a4fe-e70e859c6fff` SUCCESS; maintenance `eeffd642-031a-42e3-b7dd-d9507b553c91` SUCCESS.
- `PACK089_MCP_REMOTE_ENABLED=true` is enabled only on backend production; no live MCP connection exists, so no unsolicited third-party network call occurred.
- Real remote MCP invocation remains part of 89E final production acceptance.
- Receipt: `zuvyr-pack-evidence/pack-089/2026-09-21-89b/receipt.json`.

Canonical next action: `89C_GOOGLE_DRIVE_OAUTH_TOOLS`.
