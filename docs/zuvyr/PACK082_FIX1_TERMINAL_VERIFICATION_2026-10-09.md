# PACK082 FIX1 — Terminal outcome verification (2026-10-09)

Status at PR creation: implementation candidate; not LOCKED_VERIFIED until CI and production identity checks complete.

## Evidence-backed defect
At base main 9029a07e9da8d3abb4974cda5b7bd6bf71085b66, the Browser Agent accepted decision.done === true and transitioned the run to succeeded after reading the current page. It did not require a successful verify action or bind the claimed terminal outcome to fresh visible evidence. This can produce a false success signal.

## Scoped change
- A verify action must identify a non-sensitive visible element and supply expectedText exactly equal to that element's current complete visible text.
- The server normalizes that text and persists only its SHA-256 plus length as verification-specific evidence; no separate raw expectedText field is added.
- Execution re-reads a fresh observation and compares the same element handle, normalized text hash, and length.
- The final run can be marked succeeded only when expectedOutcome is non-empty and the latest action is a succeeded verify action whose matched evidence is tied to that same handle.
- An unverified done decision leaves the run non-successful and returns verificationRequired=true with a reason and a continue path.
- No schema migration, provider call, payment, or live browser session is required for the unit tests.

## Tests added
- Correct visible text is accepted; changed text is rejected.
- A model cannot nominate text that was not in the current observation.
- A verify action without a handle/hash contract is rejected.
- A failed/missing verification or any action after verification blocks terminal success.
- A successful final verification plus a non-empty expected outcome passes the pure terminal guard.

## Boundary
This is a browser-visible postcondition guard. It is not yet an authoritative database-state or side-effect verifier. PACK090 still needs a shared cross-surface verifier for canonical task state, exact billing, and the STOP/cancel/revoke cases.

## Rollback
Revert only the scoped changes in browserAgentPolicy.js, browserAgentController.js, and test-pack082-browser-agent.js to the base blobs recorded in the audit receipt. No database rows or migrations are changed.
