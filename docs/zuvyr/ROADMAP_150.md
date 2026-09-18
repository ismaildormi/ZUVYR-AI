# ZUVYR V1 — Canonical 001–150 roadmap

Date: 2026-09-18. Active: PACK063 OPEN. PACK062 LOCKED_ENGINEERING_VERIFIED with paid-live E2E deferred.

Latest user MASTER EXECUTION PROMPT overrides attached 100-pack and one-step rules. 001–099 retain numbering and original scope; 100 remains hardening checkpoint; 101–150 extend integration/operational qualification without repeating original feature builds. Historical status is not newly verified.

This specification is not an execution receipt. Missing historical state must be reconciled with existing receipts without rerunning completed work. PACK150 alone may declare final V1 readiness. FIX iterations retain their pack number.

## PACK001 — Freeze Production Truth

- **Objective:** Freeze Production Truth
- **Scope:** Read-only capture of actual Git HEAD, branch, dirty inventory, Railway services/deployments, Supabase ref/schema fingerprint, Vercel project/domain and public health endpoints. Create MASTER_STATE + MASTER_MATRIX. Do not assume today's d94e2a is still current.
- **Dependencies:** None
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Exact baseline receipt exists; no production behavior changed; next pack can prove it is running on this exact baseline. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Exact baseline receipt exists; no production behavior changed; next pack can prove it is running on this exact baseline.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK002 — Deployment & Connector Identity

- **Objective:** Deployment & Connector Identity
- **Scope:** Normalize IDs/URLs for GitHub source, Railway backend/worker/Redis, Supabase, Vercel and domain. Add read-only verifier that detects wrong account/project/environment.
- **Dependencies:** 001
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Verifier distinguishes correct production targets and fails closed on mismatch. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Verifier distinguishes correct production targets and fails closed on mismatch.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M01
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK003 — Secrets & Environment Boundary Audit

- **Objective:** Secrets & Environment Boundary Audit
- **Scope:** Inventory environment-variable names only; map each secret to server-side owner/service; detect missing, duplicated, browser-exposed or stale configuration without printing values.
- **Dependencies:** 002
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** No secret value enters repo/logs; required-vs-optional env contract is versioned. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** No secret value enters repo/logs; required-vs-optional env contract is versioned.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK004 — Protect Metrics & Operator Endpoints

- **Objective:** Protect Metrics & Operator Endpoints
- **Scope:** Protect /metrics and operator-only diagnostics; add tests for anonymous denial and authorized access; preserve public /healthz only.
- **Dependencies:** 003
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Anonymous access to metrics/operator data is denied; health endpoint stays usable. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Anonymous access to metrics/operator data is denied; health endpoint stays usable.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M02
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK005 — Single Maintenance Strategy

- **Objective:** Single Maintenance Strategy
- **Scope:** Choose one maintenance scheduler architecture (internal secret route OR Supabase/DB cron), prevent dual execution, add idempotency/run receipts and failure logs.
- **Dependencies:** 004
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Exactly one maintenance strategy is enabled; duplicate runs cannot double-apply financial maintenance. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Exactly one maintenance strategy is enabled; duplicate runs cannot double-apply financial maintenance.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M03
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK006 — Readiness & Railway Health Gates

- **Objective:** Readiness & Railway Health Gates
- **Scope:** Add/verify readiness semantics for Redis/Supabase dependencies, safe startup behavior and deployment health checks; no fake green when critical dependency is unavailable.
- **Dependencies:** 005
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Railway deployment health gate uses the intended endpoint and failure simulation is proven. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Railway deployment health gate uses the intended endpoint and failure simulation is proven.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M04
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK007 — CI / Release Quality Gate

- **Objective:** CI / Release Quality Gate
- **Scope:** Add deterministic lint/unit/integration/security/build gate and release manifest; preserve production-only UI target while testing in isolated/offline environments.
- **Dependencies:** 006
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Broken tests/build cannot qualify a commit for production; source and generated release receipt match. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Broken tests/build cannot qualify a commit for production; source and generated release receipt match.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M05
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK008 — Supabase Canonical Read-Only Audit

- **Objective:** Supabase Canonical Read-Only Audit
- **Scope:** Fresh metadata audit of tables, columns, RLS, policies, triggers, RPC permissions, storage and known historical warnings; no customer content extraction.
- **Dependencies:** 007
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** A dated DB truth report classifies VERIFIED/FIX/ABSENT/CONFLICT for every required object. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** A dated DB truth report classifies VERIFIED/FIX/ABSENT/CONFLICT for every required object.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK009 — Supabase Security Corrections

- **Objective:** Supabase Security Corrections
- **Scope:** Generate only additive/minimal migrations required by Pack 008: RLS, profile guard, financial RPC permissions, security-definer search_path and missing indexes/constraints. Never reinstall old migrations blindly.
- **Dependencies:** 008
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Migration postconditions prove preserved balances/rows/security and browser roles cannot mutate protected finance data. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Migration postconditions prove preserved balances/rows/security and browser roles cannot mutate protected finance data.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M06
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK010 — Infrastructure Checkpoint A

- **Objective:** Infrastructure Checkpoint A
- **Scope:** Run backup/restore smoke, health, auth, DB/Redis dependency, log-redaction and rollback verification; lock checkpoint A.
- **Dependencies:** 002, 004, 005, 006, 007, 008, 009
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** P0 infrastructure blockers = 0 and CHECKPOINT_A receipt is immutable. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** P0 infrastructure blockers = 0 and CHECKPOINT_A receipt is immutable.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK011 — Canonical Database Foundations

- **Objective:** Canonical Database Foundations
- **Scope:** Reconcile pack-29..38 foundations against live schema: task runs, sources, code, audio, IP, workspace, orchestration and generation metadata. Add only missing compatible objects.
- **Dependencies:** 010
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Required V1 foundation objects exist with RLS/ownership; existing customer rows are preserved. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Required V1 foundation objects exist with RLS/ownership; existing customer rows are preserved.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M07
- **Recorded status:** VERIFIED

## PACK012 — Financial RPC Invariants

- **Objective:** Financial RPC Invariants
- **Scope:** Audit and harden reserve/settle/refund and legacy Stripe settlement compatibility: concurrency, replay, negative balance, partial failure and service-role permissions.
- **Dependencies:** 011
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Financial race/idempotency tests pass; no duplicate charge/refund path exists. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Financial race/idempotency tests pass; no duplicate charge/refund path exists.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** VERIFIED

## PACK013 — Unified Usage Ledger

- **Objective:** Unified Usage Ledger
- **Scope:** Make one authoritative usage ledger for Chat/Image/Video/Audio/Code/Research/Browser/IP/3D/Work, with available/reserved/used/refunded states and request/step IDs. ADD for Code Studio Live Preview: normalize separate usage events for AI code edits, build jobs, sandbox/runtime compute, preview-runtime duration, storage/egress where billable, and correlate all of them to the same project/task without creating a second billing system.
- **Dependencies:** 012
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Every metered capability can write the same normalized accounting record contract; a Code Studio session can distinguish AI-edit, build and runtime/preview usage without duplicate reservation or charge. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Every metered capability can write the same normalized accounting record contract; a Code Studio session can distinguish AI-edit, build and runtime/preview usage without duplicate reservation or charge.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK014 — Single Cost Registry

- **Objective:** Single Cost Registry
- **Scope:** Consolidate duplicate pricing sources into one versioned registry while keeping compatibility shims. Add effective date, source, verification state, unit, provider/model/tool and fail-closed unknown pricing. ADD Live Preview units/contracts for sandbox/runtime time, build jobs, preview transport/bandwidth/egress and idle-session policy when those costs are billable.
- **Dependencies:** 013
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Exactly one authoritative price lookup path; unknown/expired price cannot silently become zero, including Code Studio build/runtime/preview execution. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Exactly one authoritative price lookup path; unknown/expired price cannot silently become zero, including Code Studio build/runtime/preview execution.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK015 — Full Technical Cost Model

- **Objective:** Full Technical Cost Model
- **Scope:** Add exact micro-USD/decimal-safe calculation for provider + infra reserve + storage + bandwidth + retries + sandbox/browser/media overhead; add margin formula and audit trace. ADD Code Studio preview economics: startup/build/HMR compute, active/idle runtime duration, preview proxy/egress and cleanup/retry overhead.
- **Dependencies:** 014
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Cost estimate can explain each component; no JS floating point used for money; Code Studio preview/runtime cannot be treated as free merely because no AI token is consumed. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Cost estimate can explain each component; no JS floating point used for money; Code Studio preview/runtime cannot be treated as free merely because no AI token is consumed.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK016 — Canonical Plans & Entitlements

- **Objective:** Canonical Plans & Entitlements
- **Scope:** Implement FREE, STARTER, PLUS, PRO, LEGEND, MAX as versioned entitlement config. Keep feature access separate from purchased capacity; IP minimum tier remains configurable until economics are verified.
- **Dependencies:** 015
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Backend + frontend read the same plan catalog; credits cannot unlock gated features. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Backend + frontend read the same plan catalog; credits cannot unlock gated features.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK017 — 5H Capacity + Weekly Protection

- **Objective:** 5H Capacity + Weekly Protection
- **Scope:** Implement unified 5-hour included capacity, internal weekly protection, renewal windows, warnings 20/10/5%, and persistent top-up precedence without expiring purchased credits.
- **Dependencies:** 016
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Window rollover, exhaustion, renewal and top-up precedence tests pass without balance loss. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Window rollover, exhaustion, renewal and top-up precedence tests pass without balance loss.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK018 — Unified Usage & Billing UX

- **Objective:** Unified Usage & Billing UX
- **Scope:** Replace old sidebar meter with the same live source used by Usage/Billing. Show plan, 5H capacity, top-up balance, request history, warnings and upgrade/top-up actions.
- **Dependencies:** 017
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** All visible meters agree after reload/login and across device sizes. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** All visible meters agree after reload/login and across device sizes.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK019 — Stripe Canonical Catalog & Lifecycle

