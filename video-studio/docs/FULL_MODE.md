# ZUVYR Studio — Full Mode (GPU)

Degraded mode (CPU) proves the whole pipeline: same schema, same planner,
same mix/loudness chain, same outputs. Full mode swaps the generative
adapters on. `scripts/setup_full_mode.sh` automates the install; run
`bin/zuvyr doctor` afterwards to see the capability matrix light up.

## What upgrades

| Stage | Degraded (CPU) | Full (GPU) |
|---|---|---|
| Frames | fixed sprites + Ken Burns | SDXL + anime SDXL LoRA via ComfyUI, per-character fixed seed + IP-Adapter FaceID + token block in every prompt; ControlNet OpenPose (posing) / Canny (outfit) / Depth (blocking) |
| Motion | zoompan | AnimateDiff v3 + v2 motion LoRAs (~0.75 strength) **on key shots only**; Ken Burns elsewhere; **LTX-2** on hero shots if ≥16 GB VRAM |
| Narration | zsynth/espeak DSP | Kokoro-82M (Edge-TTS network fallback) |
| Character voices | zsynth | Chatterbox / Chatterbox-Turbo — exaggeration by emotion class, `[laugh]` tags, zero-shot clone from the bible reference clips; Dia `[S1]/[S2]` multi-speaker; Qwen3-TTS designed cast voices; Orpheus tags; Higgs Audio **V2** for long dramatic dialogue (never V3, never Fish S2 Pro) |
| Take selection | cache hash | 3 takes/line (different seeds) → faster-whisper WER + emotion2vec match |
| Score/SFX | procedural originals | MusicGen/AudioGen via ComfyUI-audio (weights CC-BY-NC → prefer YuE/procedural for commercial) |
| Songs | procedural rap-over-beat | YuE s1-7B + s2-1B full original songs from `lyrics.txt` + `genre.txt` |
| Lip-sync | procedural mouth states | MuseTalk driven by the exact final mix (LatentSync / Wav2Lip fallbacks) |
| Brain | offline deterministic NLP | Ollama qwen3-class (split/annotate only — never rewrites) |

## Hardware budget

* Minimum for full mode: 1× NVIDIA ≥12 GB VRAM (SDXL frames, Kokoro,
  Chatterbox, MuseTalk; AnimateDiff short clips).
* Recommended: ≥16 GB VRAM → LTX-2 hero shots, YuE songs, Higgs V2 dialogue.
* Disk: ~120 GB for all weights. RAM: 32 GB comfortable.
* Everything still runs CPU-only — it just stays in degraded mode.

## Model downloads (all via `huggingface-cli download`, no key)

See `scripts/setup_full_mode.sh` for the exact commands and target folders
under `external/ComfyUI/models/`. Civitai-hosted LoRAs should be replaced
with a HuggingFace equivalent whose license badge is Apache-2.0/MIT/CC-BY —
never CC-BY-NC. `docs/LICENSES.md` carries the audited license table.

## Adapter contract

Every full-mode adapter (e.g. `adapters/vision/comfyui.py`,
`adapters/voice/chatterbox.py`, `adapters/song/yue.py`,
`adapters/lipsync/generators.py`, `adapters/music/comfy_audio.py`,
`adapters/llm/ollama.py`, `adapters/motion/`) follows the same contract:
probe the engine (socket/weights/VRAM) → if unavailable, log and fall back
to the degraded implementation → never raise past the pipeline. The pipeline
records which engine served each scene in `jobs/<id>/job.json`.
