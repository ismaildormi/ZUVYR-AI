# ZUVYR

**One AI platform for thinking, creating, building and acting.**

ZUVYR brings multimodal chat, research, image and video creation, voice, Code Studio, computer control, agents and automations into one connected workspace.

> **Status:** ZUVYR V1 is in active development. The repository follows evidence-based PACK001→PACK150 production acceptance; individual capabilities may still be gated until their production acceptance is complete.

## Explore ZUVYR

[Product](docs/PRODUCT.md) · [Architecture](docs/ARCHITECTURE_OVERVIEW.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [V1 Roadmap](docs/zuvyr/ROADMAP_150.md)

---

## ZUVYR V1 — Canonical Product Target

> This README defines the **target required for ZUVYR V1**. It replaces the historical ROX AI / Safe Bridge README as the repository landing page.
>
> Detailed execution truth remains in the canonical project-state documents, receipts, migrations, tests and live production evidence. **A feature is not complete merely because code exists.**

## V1 completion contract

ZUVYR V1 is complete only when **PACK150** is reached and the complete V1 acceptance surface is genuinely verified.

- PACK001–PACK150 are the execution envelope for V1.
- The canonical V1 audit contains **EA-001 → EA-240** acceptance items.
- Every applicable acceptance item must finish as **PASS** or **N/A_WITH_EVIDENCE**.
- `UNKNOWN`, `PARTIAL`, `DEFERRED`, `NOT_TESTED`, `MOCK_ONLY`, code-only, local-only, deploy-only or undocumented assumptions **do not qualify as V1_READY**.
- Critical **and non-critical** V1 gaps discovered during implementation must be incorporated into the remaining packs instead of being silently deferred.
- Every pack must be re-studied for architecture, UX, security, privacy, reliability, performance, accessibility, cost, integrations and production safety.
- Preserve previous verified work. Fresh production evidence overrides stale handoffs or historical percentages.
- No pack is complete before its acceptance evidence and receipt support `LOCKED_VERIFIED`.

## What ZUVYR V1 must be

ZUVYR V1 is one integrated AI platform rather than disconnected demos. Chat, Research, Images, Video, Code Studio, Voice/Audio, Computer Control/IP, agents, workspace/library, integrations and account/billing systems must share identity, permissions, usage accounting, context, artifacts and safety boundaries.

### Intelligence and orchestration

V1 requires a production-grade model/provider registry, capability-aware routing, fallback and health handling, task planning/orchestration, cost-aware execution, retries and idempotency, reservations/settlement/refunds, observability, and explicit failure states. Provider/model abstractions must allow models to be replaced without rewriting product surfaces.

The V1 foundation must also prepare ZUVYR's owned-model path: governed Teacher Gateway, training-rights matrix, Learning Pipeline/Failure Bank, dataset/license/checkpoint lineage, task-success and total-cost-per-success evaluation, and owned-model serving with shadow/canary/rollback. Runtime knowledge access and training rights must remain explicitly separated.

### Chat and multimodal

Production chat must support persistent conversations/history, attachments and files, images, extraction/OCR where applicable, memory/context, sources, web/search and deep-research workflows, tool calls, artifact handling, retries/cancel states, usage visibility and robust multimodal rendering. Conversation operations such as pin/rename/archive/delete must preserve owner isolation and consistency.

### Research, web and shopping agents

V1 must support multi-source research, evidence/provenance, citations, source quality handling, long-running task state, cancellation/recovery and useful result synthesis. Shopping/recommendation workflows must be capability-aware and integrate with the same task, permission and accounting foundation.

### Images

V1 image workflows include generation, reference-image use, editing, variations, background removal, upscale, inpainting/targeted edits, expansion, history/library integration, download/export, retry/cancel and correct credit settlement/refund behavior. Generated media and prompts must render correctly across chat and dedicated image surfaces.

### Video

V1 video workflows include text-to-video, image-to-video, job lifecycle/progress, preview, edit/extend, subtitles, dubbing, enhancement, export/download, cancellation, lineage/history and failure/refund reconciliation. Long-running generation must be durable and idempotent.

### Code Studio

Code Studio must provide projects/files, editor, terminal/sandbox, build/test, preview, artifact/ZIP handling and AI-assisted coding workflows. It must interoperate with other ZUVYR capabilities—for example requesting or consuming generated images/video—without bypassing permission, usage or security controls.

### Voice and audio

V1 includes speech-to-text, text-to-speech and the planned audio workflows, plus production realtime voice with explicit session state, microphone/STOP controls, interruption/barge-in, transcript turns, retention rules, usage accounting and safe provider/cost gates.

### ZUVYR IP / computer control

Computer-control/IP must be permission-bound, auditable and revocable. Missions/tasks must use explicit grants, scoped capabilities, owner isolation, safe execution boundaries, cancellation and terminal-state reconciliation. Computer control must be able to reach the appropriate ZUVYR capabilities without becoming an authorization bypass.

### Agents, automations and Brain Kernel

V1 must support durable tasks, workflows, scheduling/automation, permission-bound execution and the Brain Kernel execution path. Funding/caps, grants, retries, reservations, terminal success/failure/refund states and idempotency must be production-authoritative so retrying a task cannot double-charge or duplicate unintended execution.

### Workspace, library and creations

Projects, library items, creations, templates and generated artifacts must have durable schemas, ownership, validation, lineage and lifecycle operations. Cross-feature artifacts must be reusable without copying insecure references or losing provenance.

### Integrations and connections

Connections such as Google services must use real OAuth where required, least-privilege scopes, explicit consent, encrypted/controlled secret handling, granted-scope proof, denied-scope behavior, disconnect/revoke behavior and auditability. A connected external account must never imply unrestricted tool permission.

### Identity, accounts and personalization

V1 requires production authentication/session handling, profiles, settings, persistent user state, account lifecycle, secure authorization boundaries and coherent cross-device behavior. User-facing state must not depend on client-side claims for privileged fields.

### Plans, credits, usage and billing

All paid/limited capabilities must use one authoritative usage system: pricing/model registry, reserve → execute → settle/refund, ledger/audit trail, plan allowances, caps and rate/resource limits. Retries and failures must not double-charge. Billing activation is controlled separately from implementation; historical test authorization must never silently enable live billing.

### Admin, operations and observability

V1 needs operational dashboards and evidence for service health, jobs/tasks, usage/cost, provider health, failures, abuse/security signals and reconciliation. Backend, worker, maintenance/scheduler and frontend deployments must have verifiable health and rollback/recovery paths.

## Security baseline — mandatory, not optional hardening

Owner isolation alone is insufficient. Every applicable endpoint/tool/resource must enforce systematic authorization and least privilege.

V1 must address the relevant OWASP API risk classes, including:

- object-level authorization / BOLA;
- broken authentication and session handling;
- object-property authorization / mass assignment;
- function-level authorization;
- unrestricted resource consumption and abuse/rate limits;
- SSRF and outbound-request controls;
- unsafe consumption of third-party APIs;
- security misconfiguration;
- inventory/version/deprecated-endpoint control;
- sensitive-data and secret handling.

This applies consistently to REST/API routes, tools, agents, background workers, queues, storage objects, files, projects, conversations, generations, OAuth connections, computer-control grants and admin operations. Tests must include positive authorization and negative denial/revocation paths.

## Reliability and data integrity

V1 must tolerate retries, duplicate delivery, worker restarts and partial provider failures without corrupting user state or money. Durable operations need idempotency keys/constraints, authoritative terminal states, reservation reconciliation, cancellation semantics, dead/stale work recovery and cleanup. Database migrations and RLS/policies must be production-verified, not merely present in source.

## UX and accessibility

Every advertised V1 capability needs a complete user path: discover → configure/consent → execute → progress → success/failure → retry/cancel where relevant → history/artifact → usage/cost visibility. Empty/loading/error/denied/offline or unavailable states must be intentional. Mobile and desktop behavior, keyboard/accessibility semantics, localization-ready text and consistent ZUVYR identity are part of V1 quality.

## Performance and cost

Performance, provider latency, queue pressure, payload/file limits, storage lifecycle, resource consumption and total cost per successful task are acceptance concerns. Routing should optimize successful outcomes and cost without hiding degraded quality. Expensive capabilities require explicit pricing/cost gates and measurable usage.

## User outcome layer

ZUVYR should not merely expose tools. It should help the user turn intent into useful outcomes through contextual next actions and connected capabilities. Suggestion/action flows should preserve conversation/project context and make the next legitimate step executable when the platform has permission and capability to do so.

## Production acceptance rule

For a pack to become `LOCKED_VERIFIED`, use the strongest safe evidence applicable to it:

1. reconcile fresh GitHub `main`, PR/CI state and canonical docs;
2. verify required Supabase production migrations/schema/RLS;
3. verify relevant Railway/Vercel production deployment and runtime health;
4. execute controlled production acceptance, including denial/failure paths;
5. prove authorization, idempotency, accounting and cleanup where relevant;
6. ensure no unintended provider/customer execution occurred;
7. remove acceptance fixtures and leave production safe;
8. create/update the pack receipt and canonical state documents.

A green deployment by itself is **not** completion.

## Canonical continuity

Before continuing implementation, read the canonical continuity chain in this order and reconcile it with live systems:

`ZUVYR_CONTINUE_HERE` → `ZUVYR_MASTER_STATE` → `ZUVYR_MASTER_MATRIX` → `ROADMAP_150` → V1 readiness audit/JSON → user-outcome specification → pack execution appendix → latest pack receipt → fresh GitHub/Supabase/Railway/Vercel evidence.

Historical ZIP plans, old completion percentages and old README instructions are context only when they conflict with fresher canonical/live evidence.

## Current execution boundary

The project is being completed sequentially through PACK150. Do not skip unresolved dependencies, manufacture credentials/evidence, or mark a gate complete from mocks. When an external dependency is genuinely unavailable, record the exact blocker and leave production safe.

**PACK150 is the final V1 gate:** ZUVYR may be declared `V1_READY` only after the entire canonical V1 surface—including all applicable EA-001→EA-240 items and all gaps discovered before final acceptance—is PASS or N/A_WITH_EVIDENCE.
