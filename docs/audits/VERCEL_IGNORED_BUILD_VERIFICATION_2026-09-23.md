# Vercel ignored-build verification — 2026-09-23

Purpose: one-shot non-product verification after the rolling Vercel build-rate-limit window.

Expected contract: commits that do not modify `frontend/` are canceled by Vercel's Ignored Build Step instead of consuming a frontend build. If comparison state is unavailable, the configuration fails open to a real build.

Pre-verification evidence:
- `vercel.json` on `main` uses `VERCEL_GIT_PREVIOUS_SHA` and scopes the diff to `frontend/`.
- Main commit `79ffb06446fc974bfaea7113c559b1710d2e40f8` was reported by Vercel as `Canceled by Ignored Build Step`.
- The active production frontend remains the READY deployment from commit `846c34ba80c0bf0232d5f1138546568b79e6e620`.

This file itself is intentionally docs-only and does not modify `frontend/`, product runtime, provider execution, billing, or PACK089/PACK090 state.
