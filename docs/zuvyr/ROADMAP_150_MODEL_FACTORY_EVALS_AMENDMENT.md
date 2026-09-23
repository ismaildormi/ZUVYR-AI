# ZUVYR ROADMAP 150 — MODEL FACTORY + EVALS AMENDMENT

Status: ADDITIVE PLANNING AMENDMENT
Date: 2026-09-23
Scope: remaining ROADMAP_150 work only
Renumbering: NONE
New PACKs after PACK150: NONE required by this amendment
Runtime status: this document does not advance or lock the currently active main PACK.

## 1. Purpose

Integrate ZUVYR owned-model development, ZUVYR Evals, Model Factory/Forge, experience-data learning, specialist training, distillation, low-cost compute, inference optimization, and continuous improvement into the existing 150-PACK completion plan instead of postponing the work until after PACK150.

This amendment is additive. It must preserve existing PACK dependency order, existing completed/LOCKED_VERIFIED work, Universal Cloud Browser timing, production safety rules, privacy, billing gates, and all existing acceptance requirements.

The objective is not merely to train a model called ZUVYR. The objective is to build a measurable AI system that can continuously convert verified product experience and new external opportunities into better ZUVYR capabilities with minimal compute and without sacrificing existing capabilities.

## 2. Non-negotiable principles

1. Do not reopen or renumber a completed PACK.
2. Do not advance the active PACK because this planning amendment exists.
3. PACK131–147 are the primary owned-model / MLOps / learning zone.
4. PACK148–150 remain rehearsal, release-candidate and final release gates, now including the model-factory evidence defined here.
5. PACK090–130 may only add lightweight learning/evaluation hooks when naturally touching the relevant surface; they must not implement later capabilities early or disturb existing dependencies.
6. Deterministic verification is preferred over model-as-judge whenever deterministic proof is possible.
7. Training is never accepted as improvement without before/after Evals.
8. Cheapest proven method first: prompt/skill/context/router improvement -> retrieval/tool improvement -> adapter/LoRA/QLoRA -> distillation -> heavier training only when evidence justifies it.
9. No user/private production content becomes training data without the applicable privacy/consent/data-governance basis.
10. Every model, dataset, adapter and checkpoint must have provenance, license/usage eligibility and reproducible lineage.
11. No candidate replaces the Champion unless it passes quality, regression, safety, latency and cost gates.
12. External models remain available as teachers/fallbacks where useful; ZUVYR reduces dependence only when its own measured quality supports doing so.

## 3. Target architecture

```text
ZUVYR Product Surfaces
  Chat / Research / Code / Images / Video / Browser / IP / Voice / Docs / Agents
                         |
                         v
                Experience Event Layer
        (consent/privacy scoped + redaction + lineage)
                         |
          +--------------+--------------+
          |                             |
          v                             v
    Failure Miner                 Eval Case Builder
          |                             |
          v                             v
    Dataset Builder <-------> ZUVYR Eval Registry
          |                             |
          v                             v
 Teacher Council / Synthetic     Eval Execution Harness
      Data + Filtering                 |
          |                     Verifier Farm
          v                             |
 Auto Curriculum + Active Learning     v
          |                        Scorecards
          v                             |
 Trainer / Expert Lab                   |
 SFT / LoRA / QLoRA / RL when justified|
          |                             |
          v                             |
 Model / Adapter Artifact Registry <----+
          |
          v
 Distillation + Anti-forgetting
          |
          v
 Quantization / Serving Build
          |
          v
 Promotion Controller
 Champion <-> Challenger <-> Canary
          |
          v
 Router / Production Serving
          |
          +-----------> telemetry / failures / verified outcomes -> loop
```

Control-plane responsibilities:
- model registry and genealogy;
- dataset/version registry;
- training/eval run scheduler;
- compute broker;
- policy/license/privacy gates;
- artifact/checkpoint registry;
- promotion/rollback controller;
- evidence receipts.

Existing ZUVYR infrastructure should be reused where appropriate: Supabase for authoritative metadata/lineage, existing workers/queues for orchestration, object storage for versioned artifacts where suitable, and on-demand GPU compute only for jobs that actually require it.

## 4. ZUVYR Evals architecture

