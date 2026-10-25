# VELOX — 3D Endless Runner (Unity)

A professional, commercial-ready 3D endless runner built on Unity + C#. The
game's identity is centralised in one file so you can rebrand everything in a
single edit.

> **Product:** `VELOX` · **Character:** `NEO` · **Theme:** railway / stations
> (change `VELOX.Core.GameIdentity` to rebrand globally — e.g. back to `DashX`.)

---

## 1. Folder map

```
Assets/_Game/Scripts/
├── Core/
│   ├── GameIdentity.cs        # Brand + competition constants (VELOX / NEO / Top-10)
│   ├── GameEvents.cs          # Cross-system UnityEvent bus
│   ├── ServiceLocator.cs      # Static access to long-lived singletons
│   └── GameDirector.cs        # Run state machine, score, speed, orchestration
├── Gameplay/
│   ├── RunnerMotor.cs         # Lane switching, jump, slide, collision
│   ├── TrackWorld.cs          # Procedural scrolling track + obstacle/coin/billboard spawn
│   └── Obstacles.cs           # Obstacle + Collectible behaviours
├── Backend/
│   ├── PlayerProfile.cs       # Signed-in player model
│   ├── FirebaseConfig.cs      # Firebase runtime config (API key, project, DB URL)
│   ├── AuthProviders.cs       # Google Sign-In + Firebase Auth REST + offline provider
│   ├── AccountSession.cs      # Login state, persistence, events
│   ├── LeaderboardContracts.cs# Entry DTO + ILeaderboardService
│   ├── LocalLeaderboardService.cs   # Offline monthly Top-10 (JSON file)
│   └── FirebaseLeaderboardService.cs# Production monthly Top-10 (Realtime DB)
├── Visuals/
│   ├── VisualCatalog.cs       # Single asset: character, theme, obstacles, ads
│   └── CustomBillboardAd.cs   # Animated/static billboard with manual texture slots
└── UI/
    ├── GameUI.cs              # Menu / HUD / pause / game-over + Google login button
    ├── LeaderboardManager.cs # Top-10 rendering + score submit + monthly reset
    └── MonthlyLeaderboardReset.cs  # Polls calendar month, triggers reset
```

---

## 2. Scene setup (automated — no manual wiring required)

The project ships an **Editor scene builder** that creates a complete,
playable scene from code (camera, lights, the NEO runner, a procedural
scrolling track, obstacles/coins/billboards/decorations, and a fully wired
UI) with **no required art assets**.

Run it from the menu:

> **VELOX ▸ Build Playable Scene**

It writes `Assets/Scenes/VELOX.unity`, registers it in Build Settings, and
creates an empty `Assets/Resources/VisualCatalog.asset` for future re-skinning.
Re-run it anytime to rebuild the scene. (Requires the Unity Editor; the
sandbox could not run it — see `velox-verify/`.)

Everything the builder produces uses **procedural primitives + shared
materials**, so the game is playable in a fresh project. To re-skin later,
assign prefabs/textures in the `VisualCatalog` and set `TrackWorld.useCatalog
= true`.

For reference, the builder wires these components (you can also hand-build
the same graph):

| Script                | Key fields                                                                 |
|-----------------------|-----------------------------------------------------------------------------|
| `GameDirector`        | `runner`, `trackWorld`, `gameUI`, `leaderboardManager`, `accountSession`     |
| `AccountSession`      | `firebaseConfig` (disabled = offline), `googleWebClientId`                   |
| `RunnerMotor`         | `trackWorld` (falls back to local lane geometry if null); adds its own kinematic-Rigidbody + trigger collider |
| `TrackWorld`          | `useCatalog = false` (procedural); `catalog` for future re-skinning          |
| `GameUI`              | all TextMeshPro / Button references (title, HUD, menu, game-over, pause)     |
| `LeaderboardManager`  | `leaderboardPanel`, `rowsContainer`, `rowPrefab`, `useFirebase = false`      |
| `MonthlyLeaderboardReset` | `manager` (the LeaderboardManager)                                       |

UI text uses **TextMeshPro** (`TMPro.TextMeshProUGUI`), which renders with the
package's bundled default font — no font asset needs to be assigned.

---

## 3. Google (Gmail) sign-in

`AccountSession` supports two paths:

