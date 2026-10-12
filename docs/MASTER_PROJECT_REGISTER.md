# MASTER PROJECT REGISTER — ZUVYR / ZEBRA V2 / SYSTEM X / NOVA8

**Purpose:** cross-project continuity and execution index. This document supplements—not replaces—each project's canonical files, code, receipts, release state, or acceptance evidence.
**Last prepared:** 2026-10-12
**Repository:** https://github.com/ismaildormi/ZUVYR-AI
**Default branch:** main
**Working branch for this documentation proposal:** docs/master-project-unification-2026-10-12

## Scope: do not collapse these into one product

| Project/system | What it is in the available project context | Required treatment |
|---|---|---|
| **ZUVYR (formerly Rox AI)** | Consumer AI platform: chat/research, images, video, audio/voice, Code Studio, computer control/IP, agents/automations, workspace/library, integrations, identity, credits/billing, admin/observability, owned-model and learning/evaluation path. | Treat this repository's live code and canonical ZUVYR roadmap as primary for this project's implementation. |
| **ZEBRA V2** | A named system/architecture in the user's wider System X dossier and intended integrated ecosystem. | Preserve its own original requirements, architecture, identifiers, dependencies and status. Do not assume that every ZEBRA capability is implemented by ZUVYR or that the names are interchangeable. Reconcile against uploaded canonical source files. |
| **SYSTEM X** | Broader master system/dossier/architecture, including Manager/Operator concepts, agents, tools, GitHub/tooling and planned system capabilities. | Keep a separate system-level architecture and requirements inventory; map integrations to ZUVYR/ZEBRA only when supported by explicit source evidence. |
| **NOVA8** | Separate mobile game project. Its continuity files describe a Unity project, V12 execution backlog, iOS build path, Gmail login, ads/leaderboard and monthly giveaway requirements. | Keep separate from the AI platform repository unless the owner explicitly chooses to centralize it. Do not mix its Unity packs into ZUVYR PACK001–150. Track the canonical NOVA8 repository/files separately. |
| **Other named systems/projects** | Any other distinct project, agent suite, app or service discovered in source materials. | Add a row with source, owner/system boundary, dependencies, canonical repository and evidence status. Never silently omit it or merge it into another product. |

## Status vocabulary

- VERIFIED: backed by current, direct evidence appropriate to the claim (tests, commit/CI, production check, controlled acceptance, receipt).
- PARTIAL: some implementation/evidence exists but acceptance is incomplete.
- NOT BUILT: explicitly planned but no implementation evidence found.
- BLOCKED: progress depends on a named unresolved dependency.
- UNVERIFIED: claim exists in a document or UI but implementation/production state has not been confirmed.
- DEFERRED: deliberately postponed by a documented decision; not cancelled and not complete.
- N/A_WITH_EVIDENCE: genuinely inapplicable with evidence; never use to hide unfinished canonical scope.

A source file or mock UI is evidence that the source/UI exists, not proof that a capability works in production. A deployment success is not sufficient by itself to close a feature or pack.

## Current repository facts inspected for this proposal

- Repository: ismaildormi/ZUVYR-AI; public; default branch main; current connector reported admin/push access.
- README declares ZUVYR V1 active development and defines PACK001–PACK150 with EA-001–EA-292 as the canonical V1 acceptance envelope.
- docs/zuvyr/ROADMAP_150.md contains a model-first priority override: PACK094 → PACK095 → PACK096 before PACK084–PACK093, without renumbering. The file itself includes a historical header dated 2026-09-18 / PACK066; that header is not proof of current live progress.
- Historical owner/context notes contain potentially stale or conflicting PACK states. Reconcile fresh main, branches, PRs, receipts, CI, runtime and production evidence before deciding the actual active pack.
- Do not assume this repository contains every file/source for ZEBRA V2, SYSTEM X or NOVA8. Their presence and current implementation must be inventoried explicitly.

## Source inventory required to complete this register

For each discovered source, record: exact path/title, version/commit/date if known, source type, project/system, whether authoritative or historical, identifiers covered, conflicts, and what it proves. Required sources include README, continuity chain, master state/matrix, ROADMAP_150, EA acceptance audit, pack receipts, database migrations/policies/tests, deployment evidence, UI/HTML assets, and any owner-provided dossier/PDF/Markdown/ZIP. Preserve historical 100-Pack and current 150-Pack plans separately.

## Repository policy

This is a continuity index, not a claim that all cross-project materials have already been imported. Do not mark this index complete until all source materials are inventoried and missing artifacts are attached or linked with stable paths. Do not commit secrets, credentials, customer data, unlicensed assets, or unredacted sensitive logs.