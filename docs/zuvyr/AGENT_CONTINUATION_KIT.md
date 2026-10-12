# SYSTEM X / ZEBRA V2 / ZUVYR — Agent Continuation Kit

**Purpose:** Make a fresh coding agent's first action predictable and evidence-based. This is an index and operating contract, not a claim that every planned capability is implemented.

## Start here, in order

1. Read `README.md` and `ZUVYR_CONTINUE_HERE.md`.
2. Read `ZUVYR_MASTER_STATE.json` and `ZUVYR_MASTER_MATRIX.md`; verify the continuity capsule, receipt, readiness matrix, and validator agree before changing code.
3. Read `docs/zuvyr/ROADMAP_150.md` in full. It is the canonical 001–150 roadmap and contains the 2026-09-19 model-first execution-order override.
4. Read `docs/zuvyr/V1_READINESS_COMPLETENESS_AUDIT_2026-09-22.md`, `docs/zuvyr/V1_READINESS_REQUIREMENTS_001_292.json`, `docs/zuvyr/PACK_EXECUTION_APPENDIX.md`, `docs/zuvyr/ZUVYR_V1_COMPLETE_MASTER_PLAN.md`, and `docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json`.
5. Read the exact active Pack execution plan, receipt, linked tests, migrations, and deployment evidence. Search `zuvyr-pack-evidence/`, `docs/zuvyr/PACK*_EXECUTION_PLAN.md`, `backend/`, `frontend/`, `device-agent/`, `cli/`, and `tools/`.
6. Run the documented continuity validator and relevant tests before edits; record the exact commit/ref, commands, exit codes, and outputs.
7. Only then implement the next permitted Pack on a separate branch, preserve prior verified behavior, test, update its receipt/readiness state, and open a PR. Do not merge/deploy unless the release gates authorize it.

## Canonical planning envelope

- Numbered V1 plan: `PACK001–PACK150`; `PACK150` is the final readiness/recovery gate, not a shortcut to declaring V1 complete.
- Audit acceptance requirements: `EA-001–EA-292`, defined by the readiness matrix and audit overlay.
- Historical 100-Pack plan/amendments are retained as historical source material. Do **not** merge the 100-Pack and 150-Pack numbering systems, renumber historical Packs, or erase their receipts.
- The roadmap's dated model-first override says `PACK094 → PACK095 → PACK096` before `PACK084–PACK093`. However, the continuity capsule in `ZUVYR_MASTER_STATE.json` (updated 2026-09-26) states `PACK089` as active and `PACK090` as next. Treat this as an explicit source-of-truth conflict: inspect the newest main commit, receipts, validator, CI and production evidence; record the resolution in a reconciliation receipt before continuing. Do not choose a sequence based on memory alone.
- Repository planning/status text is not itself proof that a feature is production-ready. The source-of-truth order is fresh allowed production evidence, current main commit/CI and receipts, then dated canonical state/roadmap, then older handoffs.
- Only mark `LOCKED_VERIFIED` when the required acceptance evidence exists. A plan, code file, green unit test, successful deployment, mock, or UI button alone is insufficient.
- Final V1 readiness requires all applicable requirements to be `PASS` or true `N/A_WITH_EVIDENCE`; `UNKNOWN`, `PARTIAL`, `DEFERRED`, `NOT_TESTED`, `MOCK_ONLY`, `SOURCE_ONLY`, or unsupported claims block `V1_READY`.

## System and integration inventory entry points

Use these live repository paths as the inventory—not an invented list in a prompt:

- Product scope and completion contract: `README.md`, `docs/PRODUCT.md`.
- Architecture: `docs/ARCHITECTURE_OVERVIEW.md` and architecture-specific documents under `docs/`.
- Pack plan and scope: `docs/zuvyr/ROADMAP_150.md`, `docs/zuvyr/PACK_EXECUTION_APPENDIX.md`, `docs/zuvyr/PACK*_EXECUTION_PLAN.md`.
- Acceptance inventory: `docs/zuvyr/V1_READINESS_REQUIREMENTS_001_292.json` and `docs/zuvyr/V1_READINESS_COMPLETENESS_AUDIT_2026-09-22.md`.
- Current/historical continuity and state: `ZUVYR_CONTINUE_HERE.md`, `ZUVYR_MASTER_STATE.json`, `ZUVYR_MASTER_MATRIX.md`, `docs/zuvyr/ZUVYR_CONTINUITY_MANIFEST.json`.
- Implementation: `frontend/`, `backend/`, `device-agent/`, `cli/`, `tools/`.
- Data model/security: backend migrations, authorization policies, RLS policies, runtime policy/config JSON, `SECURITY.md`, and security-specific docs.
- Evidence: `zuvyr-pack-evidence/`, GitHub Actions workflows in `.github/workflows/`, test files and deployment/release receipts.
- Provider, model, tool and capability contracts: search code/docs for registries, adapters, routing, capability catalog, unified tools runtime, connector modules and associated tests; report each actual source path and distinguish implemented code from roadmap-only entries.
- Historical 100-Pack material: source Markdown/ZIP/PDFs supplied by the owner or retained in the repository. Record source name and checksum when available. Do not silently overwrite historical material with the 150-Pack roadmap.

## External design input

The owner has a separate `index (2).html` concept/interface file and existing dossier PDFs/Markdown/ZIP attachments. Do not assume those local conversation attachments exist in the GitHub repository. When they are provided to the coding agent, inventory and hash them; compare their claims against repository code and evidence. Add the approved HTML/source bundle to this repository only on a dedicated branch and after checking for secrets, oversized assets, licensing, and existing equivalents. Do not commit credentials or private data.

## Required output from each agent session

Create/update an evidence-based continuation receipt with:
- repository/ref/commit and date;
- sources read and source SHAs;
- active Pack decision and conflict-resolution evidence;
- changed paths and concise diff summary;
- commands/tests with exit codes and results;
- production checks actually performed (or `BLOCKED/UNVERIFIED`);
- EA items impacted and status/evidence;
- known gaps, rollback path, next legal action;
- any new tool/agent/API/provider integration with code path, contract, permissions, test and status.

Use these statuses consistently: `VERIFIED`, `PARTIAL`, `NOT BUILT`, `BLOCKED`, `UNVERIFIED`, `MOCK ONLY`, `DEFERRED`. Never use an undocumented assumption to upgrade status.

## Agent execution prompt

You are the lead execution engineer for ZUVYR / SYSTEM X / ZEBRA V2. Use the repository as the source of code and the canonical documents above as the source of plan/acceptance scope. Start with this file, reconcile current main, receipts, EA matrix, CI and permitted live evidence, and resolve state conflicts with a dated receipt. Enumerate all 150 Packs and all 292 EA requirements from their canonical files, then map each to source paths, tests, receipts, and honest status. Inventory actual agents, tools, APIs, providers, connectors, services, screens and external dependencies from code and documents; identify roadmap-only items as NOT BUILT or UNVERIFIED. Preserve all original IDs and historical receipts. Work one authorized Pack at a time on a branch; do not fabricate evidence, mock production integrations, expose secrets, silently delete/rewrite history, or declare readiness early. Before completion, produce a complete machine-readable inventory and continuation receipt, run the repository's continuity validator and relevant tests, and open a PR with an auditable diff. Treat attached HTML and PDFs as design/source inputs—not runtime proof. If a required connector or external credential is unavailable, document the exact blocker and continue all independent work safely.
