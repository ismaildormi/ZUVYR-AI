# Decisions & provenance — Phase 1

Source: `Endless_Runner_Ultimate_Football_Chase.pdf` (provided by owner in this Arena session; attachment not copied into Git) and owner follow-up instructions, 2026-10-24.

## Confirmed by the owner

- Engine: Unity C#, portrait 3D greybox with a fixed-behind 2.5D view; original fictional characters, no real clubs or players.
- Initial forward speed **9 m/s**. Speed +3% per 100 m up to the ~2000 m cap is **phase 2**; not faked in phase 1.
- Three lanes, left/right swipes, jump, slide; tackles, collision, VAR with 2–3 camera angles.
- Side graze -> stumble and chaser approaches; frontal contact or chaser contact while close -> fall. See below for provisional closeness tuning.
- VAR skippable by tap after **1 second**; continue at the *same distance and lane* with **2 seconds** of protection.
- Yellow-card revive cost increases 1, 2, 3, 3... keys per revive in one run: mathematically double then cap per-use at **3**. This is a documented interpretation of "doubles, maximum 3 keys in a run"; if the owner meant a *total per-run spend of three*, revise this before economy stage 6.
- No stop for unspecified minor tunables; document estimates and proceed. Major phase summary is a report, not a gate.

## Phase-1 provisional playtest tuning (NOT numbers specified by the PDF)

| Parameter | Working value | Purpose / revisit |
|---|---:|---|
| Lane width | 2.7 m | Comfortable three-lane visibility in portrait |
| Lane transition | 0.18 s | Responsive, still readable |
| Jump arc | 0.85 s, 1.9 m | Clear low barriers; tune for device feel |
| Slide | 0.9 s | Clear overhead beams |
| Chaser near window | 6 s decay | First side graze brings proximity to 1; another while proximity ≥ 0.35 (about 3.9 s) = catch |
| Side graze X distance | 0.68–1.12 m | Avoid unfair central hit during transitions |
| Obstacle spacing | see DifficultyProfile: 28 m → 21 m by 2000 m; first row 35 m | Provisional linear rate, not document-defined numeric density |
| VAR history | 3 s at 20 fps; replay 0.3x | Slow-motion two–three camera cuts |
| Test-only initial keys | 3 | Lets a tester try 1+2 revives; **not** a player wallet |
| Test-only coin | 1 per row | No economy payout / cloud persistence |
| Device framerate target | 60 fps | Validate on mid-range phones |

At 0–250 m each row contains one simple obstacle, leaving two safe lanes. Distance-based danger tiers and speed cap now live in DifficultyProfile/ObstaclePlanner (phase 2); storyline chapter unlocks remain a later narrative phase. In high tiers double tackles/crossing cars still leave a guaranteed safe lane. The camera is fixed-behind except deliberately cinematic VAR angles. This prototype is offline: its coins/keys/distance are **not** trusted for leaderboards, IAP or purchases. Future backend MUST validate events server-side before prize competitions.

## Scope boundaries

Do not turn the test-only inventory into a real economy. Do not enable any ads or sign-in yet. Power-ups, Hub, wallet, store, cloud save, leaderboard, chapter cinematics, legal/content review and phone-music coexistence retain their requested phase ordering. The build contains original unbranded primitives, not polished character/environment art.

Repo boundary: the owner requested a separate `ultimate-football-chase` repository. This Arena session is pinned to `arena/14b5acae-zuvyr-ai` of ZUVYR-AI; the Unity project is quarantined under `games/ultimate-football-chase/` here. **This is not a separate Git repository.** Migrate this directory to a separately bound game repository in a future session; do not pretend that a new repository was created or push to another branch from this session.