### 4.1 Eval Registry
Each eval case must record at minimum:
- stable case ID and suite/version;
- capability and product surface;
- difficulty;
- source/provenance and allowed usage;
- required tools/environment;
- expected verifier;
- safety/privacy class;
- timeout/budget;
- holdout/training-contamination policy.

### 4.2 Core suites
- ZUVYR-ReasonBench
- ZUVYR-CodeBench
- ZUVYR-PlanBench
- ZUVYR-ToolBench
- ZUVYR-AgentBench
- ZUVYR-BrowserBench
- ZUVYR-VisionBench
- ZUVYR-MemoryBench
- ZUVYR-RAGBench
- ZUVYR-MultimodalBench
- ZUVYR-SafetyBench
- ZUVYR-CostLatencyBench
- ZUVYR-RegressionBench
- ZUVYR-EndToEndBench

### 4.3 Verifier hierarchy
Prefer, in order:
1. exact/schema/state verification;
2. compiler/build/unit/integration tests;
3. browser/DOM/network assertions;
4. database/storage assertions;
5. tool-result and external-state verification;
6. reference-based rubric;
7. multi-judge/model-judge only when deterministic verification is unavailable;
8. human review for unresolved high-value edge cases.

### 4.4 Mandatory scorecard
Every candidate should expose where applicable:
- task success rate;
- correctness/verifier pass rate;
- tool-call success;
- planning success;
- retry count;
- unsupported/hallucinated claim rate;
- human-intervention rate;
- safety violations;
- latency p50/p95;
- token usage;
- inference/training compute usage;
- monetary cost when non-zero;
- regressions versus current Champion.

### 4.5 Holdout discipline
Maintain private holdout sets that are never used for training, synthetic generation prompts or curriculum construction. Version public/dev/train/private partitions separately and detect likely contamination/duplication.

## 5. ZUVYR Model Factory / Forge architecture

### 5.1 Opportunity Scanner
Track potentially useful:
- open-weight model releases;
- datasets with compatible licensing;
- inference/training techniques;
- agent environments;
- free/low-cost compute and credits;
- serving runtimes;
- quantization/distillation methods.

Nothing is promoted because it is new. Each opportunity enters the same intake -> eligibility -> benchmark -> cost -> integration decision path.

### 5.2 Model Intake + Genealogy
For every model/checkpoint/adapter record:
- source and exact version/hash;
- license and allowed use;
- architecture/context/tool/vision capabilities;
- parent/base model;
- training dataset versions;
- training recipe and seed/config where applicable;
- hardware/runtime;
- artifact hashes;
- Evals results;
- promotion history.

### 5.3 Experience/Data Engine
Capture verified task trajectories, subject to privacy/consent policy:
request -> plan -> tool calls -> observations -> failures -> repairs -> verification -> final outcome.

Pipeline requirements:
- redaction/privacy classification;
- deduplication;
- quality filtering;
- provenance;
- versioning;
- success and hard-negative examples;
- train/dev/holdout separation;
- deletion/retention enforcement.

### 5.4 Teacher Council
Use multiple eligible teachers rather than one permanent teacher. Specialists may contribute coding, reasoning, tool use, planning, vision or agent trajectories. Teacher outputs are not accepted directly: they must pass policy, provenance, deduplication and verifier filters before becoming candidate training data.

### 5.5 Active Learning + Automatic Curriculum
Prioritize examples where:
- ZUVYR fails;
- confidence is low;
- candidate models disagree;
- repeated retries occur;
- user intervention is needed;
- capability regression is detected.

Difficulty should progress from simple -> medium -> hard -> adversarial once mastery thresholds are achieved.

### 5.6 Specialist Expert Lab
Maintain narrow experts/adapters before forcing every capability into one large model:
- Code Expert
- Reasoning Expert
- Planning Expert
- Tool Expert
- Agent Expert
- Research Expert
- Vision/Multimodal Expert

Only merge/distill capabilities when Evals show retention.

### 5.7 Cheap-training hierarchy
Default order:
1. no-training solution (router/prompt/context/skill/tool/RAG fix);
2. SFT on small high-quality data;
3. LoRA/QLoRA/adapters;
4. preference optimization if the failure mode requires it;
5. environment/reward-based training for verifiable agent/code tasks;
6. heavier/full fine-tuning only with explicit evidence that lighter methods cannot reach the target.

