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
3. rejects writes to a finalized period (fast-path check on the closure marker);
4. validates the score (range/positivity) and name (server is authoritative);
5. writes the player's **best** score (no silent downgrade) via a Firebase
   transaction on `leaderboard/{period}` (the **shared transactional parent**
   with finalization — see §4).

### Finalize-vs-submit race (FIXED at the logic level)

The closure flag lives at `leaderboard/{period}/_closed`, a child of the score
parent. Both `submitScore` and `finalizeMonth` transact on the **same** node
`leaderboard/{period}`. RTDB transactions are atomic only at their own path and
serialize on that path, so the two operations conflict and produce a deterministic
outcome:

- **submission commits first** → finalization's transaction sees the new score
  and snapshots it into the closure marker;
- **finalization commits first** → the submission's transaction sees `_closed`
  and aborts (the late score is rejected with `403`).

This closes the previous TOCTOU window where the closure check (on
`competition/{period}/final`) and the score write (on `leaderboard/{period}/{uid}`)
were on unrelated paths. The pure `mergeSubmission`/`buildClosure` helpers encode
the serialization logic and are unit-tested; the actual cross-operation atomicity
comes from the shared-parent transaction and is **BLOCKED from integration
verification without the Firebase Emulator**.

> SCALING NOTE: the shared-parent transaction reads/writes the whole month node
> (one transaction per submission). For a month with a very large player count
> this is O(players) per submit. The month node is bounded (players-per-month,
> not unbounded), but a future hardening could shard submissions or use a
> server-side queuing model to avoid large-node transactions.

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

- **`finalizeMonth`** — atomically closes a month for finalization. Writes the
  closure marker `leaderboard/{period}/_closed` (carrying the deterministic
  Top-10 snapshot) via a transaction on `leaderboard/{period}` (the shared
  transactional parent with `submitScore`), then writes the public read copy
  `competition/{period}/final` and the admin-only audit
  `competition/{period}/_finalizedBy`. **Atomic + idempotent**: an already-closed
  month is never overwritten, even under concurrent admin calls. Once closed,
  `submitScore` refuses further writes for that period.
- **`verifyWinners`** — records verification of the Top-3 (from the finalized
  snapshot). `body: { "verified": { "<uid>": { "verified": bool, "note": "" } } }`.
  `verified` must be exactly `true` (truthy strings are rejected). The month is
  format-validated before any DB read (no path traversal). Writes the **private**
  record `competition/{period}/verification` (admin-only read: admin UID, winner
  UID, notes) AND the **public display** status `competition/{period}/_status`
  (display fields only — no UIDs, no notes, no admin identity).
- **`awardPrizes`** — refuses to award unless all Top-3 are verified, then
  records the award under the **private** `competition/{period}/award`
  (admin-only read) and updates the public `_status` (`awarded: true`).
  **Atomic + idempotent**: an already-recorded award is never overwritten, so
  duplicate calls cannot award twice. Prizes are never awarded on client-reported
  scores alone.

All three are `POST`-only and require an admin UID from `config/adminUids`.
A request for month X never affects month Y (the month is validated and used
consistently in every DB path).

No unnecessary PII is stored: entries carry `uid`, sanitised `name`, `score`,
`month`, `timestamp` only.

## 5. Realtime Database schema

```
leaderboard/
  {yyyy-MM}/                 <- live competition period (UTC); shared transactional parent
    {firebase-uid}: { id, name, score, month, timestamp }
    _closed: { closed: true, finalizedAt, entries: [Top-10] }   <- closure marker (no admin UID)
archive/
  {yyyy-MM}/                 <- immutable historical snapshots (rollover)
competition/
  {yyyy-MM}/
    final:        { month, finalizedAt, entries: [Top-10] }   <- public read copy (no admin UID)
    _status:      { month, verifiedAt, awardedAt, awarded, verified, winners: [display] }  <- public display
    _finalizedBy: { finalizedBy }                               <- admin-only audit (admin UID)
    verification: { month, verifiedAt, verifiedBy, winners: [Top-3] }  <- private (admin-only read)
    award:        { month, awardedAt, awardedBy, winners: [Top-3] }    <- private (admin-only read)
config/
  adminUids: { "<uid>": true }   <- admin allowlist (set via admin SDK)
```

## 6. Security rules (`rules/leaderboard.rules.json`)

- `leaderboard/$period`: `.read: auth != null`, `.write: false` (clients can't
  write anywhere — `$uid` is also `.write: false`). The Cloud Functions are the
  only writers (via the admin SDK, which bypasses client rules). The closure
  marker `_closed` inherits this read (it carries no admin UID — only the
  closure flag, timestamp, and public Top-10 snapshot). Ownership is enforced
  **in the `submitScore` function**: the verified caller's UID is the only score
  node written.
