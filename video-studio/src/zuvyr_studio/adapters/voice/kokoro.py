"""Kokoro-82M adapter (Apache-2.0) — neutral narration in full mode.

The base app already vendors Kokoro as its Voicebox engine; this adapter runs
kokoro-onnx directly (CPU-friendly) and VoiceboxClient (bridge) talks to the
base app's HTTP speech service instead when it is running.
"""
from __future__ import annotations

from pathlib import Path

from ...schema import DialogueLine, VoiceSpec


class KokoroEngine:
    name = "kokoro"
    full_mode = True

    DEFAULT_VOICES = ["af_heart", "am_michael", "af_bella", "am_adam", "af_nicole", "am_ryan"]

    def __init__(self, config):
        self.config = config
        self._kokoro = None
        self._checked = False
        self._voice_map: dict[str, str] = {}

    def available(self) -> bool:
        if self._checked:
            return self._kokoro is not None
        self._checked = True
        try:
            from kokoro_onnx import Kokoro  # type: ignore

            cfg = self.config.root
            for c in (cfg / "models" / "kokoro-v1.0.onnx",):
                if c.exists():
                    self._kokoro = Kokoro(str(c), str(cfg / "models" / "voices-v1.0.bin"))
                    return True
            self._kokoro = Kokoro()  # default lookup paths
        except Exception:
            self._kokoro = None
        return self._kokoro is not None

    def _pick_voice(self, voice: VoiceSpec | None) -> str:
        if voice:
            p = voice.params or {}
            if p.get("kokoro_voice"):
                return p["kokoro_voice"]
            h = abs(hash(voice.voice_id)) % len(self.DEFAULT_VOICES)
            return self.DEFAULT_VOICES[h]
        return "af_heart"

    def synth_line(self, line: DialogueLine, voice: VoiceSpec, out_wav: Path, seed: int = 0) -> Path:
        if self._kokoro is None and not self.available():
            raise RuntimeError("kokoro unavailable")
        from ...lib import audio as A

        text = line.text
        speed = 1.0
        if voice and voice.params:
            speed = float(voice.params.get("kokoro_speed", 1.0))
        audio, sr = self._kokoro.create(text, voice=self._pick_voice(voice), speed=speed, lang="en-us")
        arr = A.resample(audio, int(sr), A.SR)
        A.write_wav(out_wav, arr)
        return out_wav
