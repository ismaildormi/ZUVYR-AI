# PACK090 — Fresh Universal Browser Gap Audit

Date: 2026-10-09
Base main: 9029a07e9da8d3abb4974cda5b7bd6bf71085b66
Status: PARTIAL — fresh audit recorded; PACK090 remains active and is not LOCKED_VERIFIED.

## Evidence source order and runtime identity

- GitHub main was 9029a07e9da8d3abb4974cda5b7bd6bf71085b66; there were no open pull requests at audit start.
- The latest ready Vercel production deployment observed was dpl_DSjPGX8jWXnJAx3k8dSiCFnWPjC4, source commit 9a1527df295de260777e3a2f73972c1b064858ae. The intervening main merge to 9029a07e9da8d3abb4974cda5b7bd6bf71085b66 changes only continuity/planning/evidence files, not frontend/backend runtime files. The canceled newer Vercel build therefore does not by itself prove a runtime mismatch; the last READY deployment remains the runtime identity.
- Railway production services were online with SUCCESS deployments: backend 13b888ce-e6d9-4d31-a910-2462891f5340; worker 930ffedc-7b57-4463-8d6b-2d983961f53a; maintenance runner last succeeded at 2026-10-09T08:01:16.530Z. No new paid provider action was performed.
- Supabase project tqoqsgaymygmqrzddvtu is the configured production DB. This audit used read-only project/schema evidence only; no migration or customer-row mutation was performed.
- Public URL probes through the available web reader were not accessible. Deployment metadata is verified; a live authenticated product E2E was not performed.

## Cross-surface findings

| Surface | Evidence-backed state | Remaining acceptance gap |
|---|---|---|
| Browser runtime / PACK081 | Authenticated routes exist at /api/cloud-browser; Browserbase-backed provider and owner-scoped session repository are present. | M17 pricing/credential/real-session acceptance is not proven in this run; no billable browser session was created. |
| Browser Agent / PACK082 | Authenticated routes exist at /api/browser-agent; action records, permission-center approvals, stop/cancel behavior and idempotency are present in source/tests. | A terminal-success false positive was found: done=true alone could mark a run succeeded. The PR candidate adds a fresh visible-text verify gate; CI and production deployment remain to be verified. |
| Automation / PACK088 | PACK088 88A–88E was previously LOCKED_VERIFIED; the maintenance runner succeeded on 2026-10-09. | Cross-surface browser-to-automation handoff and exact end-to-end billing are not demonstrated by that scheduler health signal alone. |
| Connections / PACK089 | Latest owner acceptance evidence shows read/list passed, write denied, disconnect/revoke passed, post-revoke tool call denied, and Vault/token references cleared. The connection remains revoked. | A new owner-authorized connection flow was not re-run in this automation; do not treat this audit as new OAuth acceptance. |
| 3D / PACK083–084 | 3D capabilities, history, download and cancel routes exist. | M18 real provider/price/asset viewer/export acceptance remains unproven here; no paid generation was attempted. |
| Paired device / PACK085–087 | Device agent, pairing/session and STOP/undo engineering source/tests exist. | M19 real physical-device install/start/uninstall acceptance is not proven here. |
| Exact billing / shared usage ledger | Existing reservation/settlement/refund paths and accounting tests exist. | LIVE_BILLING_ALLOWED remains false; no real cross-surface paid flow was run. Mocked accounting tests do not close the live gate. |

## Architecture finding

The current server mounts browser sessions and browser-agent runs as separate authenticated route families, while automation, connections, and 3D have their own routes. The audit did not find a single universal broker/authority path that proves the same task/session/permission/STOP/cost contract across all eligible surfaces. This is a gap to close within PACK090, not permission to implement the deferred universal cloud-browser amendment early in unrelated packs.

## Research-informed hardening in this change

ThinkingBox and AutoSynthData both emphasize executable verification of outcomes rather than accepting a plausible completion statement. PACK082 FIX1 applies the smallest safe subset in the PR candidate: a successful Browser Agent run must end with a fresh, exact visible-text verification. It does not claim to verify arbitrary database state; PACK090 still needs authoritative per-surface postcondition checks and live acceptance.

## Security CI finding

The Secret History Gate run 36996996723 reported 160 historical pattern matches: 154 generic-api-key and 6 stripe-access-token findings. Representative current/historical matches were classified as public publishable configuration, a non-credential digest, or a test-only fixture. This PR intentionally does not suppress these findings; the gate remains a merge blocker until the repository's security baseline is corrected through an explicitly reviewed, narrow allowlist.

## Gates and next step

- M17: BLOCKED / not newly verified — browser provider pricing/credentials and authorized live-session evidence.
- M18: BLOCKED / not newly verified — 3D live asset/export acceptance and provider economics.
- M19: BLOCKED / not newly verified — physical-device acceptance.
- PACK090 lock: NOT ALLOWED until scoped tests, exact deployment identity, real authorized cross-surface evidence, cost/accounting proof, STOP/cancel/revoke proof, rollback/recovery proof, receipt hash and canonical state reconciliation are complete.
- Next step after this PR's CI/deployment: record the FIX1 result, then continue PACK090 with the shared authority/terminal-state/billing matrix. Do not advance to PACK091.