- **Objective:** Stripe Canonical Catalog & Lifecycle
- **Scope:** Map canonical plans/top-ups to Stripe IDs; verify checkout, subscription create/update/pause/resume/cancel, invoice paid/failed, webhook replay and wallet settlement. No secret values in pack.
- **Dependencies:** 018
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Stripe test matrix passes against configured catalog; old valid settlements remain compatible. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Stripe test matrix passes against configured catalog; old valid settlements remain compatible.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M08
- **Recorded status:** SOURCE_VERIFIED_AWAITING_M08

## PACK020 — Money Checkpoint B

- **Objective:** Money Checkpoint B
- **Scope:** Run owner-account paid/top-up/subscription lifecycle tests, concurrency/failure/refund tests and profitability receipt. Freeze billing baseline.
- **Dependencies:** 011, 012, 013, 014, 015, 016, 017, 018, 019
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** One real logical operation reserves once, settles once and refunds correctly; billing UI matches DB. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** One real logical operation reserves once, settles once and refunds correctly; billing UI matches DB.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M09
- **Recorded status:** LOCKED_VERIFIED_TEST_MODE

## PACK021 — Provider Registry

- **Objective:** Provider Registry
- **Scope:** Create authoritative provider registry: credentials-present flag (never value), regions, capabilities, quota type, terms/license notes, health adapter and cost-registry link.
- **Dependencies:** 020
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Every enabled provider has a verified capability and cost source or is blocked. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Every enabled provider has a verified capability and cost source or is blocked.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M10
- **Recorded status:** LOCKED_VERIFIED

## PACK022 — Model Registry

- **Objective:** Model Registry
- **Scope:** Create model/tool registry with provider ID, capability, modality, context, language, quality tier, latency class, commercial eligibility, price reference and deprecation state.
- **Dependencies:** 021
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Router can list valid candidates without hardcoded feature-specific model lists. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Router can list valid candidates without hardcoded feature-specific model lists.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK023 — Normalized Provider Adapter Contract

- **Objective:** Normalized Provider Adapter Contract
- **Scope:** Standardize request/result/usage/error/cancel interfaces across text, image, video, audio, research, 3D, browser and sandbox providers.
- **Dependencies:** 022
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** At least existing providers conform; result URLs/artifacts and usage are normalized. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** At least existing providers conform; result URLs/artifacts and usage are normalized.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK024 — Provider Health & Quota State

- **Objective:** Provider Health & Quota State
- **Scope:** Implement HEALTHY/DEGRADED/OPEN state, cooldown probes, quota-pool state and health timestamps; provider quota is separate from user quota.
- **Dependencies:** 023
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Simulated outage opens circuit and recovery probe restores service without billing users. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Simulated outage opens circuit and recovery probe restores service without billing users.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK025 — Error Taxonomy & Retry Policy

- **Objective:** Error Taxonomy & Retry Policy
- **Scope:** Normalize RATE_LIMIT, QUOTA, DOWN, TIMEOUT, MODEL_UNAVAILABLE, AUTH, INVALID_REQUEST, CONTENT_RESTRICTION, INTERNAL and retryability rules.
- **Dependencies:** 024
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Errors map consistently to bounded retry/fallback/user messages. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Errors map consistently to bounded retry/fallback/user messages.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK026 — Router Hard Filters

- **Objective:** Router Hard Filters
- **Scope:** Apply entitlement, permission, modality, language, context, region, health, quota, verified cost and margin floor before ranking.
- **Dependencies:** 025
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Ineligible/unknown-cost route can never be selected, including fallback. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Ineligible/unknown-cost route can never be selected, including fallback.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK027 — Router Ranking Modes

- **Objective:** Router Ranking Modes
- **Scope:** Implement Smart/Best Value, Economy, Fast, Max Quality using configurable quality/reliability/latency/margin/context/language/privacy scores.
- **Dependencies:** 026
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Deterministic fixtures prove each mode changes ranking only inside eligible candidates. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Deterministic fixtures prove each mode changes ranking only inside eligible candidates.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK028 — Margin Guard & Decision Log

- **Objective:** Margin Guard & Decision Log
- **Scope:** Add green/yellow/red margin guard, route decision receipts with estimate/actual/provider/model/reason/latency/retries and privacy-safe identifiers.
- **Dependencies:** 027
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Every paid route has an auditable reason and margin state. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Every paid route has an auditable reason and margin state.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK029 — Fallback + No Double Charge

- **Objective:** Fallback + No Double Charge
- **Scope:** Bind one logical billing transaction to multiple bounded attempts; ensure failed attempts/late provider results cannot duplicate user charge or external side effects.
- **Dependencies:** 028
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Forced first-provider failure then second-provider success bills exactly once. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Forced first-provider failure then second-provider success bills exactly once.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK030 — Router Checkpoint C

- **Objective:** Router Checkpoint C
- **Scope:** Live E2E on at least two permitted text routes plus timeout/rate-limit/provider-down simulations; lock provider/router baseline.
- **Dependencies:** 020, 021, 022, 023, 024, 025, 026, 027, 028, 029
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Router live proof includes success, fallback, blocked unknown-cost and no-double-charge cases. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Router live proof includes success, fallback, blocked unknown-cost and no-double-charge cases.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK031 — Universal Request / Intent Schema

- **Objective:** Universal Request / Intent Schema
- **Scope:** Define one request envelope for all surfaces: goal, inputs, constraints, outputs, context refs, language, risk, budget and client state.
- **Dependencies:** 030
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Chat/Work/Create/Code can submit the same normalized request envelope. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Chat/Work/Create/Code can submit the same normalized request envelope.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK032 — Requirement Extraction

- **Objective:** Requirement Extraction
- **Scope:** Implement structured extraction of hard requirements, soft preferences, unknowns, output criteria and clarification threshold.
- **Dependencies:** 031
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Benchmarks show requested constraints are preserved across representative tasks. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Benchmarks show requested constraints are preserved across representative tasks.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK033 — Intent Lock

- **Objective:** Intent Lock
- **Scope:** Prevent planner/tools from inventing user requirements; only minimal technical assumptions allowed and recorded.
- **Dependencies:** 032
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Tests prove forbidden additions/changed constraints are rejected or surfaced. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Tests prove forbidden additions/changed constraints are rejected or surfaced.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK034 — Context Resolver

- **Objective:** Context Resolver
- **Scope:** Resolve conversation, project, files, assets, memory, connected sources and prior task outputs with ownership checks and context-budget policy.
- **Dependencies:** 033
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Same request can safely reuse authorized project context without re-upload. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Same request can safely reuse authorized project context without re-upload.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK035 — Capability Graph & Planner

- **Objective:** Capability Graph & Planner
- **Scope:** Map goals to capability graph, dependencies and candidate execution paths; one shared brain, not per-feature brains. ADD the canonical Code Studio chain `code.inspect → code.edit → code.validate → code.runtime.start/update → code.preview.verify`, with later shared handoffs to Images/Video/Audio/Research through existing capabilities rather than duplicate coding/media agents.
- **Dependencies:** 021, 022, 023, 031, 032, 033, 034
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Representative goals generate valid acyclic plans using registry capabilities; a Code request plans through the shared ZUVYR Brain and never creates a second coding agent. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Representative goals generate valid acyclic plans using registry capabilities; a Code request plans through the shared ZUVYR Brain and never creates a second coding agent.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK036 — Quote + Plan Version + Consent

- **Objective:** Quote + Plan Version + Consent
- **Scope:** Version execution plan, price estimate, duration/risk and approval. Any material plan/price change invalidates stale consent.
- **Dependencies:** 015, 016, 017, 031, 032, 033, 034, 035
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Approval is cryptographically/logically bound to exact plan version and quote. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Approval is cryptographically/logically bound to exact plan version and quote.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK037 — Durable Task Persistence & Queue Ownership

- **Objective:** Durable Task Persistence & Queue Ownership
- **Scope:** Persist task/step states, idempotency keys, worker lease/ownership, dependencies and checkpoints in DB/queue.
- **Dependencies:** 011, 013, 031, 035, 036
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Worker restart resumes persisted task rather than recreating it. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Worker restart resumes persisted task rather than recreating it.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK038 — Step Executor / Retry / Timeout / Resume

- **Objective:** Step Executor / Retry / Timeout / Resume
- **Scope:** Create capability executor dispatcher with bounded retries, provider-call timeout, lease renewal and safe resume.
- **Dependencies:** 023, 025, 029, 037
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Crash/restart and timeout tests show no duplicate side effect. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Crash/restart and timeout tests show no duplicate side effect.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK039 — Cancel / Compensation / Rollback

- **Objective:** Cancel / Compensation / Rollback
- **Scope:** Implement active cancellation, late-result handling, partial settlement, compensation hooks, checkpoint restore and undo receipts where possible.
- **Dependencies:** 012, 013, 037, 038
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Cancel during active provider call reaches stable financial/result state. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Cancel during active provider call reaches stable financial/result state.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK040 — Brain + Kernel Checkpoint D

- **Objective:** Brain + Kernel Checkpoint D
- **Scope:** Live two-capability task through Brain→quote→consent→reserve→durable execution→verify→settle→save, including forced restart.
- **Dependencies:** 020, 030, 031, 032, 033, 034, 035, 036, 037, 038, 039
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Cross-feature execution is no longer 503/fake; durable E2E proof exists. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Cross-feature execution is no longer 503/fake; durable E2E proof exists.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK041 — Universal Content Object

- **Objective:** Universal Content Object
- **Scope:** Create canonical content/artifact model for text/image/video/audio/document/code/3D/web/research with provenance, owner, project, source, metadata and versions.
- **Dependencies:** 040
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** All new outputs resolve to a canonical content ID. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** All new outputs resolve to a canonical content ID.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK042 — Asset Storage / Ownership / Lineage

- **Objective:** Asset Storage / Ownership / Lineage
- **Scope:** Unify signed upload/download, file limits, dedupe/hash, lineage, derived assets, retention and egress accounting.
- **Dependencies:** 011, 041
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Two-account tests prove isolation; derived asset points to source/version. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Two-account tests prove isolation; derived asset points to source/version.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK043 — Projects CRUD

- **Objective:** Projects CRUD
- **Scope:** Implement real create/read/update/archive project APIs and UX; link conversations, content, tasks, deployments and memory.
- **Dependencies:** 011, 041, 042
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Project survives logout/reload and shows only owner-authorized items. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Project survives logout/reload and shows only owner-authorized items.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK044 — Library

