# ZUVYR — Research & Development Brief
Date: 2026-10-23
Baseline main: 0aa8a37547c2171848f44189443b5272f9b40d52
Status: RESEARCH_RECORDED_NOT_IMPLEMENTED
Scope: Manager/Operator, tool-using agents, evaluation, cost/quality/latency routing, open-weight customization.

> This is a research record only. It does not advance or lock any PACK, change production code, change billing, or authorize training compute. All five works are arXiv preprints; peer-reviewed publication status was not verified.

## Priority 1 — RouterWorld: Scaling Conversational AI with Latency-Aware LLM Routing
- Authors: Jinyang Li et al.; submitted 2026-10-19.
- Primary source: https://arxiv.org/abs/2610.26511
- New finding: the benchmark combines 371k single-turn responses and 76k multi-turn agentic trajectories, with hardware-grounded latency annotations. It evaluates 13 routing baselines under full and partial observability, including settings where the router only sees the result from the model it selected.
- Published result: the authors report that many routers over-optimize answer accuracy and underweight latency when feedback is partially observed.
- Limits: preprint; text-only/open-weight candidate setup; latency measurements are hardware-specific; correctness includes model-based judging; no official code repository URL was resolved from the paper page during this audit even though the abstract says code/data are public.
- ZUVYR mapping: Model Factory/Evals MF-15 (inference engineering), MF-20 (real-world benchmarks), MF-21 (Champion/Challenger); future routing/serving work in PACK131–147. Do not train a router before a measured baseline exists.
- Small experiment: replay 50 synthetic multi-step tasks against the current routing baseline and at least two available candidate routes. Log task success, p50/p95 latency, actual/estimated cost, retry count and fallback outcome. Keep unchosen-model outcomes hidden in the online-policy simulation; use counterfactuals only in the offline evaluation set.
- Baseline: current router on the same fixed task set.
- Acceptance: no statistically meaningful drop in task success; improve cost per successful task or p95 latency by a pre-registered target (suggested initial target: 10%, subject to sample-size limits); report uncertainty and every fallback.
- Cost: evaluation-only, no training required. Do not infer provider prices; use verified prices only.

## Priority 2 — ReuF2F: Benchmarking Coding Agents on Formalized Undergraduate Research Problems
- Authors: Zeyu Zheng et al.; submitted 2026-10-19.
- Paper: https://arxiv.org/abs/2610.27046
- Official code/data: https://github.com/cmu-l3/reuF2F
- New finding: 244 undergraduate-research problems are formalized in Lean. The benchmark runs coding agents in Docker and accepts machine-checkable proof or refutation patches. The best-performing model in the paper resolves only about 40% of the tasks.
- Limits: formal mathematics is a narrow domain, not a proxy for all browser or product tasks. The official repository says its shared Docker image is about 15 GB and recommends at least 60 GB free disk; it runs untrusted Lean code, so use a disposable sandbox without credentials. Repository license: MIT.
- ZUVYR mapping: MF-05 (verifier-first learning), MF-20 (real-world benchmarks), PACK095 evaluation/Model Lab when its gate is legal.
- Small experiment: build 20 synthetic ZUVYR tasks with explicit postconditions and known expected outcomes. Run the current verifier twice on each final state, plus deliberately wrong outcomes.
- Baseline: current acceptance logic, unchanged.
- Acceptance: zero false accepts in the fixed negative set, repeatable verdicts on identical state, and no evaluator mutation of the state being evaluated. Track false rejects separately.
- Practical adaptation: use executable assertions/state invariants for product tasks; do not require Lean or a GPU for the first ZUVYR test.

