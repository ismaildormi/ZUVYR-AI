# V2: playable browser test + expanded Unity greybox source

## Try the game now

Open the **V2 football playtest** live preview, or run `node playtest-v2/server.mjs` from this Unity-project folder and visit `http://localhost:4173`. The responsive Arabic browser companion is playable on desktop or touch phones. It provides a three-lane endless route, original cartoon characters, obstacles, jumping/sliding, safe-lane coins, collision/Game Over, a preview score and training cosmetics. The browser save is **localStorage only** with 360 free starter training credits. There are **no** real-money transactions, advertising, score submission or account sync.

**Important:** The preview is a separately written gameplay companion, **not Unity WebGL**, not a built mobile app, and not a verified visual/performance test of Unity. Its data and balance never transfer into the Unity project. Unity Editor, Unity Test Runner and Android/iOS device testing remain unavailable in this environment.

## Unity V2 source changes

- Eight original fictional characters (Kivo, Mira, Selo, Nexa, Taro, Lumi, Vora, Ziri), each with a different geometric headpiece/accent; no real-player or team references.
- Eight stage-gated base outfit colours per character (64 per-character greybox treatments), plus six guest-demo market tint concepts. The latter are prototype recolours, not production outfit meshes or server entitlements.
- Three original guest-demo hoverboard recolours and a board showcase in the Hub; board selection remains separate from the account and real-money economy.
- Three original guest-demo packs (City Glow, Celestial, Moonrise). Contents are only local tint/board selections. Atomic local PlayerPrefs debit + ownership snapshot, stage-5 Hub gate, no double charging on already-owned packs. Preview-only premium offers remain unavailable. A 12/8 ordinary/premium *catalogue preview ratio* is retained, not a real offer split or entitlement service.
- Updated wardrobe grid, market UI and tests. `Phase11Tests.cs` adds roster/skin-gate and pack/foreign-entitlement tests; earlier tests are updated to the new prototype catalogue. **Unity tests are authored, not executed**.

## Validation and unresolved work

The browser simulation's Node tests pass. C# grammar/JSON/diff checks pass; compilation in the Unity Editor and actual phone gameplay remain **unverified**. Next acceptance step: open the Unity project, run Tools > Ultimate Football Chase > Build Phases 1–4 Scenes, execute all EditMode tests, then play Hub → wardrobe → market → runner and build on Android/iOS. Capture Console/device errors for repair.

Still not implemented: rigged/final 3D art and unique outfit geometry, fully produced animation/audio; actual authoritative account wallet, pack grants, billing/IAP, ads and purchase restore; verified multiplayer Showdown, event scores, rankings, anti-cheat and real prizes; complete Arabic RTL/fonts and end-to-end cloud/delete/consent flows. These cannot be passed off as working based on a browser preview. The separate GitHub repository is still blocked by permissions; per owner instruction, no creation retry.
