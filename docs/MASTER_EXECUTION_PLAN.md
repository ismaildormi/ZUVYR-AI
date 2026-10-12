# MASTER EXECUTION PLAN — CROSS-PROJECT COMPLETION

**Intent:** preserve continuity across ZUVYR, ZEBRA V2, SYSTEM X, NOVA8 and any additional named systems discovered in the source set. This is a master coordination plan, not a replacement for the canonical project-specific roadmaps.

## Phase 0 — Preserve and establish truth

- Work on a dedicated branch; do not push broad changes directly to main.
- Inventory the exact repository owner/name, default branch, latest main commit, all relevant branches, open PRs, CI, receipts, migrations, deployments and canonical status files.
- Make a source register of every user-provided PDF, Markdown, ZIP, HTML, repository URL, API/tool reference and handoff file. Record checksums for local artifacts when available.
- Separate authoritative current evidence from historical plans and copied handoffs. Do not infer current status from stale headers or percentages.
- Keep separate project boundaries and identifiers. ZUVYR's PACK001–150/EA-001–292 is not the same as NOVA8's pack sequence or any SYSTEM X/ZEBRA identifiers.

## Phase 1 — Source reconciliation and master inventory

- Compare canonical documents section-by-section; identify unique content, missing content, duplicates, contradictions and superseded decisions.
- Preserve the historical 100-Pack plan separately from the 150-Pack roadmap.
- Extract every PACK ID, EA ID, agent, tool, API, provider/model, integration, service, repository, screen, security requirement, test, external dependency, and acceptance condition.
- Build a machine-readable inventory with fields: item ID, project/system, name, type, requirement/source, current status, evidence, dependencies, owner/action, acceptance test, risk, target phase/pack and last-verified timestamp.
- Any conflict stays recorded until evidence or explicit owner decision resolves it.

## Phase 2 — System architecture and dependency map

- Produce separate architecture maps for ZUVYR, ZEBRA V2, SYSTEM X and NOVA8, plus a cross-system map showing only evidence-supported interfaces.
- Map frontend, backend, database, queues/workers, storage, authentication, billing/usage, model/provider routing, agent orchestration, tools, external integrations, deployment, observability, security and data lifecycle.
- Identify duplicate capabilities and shared services without assuming code is shared.
- Record API contracts, schema/migration paths, secrets/config names (never values), permissions/scopes, rate/resource limits, retry/idempotency and failure/revocation semantics.

## Phase 3 — Actual implementation and gap verification

- For each inventory item, inspect code, tests, schema/migrations, CI and appropriate live service evidence.
- Label VERIFIED only when the specific acceptance criterion has direct evidence. Label code-only or mock-only items PARTIAL/UNVERIFIED as appropriate.
- Build positive and negative tests: allowed and denied access, revoke/disconnect, cross-owner isolation, retries, idempotency, refunds/accounting, cancellation, worker restart, provider failure and recovery where applicable.
- Treat cost, privacy, licensing/training rights, security and abuse controls as acceptance requirements, not optional notes.
- Record external gates and the exact safe action needed from the owner; never manufacture credentials or fake successful production tests.

## Phase 4 — Prioritized execution

- Execute the project's existing canonical order and explicit overrides. Do not renumber, skip, or silently reorder Packs.
- For ZUVYR, preserve PACK094 → PACK095 → PACK096 priority override ahead of PACK084–PACK093 unless fresher authoritative evidence changes it; reconcile current status before execution.
- Close each pack only with code/test/runtime evidence and a receipt. Route newly discovered V1 gaps into future work rather than deleting them.
- Keep NOVA8 work in its own canonical backlog/repository and acceptance sequence.
- Implement changes on scoped branches with backups, tests, reviewable diffs and rollback paths. Avoid forceful dependency upgrades or destructive DB operations without impact analysis.

## Phase 5 — UI and integration completion

- Use the supplied index (2).html as a design/reference artifact, not proof of live integration.
- Create a screen/action inventory: every visible button, form, modal, route, tool action, agent action, error state, loading state and permission prompt must map to a real supported API/contract or be visibly marked unavailable/not built.
- Remove deceptive mock success and fabricated data/URLs. Implement deliberate empty/loading/error/denied/offline states, accessible keyboard semantics, mobile layouts and Arabic RTL/English LTR where required.
- Do not expose secrets to browser code. Use server-side connectors and scoped grants. Require confirmation for consequential/destructive actions.
- Connect UI to the real backend only after endpoint contract, authorization, failure behavior and tests are verified.

## Phase 6 — Dossier and reusable handoff

- Produce the comprehensive Arabic/English PDF master dossier, editable source, source/asset register, PACK/EA inventory, conflict log, architecture diagrams, page-level QA log, visual QA report, SHA-256 manifest and final receipt as feasible.
- The target 90-page constraint must never cause silent information loss. If full retention and legibility cannot fit 90 pages, document the conflict and deliver a complete master plus a concise executive edition.
- Produce a standalone, concise prompt for a second agent to implement the UI based on the final dossier, HTML reference, GitHub code and API contracts.
- Cite source paths and exact refs; distinguish source-derived facts, inferred mappings and unverified claims.

## Phase 7 — Validation and closure

- Run available lint/typecheck/unit/integration/security/build tests and inspect outputs.
- Validate IDs against source inventories and report exact coverage counts plus exceptions.
- Review every generated PDF page visually if claiming page-level visual QA; otherwise clearly label the uninspected portion.
- Confirm artifacts exist, are readable, have stable links and matching SHA-256 manifest entries.
- Open a PR with a concise summary, changed files, evidence, tests, risks and unresolved gates. Do not merge or deploy unless the required gates/authorization are met.
- The project is complete only when every agreed deliverable is present and each remaining exception is explicitly listed. Do not claim completion while any deliverable is missing.

## Final acceptance checklist

- [ ] All known systems/projects are registered and kept distinct.
- [ ] All source documents/assets/links are inventoried.
- [ ] Historical and current plans are preserved separately.
- [ ] PACK/EA IDs are extracted and cross-checked with source evidence.
- [ ] Agents, tools, APIs, providers, screens and integrations are inventoried.
- [ ] Implemented, partial, blocked, unbuilt and unverified items are distinguished.
- [ ] Dependencies, risks, acceptance tests and next actions are explicit.
- [ ] PDF and editable master source are delivered or every blocker is documented.
- [ ] Standalone UI-agent prompt is delivered.
- [ ] Changes are on a branch and offered through a reviewable PR.
- [ ] No secrets, fake evidence or silent content deletion were introduced.