### 5.8 Distillation and anti-forgetting
Use verified teacher/specialist trajectories to teach ZUVYR Core and smaller ZUVYR Nano variants. Every distillation/fine-tune run must replay regression suites and capability-retention sets before promotion.

### 5.9 Agent training sandboxes
Use isolated, reproducible environments for coding/browser/tool tasks. A rollout is rewarded from actual end state/tests whenever possible, not merely from a textual judge opinion.

### 5.10 Compute broker
Schedule GPU work only when necessary. Prefer available no/low-cost eligible compute for non-sensitive experiments, then low-cost on-demand/spot capacity, then reserved/dedicated capacity only when utilization makes it economically rational. Track compute per successful improvement, not just total GPU hours.

### 5.11 Inference optimization
Benchmark before/after for:
- quantization;
- batching;
- prefix/prompt caching;
- KV-cache strategy;
- speculative decoding when supported and measurably beneficial;
- dynamic routing and dynamic test-time compute.

A cheaper configuration is accepted only if capability and safety gates remain satisfied.

## 6. Learning hooks overlay for PACK090–130

Purpose: begin accumulating useful verified evidence before the main model-lab PACKs without implementing owned-model training early.

When a PACK in 090–130 naturally creates or modifies a capability, add only the applicable lightweight hooks:
- derive at least one reusable real-world eval case from its acceptance criteria;
- emit normalized outcome/verification/failure metadata if an existing telemetry path exists or the PACK already owns that path;
- preserve a deterministic verifier when available;
- label capability/surface/tool dependencies;
- preserve privacy and no-training defaults.

Do NOT in this overlay:
- start GPU training;
- replace production providers;
- implement future browser/computer-control capability ahead of its assigned PACK;
- create paid live traffic solely to collect data;
- expand a PACK beyond its dependency-safe acceptance scope.

The hooks are dormant inputs for PACK131+ until the Evals/Data infrastructure is activated.

## 7. Executable PACK131–150 mapping

### PACK131 — Model/Eval Governance + Registry Foundation
Deliver:
- model/dataset/adapter/checkpoint genealogy schema;
- eval-suite/eval-case/run/result schemas;
- provenance/license/privacy rules;
- current Champion baseline snapshot;
- immutable run/evidence identity.
Exit gate: one reproducible baseline model evaluation can be registered end-to-end.

### PACK132 — Evals Harness + Deterministic Verifier Farm
Deliver:
- sandboxed eval runner;
- deterministic verifier interfaces;
- scorecard aggregation;
- reproducible budgets/timeouts/environment identity;
- CI-compatible regression execution.
Exit gate: same candidate/run definition reproduces materially identical deterministic results.

### PACK133 — Real-World Benchmark + Private Holdout
Deliver:
- core benchmark suites for Reason/Code/Plan/Tool/Agent and already-available ZUVYR surfaces;
- private holdout policy/storage;
- contamination/dedup checks;
- baseline scorecard for Champion and selected challengers.
Exit gate: improvement can be measured against a frozen baseline without training-set leakage.

### PACK134 — Model Factory Control Plane + Opportunity Intake
Deliver:
- opportunity intake;
- eligibility/license gate;
- model intake and normalized capability metadata;
- experiment queue;
- artifact/run genealogy;
- reject/defer/promote-to-experiment decisions.
Exit gate: a new eligible model can move from intake to isolated benchmark without manual ad-hoc wiring.

### PACK135 — Experience/Data Engine
Deliver:
- normalized task trajectory format;
- privacy/consent/redaction gates;
- dedup/quality/provenance pipeline;
- success/hard-negative extraction;
- dataset versioning and retention/deletion handling.
Exit gate: verified trajectories can become a reproducible dataset version without violating no-training defaults.

### PACK136 — Teacher Council + Synthetic/Active Curriculum
Deliver:
- multi-teacher orchestration;
- verifier filtering;
- disagreement/uncertainty sampling;
- active-learning queue;
- automatic curriculum generation;
- synthetic-data provenance.
Exit gate: accepted synthetic/corrected examples are traceable to teachers, verifiers and source eligibility.

