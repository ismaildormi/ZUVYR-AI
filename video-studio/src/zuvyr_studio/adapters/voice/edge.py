"""Edge-TTS adapter — network fallback (optional; free Microsoft voices)."""
from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path

from ...schema import DialogueLine, VoiceSpec


class EdgeEngine:
    name = "edge"
    full_mode = True  # remote, but free/no key

    VOICES = {
        "female": "en-US-JennyNeural", "male": "en-GuyNeural",
        "child": "en-US-AnaNeural", "narrator": "en-US-ChristopherNeural",
    }

    def __init__(self, config):
        self.config = config
        self._checked = False
        self._ok = False

    def available(self) -> bool:
        if self._checked:
            return self._ok
        self._checked = True
        try:
            import edge_tts  # type: ignore

            self._ok = True
        except Exception:
            self._ok = False
        return self._ok

    def synth_line(self, line: DialogueLine, voice: VoiceSpec, out_wav: Path, seed: int = 0) -> Path:
        import edge_tts

        from ...lib import audio as A

        v = (voice.params or {}).get("edge_voice") if voice else None
        v = v or self.VOICES.get("narrator" if line.speaker == "narrator" else (voice.gender if voice else "male"))
        rate = "+0%"
        if line.emotion in ("angry", "panicked", "excited"):
            rate = "+12%"
        elif line.emotion in ("sad", "menacing", "tender"):
            rate = "-14%"
        text = line.text
        for nv in line.nonverbal:  # edge has no nonverbal tags; strip is safer
            text = text.replace(nv, "")

        async def run():
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
                mp3 = f.name
            comm = edge_tts.Communicate(text, v, rate=rate)
            await comm.save(mp3)
            return mp3

        mp3 = asyncio.run(run())
        from ...lib.ffmpeg import wav_from_any

        wav = wav_from_any(mp3, out_wav)
        Path(mp3).unlink(missing_ok=True)
        return wav
