# ZUVYR V1 — COMPLETE MASTER PLAN

Date: 2026-09-23  
Status: **CANONICAL MASTER PLAN + EMBEDDED V1 MODIFICATION MIRROR**  
Range: **PACK001..PACK150**  
Final readiness gate: **PACK150 only**

## Purpose

This file is the single human-readable entrypoint for the complete ZUVYR V1 plan **and a redundant embedded mirror of every additive V1 modification family introduced after the base ROADMAP_150**. It prevents any future chat, Work/Codex session, handoff, audit or engineer from loading only one amendment and accidentally treating it as the whole roadmap, and it also prevents a V1 amendment from disappearing merely because its source file is missed.

The complete V1 plan is defined as the **UNION** of the canonical sources listed below. No source replaces another unless a newer explicit canonical reconciliation says so.

## Complete-plan equation

```text
ZUVYR_V1_COMPLETE_PLAN =
  ROADMAP_150_ORIGINAL_PACK_SCOPES
+ EA_001_292_READINESS_REQUIREMENTS
+ MODEL_FACTORY_EVALS_MF_01_24
+ UNIVERSAL_BROWSER_CONNECTION_UBA_01_24
+ UNIVERSAL_INTENT_DELEGATION_UIA_01_20
+ USER_OUTCOME_ENGINE
+ PACK_EXECUTION_APPENDIX
+ FRESH_ACTIVE_PACK_RECEIPTS_AND_PRODUCTION_EVIDENCE
```

A session that loads fewer components does **not** have the complete V1 plan.

## Canonical sources that together form the full plan

1. `docs/zuvyr/ROADMAP_150.md`
   - Exact PACK001..PACK150 bodies, dependencies, objectives, scopes and original acceptance responsibilities.
   - Historical status text inside the roadmap is never allowed to override fresher evidence.

2. `docs/zuvyr/V1_READINESS_COMPLETENESS_AUDIT_2026-09-22.md`
3. `docs/zuvyr/V1_READINESS_REQUIREMENTS_001_292.json`
   - EA-001..EA-292 horizontal production-readiness requirements and Pack routing.

4. `docs/zuvyr/ROADMAP_150_MODEL_FACTORY_EVALS_AMENDMENT.md`
5. `docs/zuvyr/ROADMAP_150_MODEL_FACTORY_EVALS_RECONCILIATION_2026-09-23.md`
6. `docs/zuvyr/model-factory-evals-reconciliation-overlay.v1.json`
   - MF-01..MF-24: Model Factory, Evals, data/experience pipeline, teachers, specialists, verification, active learning, curriculum, distillation, anti-forgetting, inference optimization, opportunity/compute harvesting and continuous-improvement flywheel.

7. `docs/zuvyr/ROADMAP_150_UNIVERSAL_BROWSER_SESSION_CONNECTION_AUTHORITY_AMENDMENT_2026-09-23.md`
8. `docs/zuvyr/universal-browser-session-connection-authority-overlay.v1.json`
   - UBA-01..UBA-24: shared Browser Broker, universal browser session, connector/API-first routing, browser/device fallback, persistent encrypted profiles, consent/authority modes, secure takeover, STOP/revoke, recovery, uploads/downloads, security and all-surface production E2E.

9. `docs/zuvyr/ROADMAP_150_UNIVERSAL_INTENT_DELEGATION_MESSAGING_AUTOMATION_AMENDMENT_2026-09-23.md`
10. `docs/zuvyr/universal-intent-delegation-messaging-automation-overlay.v1.json`
    - UIA-01..UIA-20: intent-level authority across connected apps/sites, messaging automation, WhatsApp/business-messaging reference path, browser/app execution without per-click interruption inside user-granted authority, event-driven replies/actions, receipts/recovery, STOP/revoke and cross-client handoff.

11. `docs/zuvyr/USER_OUTCOME_ENGINE.md`
12. `docs/zuvyr/PACK_EXECUTION_APPENDIX.md`
13. `docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json`
14. `ZUVYR_CONTINUE_HERE.md`, `ZUVYR_MASTER_STATE.json`, `ZUVYR_MASTER_MATRIX.md`
15. Newest receipt/evidence for the active Pack + fresh GitHub/Supabase/Railway/Vercel/live evidence.

