"""HTTP bridge for Qwen3-TTS / Dia / Orpheus / Higgs Audio V2.

In full mode these engines are served locally (ComfyUI TTS-Audio-Suite nodes or
a small FastAPI wrapper around each repo — scripts/serve_tts.py). Each has a
different natural API, so the bridge exposes per-engine payload builders:

  qwen3_tts: POST {text, voice_design, emotion, delivery} -> wav  (voice design
             from free-form text: "a raspy old man, slow, bitter")
  dia:       POST {script: "[S1] (laughs) hi\n[S2] ...", ref_audio} -> wav
             (multi-speaker in one pass; pipeline splits per speaker for
             lip-sync)
  orpheus:   POST {text, voice_ref, tags: ["<sigh>", ...]} -> wav
  higgs:     POST {dialogue: [...]} -> wav  (Apache-2.0 V2 only; V3/Fish S2 are
             non-commercial and intentionally unsupported)

All engines fail closed: if the local service is not reachable, available()
returns False and the pipeline falls back.
"""
from __future__ import annotations

import json
import tempfile
import urllib.request
from pathlib import Path

from ...application.emotion import dia_script, orpheus_tags, qwen3_design_instruction
from ...schema import DialogueLine, VoiceSpec


class HttpTTSEngine:
    full_mode = True

    def __init__(self, config, kind: str):
        self.kind = kind
        cfg = (config.engines.get("voice", {}).get(kind, {})) or {}
        self.url = cfg.get("url", f"http://127.0.0.1:8790/{kind}")
        self.timeout = cfg.get("timeout_s", 300)

    def available(self) -> bool:
        try:
            req = urllib.request.Request(self.url + "/health", method="GET")
            with urllib.request.urlopen(req, timeout=3):
                return True
        except Exception:
            return False

    def synth_line(self, line: DialogueLine, voice: VoiceSpec, out_wav: Path, seed: int = 0) -> Path:
        from ...lib import audio as A
        from ...lib.ffmpeg import wav_from_any

        payload = self._payload(line, voice)
        req = urllib.request.Request(
            self.url + "/tts", data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            data = resp.read()
        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
            f.write(data)
            tmp = Path(f.name)
        try:
            # try as wav first
            _, arr = A.read_wav(tmp)
            A.write_wav(out_wav, arr)
            return out_wav
        except Exception:
            pass
        return wav_from_any(tmp, out_wav)

    def _payload(self, line: DialogueLine, voice: VoiceSpec | None) -> dict:
        if self.kind == "qwen3_tts":
            return {
                "text": line.text,
                "voice_design": qwen3_design_instruction(voice.model_dump() if voice else {}, line),
                "emotion": line.emotion, "delivery": line.delivery, "seed": seed_of(line),
            }
        if self.kind == "dia":
            slots = {line.speaker: "S1"}
            return {"script": dia_script([line], slots), "emotion": line.emotion, "seed": seed_of(line)}
        if self.kind == "orpheus":
            return {
                "text": " ".join(orpheus_tags(line)) + " " + line.text,
                "ref_clip": voice.reference_clip if voice else None,
                "seed": seed_of(line),
            }
        if self.kind == "higgs":
            return {"dialogue": [{"speaker": line.speaker, "text": line.text}], "seed": seed_of(line)}
        raise ValueError(self.kind)


def seed_of(line: DialogueLine) -> int:
    from ...lib.rng import stable_seed

    return stable_seed("httptts", line.speaker, line.text)
