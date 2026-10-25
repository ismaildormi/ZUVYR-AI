"""End-to-end smoke: tiny-resolution full pipeline render + output verification.
Run with:  pytest tests/test_e2e.py -x  (takes ~30-60s)"""
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = """Title: E2E Test

NARRATOR: A tiny scene to verify the pipeline end to end.
MIKA (determined): We can do this!
RICO (excited): Let's go, let's go, let's GO!
[SFX: whoosh]
"""


@pytest.fixture(scope="module")
def rendered(tmp_path_factory):
    from zuvyr_studio.config import Config
    from zuvyr_studio.application.pipeline import Pipeline

    cfg = Config(data={
        "formats": {"long": {"width": 640, "height": 360}, "short": {"width": 360, "height": 640}},
        "fps": 12,
        "paths": {"jobs": str(tmp_path_factory.mktemp("jobs")), "output": str(tmp_path_factory.mktemp("out"))},
    })
    pipe = Pipeline(cfg)
    return pipe.generate(SCRIPT, video_id="e2e-test", intro_card=True, thumbnails=True)


def test_e2e_outputs_exist(rendered):
    for key in ("video", "srt"):
        assert Path(rendered[key]).exists()
    assert rendered["duration_s"] > 5


def test_e2e_video_probe(rendered):
    from zuvyr_studio.lib.ffmpeg import probe

    info = probe(rendered["video"])
    assert info.get("codec") == "h264"
    assert info.get("width") == 640 and info.get("height") == 360
    assert info.get("acodec") == "aac"
    assert 5 < info["duration_s"] < 60


def test_e2e_loudness(rendered):
    from zuvyr_studio.lib.ffmpeg import measure_lufs

    l = measure_lufs(rendered["video"])
    i, tp = float(l["input_i"]), float(l["input_tp"])
    assert abs(i + 14.0) <= 1.6, f"integrated {i} too far from -14 LUFS"
    assert tp <= -1.2, f"true peak {tp} too hot"


def test_e2e_thumbnails(rendered):
    outs = Path(rendered["video"]).parent / "thumbnails"
    thumbs = sorted(outs.glob("thumb_*.png"))
    assert len(thumbs) == 3
    from PIL import Image

    for t in thumbs:
        img = Image.open(t)
        assert img.size == (1280, 720)


def test_e2e_srt(rendered):
    srt = Path(rendered["srt"]).read_text()
    assert "-->" in srt
    assert "MIKA" in srt or "Mika" in srt


def test_e2e_short_format(tmp_path_factory):
    from zuvyr_studio.config import Config
    from zuvyr_studio.application.pipeline import Pipeline
    from zuvyr_studio.lib.ffmpeg import probe

    cfg = Config(data={
        "formats": {"long": {"width": 640, "height": 360}, "short": {"width": 360, "height": 640}},
        "fps": 12,
        "paths": {"jobs": str(tmp_path_factory.mktemp("jobs")), "output": str(tmp_path_factory.mktemp("out"))},
    })
    res = Pipeline(cfg).generate(SCRIPT, video_id="e2e-short", fmt="short", intro_card=False, thumbnails=False)
    info = probe(res["video"])
    assert info["width"] == 360 and info["height"] == 640
    assert abs(info["width"] / info["height"] - 9 / 16) < 0.02


def test_e2e_guest_speaker(tmp_path_factory):
    """Unknown speaker renders end-to-end: label kept for captions, never
    spoken, auto-cast a non-narrator voice."""
    from zuvyr_studio.config import Config
    from zuvyr_studio.application.pipeline import Pipeline

    cfg = Config(data={
        "formats": {"long": {"width": 640, "height": 360}, "short": {"width": 360, "height": 640}},
        "fps": 12,
        "paths": {"jobs": str(tmp_path_factory.mktemp("jobs")), "output": str(tmp_path_factory.mktemp("out"))},
    })
    script = ("NARRATOR: The corner store at dusk.\n"
              "SHOPKEEPER: Hey you kids, out of my store!\n"
              "MIKA: Sorry, we were just leaving.\n")
    res = Pipeline(cfg).generate(script, video_id="e2e-guest", intro_card=False, thumbnails=False)
    srt = Path(res["srt"]).read_text()
    assert "SHOPKEEPER:" in srt, "guest keeps its name in captions"
    assert "Hey you kids" in srt
    # spoken text must not contain the label (checked via the persisted plan)
    import json as _json

    job_plan = _json.loads((Path(cfg.get("paths", {}).get("jobs", "jobs")) / "e2e-guest" / "plan.json").read_text())
    shop = [ln for s in job_plan["scenes"] for ln in s["dialogue"] if ln["speaker"] == "shopkeeper"][0]
    assert shop["text"].startswith("Hey you kids")
    assert shop["voice_id"] and shop["voice_id"] != "narrator"
