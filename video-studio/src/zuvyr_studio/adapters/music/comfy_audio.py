"""ComfyUI-audio adapter: MusicGen (score) + AudioGen (SFX) in full mode.

License note: MusicGen/AudioGen *weights* are CC-BY-NC (non-commercial) — for a
monetized channel prefer ACE-Step (Apache-2.0) or Stable Audio Open (community
license) through the same ComfyUI-audio nodes. The procedural engine used in
degraded mode is fully original and license-clean.
"""
from __future__ import annotations

from pathlib import Path

from .procedural import compose_score, synth_sfx


class ComfyAudioEngine:
    name = "comfyui_audio"
    full_mode = True

    def __init__(self, config):
        from ..vision.comfyui import ComfyUIClient

        self.client = ComfyUIClient(config)

    def available(self) -> bool:
        return self.client.available()

    def _run(self, workflow: dict, out_dir: Path):
        pid = self.client.queue(workflow)
        entry = self.client.wait(pid)
        return self.client.fetch_output_images(entry, out_dir)

    def music(self, prompt: str, duration_s: float, seed: int, out_dir: Path) -> Path:
        g = {
            1: {"class_type": "MusicGen", "inputs": {"prompt": prompt, "duration": int(duration_s), "seed": seed,
                                                     "model": "facebook/musicgen-medium", "output_format": "wav"}},
            2: {"class_type": "SaveAudio", "inputs": {"audio": ["1", 0], "filename_prefix": "zuvyr_music"}},
        }
        outs = self._run(g, out_dir)
        return outs[0] if outs else None

    def sfx(self, prompt: str, duration_s: float, seed: int, out_dir: Path):
        g = {
            1: {"class_type": "AudioGen", "inputs": {"prompt": prompt, "duration": max(1, int(duration_s)), "seed": seed,
                                                     "model": "facebook/audiogen-medium", "output_format": "wav"}},
            2: {"class_type": "SaveAudio", "inputs": {"audio": ["1", 0], "filename_prefix": "zuvyr_sfx"}},
        }
        outs = self._run(g, out_dir)
        return outs[0] if outs else None

    # graceful fallbacks (degraded mode never blocks on ComfyUI)
    def music_or_fallback(self, mood: str, duration_s: float, seed: int, out_path: Path) -> Path:
        from ...lib import audio as A

        if self.available():
            try:
                p = self.music(f"{mood} cinematic background score, no vocals", duration_s, seed, out_path.parent)
                if p:
                    _, arr = A.read_wav(p)
                    A.write_wav(out_path, arr)
                    return out_path
            except Exception:
                pass
        A.write_wav(out_path, compose_score(mood, duration_s, seed))
        return out_path

    def sfx_or_fallback(self, name: str, duration_s: float | None, seed: int, out_path: Path) -> Path:
        from ...lib import audio as A

        if self.available():
            try:
                p = self.sfx(name, duration_s or 2.0, seed, out_path.parent)
                if p:
                    _, arr = A.read_wav(p)
                    A.write_wav(out_path, arr)
                    return out_path
            except Exception:
                pass
        A.write_wav(out_path, synth_sfx(name, duration_s, seed))
        return out_path
