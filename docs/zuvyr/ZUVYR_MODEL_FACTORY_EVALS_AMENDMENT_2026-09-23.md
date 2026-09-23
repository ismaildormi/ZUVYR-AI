# ZUVYR V1 — Model Factory + Evals Rapid-Improvement Amendment

**Canonical amendment date:** 23 September 2026  
**Applies to:** remaining V1 work in `PACK131..PACK150`  
**Status:** additive planning contract; no Pack renumbering and no reopening of already verified Packs solely to attach this amendment.  
**Final gate remains:** `PACK150`.

## 1. Purpose

This amendment makes two systems mandatory inside the existing 150-Pack V1 plan rather than postponing them beyond PACK150:

1. **ZUVYR Model Factory** — a repeatable system for discovering, qualifying, adapting, training, distilling, serving, comparing and promoting ZUVYR-owned or legally usable model capabilities.
2. **ZUVYR Evals + Experience Engine** — a versioned real-world evaluation/data flywheel that converts verified ZUVYR outcomes and failures into measurable improvements without treating raw user content or feedback as automatic training truth.

The objective is not to spend heavily on brute-force pretraining. The objective is to maximize improvement per unit of compute by using architecture, verified trajectories, specialist adapters, test-time intelligence, distillation, model routing, open-weight opportunities, legal teacher usage, reusable skills and cheap/free compute when legitimately available.

## 2. Economics and truthfulness rule

- The target is **near-zero marginal experimentation cost where legitimately available**, not the false claim that training or inference has zero total resource cost.
- Prefer existing owned hardware, BYOC, legitimately free quotas/credits, research/startup programs, spot/cheap compute and efficient adapter training before buying large dedicated training clusters.
- Never bypass provider limits, create abusive multi-account quota evasion, misrepresent eligibility, or violate model/dataset/service terms to obtain free compute.
- A paid experiment is allowed only when its expected information value or capability gain is justified against the current baseline and the experiment has a defined stop condition.
- ZUVYR-owned model usage remains subject to the canonical BYOC economics already defined by the roadmap; paid external fallbacks keep their own explicit economics.

## 3. Mandatory rapid-improvement architecture

The following capabilities are now part of V1 Model Factory/Evals scope. They may be implemented in the owning Pack below rather than as new Pack numbers.

### MF-01 — Candidate Model Factory
Every candidate open-weight/self-hostable model or material new checkpoint must pass a reproducible intake gate: identity/hash, license/terms, tokenizer/template/tool schema, context/modality, serving compatibility, VRAM/compute profile, benchmark suite, safety checks and rollback eligibility. Popularity alone is not a promotion criterion.

### MF-02 — Teacher Council
Where rights and provider/model terms permit, difficult examples may be solved by multiple teacher models. A verifier compares disagreements, executable outcomes and evidence. No teacher output automatically becomes training truth.

### MF-03 — Specialist Experts
Support low-cost specialist LoRA/QLoRA/adapters or equivalent experts for at least the applicable capabilities: Code, Reasoning/Planning, Research, Tool Use, Agent/Browser/Computer Control, Vision/Multimodal and Manager/Operator. Specialist evidence must show an improvement on its target eval set without unacceptable global regression.

### MF-04 — ZUVYR Experience Dataset
Create a privacy/rights-aware trajectory format able to represent:
`request -> resolved context -> plan -> tool/model actions -> observations -> failure/correction -> verification -> final outcome`.
Positive outcomes, hard negatives and repair trajectories remain distinguishable.

### MF-05 — Verifier-First Learning
Prefer objective/verifiable reward signals when available: tests, compiler/build, schema validation, browser state, DB assertions, tool receipts, artifact validity, citations/source support, task completion and rollback correctness. Natural-language judging alone is insufficient where an executable verifier exists.

### MF-06 — Agent Training Sandboxes
Agent/code/browser learning experiments run in isolated, resettable environments with bounded authority, network/tool policy, deterministic fixtures where practical and machine-checkable terminal conditions. Training sandboxes never inherit production secrets or unrestricted production authority.

