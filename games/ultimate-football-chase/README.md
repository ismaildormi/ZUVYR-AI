# Ultimate Football Chase — Unity V2 / phases 1–11 source prototype

A **self-contained Unity project** (open this folder, not the ZUVYR-AI root). This is an offline gameplay prototype, deliberately isolated from the existing ZUVYR product; it is **not** a separate GitHub repository yet.

## Setup

1. Install **Unity 6.3 LTS (6000.3.27f1)** via Unity Hub, with Android Build Support (SDK/NDK/OpenJDK) and optionally iOS Build Support on macOS. If this exact patch isn't offered, another 6.3 LTS patch is fine; Unity will update `ProjectVersion.txt`.
2. In Unity Hub > Add project from disk, select **`games/ultimate-football-chase`**. On first open let Package Manager import `com.unity.ugui` and generate `.meta` files.
3. Unity menu **Tools > Ultimate Football Chase > Build Phases 1–4 Scenes**. Open `Assets/_Game/Scenes/Hub.unity` (first scene in Build Settings), then press **Play** and use the plaza portal to enter the runner. `RunConfig`, `DifficultyProfile`, `PowerUpConfig` and `HubConfig` ScriptableObjects are created under `Assets/_Game/Resources/`. After editing values, **do not rerun** the scene builder unless you intend to replace the scene (it preserves the config asset).
4. In Player Settings > Other Settings, set **Active Input Handling: Both** (or Input Manager/Old), if Unity reports legacy input disabled. The swipe+keyboard/double-tap component uses `UnityEngine.Input`.
5. In Game view choose a portrait resolution. Left/right swipe or A/D/arrow keys change lanes; swipe up or W/Up/Space jumps; swipe down or S/Down slides. Double tap a free area (H in the Editor) to use a stocked hoverboard. Press the II button to pause. A VAR replay plays on falls, with tap-to-skip after 1 second; use a key to revive or accept red card and run again.
6. For Android: File > Build Profiles > Android > Switch Platform; use the generated scene in the build list and set an **original application identifier** before a device build. For iOS: Build Profiles > iOS on macOS with Xcode/signing. No device build can be verified in this sandbox; report compilation/device errors for repair.

The game starts at 9 m/s, accelerates +3% every 100m and caps after 2000m. Configure owner-approved movement in `RunConfig.asset` and provisional spawn density in `DifficultyProfile.asset`. See [phase 2 status](docs/PHASE2_STATUS.md), [phase 3 status](docs/PHASE3_STATUS.md) and [Hub status](docs/PHASE4_STATUS.md) for confirmed and provisional values. No brands/club badges, SDK credentials or real-money mechanics are shipped. Phase 5 has optional Firebase source but no configured/working account in this checkout. The greybox uses Unity's Built-in renderer for zero-asset setup; URP and final art are not claimed as done.

## QA before marking phase 1 accepted

- Test all three lanes, fast swipes, queued consecutive lane changes, jumping a yellow low barrier, sliding under a magenta high beam, changing lanes around a red blocker and jumping a cyan fictional tackle after 250m; at 750m+ test original unbranded trains and at 1500m+ test crossing cars and straight-line drones.
- Graze a hazard on a lane switch to trigger stumble; another graze while chaser is near should fall. Direct collision should always fall (unless within 2 seconds of a revive).
- Observe two/three VAR angles and tap to skip (after at least one second); accept red card for Game Over, restart, and use test keys for the 1-key then 2-key revives at the same distance.
- Inspect Unity Console for errors, test Android touch and stable framerate over 10+ minutes. Collect 1 coin from the safe lane and check the HUD.
- Collect magnet, shoes, jetpack and hoverboard beacons; check four independent icon/timer bars at bottom-left and three honest upcoming items above the track. Double tap (H in Editor) for 30-second board protection; see [Phase 3 manual checklist](docs/PHASE3_STATUS.md). Simulator/editor QA cannot substitute for a real phone.

Phase 1–11 tests are under `Assets/_Game/Tests/Editor` (Unity Test Runner; not run in this environment). Original design values and tunables: [docs/DECISIONS.md](docs/DECISIONS.md). Implementation vs. unverified acceptance: [docs/PHASE1_STATUS.md](docs/PHASE1_STATUS.md).

**Save boundary:** The default build is local guest PlayerPrefs. Phase-5 optional authenticated Firebase UID account cache / cloud preview code is gated behind SDK/provider setup and has not been tested or enabled. Hub stages/scores are never trusted for prizes or ranked results. Phase 6 adds a **guest-only, untrusted local demo** Market for three greybox recolors; phase 7 adds a guest-only daily wheel demo and fail-closed ad pacing. Phase 8 adds a read-only server-published standings boundary and a fail-closed weekly/monthly/Hall UI. Real rankings, prizes, rewarded ads, account wallet, premium goods and IAP are unavailable. See [phase-8 standings boundaries](docs/PHASE8_STATUS.md), [phase-7 wheel/ad boundaries](docs/PHASE7_STATUS.md), [phase-6 economy boundaries](docs/PHASE6_STATUS.md), [phase-5 setup and acceptance](docs/PHASE5_STATUS.md) and [phase-4 Hub checks](docs/PHASE4_STATUS.md).

**Phase 9:** Original playable greybox roster/fictional-league concepts, one-time story panels, UTC daily **preview-only** missions, read-only Showdown schedule, separate audio sliders and persistent Use My Music setting, iOS ambient mixing hook, small three-language UI/story starter and an honest privacy-status panel. No contest entry, commercial entitlements or live services. See [phase 9 implementation and exact missing features](docs/PHASE9_STATUS.md).

**Phase 10:** Persistent *untrusted preview* 15-jump/10-tackle/100-coin mission groups, x1–x30 local HUD multiplier and preview-only score; four visual-only runner seasons; five provisional colour treatments per original character (last two preview-stage gated); confirmed guest-only local data reset and fail-closed unbound-account runner entry. See [Phase 10 status and what remains](docs/PHASE10_STATUS.md).

**V2 playable now:** The [independent browser playtest](playtest-v2/README.md) provides immediate portrait gameplay with original heroes, skins, boards and local training packs. It is **not Unity WebGL** and does not sync to the Unity project. The Unity greybox source now includes eight heroes, expanded wardrobe and guest-only demo packs/boards. Read [V2 verification and missing functionality](docs/V2_PLAYTEST_STATUS.md).

**If a live preview link says “Sandbox not found”:** download [V2 Offline ZIP](playtest-v2/Ultimate-Football-Chase-V2-Offline.zip), extract it and open the enclosed `Ultimate-Football-Chase-V2-PLAY.html` in your browser. This self-contained version needs no server and does not use an expiring Arena link.

**Third-party code review:** The suggested Subway Surfers clone/port repositories were audited before reuse. No third-party game or proprietary assets were imported; see [source and license audit](docs/OPEN_SOURCE_REUSE_AUDIT.md). A recolour of a clone is not an original, release-ready game. The browser sketch is not the visual target.

**Further original appearance options (Unity source only):** Five complexion swatches and five independent headwear selections are now exposed in the Hub wardrobe and persisted as preview settings. This is still greybox, not a polished or built mobile game; see [appearance status](docs/PHASE12_APPEARANCE_STATUS.md). No unlicensed runner clone code/assets were copied.