- **Objective:** Library
- **Scope:** Implement indexed global Library with search/filter/type/project/date/model/source, download/delete/restore semantics and Send-To entry points.
- **Dependencies:** 041, 042, 043
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Generated and uploaded assets are discoverable and reusable without re-upload. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Generated and uploaded assets are discoverable and reusable without re-upload.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK045 — Memory / Personal Intelligence

- **Objective:** Memory / Personal Intelligence
- **Scope:** Implement structured memory categories, retrieval, project/account scopes, Memory Updated UX, edit/undo/forget and separate training consent.
- **Dependencies:** 043, 044
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Remembered data can be reviewed/changed; training permission remains independent. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Remembered data can be reviewed/changed; training permission remains independent.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK046 — Knowledge / Context Graph

- **Objective:** Knowledge / Context Graph
- **Scope:** Link user↔projects↔decisions↔assets↔tasks↔deployments↔connections and expose safe graph retrieval to Brain/Manager.
- **Dependencies:** 034, 041, 042, 043, 044, 045
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Brain can answer relationship/context queries without scanning unrelated user data. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Brain can answer relationship/context queries without scanning unrelated user data.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK047 — Permission Center

- **Objective:** Permission Center
- **Scope:** Implement action classes, allow-once/scoped grants/revocation/expiry, resource scopes, consequence confirmations and audit events. ADD Code Studio scopes/policies for project read/write, dependency install, runtime execute, preview view/open, network egress and deploy; preview/runtime grants are owner/project/session scoped.
- **Dependencies:** 011, 036, 041, 042, 046
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** High-risk action cannot execute without correct current grant/approval; preview or runtime access cannot expose another user's project, internal admin APIs, host filesystem or ZUVYR/provider secrets. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** High-risk action cannot execute without correct current grant/approval; preview or runtime access cannot expose another user's project, internal admin APIs, host filesystem or ZUVYR/provider secrets.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK048 — Language Engine

- **Objective:** Language Engine
- **Scope:** Add language/script/locale detection, mixed-language handling, RTL/LTR, multilingual OCR/embeddings/routing and response-language preservation.
- **Dependencies:** 022, 034, 041, 047
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Arabic/Darija/French/English mixed flows pass UI and semantic regression tests. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Arabic/Darija/French/English mixed flows pass UI and semantic regression tests.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK049 — Universal Actions / Send-To / Undo

- **Objective:** Universal Actions / Send-To / Undo
- **Scope:** Implement context actions and cross-surface handoffs: Ask/Edit/Verify/Translate/Search/Save/Send-To plus version/undo/restore/compare where supported. ADD the Code-project handoff contract: shared Image/Video/Audio/Research outputs can be inserted as owned project assets/references with provenance and affected-file IDs; later Code runtime packs may invalidate/update Preview from the same handoff result.
- **Dependencies:** 041, 042, 043, 044, 045, 046, 047, 048
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Image→Video, Research→Doc, Asset→Code handoffs preserve IDs/provenance; Code-project asset insertion is versioned/undoable and never duplicates media/research systems inside Code Studio. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Image→Video, Research→Doc, Asset→Code handoffs preserve IDs/provenance; Code-project asset insertion is versioned/undoable and never duplicates media/research systems inside Code Studio.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK050 — Unified UX Shell / Work / Settings

- **Objective:** Unified UX Shell / Work / Settings
- **Scope:** Finish real Chat/Work/Projects/Library/Create navigation; persistent settings, notifications, analytics without prompt leakage, data export/delete workflows and responsive accessibility.
- **Dependencies:** 043, 044, 045, 047, 048, 049
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** All shared surfaces use real APIs, no production-looking placeholder state; checkpoint E passes. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** All shared surfaces use real APIs, no production-looking placeholder state; checkpoint E passes.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_VERIFIED

## PACK051 — Chat Core Normalization

- **Objective:** Chat Core Normalization
- **Scope:** Move text Chat off pilot-specific assumptions into Brain/Kernel/Router/ledger while preserving conversation history and metered success path.
- **Dependencies:** 020, 030, 040, 041, 042, 045, 047, 048, 050
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Standard Chat works for eligible accounts with route logs and exact settlement. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Standard Chat works for eligible accounts with route logs and exact settlement.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK052 — Attachments + Recent / Project / Library Picker

- **Objective:** Attachments + Recent / Project / Library Picker
- **Scope:** Unify upload and attachment IDs across Chat/Code/Work; add Recent/Project/Library selectors, progress, remove/retry and ownership validation.
- **Dependencies:** 042, 044, 047, 051
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Text+multiple files survive reload and reach chosen capability; historic attachment-ID mismatch is regression-tested. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Text+multiple files survive reload and reach chosen capability; historic attachment-ID mismatch is regression-tested.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK053 — Multimodal & Document Understanding

- **Objective:** Multimodal & Document Understanding
- **Scope:** Wire image/PDF/DOCX/audio/video analysis, OCR/extraction worker, language handling, size/page limits, failure states and processing cost.
- **Dependencies:** 023, 042, 048, 051, 052
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Live tests on Arabic/French/English docs and image/audio produce stored results without unsupported claims. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Live tests on Arabic/French/English docs and image/audio produce stored results without unsupported claims.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK054 — Sources / Citations

- **Objective:** Sources / Citations
- **Scope:** Persist normalized file/web/product/memory sources, render citations, verify URLs/ownership and retain them with conversation/project history.
- **Dependencies:** 041, 042, 051, 053
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Every research-backed answer can reopen its cited source record. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Every research-backed answer can reopen its cited source record.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK055 — Web Search + Direct URL Reader

- **Objective:** Web Search + Direct URL Reader
- **Scope:** Bind a verified search provider and safe URL reader with pricing, timeout, robots/auth boundaries, citations and cache policy.
- **Dependencies:** 020, 023, 026, 028, 029, 042, 047, 054
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Live search and direct-URL tasks return sourced results and settle exactly once. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Live search and direct-URL tasks return sourced results and settle exactly once.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M11
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK056 — Crawl + Deep Research

- **Objective:** Crawl + Deep Research
- **Scope:** Implement generated queries, bounded multi-round search, dedupe, progress, cancel, report composition, source diversity and checkpoint/resume.
- **Dependencies:** 037, 038, 039, 054, 055
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Deep research completes/cancels/restarts without duplicate search charges and yields sourced report. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Deep research completes/cancels/restarts without duplicate search charges and yields sourced report.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK057 — Shopping / Local / Connected Research

- **Objective:** Shopping / Local / Connected Research
- **Scope:** Implement current product/business comparison adapters, price/availability timestamps, ranking rationale and connected-source research with permissions.
- **Dependencies:** 047, 054, 055, 056
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Comparison clearly separates current evidence from stale/unknown data and stores sources. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Comparison clearly separates current evidence from stale/unknown data and stores sources.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK058 — Documents + Templates

- **Objective:** Documents + Templates
- **Scope:** Implement Create/Work document generation/edit/version/export for DOCX/PDF/TXT/MD, reusable templates and project/library storage.
- **Dependencies:** 041, 042, 043, 044, 047, 050, 051, 057
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Generated document opens correctly, round-trips, versions and exports from production. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Generated document opens correctly, round-trips, versions and exports from production.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK059 — Spreadsheets + Presentations

- **Objective:** Spreadsheets + Presentations
- **Scope:** Implement XLSX/CSV and PPTX generation/edit/export, formula/recalc safeguards, charts/slides/assets, validation and project/library storage.
- **Dependencies:** 041, 042, 043, 044, 047, 050, 051, 058
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Real XLSX/PPTX files open and contain expected formulas/assets/slides; no fake preview-only output. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Real XLSX/PPTX files open and contain expected formulas/assets/slides; no fake preview-only output.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK060 — Chat / Research / Work Checkpoint F

- **Objective:** Chat / Research / Work Checkpoint F
- **Scope:** Live task: research a topic → cited result → create document/spreadsheet/presentation → save project/library → reload/download, with unified billing.
- **Dependencies:** 020, 030, 040, 050, 051, 052, 053, 054, 055, 056, 057, 058, 059
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** All core knowledge/work surfaces pass E2E and failure/cancel tests. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** All core knowledge/work surfaces pass E2E and failure/cancel tests.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** HISTORICAL_RECEIPT_RECONCILIATION_REQUIRED

## PACK061 — Image Generate

- **Objective:** Image Generate
- **Scope:** Connect verified image model(s) through normalized adapter, reference cost, queue/job, reserve/settle/refund, storage/history and UI.
- **Dependencies:** 020, 023, 029, 037, 038, 039, 041, 042, 047, 049, 050, 060
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Text→image live result is downloadable, owned, metered and reproducible in history. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Text→image live result is downloadable, owned, metered and reproducible in history.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M12
- **Recorded status:** LOCKED_VERIFIED

## PACK062 — Image References / Consistency / Variations

Checkpoint: PHASE03_LOCAL_VERIFIED_PARTIAL; 10 local tests PASS. Reference executor, pricing/accounting integration and production proof remain open. Evidence: zuvyr-pack-evidence/pack-062/phase-03-20260917-runtime/receipt.json

- **Objective:** Image References / Consistency / Variations
- **Scope:** Pass ordered reference assets, supported options/seed/count, character/product consistency features where provider supports them; block ignored options.
- **Dependencies:** 042, 049, 061
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Reference and variation jobs prove requested inputs reached provider and costs match quantity. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Reference and variation jobs prove requested inputs reached provider and costs match quantity.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** LOCKED_ENGINEERING_VERIFIED — PAID_LIVE_E2E_DEFERRED

User-approved no-cost progression note: PACK062 paid provider inference remains deferred; this does not satisfy the canonical paid-live LOCKED_VERIFIED gate and must not be represented as such.

## PACK063 — Image Edit / Inpaint / Outpaint

- **Objective:** Image Edit / Inpaint / Outpaint
- **Scope:** Implement source+mask editing, erase/replace, expand/outpaint, version lineage and rollback.
- **Dependencies:** 042, 049, 061, 062
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Edited result preserves original and creates a traceable new version; mask validation passes. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Edited result preserves original and creates a traceable new version; mask validation passes.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** OPEN