### MF-07 — Automatic Curriculum
Maintain difficulty-tagged tasks from simple to adversarial. Advancement is driven by measured mastery and recurring failure clusters, not a fixed one-time training set.

### MF-08 — Active Learning
Prioritize labeling/teacher/compute budget toward high-uncertainty, high-value, high-frequency or disagreement-heavy examples instead of repeatedly training on already-solved easy cases.

### MF-09 — Test-Time Intelligence
For sufficiently difficult tasks, the Router/Brain may allocate extra inference to multiple plans/candidates, tool-assisted verification, reflection/replanning or verifier selection within explicit latency/cost budgets. Easy tasks must not pay this cost by default.

### MF-10 — Versioned Skills Outside Weights
Reusable workflows/skills remain versioned artifacts outside model weights where that is faster and safer than retraining. Skills have identity, permissions, schemas, tests, provenance and compatibility gates.

### MF-11 — Repository/Project Intelligence Memory
Coding/agent tasks may use owner-authorized external project memory/indexes for architecture, symbols, dependencies, conventions, prior verified fixes and test history instead of forcing all knowledge into model parameters or every prompt.

### MF-12 — Continuous Distillation
Support teacher/expert -> Core and Core -> smaller-model distillation where rights permit and evals prove value. Distillation datasets and teacher identities remain traceable.

### MF-13 — Anti-Forgetting Regression
Every training/prompt/template/tokenizer/tool-schema/model change must run regression suites for previously verified capabilities. A gain in one skill cannot silently destroy another and still be promoted.

### MF-14 — Efficient Fine-Tuning First
Default order before full fine-tuning/pretraining: prompting/context/skills -> retrieval/tool improvements -> LoRA/QLoRA/adapters -> targeted distillation -> broader fine-tuning. Full-model training requires evidence that cheaper interventions cannot close the measured gap.

### MF-15 — Inference Engineering
Qualify applicable quantization, continuous/dynamic batching, prefix caching, KV-cache policy, model loading/offloading and speculative decoding or equivalent techniques. Optimization is accepted only when quality/security/privacy regressions remain within defined gates.

### MF-16 — Compute Opportunity Scheduler
Maintain a scheduler/inventory for legitimately available local/BYOC/free-credit/spot/cheap training and eval resources. Jobs declare required hardware, estimated duration/cost, checkpointing and fallback. No experiment assumes a free quota will always exist.

### MF-17 — Opportunity Scanner
Track new relevant open-weight models, datasets, inference/training techniques, research releases, grants/programs and compute credits. Each opportunity becomes a candidate record and must pass rights, reproducibility and eval gates before affecting production.

### MF-18 — Capability Harvesting
Do not remove a useful external model merely because an owned model exists. Keep verified external specialists as temporary teacher/fallback/challenger targets while ZUVYR closes the capability gap. Any transfer/distillation/training use must be permitted by the applicable rights and terms.

### MF-19 — Dynamic Compute Budget
Route by task difficulty and consequence. Small/cheap models handle classification, extraction and easy chat; stronger owned/external models and multi-candidate inference are reserved for harder tasks. Budget policy is measurable and fails closed on unknown paid cost.

### MF-20 — Real-World ZUVYR Benchmarks
Maintain versioned tasks that reflect actual ZUVYR outcomes, including Chat/Research, planning, coding/repository repair, tool selection, browser/device work, files/docs, images/video/audio where applicable, multimodal understanding/generation orchestration, long tasks, interruption/recovery and cross-surface execution. Public benchmarks are supplemental, not sufficient.

### MF-21 — Champion/Challenger Promotion
Production keeps a known Champion. New checkpoints/router policies/templates/skills are Challengers and move through LAB -> EVAL -> SHADOW -> CANARY -> SECONDARY/PRIMARY only after statistical and safety gates. Rollback is always known.

### MF-22 — Model Genealogy
Every checkpoint/adaptor/merged model records base model, exact hashes, tokenizer/template, training code/environment, dataset versions, teacher set, hyperparameters, licenses, eval suite/results, compute used, serving requirements and parent/child lineage.

