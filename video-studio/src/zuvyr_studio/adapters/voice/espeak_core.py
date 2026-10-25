"""ctypes binding to the espeak-ng shared library (bundled by the
`espeakng-loader` PyPI wheel, so this works with zero system dependencies).

In full mode the pipeline prefers Chatterbox / Qwen3-TTS / Dia / Orpheus;
this engine is the always-available offline fallback ("zsynth" persona layer
sits on top and gives each character a distinct, reproducible voice).
"""
from __future__ import annotations

import ctypes
import struct
import wave
from pathlib import Path

_lib = None
_CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)


def _load():
    global _lib
    if _lib is not None:
        return _lib
    import espeakng_loader

    lib = ctypes.CDLL(espeakng_loader.get_library_path())
    AUDIO_OUTPUT_RETRIEVAL = 1
    sr = lib.espeak_Initialize(AUDIO_OUTPUT_RETRIEVAL, 0, espeakng_loader.get_data_path().encode(), 0)
    if sr <= 0:
        raise RuntimeError(f"espeak_Initialize failed: {sr}")
    lib._sr = sr
    _lib = lib
    return lib


class Espeak:
    """Thread-unsafe singleton usage: guard with a lock at call sites."""

    # espeak parameter IDs
    P_RATE = 1
    P_VOLUME = 2
    P_PITCH = 3
    P_RANGE = 4
    P_WORDGAP = 6

    def __init__(self) -> None:
        self.lib = _load()
        self.sample_rate = self.lib._sr
        self._cb_refs: list = []

    def set_voice(self, name: str) -> None:
        r = self.lib.espeak_SetVoiceByName(name.encode())
        if r != 0:
            raise RuntimeError(f"espeak SetVoiceByName({name}) -> {r}")

    def set_param(self, param: int, value: int) -> None:
        self.lib.espeak_SetParameter(param, int(value), 0)

    def synth(self, text: str, voice: str = "en-us", rate: int = 170, pitch: int = 45,
              range_: int = 40, volume: int = 100, wordgap: int = 0) -> tuple[int, "list[int]"]:
        self.set_voice(voice)
        self.set_param(self.P_RATE, rate)
        self.set_param(self.P_VOLUME, volume)
        self.set_param(self.P_PITCH, pitch)
        self.set_param(self.P_RANGE, range_)
        self.set_param(self.P_WORDGAP, wordgap)
        samples: list[int] = []

        def cb(wav, numsamples, events):
            if numsamples > 0:
                samples.extend(wav[:numsamples])
            return 0

        ref = _CB(cb)
        self._cb_refs.append(ref)  # keep alive during synth
        try:
            self.lib.espeak_SetSynthCallback(ref)
            data = text.encode("utf-8")
            r = self.lib.espeak_Synth(data, len(data) + 1, 0, 0, 0, 0, None, None)
            if r != 0:
                raise RuntimeError(f"espeak_Synth -> {r}")
            self.lib.espeak_Synchronize()
        finally:
            self._cb_refs.remove(ref)
        return self.sample_rate, samples

    def synth_wav(self, out_path: str | Path, text: str, **kw) -> Path:
        sr, samples = self.synth(text, **kw)
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(out_path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            if samples:
                w.writeframes(struct.pack(f"<{len(samples)}h", *samples))
        return out_path
