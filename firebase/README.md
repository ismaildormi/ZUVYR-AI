# VELOX — Firebase backend (authentication + monthly competition + giveaway)

This folder contains everything needed to make VELOX's Google sign-in, monthly
Top-10 competition, and giveaway readiness **server-authoritative**.

> STATUS: the client contract, security rules, Cloud Functions, and pure-logic
> tests are implemented and locally verified. The **live, server-enforced
> deployment is BLOCKED** until these resources are deployed to a Firebase
> project with real credentials and the emulator-dependent tests are run.
> See the status table at the bottom.

---

## 1. Google sign-in → Firebase Auth (token refresh handled)

The game exchanges a Google ID token for a Firebase identity via
`identitytoolkit.googleapis.com/v1/accounts/signInWithIdToken` (see
`AuthProviders.FirebaseAuthClient`). Anonymous sign-up
(`accounts:signUp`) is the fallback. The result is a pair of tokens:

- **Firebase ID token** — what authenticates RTDB reads and Cloud Function calls;
- **refresh token** — used by `AccountSession.RefreshSessionAsync` to keep the
  session alive. ID tokens last ~1 hour; `AccountSession.EnsureFreshTokenAsync`
  refreshes transparently before expiry instead of failing silently.

Firebase Console → Authentication → Sign-in method → enable **Google**.

The client handles: Google cancellation (returns null token → error), invalid
tokens (401), expired sessions (refresh), and network errors (logged, not
fatal). Tokens are never logged.

## 2. Score submission (server-authoritative)

Clients **never write to the Realtime Database directly**. `SubmitScoreAsync`
POSTs `{ name, score }` to the `submitScore` Cloud Function with
`Authorization: Bearer <Firebase ID token>`. The function:

1. verifies the caller's Firebase Auth ID token → stable UID identity;
2. computes the competition period server-side (UTC, `yyyy-MM`);
3. rejects writes to a finalized period;
4. validates the score (range/positivity) and name (server is authoritative);
5. writes `leaderboard/{period}/{uid}` keeping the player's **best** score
   (no silent downgrade) via a **Firebase transaction**, so concurrent
   lower-score submissions cannot overwrite a higher one (atomic, TOCTOU-safe).

Because the caller is authenticated, one player cannot overwrite another's
score. The client-side checks are defense-in-depth only. Scores must be
finite integers in `0..1e12`; non-integer/out-of-range scores are rejected.
Only HTTP `POST` is accepted.

> ANTI-CHEAT LIMITATION: the server enforces identity, ownership, schema, and
> finalization, but it cannot prove a submitted score reflects actual gameplay.
> A client can still replay/forge a valid submission for its own UID. This is
> **NOT cheat-proof**. Real anti-cheat requires server-side gameplay validation
> or trusted reporting, which is not implemented here. Offline
> `LocalLeaderboardService` scores are clearly separated from official ones.

## 3. Monthly rollover (idempotent, non-destructive)

`functions/monthlyReset.js` runs on a UTC schedule (`0 0 1 * *`, 00:00 on the
1st). For the PREVIOUS month it:

1. archives `leaderboard/{previous}` → `archive/{previous}` (immutable history);
2. removes `leaderboard/{previous}` (the new month starts empty).

**Idempotent**: if `archive/{previous}` already exists, it skips — a re-run
cannot destroy the archive or delete history twice. The current month is never
touched, so there is no per-device or global reset. Previous periods are
preserved as immutable history (preferred over destructive deletion).

## 4. Finalize / verify / award (admin-gated, auditable)

Giveaway readiness is gated behind admin operations. All three require the
caller's UID to be listed in the RTDB `config/adminUids` allowlist and log the
acting admin for audit.

- **`finalizeMonth`** — snapshots a month's official Top-10 into the
  **immutable** node `competition/{month}/final` and freezes the ranking.
  **Atomic + idempotent** (Firebase transaction): an already-finalized month is
  never overwritten, even under concurrent admin calls. Once finalized,
  `submitScore` refuses further writes for that period.