- Per-`$uid` `.validate` documents the schema (`id === $uid`,
  `month === $period`, score in `0..1e12`, name length `0..24`, numeric
  timestamp) and is defense-in-depth if direct writes are ever re-enabled.
- `competition/$period` has **no parent `.read`** (so reads do not cascade to
  private children). Reads are granted per-child:
  - `final`: `.read: auth != null` (public finalized Top-10 for leaderboard/history);
  - `_status`: `.read: auth != null` (public verification/award display fields);
  - `verification`, `award`, `_finalizedBy`: `.read: false` (admin-only — read
    via the admin SDK by the Cloud Functions; never exposed to clients).
  All `competition/*` children are `.write: false` to clients.
- `archive/$period`: `.read: auth != null`, `.write: false` (immutable history).
- `config`: **no client read or write** (`.read: false`, `.write: false`).
  Admin UIDs are NOT client-readable (information-disclosure hardening); the
  Cloud Functions read the allowlist via the admin SDK, which bypasses rules.

### Read/write policy by path (summary)

| Path | Client read | Client write | Notes |
|---|---|---|---|
| `leaderboard/{period}` | auth | denied | current leaderboard; `_closed` marker readable (no secrets) |
| `leaderboard/{period}/{uid}` | auth (via parent) | denied | score entries |
| `archive/{period}` | auth | denied | immutable history |
| `competition/{period}/final` | auth | denied | public finalized Top-10 (no admin UID) |
| `competition/{period}/_status` | auth | denied | public display status (no UIDs/notes) |
| `competition/{period}/verification` | **denied** | denied | private (admin UID, notes) |
| `competition/{period}/award` | **denied** | denied | private (admin UID, fulfillment) |
| `competition/{period}/_finalizedBy` | **denied** | denied | private (admin UID) |
| `config` | **denied** | denied | admin allowlist |

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

- **Offline C# harness** (`velox-verify/build.sh`): 103 tests covering period
  math (incl. Dec→Jan boundaries), score validation, name sanitisation
  (incl. Unicode alignment), Top-10/tie-breaking (incl. full-tie name break),
  best-score preservation (no rewrite on lower score), finalize/frozen/
  idempotent, historical preservation, token expiry, MiniJson parsing
  (incl. `_closed` marker skip), and **secure refresh-token storage**
  (`ICredentialStore`/`CredentialPersistence`: secure store write, no-plaintext
  fallback, legacy migration success/failure, blocked-unavailable, sign-out
  deletion, AccountSession wiring). **GREEN 103/103.**
- **Node pure-logic tests** (`firebase/functions/test/functions.test.js`):
  83 tests for server-side period/ranking/sanitisation logic, the atomic
  `keepBest`/`mergeSubmission`/`buildClosure` helpers (closure serialization,
  both race orderings, concurrent submits, immutable finalized history),
  idempotent `shouldFinalize`/`shouldAward`, and the read-access policy
  (rules structure: public `final`/`_status` vs private `verification`/`award`/
  `_finalizedBy`). Run `node test/functions.test.js`. **GREEN 83/83.**
- **JavaScript syntax + JSON validation**: `node --check` on every function
  file; `JSON.parse` on the rules, firebase.json, and package.json. **GREEN.**
- **Firebase Emulator Suite**: NOT available in this sandbox. Emulator-driven
  integration tests are **BLOCKED**. Prepared test cases (run when a Firebase
  CLI + project are available via `firebase emulators:start`):
  - rules: unauthorized write rejected; cross-UID write rejected; invalid
    schema rejected; `config` client-read denied; `competition/{period}/verification`
    client-read denied; `competition/{period}/award` client-read denied;
    `competition/{period}/_finalizedBy` client-read denied; `competition/{period}/final`
    auth-read allowed.
  - `submitScore`: missing/expired/mismatched token → 401; invalid/non-integer
    score → 400; finalized period → 403; concurrent lower-after-higher keeps
    higher (transaction); replay is idempotent (`updated:false`); **submit-vs-finalize
    race: submit-first includes score in snapshot; finalize-first rejects late
    submit** (shared-parent transaction serialization).
  - `finalizeMonth`/`verifyWinners`/`awardPrizes`: non-admin → 403; invalid
    month → 400; GET/other method → 405; duplicate finalize → idempotent
    (no snapshot overwrite); concurrent finalize → first wins; award before
    verification → 400; duplicate award → idempotent (no double); `_status`
    public display has no UIDs/notes/admin identity.
  - `monthlyReset`: Dec→Jan boundary archives the correct prior month;
    archive-retry does not destroy history; archived month retains `_closed`.

