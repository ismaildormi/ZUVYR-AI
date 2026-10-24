# Phase 1 implementation / acceptance status

## Implemented in source

- Three-lane swipe/keyboard movement; buffered next action; jump, fast fall into slide, slide collider clearance via explicit swept collision rules.
- Fixed-behind portrait camera, pooled original 3D track tiles, seven greybox obstacle archetypes (unlocked by phase-2 distance bands) including a visually sliding fictional defender, visible pre-obstacle warning, and at least one safe lane per row.
- Coin collection for run-only display, side-graze stumble/chaser proximity, direct-contact fall, 3-second pose-ring-buffer VAR with three camera cuts, skippable after 1 second, yellow-card revive / red-card end/restart and pause UI.
- Same-point revive with exactly 2 seconds of protection; escalating 1,2,3,3... key cost capped at 3 per use (owner interpretation documented in DECISIONS.md).
- Unity scene generator, test-only keys, deterministic test-world seed and Unity EditMode tests across phases 1–3.

## Verified locally (without Unity)

- All source files parsed successfully by a C# grammar parser; all JSON valid; `git diff --check` clean.
- Static checks confirmed owner's 9 m/s / 2-second / 1-second / 3-key constants and capped cost schedule.

## Not yet verified / acceptance blockers

- **Unity Editor is not installed in this sandbox.** Editor C# compilation, Unity Test Runner tests, scene generation, actual build output, animation/rendering and phone input/framerate have NOT been run. Do not mark phase 1 as device-tested or accepted until tested in Unity and on a real Android device; see README QA checklist.
- This session has no permission to create GitHub repositories (`gh repo create` returned `Resource not accessible by integration (createRepository)`). The separate game repository is **not created**; the owner is handling GitHub permissions separately; do NOT retry repository creation in this session. No code from this project has been pushed to a different repository.
- Visual references mentioned by the PDF weren't present in the PDF itself; final camera/HUD art direction requires those images. Greybox geometry is explicitly provisional.

Phases 2–4 are now implemented in source (see PHASE2_STATUS.md, PHASE3_STATUS.md and PHASE4_STATUS.md); Unity/device verification of **all four** remains outstanding. No phase 5 work was started.

## Manual Unity/device tasks for the owner (unverified here)

1. **Compile & setup:** Open this project in Unity 6.3 LTS. Run `Tools > Ultimate Football Chase > Build Phases 1–4 Scenes`; it also creates `DifficultyProfile.asset` and `PowerUpConfig.asset` for phases 2–3. Open the generated `Hub.unity` (entry scene), then use the portal to reach `Phase1Runner.unity`. Send the first Console error, if any. Confirm legacy Input Handling is Both/Old.
2. **Run EditMode tests:** Unity Test Runner > EditMode > run `Phase1Tests`, `Phase2Tests`, `Phase3Tests` and `Phase4Tests`; send failing assertion/stack trace. Parsing C# source here is *not* a Unity compiler/test run.
3. **Controls/collisions:** In Portrait Game view and on an Android phone, test three lanes, rapid consecutive swipes, jump vs low barrier, slide vs overhead beam, fast-fall from jump, train avoidance, tackle avoidance, side graze/stumble, chaser closeness and frontal immediate fall. Check no deaths in a designated safe lane.
4. **VAR & inventory:** Replay should use multiple angles, skip only *after* 1 second, restore the original world distance, charge 1→2→3 keys capped at 3 per revival, and protect for 2 seconds at both base and max speed; refusing to continue should give Game Over. Confirm pause/restart work.
5. **Tier/speed:** See `PHASE2_STATUS.md`: test 100, 250, 750, 1500 and 2000 metre boundaries; double tackles, crossing cars, drones, fair reaction time; no further speed/density increase after 2000m.
6. **Powers/preview:** See `PHASE3_STATUS.md`: check four pickups, active independent icon/timer bars, double-tap hoverboard, 30-second protection, airborne coin pickup and exactly three honest upcoming preview chips.
7. **Hub:** See `PHASE4_STATUS.md`: verify free-roam, the two initially unlocked/two locked zones, five stage completions, returning through the run portal, local guest save/restoration, wardrobe and seasonal day/night.
8. **Build/performance:** Build Android and iOS (iOS needs macOS/Xcode/signing), verify touch and HUD safe area, play 10+ minutes for GC spikes/pooled object pop/replay inconsistencies, and share a screen recording. These cannot be verified in this sandbox.
