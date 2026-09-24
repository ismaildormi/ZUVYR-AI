# ZUVYR Remaining Work — Canonical Ledger

Status: **CANONICAL REMAINING-WORK REGISTER**  
Owner rule adopted: 2026-09-24

This file is the durable register for **everything that still needs to be done in ZUVYR V1**.

## Permanent operating rule

From now on, whenever work on any ZUVYR PACK, audit, deployment, test, security review, provider integration, UI acceptance, or production reconciliation reveals something that is still required, it must be recorded here unless it is fully resolved in the same work session.

Do not rely on chat memory alone for unfinished work.

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