## PACK064 — Image Utility Pipeline

- **Objective:** Image Utility Pipeline
- **Scope:** Implement background removal, upscale, relight, crop/resize/canvas/layers/text/batch where verified, with per-operation cost and artifact metadata.
- **Dependencies:** 042, 049, 061, 063
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Every exposed tool has a real executor; unsupported options stay hidden/blocked. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Every exposed tool has a real executor; unsupported options stay hidden/blocked.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK065 — Image Studio Checkpoint

- **Objective:** Image Studio Checkpoint
- **Scope:** Complete responsive Image Studio, actions/send-to/history/versions/export and provider-failure/refund tests.
- **Dependencies:** 061, 062, 063, 064
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** All advertised V1 image operations pass live proof or are explicitly removed from V1 UI. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** All advertised V1 image operations pass live proof or are explicitly removed from V1 UI.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK066 — Text-to-Video

- **Objective:** Text-to-Video
- **Scope:** Bind verified video provider(s), duration/resolution/aspect/FPS/audio option mapping, async progress, actual duration/cost settlement and storage.
- **Dependencies:** 020, 023, 029, 037, 038, 039, 041, 042, 047, 049, 050, 065
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Playable text→video matches supported settings and settles using actual billable units. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Playable text→video matches supported settings and settles using actual billable units.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M13
- **Recorded status:** PLANNED

## PACK067 — Image/Reference-to-Video

- **Objective:** Image/Reference-to-Video
- **Scope:** Implement source image, start/end frame and reference lineage with ownership and provider-specific capability guards.
- **Dependencies:** 042, 061, 066
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Image→video live result proves source/reference was actually consumed. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Image→video live result proves source/reference was actually consumed.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK068 — Video Edit / Extend / VFX

- **Objective:** Video Edit / Extend / VFX
- **Scope:** Implement verified edit/extend/object/background/relight/camera/motion/lip-sync operations via capability-specific adapters; hide unsupported controls.
- **Dependencies:** 042, 049, 066, 067
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Each exposed edit produces a new playable version with correct provenance and pricing. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Each exposed edit produces a new playable version with correct provenance and pricing.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK069 — Subtitles / Dubbing / Enhance / Export

- **Objective:** Subtitles / Dubbing / Enhance / Export
- **Scope:** Implement transcript timing, SRT/VTT, translation/dubbing handoff, upscale/enhance, MP4/WebM/MOV export, cancel/late result and download.
- **Dependencies:** 042, 049, 066, 068
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Exported video/subtitle files open; cancel/failure accounting is stable. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Exported video/subtitle files open; cancel/failure accounting is stable.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK070 — Media Checkpoint G

- **Objective:** Media Checkpoint G
- **Scope:** Live cross-feature Image→Video→subtitle/dub→Library/Project and failure/fallback tests; freeze media baseline.
- **Dependencies:** 061, 062, 063, 064, 065, 066, 067, 068, 069
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Image/video V1 advertised features have production E2E evidence and unified usage. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Image/video V1 advertised features have production E2E evidence and unified usage.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK071 — Speech-to-Text / Diarization / Cleanup

- **Objective:** Speech-to-Text / Diarization / Cleanup
- **Scope:** Bind verified STT/audio processing provider(s), upload/chunk/format/diarization/noise-cleanup, language detection, storage and minute-based costing.
- **Dependencies:** 020, 023, 029, 037, 038, 039, 041, 042, 047, 048, 050, 070
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Audio→text/segments live test passes with correct duration/cost and privacy controls. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Audio→text/segments live test passes with correct duration/cost and privacy controls.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M14
- **Recorded status:** PLANNED

## PACK072 — Text-to-Speech / Voice Design

- **Objective:** Text-to-Speech / Voice Design
- **Scope:** Bind verified TTS voices/languages, streaming/file output, voice design/cloning only with explicit rights/consent, character/time costing and export.
- **Dependencies:** 020, 023, 029, 037, 038, 039, 041, 042, 047, 048, 050, 071
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Text→audio is playable, metered and consent checks block unauthorized cloning. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Text→audio is playable, metered and consent checks block unauthorized cloning.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK073 — Realtime Voice

- **Objective:** Realtime Voice
- **Scope:** Implement low-latency session, interruption/barge-in, microphone permission indicator, STOP, transcript, usage aggregation and retention policy.
- **Dependencies:** 047, 071, 072
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Realtime session starts/stops cleanly and cannot leave microphone/provider stream running silently. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Realtime session starts/stops cleanly and cannot leave microphone/provider stream running silently.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK074 — Music / SFX / Remix / Stems / Dubbing

- **Objective:** Music / SFX / Remix / Stems / Dubbing
- **Scope:** Connect verified providers for music/SFX/remix/stems and multi-stage dubbing/audio-to-video; track rights metadata and aggregate multi-step cost.
- **Dependencies:** 042, 047, 049, 071, 072, 073
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Each exposed audio creation operation returns playable artifacts with rights/cost lineage; unavailable providers stay blocked. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Each exposed audio creation operation returns playable artifacts with rights/cost lineage; unavailable providers stay blocked.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK075 — Code Projects + Editor

- **Objective:** Code Projects + Editor
- **Scope:** Wire multi-file CRUD, editor state, versions/branches, asset references and AI coding through Brain/Router/ledger. ADD the real Code Studio workspace shell using the existing ZUVYR design system: file tree, open-file tabs, editor, AI interaction, logs/terminal area reserved for later runtime, and a responsive Code/Preview layout shell. Large screens support a persisted draggable divider and show/hide/expand/fullscreen-ready layout; small/mobile screens switch between Code and Preview. Before runtime exists the Preview state must truthfully be `Preview unavailable`—no fake iframe, screenshot or demo. AI edits inspect and change only necessary files and save versioned project state.
- **Dependencies:** 013, 015, 020, 030, 035, 040, 041, 042, 043, 044, 047, 049, 050, 051, 074
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Real project with many files saves, reloads, versions and receives metered AI edits; editor/tabs/layout state persists; responsive split/switch UX works; Preview remains unavailable until a real runtime is supplied by later packs. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Real project with many files saves, reloads, versions and receives metered AI edits; editor/tabs/layout state persists; responsive split/switch UX works; Preview remains unavailable until a real runtime is supplied by later packs.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK076 — Secure Code Sandbox

- **Objective:** Secure Code Sandbox
- **Scope:** Integrate isolated ephemeral sandbox provider/runtime, per-job filesystem, CPU/RAM/time/network limits, secret injection boundaries and cleanup. ADD Live Preview isolation requirements: each runtime/preview session is project/user scoped; preview ports can be exposed only through an authenticated, time-bounded preview transport; project code cannot reach ZUVYR backend/provider/Stripe/Supabase service-role secrets, host filesystem, admin APIs or other users. Define idle shutdown/resource cleanup and safe network-egress policy.
- **Dependencies:** 047, 075
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Untrusted code cannot access ZUVYR host or unrelated secrets; sandbox teardown is verified; an attempted cross-project/secret/host access from preview runtime is denied; raw sandbox ports are not publicly exposed. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Untrusted code cannot access ZUVYR host or unrelated secrets; sandbox teardown is verified; an attempted cross-project/secret/host access from preview runtime is denied; raw sandbox ports are not publicly exposed.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M15
- **Recorded status:** PLANNED

## PACK077 — Terminal / Dependencies / Run

- **Objective:** Terminal / Dependencies / Run
- **Scope:** Implement terminal, package install allow/policy, dependency cache, stdout/stderr, cancellation, runtime metering and resource limits. ADD the real project runtime/process manager used by Live Preview: infer/use an approved dev/run command, start/stop/restart it inside the sandbox, detect the preview port, issue owner/session-bound preview URL/token through the secure transport from Pack 076, persist runtime state, enforce idle timeout/cleanup and meter runtime compute. Preserve framework-native HMR when available; otherwise support bounded incremental/rebuild hooks without rebuilding on every keystroke.
- **Dependencies:** 013, 014, 015, 037, 038, 039, 047, 076
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** User code runs in sandbox, dependencies install safely and stopped jobs settle correctly; a test app starts a real runtime, an authorized preview URL/token resolves while unauthorized access fails, stop/idle cleanup terminates compute, and runtime usage is recorded exactly once. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** User code runs in sandbox, dependencies install safely and stopped jobs settle correctly; a test app starts a real runtime, an authorized preview URL/token resolves while unauthorized access fails, stop/idle cleanup terminates compute, and runtime usage is recorded exactly once.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK078 — Build / Test / Browser Preview / Repair

- **Objective:** Build / Test / Browser Preview / Repair
- **Scope:** Implement build/test commands, preview server, isolated browser visual test, error capture and bounded critic→repair→retest loop. ADD the real Code Studio Live Preview product layer: consume the sandbox runtime/preview transport from Packs 076–077; states `Preview unavailable / Starting / Building / Ready / Updating / Build failed / Runtime error`; Code↔Preview split UI with draggable divider, responsive Code/Preview switch on small screens, show/hide/expand/fullscreen, and a real toolbar for Refresh/Desktop/Tablet/Mobile/Fit/Open Preview/Fullscreen enabled only when supported. SAVE triggers debounced validation and HMR/incremental update where supported—never a fake iframe or full rebuild on every keystroke. Structured build/runtime errors return affected file/stack context to the shared Brain/Kernel for a bounded, costed, permission-aware AI repair loop.
- **Dependencies:** 013, 014, 015, 035, 038, 039, 047, 049, 075, 076, 077
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** A generated app builds and a real sandbox-backed Preview reaches READY; changing a specific UI property through ZUVYR AI edits only required files and updates Preview via HMR/incremental rebuild where supported; viewport controls change the actual preview viewport; deliberate build/runtime failure produces structured error state; bounded authorized AI repair can rebuild to READY; no infinite loop, fake readiness or disconnected preview. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** A generated app builds and a real sandbox-backed Preview reaches READY; changing a specific UI property through ZUVYR AI edits only required files and updates Preview via HMR/incremental rebuild where supported; viewport controls change the actual preview viewport; deliberate build/runtime failure produces structured error state; bounded authorized AI repair can rebuild to READY; no infinite loop, fake readiness or disconnected preview.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK079 — Real ZIP + Deploy + Rollback

