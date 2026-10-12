# System-of-Systems Master Context

**Purpose:** durable handoff for the complete ecosystem—not only ZUVYR, ZEBRA V2, or SYSTEM X. This folder is the navigation and execution contract for AI agents continuing work.

## Start here
1. [Master context and scope](MASTER_CONTEXT.md)
2. [Current verified baseline and evidence limits](CURRENT_STATE_AND_EVIDENCE.md)
3. [Consolidated execution roadmap](EXECUTION_ROADMAP.md)
4. [UI implementation agent prompt](UI_AGENT_PROMPT.md)
5. [Repository and source inventory](SOURCE_REGISTER.md)
6. [Conflict / blocker register](CONFLICTS_AND_BLOCKERS.md)

## Canonical source already in this repository
- [ZUVYR 001–150 roadmap](../zuvyr/ROADMAP_150.md) — preserve its Pack IDs and EA IDs; it explicitly states historical status is not newly verified.
- [Architecture](../../ARCHITECTURE.md)
- [Agent instructions](../../AGENTS.md)
- [Changelog](../../CHANGELOG.md)
- [Historical 100-Pack plan](../../ZUVYR_V1_100_PACK_MASTER_PLAN_REV1_2_M08_TEST_MODE_DEFERRAL_2026-09-13.md) — historical plan, not interchangeable with the 150-Pack roadmap.

## Status vocabulary
`VERIFIED`, `PARTIAL`, `NOT BUILT`, `BLOCKED`, `UNVERIFIED`, and `DEFERRED`. A document, UI control, plan entry, or green CI result alone does not prove a production capability works.

## Scope caveat
At this point, the connected GitHub account exposed one repository for owner `ismaildormi`: `ismaildormi/ZUVYR-AI`. This does **not** prove it contains every project or artifact ever discussed. The source register explicitly lists that coverage gap. Add further repositories and source files only after discovering them from the owner's links/uploads or authenticated repository list.

## Safe continuation rule
Work on a dedicated branch, preserve existing work, attach evidence to status changes, run relevant checks, and open a PR. Do not merge to `main`, alter production services, create fake credentials, or claim live verification without evidence.
