"""Procedural music composer + SFX synthesizer (numpy/scipy).

100% original, license-clean audio generated from code — the offline stand-in
for MusicGen/AudioGen (full mode uses ComfyUI-audio; see adapters/music/comfy_audio.py).

Music: mood-driven cinematic scores + trap/hip-hop instrumentals.
SFX: rain, thunder, door slam, footsteps, heartbeat, whoosh, gasp, sob, laugh, ...
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np

from ...lib import audio as A

SR = A.SR
NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6,
        "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def freq(note: str, octave: int) -> float:
    semis = NOTE[note] + 12 * (octave - 4)
    return 440.0 * 2 ** ((semis - 9) / 12.0)


# ================================================================ instruments
def _exp_env(n: int, attack: float, decay: float, sr: int = SR) -> np.ndarray:
    t = np.arange(n, dtype=np.float32) / sr
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = np.exp(-t / max(decay, 1e-4))
    return (a * d).astype(np.float32)


def pluck(f: float, dur: float, amp: float = 0.5, partials=(1.0, 0.55, 0.30, 0.14, 0.07),
          decay: float = 0.5, sr: int = SR) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n, dtype=np.float32) / sr
    out = np.zeros(n, dtype=np.float32)
    for i, p in enumerate(partials):
        out += p * np.sin(2 * np.pi * f * (i + 1) * t).astype(np.float32)
    env = _exp_env(n, 0.004, decay, sr)
    return amp * out * env


def bell(f: float, dur: float, amp: float = 0.4, sr: int = SR) -> np.ndarray:
    return pluck(f, dur, amp=amp, partials=(1.0, 0.4, 0.9, 0.25, 0.5), decay=dur / 3.2, sr=sr)


def pad_chord(freqs: list[float], dur: float, amp: float = 0.22, sr: int = SR) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n, dtype=np.float32) / sr
    out = np.zeros(n, dtype=np.float32)
    rng = np.random.default_rng(int(sum(freqs) * 100) & 0xFFFF)
    for f in freqs:
        for det in (-0.4, 0.0, 0.4):
            ff = f * 2 ** (det / 100.0)
            vib = 1.0 + 0.0015 * np.sin(2 * np.pi * 0.7 * t + rng.uniform(0, 6))
            # soft saw approx: few harmonics with 1/k^2 rolloff
            for k in (1, 2, 3, 4, 5):
                out += (1.0 / k ** 2) * np.sin(2 * np.pi * ff * k * t * vib).astype(np.float32)
    out /= max(1.0, 3.0 * len(freqs))
    env = np.minimum(1.0, t / 0.5) * np.minimum(1.0, (dur - t) / 0.8).clip(0, 1)
    return (amp * out * env).astype(np.float32)


def sub808(f: float, dur: float, amp: float = 0.7, glide_from: float | None = None, sr: int = SR) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n, dtype=np.float32) / sr
    if glide_from and glide_from != f:
        f_t = glide_from + (f - glide_from) * np.minimum(1.0, t / 0.09)
    else:
        f_t = np.full(n, f, dtype=np.float32)
    phase = 2 * np.pi * np.cumsum(f_t) / sr
    x = np.sin(phase).astype(np.float32)
    x = np.tanh(1.6 * x)  # saturate
    env = _exp_env(n, 0.003, dur * 0.75, sr)
    return (amp * x * env).astype(np.float32)


def kick(amp: float = 0.9, sr: int = SR) -> np.ndarray:
    n = int(0.28 * sr)
    t = np.arange(n, dtype=np.float32) / sr
    f = 120 * np.exp(-t / 0.028) + 44
    phase = 2 * np.pi * np.cumsum(f) / sr
    x = np.sin(phase).astype(np.float32)
    click = A.bandpass_noise(0.012, 800, 4000, sr, seed=7)[:n]
    env = _exp_env(n, 0.001, 0.09, sr)
    out = amp * (x * env + 0.12 * click * env[: len(click)] if len(click) == n else x * env)
    return out.astype(np.float32)


def snare(amp: float = 0.6, sr: int = SR) -> np.ndarray:
    n = int(0.22 * sr)
    t = np.arange(n, dtype=np.float32) / sr
    tone = 0.4 * np.sin(2 * np.pi * 190 * t).astype(np.float32)
    noise = A.bandpass_noise(0.22, 1500, 6500, sr, seed=11)
    env = _exp_env(n, 0.001, 0.055, sr)
    return (amp * (tone + 0.8 * noise[:n]) * env).astype(np.float32)


def clap(amp: float = 0.55, sr: int = SR) -> np.ndarray:
    total = np.zeros(int(0.3 * sr), dtype=np.float32)
    for i, off in enumerate((0.0, 0.012, 0.026)):
        n = A.silence(off, sr).size
        burst = A.bandpass_noise(0.09, 1200, 5500, sr, seed=30 + i)
        burst *= _exp_env(len(burst), 0.001, 0.028, sr)
        total = A.mix_at(total, burst, off, gain=1.0 - 0.18 * i)
    return (amp * total).astype(np.float32)


def hat(open_: bool = False, amp: float = 0.25, sr: int = SR) -> np.ndarray:
    dur = 0.24 if open_ else 0.055
    x = A.bandpass_noise(dur, 7000, 15000, sr, seed=99)
    x *= _exp_env(len(x), 0.001, 0.03 if open_ else 0.018, sr)
    return (amp * x).astype(np.float32)


def shaker(amp: float = 0.16, sr: int = SR) -> np.ndarray:
    x = A.bandpass_noise(0.09, 4500, 9000, sr, seed=55)
    x *= _exp_env(len(x), 0.004, 0.045, sr)
    return (amp * x).astype(np.float32)


def crash(amp: float = 0.5, sr: int = SR) -> np.ndarray:
    x = A.bandpass_noise(1.4, 5000, 16000, sr, seed=77)
    x *= _exp_env(len(x), 0.002, 0.55, sr)
    return (amp * x).astype(np.float32)


# ================================================================ scores
MOODS = {
    # mood: (root, scale intervals, progression (degrees), bpm, instruments)
    "hopeful":    ("C", [0, 2, 4, 5, 7, 9, 11], [1, 5, 6, 4], 92, "pop"),
    "melancholic": ("A", [0, 2, 3, 5, 7, 8, 10], [1, 6, 3, 7], 76, "piano"),
    "tense":      ("E", [0, 1, 3, 5, 7, 8, 10], [1, 2, 6, 5], 100, "dark"),
    "triumphant": ("F", [0, 2, 4, 5, 7, 9, 11], [1, 4, 5, 4], 104, "pop"),
    "playful":    ("G", [0, 2, 4, 7, 9], [1, 5, 4, 5], 116, "pluck"),
    "menacing":   ("D", [0, 1, 3, 5, 6, 8, 10], [1, 1, 6, 7], 84, "dark"),
    "tender":     ("C", [0, 2, 4, 5, 7, 9, 11], [6, 4, 1, 5], 72, "piano"),
    "hype":       ("F", [0, 2, 3, 5, 7, 8, 10], [1, 4, 6, 5], 128, "trap"),
}


def _scale_note(root: str, scale: list[int], degree: int, octave: int) -> float:
    idx = (degree - 1) % len(scale)
    oct_shift = (degree - 1) // len(scale)
    semis = NOTE[root] + scale[idx] + 12 * oct_shift
    return 440.0 * 2 ** ((semis - 9 + 12 * (octave - 4)) / 12.0)


def compose_score(mood: str = "hopeful", duration_s: float = 30.0, seed: int = 0,
                  intensity: float = 0.5) -> np.ndarray:
    """Cinematic background score for a scene."""
    root, scale, prog, bpm, style = MOODS.get(mood, MOODS["hopeful"])
    rng = np.random.default_rng(seed)
    beat = 60.0 / bpm
    bar = 4 * beat
    total = np.zeros(int(duration_s * SR) + SR, dtype=np.float32)
    t = 0.0
    bar_i = 0
    while t < duration_s:
        deg = prog[bar_i % len(prog)]
        # chord: triad on degree
        fs = [_scale_note(root, scale, deg, 3), _scale_note(root, scale, deg + 2, 3), _scale_note(root, scale, deg + 4, 3)]
        bass_f = _scale_note(root, scale, deg, 2)
        dur = min(bar, duration_s - t)
        # pad
        total = A.mix_at(total, pad_chord(fs, dur, amp=0.16 + 0.10 * intensity), t, gain=1.0)
        # bass
        total = A.mix_at(total, pluck(bass_f, min(dur, beat * 2), amp=0.30, decay=0.8), t)
        # melody / arp
        if style in ("piano", "pluck", "pop"):
            notes_in_bar = 4 if intensity > 0.55 else 2
            for k in range(notes_in_bar):
                if rng.random() < 0.72:
                    nd = deg + int(rng.choice([0, 2, 4, 2 + 3, 7 - 1]))
                    f = _scale_note(root, scale, nd + 1, 4)
                    nt = t + k * (dur / notes_in_bar)
                    amp = 0.16 + 0.14 * intensity
                    if style == "piano":
                        total = A.mix_at(total, pluck(f, 0.9, amp=amp, decay=0.7), nt)
                    else:
                        total = A.mix_at(total, bell(f, 0.6, amp=amp * 0.9), nt)
        elif style == "dark":
            # pulsing low semitone stabs
            for k in range(4):
                if (k % 2) == 0 or rng.random() < intensity:
                    total = A.mix_at(total, pluck(bass_f / 2, 0.3, amp=0.22, decay=0.25), t + k * beat)
        # light percussion for energy
        if intensity > 0.5 and mood not in ("tender", "melancholic"):
            for k in range(4):
                total = A.mix_at(total, shaker(amp=0.05 + 0.05 * intensity), t + k * beat + beat / 2)
            total = A.mix_at(total, kick(amp=0.25), t)
            total = A.mix_at(total, snare(amp=0.18), t + 2 * beat)
        t += bar
        bar_i += 1
    total = total[: int(duration_s * SR)]
    total = A.fade(total, fin_s=1.2, fout_s=1.6)
    return A.normalize_peak(total, -11.0)


def compose_trap(duration_s: float = 30.0, bpm: int = 140, seed: int = 0,
                 dark: bool = True, intensity: float = 0.8) -> np.ndarray:
    """Original trap instrumental (808 glide bass, hats, claps, dark bells)."""
    rng = np.random.default_rng(seed)
    root = "F" if not dark else "D"
    scale = [0, 2, 3, 5, 7, 8, 10]  # natural minor
    beat = 60.0 / bpm
    step = beat / 4  # 16th
    bar = 4 * beat
    total = np.zeros(int(duration_s * SR) + SR, dtype=np.float32)
    t = 0.0
    bar_i = 0
    prog = [1, 6, 4, 5] if not dark else [1, 1, 6, 7]
    while t < duration_s:
        deg = prog[bar_i % len(prog)]
        root_f = _scale_note(root, scale, deg, 1)  # deep
        # 808 pattern
        pattern = [(0.0, root_f, 0.75), (1.5, root_f, 0.4), (2.5, _scale_note(root, scale, deg + 4, 1), 0.6), (3.0, root_f, 0.5)]
        if bar_i % 4 == 3:
            pattern.append((3.5, _scale_note(root, scale, deg + 2, 1), 0.5))
        for pos, f, len_beats in pattern:
            glide = None
            if rng.random() < 0.35:
                glide = f * 2 ** (rng.choice([-2, 3, 5]) / 12.0)
            total = A.mix_at(total, sub808(f, len_beats * beat, amp=0.62, glide_from=glide), t + pos * beat)
        # drums
        total = A.mix_at(total, kick(amp=0.85), t)
        total = A.mix_at(total, kick(amp=0.7), t + 2.5 * beat)
        total = A.mix_at(total, clap(amp=0.5), t + 2 * beat)
        if bar_i % 4 == 0:
            total = A.mix_at(total, crash(amp=0.35), t)
        # hats: 8ths + triplet rolls
        h = 0
        while h < 16:
            tt = t + h * step
            total = A.mix_at(total, hat(amp=0.22), tt)
            if rng.random() < 0.22 * intensity:
                for j in range(3):
                    total = A.mix_at(total, hat(amp=0.16), tt + (j + 1) * step / 3.0)
                h += 1
            h += 2
        # dark bell melody every other bar
        if bar_i % 2 == 1:
            for k in range(4):
                if rng.random() < 0.6:
                    nd = deg + int(rng.choice([0, 2, 4, 7]))
                    f = _scale_note(root, scale, nd + 1, 4)
                    total = A.mix_at(total, bell(f, 0.5, amp=0.18), t + k * beat + step * int(rng.choice([0, 1, 2])))
        t += bar
        bar_i += 1
    total = total[: int(duration_s * SR)]
    total = A.fade(total, fin_s=0.8, fout_s=1.2)
    return A.normalize_peak(total, -9.0)


# ================================================================ SFX
def _pulse(f: float, dur: float, amp: float, decay: float, sr: int = SR, f_end: float | None = None) -> np.ndarray:
    n = int(dur * sr)
    t = np.arange(n, dtype=np.float32) / sr
    ff = f if f_end is None else f + (f_end - f) * (t / dur)
    phase = 2 * np.pi * np.cumsum(ff) / sr
    x = np.sin(phase).astype(np.float32)
    return (amp * x * _exp_env(n, 0.005, decay, sr)).astype(np.float32)


def synth_sfx(name: str, duration_s: float | None = None, seed: int = 0) -> np.ndarray:
    """Synthesize an SFX by name. Unknown names fall back to a soft whoosh."""
    name = name.lower().strip()
    rng = np.random.default_rng(seed)
    sr = SR

    def dur_or(default: float) -> float:
        return duration_s if duration_s else default

    if "rain" in name:
        d = dur_or(6.0)
        x = A.bandpass_noise(d, 400, 6500, sr, seed)
        x *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.3 * np.arange(len(x)) / sr).astype(np.float32)
        for _ in range(int(d * 6)):
            at = rng.uniform(0, d - 0.1)
            plip = _pulse(rng.uniform(700, 1800), 0.05, 0.10, 0.012, sr, f_end=rng.uniform(300, 600))
            x = A.mix_at(x, plip, at)
        return A.normalize_peak(x, -16.0)
    if "thunder" in name:
        d = dur_or(2.8)
        x = A.bandpass_noise(d, 40, 300, sr, seed)
        env = _exp_env(len(x), 0.05, d / 3.5, sr)
        crack = A.bandpass_noise(0.18, 900, 3500, sr, seed + 1) * _exp_env(int(0.18 * sr), 0.002, 0.05, sr)
        x = x * env
        x = A.mix_at(x, crack * 0.7, 0.02)
        return A.normalize_peak(x, -10.0)
    if "door" in name and "slam" in name or name == "door_slam":
        thump = _pulse(70, 0.4, 0.9, 0.09, sr, f_end=42)
        knock = A.bandpass_noise(0.09, 500, 2000, sr, seed) * _exp_env(int(0.09 * sr), 0.001, 0.02, sr)
        x = thump
        x = A.mix_at(x, knock * 0.8, 0.0)
        x = A.mix_at(x, knock * 0.4, 0.05)
        return A.normalize_peak(x, -8.0)
    if "footstep" in name or "footsteps" in name:
        steps = int(dur_or(3.0) / 0.42)
        x = A.silence(steps * 0.42 + 0.2, sr)
        for i in range(steps):
            f = 150 + 60 * rng.random()
            st = _pulse(f, 0.09, 0.55, 0.03, sr, f_end=f * 0.5)
            nz = A.bandpass_noise(0.05, 900, 3200, sr, seed + i) * _exp_env(int(0.05 * sr), 0.001, 0.014, sr)
            if len(nz) < len(st):
                nz = np.concatenate([nz, np.zeros(len(st) - len(nz), dtype=np.float32)])
            else:
                nz = nz[: len(st)]
            x = A.mix_at(x, st + 0.3 * nz, i * 0.42 + rng.uniform(-0.02, 0.02))
        return A.normalize_peak(x, -15.0)
    if "heartbeat" in name:
        d = dur_or(4.0)
        x = A.silence(d, sr)
        period = 0.95
        tt = 0.0
        while tt < d - 0.4:
            lub = _pulse(52, 0.16, 0.9, 0.05, sr, f_end=38)
            dub = _pulse(48, 0.14, 0.7, 0.045, sr, f_end=36)
            x = A.mix_at(x, lub, tt)
            x = A.mix_at(x, dub, tt + 0.22)
            tt += period
        return A.normalize_peak(x, -13.0)
    if "whoosh" in name:
        d = dur_or(0.8)
        n = int(d * sr)
        t = np.arange(n, dtype=np.float32) / sr
        x = rng.standard_normal(n).astype(np.float32)
        from scipy.signal import butter, sosfilt

        f_center = 300 + 2700 * np.sin(np.pi * t / d).astype(np.float32) ** 2
        # time-varying bandpass approximation: 3 bands crossfaded
        lo = butter(2, [200, 900], btype="band", fs=sr, output="sos")
        mid = butter(2, [900, 2800], btype="band", fs=sr, output="sos")
        hi = butter(2, [2800, 8000], btype="band", fs=sr, output="sos")
        a = sosfilt(lo, x).astype(np.float32)
        b = sosfilt(mid, x).astype(np.float32)
        c = sosfilt(hi, x).astype(np.float32)
        w = t / d
        x = a * (1 - w) + b * 2 * w * (1 - w) + c * w
        x *= np.sin(np.pi * t / d).astype(np.float32)
        return A.normalize_peak(x, -14.0)
    if name in ("gasp", "voice_gasp", "gasps"):
        d = 0.45
        x = A.bandpass_noise(d, 700, 1900, sr, seed) * _exp_env(int(d * sr), 0.02, 0.12, sr)
        tone = _pulse(520, d, 0.25, 0.1, sr, f_end=300)
        return A.normalize_peak(x + tone, -14.0)
    if name in ("sigh", "voice_sigh"):
        d = 0.9
        n = int(d * sr)
        x = A.bandpass_noise(d, 500, 1400, sr, seed)
        env = np.sin(np.pi * np.arange(n) / n).astype(np.float32) * 0.8
        return A.normalize_peak(x * env, -18.0)
    if name in ("sob", "voice_sob"):
        d = 1.6
        x = A.silence(d, sr)
        tt = 0.0
        k = 0
        while tt < d - 0.4:
            f0 = 340 - 40 * k
            wail = _pulse(f0, 0.35, 0.8, 0.16, sr, f_end=f0 * 0.62)
            t2 = np.arange(len(wail), dtype=np.float32) / sr
            wail = wail * (1 + 0.12 * np.sin(2 * np.pi * 7 * t2)).astype(np.float32)
            breath = A.bandpass_noise(0.12, 600, 1600, sr, seed + k) * 0.25
            x = A.mix_at(x, wail, tt)
            x = A.mix_at(x, breath, tt + 0.33)  # mix_at handles any lengths
            tt += 0.55
            k += 1
        return A.normalize_peak(x, -13.0)
    if name in ("laugh", "voice_laugh"):
        d = 1.5
        x = A.silence(d, sr)
        tt = 0.05
        k = 0
        while tt < d - 0.2:
            f = 300 * (0.97 ** k)
            ha = _pulse(f, 0.12, 0.8, 0.05, sr, f_end=f * 0.8)
            nz = A.bandpass_noise(0.1, 500, 2200, sr, seed + k)
            n = max(len(ha), len(nz))
            ha = np.pad(ha, (0, n - len(ha))).astype(np.float32)
            nz = np.pad(nz, (0, n - len(nz))).astype(np.float32)
            x = A.mix_at(x, ha + 0.3 * nz, tt)
            tt += 0.16 if k < 5 else 0.24
            k += 1
        return A.normalize_peak(x, -13.0)
    if name in ("gulp", "voice_gulp"):
        x = _pulse(380, 0.25, 0.8, 0.09, sr, f_end=140)
        click = A.bandpass_noise(0.03, 1200, 4000, sr, seed) * 0.4
        n = max(len(x), len(click))
        x = np.pad(x, (0, n - len(x))).astype(np.float32)
        click = np.pad(click, (0, n - len(click))).astype(np.float32)
        return A.normalize_peak(x + click, -16.0)
    if name in ("breath", "voice_breath"):
        d = 0.8
        n = int(d * sr)
        x = A.bandpass_noise(d, 400, 1800, sr, seed)
        env = np.sin(np.pi * np.arange(n) / n).astype(np.float32)
        return A.normalize_peak(x * env, -20.0)
    if "cheer" in name or "crowd" in name:
        d = dur_or(4.0)
        n = int(d * sr)
        x = A.bandpass_noise(d, 300, 3200, sr, seed) * 0.5
        t = np.arange(n, dtype=np.float32) / sr
        x *= (0.7 + 0.3 * np.sin(2 * np.pi * 1.7 * t).astype(np.float32)) * np.minimum(1.0, t / 0.4)
        for _ in range(int(d * 3)):
            at = rng.uniform(0, d - 0.3)
            shout = A.bandpass_noise(0.25, 500, 2400, sr, seed + int(at * 100)) * 0.5
            x = A.mix_at(x, shout, at)
        return A.normalize_peak(x, -14.0)
    if "sparkle" in name or "confetti" in name or "magic" in name:
        d = dur_or(2.0)
        x = A.silence(d, sr)
        for _ in range(int(d * 8)):
            at = rng.uniform(0, d - 0.3)
            f = rng.uniform(1500, 4200)
            x = A.mix_at(x, _pulse(f, 0.3, 0.5, 0.1, sr), at)
        return A.normalize_peak(x, -18.0)
    if "riser" in name:
        d = dur_or(2.0)
        n = int(d * sr)
        t = np.arange(n, dtype=np.float32) / sr
        f = 200 * 2 ** (t / d * 3)
        phase = 2 * np.pi * np.cumsum(f) / sr
        x = 0.5 * np.sin(phase).astype(np.float32) + 0.5 * A.bandpass_noise(d, 500, 6000, sr, seed)
        x *= (t / d) ** 2
        return A.normalize_peak(x, -12.0)
    if "flash" in name or "camera" in name:
        x = A.bandpass_noise(0.1, 2500, 9000, sr, seed) * _exp_env(int(0.1 * sr), 0.001, 0.02, sr)
        return A.normalize_peak(x, -12.0)
    if "vinyl" in name or "crackle" in name:
        d = dur_or(4.0)
        n = int(d * sr)
        x = rng.standard_normal(n).astype(np.float32) * 0.05
        spikes = rng.random(n) > 0.9992
        x[spikes] = rng.uniform(0.2, 0.7, size=int(spikes.sum())).astype(np.float32) * np.sign(x[spikes] + 1e-9)
        return A.normalize_peak(x, -24.0)
    # fallback: soft whoosh
    return synth_sfx("whoosh", duration_s=duration_s, seed=seed)


SFX_KEYWORD_MAP = {
    "rain": "rain", "storm": "rain", "thunder": "thunder", "door": "door_slam", "slam": "door_slam",
    "footstep": "footsteps", "run": "footsteps", "running": "footsteps", "heart": "heartbeat",
    "whoosh": "whoosh", "swish": "whoosh", "gasp": "gasp", "sigh": "sigh", "sob": "sob",
    "laugh": "laugh", "crowd": "crowd", "cheer": "crowd", "sparkle": "sparkle", "confetti": "sparkle",
    "riser": "riser", "flash": "camera_flash", "vinyl": "vinyl",
}


def sfx_from_prompt(prompt: str, seed: int = 0) -> list[tuple[str, np.ndarray]]:
    """Map an sfx_prompt (e.g. 'rain, distant thunder') to synthesized sounds."""
    out = []
    for tok in prompt.replace(";", ",").split(","):
        tok = tok.strip().lower()
        if not tok:
            continue
        matched = None
        for key, sfx in SFX_KEYWORD_MAP.items():
            if key in tok:
                matched = sfx
                break
        if matched:
            out.append((matched, synth_sfx(matched, seed=seed + len(out))))
    return out
