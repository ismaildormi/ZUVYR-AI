"""Planner facade: picks the brain engine (ollama when available, else offline)."""
from __future__ import annotations

from ..config import Config
from ..schema import ScenePlan
from .bibles import CharacterBible, VoiceBible
from .offline_brain import OfflineBrain


class Planner:
    def __init__(self, config: Config, cast: CharacterBible, voices: VoiceBible):
        self.config = config
        self.cast = cast
        self.voices = voices
        self.offline = OfflineBrain(config, cast, voices)
        self._llm = None
        engine = config.engine_mode("brain")
        if engine in ("auto", "ollama"):
            try:
                from ..adapters.llm.ollama import OllamaBrain

                self._llm = OllamaBrain(config, cast, voices, self.offline)
            except Exception:
                self._llm = None

    @property
    def engine_name(self) -> str:
        if self._llm is not None and self.config.engine_mode("brain") == "ollama":
            return "ollama"
        if self._llm is not None and self.config.engine_mode("brain") == "auto" and self._llm.available():
            return "ollama"
        return "offline"

    def plan(self, script_text: str, video_id: str, title: str | None = None,
             style: str | None = None, fmt: str = "long", lyrics: str | None = None,
             genre: str | None = None, allowed: list[str] | None = None) -> tuple[ScenePlan, str]:
        if self.engine_name == "ollama":
            plan = self._llm.plan(script_text, video_id, title, style, fmt, lyrics, genre, allowed)
            return plan, "ollama:" + self._llm.model
        plan = self.offline.plan(script_text, video_id, title, style, fmt, lyrics, genre, allowed)
        return plan, "offline-rules"
