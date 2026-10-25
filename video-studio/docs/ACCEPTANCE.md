# ZUVYR Studio — Acceptance Matrix

Requirement-by-requirement reconciliation of the original specification (including
the expressive multi-character voice-acting addendum) against the code on this
branch. Statuses:

* **VERIFIED** — implemented **and** executes successfully here; evidenced by a test or a live run in this session.
* **PARTIAL** — works but with a documented limitation (no hard external blocker).
* **BLOCKED** — code/adapter exists, cannot execute in this environment (exact blocker given). An adapter, install script, or docs entry alone is **not** a working integration and is never counted as VERIFIED.
* **NOT BUILT** — no implementation.

Environment of record (this session): 2 CPU cores, 3.8 GB RAM, **no GPU**, 19 GB
disk free; network: github.com + pypi.org + registry.npmjs.org reachable,
**huggingface.co blocked** (no weight downloads). Every VERIFIED row below ran
on this machine with the code at the final commit.

---

## A. Core pipeline (degraded/CPU mode — executes here)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| A1 | Script ingestion **without rewriting the story** (brain splits/annotates only) | **VERIFIED** | `tests/test_pipeline_units.py::test_planner_never_rewrites_dialogue`; word-preservation check on final renders: sample60 179/179, short 77/77, dialogue 56/56 spoken words present in SRT (0 missing). Inline stage directions become nonverbal annotations and are never spoken (by design). |
| A2 | Validated scene JSON (scene_id, timeline_ref, duration, characters_present, voice_over_narration, visual_prompt, camera, motion_directions, sfx_prompt, music_cue, lip_sync, song_segment) | **VERIFIED** | `schema.py` (pydantic v2, coercing validators); `tests/test_schema.py` (8 tests); every job persists `jobs/<id>/plan.json` and re-validates on load. |
| A3 | Recurring character identity (fixed face/hair/outfit/seed/token block in every prompt) | **VERIFIED** | `characters/<id>/{reference,sprite}.png` + fixed seeds + token blocks (`bibles.py`); sprites byte-identical across all jobs (renderer draws from the same keyed PNGs); `test_chroma_keying_produces_sprites`. |
| A4 | Narration (English, configurable language) | **VERIFIED** | Narrator voice in every render; `narration_language` config wired through `zsynth._lang_voice` (`test_narration_language_persona`); espeak-ng supports the mapped languages. |
| A5 | Distinct emotional character voices | **VERIFIED** | 14-voice bible (`voices/`); per-line emotion/intensity/delivery/nonverbal annotation → DSP; distinctness + determinism: `test_voice_engine_deterministic_and_distinct`; dialogue test = 3 characters × 3 emotions incl. `(chuckle)` + trembling/breaking delivery. |
| A6 | Generated visuals | **PARTIAL** | Degraded renderer executes (sprite compositing, parallax backgrounds, rain/confetti/speed-line FX — all final renders). SDXL/IP-Adapter/ControlNet frames are **BLOCKED** (see B1–B3). |
| A7 | Camera motion | **VERIFIED** | 12 camera moves (`_motion_for`, `CameraFlow` in `render/frames.py`); action scene uses whip_pan + zoom_out; plan JSON records shot+movement per scene. |
| A8 | SFX | **VERIFIED** | 20 procedural generators (`music/procedural.py::synth_sfx`), `[SFX:]` tags + auto-SFX from text; rendered in all samples. AudioGen is BLOCKED (B6). |
| A9 | Original music (score, ducked under narration) | **VERIFIED** | Procedural per-mood composer + `duck_music` sidechain (`test_duck_music_attenuates_under_speech`); 100% original DSP — no third-party audio anywhere. |
| A10 | Song vocals (hip-hop/trap, kids rapping) | **VERIFIED** (degraded engine) | `<Song>` block → 3-voice beat-quantized rap over composed trap beat with cheer tail (`song/procedural_song.py`), rendered + lip-synced in sample60 s004. YuE full-quality songs BLOCKED (B7). |
| A11 | Lip-sync | **VERIFIED** (degraded engine) | Mouth envelopes computed from the **exact final take audio** (`lipsync/procedural.py`) — 6/6 and 4/4 character lines active in final renders; renderer mouth overlay verified (mouth-open frame ≠ mouth-closed frame). MuseTalk BLOCKED (B8). |
| A12 | Video assembly (FFmpeg) | **VERIFIED** | concat → numpy mix → loudnorm → mux (stream-copy audio); h264/aac 24 fps outputs. |
| A13 | Subtitles/captions | **VERIFIED** | Speaker-prefixed SRT timed from actual synthesized audio (`write_srt`); verified in all samples. |
| A14 | Thumbnails ×3, 1280×720, space for text | **VERIFIED** | `thumbnails.py`; 3 variants in `samples/thumbnails/`, size-checked in `test_e2e_thumbnails` and on the final render. |
| A15 | Native vertical Shorts (1080×1920, same cast) | **VERIFIED** | `sampleshort` renders 1080×1920 (probe-verified), not a crop; `test_e2e_short_format`. |
| A16 | Long format 1920×1080 | **VERIFIED** | sample60: 63.3 s at 1920×1080 (the 9+ min format is the same loop; wall time ~5 min per video-minute on this 2-core box). |
| A17 | Resumable jobs, per-scene progress, regenerate-one-scene | **VERIFIED** | `jobs.py` + per-scene artifacts; `resume` re-assembles from cache (~10 s); portal `POST .../regenerate` re-rendered s001 live this session; scene cache reused across runs (byte-identical outputs). |
| A18 | Web portal (upload, style switch, character selection, per-scene preview, regenerate, download) | **VERIFIED** | Live test this session: `POST /api/jobs` (script + style + format + **characters**) → progress polled to `done` → scene audio preview (200) → MP4 download (200) → index (200); regenerate endpoint exercised. Character selection now actually restricts auto-casting (was a no-op stub before this session). |
| A19 | MCP server | **VERIFIED** | stdio JSON-RPC: initialize → tools/list → tools/call (`zuvyr_list_jobs`) all returned correct payloads this session; write tools gated behind `ALLOW_UNSAFE_MCP_TOOLS=1`. |
| A20 | Job queue with per-scene progress | **VERIFIED** | `job.json` stages/scenes; portal progress percentages live; `bin/zuvyr jobs`. |