### PACK137 — Low-Cost Training Pipeline
Deliver:
- reproducible SFT + LoRA/QLoRA pipeline;
- checkpoint/artifact hashing;
- training telemetry;
- interruption/resume where supported;
- compute-budget receipts;
- automatic post-training eval trigger.
Exit gate: one small ZUVYR adapter can be trained, reproduced and evaluated end-to-end.

### PACK138 — Specialist Expert Lab
Deliver and evaluate separate experts/adapters for the most valuable current gaps, prioritizing:
- Code;
- Reasoning;
- Planning;
- Tool use;
- Agent behavior.
Vision/Research specialists enter only when their dependencies are ready.
Exit gate: each promoted expert beats its own frozen baseline without unacceptable global regression.

### PACK139 — ZUVYR Model V1 / Core Prototype
Deliver:
- owned ZUVYR Core candidate;
- native structured output/tool-call behavior;
- router registration behind controlled flag;
- external-model fallback preserved;
- full eval scorecard.
Exit gate: Core can execute selected ZUVYR tasks through real tool contracts and fall back safely.

### PACK140 — Agent Training Sandboxes + Self-Correction
Deliver:
- reproducible coding/tool/browser-capable environments according to dependencies available by this PACK;
- environment-result rewards/verifiers;
- failure classification;
- retry-strategy evaluation;
- self-correction curriculum.
Exit gate: candidate improves verified task completion, not just textual preference scores.

### PACK141 — Distillation + Anti-Forgetting
Deliver:
- Teacher/Expert -> Core distillation path;
- Core -> Nano path where justified;
- retention dataset;
- regression replay;
- capability-loss alarms.
Exit gate: distilled candidate preserves required capabilities while meeting its size/cost objective.

### PACK142 — Serving / Quantization / Cost Optimization
Deliver:
- serving benchmark matrix;
- accepted quantization configurations;
- batching/cache optimizations;
- speculative decoding only if supported and benchmark-positive;
- p50/p95 latency + throughput + cost receipts.
Exit gate: no serving optimization ships by sacrificing mandatory quality/safety gates.

### PACK143 — Context, Memory, RAG and Skill Intelligence
Deliver:
- context selection evaluation;
- project/repository memory retrieval;
- skill retrieval/versioning;
- RAG quality + citation/support verification;
- context-budget optimization.
Exit gate: ZUVYR beats baseline on long/project-specific tasks at equal or lower effective context cost.

### PACK144 — Test-Time Intelligence + Multi-Agent Orchestration
Deliver:
- dynamic compute budget;
- single-pass vs multi-sample vs verifier vs multi-agent policy;
- Manager/Specialist orchestration;
- stopping criteria;
- cost-quality frontier evaluation.
Exit gate: additional inference is used only where measured expected quality justifies it.

### PACK145 — Champion/Challenger + Canary Promotion
Deliver:
- promotion policy;
- shadow/challenger evaluation;
- safe canary controls;
- rollback;
- live-quality telemetry using privacy-safe metadata;
- no automatic live-billing expansion.
Exit gate: a candidate can be promoted and rolled back with evidence and without breaking fallback.

### PACK146 — Continuous Learning + Failure Mining Flywheel
Deliver:
- automatic failure clustering;
- recurring hard-case extraction;
- targeted eval generation;
- candidate dataset generation;
- opportunity-scanner scheduling;
- retraining proposal generation.
Exit gate: production evidence can produce a reviewable improvement proposal without silently training/deploying a model.

### PACK147 — Owned Model Maturity Gate
Deliver:
- final family decision for production-ready ZUVYR variants (for example Core/Nano/Code/Agent only when each is actually justified by evidence);
- complete benchmark comparison to the current Champion/fallback configuration;
- license/provenance/data dossier;
- reproducibility dossier;
- quality/cost/latency/safety report;
- unresolved capability gaps and explicit fallback rules.
Exit gate: only evidence-backed production-ready variants continue to release rehearsal.

