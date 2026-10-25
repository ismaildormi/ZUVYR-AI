"""Chatterbox / Chatterbox-Turbo adapter (Resemble AI, MIT — commercial OK).

Main character engine in full mode. Emotion via exaggeration (0-2), cfg weight,
[laugh]-style tags and zero-shot cloning from the cast's model-generated
reference clips (never real people — see voices/voice_bible.json).
Requires: pip install chatterbox-tts ; GPU strongly recommended.
"""
from __future__ import annotations

from pathlib import Path

from ...application.emotion import chatterbox_params
from ...schema import DialogueLine, VoiceSpec


class ChatterboxEngine:
    name = "chatterbox"
    full_mode = True

    def __init__(self, config):
        self.config = config
        self._model = None
        self._checked = False

    def available(self) -> bool:
        if self._checked:
            return self._model is not None
        self._checked = True
        try:
            import torch  # noqa: F401

            if not torch.cuda.is_available():
                return False
            from chatterbox.tts import ChatterboxTTS  # type: ignore

            self._model = ChatterboxTTS.from_pretrained(device="cuda")
        except Exception:
            self._model = None
        return self._model is not None

    def synth_line(self, line: DialogueLine, voice: VoiceSpec, out_wav: Path, seed: int = 0) -> Path:
        import torch

        model = self._model
        if model is None and not self.available():
            raise RuntimeError("chatterbox unavailable")
        params = chatterbox_params(line)
        torch.manual_seed(seed)
        text = line.text
        if "laugh" in line.nonverbal:
            text += " [laugh]"
        kwargs = {
            "exaggeration": params["exaggeration"],
            "cfg_weight": params["cfg_weight"],
            "temperature": params["temperature"],
        }
        ref = voice.reference_clip if voice and Path(voice.reference_clip or "").exists() else None
        try:
            wav = model.generate(text, audio_prompt_path=ref, **kwargs)
        except TypeError:  # older/newer signatures
            wav = model.generate(text, **kwargs)
        # chatterbox returns tensor or (tensor, sr)
        if isinstance(wav, tuple):
            wav, sr = wav
        else:
            sr = model.sr if hasattr(model, "sr") else 24000
        import numpy as np

        arr = wav.squeeze().cpu().numpy().astype(np.float32)
        from ...lib import audio as A

        arr = A.resample(arr, int(sr), A.SR)
        A.write_wav(out_wav, arr)
        return out_wav