### MF-23 — Automatic Failure Mining
Classify verified failures into the layer most likely responsible: knowledge/retrieval, context, planning, reasoning, tool schema/selection, execution, code, modality, provider, latency/capacity, safety/policy, permissions, billing or UX. Do not fine-tune weights when the defect is demonstrably elsewhere.

### MF-24 — Self-Improvement Flywheel
The canonical loop is:
`real task -> privacy/rights eligibility -> verified success/failure trajectory -> failure mining -> candidate dataset -> specialist/teacher/training intervention -> independent eval -> challenger -> shadow/canary -> measured production outcome -> next iteration`.
Promotion is never automatic merely because training completed.

## 4. Pack integration — no PACK151 required

### PACK131 — Learning consent, revocation and training eligibility terminal states
Extend the original audit so revocation/exclusion propagates to future dataset admission, teacher queues, synthetic derivatives where provenance permits, cached training candidates, eval subsets derived from opted-in content and pending training jobs. Training permission remains separate from Memory permission.

**Must prove:** a revoked user/item cannot re-enter a future training candidate through retry, cache, derived trace or queue replay.

### PACK132 — Experience Dataset, lineage, contamination and Failure Mining
Own MF-04, MF-22 and MF-23 foundations. Add canonical trajectory schema, dataset fingerprints, provenance/rights fields, dedupe/near-duplicate controls, contamination checks, hard-negative/repair labels, failure taxonomy, active-learning candidate metadata and reproducible dataset manifests.

**Must prove:** an exact training/eval example can be traced back to eligibility/provenance without exposing unrelated private content, and a contaminated/revoked item can be excluded deterministically.

### PACK133 — Teacher Council, verifier disagreement and legal Capability Harvesting
Own MF-02 and MF-18. Replace any single-teacher assumption with a teacher registry/council where permitted; record teacher model/version/terms, task eligibility, disagreement, verifier evidence and rejected candidates. External teachers/fallbacks remain available when they are materially better and legally usable.

**Must prove:** conflicting teachers do not silently become truth; restricted teacher outputs cannot enter prohibited training/distillation paths.

### PACK134 — ZUVYR Evals Factory, real-world benchmarks, curriculum and active learning
Own MF-07, MF-08, MF-17 and MF-20. Expand the existing KPI/eval scope into a versioned Evals Factory covering representative user outcomes, multilingual/Darija/Arabic/French/English, planning, coding, tool calls, agents, retrieval, multimodal tasks, generation orchestration, uncertainty and cost per successful task. Add automatic curriculum generation from verified failures and an Opportunity Scanner intake benchmark harness.

**Must prove:** promotion thresholds use fixed/versioned eval definitions, denominators and minimum sample rules; candidate opportunities cannot skip baseline comparison.

### PACK135 — Efficient serving, Dynamic Compute and legitimate cheap-compute scheduling
Own MF-15, MF-16 and MF-19. Qualify quantization/caching/batching/speculative or equivalent serving improvements; add task-difficulty/consequence compute budgets and a compute-opportunity scheduler for local/BYOC/free-credit/spot/cheap resources with checkpoint/resume and spend ceilings.

**Must prove:** easy tasks avoid unnecessarily expensive inference; unknown paid cost fails closed; optimization does not silently cross quality/privacy/safety thresholds.

### PACK136 — Champion/Challenger, anti-forgetting, quarantine and rollback
Own MF-13 and MF-21. Expand owned-model rollback into full model/router/template/skill Challenger promotion, regression protection, emergency quarantine, known Champion fallback and statistically valid rollback triggers.

**Must prove:** an intentionally regressive challenger cannot become Primary, and a bad Primary/candidate can be removed without losing the last known-good model path.

### PACK137 — Training Factory: specialist experts, sandboxes, verifiers and distillation
Own MF-03, MF-05, MF-06, MF-12 and MF-14. Build the low-cost training path: specialist adapters/LoRA/QLoRA or equivalent, isolated agent/code/browser rollouts, executable verifiers, targeted distillation and independent post-train eval. Prefer the cheapest intervention that closes the measured gap.

