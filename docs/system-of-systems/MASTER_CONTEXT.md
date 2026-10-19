# Master Context — Complete System of Systems

Updated: 2026-10-12. This is a durable continuation guide, not a claim that every planned capability is implemented.

## 1. Mission
Maintain one navigable, evidence-based reference for all projects, products, subsystems, agents, tools, APIs, providers, interfaces, dependencies, execution packs, acceptance criteria, historical decisions, unresolved blockers, and future work. The user is a non-specialist developer and prefers direct execution, Arabic/Darija communication, and verifiable outcomes over speculative explanations.

## 2. Known project/system names
- **ZUVYR** — consumer AI platform/product; former name Rox AI appears in historical URLs/files and must be treated as historical, not silently erased.
- **ZEBRA V2** — named system/workstream; preserve exact original scope and identity from source files when those files become available.
- **SYSTEM X** — named architecture/platform/workstream, including REV5/A15 and related owner/investor/architecture dossiers.
- **Other projects/systems** — must be inventoried from actual connected repositories, uploaded files, and owner-provided links. Do not assume the three named systems are exhaustive. NOVA8 is known from separate project context but should be represented as a separate project, not merged into the AI platform. Other repositories are not yet confirmed in the connected GitHub inventory.

## 3. Authoritative source hierarchy
1. Current repository branch/commit, code, tests, CI and current service evidence where available.
2. Current accepted decision records and machine-readable config with provenance.
3. Pack evidence/receipts and deployment/build records.
4. Canonical roadmap and architecture documents.
5. Older PDFs, handoff notes, chats and historical plans.
6. UI mockups/showcase HTML: evidence of intended presentation only, never proof of working backend behavior.

When sources conflict, preserve both claims, cite the source/date/ref, and create a conflict record. Do not silently choose or rewrite history.

## 4. Core ZUVYR roadmap conventions
- Canonical current planning document: `docs/zuvyr/ROADMAP_150.md`.
- It enumerates PACK001–PACK150 and EA-001 onward (the visible external-audit overlay says PACK148–150 must reconcile every EA item; confirm exact end IDs by scanning the complete file).
- The roadmap itself says historical status is not newly verified and that PACK150 alone may declare final V1 readiness.
- A dated model-first priority override says PACK094 → PACK095 → PACK096 before PACK084–PACK093; then resume PACK084. This changes order, not numbering. Do not assume this is still the newest execution state until reconciling current receipts and main.
- Keep the historical 100-Pack plan distinct from the 150-Pack plan. The 100-Pack plan is retained as history, not substituted for the current roadmap.
- The source may mention PACK066 active (roadmap date 2026-09-18), PACK063 locked engineering with paid-live E2E deferred, and PACK083 engineering-finalized with live paid-provider acceptance deferred. These are source-recorded historical statuses, not independently re-verified on 2026-10-12.

## 5. Product and engineering principles recorded in source
- ZUVYR product scope includes chat, image, video, music/audio, code, computer/device control, voice, creative tools, background removal, and agentic workflows, but each capability must be individually checked against implementation and evidence.
- Manager/Operator orchestration, tool routing, cost/quality routing, evaluations, learning pipeline, failure bank, rights/license matrix, privacy/deduplication, dataset lineage, teacher gateway where permitted, training/fine-tuning, independent evaluation, model registry, shadow/canary, rollback/fallback are described in the roadmap.
- Owned-model default economics in roadmap: $0 ZUVYR API/software fee, $0 owned-model usage fee, $0 inference markup; BYOC is default. External paid-provider fallback must be priced and disclosed separately. This is a product-policy statement, not proof that the runtime implements it.
- User/organization compute credentials must remain server-side/encrypted, never in browser.
- Memory permission and training permission are separate; training content opt-in is OFF by default; consent/rights/provenance/revocation must be traceable.
- Least privilege, scope-limited credentials, explicit approvals, audit logs, stop/revoke propagation, safe output handling, bounded budgets/loops, tenant isolation, source fidelity, retrieval evaluation, lifecycle/rollback and production verification are mandatory acceptance themes.
- Historical monetization notes include PAYG credits (e.g. 1000 credits = $10; 10,000 top-up cap mentioned) and ~50% target margin; provider prices/quotas must be reverified before treating them as current economics.

## 6. State labels
- `VERIFIED`: supported by a current, reproducible test or live evidence with commit/ref, timestamp, environment and result.
- `PARTIAL`: some acceptance criteria pass; remaining criteria enumerated.
- `NOT BUILT`: no implementation found after scoped inspection; not a guess based on absence in one file.
- `BLOCKED`: explicit dependency/permission/credential/vendor/device issue prevents progress.
- `UNVERIFIED`: plan/code exists but no sufficient current acceptance evidence.
- `DEFERRED`: intentionally postponed with rationale and restart condition.
Never convert one label to another without recording evidence and a dated receipt.

## 7. Rules for AI agents
- Start with this index, then inspect the current main SHA, open PRs, recent commits, roadmap, AGENTS.md, architecture, changelog, pack evidence, scripts, backend/frontend, migrations and CI.
- Distinguish all projects/systems; only link them where source evidence shows a shared dependency.
- Do not overwrite production/main directly. Use a named branch and PR.
- Back up or preserve existing assets; no destructive cleanup without evidence and approval.
- Do not fabricate API keys, credentials, repository names, IDs, CI outcomes, tests, deployment state or visual QA.
- Do not run blind `npm audit fix --force` or make dependency upgrades without assessing breaking changes.
- Do not expose secrets or put credentials in committed files, prompts, logs or browser code.
- Test in the appropriate environment; green CI alone is not production proof.
- Report what changed, files/commit/PR, tests run and not run, blockers, and exact next action. Prefer Arabic/Darija summaries for the owner.

## 8. Final objective
One complete system-of-systems reference in GitHub, with project-by-project state and plans; a source-backed master PDF and editable source; machine-readable inventory/status registers; and a UI implementation prompt that points to the real HTML/code/API contracts and clearly marks mock, partial and missing behavior.
