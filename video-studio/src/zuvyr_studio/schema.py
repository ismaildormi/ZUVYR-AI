"""Scene schema — the contract between the LLM brain and the pipeline.

Matches the required schema:
  scene_id, timeline_ref, duration_s, characters_present[], voice_over_narration,
  visual_prompt, camera (shot type + movement), motion_directions, sfx_prompt,
  music_cue, lip_sync (bool), song_segment (optional)

plus the expressive multi-character voice-acting extension:
  dialogue[]: speaker, text, emotion, intensity(1-5), delivery, pause_before_ms,
  nonverbal[], take
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from .lib.styles import CAMERA_MOVES, DELIVERIES, EMOTIONS, SHOT_TYPES, STYLE_PREFIXES

ShotType = Literal["wide", "medium", "close-up", "extreme close-up", "over-the-shoulder", "low angle", "high angle"]
CameraMove = Literal[
    "static", "push_in", "pull_out", "zoom_in", "zoom_out", "pan_left", "pan_right",
    "tilt_up", "tilt_down", "whip_pan", "orbit", "handheld",
]
Emotion = Literal[
    "neutral", "sad", "joyful", "greedy", "fearful", "angry", "jealous", "guilty",
    "sarcastic", "tender", "panicked", "determined", "excited", "ashamed",
    "relieved", "menacing", "proud", "nervous",
]
Delivery = Literal["normal", "whisper", "shout", "trembling", "breaking", "cold", "rap", "narration"]


class Camera(BaseModel):
    shot: str = "medium"
    movement: str = "push_in"

    @field_validator("shot", mode="before")
    @classmethod
    def _shot(cls, v):
        v = str(v).strip().lower().replace("closeup", "close-up").replace("close up", "close-up")
        v = v.replace("over the shoulder", "over-the-shoulder").replace("ots", "over-the-shoulder")
        return v if v in SHOT_TYPES else "medium"

    @field_validator("movement", mode="before")
    @classmethod
    def _move(cls, v):
        v = str(v).strip().lower().replace(" ", "_").replace("push-in", "push_in").replace("pull-out", "pull_out")
        return v if v in CAMERA_MOVES else "push_in"


class DialogueLine(BaseModel):
    speaker: str  # character id or "narrator"
    voice_id: Optional[str] = None  # voice override (auto-cast guest speakers)
    text: str
    emotion: str = "neutral"
    intensity: int = Field(default=3, ge=1, le=5)
    delivery: str = "normal"
    pause_before_ms: int = Field(default=0, ge=0, le=3000)
    nonverbal: list[str] = Field(default_factory=list)
    take: Optional[int] = None
    start_s: float = 0.0  # filled by pipeline (relative to scene start)
    end_s: float = 0.0

    @field_validator("speaker", mode="before")
    @classmethod
    def _speaker(cls, v):
        return str(v).strip().lower().replace(" ", "_")

    @field_validator("emotion", mode="before")
    @classmethod
    def _emotion(cls, v):
        v = str(v).strip().lower()
        return v if v in EMOTIONS else "neutral"

    @field_validator("delivery", mode="before")
    @classmethod
    def _delivery(cls, v):
        v = str(v).strip().lower()
        return v if v in DELIVERIES else "normal"

    @field_validator("intensity", mode="before")
    @classmethod
    def _intensity(cls, v):
        try:
            return max(1, min(5, int(v)))
        except Exception:
            return 3

    @field_validator("nonverbal")
    @classmethod
    def _nonverbal(cls, v: list[str]) -> list[str]:
        out = []
        for x in v:
            x = x.strip().lower().rstrip("s") if x.strip().lower() in ("gasps", "laughs", "sighs", "sobs") else x.strip().lower()
            if x in ("laugh", "sigh", "gasp", "sob", "breath", "gulp", "cheer"):
                out.append(x)
        return out


class MusicCue(BaseModel):
    mood: str = "hopeful"
    intensity: float = Field(default=0.5, ge=0.0, le=1.0)
    bpm: Optional[int] = None


class SongSegment(BaseModel):
    enabled: bool = False
    title: str = "Rooftop Anthem"
    genre: str = "hip hop, trap, street, young male voice"
    lead_voices: list[str] = Field(default_factory=list)
    lyrics: str = ""
    bpm: int = 140
    bars: int = 8


class Scene(BaseModel):
    scene_id: str
    timeline_ref: str = ""
    duration_s: float = Field(default=4.0, ge=0.5, le=600.0)
    characters_present: list[str] = Field(default_factory=list)
    voice_over_narration: str = ""
    dialogue: list[DialogueLine] = Field(default_factory=list)
    visual_prompt: str = ""
    camera: Camera = Camera()
    motion_directions: str = ""
    sfx_prompt: list[str] = Field(default_factory=list)
    music_cue: MusicCue = MusicCue()
    lip_sync: bool = False
    song_segment: Optional[SongSegment] = None
    location: str = "street"
    time_of_day: str = "dusk"
    visual_hint: str = ""
    role: Literal["narration", "dialogue", "action", "song", "title"] = "narration"
    seed: int = 0

    @field_validator("characters_present")
    @classmethod
    def _chars(cls, v: list[str]) -> list[str]:
        return [c.strip().lower().replace(" ", "_") for c in v if c.strip()]

    @model_validator(mode="after")
    def _finalize(self) -> "Scene":
        if not self.visual_prompt:
            self.visual_prompt = STYLE_PREFIXES["2d_anime"]
        if not self.dialogue and self.voice_over_narration:
            self.dialogue = [DialogueLine(speaker="narrator", text=self.voice_over_narration, delivery="narration")]
        if self.song_segment and self.song_segment.enabled:
            self.role = "song"
            self.lip_sync = True
        if self.seed == 0:
            from .lib.rng import stable_seed

            self.seed = stable_seed(self.scene_id, "scene")
        if not self.timeline_ref:
            self.timeline_ref = f"{self.scene_id}:{self.duration_s:.1f}s"
        return self


class ScenePlan(BaseModel):
    video_id: str
    title: str = "Untitled Story"
    style: Literal["2d_anime", "3d_render"] = "2d_anime"
    format: Literal["long", "short"] = "long"
    language: str = "en"
    cast: list[str] = Field(default_factory=list)
    voices_used: list[str] = Field(default_factory=list)
    scenes: list[Scene] = Field(default_factory=list)

    @property
    def total_duration_s(self) -> float:
        return sum(s.duration_s for s in self.scenes)


class CharacterSpec(BaseModel):
    id: str
    name: str
    age: int
    role: str
    gender: str
    appearance: dict = Field(default_factory=dict)
    token_block: str = ""  # injected into EVERY image prompt (fixed identity)
    voice_id: str = ""
    accent_color: str = "#FFFFFF"
    seed: int = 0
    reference: str = ""  # path to reference image
    sprite: str = ""  # keyed RGBA sprite (built by cast builder)
    mouth: dict = Field(default_factory=lambda: {"cx": 0.5, "cy": 0.115, "w": 0.055, "h": 0.03})
    height: float = 1.0  # relative scale in layout
    personality: str = ""
    tags: list[str] = Field(default_factory=list)


class VoiceSpec(BaseModel):
    voice_id: str
    character: str
    age_range: str
    gender: str
    pitch: str
    pace: str
    accent: str
    timbre: str
    personality: str
    default_emotion: str = "neutral"
    engine: str = "zsynth"
    seed: int = 0
    reference_clip: str = ""
    design_prompt: str = ""  # Qwen3-TTS free-form voice design text
    params: dict = Field(default_factory=dict)


def validate_plan(data: dict) -> ScenePlan:
    """Validate + coerce a (possibly LLM-generated) plan dict. Raises with a
    readable message when unrecoverable."""
    if isinstance(data.get("scenes"), list):
        keep = []
        for i, s in enumerate(data["scenes"]):
            try:
                keep.append(Scene.model_validate(s))
            except Exception as e:  # drop invalid scene rather than fail the plan
                import sys

                print(f"[schema] dropping invalid scene #{i}: {e}", file=sys.stderr)
        data["scenes"] = keep
    return ScenePlan.model_validate(data)
