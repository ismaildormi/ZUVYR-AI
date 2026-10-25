"""Unit tests: planner determinism, voice engine, music/SFX, keying, mixing."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from zuvyr_studio.config import Config
from zuvyr_studio.application.bibles import CharacterBible, VoiceBible
from zuvyr_studio.application.planner import Planner
from zuvyr_studio.adapters.voice.zsynth import ZSynthEngine
from zuvyr_studio.adapters.music.procedural import compose_score, compose_trap, synth_sfx
from zuvyr_studio.lib import audio as A
from zuvyr_studio.schema import DialogueLine

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def cfg():
    return Config()


@pytest.fixture(scope="module")
def cast(cfg):
    return CharacterBible(cfg)


@pytest.fixture(scope="module")
def voices(cfg):
    return VoiceBible(cfg)


def test_planner_deterministic_and_schema_valid(cfg, cast, voices):
    pl = Planner(cfg, cast, voices)
    script = (ROOT / "scripts/samples/sample_60s.txt").read_text()
    p1, _ = pl.plan(script, "det-1")
    p2, _ = pl.plan(script, "det-1")
    assert p1.model_dump_json() == p2.model_dump_json()
    # required schema fields
    for s in p1.scenes:
        assert s.scene_id and s.duration_s > 0
        assert s.visual_prompt and s.camera.shot and s.camera.movement
        assert s.music_cue is not None
        for ln in s.dialogue:
            assert ln.emotion and 1 <= ln.intensity <= 5 and ln.delivery
    roles = {s.role for s in p1.scenes}
    assert "song" in roles
    song = next(s for s in p1.scenes if s.role == "song")
    assert song.lip_sync is True and song.song_segment.enabled
    # style prefix injected
    for s in p1.scenes:
        assert s.visual_prompt.startswith("Masterpiece 2D anime style") or "anime" in s.visual_prompt.split(",")[0].lower() or s.visual_prompt.startswith("High quality 3D")


def test_planner_style_3d_prefix(cfg, cast, voices):
    pl = Planner(cfg, cast, voices)
    script = (ROOT / "scripts/samples/dialogue_test_30s.txt").read_text()
    plan, _ = pl.plan(script, "det-3d", style="3d_render")
    for s in plan.scenes:
        assert s.visual_prompt.startswith("High quality 3D animated film render")


def test_planner_never_rewrites_dialogue(cfg, cast, voices):
    pl = Planner(cfg, cast, voices)
    script = (ROOT / "scripts/samples/dialogue_test_30s.txt").read_text()
    plan, _ = pl.plan(script, "det-2")
    src_words = set("".join(ch.lower() if ch.isalnum() else " " for ch in script).split())
    for s in plan.scenes:
        for ln in s.dialogue:
            words = [w for w in ln.text.split() if w.isalpha()]
            assert words, "dialogue text must not be emptied"
            # every alpha word of the produced line must exist in the source script
            missing = [w for w in words if w.lower() not in src_words]
            # allow pronouns/contractions introduced by stripping stage directions
            assert not [w for w in missing if len(w) > 4], f"planner invented words: {missing}"


def test_voice_engine_deterministic_and_distinct(tmp_path, cfg, voices):
    eng = ZSynthEngine(cfg)
    lines = [
        DialogueLine(speaker="mika", text="This is my line for the test.", emotion="sad", intensity=3),
        DialogueLine(speaker="mr_grimm", text="This is my line for the test.", emotion="greedy", intensity=3),
        DialogueLine(speaker="tommy", text="This is my line for the test.", emotion="fearful", intensity=3),
    ]
    outs = []
    for i, ln in enumerate(lines):
        p1 = tmp_path / f"{i}_a.wav"
        p2 = tmp_path / f"{i}_b.wav"
        eng.synth_line(ln, voices.get(ln.speaker), p1, seed=42)
        eng.synth_line(ln, voices.get(ln.speaker), p2, seed=42)
        assert p1.read_bytes() == p2.read_bytes(), "same seed must give identical audio"
        outs.append(p1.read_bytes())
    assert len(set(outs)) == 3, "different characters must produce different audio"


def test_music_and_sfx(cfg):
    for mood in ("hopeful", "melancholic", "tense", "hype"):
        s = compose_score(mood, 4.0, seed=1)
        assert abs(len(s) / A.SR - 4.0) < 0.1
        assert A.peak(s) > 0.1
    t = compose_trap(4.0, seed=2)
    assert A.peak(t) > 0.1
    for sfx in ("rain", "door_slam", "heartbeat", "voice_sob", "voice_laugh"):
        x = synth_sfx(sfx)
        assert x.size > 1000


def test_chroma_keying_produces_sprites(cfg, cast):
    from zuvyr_studio.adapters.vision.sprites import key_reference

    for spec in cast.all():
        ref = Path(spec.reference)
        assert ref.exists(), f"missing reference for {spec.id}"
        out = Path(tmp_dir()) / f"{spec.id}_sprite_test.png"
        _, stats = key_reference(ref, out)
        assert stats["mode"] == "keyed"
        assert 0.02 < stats["coverage"] < 0.9


def tmp_dir() -> Path:
    d = Path("/tmp/zuvyr_test_sprites")
    d.mkdir(exist_ok=True)
    return d


def test_duck_music_attenuates_under_speech():
    speech = A.silence(2.0)
    speech = A.mix_at(speech, A.normalize_peak(synth_sfx("voice_laugh"), -3), 0.5)  # stand-in voice
    music = np.ones(int(2.0 * A.SR), dtype=np.float32) * 0.5
    from zuvyr_studio.adapters.render.assemble import duck_music

    ducked = duck_music(music, speech)
    # during speech the music level must drop
    pre = float(np.abs(music[: int(0.4 * A.SR)]).mean())
    during = float(np.abs(ducked[int(0.6 * A.SR) : int(1.2 * A.SR)]).mean())
    assert during < pre * 0.7


def test_mouth_envelope(tmp_path):
    clip = A.normalize_peak(synth_sfx("voice_laugh"), -3)
    p = tmp_path / "clip.wav"
    A.write_wav(p, clip)
    from zuvyr_studio.adapters.lipsync.procedural import mouth_envelope

    env = mouth_envelope(p, 0, len(clip) / A.SR)
    assert env.size > 10
    assert 0.0 <= env.min() and env.max() <= 1.0
