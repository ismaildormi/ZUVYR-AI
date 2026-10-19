# Master Portfolio Index — ZUVYR / ZEBRA V2 / SYSTEM X / NOVA8 and Related Work

**Purpose:** durable entry point for any authorized AI coding agent continuing the owner's projects. This index is intentionally portfolio-wide; it is not limited to the ZUVYR product.

**Evidence policy:** this file records known project scope and instructions. It does not by itself prove runtime or production status. Use `VERIFIED`, `PARTIAL`, `NOT BUILT`, `BLOCKED`, and `UNVERIFIED` accurately, with evidence links, commit/receipt IDs, dates, and test results. Never convert a planned feature into a completed feature because it appears in a document, UI, mock, or source tree.

## Project portfolio

| Workstream | Purpose / scope | Canonical starting point | Current evidence posture |
|---|---|---|---|
| **ZUVYR AI** | Integrated consumer AI platform: chat, research, image/video/audio, Code Studio, computer control/IP, agents, automations, workspace/library, integrations, identity, credits/billing, admin/observability, and owned-model path. | `README.md`; `docs/REPOSITORY_MAP.md`; `docs/zuvyr/ROADMAP_150.md`; canonical continuity/state/receipt files. | V1 active development; PACK150 and EA-001→EA-292 acceptance contract governs readiness. Fresh live evidence supersedes stale notes. |
| **ZEBRA V2** | System/architecture/agent framework referenced in the owner's broader SYSTEM X materials. Preserve its own original architecture, naming, interfaces, requirements and decisions; do not silently collapse it into ZUVYR. | Search repository and supplied source bundles for ZEBRA V2, SYSTEM X, REV5/A15, Canonical Audit Master, Architecture Blueprint, and relevant source documents. | Inventory and implementation state must be reconciled from actual repository/source evidence. Anything not evidenced remains UNVERIFIED. |
| **SYSTEM X / X** | Broader system architecture and capabilities, including Manager/Operator, agent/tool ecosystem, GitHub-facing workflows, integrations, governance, audit, security, economics and UI surfaces as documented in source materials. | Search repository and owner-provided dossiers for SYSTEM X, ZEBRA V2, REV5/A15, EA IDs and PACK IDs. | Maintain a source ledger and conflict log; do not assume dossier claims prove implementation. |
| **NOVA8** | Separate mobile game project. Preserve its approved plan, V12 backlog/worktree and PACK30→PACK62 continuity; target is a Block Blast-like puzzle experience, with Gmail login/profile, free gameplay with online requirement, AdMob monetization, persistent ad placement and a monthly highest-score giveaway flow. | Owner-provided `00_READ_FIRST_NOVA8_MASTER_HANDOFF.md`, `02_NOVA8_CURRENT_STATE.json`, `01_NOVA8_V12_EXECUTION_BACKLOG.md`, and `Assets/NOVA8/Scripts/Runtime/V12/` when available in the actual NOVA8 repository/worktree. | Keep separate from ZUVYR source code and deployment. Historical notes mention Unity 6000.3.10f1 iOS support, iPhone target, `PACK61-IOS-TARGET`, Xcode project `Builds\\iOS\\NOVA8`, and `nova8://auth`; verify all against current files/build/device. External items previously listed: Unity compile/device QA, production AdMob IDs, test-ads-off proof, signing/store assets, public URL reachability. |
| **Creator / monetization workflows** | Owner's creator-channel and affiliate/creator-performance business ideas, including audience/creator monetization and possible integration with ZUVYR Creative Intelligence. | Use current owner-provided source material and any relevant repository docs. | Keep strategy/proposals distinct from built product features and verified revenue. |
| **Other owner projects** | Any additional project discovered in repository branches, docs, attached source bundles, or later owner-supplied links. | Inventory before assuming this list is exhaustive. | Add a row here as soon as a distinct project/workstream is evidenced. Do not invent project names or merge unrelated work. |

## Required repository documentation

Maintain these durable documents in the repository and update them as work progresses:

1. `docs/portfolio/MASTER_PORTFOLIO_INDEX.md` — this portfolio map and links to each project.
2. `docs/portfolio/CURRENT_STATE_AND_NEXT_ACTIONS.md` — current verified checkpoint, in-progress work, blockers, next exact actions and last checked commit/date.
3. `docs/portfolio/FEATURE_AND_INTEGRATION_REGISTER.md` — feature/tool/agent/API/provider/integration inventory with state, owner/project, evidence, dependencies and acceptance criteria.
4. `docs/portfolio/SOURCE_RECONCILIATION_AND_CONFLICTS.md` — source list, provenance, conflicts, superseded decisions and resolution status.
5. `docs/portfolio/MASTER_EXECUTION_PLAN.md` — complete future work plan with dependency order, no invented status and no silent scope loss.
6. `docs/portfolio/CLAUDE_CONTINUATION_PROMPT.md` — concise reusable instructions for Claude/other coding agents.
7. Project-specific status/receipts stay in their original canonical locations. Portfolio documents link to them; they must not replace or overwrite project-specific source-of-truth files.

## Non-negotiable continuity and safety rules

- First inspect repository default branch, current HEAD, active branches, open PRs, CI/workflow state, latest receipts, tests, migrations, and project-specific state docs.
- Treat current source and fresh live deployment/runtime evidence as stronger than old handoffs. Record disagreements instead of silently choosing one.
- Preserve original Pack IDs, EA IDs, issue/PR numbers, filenames, historical plans and owner decisions. Historical 100-Pack and current 150-Pack plans are separate histories.
- Never mark a Pack complete until its documented acceptance criteria and evidence/receipt pass. Green CI or a visible UI control alone is insufficient.
- Never fabricate credentials, production receipts, tests, external verification, user approvals, metrics or deploy results. Do not put secrets in GitHub docs, source, issues or prompts.
- Do not force-push, rewrite main history, delete existing files, run destructive migrations, rotate credentials, spend paid-provider credits, change billing gates or deploy production without explicit scope/authority and a safe rollback plan.
- Work in a new focused branch, make small traceable commits, run applicable tests, and open a PR. Do not merge into `main` automatically.
- Any generated UI must call real authorized backend capabilities or show a truthful unavailable/not-built state. No fake success, mock values represented as real data, or dead buttons.
- For every feature distinguish target/specification from source implementation, tested behavior, deployed behavior and live production acceptance.
- If tools/permissions are unavailable, document the exact limitation and continue with safe, evidence-supported tasks rather than claiming completion.
- User prefers direct execution, concise status, Arabic/Darija summaries, preserved checkpoints and no unnecessary re-planning.

## Definition of done for portfolio continuity

An agent can answer, for every workstream: what it is; where its source lives; what was actually completed; what evidence supports that claim; what is partially built, not built, blocked or unverified; which decisions conflict; what dependencies remain; and the next safe action. It must not claim that this portfolio is fully inventoried until all accessible repositories and supplied sources have been searched and the inventory log records the scope checked.