## B. Full-mode (GPU) components — implemented as adapters, **not executing here**

All of these follow the same contract: probe → if unavailable, fall back to the
degraded engine (never crash the pipeline). None can run on this box.

| # | Component | Status | Blocker (exact) | Implementation |
|---|---|---|---|---|
| B1 | ComfyUI headless :8188 + AnimateDiff-Evolved/IPAdapter_plus/VideoHelperSuite/controlnet_aux/ComfyUI-audio | **BLOCKED** | No GPU; ComfyUI not installed (needs ~20 GB weights + CUDA) | `adapters/vision/comfyui.py` (client, queue/wait/fetch, `sdxl_ipadapter_workflow`, `animatediff_workflow`, image upload); `scripts/setup_full_mode.sh` |
| B2 | SDXL + anime SDXL LoRA (2D) + 3D-render SDXL | **BLOCKED** | No GPU + huggingface.co blocked from this sandbox (weight download impossible) | style LoRA slots in `zuvyr.json` → `engines.vision.comfyui.style_loras` |
| B3 | IP-Adapter-FaceID + ControlNet OpenPose/Canny/Depth | **BLOCKED** | same | workflow builder in `comfyui.py` (`sdxl_ipadapter_workflow`) |
| B4 | AnimateDiff v3+v2 motion LoRAs ~0.75 on key shots; LTX-2 if ≥16 GB | **BLOCKED** | same | `engines.motion.animatediff` config (strengths 0.75, `max_animated_ratio` 0.35); `adapters/motion/ltx2.py` (probe → Ken Burns fallback) |
| B5 | Kokoro narration (Edge-TTS fallback) | **BLOCKED** | `kokoro-onnx` not installed; ONNX weights unreachable (HF blocked); Edge-TTS needs Microsoft endpoints not reachable from sandbox | `adapters/voice/kokoro.py`, `edge.py` |
| B6 | MusicGen score + AudioGen SFX via ComfyUI-audio | **BLOCKED** | No GPU/ComfyUI; weights CC-BY-NC anyway (procedural engine is the commercial default) | `adapters/music/comfy_audio.py` |
| B7 | YuE s1-7B + s2-1B original songs | **BLOCKED** | No GPU (needs ~30 GB VRAM class) + HF blocked | `adapters/song/yue.py` (stage1/stage2 config) |
| B8 | MuseTalk lip-sync (LatentSync/Wav2Lip fallbacks) | **BLOCKED** | No GPU + model repos unreachable | `adapters/lipsync/generators.py` |
| B9 | Ollama brain (qwen3-class) for split/prompts/camera/SFX/music cues + JSON validation | **BLOCKED** | Ollama not installed; a qwen3-class model would not fit in 3.8 GB RAM | `adapters/llm/ollama.py` (prompt with "do not rewrite" rule + `_dialogue_guard` that rejects LLM output if it rewrote dialogue; falls back to offline brain) |
| B10 | Chatterbox/Chatterbox-Turbo expressive voices (exaggeration, [laugh], zero-shot clone) | **BLOCKED** | `chatterbox-tts` not installed; weights unreachable | `adapters/voice/chatterbox.py` (engine order first in config; `test_chatterbox_params_ranges`) |
| B11 | Dia multi-speaker, Qwen3-TTS voice design, Orpheus tags, Higgs Audio V2 long dialogue | **BLOCKED** | local TTS services not deployable here (no GPU / model weights) | `adapters/voice/http_tts.py` bridge with per-engine payload builders (Dia `[S1]/[S2]` scripts, Qwen3 free-form voice design, Orpheus `<sigh>` tags, Higgs **V2 only** — V3/Fish S2 Pro intentionally unsupported) |
| B12 | faster-whisper WER take gate | **BLOCKED** | model weights come from HF (blocked) | `takes.py::_wer` — code path + graceful fallback selection VERIFIED (degraded selection is deterministic) |
| B13 | emotion2vec take scoring | **NOT BUILT** | no license file at audit time (commercial status unclear) | documented in `docs/LICENSES.md`; take selection works without it |

