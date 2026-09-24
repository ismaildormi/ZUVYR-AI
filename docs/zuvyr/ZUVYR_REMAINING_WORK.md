# ZUVYR Remaining Work — Canonical Ledger

Status: **CANONICAL REMAINING-WORK REGISTER**  
Owner rule adopted: 2026-09-24

This file is the durable register for **everything that still needs to be done in ZUVYR V1**.

## Permanent operating rule

From now on, whenever work on any ZUVYR PACK, audit, deployment, test, security review, provider integration, UI acceptance, or production reconciliation reveals something that is still required, it must be recorded here unless it is fully resolved in the same work session.

Do not rely on chat memory alone for unfinished work.

### Zero-known-actionable-error gate

A ZUVYR stage/PACK may not advance while any **known internally actionable** error, failed check, security gap, runtime defect, integration race, broken deployment, or visual/UX defect remains in GitHub, Supabase, Railway, Vercel, CI, production runtime, security review, or Visual QA.

Provider-wide incidents outside ZUVYR control must be recorded here, their actual ZUVYR impact must be tested, and resilience/fail-closed behavior must be verified. Do not relabel a provider incident as a ZUVYR code fix. Informational findings must be classified with evidence rather than silenced by risky cleanup.

A `CLEAN` claim requires current evidence across the affected work surfaces, not only green source-code tests.

When an item is completed:
- do **not** delete it silently;
- mark it `CLOSED`;
- add the close date;
- add the commit / PR / deployment / migration / receipt that proves closure.

A task may be removed only when its history has been superseded by a canonical receipt and the removal itself is documented.

## Status vocabulary

- `ACTIVE` — next legal work or currently actionable.
- `BLOCKED_EXTERNAL` — requires an external account, provider, plan, credential, physical device, or owner consent that cannot be legitimately fabricated.
- `AUTH_ACCEPTANCE_PENDING` — implementation exists but authenticated production acceptance is still required.
- `DEFERRED_BY_OWNER` — intentionally postponed by explicit owner instruction.
- `MONITOR` — not currently a defect, but requires later evidence after a representative usage window.
- `CLOSED` — completed with evidence.

## Current V1 remaining work

### RW-001 — PACK089 Google OAuth production acceptance
Status: `AUTH_ACCEPTANCE_PENDING`

Completed and production-verified:
- owner-scoped Google OAuth consent and callback succeeded;
- one live Google Drive connection is active with `drive.file.read` + `drive.export`; `write_enabled=false`;
- duplicate-connect/callback idempotency and expired PKCE Vault cleanup are production verified;
- owner acceptance controls are deployed on main `f1886d5cd9a9a3a6d56c0cc8a83daf80fb6a47ea`: Browse files, exact Permission Center grant, denied-write guard, disconnect/revoke and post-revoke denial check;
- credentials remain server-side through the Vault-backed path.

Still required before PACK090:
- the real owner executes **Browse files** and approves the exact read permission;
- granted Drive list/read result is observed;
- denied write/scope proof is observed;
- real disconnect/revoke is executed;
- post-revoke denial is observed;
- audit persistence is verified;
- Vault/plaintext-secret cleanliness is verified after revoke.

Current production permission-audit evidence shows the new owner acceptance has not yet been executed. Do not mark PACK089 complete or start PACK090 before this sequence exists.

---

### RW-002 — Deferred paid media/audio provider E2E acceptance
Status: `BLOCKED_EXTERNAL`

Complete the paid/provider-backed media and audio acceptance gates that require real authorized billed calls. Never simulate a paid-provider success.

---

### RW-003 — PACK073 physical microphone acceptance
Status: `BLOCKED_EXTERNAL`

Requires authenticated acceptance with a real physical microphone/device path.

---

### RW-004 — PACK076–PACK080 M15/M16 real sandbox/runtime/deploy acceptance
Status: `BLOCKED_EXTERNAL`

