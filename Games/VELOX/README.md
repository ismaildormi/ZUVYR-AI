# VELOX — 3D Endless Runner (original IP)

An original Unity endless runner built from scratch in this repo: hero **NEO** (cartoon human),
modern/cyberpunk city streets, concrete barriers & parked cars — no third-party game code, models,
tracks, trains, audio or UI are used or referenced anywhere.

## PR-1 scope (this change)
- Standard Unity layout: `Assets/{Scripts,Scenes,Prefabs,Materials,UI,Art,Audio,Animations,Textures}`, `Packages/`, `ProjectSettings/` (product **VELOX**, `com.zuvyr.velox`).
- **Runner motor** (`PlayerController`): smooth 3-lane switching (lerp), jump/slide (swipe + keyboard),
  gravity, speed ramp (`GameManager`), NEO spawned from an Inspector slot (`VisualCatalog.neoCharacterPrefab` via `SceneBootstrapper`) — swapping the hero = one reference.
- **Gmail sign-in + Monthly Top 10** (in the core from day one): `GoogleSignInProvider` → server-verified
  ID-token exchange (`VeloxBackendClient`/`AuthService`), `LeaderboardService` + `LeaderboardPanel`
  (exactly 10 rows, countdown to reset, monthly Top-3 podium snapshot, lazy + schedulable reset in `Backend/`).
- **Custom animated billboards**: `Ads/CustomBillboardAd.cs` (empty Texture Slots in the Inspector,
  TextureCycle / CrossfadePulse / SlideTextureOffset, MaterialPropertyBlock, visibility-gated) pooled by `BillboardSpawner` from `TrackGenerator`.
- **Reskin catalogues**: `VisualCatalog` (NEO, city environment, city obstacles) and `AudioCatalog` —
  every asset/audio slot ships **empty**; see `Docs/ASSET_LICENSE_CHECKLIST.md`.

## Quick start
1. Open `Games/VELOX/` in Unity 2022.3 LTS (URP + TMP + Input System are in `Packages/manifest.json`).
2. Menu **VELOX ▸ Build Main Scene (Automated)** — bakes catalogues, the procedural NEO prefab, city/obstacle/billboard prefabs and a fully-wired scene + Canvas (zero unassigned references). OAuth IDs come from `VeloxAuthConfig` <- `StreamingAssets/velox-auth.json` (copy the example, git-ignored) or `VELOX_*` env vars — never typed into the Inspector.
3. Backend: run `Backend/schema.sql`, set `GOOGLE_CLIENT_ID` + `VELOX_SESSION_SECRET`, mount `Backend/velox-leaderboard.js` (see `Docs/GOOGLE_SIGNIN_SETUP.md`), point `VeloxBackendClient.baseUrl` at it.

## Tests
- Backend units: `node --test Games/VELOX/Backend/velox-leaderboard.test.js`
- Unity EditMode: `Assets/Tests/EditMode` (monthly-period rollover incl. December → January).
