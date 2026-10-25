"""YuE adapter — original songs with vocals (full mode).

Repo: multimodal-art-projection/YuE (Apache-2.0)
Weights: m-a-p/YuE-s1-7B-anneal-en-cot + m-a-p/YuE-s2-1B-general

Runs YuE's inference as a subprocess inside its checkout
(config engines.song.yue.repo_dir), with lyrics + genre ("hip hop, trap,
street, young male voice") and a "dual" persona prompt describing the cast.
Output: full track with vocals; the pipeline aligns lip-sync to the lead
character via MuseTalk.
"""
from __future__ import annotations

import subprocess
from pathlib import Path


class YueEngine:
    name = "yue"
    full_mode = True

    def __init__(self, config):
        cfg = config.engines.get("song", {}).get("yue", {})
        self.repo = (config.external_dir / cfg.get("repo_dir", "external/YuE").split("external/")[-1]).resolve()
        self.stage1 = cfg.get("stage1", "m-a-p/YuE-s1-7B-anneal-en-cot")
        self.stage2 = cfg.get("stage2", "m-a-p/YuE-s2-1B-general")

    def available(self) -> bool:
        return (self.repo / "inference.py").exists()

    def generate(self, lyrics_path: Path, genre: str, persona: str, out_dir: Path,
                seed: int = 0, timeout_s: int = 3600) -> list[Path]:
        out_dir.mkdir(parents=True, exist_ok=True)
        cmd = [
            "python", "inference.py",
            "--model", self.stage1,
            "--stage2_model", self.stage2,
            "--task", "dual",  # song + vocals
            "--genre", genre,
            "--lyrics", str(lyrics_path),
            "--persona", persona,
            "--run_dir", str(out_dir),
            "--seed", str(seed),
        ]
        env_extra = {"CUDA_VISIBLE_DEVICES": "0"}
        import os

        env = {**os.environ, **env_extra}
        subprocess.run(cmd, cwd=self.repo, check=True, timeout=timeout_s, env=env)
        tracks = sorted(out_dir.rglob("*.mp3")) + sorted(out_dir.rglob("*.wav"))
        if not tracks:
            raise RuntimeError("YuE produced no audio")
        return tracks