### PACK148 — Full Model-Factory Rehearsal + Recovery
Rehearse:
- intake -> dataset -> train -> eval -> artifact -> promotion -> rollback;
- lost/interrupted job recovery;
- artifact/checkpoint restore;
- registry/evidence reconstruction;
- provider fallback during owned-model failure.
Exit gate: rehearsal receipts prove recovery and rollback paths.

### PACK149 — Release Candidate Adversarial + Regression Gate
Run full end-to-end candidate against:
- all applicable ZUVYR capability suites;
- security/safety/privacy cases;
- billing/accounting invariants where applicable;
- model/tool/router failures;
- long-running agent tasks;
- adversarial and previously mined hard cases;
- full regression baseline.
Exit gate: release candidate has no unresolved release-blocking regression.

### PACK150 — Final ZUVYR V1 Release Lock
Add to the existing final release gate:
- all applicable model/eval amendment requirements PASS or N/A_WITH_EVIDENCE;
- exact model/checkpoint/adapter identities locked;
- exact dataset/eval versions locked;
- final Champion/fallback routing policy locked;
- rollback and recovery verified;
- final cost/latency/quality/safety scorecard archived;
- evidence pack reproducible from canonical receipts.

PACK150 must not claim that ZUVYR is universally better than every external model. It may claim only the capability improvements demonstrated by the frozen evaluation evidence.

## 8. Model family target

The factory may eventually produce:
- ZUVYR Nano — cheap routing/simple tasks;
- ZUVYR Core — general product model;
- ZUVYR Reason — deep reasoning configuration/model when justified;
- ZUVYR Code — software-engineering specialist;
- ZUVYR Agent — tool/browser/computer-task specialist;
- ZUVYR Vision/Multimodal — when dependencies/data/evals justify it;
- ZUVYR Live — voice/realtime path when the corresponding product capabilities are ready.

These names are product targets, not a requirement to train seven unrelated foundation models. Multiple variants may share a base model, adapters, routing or distilled checkpoints.

## 9. Near-zero-cost strategy

The optimization target is minimal cost per verified capability improvement, not literally zero compute.

Order of leverage:
1. better task decomposition/router;
2. deterministic tools/skills;
3. better context/RAG/memory;
4. verified experience data;
5. active learning instead of bulk data;
6. small specialist adapters;
7. distillation;
8. quantization/serving optimization;
9. test-time compute only on hard tasks;
10. heavier training only after an eval-backed bottleneck proves it necessary.

Track:
- compute hours per experiment;
- cost per accepted training example;
- cost per benchmark point gained;
- inference cost per successful task;
- capability gain per parameter/adapter size;
- regressions introduced per release.

## 10. Automatic failure taxonomy

At minimum classify failures into:
- reasoning;
- planning;
- context/retrieval;
- tool selection;
- tool arguments/schema;
- execution/environment;
- coding correctness;
- hallucination/unsupported claim;
- verifier weakness;
- safety/policy;
- latency/resource;
- router/model choice;
- stale memory;
- data gap.

The repair target must be the failing layer. Fine-tuning is not the default fix for router/tool/context bugs.

## 11. Champion / Challenger promotion contract

A Challenger cannot become Champion unless:
- required suites pass;
- no release-blocking regression exists;
- safety/privacy gates pass;
- deterministic failures are understood;
- latency/resource limits are acceptable;
- fallback is tested;
- exact artifact identity is recorded;
- rollback is tested;
- evidence is reproducible.

## 12. Completion definition for this amendment

This amendment is complete only when, by the PACK150 final gate:
- ZUVYR has a functioning Eval Registry, harness and verifier system;
- Model Factory can intake, train/adapter or otherwise improve, evaluate and register candidates reproducibly;
- Experience/Data Engine is privacy-governed and versioned;
- at least one owned/adapted ZUVYR candidate has passed a real end-to-end train/eval/promotion rehearsal, or is explicitly N/A_WITH_EVIDENCE if a stronger no-training architecture is proven for the release;
- failure mining and continuous-learning proposal generation work without silently modifying production;
- Champion/Challenger/fallback/rollback paths are verified;
- all model-related release claims are evidence-backed.

## 13. Execution rule

The immediate active PACK remains whichever PACK is current in the newest verified project state. This amendment changes the future acceptance scope only. Continue the existing ROADMAP_150 dependency order and do not jump directly to PACK131.
