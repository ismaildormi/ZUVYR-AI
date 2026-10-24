# Phase 3 — Power-ups & upcoming preview (PDF sections 7, 8, 17)

**Implemented in source, NOT compiled or device-tested.** All new source is under the isolated Unity project. No economy/ad/cloud purchase is simulated.

## Behavior

- **Magnet:** on pickup, nearby coins within the provisional horizontal/forward capture range are collected automatically, including adjacent lanes. Each active power has its own icon, remaining-seconds label and bar in the lower-left portrait HUD.
- **Super shoes:** on pickup, double-height jumps clear the original unbranded trains *only if* the jump is high enough when the train's leading edge arrives. Ordinary jumping does not clear a train.
- **Jetpack:** on pickup, flies above obstacles with a temporary flame/smoke greybox effect, prevents collision death and guides nearby row coins along the aerial route; coins crossing the runner are collected while airborne. On landing there is a provisional short grace period so expiration at an obstacle is not an unfair death.
- **Hoverboard:** pickup grants one *run-only* charge. A **double tap** (H in Editor only) spends a charge and provides complete collision protection for **30 seconds**, exactly as the PDF. Double-tapping with no charge or while already protected has no effect. One *test-only* initial charge is granted so the feature can be exercised immediately; **not** a persistent or commercial inventory.
- Power timers advance only during `Running`; pause, VAR and red/yellow decision screens don't consume time. Repeated pickup refreshes a power to at least its normal duration, without shortening a longer existing effect. Restart resets temporary inventory.
- Every fourth obstacle row carries a provisional rotating Magnet → Super Shoes → Jetpack → Hoverboard pickup on a guaranteed-safe lane before its obstacle. Three live preview chips in the top-center HUD show the next **actual generated** upcoming hazard/power-up groups and remaining metres; paired tackles appear as one combined warning. No fake x2/chest is displayed until those systems really exist.
- Power pickup roots are pooled and retained for the entire VAR buffer, as are normal hazards. No real club, player or brand visual assets are used.

## Values: confirmed vs provisional

| Setting | Value | Status |
|---|---:|---|
| Hoverboard shield | 30 s | PDF section 7, exact |
| Magnet / super shoes / jetpack | 12 / 10 / 8 s | Provisional; PDF does not give durations |
| Magnet horizontal / ahead range | 3.4 m / 6 m | Provisional |
| Super-shoe jump multiplier | 2× | Provisional, only effect specified in PDF |
| Jetpack altitude / landing grace | 3.2 m / 0.8 s | Provisional |
| Double-tap interval | 0.35 s | Provisional input tuning |
| Pickup interval | Every 4 obstacle rows | Provisional |
| Starting hoverboard charges | 1 **test-only** | Prototype QA, replace with real inventory in later phases |

All provisional values are in the generated `Assets/_Game/Resources/PowerUpConfig.asset`; comments in the code and this document retain provenance. Hoverboard protection length is a literal confirmed constant.

## Owner manual Unity checks (not run here)

1. Build scene with `Tools > Ultimate Football Chase > Build Phases 1–4 Scenes`; confirm three config assets (`RunConfig`, `DifficultyProfile`, `PowerUpConfig`) and no Editor Console errors. In Unity Test Runner run all three EditMode suites, including `Phase3Tests`.
2. In portrait mode verify top-center **three** preview chips show what is really ahead, change when items pass, group simultaneous double tackles, never show nonexistent rewards, and remain readable above the track without clipping notches or the score HUD.
3. Collect each of the four pickup colours; check four independent lower-left icon/countdown bars and that magnet automatically collects coins from an adjacent lane, shoes clear a train with a well-timed jump, jetpack flies and collects coins without death, hoverboard requires an actual double tap and protects for 30 seconds. H is a keyboard-only fallback for Editor QA.
4. While multiple powers overlap, pause and trigger VAR (without jetpack/board protection); timers should freeze and resume, not run in real time while paused. On board/jetpack expiry near a hazard, verify the landing grace and collision fairness; board should not be usable again until another pickup.
5. On a real Android phone test swipe vs double-tap discrimination (fast swipes must not consume a board), continuous 10+ minute run GC/framerate, all HUD labels in portrait and actual visuals/audio. iOS needs macOS/Xcode and a signed build. Send Console output and a recording if anything differs.

**Acceptance remains pending Unity/device checks.** Stage 4 Hub code now exists (see PHASE4_STATUS.md); neither stage has passed device QA. Do not use temporary keys/boards/coins as trusted cloud balances, score evidence or IAP inventory.