## Priority 3 — SAPD: Learning from Agent Experience without Environment Interaction
- Authors: Juncheng Diao et al.; submitted 2026-10-20.
- Primary source: https://arxiv.org/abs/2610.27847
- New finding: Step-Advantage Policy Distillation decomposes recorded multi-turn agent trajectories into decision contexts and uses relative step advantages, aiming to reuse offline experience without new environment observations or multi-turn interactions.
- Published result: on ALFWorld, WebShop and Search-based QA, the authors report improved performance and reduced forgetting relative to SFT; training steps were at least 4.7x faster than online OPD in the evaluated setup.
- Limits: code was described as forthcoming at the time checked; the reported speedup is per training step, not total project cost or end-to-end wall time. The environments and models differ from ZUVYR.
- ZUVYR mapping: PACK132 dataset lineage/failure mining, MF-12 continuous distillation, MF-13 anti-forgetting regression, MF-23 automatic failure mining; eventual model release remains subject to PACK147 gates.
- Preparation experiment: create a schema-only design for 50–100 synthetic, replayable tool trajectories with step-level action, observation, failure category, correction and deterministic final outcome. Do not include private production content unless rights, consent, redaction and revocation are proven.
- Baseline: current candidate trajectory format and reproducibility rate.
- Acceptance before any training: every included trajectory is replayable or has a documented reason it cannot be replayed; source/license/consent and dataset lineage are traceable; a separate holdout exists. After code becomes available, compare task success and regression on a held-out set, not training loss alone.
- Status: research candidate only; no training or compute reservation.

## Priority 4 — Ask to Distill: Learning to Synthesize Data for On-Policy Distillation
- Authors: Jiashuo Sun et al.; submitted 2026-10-20.
- Paper: https://arxiv.org/abs/2610.27450
- Official code: https://github.com/GasolSun36/Ask_to_Distill
- Models/data collection: https://huggingface.co/collections/gasolsun/ask-to-distill-model-and-data-collection
- New finding: the method selects synthetic questions according to teacher/student disagreement weighted by whether the teacher's probability mass overlaps the student's candidate support. The authors report better average performance and teacher-gap recovery than unoptimized synthetic prompts and KL-filtered real questions across reasoning, code and agentic tasks.
- Limits and requirements: code is Apache-2.0, but vendored dependencies and downloaded datasets have separate licenses. The documented default uses CUDA 12.8, Python 3.12 and A100-80GB-class development; synthesizer training defaults to 2 nodes x 8 GPUs, OPD to one 8-GPU node, and evaluation to 1–2 GPUs. This is not a suitable first implementation for an independent developer without existing eligible compute.
- ZUVYR mapping: MF-08 active learning, MF-12 distillation, MF-14 efficient fine-tuning first, MF-22 model/data lineage; eventual PACK147 release qualification.
- Low-cost precursor: on an already eligible, synthetic-only set, compare 50 randomly selected prompts with 50 prompts selected by teacher/student disagreement. Measure verifier-pass rate on a held-out set, unique failure categories covered and tokens per useful example. This is a selection test, not a reproduction of the training method.
- Baseline: random or current prompt selection on the same synthetic task pool.
- Acceptance: improvement in held-out verifier-pass rate or failure-category coverage without data leakage or license ambiguity. Do not start GPU training or paid teacher calls without separate authorization.

## Priority 5 — Lost in Implicit Routing: How LLM Agents Fail to Load Relevant Skills at Scale
- Authors: Jinlin Liu, Wei Chen and Xiaojin Zhang; submitted 2026-10-13 (10 days before this brief; included because it has directly actionable skill-routing evidence and an official implementation).
- Paper: https://arxiv.org/abs/2610.18522
- Official implementation: https://github.com/jinlinll/lost-in-implicit-routing
- New finding: when 1,000 irrelevant skills are added while the relevant skill remains available, loaded-skill recall falls from 73.6% to 27.4%, and the zero-load rate rises from 9.3% to 51.6%. Explicit preselection from the same library retains 73.9% recall.
- Limits: benchmark uses SkillsBench and a third-party skill collection; the repository does not redistribute all skills because upstream licenses differ. Full reproduction uses Docker, an OpenAI-compatible API (Tencent TokenPlan in the paper) and Qwen text-embedding-v4 or a matching cache. Repository code license: MIT; third-party skills keep their own licenses.
- ZUVYR mapping: MF-10 (versioned skills outside weights), MF-20 (benchmarking), and PACK090 only if the fresh Universal Browser/Connections audit proves the gap belongs there. Do not implement this as a substitute for PACK090's legal audit.
- Small experiment: use 30 synthetic tasks and the current approved skill set. Evaluate at 0, 100 and 500 irrelevant metadata-only skills; compare current implicit selection with explicit preselection. Do not download or redistribute third-party skill content without checking licenses.
- Baseline: current skill selector on the same task/skill fixtures.
- Acceptance: maintain relevant-skill recall as the library grows; reduce zero-load rate; record selection latency and false selection. If preselection raises latency, report the trade-off instead of hiding it.

