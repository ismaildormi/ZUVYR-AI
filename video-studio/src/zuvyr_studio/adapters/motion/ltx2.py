"""LTX-2 motion adapter (full mode only).

Renders hero-shot video motion through a local headless ComfyUI
(--listen 127.0.0.1 --port 8188) using LTX-2 weights, for machines with
>= 16 GB VRAM. Follows the studio adapter contract: probe first, degrade
never-fail — when ComfyUI or the weights are absent, `available()` is False
and the pipeline's Ken Burns path (adapters/render/frames.py) serves the
shot instead. AnimateDiff v3/v2 motion LoRAs at ~0.75 strength cover the
non-hero key shots via the same ComfyUI surface (adapters/vision/comfyui.py).
"""
from __future__ import annotations

import socket
from pathlib import Path


class LTX2Motion:
    NAME = "ltx2"
    MIN_VRAM_GB = 16

    def __init__(self, cfg):
        self.cfg = cfg
        self.host = cfg.get("comfyui", {}).get("host", "127.0.0.1")
        self.port = int(cfg.get("comfyui", {}).get("port", 8188))
        self.weights = Path(cfg.root) / "external" / "ComfyUI" / "models"

    def available(self) -> bool:
        """True when ComfyUI answers on :8188 and LTX-2 weights are present."""
        try:
            with socket.create_connection((self.host, self.port), timeout=1.5):
                pass
        except OSError:
            return False
        # weights land via scripts/setup_full_mode.sh (>=16 GB VRAM branch)
        return any(self.weights.rglob("*ltx*")) if self.weights.exists() else False

    def render_motion(self, prompt: str, frames: int, width: int, height: int,
                      fps: int = 24, out_path: str | Path = "motion.mp4") -> Path:
        """Submit the LTX-2 workflow to ComfyUI and wait for the clip.

        Full-mode implementation: POST the workflow JSON to
        /prompt, poll /history, fetch the output video. Only reachable when
        available() is True; otherwise the pipeline never calls this.
        """
        if not self.available():
            raise RuntimeError(
                "LTX-2 unavailable: start ComfyUI (scripts/setup_full_mode.sh) "
                "with >=16 GB VRAM; the pipeline falls back to Ken Burns motion")
        from ..vision.comfyui import ComfyUIClient  # local import: full mode only

        client = ComfyUIClient(self.host, self.port)
        workflow = client.build_ltx2_workflow(prompt, frames, width, height, fps)
        return client.run(workflow, out_path)