Implementation exists, but live acceptance still requires the real Vercel sandbox/deployment operator path, including the required Vercel credentials/account context and a controlled real target.

Known internal pricing/readiness research must not be confused with completed live acceptance.

---

### RW-005 — PACK081–PACK082 M17 Browserbase/browser-agent live acceptance
Status: `BLOCKED_EXTERNAL`

Requires real Browserbase account credentials/project context, effective account pricing, explicit live approval, and a controlled live browser-agent acceptance run.

---

### RW-006 — PACK083–PACK084 M18 live 3D acceptance
Status: `BLOCKED_EXTERNAL`

Requires paid generation plus authenticated real-asset viewer/export acceptance.

---

### RW-007 — PACK085 M19 real-device acceptance
Status: `BLOCKED_EXTERNAL`

Requires a real test-device install/start/uninstall acceptance loop.

---

### RW-008 — PACK096 M21 owned-model / BYOC learning and serving loop
Status: `BLOCKED_EXTERNAL`

Requires a real rights-approved owned-model/BYOC learning and serving loop. Do not claim a proprietary production-model loop before this closes.

---

### RW-009 — PACK094 Data Rights UI authenticated owner acceptance
Status: `AUTH_ACCEPTANCE_PENDING`

Production frontend sub-gate is already reconciled; authenticated owner acceptance remains required.

---

### RW-010 — PACK095 Model Lab UI authenticated owner/admin acceptance
Status: `AUTH_ACCEPTANCE_PENDING`

Production frontend sub-gate is already reconciled; authenticated owner/admin acceptance remains required.

---

### RW-011 — Supabase leaked-password protection
Status: `BLOCKED_EXTERNAL`

Current Supabase organization/project plan is Free. Leaked-password protection requires a plan/capability that is not currently available through the connected environment, and the connected tooling cannot legitimately enable the unavailable Auth security feature.

Keep this explicit; do not call the project globally CLEAN while this required security gate remains unresolved if it is still applicable at V1 finalization.

---

### RW-012 — GitHub `main` branch protection / ruleset
Status: `BLOCKED_EXTERNAL`

`main` is currently unprotected. The connected GitHub tool surface does not expose the required repository-administration mutation.

At final hardening, enable an appropriate protection/ruleset without breaking the intentional release workflow, then verify required CI checks and merge behavior.

---

### RW-013 — Stripe business verification + controlled live real-money acceptance
Status: `DEFERRED_BY_OWNER`

Owner instruction: **this must be the final external activation action inside PACK150**.

Already completed before deferral:
- Stripe internal code hardening;
- test/live mode isolation;
- full paid-plan price validation;
- top-up/subscription fail-closed gates;
- webhook mode isolation;
- Stripe runtime/CI coverage;
- production billing flags explicitly fail-closed;
- safe Railway redeploy verified.

Still required at the very end of V1:
- Stripe business verification;
- live-mode activation;
- controlled real-money production acceptance;
- reconciliation/refund/idempotency proof as applicable;
- only after this may `V1_READY=true` be emitted.

This item must **not** block intermediate PACKs whose own gates pass.

Canonical contract: `docs/zuvyr/STRIPE_FINAL_V1_ACTIVATION_GATE_2026-09-24.md`

---

### RW-014 — Supabase unused-index evidence window
Status: `MONITOR`

Current unused-index findings are informational and must not be "fixed" by blind deletion. Many indexes were recently created to close verified foreign-key performance debt.

Required later:
- wait for representative production traffic;
- inspect query/index usage;
- remove only indexes proven redundant/unhelpful;
- preserve indexes required for foreign-key and known query paths.

---

### RW-015 — Private ChatGPT ↔ ZUVYR Ops connector
Status: `ACTIVE / AUTH_ACCEPTANCE_PENDING`
Subsystem: `Operational tooling / owner-scoped MCP`

Owner intent: connect ChatGPT directly to ZUVYR so future chats can inspect the live project state and run safe acceptance checks without relying on screenshots or manual cross-tool reconciliation every time.