- **Objective:** Real ZIP + Deploy + Rollback
- **Scope:** Generate actual ZIP bytes including referenced assets, hash/validate/unpack test, deployment connector with explicit target approval, deployment receipt and rollback. ADD Preview/release consistency: ZIP/deploy must be generated from an explicit saved project version that was validated by Code Studio; preview tokens, sandbox caches, transient runtime state and secrets are never included in artifacts. `Open Preview` remains distinct from production deployment.
- **Dependencies:** 042, 043, 044, 047, 075, 076, 077, 078
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** ZIP opens with correct project; approved deployment produces URL and rollback proof; the released project version hash matches the intended saved/preview-validated version and contains no preview-session secrets/tokens. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** ZIP opens with correct project; approved deployment produces URL and rollback proof; the released project version hash matches the intended saved/preview-validated version and contains no preview-session secrets/tokens.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M16
- **Recorded status:** PLANNED

## PACK080 — Code + Voice Checkpoint H

- **Objective:** Code + Voice Checkpoint H
- **Scope:** Live multi-capability task using speech/text to create/edit/run/test/build/export a project with exact unified billing. ADD the first full Code Studio cross-feature checkpoint: prompt→Brain/Planner→project files→AI edit→sandbox runtime→real Live Preview; second prompt changes a targeted UI element and Preview updates; invoke the existing Images capability through Universal Send-To, store the generated asset in Project/Library, insert its reference into code and update Preview; surface a build/runtime error and exercise the bounded repair path; close/reopen and restore project/editor/preview-capable state. Preserve all existing Voice checkpoint requirements.
- **Dependencies:** 013, 015, 035, 047, 049, 061, 062, 063, 064, 065, 071, 072, 073, 074, 075, 076, 077, 078, 079
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Code Studio and Voice advertised V1 functions pass E2E, not only assistant text generation. Specifically, AI→Code→real Live Preview, targeted edit→Preview update, Image→Code asset handoff, error→bounded repair, unified usage accounting and project reopen persistence all have dated production evidence. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Code Studio and Voice advertised V1 functions pass E2E, not only assistant text generation. Specifically, AI→Code→real Live Preview, targeted edit→Preview update, Image→Code asset handoff, error→bounded repair, unified usage accounting and project reopen persistence all have dated production evidence.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK081 — Cloud Browser Runtime

- **Objective:** Cloud Browser Runtime
- **Scope:** Integrate verified browser infrastructure/session lifecycle, screenshots/DOM, download/upload handling, network/secret isolation and metering.
- **Dependencies:** 020, 030, 037, 038, 039, 047, 050, 080
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Managed browser session can be created, resumed/closed and leaves no credentials in logs. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Managed browser session can be created, resumed/closed and leaves no credentials in logs.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M17
- **Recorded status:** PLANNED

## PACK082 — Browser Agent

- **Objective:** Browser Agent
- **Scope:** Brain→browser plan/observe/act/verify loop with scoped site permissions, auth/CAPTCHA/robots boundaries, stop/cancel and evidence capture.
- **Dependencies:** 031, 032, 033, 034, 035, 037, 038, 039, 047, 081
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** A permitted multi-step web task completes with visible evidence; forbidden/ambiguous actions stop for approval. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** A permitted multi-step web task completes with visible evidence; forbidden/ambiguous actions stop for approval.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK083 — 3D Generation

- **Objective:** 3D Generation
- **Scope:** Bind verified 3D provider for text/image/multiview→3D, async jobs, preview asset, pricing, storage and provenance.
- **Dependencies:** 020, 023, 029, 037, 038, 039, 041, 042, 047, 049, 050, 082
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Generated 3D asset loads in viewer and exports a supported format with correct cost. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Generated 3D asset loads in viewer and exports a supported format with correct cost.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M18
- **Recorded status:** PLANNED

## PACK084 — 3D Studio

- **Objective:** 3D Studio
- **Scope:** Add mesh/polycount/remesh/retopo, texture/PBR, rig/animation/retarget when provider supports, lighting/camera/viewer and GLB/GLTF/FBX/OBJ/STL/3MF export policy.
- **Dependencies:** 042, 049, 083
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Every exposed 3D operation either has live executor proof or is hidden/blocked; exported asset validates. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Every exposed 3D operation either has live executor proof or is hidden/blocked; exported asset validates.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK085 — ZUVYR Device Agent Build

- **Objective:** ZUVYR Device Agent Build
- **Scope:** Create signed/updatable device-agent architecture with least privilege, secure local service, device identity, installer/uninstaller, no raw IP trust.
- **Dependencies:** 031, 033, 037, 038, 039, 047, 050, 084
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Agent installs/uninstalls on test device and starts without admin/root unless specifically required. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Agent installs/uninstalls on test device and starts without admin/root unless specifically required.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M19
- **Recorded status:** PLANNED

## PACK086 — Device Pairing & Secure Session

- **Objective:** Device Pairing & Secure Session
- **Scope:** Implement login pairing, mutual authentication, revocation, session encryption, heartbeat and scoped permission token exchange.
- **Dependencies:** 047, 085
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Revoked device/token cannot reconnect; wrong device/session is rejected. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Revoked device/token cannot reconnect; wrong device/session is rejected.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK087 — IP Actions / STOP / Undo

- **Objective:** IP Actions / STOP / Undo
- **Scope:** Implement screen observe, mouse/keyboard, app open, clipboard, scoped files and carefully gated shell actions; independent STOP channel, backups/undo and audit log.
- **Dependencies:** 037, 038, 039, 047, 086
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Real test device executes authorized action; STOP halts; a reversible file change is undone; secrets are redacted. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Real test device executes authorized action; STOP halts; a reversible file change is undone; secrets are redacted.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK088 — Automations & Durable Workflows

- **Objective:** Automations & Durable Workflows
- **Scope:** Implement once/recurring schedules, timezone, durable workflow execution, retries, pause/cancel, funding at run time, notification and exactly-once/idempotent semantics.
- **Dependencies:** 013, 017, 037, 038, 039, 047, 050, 087
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Scheduled task runs once at intended time, charges once, persists result and resumes after worker restart. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Scheduled task runs once at intended time, charges once, persists result and resumes after worker restart.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK089 — Skills / Plugins / MCP / Connections

- **Objective:** Skills / Plugins / MCP / Connections
- **Scope:** Create reusable Skills and unified tool registry; secure plugin/MCP lifecycle, scoped secrets/tokens, OAuth connection model, Google Drive first, revocation and audit.
- **Dependencies:** 037, 038, 039, 041, 042, 047, 050, 088
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Connected tool executes only granted scope; token revoke immediately blocks future action. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Connected tool executes only granted scope; token revoke immediately blocks future action.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M20
- **Recorded status:** PLANNED

## PACK090 — Agent Checkpoint I

- **Objective:** Agent Checkpoint I
- **Scope:** Live Browser + Automation + Connection + 3D + paired-device scenarios, cross-feature handoffs and exact billing; lock action-system baseline.
- **Dependencies:** 081, 082, 083, 084, 085, 086, 087, 088, 089
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** All V1 action capabilities have live proof on authorized resources with STOP/cancel/revoke paths. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** All V1 action capabilities have live proof on authorized resources with STOP/cancel/revoke paths.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK091 — ZUVYR Manager Observability

- **Objective:** ZUVYR Manager Observability
- **Scope:** Build owner/admin Manager Studio: health, incidents, providers, models, DB, deployments, errors, traffic, cost/margin, stuck jobs and user-impact summaries. ADD Code Studio runtime observability: active/idle preview sessions, sandbox resource use, startup/build/HMR failures, preview-proxy errors, cleanup leaks and stuck runtimes—without storing source code/prompts unnecessarily.
- **Dependencies:** 010, 020, 030, 040, 050, 060, 070, 080, 090
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Manager reads live systems without exposing secrets/customer content unnecessarily; it can detect an unhealthy/stuck Code preview runtime and show its technical/cost impact without leaking project secrets. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Manager reads live systems without exposing secrets/customer content unnecessarily; it can detect an unhealthy/stuck Code preview runtime and show its technical/cost impact without leaking project secrets.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK092 — Manager Diagnose / Propose / Safe Action

- **Objective:** Manager Diagnose / Propose / Safe Action
- **Scope:** Implement detect→diagnose→propose→sandbox/test→approval policy→canary→monitor→rollback; action classes prevent unrestricted production mutation.
- **Dependencies:** 039, 047, 091
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Manager can safely propose and execute one scoped low-risk action under policy, with rollback and audit receipt. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Manager can safely propose and execute one scoped low-risk action under policy, with rollback and audit receipt.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK093 — Profit Intelligence + Competitive Monitor

- **Objective:** Profit Intelligence + Competitive Monitor
- **Scope:** Add full-technical-cost reconciliation, profit dashboard, bounded optimization recommendations and public competitor/provider capability/pricing watch feeding proposals—not automatic copying.
- **Dependencies:** 015, 028, 091, 092
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Daily/periodic report reconciles usage/cost/revenue and produces evidence-backed recommendations without autonomous price/customer-credit changes. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Daily/periodic report reconciles usage/cost/revenue and produces evidence-backed recommendations without autonomous price/customer-credit changes.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK094 — Learning Pipeline + V1 User Learning Flywheel + Data Rights + Failure Bank

- **Objective:** Learning Pipeline + V1 User Learning Flywheel + Data Rights + Failure Bank
- **Scope:** Capture execution outcomes/verified failures/tool traces, explicit training-rights/consent, redaction/PII, dedupe, quality/difficulty/domain and Learning Value Score. Make every V1 user session valuable beyond revenue through privacy-safe aggregate product telemetry, task-success/failure metrics and model/provider performance signals; only opt-in, rights-approved content/traces may enter global model training. Global training opt-in default OFF and Memory permission remains separate.
- **Dependencies:** 045, 047, 091, 092, 093
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Every V1 session can improve product/routing/evals through non-content aggregate signals, while only rights-approved, privacy-processed, explicitly eligible records can enter training candidates; the contribution path, consent state and revocation/exclusion behavior are testable. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Every V1 session can improve product/routing/evals through non-content aggregate signals, while only rights-approved, privacy-processed, explicitly eligible records can enter training candidates; the contribution path, consent state and revocation/exclusion behavior are testable.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK095 — ZUVYR Model Lab

