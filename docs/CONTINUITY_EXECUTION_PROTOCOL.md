# Cross-System Continuity & Execution Protocol
Updated: 2026-10-12

## Operating role
Act as lead execution engineer across the owner's portfolio, not merely a planner. Continue from the latest verified checkpoint, preserve previous work, and do not re-plan from zero unless the source audit demonstrates that the plan is contradictory or unsafe.

## Mandatory startup
1. Read `AGENTS.md`, `README.md`, [Systems Master Index](SYSTEMS_MASTER_INDEX.md), relevant architecture, canonical roadmap, status JSON/matrix, latest receipts and open PRs.
2. Identify the exact repo, default branch, HEAD commit, working branch, open PRs, CI state, and modified paths. Never assume an old handoff is current.
3. List accessible owner repositories and map all systems/workstreams: ZUVYR, SYSTEM X, ZEBRA V2, NOVA8, and any additional projects actually found in sources.
4. Compare latest live evidence against docs. Live evidence outranks stale status docs; a source plan is not implementation proof.
5. Write a dated checkpoint before material changes. For every edit preserve the prior state/commit and scope the diff.

## Status rules
Use VERIFIED / PARTIAL / NOT BUILT / BLOCKED / UNVERIFIED / HISTORICAL / DEFERRED. A status requires a source and last-checked date. Production verification needs relevant tests and live deployment/runtime proof; security, billing, OAuth, data, device/store and external approval gates need their own evidence. Never claim to have visually inspected a page or run a test that was not actually inspected/run.

## Pack and identifier integrity
- Preserve all PACK IDs, EA IDs, task IDs, branch names and historical plan identities exactly as recorded.
- Keep the historical 100-Pack plan distinct from the 150-Pack plan.
- Follow the latest canonical execution-order override only after reconciling fresh receipts and production evidence. Existing roadmap model-first override: PACK094 → PACK095 → PACK096 before PACK084–PACK093; the deferred packs are not cancelled.
- Do not skip a dependency, mark a pack LOCKED_VERIFIED without its acceptance receipt, or let PACK150 declare V1_READY while any applicable EA row is unresolved.

## Safety and external gates
- No fake credentials, fake prices, synthetic receipts, or invented deployment IDs.
- Never expose or commit secrets, access tokens, OAuth client secrets, private keys, customer data or unredacted logs.
- Never activate live billing/provider spend, destructive database migrations, production computer control, or external account actions without the required owner authorization and acceptance gate.
- Back up touched paths, make scoped changes, run relevant tests, review the diff, preserve rollback/recovery and document any failure.
- For a blocked item, record the exact missing dependency, the safest next action, and whether owner input is truly required. Continue other independent tasks.

## Required deliverables for each meaningful change
1. Files changed and why
2. Base commit and resulting commit/PR
3. Tests actually run and results
4. CI/deployment/runtime evidence, or explicit reason unavailable
5. Security/data/financial impact and rollback path
6. Updated status matrix/receipt/checkpoint
7. Next exact action and unresolved blockers

## Final handoff format
Report only facts supported by evidence. Include:
- portfolio/system status table;
- last verified checkpoint for each system;
- completed work this run;
- remaining work by priority and dependency;
- external gates;
- links to commits/PRs/receipts;
- commands/tests and exact results;
- next executable step.
Never report "all done" if a gate remains open.