---

# EMBEDDED V1 ADDITIVE MODIFICATION REGISTRY

This section is deliberately redundant. The detailed amendment/overlay files remain canonical implementation sources, but the essential V1 modifications are mirrored here so they cannot disappear from the complete-plan view.

## A. Model Factory + Evals — MF-01..MF-24

The V1 owned-model path is not postponed beyond PACK150. It is integrated additively into the remaining roadmap, with primary implementation responsibility in PACK131..PACK147 and final acceptance in PACK148..PACK150. Existing original Pack scopes are preserved.

### Embedded MF requirements

- **MF-01 — Candidate Model Factory:** intake, eligibility, isolated benchmark, artifact/run lineage and promotion decisions for candidate models.
- **MF-02 — Teacher Council:** multiple eligible teachers with policy/provenance/verifier filtering rather than one permanent teacher.
- **MF-03 — Specialist Experts and adapters:** Code, Reasoning, Planning, Tool, Agent, Research and Vision/Multimodal experts/adapters when evidence justifies them.
- **MF-04 — ZUVYR Experience Dataset:** privacy/consent-scoped verified trajectories including request, plan, tools, observations, failures, repairs, verification and outcome.
- **MF-05 — Verifier-first learning:** deterministic/state/test verification before model-as-judge whenever possible.
- **MF-06 — Agent training sandboxes:** isolated reproducible coding/browser/tool environments with end-state/test rewards.
- **MF-07 — Automatic curriculum:** simple -> medium -> hard -> adversarial progression based on mastery.
- **MF-08 — Active learning:** prioritize failures, uncertainty, disagreement, retries, intervention and regressions.
- **MF-09 — Test-time intelligence:** dynamic single-pass/multi-sample/verifier/multi-agent compute based on measured value.
- **MF-10 — Versioned skills outside weights:** reusable workflows/skills that can improve without retraining weights.
- **MF-11 — Repository/project intelligence memory:** architecture, symbols, dependencies, decisions, bugs, tests and conventions available as project-aware memory.
- **MF-12 — Continuous distillation:** verified Teacher/Expert -> Core and Core -> Nano transfer where licenses/rights permit.
- **MF-13 — Anti-forgetting regression:** capability-retention and regression suites gate every fine-tune/distillation release.
- **MF-14 — Efficient fine-tuning first:** no-training fix -> SFT -> LoRA/QLoRA/adapters -> targeted preference/environment training -> distillation -> heavier training only when evidence requires it.
- **MF-15 — Inference engineering:** quantization, batching, prefix/prompt caching, KV-cache strategy, speculative decoding where useful, serving/runtime benchmarking.
- **MF-16 — Legitimate cheap/free/owned compute scheduler:** owned hardware, BYOC, truthfully eligible free quotas/credits/programs, cheap/spot compute; no quota/eligibility bypass.
- **MF-17 — Opportunity Scanner:** continuously evaluate open-weight models, datasets, training/inference techniques, agent environments, runtimes and compute opportunities.
- **MF-18 — Capability Harvesting:** preserve useful external models as teachers/fallbacks while legally transferring verified learnings into ZUVYR-owned capability where permitted.
- **MF-19 — Dynamic Compute budgets:** allocate compute by task difficulty/value instead of spending frontier-level inference on trivial work.
- **MF-20 — Real-world ZUVYR benchmarks:** reason/code/plan/tool/agent/browser/vision/memory/RAG/multimodal/safety/cost-latency/end-to-end suites based on actual ZUVYR tasks.
- **MF-21 — Champion/Challenger promotion:** shadow/challenger/canary promotion with rollback and no candidate replacing Champion without evidence.
- **MF-22 — Model genealogy and lineage:** exact source/version/hash, parent/base, license, datasets, recipe, hardware/runtime, artifact hashes, evals and promotion history.
- **MF-23 — Automatic Failure Mining:** classify real failures into data/reasoning/tool/context/planning/execution/etc. and route repair to the right layer.
- **MF-24 — Continuous self-improvement flywheel:** verified production evidence -> failure/eval cases -> eligible dataset -> specialist/training/distillation -> eval -> challenger -> canary -> production evidence loop.