- **Objective:** ZUVYR Model Lab
- **Scope:** Owner/admin UI + backend for datasets, licenses, skills, curricula, synthetic data, training runs, evals, benchmarks, failure bank, checkpoints, lineage and deployment stages LAB→EVAL→SHADOW→CANARY→SECONDARY→PRIMARY.
- **Dependencies:** 022, 041, 042, 045, 047, 094
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Every checkpoint traces to exact dataset/version/license/eval and can be rolled back. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Every checkpoint traces to exact dataset/version/license/eval and can be rolled back.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** —
- **Recorded status:** PLANNED

## PACK096 — ZUVYR 7 Manager / Operator — V1 Production Model + V2 Bridge

- **Objective:** ZUVYR 7 Manager / Operator — V1 Production Model + V2 Bridge
- **Scope:** Using a commercially permitted open-weight base, train/evaluate the first ZUVYR-owned Manager/Operator checkpoint inside V1; require independent B>A eval, no unacceptable regression, measured serving cost and Router integration through LAB→EVAL→SHADOW→CANARY. After passing the gates, allow a bounded set of low-risk eligible V1 workloads to route to the ZUVYR-owned model with automatic external-model fallback and rollback. Prove the controlled Teacher Gateway can collect only contract/license-permitted teacher outputs and ZUVYR execution traces; attach rights metadata, provenance, consent state, cost, latency, tool-success and outcome labels; prohibit unrestricted scraping/copying of provider system prompts, weights or customer-private content.
- **Dependencies:** 021, 022, 023, 026, 027, 028, 029, 030, 094, 095
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** V1 ships with at least one real ZUVYR-owned model serving a bounded production workload, not merely a future lab prototype. One complete rights-approved learning loop is proven from eligible V1 evidence → dataset → train → independent eval → registry → shadow/canary → bounded production routing → rollback/fallback, with exact lineage and no claim of frontier superiority required. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** V1 ships with at least one real ZUVYR-owned model serving a bounded production workload, not merely a future lab prototype. One complete rights-approved learning loop is proven from eligible V1 evidence → dataset → train → independent eval → registry → shadow/canary → bounded production routing → rollback/fallback, with exact lineage and no claim of frontier superiority required.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M21
- **Recorded status:** PLANNED

## PACK097 — Cross-Platform Core + Windows App

- **Objective:** Cross-Platform Core + Windows App
- **Scope:** Create shared client/API/session/project/memory layer and production Windows app shell, secure updater, file/open-with/device integration as appropriate, signing pipeline and E2E against production APIs. ADD Code Studio client parity using the same backend/sandbox preview transport: desktop file tree/editor/AI plus resizable split Live Preview and fullscreen/open-preview behavior. Do not create a Windows-specific preview engine.
- **Dependencies:** 040, 050, 060, 070, 080, 090, 091, 096
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Signed Windows release candidate installs/updates/uninstalls and matches web account state; the same Code project opens with real Live Preview and shared project/runtime state on Windows. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Signed Windows release candidate installs/updates/uninstalls and matches web account state; the same Code project opens with real Live Preview and shared project/runtime state on Windows.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M22
- **Recorded status:** PLANNED

## PACK098 — Android App

- **Objective:** Android App
- **Scope:** Build Android client using shared contracts, secure auth/token storage, uploads/camera/mic permissions, background limitations, push notifications and production E2E; create store-ready signed artifact. ADD mobile Code Studio presentation using the same backend preview session: switch/tabs between Code and Preview instead of unusable side-by-side panes, with supported preview refresh/device/open/fullscreen actions adapted to mobile.
- **Dependencies:** 080, 097
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Signed Android release candidate passes device tests and store prechecks; a Code project can switch between editor and the real shared Preview without leaking tokens or duplicating runtime. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Signed Android release candidate passes device tests and store prechecks; a Code project can switch between editor and the real shared Preview without leaking tokens or duplicating runtime.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M23
- **Recorded status:** PLANNED

## PACK099 — iOS App

- **Objective:** iOS App
- **Scope:** Build iOS client with secure auth/keychain, Files/Photos/camera/mic permissions, background constraints, push, deep links and production E2E; create store-ready signed artifact. ADD mobile Code Studio presentation using the same backend preview session: Code/Preview switching, safe external/open preview handling and platform-appropriate fullscreen without a second preview engine.
- **Dependencies:** 080, 097, 098
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Signed iOS release candidate passes real-device/TestFlight-style checks and store prechecks; a Code project can reopen and display the real shared Preview through the same authorized runtime transport. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Signed iOS release candidate passes real-device/TestFlight-style checks and store prechecks; a Code project can reopen and display the real shared Preview through the same authorized runtime transport.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** M24
- **Recorded status:** PLANNED

## PACK100 — Integrated baseline hardening checkpoint

- **Objective:** Integrated baseline hardening checkpoint
- **Scope:** Run full regression/security/load/failure/provider-outage/Redis/DB/restart/billing/permissions/backup-restore/DR/mobile/web accessibility and cross-feature E2E. Reconcile every Master Matrix item. No new feature work. ADD mandatory Code Studio Live Preview launch scenario: create responsive SaaS project → real Preview → AI targeted edit (hero button green) → HMR/incremental update → shared Images handoff creates hero asset and inserts it → Preview updates → deliberate build/runtime error is surfaced → bounded authorized AI repair → usage/credits reconcile → close/reopen preserves project/version/state; verify desktop split, mobile Code/Preview switch, project/user isolation, preview-token security, runtime cleanup and failure recovery. ADD mandatory V1 learning/model launch scenario: exercise eligible real tasks through the governed Learning Pipeline; prove consent/rights separation, aggregate outcome telemetry, Failure Bank/eval creation, dataset/checkpoint lineage, learning KPIs, one ZUVYR-owned model in bounded production, external fallback, shadow/canary promotion evidence, rollback, and cost-per-success/quality comparison without duplicate billing or privacy leakage. Revision 150: retain every original hardening scenario here as an intermediate checkpoint; final public release moves to PACK150.
- **Dependencies:** 001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011, 012, 013, 014, 015, 016, 017, 018, 019, 020, 021, 022, 023, 024, 025, 026, 027, 028, 029, 030, 031, 032, 033, 034, 035, 036, 037, 038, 039, 040, 041, 042, 043, 044, 045, 046, 047, 048, 049, 050, 051, 052, 053, 054, 055, 056, 057, 058, 059, 060, 061, 062, 063, 064, 065, 066, 067, 068, 069, 070, 071, 072, 073, 074, 075, 076, 077, 078, 079, 080, 081, 082, 083, 084, 085, 086, 087, 088, 089, 090, 091, 092, 093, 094, 095, 096, 097, 098, 099
- **Files/systems affected:** Existing systems described in scope; exact paths must be grounded from the execution baseline
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Preserve historical implementation and receipt identity.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Original hardening scenarios pass for Packs001–099. This is not V1_READY or public launch; PACK150 owns final release. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Original hardening scenarios pass for Packs001–099. This is not V1_READY or public launch; PACK150 owns final release.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** External launch approvals consolidated at PACK149–150; earlier operational gates retain their deadlines.
- **Recorded status:** PLANNED

## PACK101 — Cross-surface resumable tasks

- **Objective:** Cross-surface resumable tasks
- **Scope:** Persist a single task cursor across Chat, Research, Code and media; resume after login or client disconnect without reconstructing context.
- **Dependencies:** 040, 049, 090
- **Files/systems affected:** Shared task APIs and all clients
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Interrupt a multi-surface task and resume the same task ID with one settlement. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Interrupt a multi-surface task and resume the same task ID with one settlement.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK102 — Context budget and provenance

- **Objective:** Context budget and provenance
- **Scope:** Apply token budgets, source priority and provenance to cross-surface continuation; show excluded or stale context.
- **Dependencies:** 034, 046, 101
- **Files/systems affected:** Context resolver and source drawer
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Oversized mixed-source context retains hard requirements and excludes unauthorized resources. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Oversized mixed-source context retains hard requirements and excludes unauthorized resources.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK103 — Asset handoff consistency

- **Objective:** Asset handoff consistency
- **Scope:** Reconcile interrupted Send-To operations using canonical asset/version references and repair receipts.
- **Dependencies:** 042, 049, 101
- **Files/systems affected:** Content repository and handoff worker
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Crash between asset reference and destination save; recover without duplicate asset or charge. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Crash between asset reference and destination save; recover without duplicate asset or charge.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK104 — Project portability

- **Objective:** Project portability
- **Scope:** Export/import versioned project manifests with authorized assets and explicit missing connector references.
- **Dependencies:** 043, 044, 103
- **Files/systems affected:** Project APIs and Library
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Round-trip a mixed-media project while excluding credentials and foreign-owner content. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Round-trip a mixed-media project while excluding credentials and foreign-owner content.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK105 — History search at scale

- **Objective:** History search at scale
- **Scope:** Cursor pagination, filtering and indexed search across large histories; preserve stable deep links.
- **Dependencies:** 044, 050, 101
- **Files/systems affected:** History API and frontend
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Concurrent insertions do not skip or duplicate items; reopened results preserve canonical identity. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Concurrent insertions do not skip or duplicate items; reopened results preserve canonical identity.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK106 — Conversation branch reconciliation

- **Objective:** Conversation branch reconciliation
- **Scope:** Persist edit/regenerate branches and source lineage through tool and media outputs.
- **Dependencies:** 051, 105
- **Files/systems affected:** Conversation repository and Chat
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Branch an existing task without mutating earlier results or charging a prior request again. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Branch an existing task without mutating earlier results or charging a prior request again.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK107 — Accessible platform navigation

- **Objective:** Accessible platform navigation
- **Scope:** Keyboard and screen-reader audit of existing controls, focus recovery and announcements across studios.
- **Dependencies:** 050, 100
- **Files/systems affected:** Frontend navigation and studio controls
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Complete representative workflows by keyboard; no focus trap or unlabeled required action. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Complete representative workflows by keyboard; no focus trap or unlabeled required action.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK108 — RTL and mixed-language round trips

