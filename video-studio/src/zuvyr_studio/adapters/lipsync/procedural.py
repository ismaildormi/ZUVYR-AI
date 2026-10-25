"""Procedural lip-sync: mouth openness envelope from the exact line audio.

Drives the renderer's mouth overlay (and is also what MuseTalk receives in full
mode — same audio, generative mouth animation instead of an overlay).
"""
from __future__ import annotations

import numpy as np

from ...lib import audio as A


def mouth_envelope(wav_path, start_s: float, end_s: float, hop_ms: float = 20.0) -> np.ndarray:
    _, clip = A.read_wav(wav_path)
    env = A.envelope(clip, A.SR, hop_ms)
    # smooth + normalize so speech peaks ~1.0
    env = A.smooth(env, 3)
    mx = float(env.max()) if env.size else 0.0
    if mx > 1e-5:
        env = np.clip(env / mx, 0.0, 1.0)
    return env.astype(np.float32)
