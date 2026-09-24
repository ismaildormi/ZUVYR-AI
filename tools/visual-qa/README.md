# ZUVYR Visual QA

This harness renders the real `frontend/zuvyr-suite-v1.js` and `frontend/zuvyr-suite-v1.css` with deterministic, non-customer fixtures so product layout and interaction states can be inspected without provider spend or production mutations.

A run fails when any covered desktop/mobile view has:

- critical, serious, or moderate axe accessibility violations;
- horizontal viewport overflow;
- duplicate DOM IDs;
- missing expected views;
- a missing title or a broken `null` / `undefined` rendered surface;
- browser console/page errors;
- unnamed visible controls after implicit and explicit labels are resolved.

Every run also captures immutable screenshots plus visible copy, computed colors, typography, control geometry, and a public-production HTTP/screenshot probe. A green CI check is not enough for a first-time or materially changed surface: the artifact screenshots must still be visually reviewed before the corresponding visual-acceptance ledger item is closed.
