"""Generative lip-sync adapters (full mode): MuseTalk (primary for singing),
LatentSync and Wav2Lip (fallbacks). All run as subprocesses inside their
checkouts under external/ and fail closed when absent.

In degraded mode the pipeline uses the procedural envelope lip-sync
(adapters/lipsync/procedural.py + renderer mouth overlay) with the exact same
line audio, so swapping engines changes only the mouth rendering.
"""
from __future__ import annotations

import subprocess
from pathlib import Path


class _Runner:
    full_mode = True

    def __init__(self, repo: Path):
        self.repo = repo

    def _run(self, cmd: list[str], timeout_s: int = 3600) -> subprocess.CompletedProcess:
        return subprocess.run(cmd, cwd=self.repo, capture_output=True, text=True, timeout=timeout_s)


class MuseTalkAdapter(_Runner):
    name = "musetalk"  # MIT

    def __init__(self, config):
        cfg = config.engines.get("lipsync", {}).get("musetalk", {})
        super().__init__((config.external_dir / cfg.get("repo_dir", "MuseTalk").split("external/")[-1]).resolve())

    def available(self) -> bool:
        return (self.repo / "scripts" / "inference.py").exists() or (self.repo / "musetalk" / "scripts").exists()

    def run(self, video_or_image: Path, audio: Path, out_dir: Path) -> Path:
        # MuseTalk official entrypoint: python -m scripts.inference with a YAML config
        cfg = out_dir / "mt_config.yaml"
        cfg.write_text(f"""
task_arnold:
  video_path: "{video_or_image}"
  audio_path: "{audio}"
  bbox_shift: 0
  output_path: "{out_dir}"
""", encoding="utf-8")
        self._run(["python", "-m", "scripts.inference", "--inference_config", str(cfg)])
        outs = sorted(out_dir.rglob("*.mp4"))
        if not outs:
            raise RuntimeError("MuseTalk produced no output")
        return outs[-1]


class LatentSyncAdapter(_Runner):
    name = "latentsync"  # Apache-2.0 (bytedance/LatentSync)

    def __init__(self, config):
        super().__init__(config.external_dir / "LatentSync")

    def available(self) -> bool:
        return (self.repo / "scripts" / "inference.py").exists()

    def run(self, video_or_image: Path, audio: Path, out_dir: Path) -> Path:
        self._run(["python", "scripts/inference.py", "--inference_ckpt_path", "checkpoints/latentsync_unet.pt",
                   "--video_path", str(video_or_image), "--audio_path", str(audio),
                   "--output_path", str(out_dir / "ls.mp4")])
        return out_dir / "ls.mp4"


class Wav2LipAdapter(_Runner):
    name = "wav2lip"

    def __init__(self, config):
        super().__init__(config.external_dir / "Wav2Lip")

    def available(self) -> bool:
        return (self.repo / "inference.py").exists()

    def run(self, video_or_image: Path, audio: Path, out_dir: Path) -> Path:
        out = out_dir / "w2l.mp4"
        self._run(["python", "inference.py", "--checkpoint_path", "checkpoints/wav2lip_gan.pth",
                   "--face", str(video_or_image), "--audio", str(audio),
                   "--outfile", str(out), "--fps", "25"])
        return out