**Must prove:** at least one rights-approved failure cluster travels end-to-end through dataset -> targeted intervention -> independent eval -> challenger -> shadow/canary with measurable improvement and no unacceptable regression.

### PACK138 — Model family readiness, Test-Time Intelligence, Skills and project intelligence
Own MF-09, MF-10 and MF-11 plus the workload-replacement scorecard. Preserve the canonical owned family naming: `ZUVYR 7`, `ZUVYR 7 Code`, `ZUVYR 7 Manager`, `ZUVYR 7 Agent`, `ZUVYR 7 Vision`, `ZUVYR 7 Voice`; Mini/base/Prime or additional tiers are created only when evidence justifies them. Capabilities may share a base model plus adapters/configurations; they do not need to be separate foundation models.

Add versioned skills, repository/project intelligence memory and bounded test-time search/replanning. Score which external workloads can truthfully move to owned models and which still require fallback.

**Must prove:** routing chooses the correct owned specialist/skill/memory path for representative tasks and keeps a better external fallback when the owned path has not yet met the gate.

### PACK139 — Model Factory security and multi-tenant isolation closure
In addition to its original security scope, adversarially test training/eval/serving endpoints, teacher gateways, checkpoint storage, skill packages, model-visible tool output, prompt/template injection, tenant isolation, secret leakage, SSRF/egress and model/checkpoint exfiltration.

### PACK140 — Model/data privacy, deletion, export and retention closure
Verify hard-forget and retention propagation across experience datasets, active-learning queues, eval derivatives, embeddings/indexes, caches, checkpoints/adapters where technically and legally applicable, logs and future training admission. Document immutable historical aggregate evidence that may legally remain without recreating deleted content.

### PACK141 — Model Factory backup/restore and lineage recovery
Back up and restore the minimum critical model registry, dataset manifests, eval definitions/results, checkpoint metadata, skill registry, promotion state and rollback targets. Prove restored lineage still points to the correct hashes and rights metadata.

### PACK142 — Training/serving capacity and scheduler qualification
Load-test BYOC/inference registration, queues, model loading, batch limits, evaluation jobs, training job scheduling, cancellation, checkpoint resume, backpressure and resource admission. A large experiment cannot starve production control-plane work.

### PACK143 — Model/learning observability and incident readiness
Trace candidate intake -> data -> train/eval -> promotion -> serving outcome with privacy-safe identifiers. Define alerts/runbooks for drift, poisoned candidate spikes, repeated verifier failures, model-serving degradation, runaway compute, promotion lineage break and emergency quarantine.

### PACK144 — Client qualification for model-aware UX
Ensure web/desktop/mobile clients safely handle model/routing states where exposed: progress, fallback/degraded mode, cancellation, permission/approval, reconnect and result provenance without leaking internal secrets or making unsupported superiority claims.

### PACK145 — Model/tool/template/tokenizer compatibility closure
Treat tokenizer, chat template, system prompt contract, tool/MCP schemas, structured-output schemas, model files and serving APIs as versioned compatibility surfaces. Provider/model upgrades cannot bypass targeted eval and migration gates.

### PACK146 — Owned-model and fallback economics release qualification
Verify the public/product economics remain truthful: ZUVYR-owned model/API software fee and inference markup follow the canonical $0 BYOC contract; user/provider compute and paid external fallbacks are measured and shown separately where applicable. Dynamic Compute cannot hide paid fallback spend or cause duplicate settlement.

### PACK147 — ZUVYR Model Factory + Evals final release qualification
This is the hard model-release gate for MF-01..MF-24 and the existing AI/model EA requirements. It must reconcile:
- candidate-model intake and licenses;
- dataset/checkpoint/train-code hashes and lineage;
- teacher council rights/disagreement handling;
- specialist experts and distillation evidence;
- real-world/multilingual/multimodal/coding/planning/tool/agent evals;
- statistical thresholds and anti-forgetting;
- safety/privacy/security red-team results;
- serving cost/latency/capacity;
- Champion/Challenger history, rollback and quarantine;
- model/system cards, limitations and known failures;
- fallback equivalence and drift/change gates.

