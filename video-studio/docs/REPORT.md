# ZUVYR Studio — Final Build & Test Report

**Updated:** 2026-10-25 (reconciliation session) · **Subsystem:** `video-studio/`
**Requirement-by-requirement statuses:** `docs/ACCEPTANCE.md` (read that first).

## 1. What was built

A fully self-hosted, script-to-finished-video pipeline for anime-style YouTube
content, built as a new hexagonal subsystem on top of
itsPremkumar/Automated-Video-Generator (MIT). 52 Python modules
(`src/zuvyr_studio/`), a CLI (`bin/zuvyr`), a Flask web portal, a stdio MCP
server, a 14-voice voice bible with model-generated clone reference clips, a
6-character visual bible with fixed sprites/seeds/token blocks, a validated
scene schema, a job queue with per-scene resumability, and a full audio post
chain (per-character EQ/de-esser/compression, per-location reverb, ducking,
bus limiting, −14 LUFS normalization with measured true-peak control).

**Every generative engine has a full-mode (GPU) adapter and a degraded-mode
(CPU) implementation.** This box has **no GPU** (2 cores / 3.8 GB RAM,
huggingface.co blocked), so all shipped samples were rendered end-to-end by
the degraded path — itself a complete pipeline with identical output specs
and guarantees to full mode.

## 2. Fixes made in the reconciliation session

1. **Unknown speakers were broken** — `SHOPKEEPER: text` fell into narration
   and the label was *spoken aloud* by the narrator. Now: guest characters
   (label stripped from speech, original name kept in captions, stable
   auto-cast voice from the voice bible; prose containing colons untouched).
   Regression tests added (`test_guest_speaker_autocast`,
   `test_e2e_guest_speaker`, `test_title_line_never_spoken` — the Title fix
   was itself a bug caught by re-testing).
2. **Web-portal character selection was a no-op stub** — now wired end-to-end:
   portal → pipeline → planner; restricts guest auto-casting to the selected
   characters (verified live: SHOPKEEPER → mika voice under `[mika, tommy]`).
3. **Loudness chain left sparse mixes ~1 dB low** — root causes found by
   instrumented traces: (a) the limiter was sample-peak, but inter-sample
   true peak overshoots by ~1 dB on speech, so the post-AAC guard attenuated
   the whole mix; (b) intro music was seeded by `video_id`, breaking
   cross-run reproducibility. Fixes: 4×-oversampled **true-peak limiter**
   (`A.limit_true_peak`), non-oscillating gain-ride with measured ceiling
   margins, job-independent intro seed. Regression test added.
4. **Per-location reverb** (addendum requirement) implemented: `A.room_reverb`
   (4 room profiles) applied to character dialogue by `scene.location`;
   narration VO stays dry. Unit-tested.
5. **`narration_language` config was dead** — now consumed by the voice
   engine (espeak voice mapping). Unit-tested.
6. **`lyrics.txt`/`genre.txt` sibling auto-detection** added to the CLI
   (flags still win).
7. 60 s sample script restructured so the mandatory test has a pure
   **narration scene** (roles now narration/dialogue/action/song; story
   text unchanged).

## 3. Mandatory tests — all PASS (fresh renders, final code)

| Test | Result |
|---|---|
| 60 s sample (script NOT written by user): narration + action w/ camera movement + song w/ lip-sync + thumbnails | ✅ 1920×1080 24 fps, **63.3 s**, I=**−14.53** LUFS, TP=−2.26, roles narration/dialogue/action/song, 3× 1280×720 thumbs |
| Short, same cast, native 9:16 | ✅ 1080×1920, 31.3 s, I=−14.39, TP=−1.91 |
| 30 s dialogue: 3 characters × 3 emotions + chuckle + voice-breaking | ✅ 31.7 s, I=−14.39, TP=−1.91 |
| Voice consistency across two runs | ✅ **byte-identical final MP4s** from two independent jobs; fresh-vs-cached takes byte-identical |
| Word preservation | ✅ 179/179 (60 s), 77/77 (short), 56/56 (dialogue) spoken words in SRTs — nothing invented, nothing dropped |
| Visual identity across scenes | ✅ fixed keyed sprites reused byte-identically in every scene/job |
| Lip-sync | ✅ mouth envelopes from the exact final take audio: 6/6 + 4/4 character lines active; renderer mouth overlay verified frame-level |
| pytest suite | ✅ **29/29** (schema 9, units 13, e2e 7) |
| Portal end-to-end (upload → progress → download, character selection, regenerate-one-scene, scene preview) | ✅ live |
| MCP server (initialize/tools/call) | ✅ live |