## Cross-paper engineering synthesis
1. Manager chooses the execution mode and narrows candidate skills before execution; Operator calls only authorized tools and returns raw evidence; Verifier checks task-specific postconditions without mutating the evaluated state.
2. Router decisions should optimize task success, total cost per successful task and p95 latency, not raw token price or accuracy alone.
3. Tool/skill failures should be classified and recorded as eligible non-content signals. Training content remains opt-in OFF by default; memory permission is not training permission.
4. No model, adapter or dataset is promoted without provenance/license checks, a held-out evaluation set, regression checks, and the required shadow/canary/rollback gates.

## Current ZUVYR execution reconciliation (no product change)
- Inspected main at 0aa8a37547c2171848f44189443b5272f9b40d52 (commit date 2026-10-12); repository is still ismaildormi/ZUVYR-AI.
- AGENTS.md and docs/AI_AGENT_CONTINUATION_RULES.md require continuity reconciliation before feature work. A separate installed “Rox AI Project Steward” skill was not present in the available skill list; the repository agent rules were read.
- Continuity conflict remains documented in open PR #135: the 2026-09-26 manifest/current-state capsule says PACK089 LOCKED_VERIFIED and PACK090 allowed, while the ROADMAP_150 model-first override says PACK094 → PACK095 → PACK096 before PACK084–PACK093. PACK094's latest receipt (2026-09-23) says authenticated owner acceptance is still pending and canonical LOCKED_VERIFIED is false. Do not guess or silently rewrite the active Pack.
- Open PRs #135–#140 were present; no PR was merged or modified by this run.
- CI: CodeQL passed on main; Secret History Gate failed on 2026-10-16 with 160 historical findings across 14 commits (154 generic-api-key matches, primarily old frontend Supabase anon-key-shaped literals; six Stripe test-token matches). The findings were not allowlisted because test-key validity/revocation and historical context have not been independently confirmed. Release Quality Gate on 2026-10-12 also failed. No secrets were printed.
- Vercel's latest production-target deployment for main commit 0aa8a375 was ERROR; the latest READY production deployment in the returned list was on older main 9a1527df. No production deployment was attempted.
- Supabase project tqoqsgaymygmqrzddvtu returned ACTIVE_HEALTHY; the read-only migration query showed latest recorded migrations dated 2026-09-26. Railway read-only environment tools required interactive confirmation and could not be verified in this non-interactive run.
- Static code review found a narrow PACK094 data-integrity candidate in backend/lib/learningPrivacy.js: sanitizeNonContentMetadata checks allowed keys with the JavaScript “in” operator, which accepts inherited properties. Proposed fix: use Object.prototype.hasOwnProperty.call(value, key) and add a regression test with Object.create({ usage_kind: ... }). This was NOT changed or tested because the mandatory active-Pack/continuity conflict and failing release/security gates remain unresolved, and no local test runner was available in this run.
- No production code, database, billing setting, provider credential or model weight was changed. LIVE_BILLING_ALLOWED remains false by policy; no paid training or provider call was made.

## Recommended next action
Resolve the PACK089/PACK090 versus PACK094–096 sequencing conflict through the existing continuity-reconciliation work and required validator; separately classify/rotate or document the historical Stripe test-key findings with evidence. Then apply the narrow metadata-sanitizer hardening with focused and regression tests before any PACK094 closure claim. The best first research experiment after the gate is the 20-task deterministic-verifier suite (two runs per state plus known-negative outcomes), because it requires no training compute and gives a measurable false-accept baseline.