## C. Voice-acting addendum

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C1 | Kokoro = narrator ONLY | **VERIFIED** (policy + config) | voice bible `narrator` entry; engine order; Kokoro execution itself BLOCKED (B5) |
| C2 | Chatterbox main engine, exaggeration 0.4–0.6/0.8–1.0/1.5–2.0 by emotion class | **VERIFIED** (mapping) / **BLOCKED** (engine) | `emotion.py` + `chatterbox.py` params; `test_chatterbox_params_ranges` |
| C3 | Voice bible ≥12 voices with full metadata + 8–10 s model-generated reference clips, reused forever, never clone real people | **VERIFIED** | 14 voices (`docs/VOICE_BIBLE.md`), reference clips in `voices/reference_clips/` (rebuilt via `bin/zuvyr voices --build`); clips are zsynth-generated — no real voice is ever cloned |
| C4 | Per-line emotion annotation (speaker, emotion, intensity 1–5, delivery, pause_before_ms, nonverbal) — brain annotates only | **VERIFIED** | `schema.py::DialogueLine` + `offline_brain.py`; `test_dialogue_line_validation`, `test_emotion_lexicon` |
| C5 | 3 takes per important line, different seeds; reject mispronunciations (WER); pick best emotion match else lowest WER + most expressive | **VERIFIED** (takes+selection) / **BLOCKED** (ASR gate) | `takes.py::synth_line` generates 3 seeded takes (cache-keyed), selection = completed→WER→middle-take; ASR gate needs faster-whisper weights (B12) |
| C6 | Pauses before reveals; slower = sad; sharper = anger | **VERIFIED** | `emotion.py::line_params` (sad rate 0.88×, pauses 180/90 ms); audible in dialogue sample |
| C7 | Long dialogues via Dia/Higgs single pass, split per speaker for lip-sync | **BLOCKED** | B11 |
| C8 | Audio post: per-character EQ / de-esser / compression / normalize | **VERIFIED** | zsynth per-take chain: persona EQ (bright/dark/rap/nasal/whisper) + `acompressor` + `deesser` on **every** character take + peak normalize; per-voice pitch/timbre DSP |
| C9 | Per-location reverb | **VERIFIED** | **new this session**: `A.room_reverb` (4 room profiles) applied to character dialogue by `scene.location` at mix time (`LOCATION_ROOMS` in `pipeline.py`); `test_room_reverb`; narration VO stays dry |
| C10 | dialogue > SFX > ducked music, ~−14 LUFS | **VERIFIED** | `finalize_mix` (1.0/0.9/0.85 + sidechain duck) → `normalize_lufs`; final renders: I = −14.53/−14.39/−14.39, TP ≤ −1.91 (`test_normalize_lufs_sparse_converges`, `test_e2e_loudness`) |
| C11 | Exact final audio feeds lip-sync | **VERIFIED** | mouth envelopes are computed from the same take WAVs that build the mix (C11 check: 6/6 + 4/4 active envelopes on final renders) |
| C12 | Never Higgs V3 / Fish Audio S2 Pro | **VERIFIED** | not implemented anywhere; `http_tts.py` docstring + `docs/LICENSES.md` hard-block them |

