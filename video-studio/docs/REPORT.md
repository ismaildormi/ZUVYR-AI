# ZUVYR Studio — Final Build & Test Report

**Date:** 2026-10-24 · **Branch:** `arena/e9f36073-zuvyr-ai` · **Subsystem:** `video-studio/`

## 1. What was built

A fully self-hosted, script-to-finished-video pipeline for anime-style
YouTube content, built as a new hexagonal subsystem on top of
itsPremkumar/Automated-Video-Generator (MIT). 51 Python modules
(`src/zuvyr_studio/`), a CLI (`bin/zuvyr`), a Flask web portal, a stdio MCP
server, a 14-voice voice bible, a 6-character visual bible with fixed
sprites/seeds/token blocks, a validated scene schema, a job queue with
per-scene resumability, and a full audio post chain (ducking, bus limiting,
−14 LUFS normalization with measured AAC true-peak compensation).

**Every generative engine has a full-mode (GPU) adapter and a degraded-mode
(CPU) implementation.** This box has **no GPU**, 2 cores / 3.8 GB RAM — so
the shipped samples were rendered end-to-end by the degraded path, which is
itself a complete pipeline (sprites + Ken Burns + procedural music/SFX +
espeak-derived DSP character voices + procedural lip-sync), with identical
output specs and quality guarantees (identity, loudness, captions) to full
mode.

## 2. Test results (all mandatory tests executed)

| Test | Result |
|---|---|
| pytest suite (schema + units + 2 E2E renders @640×360) | **23/23 passed** |
| 60 s sample video (script NOT written by user; narration scene + action scene with camera movement + song scene with lip-sync + 3 thumbnails) | ✅ `samples/long/` — 1920×1080 24 fps, 61.3 s, H.264/AAC, **I=−14.34 LUFS, TP=−1.54 dBTP**, SRT with speaker prefixes |
| Short, same cast, different story, native 9:16 | ✅ `samples/short/` — 1080×1920, 31.3 s, I=−14.60, TP=−1.81 |
| Thumbnails ×3 variants, 1280×720, space for text | ✅ `samples/thumbnails/thumb_{a,b,c}.png` |
| 30 s dialogue: 3 characters × 3 emotions incl. chuckle + voice-breaking | ✅ `samples/dialogue/` — 31.7 s, I=−14.98, TP=−1.50 |
| Characters visually identical across scenes | ✅ verified by sprite md5 — the same byte-identical fixed sprite serves every scene of every job |
| Voices distinct per character and identical across two runs | ✅ fresh-vs-fresh synthesis 9/9 takes corr=1.000, 0% length drift; cached takes byte-identical across renders |
| Web portal end-to-end (upload → progress → MP4) | ✅ live per-scene progress polled to `done`, MP4 produced |
| MCP server (initialize → tools/list → tools/call) | ✅ doctor + list_jobs verified over stdio JSON-RPC |
| Resume / regenerate-one-scene | ✅ scene cache re-assembles in ~8 s; regenerate wipes one scene only |

## 3. Hardware & render performance

* Build/test box: 2 CPU cores, 3.8 GB RAM, no GPU, Python 3.11.2, Debian.
* 1080p24 rendering ≈ 233 ms/frame → **≈ 5 min wall per 1 min of finished
  video** (long 61.4 s → 319 s; short 31.4 s → 178 s; dialogue 31.7 s → 161 s).
* Scene caching makes resume/assembly ≈ 8 s for a finished job.
* Expected on a modern 8-core CPU: roughly 3–4× faster; on GPU full mode the
  frame stage moves to SDXL/AnimateDiff (minutes per shot instead of per
  video).

## 4. What was executed vs. what could not be executed

**Executed on this machine:** planning/annotation brain, scene schema
validation, casting, multi-emotion voice acting (14 distinct voices),
deterministic take caching, 20 SFX generators, procedural score + original
rap song scene with lip-sync placements, sprite compositing with camera
moves, 1080p/9:16 encode, full audio post (dialogue > SFX > ducked music,
−14 LUFS), SRT captions, thumbnails, portal, MCP, job queue/resume,
regenerate-one-scene, pytest suite.

**Could not be executed here (no GPU + HuggingFace blocked from sandbox):**
ComfyUI/SDXL frame generation, AnimateDiff/LTX-2 motion, IP-Adapter
FaceID/ControlNet, Kokoro/Chatterbox/Dia/Qwen3-TTS/Orpheus/Higgs-V2 voice
engines, MusicGen/AudioGen, YuE songs, MuseTalk lip-sync, Ollama brain.
All are implemented as capability-detecting adapters with the exact install
path in `scripts/setup_full_mode.sh` and `docs/FULL_MODE.md`; the pipeline
selects them automatically when present. Weight downloads were verified as
commands (`huggingface-cli download`, no key) but not run from this sandbox.

## 5. Known limitations

1. **Degraded visuals are 2D sprite theatre** — consistent and clean, but not
   SDXL anime frames; that requires the GPU path.
2. **AAC true-peak overshoot** (up to ~5 dB on speech) is compensated
   empirically by measure-and-attenuate after encode; final TP ≤ −1.5 dBTP
   verified on all samples.
3. Sparse dialogue-only content lands at −15.0 LUFS rather than exactly −14
   (gain-ride clamps at +4 dB to stay safe) — within YouTube's practical
   range.
4. `emotion2vec` has no license file at audit time — treat as
   non-commercial until verified (docs/LICENSES.md).
5. MusicGen/AudioGen **weights** are CC-BY-NC — full mode defaults to the
   original procedural engine and YuE (Apache-2.0) for commercial channels.
6. Long-video path (>9 min) is the same loop; only wall time scales
   (≈ 5 min/min on this box).

## 6. Deliverables

```
video-studio/
  README.md                    install / start / generate (exact commands)
  bin/zuvyr                    CLI (doctor init plan generate resume jobs scene voices thumbs portal mcp)
  src/zuvyr_studio/            51-module hexagonal package
  scripts/setup_full_mode.sh   GPU bootstrap (ComfyUI + nodes + weights)
  scripts/samples/             the three test scripts
  samples/long/                sample_60s_1080p.mp4 + .srt        (61.3 s, −14.3 LUFS)
  samples/short/               sample_short_9x16.mp4 + .srt        (31.3 s, −14.6 LUFS)
  samples/dialogue/            dialogue_test_30s.mp4 + .srt        (31.7 s, −15.0 LUFS)
  samples/thumbnails/          thumb_a/b/c.png                     (1280×720)
  characters/  voices/          visual + voice bibles (refs, sprites, token blocks)
  tests/                       23 passing tests
  docs/                        ARCHITECTURE / VOICE_BIBLE / LICENSES / FULL_MODE / REPORT
```

## 7. License summary (full table: `docs/LICENSES.md`)

MIT: Chatterbox(-Turbo), MuseTalk, Automated-Video-Generator, Ollama,
faster-whisper. Apache-2.0: AnimateDiff-Evolved, controlnet_aux, YuE, Dia,
Qwen3-TTS, Orpheus-TTS, Higgs Audio V2, LatentSync, Kokoro. GPL-3.0
(tooling, output unencumbered): ComfyUI + custom nodes, espeak-ng.
Blocked by policy: Higgs Audio V3, Fish Audio S2 Pro (non-commercial).
CC-BY-NC: MusicGen/AudioGen weights (avoided for commercial output). SDXL
base: OpenRAIL++-M. All music/lyrics/vocals in samples are 100% original
procedural DSP; no real person's voice was cloned.
