# Conflict and Blocker Register

Status: initial register, open for reconciliation. Items below are not silently resolved.

| ID | Topic | Current record | Status | Required action |
|---|---|---|---|---|
| C-001 | Historical master PDFs | Three known canonical PDFs have 92, 96 and 113 pages; older sources may overlap or disagree. | UNVERIFIED | Section-level content comparison and loss report before selecting master. |
| C-002 | 90-page requirement | Brief asks exact 90 pages and zero information loss/readable content. | CONFLICT RISK | Test feasibility after reconciliation; never delete content to hit page count. |
| C-003 | 100-Pack vs 150-Pack | Both plans exist; 150-Pack roadmap states it extends 001–099 and keeps 100 as hardening checkpoint. | DOCUMENTED | Keep separate; show lineage/mapping, never merge numbering. |
| C-004 | Active Pack sequence | Roadmap dated 2026-09-18 records PACK094→095→096 before PACK084–093; older handoff notes may name other active Packs. | NEEDS CURRENT RECHECK | Inspect main SHA, newest receipts, branches and PRs; do not trust dated text alone. |
| C-005 | PACK089 Google Drive OAuth | Prior context says real OAuth Client ID/Secret not found and acceptance is blocked; this must be rechecked securely. | PRIOR BLOCKER / UNVERIFIED CURRENTLY | Supply legitimate credentials via secret manager; run connect, granted-scope, denied-scope, revoke and audit tests. Never fabricate credentials. |
| C-006 | All-project coverage | Current authenticated repository listing exposed ZUVYR-AI only. User says include ZUVYR, ZEBRA V2, SYSTEM X and every other project/system. | PARTIAL INVENTORY | Search all connected repositories and add owner-provided repository links/artifacts. Keep projects distinct. |
| C-007 | UI vs runtime | Standalone showcase HTML may contain demo behavior; UI presence is not backend proof. | ACCEPTANCE RULE | Map each control to real API/contract/test and mark mock/unconnected states. |
| C-008 | Production state | No full current service/deployment audit performed in this initial documentation commit. | UNVERIFIED | Inspect authorized Vercel/Railway/Supabase evidence before production claims. |
| C-009 | Current repository security/CI | Earlier context mentioned PR #135 and npm audit findings; not freshly confirmed in this documentation pass. | NEEDS CURRENT RECHECK | Inspect current PR, lockfile, audit output and CI; avoid `npm audit fix --force` without impact analysis. |

## Resolution format
For each conflict, record: exact claim, source path/page/line, source date, current evidence, decision owner/decision, effect on implementation, follow-up task, and verification receipt.
