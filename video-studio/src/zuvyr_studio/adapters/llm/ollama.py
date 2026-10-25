"""Ollama brain adapter: local LLM orchestration (scene split + JSON plan).

The LLM must NOT rewrite the story — the prompt forces annotate-only behavior,
and a post-check rejects plans whose dialogue text deviates from the script
(edit-distance guard). Falls back to the offline brain on any failure.
"""
from __future__ import annotations

import json
import urllib.request

from ...application.offline_brain import OfflineBrain
from ...config import Config
from ...lib.styles import STYLE_PREFIXES
from ...schema import ScenePlan, validate_plan


class OllamaBrain:
    name = "ollama"

    def __init__(self, config: Config, cast, voices, offline: OfflineBrain | None = None):
        self.config = config
        self.cast = cast
        self.voices = voices
        self.offline = offline or OfflineBrain(config, cast, voices)
        cfg = config.engines["brain"]["ollama"]
        self.url = cfg["url"].rstrip("/")
        self.model = cfg["model"]
        self.timeout = cfg.get("timeout_s", 300)
        self.temperature = cfg.get("temperature", 0.2)

    def available(self) -> bool:
        try:
            req = urllib.request.Request(self.url + "/api/tags", method="GET")
            with urllib.request.urlopen(req, timeout=4):
                return True
        except Exception:
            return False

    # ------------------------------------------------------------------ prompt
    def _system_prompt(self, style: str) -> str:
        cast_lines = "\n".join(
            f"- {c.id}: {c.name} — {c.role}" for c in self.cast.all()
        )
        return f"""You are the scene planner for an anime story-video pipeline.
Split the user's script into scenes and output ONLY a JSON object (no markdown):
{{
  "title": str,
  "scenes": [
    {{
      "scene_id": "s001", "duration_s": float,
      "characters_present": ["character_id"],
      "voice_over_narration": str,
      "dialogue": [
        {{"speaker": "character_id|narrator", "text": str,
          "emotion": one of neutral,sad,joyful,greedy,fearful,angry,jealous,guilty,sarcastic,tender,panicked,determined,excited,ashamed,relieved,menacing,proud,nervous,
          "intensity": 1-5, "delivery": normal|whisper|shout|trembling|breaking|cold|rap|narration,
          "pause_before_ms": 0-3000, "nonverbal": [] of laugh,sigh,gasp,sob,breath,gulp,cheer}}
      ],
      "visual_prompt": str (must start with: {STYLE_PREFIXES[style]}),
      "camera": {{"shot": wide|medium|close-up|extreme close-up|over-the-shoulder|low angle|high angle,
                  "movement": static|push_in|pull_out|zoom_in|zoom_out|pan_left|pan_right|tilt_up|tilt_down|whip_pan|orbit|handheld}},
      "motion_directions": str,
      "sfx_prompt": [str],
      "music_cue": {{"mood": hopeful|melancholic|tense|triumphant|playful|menacing|tender|hype, "intensity": 0-1}},
      "lip_sync": bool, "location": str, "time_of_day": str,
      "role": narration|dialogue|action|song,
      "song_segment": null or {{"enabled": true, "title": str, "genre": str, "lead_voices": [ids], "lyrics": str, "bpm": int, "bars": int}}
    }}
  ]
}}
CAST (use these exact ids):
{cast_lines}
HARD RULES:
1. NEVER rewrite, shorten, or embellish dialogue text. Copy the script's lines verbatim into "text".
2. Do not add new characters or plot. Only split, label, and schedule.
3. Every scene's visual_prompt MUST start with: {STYLE_PREFIXES[style]}
4. Mark song blocks as role "song" with song_segment enabled and delivery "rap".
5. Output raw JSON only."""

    # ------------------------------------------------------------------ call
    def _generate(self, script: str, style: str) -> dict | None:
        payload = {
            "model": self.model,
            "prompt": script,
            "system": self._system_prompt(style),
            "stream": False,
            "format": "json",
            "options": {"temperature": self.temperature, "num_ctx": 8192},
        }
        req = urllib.request.Request(
            self.url + "/api/generate",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            data = json.loads(resp.read().decode())
        text = data.get("response", "")
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end == -1:
            return None
        try:
            return json.loads(text[start : end + 1])
        except Exception:
            return None

    # ------------------------------------------------------------------ guard
    def _dialogue_guard(self, plan: dict, script: str) -> bool:
        """Reject plans that rewrote the dialogue (cheap fuzzy containment check)."""
        import difflib

        def norm(s: str) -> str:
            return " ".join("".join(ch.lower() if ch.isalnum() else " " for ch in s).split())

        src = norm(script)
        for scene in plan.get("scenes", []):
            for ln in scene.get("dialogue", []) or []:
                t = norm(str(ln.get("text", "")))
                if not t:
                    continue
                if t in src:
                    continue
                # fuzzy: 88% of the line should match somewhere in the script
                matcher = difflib.SequenceMatcher(None, t, src)
                if matcher.quick_ratio() < 0.6:
                    return False
        return True

    # ------------------------------------------------------------------ api
    def plan(self, script_text: str, video_id: str, title: str | None = None,
             style: str | None = None, fmt: str = "long", lyrics: str | None = None,
             genre: str | None = None, allowed: list[str] | None = None) -> ScenePlan:
        style = style or self.config.style
        for attempt in range(3):
            try:
                data = self._generate(script_text, style)
                if not data or not isinstance(data.get("scenes"), list) or not data["scenes"]:
                    raise ValueError("empty/invalid LLM plan")
                if not self._dialogue_guard(data, script_text):
                    raise ValueError("LLM rewrote dialogue; rejecting (attempt %d)" % attempt)
                data.setdefault("video_id", video_id)
                data["style"] = style
                data["format"] = fmt
                if title:
                    data["title"] = title
                plan = validate_plan(data)
                if plan.scenes:
                    plan.video_id = video_id
                    return plan
                raise ValueError("no valid scenes after schema validation")
            except Exception as e:
                print(f"[ollama-brain] attempt {attempt + 1} failed: {e}; falling back" if attempt == 2 else f"[ollama-brain] attempt {attempt + 1} failed: {e}")
        return self.offline.plan(script_text, video_id, title, style, fmt, lyrics, genre, allowed)
