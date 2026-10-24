# Phase 4 — Free-roam Hub (PDF section 5)

**Source implementation, NOT verified in Unity or on mobile.** No authenticated cloud save is claimed. Source is under `Assets/_Game/Scripts/Hub`; the Unity Editor builder now creates **two scenes**: `Hub` (entry scene) and `Phase1Runner`.

## Implemented

- A fixed hand-authored (not random) 3D greybox map with four linked places: **Home**, **Central Plaza/Stadium**, **Practice Pitch**, and **Market**. Portrait free roaming (not three lanes) via a virtual touch joystick or WASD/arrows; a quasi fixed-behind camera follows. Interaction uses E or the visible button.
- **Home + Central Plaza open from the start. Market + Practice Pitch require five completed stages**, precisely matching the PDF. The gates and path boundaries prevent walking into locked areas even via side routes. Stages are counted **one per accepted finished run** when a provisional, clearly displayed run-distance goal is reached; a long run cannot claim all five at once.
- Home includes interactive original 3D wardrobe with three temporary original colour variants, a mannequin and a trophy wall reflecting stage count; the selected outfit also appears on the next runner. Window lighting reflects the phone's local hour (day/night).
- Pitch includes a goal, moving goalkeeper NPC and harmless jump/slide practice props with feedback. Market has three original vendor stalls with **illustrative daily rotating previews only** (no actual offers, purchase, IAP or grant). Plaza has a start-run portal and a giant **explicitly unavailable** leaderboard screen: no fabricated Top 10. Original bushes, iron lanterns, birds and symbolic candles provide ambient motion/density.
- **Partial seasonal decor rotates every 2–3 months**: configurable 2 or 3, default provisional 3, with four original sets. Device local time controls day/night; UTC controls season bucket. No real brands, players, club names, logos or team palettes are claimed.
- Guest progress repository interface `IHubProgressRepository` with versioned, validated JSON in local PlayerPrefs; position, last visited zone, selected outfit, best/last run and stages. Location changes flush every **0.5 seconds provisional** and always on zone transition, scene change, app pause/focus loss/quit. Profile persists between Hub and runner; stage completion recorded exactly once on red-card Game Over, not on a pause/restart.

## Exact vs provisional figures

| Detail | Value | Origin |
|---|---:|---|
| Unlock market + practice pitch | 5 completed stages | PDF exact |
| Seasonal refresh | 2–3 months | PDF interval; default 3 selected provisionally |
| Run goal per prototype stage | 250 × next stage index metres | **Provisional**: document has stage numbers but gives no per-stage distances |
| Hub walking speed | 5 m/s | Provisional |
| Position save debounce | 0.5 s | Provisional performance tradeoff; latest position flushed on pause/exit |
| Local day/night | 06:00–19:00 day | Provisional; device's local hour, not a geolocation service |
| Interaction radius | 4 m | Provisional |

**Account-linked full cloud save belongs to stage 5.** Current PlayerPrefs is *device-local guest data* and must not be treated as authoritative progress, purchases, currencies, ranked scores or a linked Gmail/Apple account. The repository boundary permits replacing it with Firebase-backed authenticated storage and guest migration in phase 5. For real-money prizes, local run progression is not trusted; the leaderboard stage later requires server-validated events.

## Owner manual Unity/device checklist — required before acceptance

1. In Unity 6.3 LTS, use **Tools > Ultimate Football Chase > Build Phases 1–4 Scenes**. It must create `HubConfig.asset`, `Hub.unity` and `Phase1Runner.unity`, with Hub first in Build Settings. Press Play in Hub; there must be no Console errors. Run all EditMode suites including `Phase4Tests` (not run in this sandbox).
2. Portrait touch joystick + WASD: walk freely in Home/Plaza, approach the pitch and market gates from **all** sides, confirm locked until five completed stages. From Central Plaza enter runner via portal, die/accept red, see completed stage/next goal, return to Hub. Five qualifying runs should open both gates, one stage per run. For layout QA without five long runs, the Editor-only menu `TEST ONLY - Set Local Guest To 5 Stages` changes **only** guest staging after an explicit confirmation; it never generates real rewards or authenticated progress. Rejecting/failing a stage should not advance it.
3. Home: change outfit, verify mannequin **and** avatar and subsequent runner share it; trophy wall updates after stage completions. Move to arbitrary coordinates, quit/relaunch (also pause/background app) and check location/last zone/outfit/stage/best-run persists on same device. On second device it should **not** appear until phase-5 sign-in/cloud linking is implemented.
4. Pitch: practice jump/slide near props and inspect goalie movement; Market: check three preview-only vendors with *no purchase/claim* action. Plaza: ranking screen must say unavailable and contain no invented scores.
5. Set a test device clock across day/night and a UTC 3-month season boundary (or adjust HubConfig to 2) to verify window/light/decor. Restore clock afterwards. Visual ambience/asset placement, portal interaction, safe-area HUD, >10 minutes frame pacing and mobile memory must be checked on actual Android and iOS devices; iOS requires Xcode/macOS.

**Do not mark stage 4 accepted until Unity compiles, tests run and the owner confirms mobile behavior.** No phase-5 Firebase auth code has been added.
