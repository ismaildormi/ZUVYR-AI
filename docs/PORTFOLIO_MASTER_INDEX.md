# Portfolio Master Index — ZUVYR / SYSTEM X / ZEBRA V2 and Related Work

**Purpose:** Give any connected coding agent one safe entry point for the complete portfolio context without pretending that every project is contained in this repository. This index is additive; it does not replace project-specific roadmaps, receipts, or original source files.

## Repository identity and baseline

- Repository: `ismaildormi/ZUVYR-AI`
- Default branch: `main`
- Baseline main commit observed for this index: `9029a07e9da8d3abb4974cda5b7bd6bf71085b66`
- Existing continuation PR to review alongside this index: [PR #136](https://github.com/ismaildormi/ZUVYR-AI/pull/136)
- This document was prepared from repository content accessible at the time stated in its commit/PR. Re-fetch current main, open PRs, CI, receipts and deployment evidence before relying on it for execution.

## Scope: systems and projects

### 1. ZUVYR AI
The consumer AI platform described in the repository README and product/architecture docs. Canonical implementation and plan are in this repository. V1 target includes multimodal chat, research, images, video, audio/voice, Code Studio, computer control/IP, agents, automations, workspace/library, integrations, identity, usage accounting and billing. This is target scope, not proof each capability is production-ready.

### 2. SYSTEM X
The system/architecture, manager/operator, agent/tool orchestration, governance, audit and operating model associated with the broader ZUVYR work. Reconcile each SYSTEM X item to actual code, docs, tests and receipts. If it is only in a PDF, prompt, design, or roadmap, mark it as source/planned scope—not implemented.

### 3. ZEBRA V2
A related system/project named in the owner’s execution context. Preserve all ZEBRA V2 names, versions, EA IDs, PACK IDs, architecture decisions and source documents found in repository or supplied attachments. Do not infer missing technical details from the name. Where ZEBRA V2 has a separate repository, ask the owner to provide/authorize that exact repository and add its URL/commit to the cross-project register; do not assume it is this repository.

### 4. NOVA8 (related, separately tracked project)
NOVA8 is a separate mobile game project and must not be merged into ZUVYR’s implementation or Pack numbering. Its known scope includes Unity/iOS build work, account/profile, online gameplay, AdMob, leaderboard and monthly giveaway requirements. The prior handoff describes V12 execution and an iOS target/build checkpoint, while Unity compilation/device QA, production AdMob IDs, signing/store assets and public URL reachability have been external/open checks. Treat these as historical handoff claims until checked against the current NOVA8 repository and latest receipt. The owner must provide/authorize the exact NOVA8 repository URL before code changes are made there.

### 5. Other projects, experiments, and research
Do not assume the list above is exhaustive. Search the current repository and owner-provided files for additional project names, subprojects, experiments, provider/model work, business systems, agents, integrations, and historical plans. Add each discovered item to the inventory with source, owning repository, branch/commit, status, dependencies, and next action. If no source evidence exists, label it `UNVERIFIED` and request the exact source rather than inventing it.

## Canonical source hierarchy

Use this order, recording the source and timestamp for every important decision:
1. Fresh, authorized production evidence and real end-to-end acceptance receipts.
2. Current GitHub default-branch source, commit, CI, tests, migrations, security controls and release/deployment receipts.
3. Canonical project state, EA readiness matrix, Pack receipts and dated roadmap overrides.
4. Older continuity/handoff documents.
5. PDF dossiers, prompts, HTML concepts, screenshots and other owner attachments.

A lower-ranked source does not silently override a newer higher-ranked source. Conflicts must be written to a conflict register and resolved with evidence or left open.

## Required status vocabulary

- `VERIFIED`: supported by a reproducible test/receipt or authorized production evidence appropriate to the claim.
- `PARTIAL`: some acceptance criteria pass, others do not.
- `NOT BUILT`: required implementation is absent after checking relevant source locations.
- `BLOCKED`: a specific external/internal dependency prevents progress; name the dependency and unblock condition.
- `UNVERIFIED`: evidence is insufficient or unavailable.
- `MOCK ONLY`: demo/mock/stub path, not a real production integration.
- `DEFERRED`: deliberately postponed by a documented decision; not complete.
- `N/A_WITH_EVIDENCE`: only when the requirement genuinely does not apply and evidence explains why.

Never upgrade a status based only on a plan, label, UI control, file name, green unit test, or deployment event.

## Master inventory fields

Every discovered system, capability, Pack, EA item, agent, tool, API, provider/model, connector, screen, job/automation, data object, migration, service, deployment and external dependency should have:
- stable original ID and name;
- owning system/project and repository;
- source document/path and source commit/blob SHA;
- intended outcome and acceptance criteria;
- implementation paths and contract/schema;
- tests and last observed result;
- permissions, data boundaries, safety controls and failure/recovery behavior;
- cost/usage/billing effects where applicable;
- production evidence and its timestamp, if any;
- honest status and blocker;
- dependencies, next action and rollback/recovery note.

Keep a machine-readable inventory (JSON/CSV) in addition to human-readable Markdown. Preserve the original EA/PACK IDs; do not fabricate IDs for unnumbered items.

## Pack and acceptance plan preservation

- Current canonical ZUVYR V1 roadmap is `docs/zuvyr/ROADMAP_150.md`, defining PACK001–PACK150 and the EA-001–EA-292 acceptance scope.
- The historical 100-Pack plan is a separate historical artifact. Retain its source, IDs, and decisions; never fold it into PACK001–PACK150 or erase it.
- The roadmap records a model-first priority override `PACK094 → PACK095 → PACK096` before PACK084–PACK093, while a later continuity capsule has historically pointed to PACK089/PACK090. This is a known conflict until reconciled against current main, receipts, validator, CI and allowed production evidence.
- PACK150 is not complete merely because the plan reaches 150. Final readiness requires all applicable EA items to pass or have evidenced N/A and all release gates to be satisfied.

## Cross-project boundaries

- Keep separate project repositories, release trains, credentials, issue trackers, PACK sequences and acceptance receipts separate unless an explicit architecture decision links them.
- Shared capabilities (identity, agents, tools, model/provider registry, audit, cost controls, deployment, research) must be inventoried as shared only when code/contracts prove the relationship.
- Never commit secrets, OAuth tokens, private user data, production exports, or unreviewed oversized/binary attachments.
- The HTML `index (2).html` is a UI/design input, not evidence that its buttons or integrations work.
- PDF/MD/ZIP attachments must be inventoried by exact filename and SHA-256 when available. Preserve source originals; create reconciled outputs separately.
- External systems (GitHub, Vercel, Railway, Supabase, Stripe, Google OAuth/Drive, provider accounts, iOS signing, AdMob) require direct evidence from the relevant connected service. If a service connector is unavailable, report `BLOCKED/UNVERIFIED`; do not imply it was checked.

## Required deliverables from the agent

1. Cross-project portfolio register.
2. Source manifest with file names, versions/SHAs, provenance and duplicate detection.
3. Reconciliation report: unique content, overlap, omissions, conflicts and decisions.
4. Pack-to-EA-to-code/test/receipt traceability matrix.
5. Agent/tool/API/provider/connector inventory.
6. Screen/action-to-contract inventory for the HTML/design surface.
7. Blocker/dependency register with exact unblock conditions.
8. Prioritized execution plan that preserves existing approved order/overrides and historical IDs.
9. Current-session continuation receipt with changed paths, commit/ref, tests/exit codes, evidence, blockers and next permitted action.
10. UI implementation prompt grounded in the reconciled source, with each UI action mapped to a real contract or marked `NOT BUILT`.
11. Final PDF dossier plus editable Markdown/source files. Do not force exactly 90 pages by silently deleting content; if exact page count conflicts with zero-loss readability, report the conflict and preserve the complete source.
12. PR with an auditable diff. Do not merge, deploy, change production data, or rotate credentials without the repository's gates and required authorization.

## Immediate execution sequence

1. Read `AGENTS.md`, `README.md`, `ZUVYR_CONTINUE_HERE.md`, `ZUVYR_MASTER_STATE.json`, `ZUVYR_MASTER_MATRIX.md`, `docs/zuvyr/ROADMAP_150.md`, `docs/zuvyr/V1_READINESS_COMPLETENESS_AUDIT_2026-09-22.md`, `docs/zuvyr/V1_READINESS_REQUIREMENTS_001_292.json`, `docs/zuvyr/PACK_EXECUTION_APPENDIX.md`, receipts, migrations and relevant tests.
2. Review PR #135 and PR #136; inspect required CI/checks and changed files. Do not duplicate their work or merge without checks.
3. Snapshot current main and inventory all paths, Pack IDs, EA IDs, receipts, tests, integrations, providers and open blockers.
4. Reconcile active Pack conflict from fresh evidence. If unresolved, stop feature implementation but continue independent documentation/inventory tasks.
5. Obtain exact source bundles and repository URLs for SYSTEM X/ZEBRA V2/NOVA8 or other separately stored projects; do not assume local chat uploads are present in GitHub.
6. Build source manifest and reconciliation first; then machine-readable inventory and traceability matrix; then dossier and UI prompt.
7. Run repository validators and tests available in the environment; record commands, exit codes and limitations.
8. Open/update a PR, provide links and exact remaining blockers. Do not claim complete until deliverables and checks are actually verified.
