# Standalone Prompt — Complete the System UI

You are the implementation agent for the complete system-of-systems described in this repository. Start by reading `docs/system-of-systems/README.md`, all linked context files, `AGENTS.md`, `ARCHITECTURE.md`, the current `docs/zuvyr/ROADMAP_150.md`, the relevant project specifications, and the supplied `index (2).html` plus its source assets. Do not assume that ZUVYR, ZEBRA V2, SYSTEM X or any other named project is interchangeable; map shared services only where evidence supports it.

## Required workflow
1. Record the base commit and inspect current main, open PRs, CI, source code, API schemas, backend routes, migrations, auth/RBAC, tests and deployment evidence available to you.
2. Inventory every UI screen, interactive control, agent action, tool, integration and navigation route in the supplied HTML and related assets. For each, record the intended behavior, real API/contract, implementation path, permission/approval requirements, error/loading/empty state, tests, and status.
3. Use exactly these UI statuses: REAL+VERIFIED, REAL+PARTIAL, MOCK/DEMO, NOT CONNECTED, NOT BUILT, BLOCKED, UNVERIFIED. HTML presence or simulated client-side output is not proof of backend capability.
4. Build a traceability matrix mapping every control to its backend/API/tool/agent contract and test. If no real contract exists, label it honestly and create the missing implementation task rather than faking success.
5. Implement incrementally on a dedicated branch. Preserve existing design and assets unless a change is justified; keep Arabic RTL and English LTR, accessibility, responsive layout, and secure user flows.
6. Enforce server-side secret storage, least-privilege scopes, tenant isolation, output validation, CSRF/SSRF protections where applicable, bounded retries/cost/time, cancellation, audit trails and explicit confirmation for consequential actions.
7. Test happy paths and denied/unauthorized/error cases. Run relevant unit/integration/UI checks. Report tests not run and why. Do not claim production behavior without live evidence.
8. Do not change production secrets, deploy, merge to main, or run destructive migrations without explicit authorization and a rollback plan. Do not fabricate credentials, provider results, users, links, IDs, telemetry or benchmark scores.
9. Reconcile work to the existing Pack/EA plan without renumbering IDs. Attach a concise evidence receipt to each completed unit and keep deferred external/provider/device acceptance separate.
10. Open a PR with a clear scope, screenshots or reproducible UI evidence where available, API/control traceability matrix, test output, risks and exact remaining blockers.

## Required deliverables
- Updated UI and integration code on a branch, not direct main changes.
- Control-to-contract-to-test inventory.
- List of MOCK/DEMO, NOT CONNECTED, NOT BUILT, BLOCKED and UNVERIFIED controls.
- Evidence receipts and Pack/EA mapping.
- Build/test results and PR URL.
- Short Arabic/Darija summary for the owner: changed, verified, not verified, blocked, next action.

**Definition of done:** no advertised control falsely reports success; each claimed real action maps to a real contract and tested result; security and denied-scope paths are tested where applicable; every unimplemented control is explicitly disclosed; no unsupported claim that the entire system is production-ready.
