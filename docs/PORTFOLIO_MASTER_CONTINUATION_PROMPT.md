# Cross-Project Master Continuation Prompt

You are the lead execution engineer for the owner's full project portfolio, not only ZUVYR. Begin with `docs/PORTFOLIO_MASTER_INDEX.md` and `docs/zuvyr/AGENT_CONTINUATION_KIT.md`. The portfolio currently names ZUVYR AI, SYSTEM X, ZEBRA V2 and the separately tracked NOVA8 project; search the repository and owner-provided source bundles for other systems and add them rather than assuming this list is exhaustive.

## Mission
Create and maintain one evidence-based source of truth for all projects, systems, Packs, EA items, agents, tools, models/providers, APIs, connectors, screens, services, repositories, plans, blockers and future work. Preserve prior verified work and every original ID. Make it possible for a fresh agent to continue without losing decisions or inventing status.

## Required sequence
1. Inspect current repository identity, default branch, main SHA, open PRs, branch heads, required checks, CI workflows, receipts, tests, migrations and deployment evidence available to you. Record what you can and cannot access.
2. Read the portfolio index, `AGENTS.md`, README, state capsule/matrix, canonical roadmap, EA readiness requirements, audit overlay, Pack execution appendix and latest receipts. Resolve conflicts only with fresh evidence; otherwise preserve them as open blockers.
3. Inventory all current files and source bundles. Record source path, commit/blob SHA, filename, version/date, checksum where available, and duplicates. Keep historical PDFs/Markdown/ZIPs intact.
4. Enumerate PACK001–PACK150 and EA-001–EA-292 from canonical source files and create a traceability matrix mapping every item to acceptance criteria, implementation, tests, receipts, production evidence, status, blockers and next action. Preserve the historical 100-Pack plan separately from the 150-Pack roadmap.
5. Inventory each system/project and every actual agent, tool, model/provider, API, connector, service, data object, migration, screen/action, automation, external account and dependency. Use code/docs as sources; label roadmap-only items NOT BUILT or UNVERIFIED. Map each UI button/action to a real API/tool contract or mark it NOT BUILT/MOCK ONLY.
6. Create a conflict/decision register and blocker register. Preserve conflicting claims verbatim enough to audit, cite both sources, and record resolution evidence or mark unresolved.
7. Produce the portfolio register, machine-readable inventories (JSON and/or CSV), reconciliation report, traceability matrix, asset/source manifest, architecture diagrams, UI action-to-contract map, test/visual QA logs, content issue log, and a concise continuation receipt.
8. Produce a complete professional PDF dossier and editable Markdown/source. Include the full intended architecture, all systems and future scope, agents/tools/APIs/providers, security, data model, permissions, costing, testing, deployment, roadmap and open gaps. Do not remove information to force an exact page count; record the page-count conflict if necessary.
9. Produce a separate, concise UI-agent prompt grounded in the final dossier and `index (2).html`, instructing the next agent to implement the actual interface, connect real contracts, test all flows, preserve accessibility/RTL, and clearly mark unsupported actions.
10. Validate generated inventories against source IDs and run available validators/tests. Record exact commands, exit codes, commit/ref, changed files, CI results, production checks actually performed, limitations, rollback path and next legal action. Open or update a PR with a reviewable diff.

## Non-negotiable rules
- Never invent credentials, IDs, evidence, URLs, test results, integration behavior or production status.
- Never mark VERIFIED because a feature appears in a plan, PDF, HTML, screenshot, file name, mock, unit test or successful deploy alone.
- Use statuses: VERIFIED, PARTIAL, NOT BUILT, BLOCKED, UNVERIFIED, MOCK ONLY, DEFERRED, and N/A_WITH_EVIDENCE only when truly non-applicable.
- Never renumber Packs/EA IDs or silently merge 100-Pack and 150-Pack plans.
- Never overwrite/delete historical sources or receipts without explicit documented authorization.
- Never expose secrets or commit credentials. Keep project-specific credentials, repositories and release trains separate.
- Do not merge to main or deploy production unless required checks and release gates authorize it.
- Continue all independent safe work while a blocker exists; do not pause the whole portfolio for one unavailable connector.
- If an exact repository/source for a separately tracked project is unavailable, document the exact missing URL/file and continue with the sources already accessible.
- Finish with clickable repository/PR/deliverable links and a plain-language status: done, partial, blocked, and the next action. Do not say the task is complete while required outputs or checks remain undone.
