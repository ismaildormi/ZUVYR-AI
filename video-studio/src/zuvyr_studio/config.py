"""Config loading (zuvyr.json) with defaults; env overrides."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from .lib.fs import ROOT, read_json, write_json

DEFAULTS: dict[str, Any] = {
    "product": "ZUVYR Studio",
    "style": "2d_anime",
    "narration_language": "en",
    "fps": 24,
    "formats": {
        "long": {"width": 1920, "height": 1080},
        "short": {"width": 1080, "height": 1920},
    },
    "thumbnail": {"width": 1280, "height": 720, "variants": 3},
    "engines": {
        "brain": {
            "mode": "auto",
            "ollama": {"url": "http://127.0.0.1:11434", "model": "qwen3:8b", "timeout_s": 300, "temperature": 0.2},
        },
        "voice": {
            "mode": "auto",
            "order": ["chatterbox", "qwen3_tts", "dia", "orpheus", "kokoro", "zsynth"],
            "takes": 3,
            "full_mode_min_vram_gb": 8,
        },
        "vision": {"mode": "auto", "comfyui": {"url": "http://127.0.0.1:8188", "timeout_s": 900}},
        "motion": {
            "mode": "auto",
            "animatediff": {
                "version": "v3",
                "motion_loras": {"pan_left": 0.75, "pan_right": 0.75, "zoom_in": 0.75, "zoom_out": 0.75, "tilt_up": 0.75, "tilt_down": 0.75, "roll": 0.75},
                "max_animated_ratio": 0.35,
            },
        },
        "music": {"mode": "auto", "order": ["comfyui_audio", "procedural"]},
        "song": {
            "mode": "auto",
            "order": ["yue", "procedural"],
            "yue": {"repo_dir": "external/YuE", "stage1": "m-a-p/YuE-s1-7B-anneal-en-cot", "stage2": "m-a-p/YuE-s2-1B-general"},
        },
        "lipsync": {
            "mode": "auto",
            "order": ["musetalk", "latentsync", "wav2lip", "procedural"],
            "musetalk": {"repo_dir": "external/MuseTalk"},
        },
        "render": {"mode": "auto", "order": ["remotion", "ffmpeg"], "base_app_dir": "external/Automated-Video-Generator"},
    },
    "audio": {
        "target_lufs": -14.0,
        "peak_db": -1.5,
        "duck_db": 10.0,
        "sample_rate": 44100,
        "caption_mode": "burn",  # burn | sidecar | both
    },
    "video": {"crf": 27, "preset": "veryfast"},
    "paths": {
        "characters": "characters",
        "voices": "voices",
        "assets": "assets",
        "scripts": "scripts",
        "jobs": "jobs",
        "output": "output",
        "external": "external",
    },
}

CONFIG_PATH = ROOT / "zuvyr.json"


def _deep_merge(base: dict, over: dict) -> dict:
    out = dict(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


class Config:
    def __init__(self, data: dict | None = None, root: Path | None = None):
        self.root = root or ROOT
        file_data = read_json(self.root / "zuvyr.json", {}) or {}
        data = data or {}
        self._data = _deep_merge(_deep_merge(DEFAULTS, file_data), data)
        self._apply_env()

    # -------------------------------------------------- env overrides
    def _apply_env(self) -> None:
        if os.environ.get("ZUVYR_STYLE"):
            self._data["style"] = os.environ["ZUVYR_STYLE"]
        if os.environ.get("ZUVYR_LANGUAGE"):
            self._data["narration_language"] = os.environ["ZUVYR_LANGUAGE"]
        if os.environ.get("OLLAMA_URL"):
            self._data["engines"]["brain"]["ollama"]["url"] = os.environ["OLLAMA_URL"]
        if os.environ.get("OLLAMA_MODEL"):
            self._data["engines"]["brain"]["ollama"]["model"] = os.environ["OLLAMA_MODEL"]
        if os.environ.get("COMFYUI_URL"):
            self._data["engines"]["vision"]["comfyui"]["url"] = os.environ["COMFYUI_URL"]

    # -------------------------------------------------- accessors
    def __getitem__(self, key: str) -> Any:
        return self._data[key]

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    @property
    def style(self) -> str:
        return self._data["style"]

    @property
    def fps(self) -> int:
        return int(self._data["fps"])

    @property
    def language(self) -> str:
        return self._data["narration_language"]

    def dims(self, fmt: str = "long") -> tuple[int, int]:
        f = self._data["formats"][fmt]
        return int(f["width"]), int(f["height"])

    def path(self, key: str) -> Path:
        return (self.root / self._data["paths"][key]).resolve()

    @property
    def jobs_dir(self) -> Path:
        return self.path("jobs")

    @property
    def output_dir(self) -> Path:
        return self.path("output")

    @property
    def characters_dir(self) -> Path:
        return self.path("characters")

    @property
    def voices_dir(self) -> Path:
        return self.path("voices")

    @property
    def assets_dir(self) -> Path:
        return self.path("assets")

    @property
    def external_dir(self) -> Path:
        return self.path("external")

    @property
    def audio_cfg(self) -> dict:
        return self._data["audio"]

    @property
    def engines(self) -> dict:
        return self._data["engines"]

    def engine_mode(self, name: str) -> str:
        return self._data["engines"].get(name, {}).get("mode", "auto")

    def engine_order(self, name: str) -> list[str]:
        return self._data["engines"].get(name, {}).get("order", [])

    def save(self) -> None:
        write_json(self.root / "zuvyr.json", self._data)


def load_config(**overrides: Any) -> Config:
    return Config(data=overrides or None)
