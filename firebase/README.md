# VELOX — Firebase backend (authentication + monthly leaderboard)

This folder contains everything needed to make VELOX's Google sign-in and
monthly Top-10 competition **server-authoritative**.

> STATUS: the client contract and security artifacts are implemented. The
> live, server-enforced deployment is **BLOCKED** until these resources are
> deployed to a Firebase project with real credentials.

## 1. Google sign-in → Firebase Auth

The game exchanges a Google ID token for a Firebase identity via
`identitytoolkit.googleapis.com/v1/accounts/signInWithIdToken` (see
`AuthProviders.FirebaseAuthClient`). No service-account secrets are needed;
the Firebase **Web API key** is safe to embed in a client.

Firebase Console → Authentication → Sign-in method → enable **Google**.

## 2. Monthly Top-10 (Realtime Database)

Schema:

```
leaderboard/
  2026-10/                 <- competition period (YYYY-MM, UTC)
    <firebase-uid>: { id, name, score, month, timestamp }
```

- `FirebaseLeaderboardService` reads a period node and writes **only the
  signed-in player's own document** (`leaderboard/{period}/{uid}`).
- A stable `uid` (from Firebase Auth) is the identity; display names are not
  trusted for writes.

## 3. Security rules

`rules/leaderboard.rules.json`:

- read: any authenticated user (needed to render the Top-10);
- write at the period/root level: **denied** (`.write: false`);
- write at `{uid}`: only `auth.uid === $uid`;
- `.validate` enforces the document shape.

Deploy:

```
firebase deploy --only database:rules
```

## 4. Server-authoritative monthly reset

`functions/monthlyReset.js`:

- `monthlyLeaderboardReset` (scheduled, 00:00 UTC on the 1st) archives the
  previous period and creates the new one. **Clients never reset global
  standings.**
- `ensureMonthlyPeriod` (HTTPS) is an optional manual/admin trigger; point
  `FirebaseConfig.monthlyResetEndpoint` at its URL and protect it with Firebase
  App Check.

Deploy:

```
cd firebase/functions && npm install
firebase deploy --only functions:monthlyLeaderboardReset,functions:ensureMonthlyPeriod
```

## 5. Configuration in the Unity Inspector

`AccountSession.firebaseConfig`:

| Field | Example |
|---|---|
| `webApiKey` | `AIza...` (Firebase Web API key) |
| `projectId` | `velox-prod` |
| `requestUri` | `https://velox.example.com` (OAuth redirect, matches Google Cloud) |
| `databaseUrl` | `https://velox-prod.firebaseio.com` |
| `monthlyResetEndpoint` | `https://us-central1-velox-prod.cloudfunctions.net/ensureMonthlyPeriod` |

`AccountSession.googleWebClientId`: the OAuth **web client id** for your app.

## 6. Security notes

- Never commit service-account JSON or OAuth client secrets.
- Never log ID tokens or refresh tokens (the client does not log them).
- The offline `LocalLeaderboardService` is for QA only; it is never presented
  as a verified global ranking.