### Embedded MF Pack ownership mirror

- **PACK131:** consent/revocation terminal states + eligibility lineage + model/dataset/eval governance foundation.
- **PACK132:** Experience Dataset + genealogy + contamination controls + Failure Mining + active-learning metadata + deterministic eval runner/verifier farm.
- **PACK133:** Teacher Council + teacher rights + disagreement verification + legal capability harvesting + private holdout discipline.
- **PACK134:** Evals Factory + real-world benchmarks + KPI integrity + curriculum + active learning + Opportunity Scanner + candidate intake.
- **PACK135:** serving efficiency + inference optimization + Dynamic Compute + legitimate cheap/free/BYOC scheduler + data-engine activation where mapped.
- **PACK136:** Champion/Challenger + anti-forgetting + rollback + quarantine + fallback equivalence + teacher/curriculum hardening.
- **PACK137:** low-cost Training Factory + SFT/LoRA/QLoRA + specialist adapters + agent sandboxes + verifier-first learning + distillation.
- **PACK138:** owned model-family readiness + workload-replacement scorecards + skills outside weights + project/repository intelligence + test-time intelligence.
- **PACK139:** Model Factory security + tenant isolation + checkpoint/model exfiltration defense + owned Core/tool-call candidate where evidence allows.
- **PACK140:** learning-data privacy/deletion/retention/future exclusion + self-correction/agent-training hardening.
- **PACK141:** model/dataset/eval/checkpoint lineage backup/restore + distillation/retention recovery.
- **PACK142:** training/eval/inference capacity, scheduler/backpressure/checkpoint resume/resource admission + serving/quantization/cost optimization.
- **PACK143:** model/learning observability + drift/poisoning/verifier/runaway-compute alerts + project/context/RAG/skill intelligence.
- **PACK144:** client progress/fallback/cancel/reconnect/provenance UX + dynamic test-time/multi-agent orchestration where original Pack scope also applies.
- **PACK145:** tokenizer/template/prompt/tool-schema/model/runtime compatibility + Champion/Challenger/canary promotion/rollback compatibility.
- **PACK146:** owned/BYOC economics truth + paid-fallback separation + Dynamic Compute billing correctness + continuous failure-mining proposals.
- **PACK147:** MF-01..MF-24 final learning/model release qualification + final owned-family evidence dossier.
- **PACK148:** integrated self-improvement rehearsal from intake -> dataset -> train -> eval -> artifact -> promotion -> rollback/recovery.
- **PACK149:** model/dataset/teacher/provider rights + compute-credit eligibility + privacy/training/public-claims reconciliation.
- **PACK150:** exact model/checkpoint/adapter/eval/dataset/skill identities + Champion/fallback/rollback seal + MF acceptance matrix.

## B. Universal Browser Session + Connection Authority — UBA-01..UBA-24

ZUVYR V1 must expose one shared browser/connection execution capability across eligible surfaces instead of isolated browser implementations. Canonical decision path:

```text
Connector/API -> Plugin/MCP -> Self-hosted/BYOC Browser -> Managed Cloud Browser -> Local Device Browser -> Secure User Takeover
```

Browser auth/profile state is encrypted/revocable and treated as credential material. Provider session IDs never become product identity. User authority is bounded by app/site scopes and explicit policy.

### Embedded UBA requirements

