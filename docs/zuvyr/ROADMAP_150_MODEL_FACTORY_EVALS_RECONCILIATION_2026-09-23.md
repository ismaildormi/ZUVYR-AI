# ZUVYR ROADMAP 150 — Model Factory + Evals Reconciliation Overlay

**Date:** 2026-09-23  
**Authority:** additive binding overlay for `docs/zuvyr/ROADMAP_150.md` and `docs/zuvyr/ROADMAP_150_MODEL_FACTORY_EVALS_AMENDMENT.md`.  
**Goal:** integrate Model Factory + Evals into the remaining PACK131–150 work **without replacing, dropping, renumbering or weakening any original Pack scope or EA-001..EA-292 obligation**.

## 1. Conflict and preservation rule

For PACK131–150, the executable scope is the **union** of:

1. the original PACK scope and acceptance criteria in `ROADMAP_150.md`;
2. every applicable mapped `EA-001..EA-292` readiness requirement;
3. the Model Factory + Evals amendment;
4. this reconciliation overlay;
5. fresher verified production/state evidence and explicit user instructions.

No later document may treat a Model Factory deliverable as a replacement for the original Pack purpose. If two descriptions differ, preserve both unless they are technically contradictory; in a contradiction, keep the stricter safety/privacy/rights/release gate and route the implementation so both user outcomes survive.

The Section 7 PACK131–150 mapping in `ROADMAP_150_MODEL_FACTORY_EVALS_AMENDMENT.md` is therefore interpreted as **additive model/eval deliverables inside those Packs**, not as new Pack titles that erase the original roadmap scopes.

## 2. Original PACK131–150 scopes that remain mandatory

These scopes are preserved and may not disappear:

- **PACK131 — Training consent revocation audit.**
- **PACK132 — Dataset contamination audit.**
- **PACK133 — Teacher rights and disagreement audit.**
- **PACK134 — Learning KPI integrity.**
- **PACK135 — Owned model serving efficiency.**
- **PACK136 — Owned model rollback drill.**
- **PACK137 — Learning loop production checkpoint.**
- **PACK138 — V2 workload replacement readiness.**
- **PACK139 — Security abuse and tenant isolation.**
- **PACK140 — Privacy export and retention drill.**
- **PACK141 — Recovery and backup restore drill.**
- **PACK142 — Capacity and load qualification.**
- **PACK143 — Incident response readiness.**
- **PACK144 — Client release qualification.**
- **PACK145 — Cross-version compatibility.**
- **PACK146 — Billing release qualification.**
- **PACK147 — Learning and model release qualification.**
- **PACK148 — Full V1 acceptance rehearsal.**
- **PACK149 — External launch gate reconciliation.**
- **PACK150 — V1 final release and recovery gate.**

Any implementation plan that omits one of these original outcomes is incomplete even if its Model Factory work passes.

## 3. Binding Model Factory/Evals ownership on top of original scopes

### PACK131 — Consent/revocation + training eligibility terminal states
Preserve the original consent-revocation audit and extend it so revocation/exclusion propagates to dataset admission, active-learning queues, teacher/synthetic candidate queues, cached training candidates, pending training jobs, derived trace references where technically applicable, and future retraining admission. Memory permission remains separate from training permission.

**Added factory ownership:** governance identity for models/datasets/adapters/checkpoints/eval runs may be introduced here only insofar as it is needed to prove revocation and eligibility lineage.

**Must prove:** a revoked user/item cannot re-enter training through cache, retry, derived trace or queue replay.

### PACK132 — Contamination + Experience Dataset + genealogy + Failure Mining
Preserve the original dataset-contamination audit. Add canonical privacy/rights-aware trajectory representation:
`request -> resolved context -> plan -> model/tool actions -> observations -> failure/correction -> verification -> final outcome`.

Add dataset fingerprints, provenance, lineage, dedupe/near-duplicate detection, contamination checks, hard-negative/repair labels, failure taxonomy and active-learning candidate metadata.

**Must prove:** training/eval examples are traceable to eligibility/provenance and contaminated/revoked items can be excluded deterministically.

### PACK133 — Teacher rights + Teacher Council + disagreement verification
Preserve the original teacher-rights/disagreement audit. Add a teacher registry/council only where rights and provider/model terms permit. Record exact teacher model/version, allowed usage, task eligibility, disagreement, verifier evidence and rejected candidates.

**Must prove:** conflicting teachers do not silently become truth and restricted teacher output cannot enter prohibited training/distillation paths.

### PACK134 — Learning KPI integrity + ZUVYR Evals Factory
Preserve the original KPI-integrity scope. Build/version the real-world Evals system and scorecards for applicable Chat/Research, planning, coding, tools, agents, retrieval, multilingual/Darija/Arabic/French/English, multimodal understanding/generation orchestration, uncertainty and cost per successful task.

Add fixed/versioned denominators, statistical thresholds, private holdout discipline, deterministic verifier hierarchy, automatic curriculum from verified failure clusters, active-learning prioritization and Opportunity Scanner benchmark intake.

