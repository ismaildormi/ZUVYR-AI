"""FFmpeg wrapper.

Locates a static ffmpeg binary:
  1. $ZUVYR_FFMPEG
  2. imageio-ffmpeg wheel (bundled binary, works with zero system deps)
  3. <project>/node_modules/ffmpeg-static (npm, used by the base app)
  4. system ffmpeg on PATH

ffprobe is not assumed (the imageio wheel has no probe binary); probe_* helpers
parse `ffmpeg -i` stderr instead.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

from .fs import ROOT

_ffmpeg: str | None = None


def ffmpeg_path() -> str:
    global _ffmpeg
    if _ffmpeg:
        return _ffmpeg
    candidates: list[str] = []
    if os.environ.get("ZUVYR_FFMPEG"):
        candidates.append(os.environ["ZUVYR_FFMPEG"])
    try:
        import imageio_ffmpeg  # type: ignore

        candidates.append(imageio_ffmpeg.get_ffmpeg_exe())
    except Exception:
        pass
    for c in (
        ROOT / "node_modules" / "ffmpeg-static" / "ffmpeg",
        ROOT / "vendor" / "ffmpeg",
    ):
        candidates.append(str(c))
    candidates.append(shutil.which("ffmpeg") or "")
    for c in candidates:
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            _ffmpeg = c
            return c
    raise RuntimeError(
        "No ffmpeg binary found. Install with `pip install imageio-ffmpeg` "
        "(bundled binary) or `npm install ffmpeg-static`, or set ZUVYR_FFMPEG."
    )


def run(args: list[str], timeout: int = 1800, check: bool = True) -> subprocess.CompletedProcess:
    cmd = [ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-y", *args]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if check and proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr[-2000:]}")
    return proc


_DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)")


def probe(path: str | Path) -> dict:
    """Minimal probe via `ffmpeg -i` stderr parsing."""
    proc = subprocess.run(
        [ffmpeg_path(), "-hide_banner", "-i", str(path), "-f", "null", "-"],
        capture_output=True,
        text=True,
        timeout=120,
    )
    err = proc.stderr
    out: dict = {"exists": Path(path).exists()}
    m = _DURATION_RE.search(err)
    if m:
        out["duration_s"] = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    vline = re.search(r"Video: ([^,]+), ([^,]+), (\d{2,5})x(\d{2,5})", err)
    if vline:
        out["codec"] = vline.group(1).split()[0]
        out["pix_fmt"] = vline.group(2).strip()
        out["width"], out["height"] = int(vline.group(3)), int(vline.group(4))
        out["aspect"] = round(out["width"] / out["height"], 4)
    am = re.search(r"Audio: (\w+)", err)
    if am:
        out["acodec"] = am.group(1)
    fm = re.search(r"(\d+(?:\.\d+)?) fps", err)
    if fm:
        out["fps"] = float(fm.group(1))
    return out


def measure_lufs(path: str | Path) -> dict:
    """Measure integrated loudness (EBU R128) with loudnorm analysis."""
    proc = subprocess.run(
        [
            ffmpeg_path(), "-hide_banner", "-nostats", "-i", str(path),
            "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-",
        ],
        capture_output=True, text=True, timeout=600,
    )
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", proc.stderr, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {}


def normalize_lufs(src: str | Path, dst: str | Path, target_i: float = -14.0, tp: float = -1.5) -> Path:
    """Normalize to ~target LUFS with true-peak control.

    Chain: dynamic loudnorm (raises the sparse mix) -> true-peak look-ahead
    limiter (4x oversampled: the ceiling holds for inter-sample peak, which
    sample-peak limiting misses by ~1 dB on speech) -> gain-ride iterations
    (measured gain into the limiter, raising density until the integrated
    loudness converges) -> AAC -> measured verify/attenuate guard.
    """
    src, dst = Path(src), Path(dst)
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        ln = Path(td) / "ln.wav"
        run(["-i", str(src), "-af", f"loudnorm=I={target_i}:TP=-0.5:LRA=11",
             "-ar", "48000", "-c:a", "pcm_s16le", str(ln)])
        from . import audio as A

        _, x = A.read_wav(ln)
        # true-peak ceiling with margins: +~0.7 dB resample/meter filter-shape
        # offset (measured) + ~0.2 dB AAC overshoot (measured)
        ceiling = tp - 1.2
        x = A.limit_true_peak(x, 48000, ceiling_db=ceiling, release_ms=200.0)
        pcm = Path(td) / "lim.wav"
        A.write_wav(pcm, x, 48000)
        # gain-ride: push level into the limiter until loudness converges
        for _ in range(3):
            m = measure_lufs(pcm)
            try:
                i_now = float(m.get("input_i", "-inf"))
            except Exception:
                break
            if not (i_now == i_now and i_now > -70):
                break
            if abs(i_now - target_i) <= 0.5:
                break
            gain_db = min(4.0, (target_i - 0.2) - i_now)
            if gain_db <= 0.05:
                break
            _, x = A.read_wav(pcm)
            x = A.limit_true_peak(x * (10 ** (gain_db / 20.0)), 48000,
                                  ceiling_db=ceiling, release_ms=200.0)
            A.write_wav(pcm, x, 48000)
        cur = pcm
        for attempt in range(3):
            run(["-i", str(cur), "-c:a", "aac", "-b:a", "192k", str(dst)])
            r = measure_lufs(dst)
            try:
                excess = float(r.get("input_tp", "-99")) - tp
            except Exception:
                break
            if excess <= 0:
                break
            fixed = Path(td) / f"fix{attempt}.wav"
            run(["-i", str(cur), "-af", f"volume=-{excess + 0.2:.2f}dB", "-c:a", "pcm_s16le", str(fixed)])
            cur = fixed
    return dst


def tp_to_lin(tp_db: float) -> float:
    import math

    return min(1.0, math.pow(10, tp_db / 20))


def wav_from_any(src: str | Path, dst: str | Path, rate: int = 44100) -> Path:
    run(["-i", str(src), "-vn", "-ac", "1", "-ar", str(rate), "-c:a", "pcm_s16le", str(dst)])
    return Path(dst)