- **UBA-01** Shared Browser Broker.
- **UBA-02** Universal chat/surface binding.
- **UBA-03** Canonical owner-scoped Browser Session.
- **UBA-04** Isolated browser contexts.
- **UBA-05** Encrypted persistent authenticated profiles.
- **UBA-06** Connector/API-first execution routing.
- **UBA-07** Self-hosted/BYOC low-cost browser runtime.
- **UBA-08** Optional verified managed-provider fallback.
- **UBA-09** Local Device Browser fallback.
- **UBA-10** Maximum Authorized Access connection mode within provider-supported/user-approved scopes.
- **UBA-11** Custom/read-only connection modes.
- **UBA-12** Full-task / always-allow app authority policy.
- **UBA-13** Secure takeover for credentials/passkeys/2FA/CAPTCHA.
- **UBA-14** Consent-screen auto-completion only for exact pre-authorized app/domain/scopes.
- **UBA-15** Progress/screenshots/evidence in originating chat.
- **UBA-16** Global STOP/cancel/revoke propagation.
- **UBA-17** Background continuation and resumable cursor.
- **UBA-18** Exactly-once consequence receipts and uncertain-outcome reconciliation.
- **UBA-19** Download/upload quarantine + Library/Project bridge.
- **UBA-20** Prompt-injection/phishing/redirect/SSRF/egress defenses.
- **UBA-21** Tenant/session isolation and secret hygiene.
- **UBA-22** Dynamic runtime budgets / idle suspend / cost truth.
- **UBA-23** Cross-client takeover/handoff compatibility.
- **UBA-24** Final all-surface production E2E + recovery proof.

### Embedded UBA Pack ownership mirror

- **PACK090:** fresh universal-browser gap audit; canonical Browser Broker/provider abstraction; connector-first routing; cross-surface live proof; progress/STOP/owner scoping.
- **PACK101:** persist `browser_session_ref`, task cursor and browser checkpoint across surfaces/reconnect without replaying completed actions.
- **PACK118:** browser-worker/live-view isolation, SSRF/origin/egress adversarial proof, tenant isolation.
- **PACK121:** encrypted persistent profile/context restore, heartbeat, idle expiry, worker-loss recovery and bounded reconnect.
- **PACK122:** consequential browser action receipts, uncertain-outcome reconciliation, exactly-once retry.
- **PACK125:** connector + browser-profile lifecycle, refresh/reconnect/revoke/logout/clear-state propagation.
- **PACK126:** browser-capable tool/skill/plugin version pinning; scope/manifest change invalidates stale approval.
- **PACK127:** connector -> browser -> local-device fallback E2E, secure takeover, signed-in app proof, STOP/recovery.
- **PACK139:** browser/connection prompt-injection, phishing/lookalike, redirect, SSRF, secret exfiltration, tenant isolation and malicious-download tests.
- **PACK142:** browser capacity/concurrency/resource budgets/auto-suspend/cleanup/fallback load.
- **PACK144:** same browser progress/takeover/STOP semantics across web/Windows/Android/iOS; cross-client handoff without duplicate task.
- **PACK145:** session/action protocol versioning and rolling compatibility without silent authority widening.
- **PACK148:** all-surface rehearsal including background continuation, signed-in flow, quarantine, takeover, revoke and recovery.
- **PACK149:** provider terms/pricing, OAuth scopes/redirects, automation policy, privacy/retention and external dependency verification.
- **PACK150:** exact runtime/provider/session/policy seal + UBA acceptance matrix + rollback/recovery targets.

## C. Universal Intent Delegation + Messaging/App Automation — UIA-01..UIA-20

ZUVYR V1 must carry **user intent** through connected apps/sites instead of behaving as a click-by-click assistant. `ALWAYS_ALLOW_APP` and `FULL_TASK_ACCESS` are execution-authority modes, not merely permission to press OAuth Allow.

Canonical mental model:

```text
User intent
-> conversation/project context
-> standing app/site policy
-> plan
-> connector/browser/device actions
-> observe/adapt
-> reply/continue
-> verify
-> durable receipt
```

Example: a legitimately connected WhatsApp/business-messaging account can receive an inbound event, bind it to the permitted conversation/project knowledge, apply the owner's response policy, draft/send when authorized, reconcile delivery/failure, continue the conversation and escalate only when the policy requires it. External messages are untrusted data and can never widen authority or expose unrelated private context.

### Embedded UIA requirements