**Must prove:** a candidate/opportunity cannot skip baseline comparison or be promoted from one lucky run.

### PACK135 — Owned serving efficiency + Dynamic Compute + compute opportunity scheduling
Preserve serving-efficiency qualification. Add measured quantization, batching, prefix/prompt caching, KV-cache policy, model loading/offloading and speculative decoding/equivalent techniques where supported and beneficial. Add difficulty/consequence-aware Dynamic Compute budgets and legitimate local/BYOC/free-credit/spot/cheap compute scheduling for experiments.

**Must prove:** unknown paid cost fails closed, easy tasks avoid unnecessary expensive inference, and optimization does not silently cross quality/privacy/safety limits.

### PACK136 — Rollback drill + Champion/Challenger + anti-forgetting + quarantine
Preserve the owned-model rollback drill. Expand it to model/router/template/skill promotion stages `LAB -> EVAL -> SHADOW -> CANARY -> SECONDARY/PRIMARY`, regression protection, known Champion fallback, emergency quarantine and rollback triggers.

**Must prove:** an intentionally regressive challenger cannot become Primary and a bad candidate/Primary can be removed without losing the last known-good path.

### PACK137 — Learning-loop production checkpoint + low-cost Training Factory
Preserve the production learning-loop checkpoint. Add specialist LoRA/QLoRA/adapters or equivalent experts, isolated agent/code/browser training sandboxes, executable verifiers/rewards, targeted distillation and independent post-train eval. Prefer the cheapest intervention that closes the measured gap before broader/full training.

**Must prove:** at least one rights-approved failure cluster travels end-to-end through eligible data -> targeted intervention -> independent eval -> challenger -> shadow/canary decision, with measurable improvement and no unacceptable regression.

### PACK138 — V2 workload replacement readiness + model family/skills/test-time intelligence
Preserve the external-workload replacement readiness scorecard. Evaluate the canonical owned family targets already used by ZUVYR planning: `ZUVYR 7`, `ZUVYR 7 Code`, `ZUVYR 7 Manager`, `ZUVYR 7 Agent`, `ZUVYR 7 Vision`, `ZUVYR 7 Voice`; additional Mini/base/Prime or other tiers exist only when evidence justifies them. They may share bases/adapters/configurations.

Add versioned skills outside weights, owner-authorized repository/project intelligence memory and bounded test-time search/replanning/multi-candidate verification for hard tasks.

**Must prove:** representative workloads route to the best verified owned specialist/skill/memory path while stronger external fallbacks remain available where owned quality has not met the gate.

### PACK139 — Security/tenant isolation + Model Factory adversarial closure
Preserve the full original security-abuse/tenant-isolation scope and applicable EA security work. Add adversarial tests for training/eval/serving endpoints, teacher gateways, checkpoint/model storage, skill packages, prompt/template/tool-result injection, SSRF/egress, tenant crossover, secret leakage and model/checkpoint exfiltration.

### PACK140 — Privacy export/retention + learning-data terminal states
Preserve the privacy export/retention drill. Verify hard-forget/retention propagation across experience datasets, active-learning queues, eval derivatives, embeddings/indexes, caches, checkpoints/adapters where legally/technically applicable, logs and future training admission. Never claim deletability for immutable third-party/base artifacts that cannot contain user content by design; document the boundary instead.

### PACK141 — Recovery/backup restore + Model Factory lineage recovery
Preserve the recovery/backup restore drill. Include the minimum critical model registry, dataset manifests, eval definitions/results, checkpoint metadata, skill registry, promotion state and rollback targets. Restored metadata must retain correct hashes, rights and genealogy.

### PACK142 — Capacity/load + training/eval/serving scheduler qualification
Preserve capacity/load qualification. Include BYOC/inference registration, model loading, eval queues, training job scheduling, cancellation, checkpoint resume, backpressure/resource admission and graceful shutdown. Training/eval experiments cannot starve production control-plane work.

### PACK143 — Incident response + model/learning observability
Preserve incident-response readiness. Add privacy-safe traceability from candidate intake -> data -> train/eval -> promotion -> serving outcome. Define alerts/runbooks for drift, poisoned-candidate spikes, repeated verifier failure, runaway compute, model-serving degradation, promotion-lineage break and emergency quarantine.

### PACK144 — Client release qualification + model-aware UX
Preserve web/desktop/mobile release qualification. Where model/routing state is user-visible, verify progress, fallback/degraded state, cancellation, reconnect, provenance/limitations and permission/approval UX without leaking internal prompts, secrets or unsupported superiority claims.

### PACK145 — Cross-version compatibility + model/tool/template/tokenizer gates
Preserve cross-version compatibility. Treat tokenizer, chat template, system prompt contract, tool/MCP schema, structured-output schema, model file/runtime format and serving API as versioned compatibility surfaces. Provider/model upgrades require targeted compatibility/eval gates.

