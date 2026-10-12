# SYSTEM OF SYSTEMS — MASTER CONTEXT & EXECUTION INDEX

**Repository:** `ismaildormi/ZUVYR-AI`  
**Created:** 2026-10-12  
**Purpose:** durable handoff and navigation for all connected project lines represented by the repository and source materials.

## Scope rule

This index is not permission to rename or collapse distinct systems. Keep **ZUVYR**, **ZEBRA V2**, **SYSTEM X**, and any additional named project/system discovered in the source bundle as distinct workstreams. Record their interfaces and shared dependencies without assuming they are the same product. Add newly discovered system names to `docs/system-of-systems/SYSTEM_REGISTER.md` with evidence/source pointers.

## Authoritative-source hierarchy

1. Current repository state on the target branch, exact commits, tests, receipts, migrations, workflow results, and production evidence available to the auditor.
2. Current canonical specifications in this repository, especially `docs/zuvyr/ROADMAP_150.md`, canonical audit/EA register, state receipts, and security policy.
3. Source PDFs, Markdown handoffs, ZIP bundles, HTML prototypes, and historic plans. Preserve them as historical evidence; reconcile conflicts instead of silently overwriting.
4. Chat summaries and recollections are leads, not implementation proof.

A statement in a PDF, roadmap, HTML prototype, or README is not by itself proof that the feature works in production.

## Core ZUVYR V1 references

- Product target and completion contract: `README.md`
- Canonical 150-pack roadmap: `docs/zuvyr/ROADMAP_150.md`
- Repository map: `docs/REPOSITORY_MAP.md`
- Architecture overview: `docs/ARCHITECTURE_OVERVIEW.md`
- Product definition: `docs/PRODUCT.md`
- Quickstart: `docs/QUICKSTART.md`
- V1 readiness audit (historical snapshot; refresh before relying on it): `docs/zuvyr/V1_READINESS_COMPLETENESS_AUDIT_2026-09-22.md`
- Security: `SECURITY.md`
- Public use/license boundaries: `docs/PUBLIC_USE_POLICY.md`, `LICENSE`
- Current owned-model runtime policy referenced by roadmap: `backend/config/zuvyr-owned-model-runtime-policy.v1.json`

## Pack and EA rules

- Preserve original IDs exactly. Do not renumber PACKs or EA IDs.
- The historic 100-pack plan and canonical 150-pack roadmap are separate artifacts with separate scope and history. Do not merge or relabel them.
- The roadmap documents PACK001–PACK150 and EA-001 through EA-292. Use the source files and pack receipts to determine individual status; never infer that every pack has code simply because a pack is listed.
- A pack closes only with its required acceptance evidence/receipt and the applicable canonical state (including `LOCKED_VERIFIED` where specified).
- `PACK150` is the final V1 readiness gate; green CI, source code, local success, or a deployment alone does not establish full V1 readiness.
- Current roadmap priority override says PACK094 → PACK095 → PACK096 before PACK084–PACK093; PACK084–PACK093 are deferred, not cancelled. Verify newer evidence before treating this historical roadmap state as current.
- Known historic conflict to reconcile: an earlier continuity note reportedly points from PACK089 to PACK090, while the roadmap model-first override changes execution order to PACK094–096 first. Keep both claims with their source/date until live receipts resolve them.

## Status vocabulary (mandatory)

- `VERIFIED`: direct, dated evidence proves the specified acceptance criterion at the named environment/commit.
- `PARTIAL`: some, but not all, criteria have evidence.
- `NOT BUILT`: no implementation located after the documented search scope; say which scope was searched.
- `BLOCKED`: a concrete dependency/permission/credential or external gate prevents completion.
- `UNVERIFIED`: a plan, claim, or code path exists but effective behavior has not been proven.
- `HISTORICAL`: an older state/receipt, not automatically current.
- `DEFERRED`: deliberately scheduled later; not cancelled and not complete.
- `MOCK_ONLY`: demo/stub/prototype only; never production-ready.

Every status entry must include evidence pointer(s), checked commit/ref, environment, date, and the next acceptance action. If a field is unknown, mark it unknown rather than guessing.

## All-system inventory requirement

For every system/product/workstream found in the inputs, record:
- exact name and aliases, owner/repository, goal and boundaries;
- current state and last verified checkpoint;
- all PACKs, EA IDs, feature requirements, agents, tools, providers, models, APIs and integrations in scope;
- implementation paths, tests, migrations, workflows, deployment services and receipts;
- dependencies, security/consent/data-rights constraints, costs and billing gates;
- remaining tasks in dependency order, acceptance criteria, external blockers, rollback and recovery plan;
- source citations and unresolved contradictions.

Do not assert that the list is exhaustive until all available sources have been inventoried and the reconciliation log says what was and was not accessible.

## Agent/tool inventory

Maintain `AGENT_TOOL_INVENTORY.csv` and document each item with: exact name/ID; system; purpose; input/output contract; implementation path; API/provider; required permissions; secret names only (never values); cost/limits; tests; current status; evidence; dependencies; owner/next action. Distinguish planned tools from implemented and production-enabled tools.

## UI completion contract

Treat `index (2).html` or any other HTML mockup as a design/reference source, not proof of backend integration. For each screen/button/action, map: user journey → frontend handler → API contract → backend/service/tool → authorization → persistence/usage accounting → tests → production evidence. Buttons without a real path must be labelled not implemented or safely disabled, not wired to fake success.

## Security and production safety

- Never commit API keys, OAuth client secrets, passwords, tokens, private user data, or raw secret-bearing exports.
- Use least privilege, server-side secret storage, consent and revocation flows, audit logs, owner/resource authorization, rate limits, idempotency and safe cancellation.
- Do not enable paid/live billing or relax security gates as a shortcut.
- Do not force dependency upgrades or merge an unreviewed branch just to make CI green.
- Preserve existing work. Changes should be additive and reviewable, preferably on a dedicated branch and pull request.

## Completion / handoff

At each work session update:
1. `docs/system-of-systems/MASTER_EXECUTION_STATE.md`
2. `docs/system-of-systems/SYSTEM_REGISTER.md`
3. `docs/system-of-systems/SOURCE_RECONCILIATION_LOG.md`
4. the relevant pack receipts / EA register / inventory files.
5. a dated handoff naming exact branch, commit, tests, what changed, blockers, and next action.

The system is not "complete" until the full source inventory is reconciled, every relevant PACK/EA item has evidence-based status, all required code/config/docs/tests are preserved in GitHub, and final acceptance criteria are satisfied.