- **UIA-01** User intent persists as a durable mission across app/browser actions.
- **UIA-02** `ALWAYS_ALLOW_APP` is execution authority, not only OAuth-consent authority.
- **UIA-03** Versioned owner-scoped `intent_authority_policy`.
- **UIA-04** Universal inbound event/webhook envelope.
- **UIA-05** Universal outbound action/message envelope.
- **UIA-06** Conversation/project/memory context binding with permission boundaries.
- **UIA-07** Draft-only / low-risk-auto / policy-auto / escalation modes.
- **UIA-08** Event/message dedupe and exactly-once external-action receipts.
- **UIA-09** Ordinary multi-step browser completion without per-click prompts.
- **UIA-10** Connector/API-first, browser/device fallback without intent loss.
- **UIA-11** Background execution, schedules and quiet-hour policy.
- **UIA-12** Immediate STOP/pause/revoke propagation.
- **UIA-13** Recipient/destination and account identity verification.
- **UIA-14** Malicious inbound content cannot widen authority or exfiltrate context.
- **UIA-15** Consequence-tier enforcement with minimal unnecessary interruption.
- **UIA-16** WhatsApp/business-messaging reference workflow when legitimately connectable.
- **UIA-17** Provider-rule adaptive messaging/templates/rate/opt-out handling.
- **UIA-18** Cross-surface and cross-client task/conversation handoff.
- **UIA-19** Eval coverage for relevance, policy following, uncertainty and escalation.
- **UIA-20** Final production E2E + recovery proof across messaging + website/app action paths.

### Embedded UIA Pack ownership mirror

- **PACK090:** Universal Intent Delegation gap audit; chat-issued mission invokes authorized connector/browser action without per-click approval; establish `intent_authority_policy` if missing.
- **PACK101:** persist mission, authority-policy version, external conversation/task cursor and action receipts across reconnect/handoff without duplicate sends/actions.
- **PACK122:** consequence tiers across browser/connector/messaging/device; uncertain send/submit reconciliation before retry.
- **PACK124:** standing message/app automations, quiet/allowed hours, missed-trigger policy and duplicate-event suppression.
- **PACK125:** connection lifecycle preserves/invalidates standing authority correctly on refresh/reconnect/revoke/account-switch/scope change; revoke stops sending.
- **PACK126:** connector/tool schema version pinning; material action/schema/scope changes cannot silently inherit broad old approval.
- **PACK127:** at least one legitimate event-driven messaging/app workflow E2E plus one ordinary multi-step browser task without per-click approval under valid standing authority.
- **PACK134:** policy-following, destination correctness, reply relevance, hallucination/uncertainty, escalation and continuity evals.
- **PACK139:** malicious inbound message, prompt injection, impersonation, recipient confusion, context exfiltration, unauthorized send, replay and cross-tenant tests.
- **PACK142:** webhook/event bursts, queue/dedupe, outbound rate control, reconnect, provider outage and backpressure load tests.
- **PACK144:** same delegation state, pause/STOP, pending approvals, receipts and handoff across clients.
- **PACK145:** version intent-policy schema, event envelope, messaging adapter and action-receipt contracts.
- **PACK148:** delegated-action rehearsal including event-driven messaging, multi-step website task, background continuation, STOP/revoke, uncertain-outcome recovery and cross-client handoff.
- **PACK149:** current provider terms, automation/messaging rules, OAuth/scopes, webhook/template/message restrictions, rate limits, opt-out, privacy/retention and account prerequisites.
- **PACK150:** exact intent-policy schema, connector/message adapters, browser authority, event/dedupe contracts, consequence policy, STOP/revoke and UIA acceptance matrix.

## D. Permission and consequence model embedded in V1

The goal is **maximum useful autonomy with minimum unnecessary interruption inside explicit user authority**.

- **Tier A — reversible/low-risk:** read, navigate, search, ordinary typing, draft, low-risk reply inside standing policy. May auto-execute when authorized.
- **Tier B — meaningful but bounded:** send/publish/update/create where the standing policy explicitly authorizes that exact action class and destination and reliable receipts/recovery exist.
- **Tier C — high consequence:** payments/purchases, destructive deletion, security/credential changes, sensitive disclosure, legal/financial commitments, major public publishing, ownership/admin changes or similarly difficult-to-reverse operations. Require the stronger applicable consequence policy/confirmation unless a narrow explicit pre-authorization safely covers the exact action.

