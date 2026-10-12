# System-Wide Execution Roadmap

This is the cross-system sequence. It does not renumber or replace project-specific PACK/EA plans.

## Phase 0 — Preserve and inventory
- [ ] Record base commit and branch protection; keep main untouched.
- [ ] Enumerate all accessible repositories and source files; ask for missing owner-provided repo links only if discovery cannot establish them.
- [ ] Inventory all systems, products, agents, tools, APIs, providers, UI screens, data stores, workflows, Pack IDs, EA IDs, external dependencies and decision records.
- [ ] Preserve 100-Pack historical plan separately from 150-Pack plan; record every conflict.

## Phase 1 — Reconcile truth
- [ ] Read repository agent instructions, architecture, roadmap, changelog, configs, tests, migrations, pack evidence and CI workflows.
- [ ] Map every PACK/EA ID to scope, current evidence, status, dependencies, acceptance criteria and next action.
- [ ] Reconcile source documents and duplicate PDFs; build a section-level difference log and source register.
- [ ] Distinguish planned / source-documented / coded / tested / deployed / production-accepted.
- [ ] Mark unknowns as UNVERIFIED, not VERIFIED.

## Phase 2 — Resolve blockers and P0 security
- [ ] Recheck auth/OAuth/connector credentials and acceptance without printing secrets; missing Google OAuth credentials block that specific acceptance flow.
- [ ] Close relevant identity, tenant isolation, prompt injection, excessive agency, output validation, SSRF/egress, budgets, delegated-agent authority, tool provenance and sensitive-data tests per EA mapping.
- [ ] Verify backup/restore and recovery objectives, branch protections, leaked-password protections and release/deployment evidence where relevant.
- [ ] Assess dependency vulnerabilities; avoid blind force-upgrades. Patch with tests and document residual risk.
- [ ] Keep paid-provider acceptance separate from engineering-only completion.

## Phase 3 — Implement in canonical project order
- [ ] Follow the latest evidenced priority order in the canonical roadmap, not stale handoff text.
- [ ] Current roadmap document's recorded override: PACK094 → PACK095 → PACK096 before PACK084–PACK093, then resume PACK084. Reconfirm this against newer main/receipts before execution.
- [ ] Preserve pack numbering and FIX iterations; do not skip work or rerun completed work without cause.
- [ ] For every pack: baseline → scoped changes → tests → evidence receipt → state update → review/PR → merge only after gates.
- [ ] Reconcile every EA item through the mapped Packs; PACK148–150 must reconcile all EA requirements per roadmap.

## Phase 4 — Integrations and product contracts
- [ ] Create a canonical registry of tools/APIs/providers: owner, purpose, permissions/scopes, schema, secrets location, limits/cost, error behavior, tests, lifecycle/revoke and status.
- [ ] Validate API contracts and real service adapters; never make a showcase button look successful when no real operation exists.
- [ ] Enforce server-side secrets, least privilege, explicit approval for consequential actions, auditable results, bounded cost/time and cancellation.
- [ ] Keep local/remote user-owned compute as default for owned-model inference per roadmap policy; separately account for paid external-provider fallback.

## Phase 5 — UI / UX completion
- [ ] Treat `index (2).html` as design/intention input only; map each visible control to a real capability/API/route and acceptance test.
- [ ] Inventory screens, controls, dialogs, keyboard/accessibility, RTL Arabic and LTR English, responsive behavior, loading/empty/error/permission/approval states.
- [ ] Tag every control REAL / PARTIAL / MOCK / NOT CONNECTED / BLOCKED.
- [ ] Implement against existing API contracts and backend; no fake data, fake success messages or fabricated external links.
- [ ] Add UI tests for core workflows and negative authorization/denied-scope cases.

## Phase 6 — Dossier and handoff
- [ ] Reconcile the 92/96/113-page historical PDFs and Markdown/ZIP source bundle section-by-section.
- [ ] Produce one evidence-grounded master dossier plus editable source, inventories, conflict log, diagram sources, QA log, asset/source manifest and SHA-256 receipt.
- [ ] Do not force exactly 90 pages by deleting material. If exact 90 pages conflicts with no information loss/readability, document the conflict and preserve content.
- [ ] Produce standalone UI-agent prompt referencing this folder, the chosen HTML, actual API contracts and repo branch/commit.
- [ ] Include what was checked, what was not checked, current base SHA, branch/PR URL, tests and unresolved blockers.

## Phase 7 — Release closure
- [ ] Re-run applicable automated tests and integration tests against the intended release commit.
- [ ] Verify Vercel/Railway/Supabase or other service state through authorized tools and timestamped evidence; do not infer deployment from a code commit.
- [ ] Verify user journeys and rollback; close external/device/provider gates only with their own acceptance evidence.
- [ ] Only declare V1 ready when canonical PACK150 and all required EA gates are genuinely reconciled and evidenced.