- **`verifyWinners`** — records verification of the Top-3 (from the finalized
  snapshot). `body: { "verified": { "<uid>": { "verified": bool, "note": "" } } }`.
  `verified` must be exactly `true` (truthy strings are rejected). The month is
  format-validated before any DB read (no path traversal).
- **`awardPrizes`** — refuses to award unless all Top-3 are verified, then
  records the award under `competition/{month}/award`. **Atomic + idempotent**:
  an already-recorded award is never overwritten, so duplicate calls cannot
  award twice. Prizes are never awarded on client-reported scores alone.

All three are `POST`-only and require an admin UID from `config/adminUids`.
A request for month X never affects month Y (the month is validated and used
consistently in every DB path).

No unnecessary PII is stored: entries carry `uid`, sanitised `name`, `score`,
`month`, `timestamp` only.

## 5. Realtime Database schema

```
leaderboard/
  {yyyy-MM}/                 <- live competition period (UTC)
    {firebase-uid}: { id, name, score, month, timestamp }
archive/
  {yyyy-MM}/                 <- immutable historical snapshots (rollover)
competition/
  {yyyy-MM}/
    final:        { month, finalizedAt, finalizedBy, entries: [Top-10] }
    verification: { month, verifiedAt, verifiedBy, winners: [Top-3] }
    award:        { month, awardedAt, awardedBy, winners: [Top-3] }
config/
  adminUids: { "<uid>": true }   <- admin allowlist (set via admin SDK)
```

## 6. Security rules (`rules/leaderboard.rules.json`)

- `leaderboard/$period`: `.read: auth != null`, `.write: false` (clients can't
  write anywhere — `$uid` is also `.write: false`). The Cloud Functions are the
  only writers (via the admin SDK, which bypasses client rules). Ownership is
  enforced **in the `submitScore` function**: the verified caller's UID is the
  only node written (`leaderboard/{period}/{uid}`).
- Per-`$uid` `.validate` documents the schema (`id === $uid`,
  `month === $period`, score in `0..1e12`, name length `0..24`, numeric
  timestamp) and is defense-in-depth if direct writes are ever re-enabled.
- `archive/$period`, `competition/$period/{final,verification,award}`:
  read for authenticated users, **write denied** to clients.
- `config`: **no client read or write** (`.read: false`, `.write: false`).
  Admin UIDs are NOT client-readable (information-disclosure hardening); the
  Cloud Functions read the allowlist via the admin SDK, which bypasses rules.

Deploy:

```
firebase deploy --only database:rules
```

## 7. Cloud Functions

| Function | Type | Purpose |
|---|---|---|
| `submitScore` | HTTPS | Server-authoritative score submission (Bearer auth). |
| `monthlyReset` | Pub/Sub schedule | Idempotent monthly archive + rollover. |
| `finalizeMonth` | HTTPS | Admin: snapshot + freeze a month's Top-10. |
| `verifyWinners` | HTTPS | Admin: record Top-3 verification. |
| `awardPrizes` | HTTPS | Admin: award prizes (requires verified Top-3). |

Deploy:

```
cd firebase/functions && npm install
firebase deploy --only functions
firebase deploy --only database:rules
```

## 8. Configuration in the Unity Inspector

`AccountSession.firebaseConfig`:

| Field | Example |
|---|---|
| `webApiKey` | `AIza...` (Firebase Web API key) |
| `projectId` | `velox-prod` |
| `requestUri` | `https://velox.example.com` (OAuth redirect, matches Google Cloud) |
| `databaseUrl` | `https://velox-prod.firebaseio.com` |
| `submitScoreEndpoint` | `https://us-central1-velox-prod.cloudfunctions.net/submitScore` |
| `monthlyResetEndpoint` | `https://us-central1-velox-prod.cloudfunctions.net/monthlyReset` |
| `finalizeEndpoint` | `https://us-central1-velox-prod.cloudfunctions.net/finalizeMonth` |

`AccountSession.googleWebClientId`: the OAuth **web client id** for your app.

To set admins: write UIDs to `config/adminUids` via the Firebase console / admin
SDK.

## 9. Testing

