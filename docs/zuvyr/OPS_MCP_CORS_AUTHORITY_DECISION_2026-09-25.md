# ZUVYR Ops MCP CORS / Authority Decision — 2026-09-25

Status: **V1 hardening compatibility decision**

## Decision

`zuvyr-ops-mcp` may keep `Access-Control-Allow-Origin: *` for MCP/native/browser transport compatibility **only while CORS is not an authority boundary**.

The protected `/mcp` operation remains owner/admin-authorized by an explicit `Authorization: Bearer ...` header which is revalidated with Supabase Auth and then checked against `profiles.is_admin`. The function does not use ambient browser cookies as authentication, does not return `Access-Control-Allow-Credentials: true`, exposes only the explicitly bounded read-only Ops tool set, applies a per-admin audit-backed rate limit, and returns no secret fields.

Therefore a foreign web origin receiving permission to send a cross-origin request does not gain an authenticated credential by origin alone. An attacker must still possess a valid bearer token for an approved administrator, and a stolen bearer token is an authentication/token-compromise problem independently of CORS.

## Required invariants

Wildcard CORS becomes invalid and this decision must be revisited immediately if any of the following becomes true:

1. The function accepts cookies or any ambient browser credential as authentication.
2. `Access-Control-Allow-Credentials: true` is added.
3. A mutation/deploy/payment/secret/IAM tool is added to this endpoint.
4. Bearer tokens stop being revalidated with Supabase Auth on each protected request.
5. The `is_admin` owner/operator check is removed or weakened.
6. The endpoint starts returning connector credentials, provider tokens, Vault secrets, or equivalent secret material.

If a stable finite browser-origin set becomes a product requirement later, origin allowlisting plus `Vary: Origin` is preferred as an additional defense-in-depth control, provided native/MCP clients without a browser Origin header remain compatible.

## Closure evidence for QH-011

- Source contract asserts wildcard CORS explicitly so a future change is deliberate.
- Source contract forbids credentialed CORS and cookie authentication.
- Source contract requires Bearer parsing, `auth.getUser(token)`, `profiles.is_admin`, audit logging, rate limiting, POST-only protected calls, and the exact read-only tool inventory.
- PACK089 owner authentication acceptance and PACK145 cross-client compatibility must remain green.
- PACK139/148 security rehearsal must re-run this contract and unauthorized 401 / non-admin 403 behavior.

This is `N/A_WITH_EVIDENCE` for an origin allowlist, not a waiver of authentication or authorization controls.
