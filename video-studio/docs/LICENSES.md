# ZUVYR Studio — Component & Model Licenses

Audited 2026-10 via each project's GitHub/HuggingFace license file. Goal:
every component must be usable for **commercial YouTube videos**
(prefer Apache-2.0/MIT). GPL applies only to *tooling* (ComfyUI custom
nodes), which is fine for generated output — the GPL does not extend to
videos produced with the tool.

## Pipeline & generation stack

| Component | Role | License | Commercial use |
|---|---|---|---|
| itsPremkumar/Automated-Video-Generator | base app (architecture) | MIT | ✅ |
| ComfyUI | headless generation server | GPL-3.0 | ✅ (tooling; output unencumbered) |
| ComfyUI-AnimateDiff-Evolved | motion (AnimateDiff) | Apache-2.0 | ✅ |
| ComfyUI_IPAdapter_plus | character identity (FaceID) | GPL-3.0 | ✅ (tooling) |
| ComfyUI-VideoHelperSuite | video in/out nodes | GPL-3.0 | ✅ (tooling) |
| comfyui_controlnet_aux | OpenPose/Canny/Depth prepro | Apache-2.0 | ✅ |
| comfyui-audio | MusicGen/AudioGen nodes | GPL-3.0 | ✅ (tooling) |
| Stable Diffusion XL base 1.0 | image backbone | OpenRAIL++-M (CreativeML Open RAIL++-M) | ✅ with use restrictions (no harm) — output ownership per license terms |
| anime SDXL LoRA / 3D-render SDXL | style | must be Apache-2.0/MIT/CC-BY — check each download | ⚠️ pick only commercial-safe weights |
| IP-Adapter-FaceID | face identity | Apache-2.0 (code); weights — check model card | ⚠️ verify at download |
| LTX-2.x (Lightricks) | key-shot motion successor | **LTX-2.x Community License** (custom, NOT OSI): free commercial use only under $10M annual revenue; ≥$10M requires a paid agreement; 22B params, CUDA 12.7+, 16 GB VRAM min path (int8/NVFP4 variants) — verified 2026-10 | ⚠️ free for a personal YouTube channel; paid tier needed at ≥$10M revenue |

## Voice

| Component | Role | License | Commercial use |
|---|---|---|---|
| Kokoro-82M | **narrator only** | Apache-2.0 | ✅ |
| Chatterbox / Chatterbox-Turbo | main character engine | MIT | ✅ |
| Dia (Nari Labs) | multi-speaker dialogue | Apache-2.0 | ✅ |
| Qwen3-TTS | free-form voice design | Apache-2.0 | ✅ |
| Orpheus-TTS | tag-based expressive TTS | Apache-2.0 | ✅ |
| Higgs Audio **V2** | long dramatic dialogue | Apache-2.0 | ✅ (V2 only) |
| **Higgs Audio V3** | — | **non-commercial — DO NOT USE** | ❌ blocked |
| **Fish Audio S2 Pro** | — | **non-commercial — DO NOT USE** | ❌ blocked |
| faster-whisper | take WER gate | MIT | ✅ |
| emotion2vec | take emotion scoring | no license file at audit time — verify before commercial use | ⚠️ |
| espeak-ng | degraded-mode voices | GPL-3.0 | ✅ (tooling; speech output unencumbered) |
| Edge-TTS | network fallback narration | free Microsoft endpoint, no key | ⚠️ check ToS for commercial narration |

## Music / SFX / songs

| Component | Role | License | Commercial use |
|---|---|---|---|
| MusicGen / AudioGen weights | score + SFX | **CC-BY-NC** — NOT commercial | ❌ weights |
| procedural music/SFX engine (`music/procedural.py`, 20 SFX) | degraded-mode score/SFX | this repo | ✅ 100% original DSP |
| YuE (s1-7B + s2-1B) | original songs | Apache-2.0 | ✅ (needs ~30 GB VRAM class) |
| **ACE-Step 1.5** (recommended song engine) | full songs with vocals, ~3.5B, <4 GB VRAM, Mac/AMD/Intel/CUDA | **MIT (code AND weights)**, trained on licensed/royalty-free data — verified 2026-10 | ✅ best fit for this project |

> **Note on MusicGen/AudioGen:** the *weights* are CC-BY-NC, so full mode
> defaults to YuE for songs and the procedural engine for score/SFX; MusicGen
> output is opt-in for non-commercial channels only. Everything shipped in
> `samples/` was rendered by the original procedural engine.

## Lip-sync

| Component | Role | License | Commercial use |
|---|---|---|---|
| MuseTalk | primary lip-sync | MIT | ✅ |
| LatentSync | fallback | Apache-2.0 | ✅ |
| Wav2Lip | fallback | non-commercial research — use only if the others are unavailable | ⚠️ verify |

## Infra

| Component | Role | License | Commercial use |
|---|---|---|---|
| FFmpeg (imageio-ffmpeg wheel) | mux/encode/loudness | LGPL-2.1/GPL compile — binaries via wheel | ✅ |
| Flask / pydantic / numpy / scipy / Pillow | runtime | BSD-3 / MIT / BSD-3 / BSD-3 / MIT-CMU | ✅ |
| Ollama + qwen3-class models | planner brain | MIT (Ollama) + Apache-2.0 (Qwen) | ✅ |

## Policy guarantees

* Music, lyrics and vocals are **100% model-generated originals** — no
  copyrighted tracks, no real artists' lyrics.
* **No real person's voice is ever cloned.** Clone references are the
  studio's own model-generated neutral clips (or user-owned recordings).
* Content guardrails target YouTube advertiser-friendliness; the planner
  refuses to pass through explicit material into song/narration prompts.
