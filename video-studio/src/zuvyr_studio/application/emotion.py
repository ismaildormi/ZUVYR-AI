"""Emotion model -> synthesis parameters.

Maps (emotion, intensity, delivery, nonverbal) onto:
  * zsynth/espeak params (rate, pitch, range, volume, wordgap)
  * DSP chain pieces (pitch shift semitones, tremolo/vibrato, EQ, dynamics)
  * Chatterbox exaggeration (0.4-0.6 calm, 0.8-1.0 normal, 1.5-2.0 intense)
  * Orpheus tags / Dia nonverbal tags / Qwen3-TTS instruction text
"""
from __future__ import annotations

from ..schema import DialogueLine

# (rate_mult, pitch_mult, range_mult, vol_mult)
EMOTION_PARAMS = {
    "neutral":   (1.00, 1.00, 1.00, 1.00),
    "sad":       (0.88, 0.94, 0.55, 0.90),
    "joyful":    (1.12, 1.12, 1.30, 1.05),
    "greedy":    (0.95, 0.90, 0.80, 1.05),
    "fearful":   (1.15, 1.18, 0.90, 0.95),
    "angry":     (1.10, 1.05, 1.40, 1.15),
    "jealous":   (1.00, 1.05, 1.20, 1.05),
    "guilty":    (0.90, 0.95, 0.60, 0.90),
    "sarcastic": (0.98, 1.06, 1.10, 1.00),
    "tender":    (0.90, 1.00, 0.70, 0.85),
    "panicked":  (1.30, 1.22, 1.50, 1.10),
    "determined": (1.05, 1.00, 1.10, 1.10),
    "excited":   (1.20, 1.15, 1.50, 1.10),
    "ashamed":   (0.88, 0.92, 0.50, 0.85),
    "relieved":  (0.90, 0.97, 0.80, 0.95),
    "menacing":  (0.80, 0.85, 0.40, 0.95),
    "proud":     (0.92, 1.00, 0.90, 1.05),
    "nervous":   (1.18, 1.10, 1.20, 0.95),
}

DELIVERY_PARAMS = {
    "normal":    {},
    "narration": {"rate_mult": 1.0, "range_mult": 0.8},
    "whisper":   {"vol_mult": 0.45, "range_mult": 0.30, "whisper": True, "eq": "whisper"},
    "shout":     {"vol_mult": 1.55, "pitch_mult": 1.08, "rate_mult": 0.95, "limiter": True},
    "trembling": {"vibrato": (6.5, 0.55), "rate_mult": 0.94},
    "breaking":  {"vibrato": (4.5, 0.7), "tremolo": (3.0, 0.35), "rate_mult": 0.9},
    "cold":      {"rate_mult": 0.88, "range_mult": 0.25, "pitch_mult": 0.92, "eq": "dark"},
    "rap":       {"rate_mult": 1.0, "range_mult": 0.8, "eq": "rap"},
}


def intensity_scale(intensity: int) -> float:
    return max(0.35, min(1.6, intensity / 3.0))


def line_params(line: DialogueLine) -> dict:
    """Full parameter set for one dialogue line (zsynth engine)."""
    er, ep, erange, ev = EMOTION_PARAMS.get(line.emotion, EMOTION_PARAMS["neutral"])
    k = intensity_scale(line.intensity)
    # scale deviation from neutral by intensity
    rate = 1.0 + (er - 1.0) * k
    pitch = 1.0 + (ep - 1.0) * k
    rng = 1.0 + (erange - 1.0) * k
    vol = 1.0 + (ev - 1.0) * k
    out = {
        "rate_mult": rate,
        "pitch_mult": pitch,
        "range_mult": rng,
        "vol_mult": vol,
        "wordgap_ms": int(min(400, line.pause_before_ms * 0.25)),
        "filters": [],
    }
    d = DELIVERY_PARAMS.get(line.delivery, {})
    for key, val in d.items():
        if key == "rate_mult":
            out["rate_mult"] *= val
        elif key == "pitch_mult":
            out["pitch_mult"] *= val
        elif key == "range_mult":
            out["range_mult"] *= val
        elif key == "vol_mult":
            out["vol_mult"] *= val
        else:
            out[key] = val
    return out


def chatterbox_params(line: DialogueLine) -> dict:
    """Chatterbox exaggeration/cfg mapping (documented ranges)."""
    k = intensity_scale(line.intensity)
    if line.emotion == "neutral":
        ex = 0.5
    elif line.emotion in ("sad", "guilty", "ashamed"):
        ex = 0.8
    elif line.emotion in ("panicked", "angry", "excited", "fearful"):
        ex = 1.5 + 0.5 * (k - 1.0)  # 1.5-2.0 intense
    else:
        ex = 0.8 + 0.6 * k
    if line.delivery in ("shout", "breaking"):
        ex = min(2.0, ex + 0.3)
    if line.delivery in ("whisper", "cold"):
        ex = max(0.4, ex - 0.35)
    cfg = 0.5 if line.delivery in ("whisper", "cold", "narration") else 0.3
    return {"exaggeration": round(max(0.25, min(2.0, ex)), 2), "cfg_weight": cfg, "temperature": 0.7}


def orpheus_tags(line: DialogueLine) -> list[str]:
    tags = []
    emap = {
        "sad": "<cry>", "fearful": "<gasp>", "joyful": "<laugh>", "excited": "<laugh>",
        "panicked": "<gasp>", "guilty": "<sigh>", "ashamed": "<sigh>", "relieved": "<sigh>",
        "menacing": "<chuckle>", "greedy": "<chuckle>",
    }
    if line.emotion in emap and line.intensity >= 3:
        tags.append(emap[line.emotion])
    dmap = {"whisper": "<whisper>", "trembling": "<tremble>", "breaking": "<cry>"}
    if line.delivery in dmap:
        tags.append(dmap[line.delivery])
    return tags or ["<neutral>"]


def dia_script(lines: list[DialogueLine], speaker_slots: dict[str, str]) -> str:
    """Build a Dia multi-speaker transcript with nonverbal tags, one pass."""
    parts = []
    for ln in lines:
        slot = speaker_slots.get(ln.speaker, "S1")
        nv = "".join(f" ({v})" for v in ln.nonverbal)
        text = ln.text.replace("\n", " ").strip()
        parts.append(f"[{slot}]{nv} {text}")
    return "\n".join(parts)


def qwen3_design_instruction(voice: dict, line: DialogueLine) -> str:
    base = voice.get("design_prompt") or f"a {voice.get('age_range','adult')} {voice.get('gender','neutral')} voice, {voice.get('timbre','neutral timbre')}"
    em = line.emotion
    pace = {"sad": "slower", "angry": "sharper", "panicked": "fast", "greedy": "sly"}.get(em, "natural pace")
    return f"{base}, speaking with {em} emotion, {line.delivery} delivery, {pace}"
