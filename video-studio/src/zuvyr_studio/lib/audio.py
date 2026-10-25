"""Audio (WAV) IO + numpy DSP used across the pipeline."""
from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np

SR = 44100


# ---------------------------------------------------------------- IO
def read_wav(path: str | Path) -> tuple[int, np.ndarray]:
    with wave.open(str(path), "rb") as w:
        sr = w.getframerate()
        n = w.getnframes()
        ch = w.getnchannels()
        sw = w.getsampwidth()
        raw = w.readframes(n)
    if sw == 2:
        arr = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    elif sw == 1:
        arr = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    else:
        raise ValueError(f"unsupported sample width {sw}")
    if ch > 1:
        arr = arr.reshape(-1, ch).mean(axis=1)
    return sr, arr


def write_wav(path: str | Path, arr: np.ndarray, sr: int = SR) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    x = np.clip(arr, -1.0, 1.0)
    pcm = (x * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    return path


def resample(arr: np.ndarray, sr_from: int, sr_to: int = SR) -> np.ndarray:
    if sr_from == sr_to:
        return arr.astype(np.float32)
    from scipy.signal import resample_poly

    g = math.gcd(sr_from, sr_to)
    return resample_poly(arr, sr_to // g, sr_from // g).astype(np.float32)


# ---------------------------------------------------------------- basics
def silence(dur_s: float, sr: int = SR) -> np.ndarray:
    return np.zeros(int(dur_s * sr), dtype=np.float32)


def db_to_lin(db: float) -> float:
    return math.pow(10.0, db / 20.0)


def peak(arr: np.ndarray) -> float:
    return float(np.max(np.abs(arr))) if arr.size else 0.0


def rms(arr: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(arr)))) if arr.size else 0.0


def normalize_peak(arr: np.ndarray, target_db: float = -3.0) -> np.ndarray:
    pk = peak(arr)
    if pk < 1e-9:
        return arr
    return arr * (db_to_lin(target_db) / pk)


def fade(arr: np.ndarray, sr: int = SR, fin_s: float = 0.0, fout_s: float = 0.0) -> np.ndarray:
    out = arr.copy()
    n_in, n_out = int(fin_s * sr), int(fout_s * sr)
    if n_in > 0 and len(out) > n_in:
        out[:n_in] *= np.linspace(0, 1, n_in, dtype=np.float32)
    if n_out > 0 and len(out) > n_out:
        out[-n_out:] *= np.linspace(1, 0, n_out, dtype=np.float32)
    return out


def mix_at(bus: np.ndarray, clip: np.ndarray, at_s: float, sr: int = SR, gain: float = 1.0) -> np.ndarray:
    """Mix clip into bus starting at at_s (extends bus as needed). at_s is clamped >= 0."""
    if at_s < 0:
        at_s = 0.0
    start = int(round(at_s * sr))
    end = start + len(clip)
    if end > len(bus):
        bus = np.concatenate([bus, np.zeros(end - len(bus), dtype=np.float32)])
    bus[start:end] += clip * gain
    return bus


def concat(*clips: np.ndarray, gap_s: float = 0.0, sr: int = SR) -> np.ndarray:
    if not clips:
        return silence(0.1, sr)
    if gap_s <= 0:
        return np.concatenate(clips)
    g = silence(gap_s, sr)
    parts = []
    for i, c in enumerate(clips):
        parts.append(c)
        if i < len(clips) - 1:
            parts.append(g)
    return np.concatenate(parts)


def limit(arr: np.ndarray, sr: int = SR, ceiling_db: float = -3.0,
          release_ms: float = 140.0, lookahead_ms: float = 8.0) -> np.ndarray:
    """Look-ahead brickwall-ish limiter (vectorized). Raises density so the
    loudnorm stage can reach -14 LUFS without true-peak violations."""
    from scipy.ndimage import maximum_filter1d
    from scipy.signal import lfilter

    ceiling = db_to_lin(ceiling_db)
    x = arr.astype(np.float32)
    win = max(1, int(sr * lookahead_ms / 1000))
    peak = np.abs(x)
    env = maximum_filter1d(peak, size=2 * win + 1)
    gain = np.minimum(1.0, ceiling / np.maximum(env, 1e-9)).astype(np.float32)
    a = float(np.exp(-1.0 / (sr * release_ms / 1000.0)))
    gain = lfilter([1 - a], [1, -a], gain).astype(np.float32)  # release smoothing
    gain = np.minimum(gain, 1.0)
    out = x * gain
    return np.clip(out, -ceiling, ceiling).astype(np.float32)