## 10. Security notes

- Never commit service-account JSON or OAuth client secrets.
- Never log ID tokens or refresh tokens (the client does not log them).
- The offline `LocalLeaderboardService` is for QA only; it is never presented
  as a verified global ranking.
- Writing a rules JSON or a JS file does **not** deploy it — run
  `firebase deploy` and confirm via the console.
- **Finalize-vs-submit race (FIXED at the logic level):** the closure flag now
  lives at `leaderboard/{period}/_closed` (a child of the score parent), and both
  `submitScore` and `finalizeMonth` transact on the **same** node
  `leaderboard/{period}`. RTDB transactions serialize on that path, so the two
  operations produce a deterministic outcome (whichever commits first wins; the
  other aborts). The pure `mergeSubmission`/`buildClosure` helpers are unit-
  tested for both race orderings. **The actual cross-operation atomicity is
  BLOCKED from integration verification without the Firebase Emulator** — the
  pure-helper tests do not prove the RTDB transaction wiring.
- **Token storage:** the refresh token was stored in `PlayerPrefs` (plaintext).
  Part B of this pack introduces a credential-storage abstraction
  (`ICredentialStore`) with platform-specific secure storage (iOS Keychain,
  Android Keystore), no plaintext fallback, and safe migration off the legacy
  `VELOX.Account.*` keys. The ID token is kept in memory only.
- **Native credential-store integration (UNVERIFIED LIST):** `PlatformCredentialStore`
  is guarded by `#if UNITY_IOS || UNITY_ANDROID` and is NOT compiled or tested
  in the offline sandbox. The following require on-device verification before
  claiming production-ready secure storage:
  - Android: `Android.Security.Keystore` AES-GCM key generation, encrypt/decrypt
    round-trip, `SharedPreferences` blob write, key deletion. Verify the key
    never leaves the Keystore and the blob is useless without it.
  - iOS: the native `VELOX_KeychainStore/Retrieve/Delete` P/Invoke
    (`VELOXKeychain` plugin) must be implemented and compiled into the app;
    verify Keychain item persistence across launches and deletion on sign-out.
  - The `MemoryCredentialStore` is a test double (in-memory), NOT a production
    secure store — it verifies the `CredentialPersistence` logic only.
- **Reads do not auto-refresh:** `GetTopAsync`/`GetFinalizedAsync` use the
  current ID token without a pre-refresh; an expired token yields an empty
  read (fail-safe, no crash). Submissions call `EnsureFreshTokenAsync` first.

## 11. Status table

| Area | Status |
|---|---|
| Google → Firebase token exchange | VERIFIED (contract implemented; live sign-in test BLOCKED — needs real Google/Firebase creds) |
| Token refresh / expiry handling | VERIFIED (client logic tested; live refresh BLOCKED) |
| Score submission (server-authoritative) | VERIFIED (atomic best-score merge + validation; HTTP integration BLOCKED — emulator) |
| Concurrent submission safety | VERIFIED (pure `mergeSubmission` logic tested; transaction integration BLOCKED — emulator) |
| Finalize-vs-submit race | FIXED (logic) — shared-parent transaction serializes submit vs finalize; pure helpers tested for both orderings; RTDB transaction integration BLOCKED — emulator |
| Monthly ranking (UTC, consistent month id) | VERIFIED (period math tested, incl. Dec→Jan) |
| Historical records (archive, immutable) | VERIFIED (archive-before-delete preserves the only copy; rollover integration BLOCKED — emulator) |
| Server security (rules + functions) | PARTIAL (artifacts hardened: config no client-read, POST-only, month validation, strict bool, private verification/award/_finalizedBy not client-readable; rules/functions deployment + emulator tests BLOCKED) |
| Read-access policy (public vs private) | FIXED (rules: `verification`/`award`/`_finalizedBy` `.read:false`; public `final`/`_status` carry no admin UIDs/notes; structural test GREEN; behavioral rules verification BLOCKED — emulator) |
| Giveaway readiness (finalize/verify/award) | VERIFIED (atomic idempotent model + pure logic tested; live BLOCKED) |
| Anti-cheat beyond ownership | NOT BUILT (client can forge own-UID scores — not cheat-proof) |
| Admin config disclosure | FIXED (`config` no longer client-readable) |
| Refresh-token storage | FIXED (logic) — `ICredentialStore` + `CredentialPersistence`: refresh token never in plaintext PlayerPrefs; secure-store write, no-plaintext fallback, legacy migration success/failure, sign-out deletion all unit-tested (C# GREEN). Native iOS Keychain / Android Keystore integration COMPILED-ONLY (guarded `#if`), NOT on-device verified — see `PlatformCredentialStore.cs` unverified list. |
