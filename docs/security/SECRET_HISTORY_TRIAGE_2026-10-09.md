# Secret History Gate triage — 2026-10-09

Status: BLOCKED pending a narrow, reviewed scanner-baseline decision. No suppression is included in the PACK082 FIX1 change.

GitHub Actions run 36996996723, job 110805879946, reported 160 historical matches on 2026-10-02:
- 154 generic-api-key findings
- 6 stripe-access-token findings

The findings were inspected without copying any credential-like values into this document. Representative current and historical snapshots point to browser-publishable Supabase configuration, a non-credential digest, and a non-production test fixture. No live credential was identified among the 160 reported matches. This does not certify all repository history as secret-free.

The exact matches appear across historical preview/configuration files and test fixtures. Because the gate scans history, removing a current copy would not clear those historical findings. Do not merge or deploy the new runtime change while the gate is red. The next safe step is a reviewed, exact-fingerprint baseline (or rule-specific public-key/test-fixture allowlist) followed by a fresh full-history scan. Do not add a path-wide or rule-wide ignore, and do not rewrite repository history to evade the scan.

Current code-change candidate base: 9029a07e9da8d3abb4974cda5b7bd6bf71085b66