def limit_true_peak(arr: np.ndarray, sr: int = SR, ceiling_db: float = -1.5,
                    release_ms: float = 200.0) -> np.ndarray:
    """Look-ahead limiter enforced on the 4x-oversampled signal so the ceiling
    holds for inter-sample (true) peak, not just sample peak. AAC encoders and
    the EBU R128 true-peak meter both see the oversampled waveform; limiting
    only the baseband samples leaves ~1 dB of uncontrolled overshoot on speech.
    """
    from scipy.signal import resample_poly

    arr = np.asarray(arr, dtype=np.float32)
    if arr.size == 0:
        return arr
    up = resample_poly(arr, 4, 1).astype(np.float32)
    lim = limit(up, sr * 4, ceiling_db=ceiling_db, release_ms=release_ms)
    out = resample_poly(lim, 1, 4).astype(np.float32)
    return out[: arr.shape[0]]


# ---------------------------------------------------------------- analysis
def envelope(arr: np.ndarray, sr: int = SR, hop_ms: float = 20.0) -> np.ndarray:
    """RMS envelope, one value per hop. Used for lip-sync mouth openness."""
    hop = max(1, int(sr * hop_ms / 1000))
    n = len(arr)
    frames = n // hop + 1
    env = np.zeros(frames, dtype=np.float32)
    for i in range(frames):
        seg = arr[i * hop : (i + 1) * hop]
        env[i] = rms(seg) if seg.size else 0.0
    return env


def trim_silence(arr: np.ndarray, sr: int = SR, thresh: float = 0.004, pad_ms: float = 60.0) -> np.ndarray:
    if arr.size == 0:
        return arr
    idx = np.where(np.abs(arr) > thresh)[0]
    if idx.size == 0:
        return arr
    pad = int(sr * pad_ms / 1000)
    a, b = max(0, idx[0] - pad), min(len(arr), idx[-1] + pad)
    return arr[a:b]


def speech_activity(arr: np.ndarray, sr: int = SR, hop_ms: float = 20.0, thresh: float = 0.02) -> np.ndarray:
    """Boolean voice-activity per envelope hop."""
    env = envelope(arr, sr, hop_ms)
    return env > thresh


def bandpass_noise(dur: float, lo: float, hi: float, sr: int = SR, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    x = rng.standard_normal(int(dur * sr)).astype(np.float32)
    from scipy.signal import butter, sosfilt

    sos = butter(2, [lo, hi], btype="band", fs=sr, output="sos")
    y = sosfilt(sos, x).astype(np.float32)
    return y


def smooth(x: np.ndarray, k: int = 5) -> np.ndarray:
    if k <= 1 or x.size == 0:
        return x
    kernel = np.ones(k, dtype=np.float32) / k
    return np.convolve(x, kernel, mode="same").astype(np.float32)


# ------------------------------------------------------------- room reverb
# per-location reverb (audio-post spec): room -> [(delay_ms, gain), ...]
REVERB_ROOMS: dict[str, list[tuple[float, float]]] = {
    "none": [],
    "small": [(11, 0.22), (19, 0.12)],
    "hallway": [(28, 0.28), (47, 0.17), (71, 0.09)],
    "street": [(60, 0.11)],
    "hall": [(40, 0.32), (68, 0.22), (105, 0.13), (150, 0.08)],
}


def room_reverb(x: np.ndarray, sr: int = SR, room: str = "small") -> np.ndarray:
    """Deterministic multi-tap room reverb (per-location, mix-time).

    Applied to character dialogue clips before they land on the dialogue bus;
    narration VO stays dry. Same room -> same result (pure function).
    """
    taps = REVERB_ROOMS.get(room, REVERB_ROOMS["small"])
    x = np.asarray(x, dtype=np.float32)
    if not taps or x.size == 0:
        return x
    n = x.shape[0]
    last = max(int(sr * d / 1000.0) for d, _ in taps)
    out = np.zeros(n + last, dtype=np.float32)
    out[:n] += x
    for delay_ms, g in taps:
        d = int(sr * delay_ms / 1000.0)
        out[d:d + n] += x * g
        d2 = 2 * d  # soft second-order tap (clipped to buffer)
        m = min(n, out.shape[0] - d2)
        if m > 0:
            out[d2:d2 + m] += x[:m] * (g * g * 0.5)
    return out