## 4. Hardware & render performance

* Build/test box: 2 CPU cores, 3.8 GB RAM, **no GPU**, Python 3.11.2, 19 GB
  disk free. github.com/pypi.org/npm reachable; **huggingface.co blocked**.
* 1080p24 ≈ 230 ms/frame → **~4–5 min wall per minute of finished video**
  (60 s → 4.0 min; short 31 s → 2.2 min; dialogue 31 s → 2.0 min fresh, ~10 s
  resumed from scene cache).
* Full mode on a ≥12 GB GPU moves the frame stage to SDXL/AnimateDiff
  (minutes per shot); everything else in this report is GPU-independent.

## 5. Executed vs. blocked (honest split)

**Executed and verified here:** planning/annotation brain (deterministic
offline rules), scene-schema validation, casting + guest auto-casting,
14 distinct emotional voices with per-character EQ/de-ess/compression and
per-location reverb, 3-take generation + deterministic selection, 20 SFX
generators, procedural score + original rap song with lip-synced placements,
sprite/parallax rendering with 12 camera moves, 1080p/9:16 encode, full mix
(ducking, −14 LUFS, true-peak control), SRT captions, thumbnails, job
queue/resume/regenerate, portal, MCP.

**Blocked (adapters implemented, cannot execute — see ACCEPTANCE.md §B for
exact blockers):** ComfyUI/SDXL/IP-Adapter/ControlNet frames, AnimateDiff +
LTX-2 motion, Kokoro/Chatterbox/Dia/Qwen3-TTS/Orpheus/Higgs-V2 voice
engines, faster-whisper WER gate, MusicGen/AudioGen, YuE songs, MuseTalk
lip-sync, Ollama brain. Common blockers: no GPU, huggingface.co unreachable
(no weights), 3.8 GB RAM. `scripts/setup_full_mode.sh` +
`docs/FULL_MODE.md` carry the install path; the pipeline auto-detects each
engine and degrades per-component without failing.

**Not built:** emotion2vec take scoring (no license file at audit time —
commercial status unclear).

## 6. Known limitations

1. Degraded visuals are 2D sprite theatre — consistent and clean, but SDXL
   anime frames require the GPU path.
2. The 9+ min long format is verified at 63 s (same loop); only wall time
   scales on CPU.
3. MusicGen/AudioGen *weights* are CC-BY-NC — full mode defaults to the
   original procedural engine and YuE (Apache-2.0) for commercial channels.
4. `resume` of a job whose status is already `done` requires flipping
   `jobs/<id>/job.json` status to `running` first (by design: done jobs are
   considered complete; `bin/zuvyr thumbs` and portal regenerate cover the
   common re-work cases).

## 7. Deliverables

```
video-studio/
  README.md                    install / start / generate (exact commands)
  bin/zuvyr                    CLI (doctor init plan generate resume jobs scene voices thumbs portal mcp)
  src/zuvyr_studio/            52-module hexagonal package
  scripts/bootstrap.sh         venv + deps + doctor
  scripts/setup_full_mode.sh   GPU bootstrap (ComfyUI + nodes + weights)
  scripts/samples/             the three sample scripts
  samples/long/                sample_60s_1080p.mp4 + .srt       (63.3 s, −14.5 LUFS)
  samples/short/               sample_short_9x16.mp4 + .srt       (31.3 s, −14.4 LUFS)
  samples/dialogue/            dialogue_test_30s.mp4 + .srt       (31.7 s, −14.4 LUFS)
  samples/thumbnails/          thumb_a/b/c.png                    (1280×720)
  characters/  voices/         visual + voice bibles (refs, sprites, token blocks)
  tests/                       29 passing tests
  docs/                        ACCEPTANCE / ARCHITECTURE / VOICE_BIBLE / LICENSES / FULL_MODE / REPORT
```

## 8. License summary (full table: `docs/LICENSES.md`)

MIT: Chatterbox(-Turbo), MuseTalk, Automated-Video-Generator, Ollama,
faster-whisper. Apache-2.0: AnimateDiff-Evolved, controlnet_aux, YuE, Dia,
Qwen3-TTS, Orpheus-TTS, Higgs Audio V2, LatentSync, Kokoro. GPL-3.0
(tooling; output unencumbered): ComfyUI + custom nodes, espeak-ng.
Blocked by policy: Higgs Audio V3, Fish Audio S2 Pro (non-commercial).
CC-BY-NC: MusicGen/AudioGen weights (avoided for commercial output). SDXL
base: OpenRAIL++-M. All music/lyrics/vocals in samples are 100% original
procedural DSP; no real person's voice was ever cloned.
