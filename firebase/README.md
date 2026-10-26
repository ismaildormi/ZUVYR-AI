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
   (no silent downgrade), via the admin SDK.

Because the caller is authenticated, one player cannot overwrite another's
score. The client-side checks are defense-in-depth only.

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
  Idempotent: an already-finalized month is not overwritten. Once finalized,
  `submitScore` refuses further writes for that period.
- **`verifyWinners`** — records verification of the Top-3 (from the finalized
  snapshot). `body: { "verified": { "<uid>": { "verified": bool, "note": "" } } }`.
- **`awardPrizes`** — refuses to award unless all Top-3 are verified, then
  records the award under `competition/{month}/award`. Prizes are never awarded
  on client-reported scores alone.

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
- `archive/$period`, `competition/$period/{final,verification,award}`,
  `config`: read for authenticated users, **write denied** to clients.

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

- **Offline C# harness** (`velox-verify/build.sh`): 71 tests covering period
  math (incl. Dec→Jan boundaries), score validation, name sanitisation,
  Top-10/tie-breaking, finalize/frozen/idempotent, historical preservation,
  token expiry, and MiniJson parsing. **GREEN 71/71.**
- **Node pure-logic tests** (`firebase/functions/test/functions.test.js`):
  34 tests for the server-side period/ranking/sanitisation logic.
  Run `node test/functions.test.js`. **GREEN 34/34.**
- **Firebase Emulator Suite**: NOT available in this sandbox. Emulator-driven
  tests (rules enforcement, function HTTP, scheduled rollover) are **BLOCKED**.
  When a Firebase project/CLI is available, run `firebase emulators:start` and
  add integration tests against `firebase.json` emulator config.

## 10. Security notes

- Never commit service-account JSON or OAuth client secrets.
- Never log ID tokens or refresh tokens (the client does not log them).
- The offline `LocalLeaderboardService` is for QA only; it is never presented
  as a verified global ranking.
- Writing a rules JSON or a JS file does **not** deploy it — run
  `firebase deploy` and confirm via the console.

## 11. Status table

| Area | Status |
|---|---|
| Google → Firebase token exchange | VERIFIED (contract implemented; live sign-in test BLOCKED — needs real Google/Firebase creds) |
| Token refresh / expiry handling | BUILT (client refresh; not live-tested) |
| Score submission (server-authoritative) | BUILT (function + rules + client); live BLOCKED |
| Monthly ranking (UTC, consistent month id) | VERIFIED (period math tested) |
| Historical records (archive, immutable) | BUILT (rollover function + rules); live BLOCKED |
| Server security (rules + functions) | BUILT (artifacts); deployment + emulator tests BLOCKED |
| Giveaway readiness (finalize/verify/award) | BUILT (admin functions + model); live BLOCKED |
| Anti-cheat beyond ownership | NOT BUILT (client can forge own-UID scores — not cheat-proof) |