1. **Google Sign-In → Firebase Auth (production).**
   - Import the **Google Sign-In** package (or your native Google Sign-In plugin).
   - Define the `GOOGLE_SIGNIN_PLUGIN` scripting define symbol so
     `GoogleSignInClient` compiles the plugin call.
   - In Google Cloud Console create an **OAuth client ID** for your app and put
     it in `AccountSession.googleWebClientId`.
   - In Firebase Console enable **Authentication → Sign-in method: Google**.
   - Fill `FirebaseConfig`: `webApiKey`, `projectId`, `requestUri`, `databaseUrl`.
   - `FirebaseAuthClient` exchanges the Google ID token for a Firebase identity
     via `identitytoolkit.googleapis.com/v1/accounts/signInWithIdToken`.

2. **Anonymous / offline (QA).** If Firebase is disabled or no provider is set,
   `AccountSession` falls back to `LocalAuthProvider` (or an anonymous Firebase
   sign-up when the config is valid). The game is fully playable offline.

The login button in `GameUI` calls `LoginWithGoogleAsync()` and falls back to
`LoginAnonymousAsync()` on failure. The signed-in name is used on the leaderboard.

> **Never commit real API keys/secrets.** The Web API key is safe to embed; do
> not add service-account JSON or OAuth client secrets to source control.

---

## 4. Monthly Top-10 leaderboard

- `ILeaderboardService` is the contract. Two implementations:
  - `LocalLeaderboardService` — JSON file in `PersistentDataPath`, default.
  - `FirebaseLeaderboardService` — Realtime Database, schema:
    `{databaseUrl}/leaderboard/{yyyy-MM}.json = { "entries": [ {id,name,score,month,timestamp} ] }`.
- The UI shows **only the top 10**, sorted by score, with the top 3 highlighted.
- **Monthly reset:** `MonthlyLeaderboardReset` polls the calendar month and calls
  `LeaderboardManager.EnsureMonthlyReset()`. When the month key changes it clears
  the current month's standings (local file or Firebase `null` write) so a fresh
  competition starts. The boot path (`GameDirector.Start`) also rolls it over.

---

## 5. Custom in-game ads (billboards)

`CustomBillboardAd` renders manually-assigned textures — no external ad
network. The default path is a **material on a plane** (no Canvas required);
set `useWorldSpaceCanvas = true` to use a World-Space Canvas + `RawImage`
instead.

1. Billboards are spawned automatically by `TrackWorld` on both sides of the
   track. With `useCatalog = false` they use a procedural plane (visible even
   with no textures). With a catalog, `TrackWorld` clones
   `VisualCatalog.billboardPrefab` and assigns `catalog.billboardAdFrames` /
   `catalog.billboardStaticTexture` at spawn time.
2. In the Inspector assign, on the `CustomBillboardAd`:
   - `frames` = your ad textures (1 = static, >1 = animated slideshow), or
   - `staticTexture` = one image.
   - `animated` + `frameInterval` + `loop` control the motion.
3. Empty texture arrays are safe: the billboard simply renders its base
   material colour.

The billboard faces the camera when `faceCamera` is on and is double-sided.
Billboards are pooled and reconfigured on reuse (no new materials/GameObjects
per spawn).

---

## 6. Re-skinning (VisualCatalog)

Everything visual is data-driven through one ScriptableObject
(`VisualCatalog`, created via **Assets → Create → VELOX → Visual Catalog**):

- `playerPrefab` → replace NEO with any cartoon human model.
- `environmentTheme` → `railway` / `station` / `futuristic`; swap
  `trackSegmentPrefab` + `decorationPrefab` to match.
- `obstaclePrefab`, `coinPrefab`, `billboardPrefab` → swap kits.
- `billboardAdFrames` → update all in-game ads at once.

---

## 7. Controls

- **Keyboard:** ← → lanes · ↑/W jump · ↓/S slide · **Esc/P pause/resume**
- **Touch:** swipe left/right = lane · swipe up = jump · swipe down = slide · tap = jump · HUD **II** button = pause
- **Gamepad:** horizontal axis = lane · jump button = jump · Fire3 = slide

The HUD also shows score, best, coins and current speed. Pause freezes the
runner and the scrolling track; Resume restores both.
