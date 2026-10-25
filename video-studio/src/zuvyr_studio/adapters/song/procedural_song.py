"""Procedural song engine (offline degraded mode).

Renders a rap performance: original trap instrumental (procedural.py) +
lyric lines time-quantized to the beat grid, delivered by the cast voices with
rap delivery. Full mode swaps in YuE (adapters/song/yue.py) for a sung track
with vocals; the pipeline treats both identically downstream.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from ...lib import audio as A
from ...lib.rng import stable_seed
from ...schema import Scene, VoiceSpec
from ..music.procedural import compose_trap


def beat_plan(scene: Scene) -> list[dict]:
    """Lay lyric lines onto the bar/beat grid. Returns line placements."""
    song = scene.song_segment
    bpm = song.bpm if song else 140
    beat = 60.0 / bpm
    lines = [ln for ln in scene.dialogue if ln.speaker != "narrator"]
    placements = []
    t = beat * 2.0  # short intro
    for ln in lines:
        syllables = max(2, count_syllables(ln.text))
        # ~2.4 syllables per beat at rap pace
        beats_needed = max(1.0, syllables / 2.6)
        dur = beats_needed * beat
        placements.append({"line": ln, "start_s": t, "end_s": t + dur, "beats": beats_needed})
        t += dur + beat * 0.45  # breath between bars
    return placements


def count_syllables(text: str) -> int:
    import re

    words = re.findall(r"[A-Za-z']+", text)
    n = 0
    for w in words:
        groups = re.findall(r"[aeiouy]+", w.lower())
        n += max(1, len(groups))
    return max(1, n)


def render_song(scene: Scene, voices: dict[str, VoiceSpec], synth, out_wav: Path,
                instrumental_gain: float = 0.9) -> tuple[Path, list[dict]]:
    """Render full song audio (instrumental + quantized rap vocals + chant tail).

    synth(line, voice, out_path, seed) -> Path  (a voice-engine callable)
    Returns (wav, placements) for lip-sync timing.
    """
    placements = beat_plan(scene)
    total = max(8.0, (placements[-1]["end_s"] + 2.2) if placements else 8.0)
    instr = compose_trap(duration_s=total, bpm=scene.song_segment.bpm if scene.song_segment else 140,
                         seed=stable_seed("song", scene.scene_id, scene.seed))
    bus = np.asarray(instr, dtype=np.float32) * instrumental_gain * 0.9
    if bus.size < int(total * A.SR):
        bus = np.concatenate([bus, np.zeros(int(total * A.SR) - bus.size, dtype=np.float32)])

    import tempfile

    for pl in placements:
        ln = pl["line"]
        v = voices.get(ln.speaker) or next(iter(voices.values()))
        with tempfile.TemporaryDirectory() as td:
            wav = Path(td) / "t.wav"
            synth(ln, v, wav, seed=stable_seed("songline", scene.scene_id, ln.text))
            _, clip = A.read_wav(wav)
        # time-fit: lightly stretch/trim clip to its slot
        slot = pl["end_s"] - pl["start_s"]
        if len(clip) / A.SR > slot:
            clip = clip[: int(slot * A.SR)]
        elif len(clip) / A.SR < slot:
            clip = np.concatenate([clip, np.zeros(int(slot * A.SR) - len(clip), dtype=np.float32)])
        bus = A.mix_at(bus, A.normalize_peak(clip, -7.0), pl["start_s"], gain=0.95)

    # chant tail (crowd cheer) at the end
    from ..music.procedural import synth_sfx

    cheer = synth_sfx("cheer", duration_s=2.4, seed=stable_seed("cheer", scene.scene_id))
    bus = A.mix_at(bus, A.fade(cheer, fout_s=0.8), max(0.0, total - 2.6), gain=0.8)
    bus = A.fade(bus, fin_s=0.3, fout_s=1.2)
    A.write_wav(out_wav, bus)
    return out_wav, placements
