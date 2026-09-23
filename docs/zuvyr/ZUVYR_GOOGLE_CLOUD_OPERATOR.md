# ZUVYR Google Cloud Operator

## Purpose

`zuvyr-google-cloud-operator` is private project tooling for operating and troubleshooting Google Cloud in support of ZUVYR. It is not a replacement for ZUVYR's existing canonical runtime, billing, permission, connection, or audit systems.

## Plugin identity

- Plugin name: `zuvyr-google-cloud-operator`
- Plugin ID: `plugins_6ab351e30598819184931902ec08f668`
- Version: `0.1.0`
- Release ID: `pluginrel_6ab351e446108191adb2fd45bdcb854d`
- Visibility: private

## Intended responsibilities

The operator is intended to assist with:

- Google Cloud resource inspection and operations for ZUVYR.
- Safe deployment support, including Cloud Run-oriented workflows where explicitly selected by the project plan.
- Diagnostics, logs, health checks, and incident investigation.
- IAM and secret-boundary review without exposing secret values.
- Cost and capacity checks.
- Migration planning and execution support without silently replacing Railway, Vercel, Supabase, or another canonical production dependency.

## ZUVYR operating boundaries

The operator must follow the same project invariants as every other ZUVYR execution surface:

1. Fresh production evidence overrides stale handoff material.
2. One active main Pack at a time.
3. Do not advance a Pack until its required state is `LOCKED_VERIFIED`.
4. Preserve unrelated production state and avoid destructive operations.
5. Never expose or invent credentials, tokens, secrets, resource IDs, paths, regions, or selectors.
6. Use read-first diagnostics before a scoped write.
7. A deployment, test, or configuration change is not complete without the required live evidence.
8. Do not create a parallel billing, permission, connection, ownership, or audit system when the canonical ZUVYR systems already exist.
9. `LIVE_BILLING_ALLOWED=false` remains in force unless the owner explicitly authorizes a narrow live-billing gate.

## Relationship to PACK089

PACK089 — Skills / Plugins / MCP / Connections remains the active Pack at the time this tooling is registered. Phases 89A through 89D are already `LOCKED_VERIFIED`; 89E non-external acceptance is complete.

The Google Cloud operator is an additional project operations capability. Creating or registering it does **not** by itself close PACK089 and does not replace the PACK089 Google Drive OAuth acceptance contract.

Fresh Railway production evidence shows the backend environment now contains variable names for:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_API_KEY`

Values are intentionally redacted. Variable-name presence is not proof that the OAuth credentials are non-empty, valid, correctly configured at Google, or accepted by the ZUVYR production flow.

## Remaining PACK089 gate

The next legal step is to validate the configured OAuth client through ZUVYR's production OAuth start/consent flow without revealing secret values, then complete the real owner-scoped Google Drive acceptance sequence:

`connect -> granted-scope tool call -> denied-scope proof -> disconnect/revoke -> post-revoke denial -> audit persistence -> Vault/plaintext-secret cleanliness`

If Google interactive consent requires the owner, that human authorization boundary must be completed before PACK089 can be marked `LOCKED_VERIFIED`.

PACK090 must not start before PACK089 closes canonically.

## Canonical references

Use the repository continuity sources and `ZUVYR_LIVE_PROJECT_STATE` for the current Pack/status. Historical status statements must not override fresher production evidence.