- **Offline C# harness** (`velox-verify/build.sh`): 78 tests covering period
  math (incl. Dec→Jan boundaries), score validation, name sanitisation
  (incl. Unicode alignment), Top-10/tie-breaking (incl. full-tie name break),
  best-score preservation (no rewrite on lower score), finalize/frozen/
  idempotent, historical preservation, token expiry, and MiniJson parsing.
  **GREEN 78/78.**
- **Node pure-logic tests** (`firebase/functions/test/functions.test.js`):
  51 tests for server-side period/ranking/sanitisation logic, the atomic
  `keepBest` merge, and idempotent `shouldFinalize`/`shouldAward`.
  Run `node test/functions.test.js`. **GREEN 51/51.**
- **JavaScript syntax + JSON validation**: `node --check` on every function
  file; `JSON.parse` on the rules, firebase.json, and package.json. **GREEN.**
- **Firebase Emulator Suite**: NOT available in this sandbox. Emulator-driven
  integration tests are **BLOCKED**. Prepared test cases (run when a Firebase
  CLI + project are available via `firebase emulators:start`):
  - rules: unauthorized write rejected; cross-UID write rejected; invalid
    schema rejected; `config` client-read denied.
  - `submitScore`: missing/expired/mismatched token → 401; invalid/non-integer
    score → 400; finalized period → 403; concurrent lower-after-higher keeps
    higher (transaction); replay is idempotent (`updated:false`).
  - `finalizeMonth`/`verifyWinners`/`awardPrizes`: non-admin → 403; invalid
    month → 400; GET/other method → 405; duplicate finalize → idempotent;
    award before verification → 400; duplicate award → idempotent (no double).
  - `monthlyReset`: Dec→Jan boundary archives the correct prior month;
    archive-retry does not destroy history.

## 10. Security notes

- Never commit service-account JSON or OAuth client secrets.
- Never log ID tokens or refresh tokens (the client does not log them).
- The offline `LocalLeaderboardService` is for QA only; it is never presented
  as a verified global ranking.
- Writing a rules JSON or a JS file does **not** deploy it — run
  `firebase deploy` and confirm via the console.
- **Residual race (documented):** `submitScore` checks finalization before the
  write; an admin `finalizeMonth` firing in the same instant as a score write
  could let that write land in a period that is being finalized. The window is
  tiny and admin-gated; closing it fully would require the finalization flag to
  live under the same node the score transaction locks (a future hardening).
- **Token storage:** the refresh token is stored in `PlayerPrefs` (plaintext
  on most platforms). This is a known limitation of the Unity offline harness;
  a production build should use the OS keychain/Keystore via a secure-storage
  plugin. The ID token is kept in memory only.
- **Reads do not auto-refresh:** `GetTopAsync`/`GetFinalizedAsync` use the
  current ID token without a pre-refresh; an expired token yields an empty
  read (fail-safe, no crash). Submissions call `EnsureFreshTokenAsync` first.

## 11. Status table

| Area | Status |
|---|---|
| Google → Firebase token exchange | VERIFIED (contract implemented; live sign-in test BLOCKED — needs real Google/Firebase creds) |
| Token refresh / expiry handling | VERIFIED (client logic tested; live refresh BLOCKED) |
| Score submission (server-authoritative) | VERIFIED (atomic best-score transaction + validation; HTTP integration BLOCKED — emulator) |
| Concurrent submission safety | VERIFIED (pure `keepBest` logic tested; transaction integration BLOCKED — emulator) |
| Monthly ranking (UTC, consistent month id) | VERIFIED (period math tested, incl. Dec→Jan) |
| Historical records (archive, immutable) | VERIFIED (archive-before-delete preserves the only copy; rollover integration BLOCKED — emulator) |
| Server security (rules + functions) | PARTIAL (artifacts hardened: config no client-read, POST-only, month validation, strict bool; rules/functions deployment + emulator tests BLOCKED) |
| Giveaway readiness (finalize/verify/award) | VERIFIED (atomic idempotent model + pure logic tested; live BLOCKED) |
| Anti-cheat beyond ownership | NOT BUILT (client can forge own-UID scores — not cheat-proof) |
| Admin config disclosure | FIXED (`config` no longer client-readable) |
| Residual finalize-vs-submit race | DOCUMENTED (tiny admin-gated window; future hardening noted) |