- **Objective:** RTL and mixed-language round trips
- **Scope:** Fix bidi layout and serialization across exports, filenames, citations and studio handoffs.
- **Dependencies:** 048, 058, 059, 107
- **Files/systems affected:** Clients and artifact exporters
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Darija/Arabic/French/English examples retain text, order and usable controls after reopen/export. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Darija/Arabic/French/English examples retain text, order and usable controls after reopen/export.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK109 — Mobile interruption recovery

- **Objective:** Mobile interruption recovery
- **Scope:** Recover uploads and task progress after backgrounding, reconnect and orientation changes.
- **Dependencies:** 097, 098, 099, 101
- **Files/systems affected:** Shared clients and task transport
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Resume without duplicate upload, lost draft or extra reservation on tested real devices. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Resume without duplicate upload, lost draft or extra reservation on tested real devices.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK110 — Unified platform checkpoint

- **Objective:** Unified platform checkpoint
- **Scope:** Verify integrated context, assets, branches, accessibility and mobile recovery from Packs101–109.
- **Dependencies:** 101, 102, 103, 104, 105, 106, 107, 108, 109
- **Files/systems affected:** All client surfaces
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** One recorded end-to-end task traverses three studios and survives interruption. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** One recorded end-to-end task traverses three studios and survives interruption.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK111 — Media queue fairness

- **Objective:** Media queue fairness
- **Scope:** Fair scheduling and starvation limits for already-supported media jobs across tenants and plans.
- **Dependencies:** 065, 070, 074, 110
- **Files/systems affected:** Media workers and queue policy
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Busy tenant cannot starve another; retries remain bounded and billed once. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Busy tenant cannot starve another; retries remain bounded and billed once.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK112 — Media cancellation races

- **Objective:** Media cancellation races
- **Scope:** Reconcile late provider results after cancel, timeout and restart using existing compensation contracts.
- **Dependencies:** 039, 111
- **Files/systems affected:** Media workers and ledger
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Controlled late-result fixtures preserve stable result ownership and settlement. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Controlled late-result fixtures preserve stable result ownership and settlement.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK113 — Media storage lifecycle

- **Objective:** Media storage lifecycle
- **Scope:** Retention, orphan reconciliation and signed-link expiry renewal for generated media.
- **Dependencies:** 042, 103, 112
- **Files/systems affected:** Storage lifecycle and Library
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Expired links renew only for owners; retained assets remain reachable; deletion is recoverable. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Expired links renew only for owners; retained assets remain reachable; deletion is recoverable.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK114 — Media version comparison

- **Objective:** Media version comparison
- **Scope:** Compare source/derived versions with accurate operation metadata and supported export formats.
- **Dependencies:** 063, 064, 068, 069, 113
- **Files/systems affected:** Media studio actions
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Compare and reopen versions without modifying source or inventing unsupported options. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Compare and reopen versions without modifying source or inventing unsupported options.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK115 — Media production scale checkpoint

- **Objective:** Media production scale checkpoint
- **Scope:** Load and recovery proof for existing image/video/audio paths and their economic limits.
- **Dependencies:** 111, 112, 113, 114
- **Files/systems affected:** Media stack
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Queue, cancellation, latency and storage targets pass under declared bounded load. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Queue, cancellation, latency and storage targets pass under declared bounded load.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK116 — Code workspace conflict recovery

- **Objective:** Code workspace conflict recovery
- **Scope:** Optimistic concurrency for simultaneous AI/user edits and saved preview versions.
- **Dependencies:** 075, 078, 079, 110
- **Files/systems affected:** Code files, versions and editor
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Concurrent edits produce a reviewable conflict; no silent overwrite. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Concurrent edits produce a reviewable conflict; no silent overwrite.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK117 — Code dependency supply chain

- **Objective:** Code dependency supply chain
- **Scope:** Lockfile integrity, install policy and dependency provenance inside existing sandbox execution.
- **Dependencies:** 076, 077, 116
- **Files/systems affected:** Code sandbox and dependency resolver
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Unapproved install is blocked; accepted lockfile is reproduced without host secret exposure. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Unapproved install is blocked; accepted lockfile is reproduced without host secret exposure.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK118 — Preview isolation adversarial proof

- **Objective:** Preview isolation adversarial proof
- **Scope:** Verify session expiry, origin isolation, proxy authorization and SSRF defenses.
- **Dependencies:** 076, 077, 078, 117
- **Files/systems affected:** Preview transport
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Cross-tenant, internal-network and expired-token probes fail while owner preview works. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Cross-tenant, internal-network and expired-token probes fail while owner preview works.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK119 — Bounded code repair economics

- **Objective:** Bounded code repair economics
- **Scope:** Measure repair attempt budgets and early termination against existing build/test errors.
- **Dependencies:** 078, 093, 118
- **Files/systems affected:** Code repair and cost ledger
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Repeated failure stops at budget with accurate partial settlement and preserved edits. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Repeated failure stops at budget with accurate partial settlement and preserved edits.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK120 — Code operational checkpoint

- **Objective:** Code operational checkpoint
- **Scope:** Verify runtime cleanup, export identity, conflict handling and preview isolation at scale.
- **Dependencies:** 116, 117, 118, 119
- **Files/systems affected:** Code Studio stack
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Create/edit/preview/repair/export/reopen flow passes with no orphan runtime. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Create/edit/preview/repair/export/reopen flow passes with no orphan runtime.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK121 — Browser session recovery

- **Objective:** Browser session recovery
- **Scope:** Restore permitted browser tasks after worker loss while expiring sensitive sessions safely.
- **Dependencies:** 081, 082, 110
- **Files/systems affected:** Browser runtime and task checkpoints
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Interrupted task resumes only within original scope and never repeats a submitted action blindly. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Interrupted task resumes only within original scope and never repeats a submitted action blindly.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK122 — Agent consequence reconciliation

- **Objective:** Agent consequence reconciliation
- **Scope:** Record external action receipts and reconcile uncertain outcomes before retries.
- **Dependencies:** 038, 047, 082, 087, 121
- **Files/systems affected:** Browser/IP action dispatcher
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Simulated uncertain submission pauses or reconciles; duplicate external action is prevented. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Simulated uncertain submission pauses or reconciles; duplicate external action is prevented.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK123 — Device revocation propagation

- **Objective:** Device revocation propagation
- **Scope:** Promptly invalidate paired-device grants and stop active scoped tasks after revoke.
- **Dependencies:** 086, 087, 122
- **Files/systems affected:** Device agent and permission service
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Revoking a device terminates subsequent actions and produces an audit receipt. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Revoking a device terminates subsequent actions and produces an audit receipt.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK124 — Automation schedule semantics

- **Objective:** Automation schedule semantics
- **Scope:** Timezone, DST, missed-run and duplicate-trigger handling in existing durable scheduler.
- **Dependencies:** 088, 122
- **Files/systems affected:** Scheduler and execution ledger
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Clock-transition fixtures and replay produce exactly one eligible logical run. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Clock-transition fixtures and replay produce exactly one eligible logical run.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK125 — Connector token lifecycle

- **Objective:** Connector token lifecycle
- **Scope:** Refresh, revoke and reconnect existing connectors without orphaned tasks or token logs.
- **Dependencies:** 089, 124
- **Files/systems affected:** Connector registry and scheduler
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Expired connection shows actionable state; reconnect resumes only authorized scope. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Expired connection shows actionable state; reconnect resumes only authorized scope.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK126 — Skill and plugin version governance

- **Objective:** Skill and plugin version governance
- **Scope:** Pin manifests and permissions to task versions; reject changed scope on resume.
- **Dependencies:** 089, 125
- **Files/systems affected:** Plugin registry and execution policy
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Updated plugin cannot inherit approval for newly requested permissions. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Updated plugin cannot inherit approval for newly requested permissions.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK127 — Agent platform checkpoint

- **Objective:** Agent platform checkpoint
- **Scope:** End-to-end browser/device/automation/connector recovery with consequence receipts.
- **Dependencies:** 121, 122, 123, 124, 125, 126
- **Files/systems affected:** Agent and automation stack
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Allowed workflow survives failure while denied action remains blocked. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Allowed workflow survives failure while denied action remains blocked.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK128 — Operating cost attribution

- **Objective:** Operating cost attribution
- **Scope:** Reconcile provider, compute, storage, payment, support, refunds and abuse costs against revenue.
- **Dependencies:** 015, 093, 115, 120, 127
- **Files/systems affected:** Profit Intelligence and accounting exports
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Gross, contribution and net operating margins are separately reproducible; unknown costs stay unknown. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Gross, contribution and net operating margins are separately reproducible; unknown costs stay unknown.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK129 — Cost optimization experiments

- **Objective:** Cost optimization experiments
- **Scope:** Evaluate caching, batching and model tiers using quality-preserving measured experiments.
- **Dependencies:** 028, 093, 128
- **Files/systems affected:** Router and experiment ledger
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Cost per successful task improves or experiment rolls back; no unsupported 50% margin claim. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Cost per successful task improves or experiment rolls back; no unsupported 50% margin claim.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK130 — Unit economics checkpoint

- **Objective:** Unit economics checkpoint
- **Scope:** Document mature-scale >=50% net operating margin target, actual observed margin and quantified gap.
- **Dependencies:** 128, 129
- **Files/systems affected:** Profit Intelligence
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Revenue and all attributable costs reconcile; scenario assumptions are separate from realized results. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Revenue and all attributable costs reconcile; scenario assumptions are separate from realized results.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK131 — Training consent revocation audit

- **Objective:** Training consent revocation audit
- **Scope:** Propagate consent changes through future dataset builds and exclusions without conflating memory.
- **Dependencies:** 045, 047, 094, 096
- **Files/systems affected:** Learning rights engine
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Revoked examples are excluded from subsequent builds; existing checkpoint limits are explicitly recorded. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Revoked examples are excluded from subsequent builds; existing checkpoint limits are explicitly recorded.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK132 — Dataset contamination audit