### PACK146 — Billing qualification + owned/fallback economics truth
Preserve full subscription/billing release qualification. Verify ZUVYR-owned/BYOC economics and user/provider compute are separated from paid external fallback costs. Dynamic Compute cannot hide paid fallback spend or duplicate reserve/settle/refund behavior.

### PACK147 — Learning/model release qualification + MF-01..MF-24 final gate
Preserve the original Learning and Model Release Qualification and make it the hard acceptance point for the full Model Factory/Evals program. Reconcile candidate intake/licenses; dataset/checkpoint/training-code hashes and lineage; teacher rights/disagreement; specialist training/distillation; multilingual/multimodal/coding/planning/tool/agent evals; statistical thresholds; anti-forgetting; privacy/security/safety; latency/cost/capacity; Champion/Challenger/rollback/quarantine; model/system cards; fallback equivalence and drift/change gates.

**Rule:** training completion alone is never a release result.

### PACK148 — Full V1 acceptance rehearsal + self-improvement rehearsal
Preserve the complete cross-surface V1 rehearsal. Add one non-destructive path from verified failure or eligible opportunity -> rights/eval/data decision -> intervention or evidence-backed no-train decision -> challenger evaluation -> routing/shadow/canary decision -> fallback/rollback proof. Exercise cheap/owned compute when legitimately available; never fabricate a free quota.

### PACK149 — External launch reconciliation + model rights/claims
Preserve every external/provider/legal/business/security launch gate. Reconcile base-model/dataset/teacher licenses, external provider terms, compute-credit eligibility/terms, training/privacy disclosures and public cost/capability claims. Claims such as “zero cost”, “best”, “frontier”, “private” or “self-hosted” must match exact evidence and scope.

### PACK150 — Final release/recovery + exact Model Factory seal
Preserve the final V1 gate. The exact release manifest additionally records amendment/overlay versions, production model/checkpoint/adapter hashes, tokenizer/templates, skills, eval suite/version/results, dataset/checkpoint lineage references, serving/runtime policy, Champion/fallback/rollback targets and MF acceptance state.

`V1_READY=true` remains forbidden while any applicable original Pack item, EA item, or Model Factory/Evals obligation is unknown, partial, deferred, hidden or untested.

## 4. Mandatory Model Factory capabilities — no omission rule

The complete rapid-improvement program must preserve all of these capabilities even when implementation is distributed differently across Packs:

1. Candidate Model Factory.
2. Teacher Council.
3. Specialist Experts/adapters.
4. ZUVYR Experience Dataset.
5. Verifier-first learning.
6. Agent training sandboxes.
7. Automatic curriculum.
8. Active learning.
9. Test-time intelligence.
10. Versioned skills outside weights.
11. Repository/project intelligence memory.
12. Continuous distillation.
13. Anti-forgetting regression.
14. Efficient fine-tuning first.
15. Inference engineering.
16. Legitimate cheap/free/owned compute opportunity scheduler.
17. Opportunity Scanner.
18. Capability Harvesting with legal external teachers/fallbacks.
19. Dynamic Compute budgets.
20. Real-world ZUVYR benchmarks.
21. Champion/Challenger promotion.
22. Model genealogy/lineage.
23. Automatic Failure Mining.
24. Continuous self-improvement flywheel.

No item may be silently dropped because another Pack already has a similar title.

## 5. Cost strategy boundary

The optimization target is **minimum cost per verified capability improvement**, not a false claim of literally zero compute.

Prefer in order:
`router/prompt/context/skill/tool/RAG fix -> small high-quality SFT -> LoRA/QLoRA/adapters -> targeted preference/environment training -> distillation -> broader/full training only when evidence proves it necessary`.

Allowed low-cost opportunities include owned hardware, BYOC, legitimate free quotas/credits/programs, and cheap/spot resources. Prohibited tactics include quota evasion, false eligibility, account multiplication to bypass limits, or any provider/license/terms bypass.

## 6. Earlier PACK090–130 hook rule

The existing amendment permits only lightweight, dependency-safe eval/learning hooks before PACK131. This remains valid, with one clarification: **hooks may collect metadata/evidence and create reusable eval cases, but they may not move implementation responsibility out of PACK131–147 or declare those later gates satisfied early.**

The currently active Pack is not advanced or changed by this overlay.

## 7. Final acceptance equation

```text
ZUVYR_MODEL_FACTORY_EVALS_READY =
  ORIGINAL_PACK131_150_SCOPES_ALL_SATISFIED
  AND APPLICABLE_EA_001_292_ALL_PASS_OR_TRUE_NA_WITH_EVIDENCE
  AND MODEL_FACTORY_CAPABILITIES_01_24_ALL_PASS_OR_TRUE_NA_WITH_EVIDENCE
  AND PACK147_MODEL_RELEASE_GATE_PASS
  AND PACK148_INTEGRATED_REHEARSAL_PASS
  AND PACK149_EXTERNAL_RIGHTS_AND_CLAIMS_PASS
  AND PACK150_EXACT_RELEASE_AND_RECOVERY_SEAL_PASS
```

This equation is additive to the existing `V1_READY` contract; it does not weaken any prior release condition.
