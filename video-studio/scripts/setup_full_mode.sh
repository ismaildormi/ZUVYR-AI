#!/usr/bin/env bash
# ZUVYR Studio full-mode bootstrap (GPU machines).
#
# Clones ComfyUI + custom nodes, downloads model weights from HuggingFace
# (no key required), installs the optional Python engines, and starts the
# headless ComfyUI server on :8188. Run from video-studio/.
#
# Requirements: NVIDIA GPU (>=16 GB VRAM recommended for LTX-2 motion),
# git, python3.10+, ~120 GB free disk, HF reachable.
set -euo pipefail
cd "$(dirname "$0")/.."

VRAM_GB="${ZUVYR_VRAM_GB:-$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 || echo 0)}"
echo "== ZUVYR full-mode setup | GPU VRAM: ${VRAM_GB} MB"

# ---------- 1) Python env ----------
if [ ! -d .venv ]; then python3 -m venv .venv; fi
.venv/bin/pip install -r requirements.txt
# optional engines (all free, self-hosted)
.venv/bin/pip install chatterbox-tts kokoro-onnx edge-tts faster-whisper

# ---------- 2) ComfyUI + custom nodes ----------
mkdir -p external
cd external
[ -d ComfyUI ] || git clone https://github.com/comfyanonymous/ComfyUI
cd ComfyUI/custom_nodes
for repo in kosinkadink/ComfyUI-AnimateDiff-Evolved cubiq/ComfyUI_IPAdapter_plus \
            Kosinkadink/ComfyUI-VideoHelperSuite Fannovel16/comfyui_controlnet_aux \
            alesaintcom/comfyui-audio; do
  name=$(basename "$repo")
  [ -d "$name" ] || git clone "https://github.com/$repo"
done
cd ../../..

# ---------- 3) weights (huggingface-cli, no key) ----------
# Every weight below is licensed for commercial use — see docs/LICENSES.md.
.venv/bin/pip install -U "huggingface_hub[cli]"
HF=".venv/bin/huggingface-cli download"

$HF stabilityai/stable-diffusion-xl-base-1.0 sd_xl_base_1.0.safetensors \
  --local-dir external/ComfyUI/models/checkpoints
# anime SDXL LoRA (2d_anime) + 3D-render SDXL — pick your favourites from HF,
# verify the license badge says Apache-2.0/MIT/CC-BY (NOT CC-BY-NC), e.g.:
#   $HF Linaqruf/anything-v3.0 ...           (anime style base)
#   $HF stabilityai/sd-xl-refiner-1.0 ...    (3d_render base)
$HF h94/IP-Adapter-FaceID ip-adapter-faceid-plusv2_sdxl.bin \
  --local-dir external/ComfyUI/models/ipadapter
$HF lllyasviel/Annotators openpose-sdxl-1.0_controlnet50.safetensors \
  --local-dir external/ComfyUI/models/controlnet
# AnimateDiff v3 + v2 motion LoRAs (~0.75 strength, key shots only):
$HF guoyww/animatediff motion_lora.ckpt \
  --local-dir external/ComfyUI/models/animatediff_models || true

# ---------- 4) audio models ----------
mkdir -p external/audio_models
$HF hexgrad/Kokoro-82M kokoro-v1_0.onnx --local-dir external/audio_models || true
$HF Kyutify/chatterbox ... --local-dir external/audio_models || true   # see chatterbox README

# ---------- 5) optional: LTX-2 motion (>=16 GB VRAM) ----------
if [ "${VRAM_GB:-0}" -ge 16000 ] 2>/dev/null; then
  echo "== >=16 GB VRAM: enabling LTX-2 motion adapter"
  $HF Lightricks/LTX-2 ... --local-dir external/ComfyUI/models/checkpoints || true
fi

# ---------- 6) start headless ComfyUI ----------
echo "== starting ComfyUI on :8188 (leave running, then: bin/zuvyr doctor)"
cd external/ComfyUI && ../../.venv/bin/python main.py --listen 127.0.0.1 --port 8188