Implementation completed so far:
- PRIVATE USER plugin `ZUVYR Live Operator` exists and was upgraded to v0.2.0;
- production Supabase Edge Function `zuvyr-ops-mcp` version 1 is ACTIVE;
- inbound MCP is read-only by default and exposes only bounded state/health/acceptance tools;
- bearer identity is revalidated server-side and access additionally requires `profiles.is_admin=true`;
- secret-bearing integration fields are excluded from responses;
- per-owner audit logging and rate limiting are implemented;
- no payment, billing, IAM, delete, provider-spend, secret, or destructive mutation tool is exposed;
- plugin package contains the MCP URL but no embedded authorization token, API key, or client secret.

Still required before closure:
- complete the real plugin authorization flow against ZUVYR Ops MCP;
- prove a real authenticated ChatGPT → ZUVYR `current_state` read;
- prove a real `health` safe live probe;
- prove unauthorized/non-admin access denial and revoked/invalid-token denial;
- verify audit records are created for the accepted connection/tool calls;
- reconcile any OAuth-server/DCR configuration required by the live Supabase project without weakening owner scoping;
- document final connection acceptance evidence.

Do not mark this CLOSED until the private plugin is connected and a real authenticated ChatGPT → ZUVYR read + safe test succeeds in production.

---

### RW-016 — ChatGPT-visible ZUVYR visual and product-experience QA
Status: `CLOSED`
Closed: 2026-09-24
Subsystem: `Visual QA / UX / accessibility / responsive product acceptance`

Closure evidence:
- merged production source: `f1886d5cd9a9a3a6d56c0cc8a83daf80fb6a47ea`;
- post-merge Visual QA workflow run: `36067370611` = **PASS**;
- immutable artifact: `10836762121` / `zuvyr-visual-qa-f1886d5cd9a9a3a6d56c0cc8a83daf80fb6a47ea`;
- 24 deterministic fixture views + 26 native screens inspected;
- horizontal overflow=0, missing views=0, duplicate IDs=0, console errors=0, render failures=0;
- accessibility critical=0, serious=0, moderate=0;
- canonical public-production probe HTTP 200.

The required visual harness, screenshot/report inspection, actionable-finding repair and passing rerun are now evidenced. Reopen this item only if a later UI change creates a new actionable regression.

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

---

### RW-018 — Vercel Git build-rate-limit blocks all-green deployment evidence
Status: `CLOSED`
Closed: 2026-09-24
Subsystem: `Vercel Git integration / Level 3 production deployment evidence`

Closure evidence:
- cooldown/build quota recovered without disabling the Vercel Git safety path;
- exact production deployment `dpl_DEhSnxP5pC5JUeZmaKhgHRN9nbeU` is **READY**;
- deployment source SHA is exact merged main `f1886d5cd9a9a3a6d56c0cc8a83daf80fb6a47ea`;
- GitHub Vercel status on current main is **SUCCESS**;
- post-merge Visual QA run `36067370611` is **PASS** and its production probe returned HTTP 200.

The historical rate-limit failures remain evidence, but they are no longer a current ZUVYR gate.


## Rules for future additions

Every newly discovered unresolved item must include:
1. a stable `RW-###` identifier;
2. the affected PACK / subsystem;
3. current status;
4. exact remaining acceptance or fix;
5. why it cannot be considered complete yet;
6. closure evidence when finished.

If a finding is internally actionable and safe to fix immediately, **fix it instead of adding it here as an excuse to defer work**. This ledger is for genuinely remaining work, not for avoiding work.

## V1 readiness rule

`V1_READY=true` is forbidden while any V1-applicable item in this ledger is in `ACTIVE`, `AUTH_ACCEPTANCE_PENDING`, `BLOCKED_EXTERNAL`, or `DEFERRED_BY_OWNER`, unless that item has a canonical `N/A_WITH_EVIDENCE` disposition permitted by the V1 contract.

Stripe RW-013 remains the intentionally last external activation action.