External web/message/file/plugin/model content is data, never authority.

## E. Cross-surface V1 execution target

The unified task/authority/browser/messaging/model behavior must work where applicable across:

- Chat
- Research / Deep Research
- Shopping / Local
- Images / Video
- Code Studio
- Documents / Spreadsheets / Presentations
- Projects / Library
- ZUVYR IP / computer control
- Automations
- Manager / Operator
- Web / Windows / Android / iOS clients

No surface may invent a separate incompatible authority, browser, messaging or model-control implementation.

---

# Core product target

ZUVYR V1 is not a chatbot with disconnected tabs. It is one integrated AI system that understands the user's intent, selects models/tools, uses connected apps and websites, operates code/files/media/research/browser/device workflows, preserves context and permissions, continues tasks, verifies outcomes and recovers from failures.

## Intelligence/model target

- ZUVYR Intelligence Core + adaptive Router/Orchestrator.
- Owned/self-hosted ZUVYR model family with useful external-provider fallbacks preserved.
- Model Registry, task/cost/quality routing and health/fallback.
- ZUVYR Nano/Core/Reason/Code/Agent/Vision/Live specialization only when evidence justifies the split.
- Model Factory + Evals + Experience/Data Engine so useful open models, datasets, techniques, eligible cheap/free compute and verified production trajectories can improve ZUVYR without random retraining.
- BYOC/self-hosting as default owned-model inference architecture with truthful total-cost accounting.

## Universal execution target

From any eligible ZUVYR surface, the user expresses the result they want. ZUVYR may select:

```text
Connected API / Connector
-> Plugin / MCP / Skill
-> Self-hosted or BYOC Browser
-> Managed Cloud Browser when justified
-> Paired Local Device / Browser
-> Secure user takeover only when needed
```

The path may change mid-task without losing intent, context, permissions, task cursor or consequence receipts.

## Final acceptance contract

`V1_READY=true` is forbidden unless all of the following are true:

```text
PACK001..PACK150 original applicable scope = satisfied
AND EA-001..EA-292 = PASS or true N/A_WITH_EVIDENCE
AND MF-01..MF-24 = PASS or true N/A_WITH_EVIDENCE
AND UBA-01..UBA-24 = PASS or true N/A_WITH_EVIDENCE
AND UIA-01..UIA-20 = PASS or true N/A_WITH_EVIDENCE
AND all advertised capabilities have dated production E2E evidence
AND security/financial/ownership/concurrency/recovery gates pass where applicable
AND external provider/account/rights/terms/privacy gates are reconciled
AND fresh gap audit before PACK148 is closed
AND PACK148 rehearsal passes
AND PACK149 external launch reconciliation passes
AND PACK150 exact release/recovery seal passes
```

A route, button, registry entry, mock, provider name, successful deploy, planning document or partial demo is never completion by itself.

# No-loss and anti-drift rule

1. **Every future additive V1 modification must be written twice:**
   - detailed source amendment/overlay; and
   - an embedded human-readable mirror inside this Master Plan.
2. The corresponding files and this Master Plan must be registered in `ZUVYR_CONTINUITY_MANIFEST.json` with current blob hashes.
3. CI/continuity validation must fail on unexplained snapshot drift or missing canonical components.
4. A new session must load this Master Plan and the detailed sources relevant to the active Pack.
5. If the embedded mirror and the detailed source disagree, work stops for reconciliation; neither side may be silently dropped.
6. Original PACK001..PACK150 bodies remain canonical in `ROADMAP_150.md`; they are not rewritten here because that would create a second competing base roadmap. **All additive V1 modifications, however, must be mirrored here.**
7. Newer explicit user instruction and fresh production evidence outrank stale planning/status text, but accepted V1 scope cannot be silently removed to make progress look complete.

# Current execution rule

This file does **not** change the active Pack, bypass a gate, mark anything complete or reopen a previously locked Pack. Execution continues from the freshest evidence-backed active Pack recorded in the continuity manifest and newest receipt.
