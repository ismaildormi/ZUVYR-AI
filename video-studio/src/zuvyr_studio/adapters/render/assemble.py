"""FFmpeg assembly: scene encode, concat, final mix, captions export, probing.

Mix order (spec): dialogue on top, SFX, music ducked under speech, ~-14 LUFS.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np

from ...lib import audio as A
from ...lib.ffmpeg import ffmpeg_path, normalize_lufs, probe, run as ff_run


def encode_scene_video(frames_dir: Path, out_mp4: Path, fps: int, crf: int = 27,
                       preset: str = "veryfast", duration_s: float | None = None) -> Path:
    """frames dir (f_*.png|jpg) -> h264 mp4 (no audio)."""
    first = sorted(frames_dir.glob("f_*.*"))
    if not first:
        raise RuntimeError(f"no frames in {frames_dir}")
    ext = first[0].suffix
    args = [
        "-framerate", str(fps), "-i", str(frames_dir / f"f_%05d{ext}"),
        "-c:v", "libx264", "-crf", str(crf), "-preset", preset,
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    ]
    if duration_s:
        args += ["-t", f"{duration_s:.3f}"]
    args.append(str(out_mp4))
    ff_run(args)
    return out_mp4


def concat_videos(videos: list[Path], out_mp4: Path, tmp_dir: Path) -> Path:
    """Concat same-codec scene mp4s losslessly."""
    tmp_dir.mkdir(parents=True, exist_ok=True)
    lst = tmp_dir / "concat.txt"
    lst.write_text("\n".join(f"file '{v.resolve().as_posix()}'" for v in videos), encoding="utf-8")
    ff_run(["-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(out_mp4)])
    return out_mp4


def mux(video: Path, audio: Path, out_mp4: Path) -> Path:
    """Mux video + already-normalized audio (audio is stream-copied, never
    re-encoded — re-encoding would break the loudness pass)."""
    ff_run(["-i", str(video), "-i", str(audio), "-c:v", "copy", "-c:a", "copy",
            "-shortest", "-movflags", "+faststart", str(out_mp4)])
    return out_mp4


def duck_music(music: np.ndarray, dialogue_bus: np.ndarray, sr: int = A.SR,
               duck_db: float = 10.0, release_ms: float = 350.0) -> np.ndarray:
    """Sidechain-style ducking: music gain follows inverted dialogue envelope."""
    n = max(len(music), len(dialogue_bus))
    if len(music) < n:
        music = np.concatenate([music, np.zeros(n - len(music), dtype=np.float32)])
    env = A.envelope(dialogue_bus[:n], sr, hop_ms=10.0)
    env = A.smooth(env, 8)
    mx = float(env.max()) if env.size else 0.0
    if mx > 1e-5:
        env = np.clip(env / mx, 0.0, 1.0)
    # gain: 1.0 (no speech) -> duck (speech present), with release smoothing
    duck_lin = A.db_to_lin(-duck_db)
    target = 1.0 - (1.0 - duck_lin) * env
    # upsample envelope to sample rate (linear interp)
    idx = np.arange(n, dtype=np.float32) * (len(env) / max(1, n))
    idx = np.clip(idx, 0, len(env) - 1).astype(np.int32)
    gain = target[idx].astype(np.float32)
    return music * gain


def finalize_mix(dialogue: np.ndarray, sfx: np.ndarray, music: np.ndarray,
                 sr: int = A.SR, duck_db: float = 10.0) -> np.ndarray:
    n = max(len(dialogue), len(sfx), len(music))

    def fit(x: np.ndarray) -> np.ndarray:
        if len(x) < n:
            return np.concatenate([x, np.zeros(n - len(x), dtype=np.float32)])
        return x[:n]

    d, s, m = fit(dialogue), fit(sfx), fit(music)
    m = duck_music(m, d, sr, duck_db)
    mix = d * 1.0 + s * 0.9 + m * 0.85
    # gentle master bus glue + density limiter (lets loudnorm reach -14 LUFS)
    mix = np.tanh(mix * 0.9).astype(np.float32)
    mix = A.limit(mix, sr, ceiling_db=-3.0)
    return mix


# ---------------------------------------------------------------- captions
def ts(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, rem = divmod(ms, 3600000)
    m, rem = divmod(rem, 60000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_srt(entries: list[dict], out_path: Path) -> Path:
    """entries: [{start_s, end_s, speaker, text}]"""
    lines = []
    for i, e in enumerate(entries, 1):
        lines.append(str(i))
        lines.append(f"{ts(e['start_s'])} --> {ts(e['end_s'])}")
        who = e.get("speaker")
        text = e["text"]
        if who and who != "narrator":
            text = f"{who.replace('_', ' ').upper()}: {text}"
        lines.append(text)
        lines.append("")
    out_path.write_text("\n".join(lines), encoding="utf-8")
    return out_path


def probe_or_raise(path: Path) -> dict:
    info = probe(path)
    if not info.get("duration_s"):
        raise RuntimeError(f"probe failed for {path}")
    return info