No checkpoint may be labelled production-ready merely because training completed or because it wins one benchmark.

### PACK148 — Full V1 acceptance rehearsal including the self-improvement path
The existing full rehearsal must include at least one non-destructive Model Factory path from candidate/opportunity or verified failure -> eval/data decision -> intervention or no-train decision -> challenger evaluation -> routing/shadow/canary decision -> rollback/fallback proof. If legitimately free/owned compute is available, exercise the cheap-compute path; lack of a free quota must not be hidden or faked.

### PACK149 — External/model-rights/claims reconciliation
Reconcile base-model/dataset/teacher licenses, external provider terms, compute-credit eligibility/terms, privacy/training disclosures, public model claims, support/docs and any claimed cost/superiority statement. Do not market “zero cost”, “best”, “frontier”, “private”, “self-hosted” or similar claims beyond evidence and exact scope.

### PACK150 — Final V1 model/release seal
The exact release manifest must include the Model Factory amendment version plus the production model-family identities/hashes, tokenizer/templates, skill versions, eval suite/version/results, dataset/checkpoint lineage references, serving/runtime policy, Champion/rollback targets and applicable MF-01..MF-24 acceptance state. `V1_READY=true` remains forbidden while any applicable Model Factory/Evals obligation is unknown, partial, deferred or untested.

## 5. Mandatory release metrics

For each production candidate, use task-appropriate metrics, including where applicable:
- verified task success rate;
- first-pass success and repair success;
- planner necessary-step / unnecessary-step rate;
- tool selection + argument/schema correctness;
- coding build/test/task completion;
- citation/retrieval support quality;
- multimodal instruction/fidelity/artifact validity;
- agent termination and side-effect correctness;
- regression rate across previously verified skills;
- latency/time-to-success;
- compute and total cost per successful task;
- fallback frequency and reason;
- user intervention required;
- safety/privacy/security failures;
- calibration/abstention quality where relevant.

No single aggregate score is sufficient to hide a serious regression in a consequential capability.

## 6. No-opportunity-waste rule

When a new model, technique, dataset, skill, training method or compute opportunity appears, ZUVYR should record and evaluate it rather than ignore it. Evaluation does **not** mean automatic adoption. The canonical decision is:

`DISCOVER -> RIGHTS/TERMS -> REPRODUCE -> BASELINE EVAL -> COST/RESOURCE PROFILE -> SECURITY/PRIVACY -> CHALLENGER -> PROMOTE / KEEP AS SPECIALIST / REJECT / REVISIT LATER`.

This preserves useful opportunities while preventing hype-driven production changes.

## 7. Relationship to existing roadmap and EA matrix

- This amendment is **additive** to `docs/zuvyr/ROADMAP_150.md`.
- It does not renumber PACK001–PACK150.
- It does not change the active Pack or authorize skipping PACK089/other gates.
- Existing `EA-001..EA-292` requirements remain mandatory and take precedence where they are stricter.
- PACK131–PACK147 own implementation/qualification; PACK148–PACK150 own integrated/final acceptance.
- Existing PACK094–PACK096 Learning Pipeline / Model Lab / first owned-model loop remain foundations; this amendment industrializes and hardens the later V1 improvement loop without reopening those Packs merely for documentation.

## 8. Definition of Done for this amendment

This amendment is satisfied only when:

```text
MF_01_THROUGH_MF_24 = PASS_OR_TRUE_NA_WITH_EVIDENCE
AND PACK131_THROUGH_PACK147_MODEL_FACTORY_SCOPE = VERIFIED
AND PACK148_INTEGRATED_REHEARSAL = PASS
AND PACK149_EXTERNAL_RIGHTS_AND_CLAIMS = PASS
AND PACK150_RELEASE_MANIFEST_INCLUDES_MODEL_FACTORY = PASS
AND NO_APPLICABLE_MODEL_FACTORY_GAP_IS_HIDDEN_OR_DEFERRED
```

A document, registry row, training script or successful checkpoint alone is not completion. Production claims require evidence-backed evaluation, safe promotion, rollback and truthful user-facing behavior.
