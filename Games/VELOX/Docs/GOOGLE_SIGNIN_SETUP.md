# Google Sign-In (Gmail) + VELOX backend — setup
1. **Google Cloud Console**: create an OAuth **Web** client ID (this is the token audience) + Android
   client ID (package `com.zuvyr.velox` + your release SHA-1/SHA-256). Put the Web ID in
   `GoogleSignInProvider.webClientId` and in backend env `GOOGLE_CLIENT_ID`.
2. **Native bridge (Android)**: implement `com.zuvyr.velox.auth.VeloxGoogleAuth.signIn(webClientId,
   gameObject, "OnNativeToken", "OnNativeError")` with Credential Manager / Play Games, returning JSON
   `{idToken, displayName, email, photoUrl, userId}` via `UnitySendMessage`. iOS: use Sign in with
   Apple / Game Center behind the same `IVeloxAuthProvider` interface. The client never trusts the
   token — `POST /velox/auth/google` verifies `aud`, `iss`, `exp` server-side and issues a 7-day
   HMAC session token (`VELOX_SESSION_SECRET`, server env only).
3. **Backend mount** (existing Express app in `/backend`):
   `app.use('/velox', require('../../Games/VELOX/Backend/velox-leaderboard')({ pool, googleClientId: process.env.GOOGLE_CLIENT_ID, sessionSecret: process.env.VELOX_SESSION_SECRET }).router);`
   Run `Backend/schema.sql` once. Schedule `finalizePreviousPeriod()` monthly (or rely on lazy
   finalization on the first request of each month — both are idempotent via `velox_podiums` PK).
4. **Monthly reset semantics**: scores are keyed by server-computed `period_id` (`YYYY-MM`, UTC). A new
   month has no rows → Top 10 starts empty automatically; the previous month's Top 3 are snapshotted
   into `velox_podiums` (`GET /velox/leaderboard/podium/:period`) before anyone can overwrite glory.