- **Objective:** Dataset contamination audit
- **Scope:** Holdout isolation, semantic/exact dedupe and source lineage validation for production candidates.
- **Dependencies:** 095, 131
- **Files/systems affected:** Dataset builder and independent eval vault
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Injected holdout contamination is detected and training admission fails closed. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Injected holdout contamination is detected and training admission fails closed.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK133 — Teacher rights and disagreement audit

- **Objective:** Teacher rights and disagreement audit
- **Scope:** Enforce recorded allowed uses by teacher/model version and prioritize independently verified disagreements.
- **Dependencies:** 095, 132
- **Files/systems affected:** Teacher Council
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Unknown or prohibited training use is denied; disagreement never becomes automatic truth. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Unknown or prohibited training use is denied; disagreement never becomes automatic truth.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK134 — Learning KPI integrity

- **Objective:** Learning KPI integrity
- **Scope:** Reconcile mandatory KPIs with denominator definitions, eligible events and privacy-safe aggregation.
- **Dependencies:** 094, 093, 133
- **Files/systems affected:** Learning telemetry and Manager
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** All requested learning KPIs have tested calculations, freshness and explicit missing-data states. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** All requested learning KPIs have tested calculations, freshness and explicit missing-data states.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK135 — Owned model serving efficiency

- **Objective:** Owned model serving efficiency
- **Scope:** Measure batching, quantization and scale-to-idle against bounded owned-model quality and latency gates.
- **Dependencies:** 096, 130, 134
- **Files/systems affected:** Owned-model runtime and router
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Measured savings include training amortization and infrastructure; regressions reject candidate. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Measured savings include training amortization and infrastructure; regressions reject candidate.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK136 — Owned model rollback drill

- **Objective:** Owned model rollback drill
- **Scope:** Exercise fallback and automatic rollback under quality, latency and serving failures.
- **Dependencies:** 096, 135
- **Files/systems affected:** Model registry and deployment controller
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Canary failure returns traffic to approved baseline without double billing. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Canary failure returns traffic to approved baseline without double billing.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK137 — Learning loop production checkpoint

- **Objective:** Learning loop production checkpoint
- **Scope:** Verify an additional evidence-to-dataset-to-checkpoint improvement cycle and operational KPIs.
- **Dependencies:** 131, 132, 133, 134, 135, 136
- **Files/systems affected:** Learning Pipeline and Model Lab
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Independent held-out outcomes improve or candidate stays unpromoted; lineage and rollback remain complete. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Independent held-out outcomes improve or candidate stays unpromoted; lineage and rollback remain complete.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK138 — V2 workload replacement readiness

- **Objective:** V2 workload replacement readiness
- **Scope:** Define evidence-based Mini/Core/Agent/Code/Vision/Voice workload eligibility and replacement scorecards.
- **Dependencies:** 137
- **Files/systems affected:** Model registry and roadmap
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Each family has workload, quality, cost, rights and fallback thresholds; no fabricated models or global replacement switch. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Each family has workload, quality, cost, rights and fallback thresholds; no fabricated models or global replacement switch.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK139 — Security abuse and tenant isolation

- **Objective:** Security abuse and tenant isolation
- **Scope:** Adversarial authorization, upload, prompt-injection and rate-limit regression across the integrated platform.
- **Dependencies:** 110, 115, 120, 127, 137
- **Files/systems affected:** All trust boundaries
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Cross-tenant reads/actions fail; untrusted content cannot expand task permissions. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Cross-tenant reads/actions fail; untrusted content cannot expand task permissions.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK140 — Privacy export and retention drill

- **Objective:** Privacy export and retention drill
- **Scope:** Verify account export, consent records and retention workflows across assets, traces and datasets.
- **Dependencies:** 104, 113, 131, 139
- **Files/systems affected:** Privacy settings and lifecycle services
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Export contains only authorized records; retention and training exclusions match declared policy. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Export contains only authorized records; retention and training exclusions match declared policy.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK141 — Recovery and backup restore drill

- **Objective:** Recovery and backup restore drill
- **Scope:** Restore a scoped isolated copy from verified backups and measure recovery objectives.
- **Dependencies:** 010, 140
- **Files/systems affected:** Database, storage and durable queues
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Restore proof validates integrity without overwriting live customer data. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Restore proof validates integrity without overwriting live customer data.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK142 — Capacity and load qualification

- **Objective:** Capacity and load qualification
- **Scope:** Publish bounded workload SLOs and verify bottlenecks under controlled nonbillable or approved load.
- **Dependencies:** 130, 141
- **Files/systems affected:** API, queues, storage and runtimes
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Latency, error rate and queue age satisfy declared targets with measured capacity and cost. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Latency, error rate and queue age satisfy declared targets with measured capacity and cost.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK143 — Incident response readiness

- **Objective:** Incident response readiness
- **Scope:** Operator runbooks, alerts and escalation routing tied to actual error budgets.
- **Dependencies:** 091, 092, 142
- **Files/systems affected:** Manager and observability
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Synthetic incident is detected, diagnosed and recovered with evidence and no secret leakage. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Synthetic incident is detected, diagnosed and recovered with evidence and no secret leakage.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK144 — Client release qualification

- **Objective:** Client release qualification
- **Scope:** Regression, update compatibility and signing checks for web/Windows/Android/iOS candidates.
- **Dependencies:** 097, 098, 099, 109, 143
- **Files/systems affected:** Client build and release pipelines
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Only tested device/platform combinations are claimed; signed artifacts match release manifest. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Only tested device/platform combinations are claimed; signed artifacts match release manifest.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK145 — Cross-version compatibility

- **Objective:** Cross-version compatibility
- **Scope:** Test old supported clients against new APIs and safe additive schema rollout.
- **Dependencies:** 144
- **Files/systems affected:** API contracts and client migrations
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Supported old client can reopen existing projects; incompatible calls fail with upgrade guidance. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Supported old client can reopen existing projects; incompatible calls fail with upgrade guidance.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK146 — Billing release qualification

- **Objective:** Billing release qualification
- **Scope:** Replay/concurrency/refund and actual-cost reconciliation across all launch capabilities.
- **Dependencies:** 020, 130, 145
- **Files/systems affected:** Billing ledger and all capability executors
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Exactly-once accounting proven; live billing remains blocked until explicit external gate is met. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Exactly-once accounting proven; live billing remains blocked until explicit external gate is met.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK147 — Learning and model release qualification

- **Objective:** Learning and model release qualification
- **Scope:** Audit owned-model deployment, rights, metrics and fallback against V1 launch criteria.
- **Dependencies:** 137, 138, 146
- **Files/systems affected:** Model Lab, Learning Pipeline and router
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** At least one real owned-model bounded workload has dated production evidence and rollback proof. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** At least one real owned-model bounded workload has dated production evidence and rollback proof.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK148 — Full V1 acceptance rehearsal

- **Objective:** Full V1 acceptance rehearsal
- **Scope:** Run every advertised cross-surface journey and reconcile all receipts and unresolved defects.
- **Dependencies:** 139, 140, 141, 142, 143, 144, 145, 146, 147
- **Files/systems affected:** Full platform
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Every advertised capability has live evidence; no P0/P1 remains; untested claims remain blocked. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Every advertised capability has live evidence; no P0/P1 remains; untested claims remain blocked.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK149 — External launch gate reconciliation

- **Objective:** External launch gate reconciliation
- **Scope:** Verify domain, provider, business, store and ownership approvals with the owner go/no-go recorded separately.
- **Dependencies:** 148
- **Files/systems affected:** Release governance and external account gates
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** Required external approvals are evidenced; missing approvals block public launch without inventing success. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** Required external approvals are evidenced; missing approvals block public launch without inventing success.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED

## PACK150 — V1 final release and recovery gate

- **Objective:** V1 final release and recovery gate
- **Scope:** Seal exact release manifest for all 150 packs and rerun affected launch journeys after final changes.
- **Dependencies:** 149
- **Files/systems affected:** Full platform and canonical state
- **Architecture decisions:** Reuse canonical Brain/Kernel, registry/router, content IDs, permissions and one usage ledger. Extend the existing implementation; do not build a duplicate subsystem.
- **UX requirements:** For affected controls, verify loading, empty, error, cancel, retry and reopen states; keyboard, RTL and responsive behavior. Infrastructure-only work has no invented UI requirement.
- **Security/privacy:** Enforce owner/resource scopes server-side, redact secrets, keep memory and training rights separate; training content admitted only with traceable rights/consent.
- **Cost impact:** Record measured provider/compute/storage/egress/retry cost and reserve/settle/refund impact; unknown costs block paid execution. Track the >=50% mature-scale net operating margin target separately from actual measured margin.
- **Model/learning impact:** Record eligible non-content outcome/cost/failure signals; any dataset content requires rights/consent and lineage. Evaluate model changes independently with fallback and rollback.
- **Test plan:** All 001–150 gates plus external approvals pass; owned model, learning flywheel, billing, recovery and real user journeys are evidenced. Also exercise denial, failure/retry, persistence and accounting boundaries affected by this change; preserve relevant prior regressions.
- **Deployment plan:** Inspect exact current Git/dirty/deployment state; back up touched paths; validate scoped patch; commit explicit paths; push and verify exact production deployment. Apply only necessary compatible migrations through the approved connector.
- **Rollback plan:** Retain pre-change hashes and previous release; reverse only scoped changes with a forward repair or validated prior deployment. Preserve customer rows; no reset/stash or blind migration replay. Verify recovery.
- **Acceptance criteria:** All 001–150 gates plus external approvals pass; owned model, learning flywheel, billing, recovery and real user journeys are evidenced.
- **Evidence/receipt requirements:** Dated receipt with base/source commits, changed paths, backup hashes, test commands/results, deployment IDs, observed live cases and omissions, cost, migration identity, rollback proof and receipt hash. Historical claims retain their original evidence status.
- **Final gate:** LOCKED_VERIFIED only after scoped tests, security/financial regressions where relevant, intended commit/push, exact deployment identity or documented unchanged-runtime identity, dated real production user-flow evidence, rollback/recovery proof, receipt hash and canonical state reconciliation. No next pack before this gate.
- **External gate:** As required by capability; new spend, secrets and legal/account actions require explicit approval
- **Recorded status:** PLANNED
