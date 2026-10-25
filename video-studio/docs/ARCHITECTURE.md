# ZUVYR Studio — Architecture

ZUVYR Studio is a new subsystem inside this repo, built **on top of** the
hexagonal (ports-and-adapters) architecture of
[itsPremkumar/Automated-Video-Generator](https://github.com/itsPremkumar/Automated-Video-Generator)
(MIT). The base app's layout — `src/` with a core domain, application
orchestration, and swappable adapters, driven by an MCP tool surface — is
mirrored module-for-module so the two codebases stay conceptually aligned.

## Mapping to the base app

| Base app concept | ZUVYR Studio equivalent |
|---|---|
| `src/core/` domain models | `schema.py` — pydantic `ScenePlan/Scene/Camera/DialogueLine` (validated scene schema) |
| `src/services/` orchestration | `application/` — `pipeline, planner, offline_brain, emotion, bibles, takes, jobs, thumbnails` |
| `src/adapters/` (Pexels, LLM, …) | `adapters/` — `voice/*`, `music/*`, `vision/*`, `song/*`, `lipsync/*`, `render/*`, `llm/ollama`, `motion/` |
| `src/utils/` helpers | `lib/` — `rng, fs, ffmpeg, audio, styles` |
| MCP server (`server.js`) | `portal/mcp.py` — stdio JSON-RPC, same `ALLOW_UNSAFE_MCP_TOOLS` gate |
| Node CLI | `cli.py` + `bin/zuvyr` |
| Web portal | `portal/server.py` + `portal/static/` (Flask; runs without the Node stack) |
| capability detection | every adapter probes its engine and registers a fallback |

## Pipeline (one pass of `generate`)

```
script.txt
   │  Planner (offline_brain if no Ollama; Ollama qwen3-class if up)
   │  — split scenes, cast speakers, annotate emotion/delivery/nonverbal,
   │    camera + SFX + music cues. NEVER rewrites story text.
   ▼
ScenePlan (validated)  ──►  jobs/<id>/job.json   (queue + per-scene status)
   │
   ├── per scene (cached; resumable):
   │     1. audio     takes.py → voice adapters (engine take-cache for
   │                  determinism) → emotion DSP → per-line WAVs
   │     2. frames    vision adapters (ComfyUI full mode / sprite+Ken Burns
   │                  degraded) → PNG frames + mouth states
   │     3. encode    lib/ffmpeg → scene MP4 + audio
   │
   ├── assemble.py  concat scenes → numpy mix bus
   │                dialogue 1.0 / SFX 0.9 / music 0.85 (sidechain-ducked)
   │                → tanh glue → bus limiter (−3 dB)
   │
   ├── lib/ffmpeg.normalize_lufs  loudnorm(I,TP) → look-ahead limiter →
   │                gain-ride (≤2 iters) → AAC → measure/attenuate TP
   ▼
output/<id>/<id>_{long|short}.mp4 + .srt + thumbnails/thumb_{a,b,c}.png
```

## Adapters & fallbacks

| Concern | Full mode (GPU) | Degraded mode (this box) |
|---|---|---|
| Planner brain | Ollama qwen3-class | `offline_brain.py` deterministic NLP |
| Frames | ComfyUI: SDXL + anime LoRA, IP-Adapter FaceID, ControlNet OpenPose/Canny/Depth | `vision/sprites.py` fixed keyed sprites over backgrounds, camera moves via Ken Burns |
| Motion | AnimateDiff v3/v2 LoRAs on key shots, LTX-2 (≥16 GB) | `render/frames.py` zoompan/pan |
| Narration | Kokoro-82M | `voice/espeak_core.py` (ctypes espeak-ng) → `zsynth.py` DSP character voices |
| Character voices | Chatterbox / Chatterbox-Turbo (exaggeration, [laugh], zero-shot clone), Dia multi-speaker, Qwen3-TTS, Orpheus, Higgs Audio V2 | same zsynth voices (distinct per character, deterministic) |
| Take selection | faster-whisper WER + emotion2vec | engine take-cache hash |
| Music | MusicGen (ComfyUI-audio) | `music/procedural.py` original beat-quantized compositions |
| SFX | AudioGen | 20 procedural SFX generators |
| Songs | YuE s1-7B + s2-1B | `song/procedural_song.py` rap-over-beat with lip-sync placements |
| Lip-sync | MuseTalk (LatentSync/Wav2Lip fallback) | `lipsync/procedural.py` phoneme-ish mouth states from the exact final audio |

Every engine is detected at runtime (`bin/zuvyr doctor` reports the matrix);
a missing engine degrades that component only — the pipeline never hard-fails.

## Guarantees baked in

* **Character identity** — fixed `characters/<id>/sprite.png` + fixed seed +
  token block in every prompt; visually identical across scenes, videos,
  formats. (Verified: byte-identical sprites in every job.)
* **Voice identity** — engine-level take cache keyed on
  (voice, text, emotion, delivery, seed); identical output across runs.
  (Verified: 9/9 takes corr=1.000 fresh-vs-fresh.)
* **Loudness** — final master measured with ffmpeg `loudnorm` print; the
  chain compensates for AAC true-peak overshoot empirically.
* **Resumability** — per-scene artifacts + job.json; `resume` reuses them.
* **Originality** — all music/lyrics/vocals model-generated; reference
  clones only from model-generated clips (never real people).