## D. Infrastructure & delivery

| # | Requirement | Status | Evidence |
|---|---|---|---|
| D1 | Base app hexagonal layout, new modules mirror it | **VERIFIED** | `docs/ARCHITECTURE.md` mapping table; `src/zuvyr_studio/{lib,application,adapters,portal}` |
| D2 | Model downloads via `huggingface-cli download`, no key; Civitai → HF equivalent | **PARTIAL** | `scripts/setup_full_mode.sh` has exact commands; **cannot execute here** (HF blocked) — commands present but unrun |
| D3 | License audit incl. voice engines; commercial-YouTube-safe | **VERIFIED** | `docs/LICENSES.md` (every component + blocked list); no CC-BY-NC asset in any shipped sample |
| D4 | README with exact install/start/generate | **VERIFIED** | `README.md` (venv → pip → doctor → generate → portal), `scripts/bootstrap.sh` |
| D5 | Sample MP4s + thumbnails delivered | **VERIFIED** | `samples/{long,short,dialogue,thumbnails}/` (29 MB, all rendered by this exact code) |
| D6 | Final report (built/tested/failed/limits, hardware, render time, license table) | **VERIFIED** | `docs/REPORT.md` (updated this session) |
| D7 | 9+ min long videos | **PARTIAL** | same pipeline/loop, verified at 63 s; only wall time scales (~5 min per video-minute on 2 cores) — a 9-min render ≈ 45 min CPU was not run |
| D8 | YouTube advertiser-friendly content | **VERIFIED** (guardrails) | planner passes only script text through; original music only; no explicit material in cast/scripts; final responsibility stays with the script author |
| D9 | Optional inputs: `[Visual:]` tags, lyrics.txt + genre.txt | **VERIFIED** | `[Visual:]`/`[SFX:]`/`[Music:]`/`[Scene]` tags parsed; `--lyrics/--genre` flags **and** sibling `lyrics.txt`/`genre.txt` auto-detect (new this session) |
| D10 | Style `2d_anime` \| `3d_render` as config | **VERIFIED** | `--style` flag, style prefixes in plan prompts (`test_planner_style_3d_prefix`); visual difference requires full mode (B2) |

## Mandatory test runs (this session, final code)

| Test | Result |
|---|---|
| 60 s sample (script NOT written by user): narration scene + action scene w/ camera movement + song scene w/ lip-sync + thumbnail set; characters visually identical | **PASS** — 1920×1080, 63.3 s, I=−14.53/TP=−2.26, roles = narration/dialogue/action/song, 3×1280×720 thumbs, fixed sprites |
| Short, same cast, native 9:16 | **PASS** — 1080×1920, 31.3 s, I=−14.39/TP=−1.91 |
| 30 s dialogue: 3 characters × 3 emotions + chuckle/breaking moment | **PASS** — 31.7 s, I=−14.39/TP=−1.91, Grimm greedy/cold+(chuckle), Tommy fearful/trembling, Mika sad/breaking |
| Voices distinct + identical across two runs | **PASS** — two independent jobs produce **byte-identical final MP4s**; per-take cache fresh-vs-cached byte-identical |
| Word preservation | **PASS** — 179/179, 77/77, 56/56 spoken words appear in the SRTs (0 invented, 0 dropped) |
| pytest suite | **PASS** — 28/28 (schema 8, units 13, e2e 7 incl. guest-speaker render + loudness regression) |
| Portal end-to-end incl. character selection | **PASS** (live) |
| MCP stdio server | **PASS** (live) |
