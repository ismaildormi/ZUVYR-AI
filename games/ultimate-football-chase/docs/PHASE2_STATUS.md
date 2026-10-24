# Phase 2 — implementation and acceptance

**Code written; Unity compilation and mobile acceptance have not yet been performed.** Source: section 4 of the attached 11-page game-design PDF. Unity is unavailable in this environment, so any gameplay feel or performance claim requires device verification.

## Document-exact numbers

- Base speed **9 m/s** (owner-confirmed) at 0–99.999 m.
- At each completed 100 m: base speed × `1.03 ^ floor(distance / 100)`.
- Exactly **20 increments** at **2000 m**. No increase after 2000 m; max = `9 × 1.03^20 ≈ 16.255 m/s`.
- Threat tiers: **0–250 m** simple only, **250–750 m** rare single tackles, **750–1500 m** repeated tackles, unbranded trains and jump→slide pairs, **1500 m+** maximum density with two-lane tackles, unbranded police cars cutting across one lane into the centre, and drones following a straight line.
- Spawn **rate** increases *linearly* with metres until 2000 m and stays capped after that; as the reciprocal of rate, the row **spacing** is necessarily non-linear. Speed and spawn-rate caps are independent.

## Provisional (NOT exact PDF figures; tune with owner after on-device testing)

- Starting spacing 28 m (1/28 rows/m), minimum spacing at 2000 m 21 m (1/21 rows/m). They imply ~1.3 seconds between rows near the speed cap, comfortably exceeding the ~0.18 s lane transition, but must be checked on a phone. Values live in `Assets/_Game/Resources/DifficultyProfile.asset`, created by the Editor menu.
- Stage 250–750 m tackle frequency: every sixth row; 750–1500 m: planned jump+slide every fifth row, remaining rows include trains about every fourth and tackles about every third row (priority applies). 1500 m+: double tackles every seventh, cars every fifth, drones every third, subject to preceding pattern priorities. These ratios are explicitly working estimates, not prescribed PDF percentages.
- A police car crosses from an outside lane toward the middle during the final 14 m; the opposite outside lane remains safe. Drones remain on a straight predicted lane and deliberately **do not** catch up to an earlier planned row: accelerating them could make adjacent rows unavoidable.
- A bright warning precedes each hazard by 5 m and rows spawn as far as 105 m ahead. Pooled hazards remain alive behind the player for the full 3-second replay window even at the capped speed (max speed × replay duration + 12 m). The three upcoming preview chips are now implemented in phase 3; phase 2 itself did not invent rewards.

## Fairness contract

`ObstaclePlanner.Plan` reserves all affected lanes *before* spawning, including the crossing car's origin and destination. A two-lane tackle always leaves the third lane free. Single-row threats always leave two lanes. A safe-lane coin is placed in a guaranteed-clear lane. Rows are sequenced far enough apart for at least two provisional lane changes at the maximum speed; manual playtesting remains necessary for jump/slide transitions. Additional mobile QA must verify there are no unfair deaths while switching lines.

## Manual acceptance checklist — OWNER IN UNITY

1. Open the Unity project and use **Tools > Ultimate Football Chase > Build Phases 1–4 Scenes** once; it now also creates a `DifficultyProfile` asset and connects phases 1–2. Check the Console for compile/package errors and open the scene. Run Unity Test Runner EditMode suites `Phase1Tests` and `Phase2Tests` (these tests were not executed in this sandbox).
2. At 99→100 m confirm HUD changes 9.0→9.3 m/s, at 2000 m confirm ~16.3 m/s, beyond 2100 m confirm unchanged. Validate 250/750/1500 m tier changes; after 2000 m verify no extra difficulty density increase.
3. 0–250 m should show only simple barriers; 250–750 m occasional single tackles; 750–1500 m paired jump then slide on the same lane plus unbranded trains; 1500 m+ double-lane tackles, original unbranded crossing cars and straight drones. Check hazards can always be avoided and clear warning signs appear in time.
4. Verify collision and VAR/revive still work in all tiers, including straight-line drone avoided by slide or lane swap, and car avoided by the opposite outside lane; trains must be avoided by switching lanes rather than jumping. Revive near 2000 m: protection/near-hazard clearance must account for the *current* speed, not base 9 m/s.
5. On a real midrange Android phone, run 10+ minutes: watch GC spikes, frame drops, missing swipes, clipped HUD/notch, visual crossing vs collision timing and repeated/restarted runs. Do not declare phases 1–2 accepted until these tests pass.

Current GitHub repository-creation permission remains outside this project's code; per owner instruction, do not retry creating a separate repo in this session.
