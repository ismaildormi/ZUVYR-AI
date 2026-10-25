"""Unit tests: schema validation, planner, emotion mapping."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from zuvyr_studio.application.emotion import chatterbox_params, line_params, orpheus_tags
from zuvyr_studio.application.offline_brain import classify_emotion
from zuvyr_studio.schema import Camera, DialogueLine, Scene, validate_plan  # noqa: E402


def test_camera_coercion():
    c = Camera(shot="closeup", movement="push-in")
    assert c.shot == "close-up"
    assert c.movement == "push_in"
    c2 = Camera(shot="nonsense", movement="also nonsense")
    assert c2.shot == "medium"
    assert c2.movement == "push_in"


def test_dialogue_line_validation():
    ln = DialogueLine(speaker="Mika Sato", text="Hello!", emotion="furious!", intensity=9,
                      delivery="WHISPER", nonverbal=["gasps", "nonsense"])
    assert ln.speaker == "mika_sato"
    assert ln.emotion == "neutral"  # invalid emotion coerced
    assert ln.intensity == 5  # clamped
    assert ln.delivery == "whisper"
    assert ln.nonverbal == ["gasp"]


def test_scene_defaults():
    s = Scene(scene_id="s001", voice_over_narration="A voice over line.")
    assert s.dialogue[0].speaker == "narrator"
    assert s.seed != 0
    assert "anime" in s.visual_prompt or s.visual_prompt


def test_plan_validation_drops_bad_scenes():
    data = {
        "video_id": "t", "title": "T", "style": "2d_anime", "format": "long",
        "scenes": [
            {"scene_id": "s001", "duration_s": 5, "characters_present": ["mika"], "dialogue": []},
            {"scene_id": "bad", "duration_s": "not a number"},
        ],
    }
    plan = validate_plan(data)
    assert len(plan.scenes) == 1


def test_emotion_lexicon():
    emo, inten, nv = classify_emotion("I am so scared, help me!", default="neutral")
    assert emo == "fearful"
    assert inten >= 3
    emo2, _, nv2 = classify_emotion("She laughed and laughed", default="neutral")
    assert "laugh" in nv2
    emo3, _, _ = classify_emotion("The rent is due and money talks", default="neutral")
    assert emo3 == "greedy"


def test_narrator_strict_damping():
    emo, _, _ = classify_emotion("The rent is due.", default="neutral", strict=True)
    assert emo == "neutral"  # weak evidence doesn't leak emotion into narration


def test_chatterbox_params_ranges():
    calm = DialogueLine(speaker="n", text="hm", emotion="neutral", intensity=1)
    intense = DialogueLine(speaker="n", text="NO WAY!", emotion="panicked", intensity=5, delivery="shout")
    pc = chatterbox_params(calm)
    pi = chatterbox_params(intense)
    assert 0.4 <= pc["exaggeration"] <= 0.8
    assert pi["exaggeration"] >= 1.5
    assert pi["exaggeration"] <= 2.0


def test_orpheus_tags():
    sad = DialogueLine(speaker="n", text="sob story", emotion="sad", intensity=4)
    assert "<cry>" in orpheus_tags(sad)


def test_line_params_sad_slower_shout_louder():
    neutral = DialogueLine(speaker="n", text="ok", emotion="neutral", intensity=3)
    sad = DialogueLine(speaker="n", text="ok", emotion="sad", intensity=4)
    shout = DialogueLine(speaker="n", text="OK!", emotion="angry", intensity=4, delivery="shout")
    pn, ps, psh = line_params(neutral), line_params(sad), line_params(shout)
    assert ps["rate_mult"] < pn["rate_mult"]  # slower pace for sadness
    assert psh["vol_mult"] > pn["vol_mult"]  # louder for shouting
